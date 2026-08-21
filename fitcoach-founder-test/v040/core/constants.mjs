export const BUILD = "0.4.3";
export const CACHE_GENERATION = "0413";
export const ROUTES = ["today", "train", "coach", "progress", "profile", "nutrition"];
export const TRAIN_SEGMENTS = ["workout", "exercises"];
export const THEMES = ["light", "dark", "system"];
export const TRAINER_TONES = ["Supportive", "Direct", "Strict", "Competitive", "Rude"];
export const VOICE_PERSONAS = ["nova", "atlas", "bennett", "mira"];
export const VOICE_PERSONA_LABELS = Object.freeze({
  nova: "Nova · supportive woman",
  atlas: "Atlas · strong male",
  bennett: "Bennett · modern British male",
  mira: "Mira · calm woman",
});
export const DEFAULT_VOICE_BY_TONE = Object.freeze({
  Supportive: "nova",
  Direct: "bennett",
  Strict: "atlas",
  Competitive: "atlas",
  Rude: "bennett",
});
export const ANSWER_DEPTHS = ["fast", "smart", "deep"];
export const SESSION_MINUTES = [12, 20, 30, 45, 60];
export const ACTIONS = [
  "SAY_NOTHING",
  "CHECK_IN",
  "RECOVER_MISSED_SESSION",
  "OFFER_PLAN_B",
  "OFFER_MINIMUM_DOSE",
  "MOVE_SESSION",
  "RECOMMEND_REST",
  "ASK_FOR_BLOCKER",
  "CELEBRATE",
];
export const TRAINER_API = "https://symbioai.dev/api/fitcoach-chat-v3";
export const SPEECH_API = "https://symbioai.dev/api/fitcoach-speech-v2";
export const NUTRITION_API = "https://symbioai.dev/api/fitcoach-nutrition-v1";

export const MODEL_MODES = Object.freeze({
  fast: { label: "Quick", detail: "Short answer, same safety rules" },
  smart: { label: "Balanced", detail: "Useful context and one clear move" },
  deep: { label: "Deep", detail: "More explanation, no extra authority" },
});
