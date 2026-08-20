import { normalizeTrainerMessage } from "../services/trainer-client.mjs";

export const TRAINER_ACTION_KINDS = Object.freeze([
  "open_exercise",
  "open_workout",
  "propose_minutes",
  "open_progress",
  "open_voice",
]);

const INTENT = Object.freeze({
  exercise: /\b(?:show|open|guide|teach|learn|explain|how\s+(?:do|to)|instructions?|setup|form|mistakes?)\b/i,
  workout: /\b(?:today(?:'s)?\s+workout|my\s+workout|workout\s+today|what\s+should\s+i\s+(?:train|do)|open\s+(?:the\s+)?(?:plan|workout)|start\s+(?:the\s+)?(?:plan|workout))\b/i,
  duration: /\b(?:shorter|quick(?:er)?|only\s+have|fit\s+into|make\s+(?:it|today|the\s+workout))\b/i,
  progress: /\b(?:progress|history|personal\s+best|prs?|volume|consistency|completed\s+workouts?)\b/i,
  voice: /\b(?:voice\s+(?:room|mode|coach|trainer)|talk\s+to\s+(?:you|my\s+trainer)|speak\s+(?:with|to)|start\s+voice)\b/i,
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
    .filter(entry => entry.names.some(name => normalized.includes(name)))
    .sort((left, right) => Math.max(...right.names.map(name => name.length)) - Math.max(...left.names.map(name => name.length)))
    .at(0)?.exercise || null;
}

function requestedMinutes(message) {
  const match = message.match(/\b(12|20|30|45|60)\s*(?:min|mins|minute|minutes)\b/i);
  return match ? Number(match[1]) : null;
}

export function deriveTrainerAction({ state, message, exercises }) {
  const normalized = normalizeTrainerMessage(message);
  if (!normalized) return null;

  const exercise = matchedExercise(normalized, exercises);
  if (exercise && (INTENT.exercise.test(normalized) || normalized.trim().toLowerCase() === exercise.name.toLowerCase())) {
    return Object.freeze({
      kind: "open_exercise",
      value: exercise.id,
      label: `Open ${exercise.name} guide`,
      detail: "Local illustrated setup, movement, and mistake guide",
    });
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
