import { localDateKey } from "../core/utils.mjs";
import { sessionsThisWeek } from "./decisions.mjs";
import { dayTotals, draftCount } from "./nutrition.mjs";

function sameLocalDay(value, now) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) && localDateKey(date) === localDateKey(now);
}

export function buildDailyBoard(state, plan, now = new Date()) {
  const todayKey = localDateKey(now);
  const weekDone = sessionsThisWeek(state, now).length;
  const target = Math.max(1, Number(state.profile?.days) || 3);
  const trainedToday = (state.sessions || []).some(session => sameLocalDay(session.completedAt || session.date, now));
  const activeWorkout = Boolean(state.activeWorkout);
  const day = state.nutrition?.days?.[todayKey];
  const nutritionTotals = dayTotals(day);
  const nutritionDrafts = draftCount(day);
  const confirmedFoods = (day?.entries || []).filter(entry => entry.status === "confirmed").length;
  const energyCheckedToday = sameLocalDay(state.profile?.energyCheckedAt, now);

  const training = activeWorkout
    ? { label: "Resume", status: "Session in progress", action: "resume-workout", value: "" }
    : trainedToday
      ? { label: "See receipt", status: "Training complete", action: "route", value: "progress" }
      : { label: "Start", status: `${plan?.minutes || state.profile?.duration || 45} min ready`, action: "start-workout", value: plan?.id || "" };

  const food = nutritionDrafts
    ? { label: "Review", status: `${nutritionDrafts} estimate${nutritionDrafts === 1 ? "" : "s"} to review`, action: "open-nutrition", value: "" }
    : confirmedFoods
      ? { label: "Open diary", status: `${confirmedFoods} item${confirmedFoods === 1 ? "" : "s"} confirmed`, action: "open-nutrition", value: "" }
      : { label: "Scan", status: "Ready when you eat", action: "nutrition-open-capture", value: "" };

  const coach = energyCheckedToday
    ? { label: "Talk", status: `${state.profile.energy}/5 energy saved`, action: "open-voice-room", value: "" }
    : { label: "Check in", status: "One minute with your coach", action: "open-voice-room", value: "" };

  return {
    todayKey,
    weekDone,
    target,
    trainedToday,
    activeWorkout,
    progressPercent: Math.min(100, Math.round((weekDone / target) * 100)),
    nutritionTotals,
    nutritionDrafts,
    confirmedFoods,
    energyCheckedToday,
    training,
    food,
    coach,
  };
}
