import {
  ACTIONS,
  ANSWER_DEPTHS,
  BUILD,
  TRAINER_API,
} from "../core/constants.mjs";
import { clamp, slug, uid } from "../core/utils.mjs";
import { daysSinceLastSession, journeyStage, sessionsThisWeek } from "../domain/decisions.mjs";

export const PRIVATE_INPUT_PATTERN = /\b(?:(?:api[_ -]?key|password|secret|token)\s*(?:is|[:=])\s*\S+|bearer\s+(?:sk-)?[a-z0-9._~+/=-]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}|medicat\w*|prescription|dosage?|\d+\s?mg\b|diagnos\w*|pregnan\w*|eating\s+disorder)\b/i;
const AGE_WORD = "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\\s](?:one|two|three|four|five|six|seven|eight|nine))?";
const BODY_DATA_PATTERN = new RegExp(
  `\\b(?:` +
    `(?:i\\s+weigh|my\\s+(?:body\\s+)?weight(?:\\s+(?:is|measures?))?|weight\\s*(?:(?:is|measures?)\\s*|[:=]\\s*)?)\\s*\\d+(?:\\.\\d+)?(?:\\s*(?:lb|lbs|pounds?|kg|kilograms?|st|stone))?` +
    `|i\\s*(?:am|['’]m)\\s*\\d+(?:\\.\\d+)?\\s*(?:lb|lbs|pounds?|kg|kilograms?|st|stone)` +
    `|i\\s*(?:am|['’]m)\\s*\\d+(?:\\.\\d+)?\\s*(?:ft|feet|foot|in|inch|inches|cm|centimeters?)\\s+tall` +
    `|(?:my\\s+(?:height|waist|hips?|chest|thighs?|biceps?|neck|inseam)\\s*(?:is|measures?|[:=])?|(?:height|waist|hips?|chest|thighs?|biceps?|neck|inseam)\\s*(?:is|measures?|[:=]))\\s*\\d+(?:\\.\\d+)?(?:\\s*(?:ft|feet|foot|in|inch|inches|cm|centimeters?))?` +
    `|(?:height|waist|hips?|chest|thighs?|biceps?|neck|inseam)\\s*\\d+(?:\\.\\d+)?\\s*(?:ft|feet|foot|in|inch|inches|cm|centimeters?)` +
    `|body\\s*fat\\s*(?:is|[:=])?\\s*\\d+(?:\\.\\d+)?(?:\\s*%)?` +
    `|(?:my\\s+age\\s*(?:is|[:=])?|age\\s*[:=])\\s*(?:\\d{1,3}|${AGE_WORD})` +
    `|i\\s*(?:am|['’]m)\\s*(?:\\d{1,3}|${AGE_WORD})(?:\\s*(?:years?|yrs?)(?:\\s*old)?)?(?=\\s*(?:$|[.!?,;]|\\b(?:and|but)\\b))` +
  `)(?:\\b|$)`,
  "i",
);
const STANDALONE_BODY_WEIGHT_PATTERN = /^\s*\d+(?:\.\d+)?\s*(?:lb|lbs|pounds?|kg|kilograms?|st|stone)\s*$/i;

const ephemeralSessionIds = new WeakMap();
let fallbackSessionId = null;

const BROKEN_REPLY = [
  /^let(?:'|’)s make the next action specific\.?$/i,
  /^give me the specific decision you want help with/i,
  /^what specific decision do you want help with/i,
  /^please provide more details\.?$/i,
  /^could you be more specific\??$/i,
];

export function isPrivateTrainerInput(value) {
  const normalized = String(value || "").normalize("NFKC");
  return PRIVATE_INPUT_PATTERN.test(normalized) || BODY_DATA_PATTERN.test(normalized) || STANDALONE_BODY_WEIGHT_PATTERN.test(normalized);
}

export function normalizeTrainerMessage(value) {
  return String(value || "").normalize("NFKC").trim().slice(0, 2_000);
}

export function isUsableTrainerReply(value) {
  const reply = String(value || "").trim();
  return Boolean(reply) && reply.length <= 4_000 && !BROKEN_REPLY.some(pattern => pattern.test(reply));
}

function sessionId(storage) {
  const owner = storage && (typeof storage === "object" || typeof storage === "function") ? storage : null;
  if (owner) {
    let value = ephemeralSessionIds.get(owner);
    if (!value) {
      value = uid("session").replace(/[^a-zA-Z0-9_-]/g, "");
      ephemeralSessionIds.set(owner, value);
    }
    return value;
  }
  fallbackSessionId ||= uid("session").replace(/[^a-zA-Z0-9_-]/g, "");
  return fallbackSessionId;
}

export function resetTrainerSession(storage = globalThis.localStorage) {
  const owner = storage && (typeof storage === "object" || typeof storage === "function") ? storage : null;
  if (owner) ephemeralSessionIds.delete(owner);
  else fallbackSessionId = null;
}

function trainerStyle(state) {
  const value = String(state.profile?.tone || "Direct").toLowerCase();
  return ["supportive", "direct", "strict", "competitive", "rude"].includes(value) ? value : "direct";
}

function planCode(plan) {
  return plan?.id === "B" ? "plan_b" : plan?.id === "MIN" ? "minimum_dose" : "plan_a";
}

export function createTrainerPayload({ state, message, approvedAction, founder = "mo", storage = globalThis.localStorage, now = new Date() }) {
  const plan = state.activePlan;
  const target = clamp(Number(state.profile.days) || 3, 1, 14);
  const completed = clamp(sessionsThisWeek(state, now).length, 0, target);
  const exerciseCodes = [...new Set((plan?.exercises || []).map(item => slug(item.snapshot?.name || item.exerciseId).replaceAll("-", "_")).filter(Boolean))].slice(0, 12);
  const goalMap = {
    "build muscle": "build_muscle",
    "get stronger": "get_stronger",
    "lose fat": "lose_fat",
    "stay consistent": "stay_consistent",
  };
  const equipmentMap = {
    "full gym": "full_gym",
    "home gym": "home_gym",
    "dumbbells only": "dumbbells_only",
    bodyweight: "bodyweight",
  };
  const blockerMap = {
    time: "time",
    motivation: "motivation",
    "all-or-nothing": "all_or_nothing",
    uncertainty: "uncertainty",
  };
  return {
    message: normalizeTrainerMessage(message),
    session_id: `fitcoach-${sessionId(storage)}`,
    data_classification: "synthetic_low_sensitivity",
    style: trainerStyle(state),
    response_depth: ANSWER_DEPTHS.includes(state.settings?.coachMode) ? state.settings.coachMode : "smart",
    context: {
      goal_code: goalMap[state.profile.goal] || "stay_consistent",
      experience_code: ["beginner", "intermediate", "advanced"].includes(state.profile.experience) ? state.profile.experience : "intermediate",
      days_per_week: clamp(Number(state.profile.days) || 3, 1, 7),
      session_minutes: clamp(Number(state.profile.duration) || 45, 10, 120),
      equipment_code: equipmentMap[state.profile.equipment] || "bodyweight",
      blocker_code: blockerMap[state.profile.blocker] || "uncertainty",
      energy_1_to_5: clamp(Number(state.profile.energy) || 3, 1, 5),
      weekly_completed: completed,
      weekly_target: target,
      journey_stage: journeyStage(state, now),
      days_since_last_session: clamp(daysSinceLastSession(state, now), 0, 999),
      approved_action: ACTIONS.includes(approvedAction) ? approvedAction : "SAY_NOTHING",
      plan_code: planCode(plan),
      plan_minutes: clamp(Number(plan?.minutes) || 45, 10, 120),
      exercise_codes: exerciseCodes.length ? exerciseCodes : ["full_body_session"],
    },
    conversation: (state.chat || [])
      .filter(item => item?.providerEligible === true && item?.contractVersion === "fitcoach-chat-v3" && item?.text && !isPrivateTrainerInput(item.text))
      .slice(-6)
      .map(item => ({
        role: item.role === "coach" ? "assistant" : "user",
        content: String(item.text).slice(0, 800),
      })),
  };
}

export function createTrainerClient({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  endpoint = TRAINER_API,
  storage = globalThis.localStorage,
  timeoutMs = 12_000,
  clock = () => new Date(),
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

  return {
    resetSession() {
      resetTrainerSession(storage);
    },
    async requestTurn({ state, message, approvedAction, founder, signal }) {
      const normalized = normalizeTrainerMessage(message);
      if (!normalized) return { status: "invalid", reason: "empty" };
      if (isPrivateTrainerInput(normalized)) return { status: "private_block", reason: "private_input", persistable: false };

      const controller = new AbortController();
      let timedOut = false;
      const onAbort = () => controller.abort(signal?.reason);
      signal?.addEventListener?.("abort", onAbort, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort("timeout"); }, timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-FitCoach-Build": BUILD,
          },
          body: JSON.stringify(createTrainerPayload({ state, message: normalized, approvedAction, founder, storage, now: clock() })),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || !isUsableTrainerReply(payload.reply)) {
          return { status: "error", reason: payload.error || `HTTP_${response.status}`, retryable: response.status >= 500 || response.status === 429 };
        }
        if (payload.safety_intercepted) {
          return {
            status: "safety",
            reply: payload.reply,
            provider: payload.provider || "deterministic-safety",
            model: payload.model || "safety-boundary",
            speakAllowed: false,
            persistable: false,
            metadata: payload,
          };
        }
        return {
          status: "ready",
          reply: payload.reply,
          provider: payload.provider || "unknown",
          model: payload.model || "unknown",
          speakAllowed: payload.speak_allowed !== false,
          fallbackUsed: Boolean(payload.fallback_used),
          metadata: payload,
        };
      } catch (error) {
        return {
          status: "error",
          reason: timedOut ? "timeout" : signal?.aborted ? "aborted" : "network",
          retryable: !signal?.aborted,
          error,
        };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", onAbort);
      }
    },
  };
}
