import {
  ANSWER_DEPTHS,
  BUILD,
  DEFAULT_VOICE_BY_TONE,
  THEMES,
  TRAINER_TONES,
  VOICE_PERSONAS,
} from "./constants.mjs";
import {
  createInitialNutritionState,
  normalizeNutritionState,
} from "../domain/nutrition.mjs";
import {
  clamp,
  deepClone,
  hashText,
  localDateKey,
  normalizeUnit,
  safeNumber,
  slug,
  stableExerciseId,
  uid,
  unique,
} from "./utils.mjs";

export const V040_SCHEMA_VERSION = 4;
export const storageKey = founder => `fitcoach-v040:${founder}`;
export const legacyStorageKey = founder => `fitcoach-v031:${founder}`;
export const backupStorageKey = founder => `fitcoach-v040-backup:v031:${founder}`;

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const PRIVATE_HISTORY_PATTERN = /\b(?:api[_ -]?key|password|secret|token|bearer\s+(?:sk-)?[a-z0-9._~+/=-]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}|medicat\w*|prescription|dosage?|\d+\s?mg\b|diagnos\w*|pregnan\w*|eating\s+disorder|body\s?weight|weigh\s+\d+)/i;
const cleanString = (value, fallback = "", max = 2_000) => (
  typeof value === "string" ? value.trim().slice(0, max) : fallback
);
const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const TRAINER_ACTION_KINDS = ["open_exercise", "open_workout", "propose_minutes", "open_progress", "open_voice", "open_nutrition", "nutrition_draft"];
const normalizeTrainerAction = value => {
  if (!isObject(value) || !TRAINER_ACTION_KINDS.includes(value.kind)) return null;
  const normalized = {
    kind: value.kind,
    value: cleanString(value.value, "", 96),
    label: cleanString(value.label, "", 120),
    detail: cleanString(value.detail, "", 180),
  };
  return normalized.value && normalized.label ? normalized : null;
};
const historyProviderEligible = message => (
  Boolean(message?.providerEligible)
  && message?.contractVersion === "fitcoach-chat-v3"
  && !PRIVATE_HISTORY_PATTERN.test(String(message?.text || message?.content || "").normalize("NFKC"))
);

export function createInitialState(founder = "mo", now = new Date()) {
  const createdAt = now.toISOString();
  const initialTone = founder === "ravi" ? "Direct" : "Strict";
  return {
    schemaVersion: V040_SCHEMA_VERSION,
    build: BUILD,
    founder,
    profile: {
      onboarded: false,
      goal: "build muscle",
      gender: "prefer-not-to-say",
      focusAreas: [],
      experience: "intermediate",
      days: 3,
      duration: 45,
      equipment: "full gym",
      location: "gym",
      blocker: "time",
      tone: initialTone,
      quietStart: "21:30",
      quietEnd: "08:00",
      proactive: true,
      feedbackOptIn: true,
      energy: 3,
      energyCheckedAt: null,
      intensity: "standard",
      preferredDays: [1, 3, 5],
    },
    settings: {
      theme: "light",
      units: "lb",
      coachMode: "smart",
      speakReplies: true,
      voicePersona: DEFAULT_VOICE_BY_TONE[initialTone] || "nova",
      voiceConsent: false,
      workoutCues: true,
      autoRestTimer: true,
      tutorialDismissed: false,
      voiceProfileMigrated0402: false,
    },
    sessions: [],
    chat: [],
    decisions: [],
    interventionOutcomes: [],
    memories: [],
    exercisePreferences: {
      favorites: [],
      recent: [],
      preferred: [],
      reduced: [],
      excluded: [],
    },
    activePlan: null,
    pendingPlanProposal: null,
    planHistory: [],
    activeWorkout: null,
    workoutDrafts: [],
    lastWorkoutSummary: null,
    lastApi: null,
    feedback: [],
    integrations: {
      appleHealth: {
        status: "native_required",
        syncMode: "manual_until_ios",
        requestedAt: null,
        lastSyncedAt: null,
      },
      payments: {
        status: "not_configured",
        trialDays: 7,
        selectedPlan: "yearly",
      },
    },
    gymProfile: {
      selectedGymName: "",
      selectedGymAddress: "",
      source: "manual",
      equipment: ["dumbbells", "kettlebells", "barbells", "plates", "squat rack", "benches", "cables", "machines"],
    },
    socialDrafts: [],
    nutrition: createInitialNutritionState(),
    migration: {
      source: "fresh-v040",
      migratedAt: createdAt,
      sourceDigest: null,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function normalizeSet(raw, index, unit = "lb") {
  return {
    id: cleanString(raw?.id, uid("set"), 96),
    index: index + 1,
    kind: oneOf(raw?.kind, ["warmup", "work"], "work"),
    weight: safeNumber(raw?.weight, 0, 0, 5_000),
    reps: safeNumber(raw?.reps, 0, 0, 1_000),
    rpe: raw?.rpe === null || raw?.rpe === "" ? null : safeNumber(raw?.rpe, null, 1, 10),
    unit: normalizeUnit(raw?.unit, unit),
    done: Boolean(raw?.done),
    completedAt: raw?.done && cleanString(raw?.completedAt) ? cleanString(raw.completedAt, "", 40) : null,
    error: cleanString(raw?.error, "", 180),
  };
}

function normalizeExerciseSnapshot(raw, fallbackIndex = 0, unit = "lb") {
  const name = cleanString(raw?.snapshot?.name || raw?.name, `Exercise ${fallbackIndex + 1}`, 120);
  const exerciseId = cleanString(raw?.exerciseId || raw?.snapshot?.id, stableExerciseId(name), 96);
  const rawSets = Array.isArray(raw?.sets) ? raw.sets : [];
  return {
    exerciseId,
    snapshot: {
      id: exerciseId,
      name,
      movementPattern: cleanString(raw?.snapshot?.movementPattern, "other", 60),
      equipment: Array.isArray(raw?.snapshot?.equipment) ? raw.snapshot.equipment.map(String).slice(0, 8) : [],
      primaryMuscles: Array.isArray(raw?.snapshot?.primaryMuscles) ? raw.snapshot.primaryMuscles.map(String).slice(0, 8) : [],
      mediaPoster: cleanString(raw?.snapshot?.mediaPoster, "", 260),
    },
    target: {
      sets: safeNumber(raw?.target?.sets, rawSets.length || 1, 1, 20),
      reps: safeNumber(raw?.target?.reps, rawSets[0]?.reps || 8, 1, 1_000),
      restSeconds: safeNumber(raw?.target?.restSeconds, 90, 15, 600),
    },
    units: normalizeUnit(raw?.units, unit),
    notes: cleanString(raw?.notes, "", 1_000),
    sets: rawSets.slice(0, 20).map((set, index) => normalizeSet(set, index, normalizeUnit(raw?.units, unit))),
  };
}

function normalizeSession(raw, index, unit = "lb") {
  if (!isObject(raw)) return null;
  const completedAt = cleanString(raw.completedAt || raw.date, new Date().toISOString(), 40);
  const sessionUnit = normalizeUnit(raw.units || raw.unit, unit);
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises.slice(0, 50).map((exercise, exerciseIndex) => normalizeExerciseSnapshot(exercise, exerciseIndex, sessionUnit))
    : raw.exercise
      ? [normalizeExerciseSnapshot({
          exerciseId: stableExerciseId(raw.exercise),
          name: raw.exercise,
          units: sessionUnit,
          sets: Array.from({ length: clamp(Number(raw.sets) || 1, 1, 20) }, () => ({
            weight: raw.weight,
            reps: raw.reps,
            unit: sessionUnit,
            done: true,
            completedAt,
          })),
        }, 0, sessionUnit)]
      : [];
  return {
    id: cleanString(raw.id, `migrated-session-${index}-${hashText(`${completedAt}:${raw.planLabel || raw.plan || "A"}`)}`, 120),
    date: cleanString(raw.date, localDateKey(completedAt), 20),
    completedAt,
    startedAt: cleanString(raw.startedAt, completedAt, 40),
    planId: cleanString(raw.planId || raw.plan, "A", 80),
    planVersionId: cleanString(raw.planVersionId, "", 120) || null,
    planLabel: cleanString(raw.planLabel, raw.plan === "MIN" ? "Minimum Dose" : raw.plan === "B" ? "Plan B" : "Plan A", 120),
    units: sessionUnit,
    durationMinutes: safeNumber(raw.durationMinutes, 0, 0, 1_440),
    exercises,
    markedPR: Boolean(raw.markedPR || raw.pr),
    personalRecords: normalizePerformanceRecords(raw.personalRecords, sessionUnit, "personal_record"),
    baselines: normalizePerformanceRecords(raw.baselines, sessionUnit, "baseline"),
    rating: raw.rating == null ? null : safeNumber(raw.rating, null, 1, 5),
    notes: cleanString(raw.notes, "", 2_000),
    completionReceiptId: cleanString(raw.completionReceiptId, `receipt-${hashText(`${completedAt}:${index}`)}`, 120),
  };
}

function normalizePerformanceRecords(raw, unit = "lb", kind = "personal_record") {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObject).slice(0, 50).map(record => ({
    exerciseId: cleanString(record.exerciseId, "", 96),
    exerciseName: cleanString(record.exerciseName, "Exercise", 120),
    metric: oneOf(record.metric, ["estimated_1rm"], "estimated_1rm"),
    value: safeNumber(record.value, 0, 0, 10_000),
    previousValue: record.previousValue == null ? null : safeNumber(record.previousValue, null, 0, 10_000),
    weight: safeNumber(record.weight, 0, 0, 5_000),
    reps: safeNumber(record.reps, 0, 0, 1_000),
    unit: normalizeUnit(record.unit, unit),
    kind,
  })).filter(record => record.exerciseId && record.value > 0);
}

function normalizeWorkout(raw, unit = "lb") {
  if (!isObject(raw) || !Array.isArray(raw.exercises) || !raw.exercises.length) return null;
  const startedAt = cleanString(raw.startedAt, new Date().toISOString(), 40);
  const workoutUnit = normalizeUnit(raw.units || raw.unit, unit);
  return {
    id: cleanString(raw.id, uid("workout"), 120),
    planId: cleanString(raw.planId, "A", 80),
    planVersionId: cleanString(raw.planVersionId, "", 120) || null,
    planLabel: cleanString(raw.planLabel, "Plan A", 120),
    units: workoutUnit,
    startedAt,
    status: oneOf(raw.status, ["active", "paused"], "active"),
    pausedAt: cleanString(raw.pausedAt, "", 40) || null,
    accumulatedPausedMs: safeNumber(raw.accumulatedPausedMs, 0, 0, 86_400_000),
    currentExerciseIndex: safeNumber(raw.currentExerciseIndex, 0, 0, raw.exercises.length - 1),
    scrollTop: safeNumber(raw.scrollTop, 0, 0, 1_000_000),
    notes: cleanString(raw.notes, "", 2_000),
    restTimer: isObject(raw.restTimer) ? {
      endsAt: cleanString(raw.restTimer.endsAt, "", 40) || null,
      durationSeconds: safeNumber(raw.restTimer.durationSeconds, 90, 15, 600),
      running: Boolean(raw.restTimer.running && raw.restTimer.endsAt),
      paused: Boolean(raw.restTimer.paused),
    } : { endsAt: null, durationSeconds: 90, running: false },
    exercises: raw.exercises.slice(0, 50).map((exercise, exerciseIndex) => normalizeExerciseSnapshot(exercise, exerciseIndex, workoutUnit)),
  };
}

function normalizeProfile(raw, base) {
  const profile = isObject(raw) ? raw : {};
  const validFocusAreas = unique(Array.isArray(profile.focusAreas)
    ? profile.focusAreas.map(value => cleanString(value, "", 30)).filter(value => ["back", "arms", "shoulders", "abs", "chest", "legs", "glutes", "full body"].includes(value))
    : base.focusAreas);
  const focusAreas = validFocusAreas.includes("full body") ? ["full body"] : validFocusAreas.slice(0, 3);
  return {
    ...base,
    onboarded: Boolean(profile.onboarded),
    goal: cleanString(profile.goal, base.goal, 60),
    gender: oneOf(profile.gender, ["female", "male", "nonbinary", "prefer-not-to-say"], base.gender),
    focusAreas,
    experience: oneOf(profile.experience, ["beginner", "intermediate", "advanced"], base.experience),
    days: safeNumber(profile.days ?? profile.days_per_week, base.days, 1, 7),
    duration: safeNumber(profile.duration, base.duration, 10, 120),
    equipment: cleanString(profile.equipment, base.equipment, 80),
    location: oneOf(profile.location, ["gym", "home", "travel", "outdoors"], base.location),
    blocker: cleanString(profile.blocker, base.blocker, 60),
    tone: oneOf(profile.tone || profile.style, TRAINER_TONES, base.tone),
    quietStart: /^\d{2}:\d{2}$/.test(profile.quietStart || "") ? profile.quietStart : base.quietStart,
    quietEnd: /^\d{2}:\d{2}$/.test(profile.quietEnd || "") ? profile.quietEnd : base.quietEnd,
    proactive: Boolean(profile.proactive),
    feedbackOptIn: Boolean(profile.feedbackOptIn),
    energy: safeNumber(profile.energy, base.energy, 1, 5),
    energyCheckedAt: cleanString(profile.energyCheckedAt, "", 40) || null,
    intensity: oneOf(profile.intensity, ["light", "standard", "push"], base.intensity),
    preferredDays: [...new Set(Array.isArray(profile.preferredDays)
      ? profile.preferredDays
        .filter(value => (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.trim() !== ""))
        .map(Number)
        .filter(value => Number.isInteger(value) && value >= 0 && value <= 7)
        .map(value => value === 7 ? 0 : value)
      : base.preferredDays)].slice(0, 7),
  };
}

function normalizeIntegrations(raw, base) {
  const integrations = isObject(raw) ? raw : {};
  const appleHealth = isObject(integrations.appleHealth) ? integrations.appleHealth : {};
  const payments = isObject(integrations.payments) ? integrations.payments : {};
  return {
    appleHealth: {
      status: oneOf(appleHealth.status, ["native_required", "planned", "manual_until_ios", "connected"], base.appleHealth.status),
      syncMode: oneOf(appleHealth.syncMode, ["manual_until_ios", "read_only", "read_write"], base.appleHealth.syncMode),
      requestedAt: cleanString(appleHealth.requestedAt, "", 40) || null,
      lastSyncedAt: cleanString(appleHealth.lastSyncedAt, "", 40) || null,
    },
    payments: {
      status: oneOf(payments.status, ["not_configured", "preview", "sandbox", "live"], base.payments.status),
      trialDays: safeNumber(payments.trialDays, base.payments.trialDays, 0, 30),
      selectedPlan: oneOf(payments.selectedPlan, ["yearly", "monthly"], base.payments.selectedPlan),
    },
  };
}

function normalizeGymProfile(raw, base) {
  const profile = isObject(raw) ? raw : {};
  return {
    selectedGymName: cleanString(profile.selectedGymName, base.selectedGymName, 120),
    selectedGymAddress: cleanString(profile.selectedGymAddress, base.selectedGymAddress, 180),
    source: oneOf(profile.source, ["manual", "native_location_required", "gym_search_preview"], base.source),
    equipment: unique(Array.isArray(profile.equipment) ? profile.equipment.map(value => cleanString(value, "", 80)) : base.equipment).slice(0, 60),
  };
}

function normalizeSocialDraft(raw, index) {
  if (!isObject(raw)) return null;
  const id = cleanString(raw.id, `social-draft-${index}`, 120);
  const caption = cleanString(raw.caption, "", 280);
  if (!caption && !raw.hasImagePreview) return null;
  return {
    id,
    status: oneOf(raw.status, ["draft", "ready_for_review"], "draft"),
    visibility: oneOf(raw.visibility, ["private", "founders", "public_preview"], "private"),
    caption,
    createdAt: cleanString(raw.createdAt, new Date().toISOString(), 40),
    hasImagePreview: Boolean(raw.hasImagePreview),
    imagePersisted: false,
  };
}

function normalizeState(raw, founder, migration = null) {
  const base = createInitialState(founder);
  const settings = isObject(raw?.settings) ? raw.settings : {};
  const normalizedSettings = {
    ...base.settings,
    theme: oneOf(settings.theme, THEMES, base.settings.theme),
    units: normalizeUnit(settings.units, base.settings.units),
    coachMode: oneOf(settings.coachMode, ANSWER_DEPTHS, base.settings.coachMode),
    speakReplies: settings.speakReplies !== false,
    voicePersona: oneOf(settings.voicePersona, VOICE_PERSONAS, base.settings.voicePersona),
    voiceConsent: Boolean(settings.voiceConsent),
    workoutCues: settings.workoutCues !== false,
    autoRestTimer: settings.autoRestTimer !== false,
    tutorialDismissed: Boolean(settings.tutorialDismissed),
    voiceProfileMigrated0402: Boolean(settings.voiceProfileMigrated0402),
  };
  const sessionsById = new Map();
  (Array.isArray(raw?.sessions) ? raw.sessions : []).forEach((session, index) => {
    const normalized = normalizeSession(session, index, normalizedSettings.units);
    if (normalized && !sessionsById.has(normalized.id)) sessionsById.set(normalized.id, normalized);
  });
  const preferences = isObject(raw?.exercisePreferences) ? raw.exercisePreferences : {};
  return {
    ...base,
    schemaVersion: V040_SCHEMA_VERSION,
    build: BUILD,
    founder,
    profile: normalizeProfile(raw?.profile, base.profile),
    settings: normalizedSettings,
    sessions: [...sessionsById.values()],
    chat: (Array.isArray(raw?.chat) ? raw.chat : raw?.chats || []).filter(isObject).slice(-200).map(message => ({
      id: cleanString(message.id, uid("message"), 120),
      role: message.role === "assistant" || message.role === "coach" ? "coach" : "user",
      text: cleanString(message.text || message.content, "", 4_000),
      at: cleanString(message.at, new Date().toISOString(), 40),
      provider: cleanString(message.provider, message.role === "user" ? "" : "legacy", 80),
      model: cleanString(message.model, "", 120) || null,
      speakAllowed: message.speakAllowed !== false,
      providerEligible: historyProviderEligible(message),
      contractVersion: historyProviderEligible(message) ? "fitcoach-chat-v3" : cleanString(message.contractVersion, "legacy-v031", 80),
      action: normalizeTrainerAction(message.action),
    })).filter(message => message.text),
    decisions: Array.isArray(raw?.decisions) ? raw.decisions.filter(isObject).slice(-180) : [],
    interventionOutcomes: Array.isArray(raw?.interventionOutcomes) ? raw.interventionOutcomes.filter(isObject).slice(-180) : [],
    memories: unique((Array.isArray(raw?.memories) ? raw.memories : []).map(value => cleanString(value, "", 160))).slice(-24),
    exercisePreferences: {
      favorites: unique(Array.isArray(preferences.favorites) ? preferences.favorites.map(String) : []).slice(0, 200),
      recent: unique(Array.isArray(preferences.recent) ? preferences.recent.map(String) : []).slice(0, 20),
      preferred: unique(Array.isArray(preferences.preferred) ? preferences.preferred.map(String) : []).slice(0, 200),
      reduced: unique(Array.isArray(preferences.reduced) ? preferences.reduced.map(String) : []).slice(0, 200),
      excluded: unique(Array.isArray(preferences.excluded) ? preferences.excluded.map(String) : []).slice(0, 200),
    },
    activePlan: isObject(raw?.activePlan) ? deepClone(raw.activePlan) : null,
    pendingPlanProposal: isObject(raw?.pendingPlanProposal) ? deepClone(raw.pendingPlanProposal) : null,
    planHistory: Array.isArray(raw?.planHistory) ? raw.planHistory.filter(isObject).slice(-100) : [],
    activeWorkout: normalizeWorkout(raw?.activeWorkout, normalizedSettings.units),
    workoutDrafts: Array.isArray(raw?.workoutDrafts) ? raw.workoutDrafts.filter(isObject).slice(-12) : [],
    lastWorkoutSummary: isObject(raw?.lastWorkoutSummary) ? deepClone(raw.lastWorkoutSummary) : null,
    lastApi: isObject(raw?.lastApi) ? deepClone(raw.lastApi) : null,
    feedback: Array.isArray(raw?.feedback) ? raw.feedback.filter(isObject).slice(-200) : [],
    integrations: normalizeIntegrations(raw?.integrations, base.integrations),
    gymProfile: normalizeGymProfile(raw?.gymProfile, base.gymProfile),
    socialDrafts: (Array.isArray(raw?.socialDrafts) ? raw.socialDrafts : []).map(normalizeSocialDraft).filter(Boolean).slice(-24),
    // Fail-closed nutrition normalization: corrupted nutrition entries are
    // dropped individually and can never reset the rest of the app state.
    nutrition: normalizeNutritionState(raw?.nutrition),
    migration: migration || (isObject(raw?.migration) ? raw.migration : base.migration),
    createdAt: cleanString(raw?.createdAt, base.createdAt, 40),
    updatedAt: cleanString(raw?.updatedAt, base.updatedAt, 40),
  };
}

export function migrateLegacyPayload(raw, founder, now = new Date()) {
  return normalizeState(raw, founder, {
    source: "fitcoach-v031",
    migratedAt: now.toISOString(),
    sourceDigest: hashText(JSON.stringify(raw)),
  });
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function clearFitCoachStorage(storage) {
  const keys = [];
  const length = Number(storage?.length) || 0;
  for (let index = 0; index < length; index += 1) {
    const key = storage.key?.(index);
    if (typeof key === "string" && key.startsWith("fitcoach-")) keys.push(key);
  }
  for (const key of keys) storage.removeItem?.(key);
  // Adapters without an enumerable Storage interface still get the known
  // non-profile keys removed.
  storage.removeItem?.("fitcoach-theme");
  storage.removeItem?.("fitcoach-device-id");
}

export function createFitCoachStore({ storage = globalThis.localStorage, founder = "mo", clock = () => new Date() } = {}) {
  if (!storage) throw new Error("FitCoach requires a storage adapter.");
  let currentFounder = founder;
  let current = null;
  const listeners = new Set();

  const persist = next => {
    const normalized = normalizeState(next, currentFounder);
    normalized.updatedAt = clock().toISOString();
    storage.setItem(storageKey(currentFounder), JSON.stringify(normalized));
    current = normalized;
    listeners.forEach(listener => listener(deepClone(current)));
    return deepClone(current);
  };

  const loadFounder = nextFounder => {
    currentFounder = nextFounder;
    const v040Raw = storage.getItem(storageKey(currentFounder));
    if (v040Raw) {
      const parsed = parseJson(v040Raw);
      if (parsed && isObject(parsed)) {
        current = normalizeState(parsed, currentFounder);
        storage.setItem(storageKey(currentFounder), JSON.stringify(current));
        return deepClone(current);
      }
      const recoveryKey = `fitcoach-v040-corrupt:${currentFounder}:${hashText(v040Raw)}`;
      if (!storage.getItem(recoveryKey)) storage.setItem(recoveryKey, v040Raw);
    }

    const legacyRaw = storage.getItem(legacyStorageKey(currentFounder));
    if (legacyRaw) {
      const parsedLegacy = parseJson(legacyRaw);
      if (parsedLegacy && isObject(parsedLegacy)) {
        if (!storage.getItem(backupStorageKey(currentFounder))) {
          storage.setItem(backupStorageKey(currentFounder), legacyRaw);
        }
        current = migrateLegacyPayload(parsedLegacy, currentFounder, clock());
        storage.setItem(storageKey(currentFounder), JSON.stringify(current));
        return deepClone(current);
      }
    }

    current = createInitialState(currentFounder, clock());
    storage.setItem(storageKey(currentFounder), JSON.stringify(current));
    return deepClone(current);
  };

  return {
    load: () => loadFounder(currentFounder),
    switchFounder: nextFounder => loadFounder(nextFounder),
    get: () => deepClone(current || loadFounder(currentFounder)),
    update: updater => {
      const draft = deepClone(current || loadFounder(currentFounder));
      const result = updater(draft);
      return persist(result === undefined ? draft : result);
    },
    replace: next => persist(next),
    reset: () => {
      clearFitCoachStorage(storage);
      return persist(createInitialState(currentFounder, clock()));
    },
    export: () => JSON.stringify(current || loadFounder(currentFounder), null, 2),
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    key: () => storageKey(currentFounder),
    founder: () => currentFounder,
  };
}

export function normalizeStateForTest(raw, founder = "mo") {
  return normalizeState(raw, founder);
}
