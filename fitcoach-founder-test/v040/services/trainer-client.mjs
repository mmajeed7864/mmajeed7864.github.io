import {
  ACTIONS,
  ANSWER_DEPTHS,
  BUILD,
  TRAINER_API,
} from "../core/constants.mjs";
import { clamp, slug, uid } from "../core/utils.mjs";
import { daysSinceLastSession, journeyStage, sessionsThisWeek } from "../domain/decisions.mjs";

export const PRIVATE_INPUT_PATTERN = /\b(?:(?:api[_ -]?key|password|secret|token)\s*(?:is|[:=])\s*\S+|bearer\s+(?:sk-)?[a-z0-9._~+/=-]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}|medicat\w*|prescription|dosage?|\d+\s?mg\b|diagnos\w*|pregnan\w*|eating\s+disorder)\b/i;

const BROKEN_REPLY = [
  /^let(?:'|’)s make the next action specific\.?$/i,
  /^give me the specific decision you want help with/i,
  /^what specific decision do you want help with/i,
  /^please provide more details\.?$/i,
  /^could you be more specific\??$/i,
];

export function isPrivateTrainerInput(value) {
  return PRIVATE_INPUT_PATTERN.test(String(value || "").normalize("NFKC"));
}

export function normalizeTrainerMessage(value) {
  return String(value || "").normalize("NFKC").trim().slice(0, 2_000);
}

export function isUsableTrainerReply(value) {
  const reply = String(value || "").trim();
  return Boolean(reply) && reply.length <= 4_000 && !BROKEN_REPLY.some(pattern => pattern.test(reply));
}

function deviceId(storage) {
  const key = "fitcoach-device-id";
  let value = storage?.getItem?.(key);
  if (!value) {
    value = uid("device").replace(/[^a-zA-Z0-9_-]/g, "");
    storage?.setItem?.(key, value);
  }
  return value;
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
    session_id: `fitcoach-${founder}-${deviceId(storage)}`,
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
