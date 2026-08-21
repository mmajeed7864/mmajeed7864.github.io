import test from "node:test";
import assert from "node:assert/strict";

import {
  backupStorageKey,
  createFitCoachStore,
  createInitialState,
  legacyStorageKey,
  normalizeStateForTest,
  storageKey,
} from "../v040/core/store.mjs";
import {
  computeDecision,
  journeyStage,
  selectAction,
} from "../v040/domain/decisions.mjs";
import {
  approvePlanProposal,
  buildPlan,
  buildProgressionTracker,
  buildWorkoutSchedule,
  completeWorkout,
  createPlanProposal,
  isValidCompletedSet,
  PATTERN_ORDER,
  restSecondsRemaining,
  startRestTimer,
  startWorkoutFromPlan,
} from "../v040/domain/workouts.mjs";
import { sessionVolume } from "../v040/core/utils.mjs";
import { EXERCISES } from "../v040/data/exercise-library.mjs";

class MemoryStorage {
  #values = new Map();

  constructor(entries = []) {
    for (const [key, value] of entries) this.setItem(key, value);
  }

  get length() { return this.#values.size; }

  clear() { this.#values.clear(); }

  getItem(key) {
    return this.#values.has(String(key)) ? this.#values.get(String(key)) : null;
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key) { this.#values.delete(String(key)); }

  setItem(key, value) { this.#values.set(String(key), String(value)); }

  entries() { return [...this.#values.entries()]; }
}

const FIXED_NOW = new Date("2026-08-20T14:00:00.000Z");

function testLibrary() {
  const exercise = (id, movementPattern, name = id) => ({
    id,
    name,
    movementPattern,
    equipment: ["dumbbell"],
    primaryMuscles: [movementPattern],
    locations: ["gym", "home"],
    media: [{ path: `/fitcoach-founder-test/v040/assets/exercises/${id}.svg` }],
  });
  return [
    exercise("goblet-squat", "squat", "Goblet Squat"),
    exercise("floor-press", "horizontal-push", "Dumbbell Floor Press"),
    exercise("hip-hinge", "hinge", "Hip Hinge"),
    exercise("one-arm-row", "horizontal-pull", "One-arm Dumbbell Row"),
    exercise("half-kneeling-press", "vertical-push", "Half-kneeling Press"),
    exercise("band-pulldown", "vertical-pull", "Band Lat Pulldown"),
  ];
}

function totalWorkSets(plan) {
  return plan.exercises.reduce((sum, exercise) => sum + Number(exercise.target.sets || 0), 0);
}

test("v031 migration backs up once, deduplicates sessions, and is idempotent", () => {
  const legacy = {
    profile: {
      onboarded: true,
      goal: "get stronger",
      days_per_week: 4,
      style: "Supportive",
    },
    settings: { theme: "dark", units: "kg" },
    sessions: [
      {
        id: "session-one",
        completedAt: "2026-08-18T16:00:00.000Z",
        plan: "A",
        exercise: "Goblet Squat",
        sets: 3,
        reps: 8,
        weight: 24,
      },
      {
        id: "session-one",
        completedAt: "2026-08-18T16:00:00.000Z",
        plan: "B",
        exercise: "This duplicate must not replace the first receipt",
        sets: 1,
        reps: 1,
        weight: 1,
      },
    ],
  };
  const legacyRaw = JSON.stringify(legacy);
  const storage = new MemoryStorage([[legacyStorageKey("mo"), legacyRaw]]);
  const store = createFitCoachStore({ storage, founder: "mo", clock: () => FIXED_NOW });

  const migrated = store.load();
  assert.equal(storage.getItem(backupStorageKey("mo")), legacyRaw);
  assert.equal(migrated.migration.source, "fitcoach-v031");
  assert.equal(migrated.migration.migratedAt, FIXED_NOW.toISOString());
  assert.match(migrated.migration.sourceDigest, /^[a-f0-9]{8}$/);
  assert.equal(migrated.sessions.length, 1);
  assert.equal(migrated.sessions[0].id, "session-one");
  assert.equal(migrated.sessions[0].exercises[0].exerciseId, "goblet-squat");
  assert.equal(migrated.sessions[0].exercises[0].snapshot.name, "Goblet Squat");
  assert.equal(migrated.sessions[0].exercises[0].sets.length, 3);

  storage.setItem(legacyStorageKey("mo"), JSON.stringify({ sessions: [] }));
  const reloaded = store.load();
  assert.deepEqual(reloaded, migrated);
  assert.equal(storage.getItem(backupStorageKey("mo")), legacyRaw);
  assert.equal(reloaded.sessions.length, 1);
});

test("malformed v040 data is retained for recovery before a valid v031 migration", () => {
  const malformed = "{not-valid-json";
  const legacyRaw = JSON.stringify({
    profile: { onboarded: true },
    sessions: [{ id: "recovered-session", date: "2026-08-17", exercise: "Air Squat", sets: 2, reps: 10 }],
  });
  const storage = new MemoryStorage([
    [storageKey("mo"), malformed],
    [legacyStorageKey("mo"), legacyRaw],
  ]);
  const store = createFitCoachStore({ storage, founder: "mo", clock: () => FIXED_NOW });

  const recovered = store.load();
  const corruptEntries = storage.entries().filter(([key]) => key.startsWith("fitcoach-v040-corrupt:mo:"));
  assert.equal(corruptEntries.length, 1);
  assert.equal(corruptEntries[0][1], malformed);
  assert.equal(storage.getItem(backupStorageKey("mo")), legacyRaw);
  assert.equal(recovered.sessions.length, 1);
  assert.equal(recovered.sessions[0].id, "recovered-session");
  assert.doesNotThrow(() => JSON.parse(storage.getItem(storageKey("mo"))));

  store.load();
  assert.equal(storage.entries().filter(([key]) => key.startsWith("fitcoach-v040-corrupt:mo:")).length, 1);
});

test("state snapshots are stable, isolated, and retain workout plan version across persistence", () => {
  const storage = new MemoryStorage();
  const state = createInitialState("mo", FIXED_NOW);
  state.profile.onboarded = true;
  const plan = buildPlan(state, testLibrary(), { planId: "A", minutes: 30 });
  const workout = startWorkoutFromPlan(plan, FIXED_NOW);
  workout.exercises[0].sets[0].error = "Enter at least 1 rep before completing this set.";
  state.activePlan = plan;
  state.activeWorkout = workout;
  state.sessions = [{
    id: "versioned-session",
    completionReceiptId: "receipt-versioned-session",
    planId: plan.id,
    planVersionId: plan.versionId,
    planLabel: plan.label,
    startedAt: "2026-08-19T13:30:00.000Z",
    completedAt: "2026-08-19T14:00:00.000Z",
    date: "2026-08-19",
    exercises: [],
  }];

  const store = createFitCoachStore({ storage, founder: "mo", clock: () => FIXED_NOW });
  const persisted = store.replace(state);
  assert.equal(persisted.activeWorkout.planVersionId, plan.versionId);
  assert.equal(persisted.sessions[0].planVersionId, plan.versionId);
  assert.equal(persisted.activeWorkout.exercises[0].snapshot.name, plan.exercises[0].snapshot.name);
  assert.equal(persisted.activeWorkout.exercises[0].sets[0].error, "Enter at least 1 rep before completing this set.");

  const external = store.get();
  external.activeWorkout.exercises[0].snapshot.name = "Mutated outside the store";
  external.activePlan.exercises[0].snapshot.name = "Also mutated";
  assert.equal(store.get().activeWorkout.exercises[0].snapshot.name, plan.exercises[0].snapshot.name);
  assert.equal(store.get().activePlan.exercises[0].snapshot.name, plan.exercises[0].snapshot.name);

  const reloaded = store.load();
  assert.equal(reloaded.activeWorkout.planVersionId, plan.versionId);
  assert.equal(reloaded.sessions[0].planVersionId, plan.versionId);
  assert.deepEqual(reloaded.activeWorkout.exercises[0].snapshot, persisted.activeWorkout.exercises[0].snapshot);
  assert.equal(reloaded.activeWorkout.exercises[0].sets[0].error, "Enter at least 1 rep before completing this set.");
});

test("theme defaults to light and only accepts light, dark, or system", () => {
  assert.equal(createInitialState("mo", FIXED_NOW).settings.theme, "light");
  assert.equal(normalizeStateForTest({ settings: { theme: "neon" } }).settings.theme, "light");
  assert.equal(normalizeStateForTest({ settings: { theme: "dark" } }).settings.theme, "dark");
  assert.equal(normalizeStateForTest({ settings: { theme: "system" } }).settings.theme, "system");
});

test("tutorial dismissal is local settings state and defaults to showing the tutorial", () => {
  assert.equal(createInitialState("mo", FIXED_NOW).settings.tutorialDismissed, false);
  assert.equal(normalizeStateForTest({ settings: { tutorialDismissed: true } }).settings.tutorialDismissed, true);
  assert.equal(normalizeStateForTest({ settings: { tutorialDismissed: false } }).settings.tutorialDismissed, false);
});

test("new local profiles start with a voice that matches the trainer tone", () => {
  assert.equal(createInitialState("mo", FIXED_NOW).profile.tone, "Strict");
  assert.equal(createInitialState("mo", FIXED_NOW).settings.voicePersona, "atlas");
  assert.equal(createInitialState("ravi", FIXED_NOW).profile.tone, "Direct");
  assert.equal(createInitialState("ravi", FIXED_NOW).settings.voicePersona, "bennett");
});

test("daily trainer action is deterministic and an existing valid decision is reused", () => {
  const state = createInitialState("mo", FIXED_NOW);
  assert.equal(selectAction(state, FIXED_NOW), "CHECK_IN");

  const first = computeDecision(state, FIXED_NOW);
  assert.equal(first.type, "CHECK_IN");
  state.decisions.push(first);
  state.profile.energy = 1;
  const reused = computeDecision(state, new Date("2026-08-20T22:00:00.000Z"));
  assert.deepEqual(reused, first);

  state.sessions.push({
    id: "session-before-next-decision",
    date: "2026-08-20",
    completedAt: "2026-08-20T18:00:00.000Z",
    exercises: [],
  });
  const nextDay = computeDecision(state, new Date("2026-08-21T14:00:00.000Z"));
  assert.equal(nextDay.type, "RECOMMEND_REST");
  assert.equal(nextDay.primary.kind, "acknowledge");
  assert.equal(nextDay.primary.value, "recovery");
});

test("journey stage distinguishes day one from missing history without inventing failure", () => {
  const state = createInitialState("mo", FIXED_NOW);
  assert.equal(journeyStage(state, new Date("2026-08-20T20:00:00.000Z")), "first_day");
  const decision = computeDecision(state, new Date("2026-08-20T20:00:00.000Z"));
  assert.equal(decision.contractVersion, "fitcoach-decision-v2");
  assert.match(decision.message, /first day/u);
  assert.doesNotMatch(decision.message, /behind|gap|failure/u);

  state.createdAt = "2026-08-10T14:00:00.000Z";
  assert.equal(journeyStage(state, FIXED_NOW), "building_history");
  state.sessions.push({ id: "session-1", completedAt: "2026-08-19T14:00:00.000Z", exercises: [] });
  assert.equal(journeyStage(state, FIXED_NOW), "active");
});

test("a plan proposal cannot activate or alter the plan before explicit approval", () => {
  const state = createInitialState("mo", FIXED_NOW);
  const activePlan = buildPlan(state, testLibrary(), { planId: "A", minutes: 45 });
  state.activePlan = activePlan;

  const proposal = createPlanProposal(state, testLibrary(), {
    planId: "MIN",
    minutes: 12,
    reason: "Only twelve minutes are available.",
  }, FIXED_NOW);
  assert.equal(proposal.status, "pending");
  assert.equal(state.activePlan, activePlan);
  assert.equal(state.activePlan.versionId, activePlan.versionId);
  assert.notEqual(proposal.candidate.versionId, activePlan.versionId);
  assert.equal(proposal.candidate.minutes, 12);

  state.pendingPlanProposal = proposal;
  approvePlanProposal(state, "wrong-proposal-id", FIXED_NOW);
  assert.equal(state.activePlan.versionId, activePlan.versionId);
  assert.equal(state.pendingPlanProposal.id, proposal.id);

  approvePlanProposal(state, proposal.id, FIXED_NOW);
  assert.equal(state.activePlan.versionId, proposal.candidate.versionId);
  assert.equal(state.activePlan.approvedFromProposalId, proposal.id);
  assert.equal(state.pendingPlanProposal, null);
  assert.equal(state.planHistory.at(-1).type, "PLAN_ACTIVATED");
});

test("planner ranks every movement pattern and unknown patterns sort last", () => {
  assert.deepEqual(PATTERN_ORDER, [
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

  const state = createInitialState("mo", FIXED_NOW);
  state.profile.equipment = "full gym";
  const library = [
    { id: "curl-first-bug", name: "Curl", movementPattern: "curl", equipment: ["dumbbell"], locations: ["gym"], primaryMuscles: ["biceps"] },
    { id: "unknown-first-bug", name: "Unknown", movementPattern: "made-up", equipment: ["none"], locations: ["gym"], primaryMuscles: ["other"] },
    { id: "squat", name: "Squat", movementPattern: "squat", equipment: ["none"], locations: ["gym"], primaryMuscles: ["legs"] },
    { id: "hinge", name: "Hinge", movementPattern: "hinge", equipment: ["none"], locations: ["gym"], primaryMuscles: ["posterior"] },
  ];
  const plan = buildPlan(state, library, { minutes: 20 });
  assert.deepEqual(plan.exercises.map(item => item.exerciseId), ["squat", "hinge", "curl-first-bug"]);
});

test("duration budgets drive reported minutes, exercise count, and work sets", () => {
  const state = createInitialState("mo", FIXED_NOW);
  state.profile.equipment = "full gym";

  const plan20 = buildPlan(state, EXERCISES, { planId: "A", minutes: 20 });
  assert.equal(plan20.minutes, 20);
  assert.equal(plan20.exercises.length, 3);
  assert.equal(totalWorkSets(plan20), 6);

  const plan30 = buildPlan(state, EXERCISES, { planId: "A", minutes: 30 });
  assert.equal(plan30.minutes, 30);
  assert.equal(plan30.exercises.length, 4);
  assert.ok(totalWorkSets(plan30) >= 8 && totalWorkSets(plan30) <= 10);

  const planB = buildPlan(state, EXERCISES, { planId: "B", minutes: 60 });
  assert.equal(planB.minutes, 30);
  assert.equal(planB.exercises.length, 4);
  assert.ok(totalWorkSets(planB) >= 8 && totalWorkSets(planB) <= 10);

  const minimum = buildPlan(state, EXERCISES, { planId: "MIN", minutes: 60 });
  assert.equal(minimum.minutes, 12);
  assert.equal(minimum.exercises.length, 2);
  assert.equal(totalWorkSets(minimum), 4);
});

test("workout schedule creates distinct day-linked workout plans", () => {
  const state = createInitialState("mo", FIXED_NOW);
  state.profile.preferredDays = [1, 3, 5];
  state.profile.days = 3;
  state.profile.duration = 30;
  state.activePlan = buildPlan(state, testLibrary(), { planId: "A", minutes: 30 });

  const schedule = buildWorkoutSchedule(state, testLibrary());
  assert.equal(schedule.length, 3);
  assert.deepEqual(schedule.map(slot => slot.shortDayLabel), ["Mon", "Wed", "Fri"]);
  assert.deepEqual(schedule.map(slot => slot.label), ["Strength A", "Strength B", "Full-body C"]);
  assert.equal(new Set(schedule.map(slot => slot.plan.versionId)).size, 3);
  assert.notDeepEqual(
    schedule[0].plan.exercises.map(item => item.exerciseId),
    schedule[1].plan.exercises.map(item => item.exerciseId),
  );
  assert.equal(schedule[0].plan.scheduledDay, 1);
});

test("progression tracker uses completed workout proof and leaves unlogged moves honest", () => {
  const state = createInitialState("mo", FIXED_NOW);
  state.settings.units = "lb";
  state.sessions = [{
    id: "logged-strength-a",
    date: "2026-08-19",
    completedAt: "2026-08-19T14:00:00.000Z",
    planId: "A",
    planVersionId: "plan-old",
    planLabel: "Plan A",
    units: "lb",
    exercises: [{
      exerciseId: "goblet-squat",
      snapshot: { id: "goblet-squat", name: "Goblet Squat", movementPattern: "squat", equipment: ["dumbbell"], primaryMuscles: ["quadriceps", "glutes"] },
      target: { sets: 2, reps: 8, restSeconds: 120 },
      units: "lb",
      sets: [{ id: "set-proof", index: 1, kind: "work", weight: 25, reps: 8, rpe: 7, unit: "lb", done: true, completedAt: "2026-08-19T14:05:00.000Z" }],
    }],
  }];
  state.activePlan = buildPlan(state, testLibrary(), { planId: "A", minutes: 30 });

  const rows = buildProgressionTracker(state, testLibrary());
  const squat = rows.find(row => row.exerciseId === "goblet-squat");
  const unlogged = rows.find(row => row.exerciseId !== "goblet-squat");

  assert.equal(squat.last.weight, 25);
  assert.equal(squat.status, "Add load next time");
  assert.equal(squat.next.weight, 30);
  assert.equal(unlogged.status, "No log yet");
  assert.match(unlogged.evidence, /Log this movement once/);
});

test("equipment compatibility beats preferences and exclusions remain hard", () => {
  const state = createInitialState("mo", FIXED_NOW);
  state.profile.location = "gym";
  state.profile.equipment = "bodyweight";
  state.exercisePreferences.preferred = ["goblet-squat", "band-row", "one-arm-dumbbell-row"];
  let plan = buildPlan(state, EXERCISES, { planId: "A", minutes: 45 });
  assert.equal(plan.exercises.some(item => item.snapshot.equipment.some(value => /dumbbell|band/i.test(value))), false);
  assert.ok(plan.compatibleEquipment.includes("bodyweight"));

  state.profile.equipment = "dumbbells only";
  plan = buildPlan(state, EXERCISES, { planId: "A", minutes: 45 });
  assert.equal(plan.exercises.some(item => item.snapshot.equipment.some(value => /resistance band|band anchor/i.test(value))), false);
  assert.equal(plan.exercises.some(item => item.snapshot.equipment.some(value => /dumbbell/i.test(value))), true);

  state.exercisePreferences.excluded = [plan.exercises[0].exerciseId];
  const excluded = state.exercisePreferences.excluded[0];
  plan = buildPlan(state, EXERCISES, { planId: "A", minutes: 45 });
  assert.equal(plan.exercises.some(item => item.exerciseId === excluded), false);
});

test("goal and experience have restrained deterministic effects", () => {
  const state = createInitialState("mo", FIXED_NOW);
  state.profile.equipment = "full gym";
  state.profile.goal = "get stronger";
  const stronger = buildPlan(state, EXERCISES, { minutes: 30 });
  assert.equal(stronger.exercises[0].target.reps, 6);
  assert.equal(stronger.exercises[0].target.restSeconds, 150);

  state.profile.goal = "stay consistent";
  const consistent = buildPlan(state, EXERCISES, { minutes: 30 });
  assert.equal(consistent.exercises[0].target.restSeconds, 75);

  const library = [
    { id: "intermediate-squat", name: "Intermediate Squat", movementPattern: "squat", difficulty: "intermediate", equipment: ["none"], locations: ["gym"], primaryMuscles: ["legs"], media: [] },
    { id: "beginner-squat", name: "Beginner Squat", movementPattern: "squat", difficulty: "beginner", equipment: ["none"], locations: ["gym"], primaryMuscles: ["legs"], media: [] },
    { id: "hinge", name: "Hinge", movementPattern: "hinge", difficulty: "beginner", equipment: ["none"], locations: ["gym"], primaryMuscles: ["posterior"], media: [] },
  ];
  state.profile.experience = "beginner";
  const beginner = buildPlan(state, library, { minutes: 20 });
  assert.equal(beginner.exercises[0].exerciseId, "beginner-squat");
});

test("workout model survives JSON persistence and rest time recovers from endsAt", () => {
  const state = createInitialState("mo", FIXED_NOW);
  const plan = buildPlan(state, testLibrary(), { planId: "A", minutes: 30 });
  const workout = startWorkoutFromPlan(plan, FIXED_NOW);
  startRestTimer(workout, 90, FIXED_NOW);

  const roundTrip = JSON.parse(JSON.stringify(workout));
  assert.equal(roundTrip.status, "active");
  assert.equal(roundTrip.planVersionId, plan.versionId);
  assert.equal(roundTrip.exercises.length, plan.exercises.length);
  assert.equal(roundTrip.exercises[0].sets.length, plan.exercises[0].target.sets);
  assert.equal(restSecondsRemaining(roundTrip, new Date("2026-08-20T14:00:30.000Z")), 60);
  assert.equal(restSecondsRemaining(roundTrip, new Date("2026-08-20T14:01:31.000Z")), 0);
});

test("zero-repetition sets cannot become completion receipts or volume", () => {
  const state = createInitialState("mo", FIXED_NOW);
  const plan = buildPlan(state, testLibrary(), { planId: "A", minutes: 30 });
  const workout = startWorkoutFromPlan(plan, FIXED_NOW);
  const set = workout.exercises[0].sets[0];
  set.done = true;
  set.reps = 0;
  set.weight = 25;
  set.completedAt = "2026-08-20T14:05:00.000Z";
  assert.equal(isValidCompletedSet(set), false);
  state.activeWorkout = workout;

  const result = completeWorkout(state, new Date("2026-08-20T14:20:00.000Z"));
  assert.equal(result.error, "NO_COMPLETED_SETS");
  assert.equal(state.sessions.length, 0);
});

test("unit-owned history converts without relabeling raw historical values", () => {
  const state = createInitialState("mo", FIXED_NOW);
  state.settings.units = "kg";
  state.sessions = [{
    id: "kg-session",
    date: "2026-08-18",
    completedAt: "2026-08-18T14:00:00.000Z",
    planId: "A",
    planVersionId: "legacy-plan",
    planLabel: "Plan A",
    units: "kg",
    exercises: [{
      exerciseId: "goblet-squat",
      snapshot: { id: "goblet-squat", name: "Goblet Squat", movementPattern: "squat", equipment: ["dumbbell"], primaryMuscles: ["quadriceps"] },
      units: "kg",
      target: { sets: 1, reps: 8, restSeconds: 120 },
      sets: [{ id: "set-kg", index: 1, kind: "work", weight: 20, reps: 8, rpe: null, unit: "kg", done: true, completedAt: "2026-08-18T14:05:00.000Z" }],
    }],
  }];
  assert.equal(sessionVolume(state.sessions[0], "kg"), 160);
  assert.equal(Math.round(sessionVolume(state.sessions[0], "lb")), 353);

  state.settings.units = "lb";
  state.exercisePreferences.preferred = ["goblet-squat"];
  const plan = buildPlan(state, EXERCISES, { minutes: 20 });
  const squat = plan.exercises.find(item => item.exerciseId === "goblet-squat");
  assert.equal(squat.target.suggestedWeight, 44.1);
  assert.equal(state.sessions[0].units, "kg");
  assert.equal(state.sessions[0].exercises[0].sets[0].unit, "kg");
});

test("workout completion emits one receipt and rejects a duplicate completion", () => {
  const state = createInitialState("mo", FIXED_NOW);
  const plan = buildPlan(state, testLibrary(), { planId: "A", minutes: 30 });
  const originalWorkout = startWorkoutFromPlan(plan, new Date("2026-08-20T13:30:00.000Z"));
  originalWorkout.exercises[0].sets[0].done = true;
  originalWorkout.exercises[0].sets[0].weight = 25;
  originalWorkout.exercises[0].sets[0].reps = 8;
  originalWorkout.exercises[0].sets[0].completedAt = "2026-08-20T13:40:00.000Z";
  state.activeWorkout = structuredClone(originalWorkout);

  const first = completeWorkout(state, FIXED_NOW);
  assert.equal(first.error, null);
  assert.equal(first.session.id, originalWorkout.id);
  assert.equal(first.session.completionReceiptId, `receipt-${originalWorkout.id}`);
  assert.equal(state.sessions.length, 1);
  assert.equal(state.activeWorkout, null);

  state.activeWorkout = structuredClone(originalWorkout);
  const duplicate = completeWorkout(state, new Date("2026-08-20T14:01:00.000Z"));
  assert.equal(duplicate.error, "DUPLICATE_COMPLETION");
  assert.equal(duplicate.session, null);
  assert.equal(state.sessions.length, 1);
});
