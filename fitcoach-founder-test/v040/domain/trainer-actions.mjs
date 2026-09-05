import { normalizeTrainerMessage } from "../services/trainer-client.mjs";
import { projectNutritionForCoach } from "./nutrition.mjs";

export const TRAINER_ACTION_KINDS = Object.freeze([
  "open_exercise",
  "open_workout",
  "propose_minutes",
  "open_progress",
  "open_voice",
  "open_nutrition",
  "nutrition_draft",
]);

const INTENT = Object.freeze({
  exercise: /\b(?:show|open|guide|teach|learn|explain|how\s+(?:do|to)|instructions?|setup|form|mistakes?)\b/i,
  currentExercise: /^(?:please\s+)?(?:(?:(?:can|could|would)\s+you\s+)?(?:show(?:\s+me)?|open|explain(?:\s+to\s+me)?|teach(?:\s+me)?)|how\s+(?:do\s+i|to)\s+(?:do|perform))\s+(?:(?:the|my)\s+)?(?:this|current)\s+(?:exercise|move|movement)(?:\s+(?:guide|instructions|setup|form))?(?:\s+please)?[.!?]*$/i,
  workout: /(?:\b(?:today(?:'s)?\s+workout|my\s+workout|workout\s+today|what\s+should\s+i\s+(?:train|do)(?:\s+today)?)\b|\b(?:resume|continue|return\s+to|back\s+to)\s+(?:(?:my|the|current|active)\s+)?workout\b|\b(?:open|pull\s+up|show|start)\b[\s\S]{0,36}\b(?:plan|workout|training\s+week|leg\s+day|push\s+day|pull\s+day)\b)/i,
  duration: /\b(?:shorter|quick(?:er)?|only\s+have|fit\s+into|make\s+(?:it|today|the\s+workout))\b/i,
  progress: /\b(?:progress|history|personal\s+best|prs?|volume|consistency|completed\s+workouts?)\b/i,
  voice: /\b(?:voice\s+(?:room|mode|coach|trainer)|talk\s+to\s+(?:you|my\s+trainer)|speak\s+(?:with|to)|start\s+voice)\b/i,
  nutritionDraft: /(?:\b(?:log|record|track)\b[\s\S]{0,60}\b(?:food|meal|breakfast|lunch|dinner|snack|calories?|protein|ate)\b|\bi\s+(?:just\s+)?(?:ate|had)\s+\S|\blog\s+this\s+as\s+a\s+draft\b)/i,
  proteinGap: /\bprotein\s+gap\b|\b(?:enough|how\s+much)\s+protein\b/i,
  nutrition: /\b(?:nutrition|calorie?s?|macros?|food\s+(?:log|diary)|diet\s+diary|what\s+should\s+i\s+eat|what\s+did\s+i\s+eat|show\s+(?:my\s+)?(?:food|breakfast|lunch|dinner|snacks?)|pull\s+up\s+(?:my\s+)?food)\b/i,
});

function searchableExerciseNames(exercise) {
  return [exercise.name, ...(exercise.aliases || [])]
    .map(value => String(value || "").normalize("NFKC").trim().toLowerCase())
    .filter(value => value.length >= 3)
    .sort((left, right) => right.length - left.length);
}

function matchedExercise(message, exercises) {
  const normalized = message.toLowerCase();
  return [...(exercises || [])]
    .map(exercise => ({ exercise, names: searchableExerciseNames(exercise) }))
    .map(entry => ({ ...entry, matchedNames: entry.names.filter(name => normalized.includes(name)) }))
    .filter(entry => entry.matchedNames.length > 0)
    .sort((left, right) => {
      const matchedLength = Math.max(...right.matchedNames.map(name => name.length)) - Math.max(...left.matchedNames.map(name => name.length));
      if (matchedLength) return matchedLength;
      if (left.exercise.guideStatus !== right.exercise.guideStatus) return left.exercise.guideStatus === "visual-guide" ? -1 : 1;
      return String(left.exercise.id).localeCompare(String(right.exercise.id), "en");
    })
    .at(0)?.exercise || null;
}

function requestedMinutes(message) {
  const match = message.match(/\b(12|20|30|45|60)\s*(?:min|mins|minute|minutes)\b/i);
  return match ? Number(match[1]) : null;
}

function currentExercise(state, exercises) {
  const workout = state?.activeWorkout;
  if (!Array.isArray(workout?.exercises) || !Array.isArray(exercises)) return null;
  const index = workout.currentExerciseIndex ?? 0;
  if (!Number.isInteger(index) || index < 0 || index >= workout.exercises.length) return null;
  const current = workout.exercises[index];
  const id = current?.exerciseId || current?.snapshot?.id;
  if (typeof id !== "string" || !id) return null;
  // Resolve only a known catalogue ID. Never infer a different movement from
  // stale snapshot names, an invalid index, or the next planned workout.
  return exercises.find(exercise => exercise.id === id && typeof exercise.name === "string" && exercise.name.trim()) || null;
}

function exerciseGuideAction(exercise) {
  return Object.freeze({
    kind: "open_exercise",
    value: exercise.id,
    label: `Open ${exercise.name} guide`,
    detail: exercise.guideStatus === "visual-guide"
      ? "Local illustrated setup, movement, and mistake guide"
      : "Local written setup, movement, and cue guide",
  });
}

export function deriveTrainerAction({ state, message, exercises }) {
  const normalized = normalizeTrainerMessage(message);
  if (!normalized) return null;

  const exercise = matchedExercise(normalized, exercises);
  if (exercise && (INTENT.exercise.test(normalized) || normalized.trim().toLowerCase() === exercise.name.toLowerCase())) {
    return exerciseGuideAction(exercise);
  }

  if (INTENT.currentExercise.test(normalized)) {
    const current = currentExercise(state, exercises);
    return current ? exerciseGuideAction(current) : null;
  }

  const minutes = requestedMinutes(normalized);
  if (minutes && (INTENT.duration.test(normalized) || /\bworkout|session|plan\b/i.test(normalized))) {
    return Object.freeze({
      kind: "propose_minutes",
      value: String(minutes),
      label: `Review ${minutes}-minute option`,
      detail: "Creates a deterministic candidate; your current plan stays active",
    });
  }

  // Nutrition hooks are DRAFT/OPEN only. There is deliberately no trainer
  // action kind that confirms a food entry — confirmation is a user-only act.
  if (INTENT.nutritionDraft.test(normalized)) {
    return Object.freeze({
      kind: "nutrition_draft",
      value: normalized.slice(0, 96),
      label: "Draft this meal in Nutrition",
      detail: "Creates an unconfirmed demo estimate — you review, edit, and confirm before it counts",
    });
  }

  if (INTENT.proteinGap.test(normalized)) {
    const projection = projectNutritionForCoach(state);
    return Object.freeze({
      kind: "open_nutrition",
      value: "nutrition",
      label: "Show protein gap",
      detail: `${projection.proteinGrams} / ${projection.proteinTarget} g protein confirmed today · ${projection.proteinGapGrams ? `${projection.proteinGapGrams} g below target` : "target reached in the log"}. Drafts don't count.`,
    });
  }

  if (INTENT.nutrition.test(normalized)) {
    const projection = projectNutritionForCoach(state);
    return Object.freeze({
      kind: "open_nutrition",
      value: "nutrition",
      label: "Open today’s nutrition",
      detail: `${Math.round(projection.confirmedCalories)} / ${projection.targetCalories} kcal · ${projection.proteinGrams} / ${projection.proteinTarget} g protein confirmed today. Drafts don't count.`,
    });
  }

  if (INTENT.voice.test(normalized)) {
    return Object.freeze({
      kind: "open_voice",
      value: "voice",
      label: "Enter Voice Room",
      detail: "Persistent foreground conversation with transcript and controls",
    });
  }

  if (INTENT.progress.test(normalized)) {
    return Object.freeze({
      kind: "open_progress",
      value: "progress",
      label: "Open verified progress",
      detail: `${state?.sessions?.length || 0} completed workout receipt${state?.sessions?.length === 1 ? "" : "s"} on this device`,
    });
  }

  if (INTENT.workout.test(normalized)) {
    return Object.freeze({
      kind: "open_workout",
      value: "train",
      label: `Open ${state?.activePlan?.label || "today's workout"}`,
      detail: `${state?.activePlan?.minutes || state?.profile?.duration || 45} minutes · plan remains user-controlled`,
    });
  }

  return null;
}

export function isTrainerAction(value) {
  return Boolean(value)
    && typeof value === "object"
    && TRAINER_ACTION_KINDS.includes(value.kind)
    && typeof value.value === "string"
    && value.value.length > 0
    && value.value.length <= 96
    && typeof value.label === "string"
    && value.label.length > 0
    && value.label.length <= 120
    && typeof value.detail === "string"
    && value.detail.length <= 180;
}
