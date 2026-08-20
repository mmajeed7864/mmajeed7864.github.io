import { ACTIONS } from "../core/constants.mjs";
import { clamp, localDateKey, uid } from "../core/utils.mjs";

export function sessionsThisWeek(state, now = new Date()) {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return (state.sessions || []).filter(session => {
    const date = new Date(session.completedAt || session.date);
    return date >= monday && date <= now;
  });
}

export function daysSinceLastSession(state, now = new Date()) {
  const last = [...(state.sessions || [])]
    .filter(session => new Date(session.completedAt || session.date) <= now)
    .sort((left, right) => new Date(left.completedAt || left.date) - new Date(right.completedAt || right.date))
    .at(-1);
  if (!last) return 999;
  const then = new Date(last.completedAt || last.date).getTime();
  return Number.isFinite(then) ? Math.max(0, Math.floor((now.getTime() - then) / 86_400_000)) : 999;
}

export function readiness(state, now = new Date()) {
  const completed = sessionsThisWeek(state, now).length;
  const target = Math.max(1, Number(state.profile.days) || 3);
  const energy = clamp(Number(state.profile.energy) || 3, 1, 5);
  const recency = daysSinceLastSession(state, now);
  const score = clamp(
    energy * 14
      + Math.min(22, Math.round((completed / target) * 22))
      + (recency === 0 ? 12 : recency === 1 ? 10 : recency === 2 ? 7 : recency === 3 ? 4 : 1),
    24,
    100,
  );
  return { score, label: score >= 82 ? "Primed" : score >= 65 ? "Ready" : score >= 48 ? "Adjust" : "Recover" };
}

function actionCopy(type, state, now) {
  const completed = sessionsThisWeek(state, now).length;
  const target = Math.max(1, Number(state.profile.days) || 3);
  const last = state.sessions?.at(-1);
  const copy = {
    SAY_NOTHING: {
      title: "The plan is already doing its job",
      message: "No interruption is needed. Your next session is ready when you are.",
      why: "You trained recently and no verified constraint needs a new action.",
      primary: { label: "View workout", kind: "route", value: "train" },
    },
    CHECK_IN: {
      title: "Start with one honest session",
      message: `You chose ${target} days each week. The first useful step is to log one session, not chase a perfect start.`,
      why: "Your plan exists, but this device has no completed session yet.",
      primary: { label: "Start Plan A", kind: "start_plan", value: "A" },
      secondary: { label: "See Minimum Dose", kind: "start_plan", value: "MIN" },
    },
    RECOVER_MISSED_SESSION: {
      title: "Recover the week—do not restart it",
      message: `It has been a few days since ${last?.planLabel || "your last session"}. Use the smallest version that keeps the week moving.`,
      why: "Your recent workout history shows a gap; this is a recovery option, not a judgment.",
      primary: { label: "Start Minimum Dose", kind: "start_plan", value: "MIN" },
      secondary: { label: "Review schedule", kind: "proposal", value: "schedule" },
    },
    OFFER_PLAN_B: {
      title: "Use the version that fits today",
      message: `Your location is set to ${state.profile.location}. Plan B keeps the training intent with compatible equipment.`,
      why: "The alternative comes from the location and equipment saved on this device.",
      primary: { label: "Open Plan B", kind: "start_plan", value: "B" },
      secondary: { label: "Keep Plan A", kind: "route", value: "train" },
    },
    OFFER_MINIMUM_DOSE: {
      title: "Lower the size, not the standard",
      message: "Energy is low today. A 12-minute version can preserve the routine without pretending recovery does not matter.",
      why: "This uses only your current energy check-in and a pre-authored minimum plan.",
      primary: { label: "Start 12 minutes", kind: "start_plan", value: "MIN" },
      secondary: { label: "Choose recovery", kind: "acknowledge", value: "recovery" },
    },
    MOVE_SESSION: {
      title: "Move the session before it becomes a miss",
      message: `Time is your saved blocker and ${Math.max(0, target - completed)} session${target - completed === 1 ? "" : "s"} remain this week.`,
      why: "The proposal uses your weekly target and saved time constraint; nothing changes before approval.",
      primary: { label: "Review move", kind: "proposal", value: "schedule" },
      secondary: { label: "Use Minimum Dose", kind: "start_plan", value: "MIN" },
    },
    RECOMMEND_REST: {
      title: "Recovery is a valid training choice",
      message: "Your self-reported energy is at the bottom of its range. Choose rest or a light option without turning that into a character judgment.",
      why: "This is a non-clinical response to your explicit energy check-in, not an injury or health inference.",
      primary: { label: "Acknowledge recovery", kind: "acknowledge", value: "recovery" },
      secondary: { label: "View light option", kind: "proposal", value: "light" },
    },
    ASK_FOR_BLOCKER: {
      title: "What is actually getting in the way?",
      message: "The pattern changed, but there is not enough verified context to choose a fix.",
      why: "A repeated gap exists without a specific current constraint, so FitCoach asks instead of guessing.",
      primary: { label: "Tell Coach", kind: "route", value: "coach" },
    },
    CELEBRATE: {
      title: "This work is becoming a pattern",
      message: `${state.sessions.length} completed sessions is a real training milestone—not an app-opening streak.`,
      why: "The milestone comes only from completed workout receipts stored on this device.",
      primary: { label: "View progress", kind: "route", value: "progress" },
    },
  };
  return copy[type];
}

export function selectAction(state, now = new Date()) {
  const completed = sessionsThisWeek(state, now).length;
  const target = Math.max(1, Number(state.profile.days) || 3);
  const since = daysSinceLastSession(state, now);
  const energy = Number(state.profile.energy) || 3;
  if (!state.sessions.length) return "CHECK_IN";
  if (energy <= 1) return "RECOMMEND_REST";
  if (since >= 3 && state.profile.blocker === "uncertainty") return "ASK_FOR_BLOCKER";
  if (since >= 3) return "RECOVER_MISSED_SESSION";
  if (energy === 2) return "OFFER_MINIMUM_DOSE";
  if (state.profile.blocker === "time" && completed < target) return "MOVE_SESSION";
  if (state.profile.location !== "gym" || state.profile.equipment !== "full gym") return "OFFER_PLAN_B";
  if ([3, 5, 10, 20].includes(state.sessions.length)) return "CELEBRATE";
  return "SAY_NOTHING";
}

export function computeDecision(state, now = new Date()) {
  const today = localDateKey(now);
  const existing = [...(state.decisions || [])].reverse().find(item => item.date === today && ACTIONS.includes(item.type));
  if (existing) return existing;
  const type = selectAction(state, now);
  return {
    id: uid("decision"),
    type,
    date: today,
    createdAt: now.toISOString(),
    outcome: null,
    ...actionCopy(type, state, now),
  };
}
