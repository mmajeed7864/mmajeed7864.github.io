function planLibrary(data) {
  const goal = data.profile.goal;
  const units = data.settings.units;
  const base = goal === "get stronger"
    ? [["Back squat",3,5],["Bench press",3,5],["Barbell row",3,6]]
    : goal === "lose fat"
      ? [["Goblet squat",3,10],["Dumbbell press",3,10],["Cable row",3,12],["Bike intervals",6,1]]
      : [["Incline press",3,8],["Romanian deadlift",3,8],["Lat pulldown",3,10],["Lateral raise",3,12]];

  const build = (id, label, minutes, items, why) => ({
    id, label, minutes, why,
    items: items.map(([name, sets, reps]) => ({
      name, sets, reps, weight: previousWeight(data, name) || defaultWeight(name, units)
    }))
  });

  return [
    build("A", "Plan A", Number(data.profile.duration), base, "Full session for your primary goal"),
    build("B", "Plan B", Math.max(20, Number(data.profile.duration) - 15), base.slice(0, 3).map(item => [item[0], Math.max(2, item[1] - 1), item[2]]), "Keeps the same movement pattern with less volume"),
    build("MIN", "Minimum Dose", 12, base.slice(0, 2).map(item => [item[0], 2, item[2]]), "The smallest session that keeps the commitment real")
  ];
}

function defaultWeight(name, units) {
  const lower = name.toLowerCase();
  const pounds = lower.includes("squat") ? 135 : lower.includes("bench") || lower.includes("press") ? 95 : lower.includes("deadlift") ? 155 : 70;
  return units === "kg" ? Math.round((pounds * 0.4536) / 2.5) * 2.5 : pounds;
}

function previousWeight(data, name) {
  for (const session of [...data.sessions].reverse()) {
    for (const exercise of session.exercises || []) {
      if (exercise.name === name) {
        const set = [...(exercise.sets || [])].reverse().find(item => item.done && Number(item.weight));
        if (set) return Number(set.weight);
      }
    }
  }
  return 0;
}

function weekStats(data) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  const sessions = data.sessions.filter(session => new Date(session.completedAt || session.date) >= start);
  const target = Number(data.profile.days) || 3;
  return { sessions, done: sessions.length, target, pct: clamp(Math.round((sessions.length / target) * 100), 0, 100) };
}

function daysSinceLastSession(data) {
  const last = data.sessions.at(-1);
  if (!last) return 999;
  return Math.max(0, Math.floor((Date.now() - new Date(last.completedAt || last.date).getTime()) / 86400000));
}

function computeDecision(data, forced = null) {
  if (forced && ACTIONS.includes(forced)) return decisionPayload(forced, data, true);
  const date = todayISO();
  const existing = [...data.decisions].reverse().find(item => item.date === date && !item.preview);
  if (existing) return existing;

  const week = weekStats(data);
  const daysSince = daysSinceLastSession(data);
  let type = "SAY_NOTHING";

  if (!data.sessions.length) type = "CHECK_IN";
  else if (Number(data.profile.energy) <= 1) type = "RECOMMEND_REST";
  else if (daysSince >= 3 && data.profile.blocker === "uncertainty") type = "ASK_FOR_BLOCKER";
  else if (daysSince >= 2) type = "RECOVER_MISSED_SESSION";
  else if (Number(data.profile.energy) === 2) type = "OFFER_MINIMUM_DOSE";
  else if (data.profile.blocker === "time" && week.done < week.target) type = "MOVE_SESSION";
  else if (data.profile.equipment !== "full gym") type = "OFFER_PLAN_B";
  else if ([3, 5, 10].includes(data.sessions.length)) type = "CELEBRATE";

  const decision = decisionPayload(type, data, false);
  data.decisions.push(decision);
  save(data);
  return decision;
}

