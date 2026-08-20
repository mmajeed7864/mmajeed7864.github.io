import { SESSION_MINUTES } from "../core/constants.mjs";
import { convertWeight, deepClone, elapsedMinutes, hashText, normalizeUnit, safeNumber, sessionVolume, uid, unique } from "../core/utils.mjs";

const PLAN_SPECS = Object.freeze({
  A: { label: "Plan A", detail: "Full session", volumeFactor: 1 },
  B: { label: "Plan B", detail: "Reduced volume", volumeFactor: 0.72 },
  MIN: { label: "Minimum Dose", detail: "Smallest useful version", volumeFactor: 0.45 },
});

export const PATTERN_ORDER = Object.freeze([
  "squat",
  "hinge",
  "horizontal-push",
  "horizontal-pull",
  "vertical-push",
  "vertical-pull",
  "lunge",
  "core",
  "curl",
  "triceps-extension",
  "lateral-raise",
  "cardio-warm-up",
]);

const PATTERN_RANK = new Map(PATTERN_ORDER.map((pattern, index) => [pattern, index]));

const PLAN_BUDGETS = Object.freeze({
  12: { exercises: 2, totalWorkSets: 4, warmupMinutes: 2, cooldownMinutes: 2 },
  20: { exercises: 3, totalWorkSets: 6, warmupMinutes: 3, cooldownMinutes: 2 },
  30: { exercises: 4, totalWorkSets: 9, warmupMinutes: 4, cooldownMinutes: 3 },
  45: { exercises: 5, totalWorkSets: 13, warmupMinutes: 5, cooldownMinutes: 4 },
  60: { exercises: 6, totalWorkSets: 18, warmupMinutes: 6, cooldownMinutes: 5 },
});

const DAY_LABELS = Object.freeze(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
const SHORT_DAY_LABELS = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const SCHEDULE_LABELS = Object.freeze(["Strength A", "Strength B", "Full-body C", "Strength D", "Full-body E", "Strength F", "Recovery G"]);
const SCHEDULE_FOCUS = Object.freeze([
  "Lower-body strength with balanced upper-body work",
  "Hinge, pull, and controlled pressing",
  "Full-body continuity for the end of the week",
  "Strength practice with a conservative progression",
  "Full-body repeat with familiar movements",
  "Quality reps and logged proof",
  "Easy movement and habit continuity",
]);

const EQUIPMENT_CAPABILITIES = Object.freeze({
  bodyweight: new Set(["bodyweight", "mat", "stable-surface"]),
  "dumbbells only": new Set(["bodyweight", "mat", "stable-surface", "dumbbell", "kettlebell"]),
  "home gym": new Set(["bodyweight", "mat", "stable-surface", "dumbbell", "kettlebell", "band", "band-anchor"]),
  "full gym": new Set(["bodyweight", "mat", "stable-surface", "dumbbell", "kettlebell", "band", "band-anchor", "machine", "barbell"]),
});

const EQUIPMENT_ALIASES = Object.freeze({
  none: "bodyweight",
  bodyweight: "bodyweight",
  "exercise mat": "mat",
  mat: "mat",
  "stable bench": "stable-surface",
  bench: "stable-surface",
  counter: "stable-surface",
  dumbbell: "dumbbell",
  dumbbells: "dumbbell",
  kettlebell: "kettlebell",
  "resistance band": "band",
  band: "band",
  "overhead band anchor": "band-anchor",
});

function patternRank(pattern) {
  return PATTERN_RANK.has(pattern) ? PATTERN_RANK.get(pattern) : Number.MAX_SAFE_INTEGER;
}

function normalizeEquipmentToken(value) {
  const key = String(value || "").trim().toLowerCase();
  return EQUIPMENT_ALIASES[key] || key;
}

function exerciseEquipment(exercise) {
  return unique((exercise.equipment || []).map(normalizeEquipmentToken));
}

function equipmentCompatible(exercise, equipment = "full gym") {
  const allowed = EQUIPMENT_CAPABILITIES[equipment] || EQUIPMENT_CAPABILITIES.bodyweight;
  return exerciseEquipment(exercise).every(token => allowed.has(token));
}

function normalizedLocation(value) {
  const location = String(value || "gym").toLowerCase();
  return location === "travel" ? "home" : location;
}

function supportsContext(exercise, state) {
  const locations = exercise.location || exercise.locations || [];
  const location = normalizedLocation(state.profile.location);
  if (locations.length && !locations.includes(location) && !locations.includes("anywhere")) return false;
  if (!equipmentCompatible(exercise, state.profile.equipment)) return false;
  return !(state.exercisePreferences?.excluded || []).includes(exercise.id);
}

function selectExercises(state, library, count) {
  const compatible = library.filter(exercise => supportsContext(exercise, state));
  const preferred = new Set(state.exercisePreferences?.preferred || []);
  const reduced = new Set(state.exercisePreferences?.reduced || []);
  const experience = state.profile.experience || "intermediate";
  return [...compatible]
    .sort((left, right) => {
      const score = exercise => {
        let value = patternRank(exercise.movementPattern) * 100;
        if (preferred.has(exercise.id)) value -= 20;
        if (reduced.has(exercise.id)) value += 20;
        if (experience === "beginner" && exercise.difficulty === "beginner") value -= 8;
        if (experience === "beginner" && exercise.difficulty !== "beginner") value += 18;
        if (experience === "advanced" && exercise.difficulty !== "beginner") value -= 4;
        return value;
      };
      const scoreDelta = score(left) - score(right);
      if (scoreDelta) return scoreDelta;
      return String(left.id).localeCompare(String(right.id), "en");
    })
    .filter((exercise, index, all) => all.findIndex(item => item.movementPattern === exercise.movementPattern) === index)
    .slice(0, count);
}

function normalizedPreferredDays(state) {
  const seen = new Set();
  const preferred = Array.isArray(state?.profile?.preferredDays) ? state.profile.preferredDays : [];
  const normalized = preferred
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value >= 0 && value <= 6)
    .filter(value => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  const requested = safeNumber(state?.profile?.days, normalized.length || 3, 1, 7);
  const fallback = [1, 3, 5, 0, 2, 4, 6].filter(value => !seen.has(value));
  return [...normalized, ...fallback].slice(0, requested);
}

function rotatePlanExercises(exercises, offset) {
  if (!exercises.length) return [];
  const normalizedOffset = offset % exercises.length;
  return [...exercises.slice(normalizedOffset), ...exercises.slice(0, normalizedOffset)].map(deepClone);
}

function planVersionForSchedule(slotSeed, plan) {
  return `schedule-${hashText(JSON.stringify({
    slotSeed,
    id: plan.id,
    label: plan.label,
    minutes: plan.minutes,
    units: plan.units,
    exercises: plan.exercises.map(item => ({
      exerciseId: item.exerciseId,
      sets: item.target.sets,
      reps: item.target.reps,
      restSeconds: item.target.restSeconds,
      suggestedWeight: item.target.suggestedWeight,
    })),
  }))}`;
}

function bestCompletedSet(state, exerciseId) {
  const sets = [];
  for (const session of state?.sessions || []) {
    for (const exercise of session.exercises || []) {
      if (exercise.exerciseId !== exerciseId && exercise.snapshot?.id !== exerciseId) continue;
      for (const set of exercise.sets || []) {
        if (!isValidCompletedSet(set)) continue;
        const unit = normalizeUnit(set.unit || exercise.units || session.units || state.settings?.units, "lb");
        sets.push({
          date: session.completedAt || session.date || "",
          weight: safeNumber(set.weight, 0, 0, 5_000),
          reps: safeNumber(set.reps, 0, 0, 1_000),
          unit,
          volume: convertWeight(set.weight, unit, normalizeUnit(state.settings?.units, "lb")) * safeNumber(set.reps, 0, 0, 1_000),
        });
      }
    }
  }
  return sets.sort((left, right) => {
    const volumeDelta = right.volume - left.volume;
    if (volumeDelta) return volumeDelta;
    return String(right.date).localeCompare(String(left.date), "en");
  })[0] || null;
}

function lastCompletedSet(state, exerciseId) {
  for (const session of [...(state?.sessions || [])].sort((left, right) => String(right.completedAt || right.date).localeCompare(String(left.completedAt || left.date), "en"))) {
    const exercise = (session.exercises || []).find(item => item.exerciseId === exerciseId || item.snapshot?.id === exerciseId);
    const set = [...(exercise?.sets || [])].reverse().find(isValidCompletedSet);
    if (!set) continue;
    const unit = normalizeUnit(set.unit || exercise.units || session.units || state.settings?.units, "lb");
    return {
      date: session.completedAt || session.date || "",
      weight: safeNumber(set.weight, 0, 0, 5_000),
      reps: safeNumber(set.reps, 0, 0, 1_000),
      unit,
    };
  }
  return null;
}

function startingWeight(state, exerciseId, targetUnit = "lb") {
  for (const session of [...(state.sessions || [])].reverse()) {
    const exercise = session.exercises?.find(item => item.exerciseId === exerciseId || item.snapshot?.id === exerciseId);
    const set = [...(exercise?.sets || [])].reverse().find(item => item.done !== false && Number(item.weight) >= 0);
    if (set) return convertWeight(set.weight, set.unit || exercise.units || session.units || "lb", targetUnit);
  }
  return 0;
}

function repsFor(goal, pattern, index) {
  const primary = index < 2 && !["core", "cardio-warm-up"].includes(pattern);
  if (goal === "get stronger" && primary) return 6;
  if (goal === "get stronger") return 8;
  if (goal === "build muscle") return primary ? 8 : 10;
  if (goal === "lose fat") return primary ? 10 : 12;
  if (goal === "stay consistent") return 8;
  return primary ? 8 : 10;
}

function restFor(goal, pattern) {
  if (goal === "get stronger" && ["squat", "hinge", "horizontal-push", "horizontal-pull"].includes(pattern)) return 150;
  if (goal === "build muscle" && !["core", "cardio-warm-up"].includes(pattern)) return 105;
  if (goal === "stay consistent") return 75;
  if (goal === "lose fat") return 75;
  return ["squat", "hinge"].includes(pattern) ? 120 : 90;
}

function distributeSets(totalWorkSets, count, experience) {
  const values = Array.from({ length: count }, () => 2);
  let remaining = Math.max(0, totalWorkSets - values.reduce((sum, value) => sum + value, 0));
  let index = 0;
  const maxPerExercise = experience === "beginner" ? 3 : 4;
  while (remaining > 0 && values.some(value => value < maxPerExercise)) {
    if (values[index] < maxPerExercise) {
      values[index] += 1;
      remaining -= 1;
    }
    index = (index + 1) % values.length;
  }
  return values;
}

function planExercise(state, exercise, sets, reps, restSeconds, unit) {
  return {
    exerciseId: exercise.id,
    snapshot: {
      id: exercise.id,
      name: exercise.name,
      movementPattern: exercise.movementPattern,
      equipment: [...(exercise.equipment || [])],
      primaryMuscles: [...(exercise.primaryMuscles || [])],
      mediaPoster: exercise.media?.[0]?.path || "",
    },
    target: {
      sets,
      reps,
      restSeconds,
      suggestedWeight: startingWeight(state, exercise.id, unit),
    },
  };
}

export function buildPlan(state, library, { planId = "A", minutes = state.profile.duration, location = state.profile.location, intensity = state.profile.intensity } = {}) {
  const id = PLAN_SPECS[planId] ? planId : "A";
  const normalizedMinutes = SESSION_MINUTES.reduce((best, candidate) => Math.abs(candidate - minutes) < Math.abs(best - minutes) ? candidate : best, 45);
  const effectiveMinutes = id === "MIN" ? 12 : id === "B" ? Math.min(30, normalizedMinutes) : normalizedMinutes;
  const budget = PLAN_BUDGETS[effectiveMinutes] || PLAN_BUDGETS[45];
  const scopedState = { ...state, profile: { ...state.profile, location, intensity } };
  const goal = scopedState.profile.goal || "build muscle";
  const unit = normalizeUnit(scopedState.settings?.units, "lb");
  const selected = selectExercises(scopedState, library, budget.exercises);
  const setCounts = distributeSets(
    Math.round(budget.totalWorkSets * (intensity === "light" ? 0.78 : intensity === "push" ? 1.08 : 1)),
    selected.length,
    scopedState.profile.experience,
  );
  const exercises = selected.map((exercise, index) => planExercise(
    scopedState,
    exercise,
    setCounts[index] || 2,
    repsFor(goal, exercise.movementPattern, index),
    restFor(goal, exercise.movementPattern),
    unit,
  ));
  return {
    id,
    versionId: uid("plan-version"),
    label: PLAN_SPECS[id].label,
    detail: PLAN_SPECS[id].detail,
    goal,
    experience: state.profile.experience,
    location,
    equipment: state.profile.equipment,
    compatibleEquipment: [...(EQUIPMENT_CAPABILITIES[state.profile.equipment] || EQUIPMENT_CAPABILITIES.bodyweight)].sort(),
    minutes: effectiveMinutes,
    intensity,
    units: unit,
    warmupMinutes: budget.warmupMinutes,
    cooldownMinutes: budget.cooldownMinutes,
    exercises,
    createdAt: new Date().toISOString(),
  };
}

export function buildWorkoutSchedule(state, library) {
  const days = normalizedPreferredDays(state);
  const basePlan = state.activePlan?.exercises?.length
    ? deepClone(state.activePlan)
    : buildPlan(state, library, { planId: "A", minutes: state.profile.duration });
  return days.map((day, index) => {
    const label = SCHEDULE_LABELS[index] || `Workout ${index + 1}`;
    const slotSeed = `${state.founder || "founder"}:${day}:${index}:${state.profile.goal}:${state.profile.duration}:${state.profile.equipment}`;
    const plan = {
      ...deepClone(basePlan),
      id: `schedule-${index + 1}`,
      label,
      detail: `${DAY_LABELS[day]} training slot`,
      exercises: rotatePlanExercises(basePlan.exercises, index % Math.max(1, basePlan.exercises.length)),
      createdAt: state.activePlan?.createdAt || basePlan.createdAt,
      scheduledDay: day,
    };
    plan.versionId = planVersionForSchedule(slotSeed, plan);
    return {
      id: `slot-${day}-${index + 1}`,
      day,
      dayLabel: DAY_LABELS[day],
      shortDayLabel: SHORT_DAY_LABELS[day],
      label,
      focus: SCHEDULE_FOCUS[index] || "Planned training session",
      minutes: plan.minutes,
      equipment: plan.equipment,
      exerciseCount: plan.exercises.length,
      exerciseNames: plan.exercises.slice(0, 3).map(item => item.snapshot.name),
      muscles: unique(plan.exercises.flatMap(item => item.snapshot.primaryMuscles || [])).slice(0, 4),
      plan,
    };
  });
}

export function buildProgressionTracker(state, library, { limit = 6 } = {}) {
  const plan = state.activePlan?.exercises?.length
    ? state.activePlan
    : buildPlan(state, library, { planId: "A", minutes: state.profile.duration });
  const unit = normalizeUnit(state.settings?.units, plan.units || "lb");
  const loadStep = unit === "kg" ? 2.5 : 5;
  return plan.exercises.slice(0, limit).map(item => {
    const exercise = library.find(candidate => candidate.id === item.exerciseId) || item.snapshot;
    const last = lastCompletedSet(state, item.exerciseId);
    const best = bestCompletedSet(state, item.exerciseId);
    const targetWeight = safeNumber(item.target.suggestedWeight, 0, 0, 5_000);
    const targetReps = safeNumber(item.target.reps, 8, 1, 1_000);
    const comparableLastWeight = last ? convertWeight(last.weight, last.unit, unit) : 0;
    const hitTarget = last && last.reps >= targetReps && comparableLastWeight >= targetWeight;
    const nextWeight = hitTarget && comparableLastWeight > 0 ? Math.round((comparableLastWeight + loadStep) * 10) / 10 : Math.max(targetWeight, comparableLastWeight);
    return {
      exerciseId: item.exerciseId,
      exerciseName: item.snapshot.name,
      movementPattern: item.snapshot.movementPattern || exercise.movementPattern || "movement",
      muscles: (item.snapshot.primaryMuscles || exercise.primaryMuscles || []).slice(0, 2),
      target: {
        sets: item.target.sets,
        reps: targetReps,
        weight: targetWeight,
        unit,
      },
      last,
      best,
      next: {
        reps: targetReps,
        weight: nextWeight,
        unit,
      },
      status: last ? (hitTarget ? "Add load next time" : "Repeat target") : "No log yet",
      evidence: last ? "Based on your last completed set on this device." : "Log this movement once to unlock a real progression target.",
    };
  });
}

export function createPlanProposal(state, library, changes, now = new Date()) {
  const current = state.activePlan || buildPlan(state, library);
  const requested = {
    planId: changes.planId || current.id,
    minutes: changes.minutes ?? current.minutes,
    location: changes.location || current.location,
    intensity: changes.intensity || current.intensity,
  };
  const candidate = buildPlan({ ...state, profile: { ...state.profile, ...requested } }, library, requested);
  return {
    id: uid("proposal"),
    status: "pending",
    baseVersionId: current.versionId,
    createdAt: now.toISOString(),
    reason: changes.reason || "You changed today’s available training context.",
    changes: [
      current.minutes !== candidate.minutes ? `${current.minutes} → ${candidate.minutes} minutes` : null,
      current.location !== candidate.location ? `${current.location} → ${candidate.location}` : null,
      current.intensity !== candidate.intensity ? `${current.intensity} → ${candidate.intensity} intensity` : null,
      current.exercises.map(item => item.exerciseId).join("|") !== candidate.exercises.map(item => item.exerciseId).join("|") ? "Compatible exercise selection" : null,
    ].filter(Boolean),
    candidate,
  };
}

export function approvePlanProposal(state, proposalId, now = new Date()) {
  const proposal = state.pendingPlanProposal;
  if (!proposal || proposal.id !== proposalId || proposal.status !== "pending") return state;
  const previous = state.activePlan;
  state.activePlan = { ...deepClone(proposal.candidate), activatedAt: now.toISOString(), approvedFromProposalId: proposal.id };
  state.planHistory = [...(state.planHistory || []), {
    id: uid("plan-event"),
    type: "PLAN_ACTIVATED",
    proposalId: proposal.id,
    previousVersionId: previous?.versionId || null,
    versionId: state.activePlan.versionId,
    at: now.toISOString(),
  }].slice(-100);
  state.pendingPlanProposal = null;
  return state;
}

export function rejectPlanProposal(state, proposalId, now = new Date()) {
  if (!state.pendingPlanProposal || state.pendingPlanProposal.id !== proposalId) return state;
  state.planHistory = [...(state.planHistory || []), {
    id: uid("plan-event"),
    type: "PLAN_DECLINED",
    proposalId,
    at: now.toISOString(),
  }].slice(-100);
  state.pendingPlanProposal = null;
  return state;
}

function setsForPlanExercise(item) {
  return Array.from({ length: item.target.sets }, (_, index) => ({
    id: uid("set"),
    index: index + 1,
    kind: "work",
    weight: safeNumber(item.target.suggestedWeight, 0, 0, 5_000),
    reps: safeNumber(item.target.reps, 8, 1, 1_000),
    rpe: null,
    unit: item.units || item.target.units || "lb",
    done: false,
    completedAt: null,
  }));
}

export function startWorkoutFromPlan(plan, now = new Date()) {
  return {
    id: uid("workout"),
    planId: plan.id,
    planVersionId: plan.versionId,
    planLabel: plan.label,
    units: normalizeUnit(plan.units, "lb"),
    startedAt: now.toISOString(),
    status: "active",
    pausedAt: null,
    accumulatedPausedMs: 0,
    currentExerciseIndex: 0,
    scrollTop: 0,
    notes: "",
    restTimer: { endsAt: null, durationSeconds: 90, running: false, paused: false },
    exercises: plan.exercises.map(item => ({
      exerciseId: item.exerciseId,
      snapshot: deepClone(item.snapshot),
      target: deepClone(item.target),
      units: normalizeUnit(plan.units, "lb"),
      notes: "",
      sets: setsForPlanExercise({ ...item, units: normalizeUnit(plan.units, "lb") }),
    })),
  };
}

export function restSecondsRemaining(workout, now = new Date()) {
  const end = new Date(workout?.restTimer?.endsAt || "").getTime();
  if (!workout?.restTimer?.running || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - now.getTime()) / 1_000));
}

export function startRestTimer(workout, seconds, now = new Date()) {
  const durationSeconds = safeNumber(seconds, 90, 15, 600);
  workout.restTimer = {
    durationSeconds,
    endsAt: new Date(now.getTime() + durationSeconds * 1_000).toISOString(),
    running: true,
    paused: false,
  };
  return workout;
}

export function adjustRestTimer(workout, deltaSeconds, now = new Date()) {
  const remaining = restSecondsRemaining(workout, now);
  const next = Math.max(0, remaining + deltaSeconds);
  if (next === 0) {
    workout.restTimer = { endsAt: null, durationSeconds: workout.restTimer?.durationSeconds || 90, running: false, paused: false };
    return workout;
  }
  return startRestTimer(workout, next, now);
}

export function isValidCompletedSet(set) {
  if (!set?.done) return false;
  const reps = Number(set.reps);
  const weight = Number(set.weight);
  const rpe = set.rpe === null || set.rpe === "" ? null : Number(set.rpe);
  if (!Number.isFinite(reps) || reps < 1) return false;
  if (!Number.isFinite(weight) || weight < 0) return false;
  if (rpe !== null && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) return false;
  return true;
}

export function completeWorkout(state, now = new Date()) {
  const workout = state.activeWorkout;
  if (!workout) return { state, session: null, error: "NO_ACTIVE_WORKOUT" };
  const completedSets = workout.exercises.flatMap(exercise => exercise.sets.filter(isValidCompletedSet));
  if (!completedSets.length) return { state, session: null, error: "NO_COMPLETED_SETS" };
  if ((state.sessions || []).some(session => session.id === workout.id || session.completionReceiptId === `receipt-${workout.id}`)) {
    return { state, session: null, error: "DUPLICATE_COMPLETION" };
  }
  const exercises = workout.exercises.map(exercise => ({
    exerciseId: exercise.exerciseId,
    snapshot: deepClone(exercise.snapshot),
    target: deepClone(exercise.target),
    notes: exercise.notes || "",
    units: normalizeUnit(exercise.units || workout.units, "lb"),
    sets: exercise.sets.filter(isValidCompletedSet).map(deepClone),
  })).filter(exercise => exercise.sets.length);
  const session = {
    id: workout.id,
    completionReceiptId: `receipt-${workout.id}`,
    date: now.toLocaleDateString("en-CA"),
    startedAt: workout.startedAt,
    completedAt: now.toISOString(),
    planId: workout.planId,
    planVersionId: workout.planVersionId || null,
    planLabel: workout.planLabel,
    durationMinutes: Math.max(1, elapsedMinutes(workout.startedAt, now) - Math.round((workout.accumulatedPausedMs || 0) / 60_000)),
    units: normalizeUnit(workout.units, "lb"),
    exercises,
    markedPR: false,
    rating: null,
    notes: workout.notes || "",
  };
  session.totalVolume = sessionVolume(session);
  session.muscles = unique(exercises.flatMap(exercise => exercise.snapshot.primaryMuscles || []));
  state.sessions = [...(state.sessions || []), session];
  state.activeWorkout = null;
  state.lastWorkoutSummary = {
    receiptId: session.completionReceiptId,
    sessionId: session.id,
    durationMinutes: session.durationMinutes,
    completedExercises: session.exercises.length,
    completedSets: completedSets.length,
    totalVolume: session.totalVolume,
    muscles: session.muscles,
    at: now.toISOString(),
  };
  return { state, session, error: null };
}

export function swapWorkoutExercise(workout, index, replacement) {
  if (!workout?.exercises?.[index] || !replacement) return workout;
  const previous = workout.exercises[index];
  const hasCompleted = previous.sets.some(set => set.done);
  if (hasCompleted) return workout;
  workout.exercises[index] = {
    exerciseId: replacement.id,
    snapshot: {
      id: replacement.id,
      name: replacement.name,
      movementPattern: replacement.movementPattern,
      equipment: [...(replacement.equipment || [])],
      primaryMuscles: [...(replacement.primaryMuscles || [])],
      mediaPoster: replacement.media?.[0]?.path || "",
    },
    target: { ...previous.target },
    notes: "",
    units: normalizeUnit(workout.units, "lb"),
    sets: previous.sets.map((set, setIndex) => ({ ...set, id: uid("set"), index: setIndex + 1, weight: 0, unit: normalizeUnit(workout.units, "lb"), done: false, completedAt: null })),
  };
  return workout;
}
