import { deriveTrainerAction } from "./trainer-actions.mjs";
import { isPrivateTrainerInput, normalizeTrainerMessage } from "../services/trainer-client.mjs";

// Only complete, explicit UI commands and narrowly scoped app-help questions
// run locally. Training questions, negations, medical/sensitive text, and
// ambiguous phrases still use the existing trainer path and its safety checks.
const NAVIGATION = /^(?:please\s+)?(?:open|show(?:\s+me)?|pull\s+up|bring\s+up|take\s+me\s+to)\s+(?:(?:my|the|today['’]?s)\s+)?(?:workout|plan|progress|workout\s+history|nutrition|food\s+(?:diary|log)|nutrition\s+diary|voice\s+room)(?:\s+(?:for\s+today|please))?$/iu;
const RESUME = /^(?:please\s+)?(?:resume|return\s+to|take\s+me\s+back\s+to)\s+(?:(?:my|the)\s+)?(?:workout|session)$/iu;
const MINUTES = /^(?:i\s+(?:only\s+)?have\s+(?:12|20|30|45|60)\s+minutes?(?:\s+today)?|(?:please\s+)?make\s+(?:(?:my|the|today['’]?s)\s+)?workout\s+(?:12|20|30|45|60)\s+minutes?)$/iu;
const APP_HELP = /^(?:please\s+)?(?:what\s+can\s+you\s+(?:do|help\s+me\s+(?:do|with))(?:\s+(?:in|inside|within)\s+(?:fitcoach|this\s+app))?|how\s+can\s+you\s+help\s+me|what\s+are\s+your\s+capabilities|what\s+can\s+fitcoach\s+do|which\s+(?:fitcoach|app)\s+sections\s+can\s+you\s+open)$/iu;
const APP_SECTIONS = /^can\s+you\s+open\s+(?:my\s+)?workout,\s*(?:my\s+)?food\s+diary,\s*(?:my\s+)?progress,?\s+and\s+(?:my\s+)?exercise\s+guides$/iu;
const BRIEF_HELP = /^(?:please\s+)?(?:keep\s+it\s+(?:brief|concise)|answer\s+(?:briefly|concisely))$/iu;

function isAppHelpQuestion(text) {
  const parts = text.split(/[.!?]+/u).map(part => part.trim()).filter(Boolean);
  if (!APP_HELP.test(parts[0] || "") && !APP_SECTIONS.test(parts[0] || "")) return false;
  if (APP_HELP.test(parts[0]) && APP_SECTIONS.test(parts[1] || "")) parts.splice(1, 1);
  return parts.length === 1 || (parts.length === 2 && BRIEF_HELP.test(parts[1]));
}

export function contextualCoachMessage({ state, message, exercises }) {
  const text = normalizeTrainerMessage(message);
  if (isPrivateTrainerInput(text)) return text;
  const action = deriveTrainerAction({ state, message: text, exercises });
  if (action?.kind !== "open_exercise") return text;
  const exercise = exercises?.find(item => item.id === action.value);
  if (!exercise) return text;
  // Resolve a visible reference to a known catalogue name, never to raw sets,
  // notes, food entries, or extra profile fields. The original text stays in UI.
  return text.replace(/\b(?:this|(?:my\s+)?current)\s+(?:exercise|move)\b/giu, exercise.name);
}

function isGuideCommand(message, action, exercises) {
  if (action?.kind !== "open_exercise") return false;
  const name = message.replace(/^(?:please\s+)?(?:open|show(?:\s+me)?|pull\s+up)\s+(?:the\s+)?(?:guide\s+for\s+)?/iu, "").replace(/\s+guide$/iu, "");
  if (name === message) return false;
  if (/^(?:this|(?:my\s+)?current)\s+(?:exercise|move)$/iu.test(name)) return true;
  const exercise = exercises?.find(item => item.id === action.value);
  return [exercise?.name, ...(exercise?.aliases || [])].some(value => String(value || "").normalize("NFKC").toLowerCase() === name.toLowerCase());
}

export function localCoachCommand({ state, message, exercises }) {
  const text = normalizeTrainerMessage(message).replace(/[.!?]+$/u, "").trim();
  if (!text || isPrivateTrainerInput(text)) return null;
  if (isAppHelpQuestion(text)) {
    return Object.freeze({
      status: "ready",
      reply: "I can open your workout, today’s food diary, progress, and exercise guides. Try “Open my workout,” “Show my food diary,” or “Open Air Squat.” You can keep Voice Room active while using the app. Ask for a 20-minute workout to review an option; your plan changes only after approval. Food estimates stay drafts until you confirm them.",
      action: null,
      provider: "on-device",
      model: "fitcoach-tools-v1",
      speakAllowed: true,
      localCommand: true,
    });
  }
  const canonical = RESUME.test(text) ? "show my workout"
    : MINUTES.test(text) ? `make my workout ${text.match(/\b(?:12|20|30|45|60)\b/u)[0]} minutes`
    : text.replace(/^(?:please\s+)?(?:bring\s+up|pull\s+up|take\s+me\s+to)\s+/iu, "show ");
  const action = deriveTrainerAction({ state, message: canonical, exercises });
  if (!action || action.kind === "nutrition_draft") return null;
  if (!(NAVIGATION.test(text) || RESUME.test(text) || MINUTES.test(text) || isGuideCommand(text, action, exercises))) return null;
  const replies = {
    open_workout: state.activeWorkout ? "Your session is still in progress. Let’s pick up where you left off." : "Here’s your workout. You can review the movements before you start.",
    open_exercise: "Here’s the movement guide. You can watch the demonstration and check the setup.",
    open_progress: "Here’s your progress, based on the work you’ve actually logged.",
    open_nutrition: "Here’s today’s food diary. Review your confirmed entries and editable portions here.",
    open_voice: "Opening your voice room. You can keep talking while you use the app.",
    propose_minutes: `Here’s a ${action.value}-minute option to review. Your current plan stays unchanged until you approve it.`,
  };
  if (!replies[action.kind]) return null;
  return Object.freeze({ status: "ready", reply: replies[action.kind], action, provider: "on-device", model: "fitcoach-tools-v1", speakAllowed: true, localCommand: true });
}
