import { convertWeight, escapeHtml, formatDate, localDateKey, sessionVolume } from "../core/utils.mjs";
import { sessionsThisWeek } from "../domain/decisions.mjs";
import { dayTotals, normalizeTargets } from "../domain/nutrition.mjs";
import { button, emptyState, icon, sessionHistoryRow } from "./components.mjs";

function points(values, width = 360, height = 150) {
  if (!values.length) return "";
  const maximum = Math.max(...values, 1);
  return values.map((value,index) => `${values.length === 1 ? width/2 : (index/(values.length-1))*width},${height-18-(value/maximum)*(height-42)}`).join(" ");
}

function calendar(state, now = new Date()) {
  const dates = new Set(state.sessions.filter(session => new Date(session.completedAt || session.date) <= now).map(session => new Date(session.completedAt || session.date).toLocaleDateString("en-CA")));
  return Array.from({length:35},(_,index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (34-index));
    const key = day.toLocaleDateString("en-CA");
    return `<span class="calendar-cell ${dates.has(key) ? "active" : ""} ${index === 34 ? "today" : ""}" title="${escapeHtml(key)}${dates.has(key) ? " · workout completed" : ""}"><small>${day.getDate()}</small></span>`;
  }).join("");
}

function bests(state, displayUnit) {
  const map = new Map();
  state.sessions.forEach(session => session.exercises?.forEach(exercise => exercise.sets?.forEach(set => {
    const weight = convertWeight(set.weight, set.unit || exercise.units || session.units || displayUnit, displayUnit);
    const reps = Number(set.reps) || 0;
    if (!weight || !reps) return;
    const estimate = Math.round(weight * (1 + reps/30));
    const key = exercise.exerciseId || exercise.snapshot?.id;
    const current = map.get(key);
    if (!current || estimate > current.estimate) map.set(key,{name:exercise.snapshot?.name || key,weight,reps,estimate,at:session.completedAt});
  })));
  return [...map.values()].sort((a,b) => b.estimate-a.estimate).slice(0,5);
}

function neutralStreak(state) {
  const dates = [...new Set(state.sessions.map(session => new Date(session.completedAt || session.date).toLocaleDateString("en-CA")))].sort().reverse();
  if (!dates.length) return 0;
  let count = 1;
  for (let index=1; index<dates.length; index+=1) {
    const previous = new Date(`${dates[index-1]}T12:00:00`);
    const current = new Date(`${dates[index]}T12:00:00`);
    const gap = Math.round((previous-current)/86_400_000);
    if (gap <= 2) count += 1; else break;
  }
  return count;
}

export function renderProgressScreen({state,now=new Date()}) {
  const week = sessionsThisWeek(state,now).length;
  const target = Math.max(1,Number(state.profile.days)||3);
  const pastSessions = [...state.sessions].filter(session => new Date(session.completedAt || session.date) <= now).sort((left,right)=>new Date(left.completedAt||left.date)-new Date(right.completedAt||right.date));
  const volumes = pastSessions.slice(-10).map(session => sessionVolume(session,state.settings.units));
  const total = pastSessions.reduce((sum,session) => sum+sessionVolume(session,state.settings.units),0);
  const allBests = bests({ ...state, sessions: pastSessions }, state.settings.units);
  const focus = new Map();
  pastSessions.forEach(session => session.exercises?.forEach(exercise => (exercise.snapshot?.primaryMuscles || []).forEach(muscle => focus.set(muscle,(focus.get(muscle)||0)+(exercise.sets?.length||0)))));
  const maxFocus = Math.max(...focus.values(),1);
  const recentFourWeeks = Array.from({length:4},(_,offset) => {
    const end = new Date(now); end.setDate(now.getDate()-offset*7+1); end.setHours(0,0,0,0);
    const start = new Date(end); start.setDate(end.getDate()-7);
    return pastSessions.filter(session => {const date=new Date(session.completedAt||session.date);return date>=start&&date<end;}).length;
  }).reverse();
  return `<div class="page progress-page">
    <section class="progress-hero teal-panel"><div><span class="eyebrow">PROOF OF THE WORK</span><h1>${pastSessions.length ? `${pastSessions.length} completed session${pastSessions.length === 1 ? "" : "s"}` : "Your first rep starts the record"}</h1><p>${pastSessions.length ? `This device has ${Math.round(total).toLocaleString()} ${escapeHtml(state.settings.units)} of logged volume after converting historical units. No sample workouts are mixed in.` : "Every metric remains empty until you complete a real saved workout."}</p></div><div class="adherence-score"><strong>${Math.min(100,Math.round((week/target)*100))}</strong><span>%</span><small>weekly target</small></div></section>
    <section class="metric-grid"><article><small>THIS WEEK</small><b>${week}/${target}</b><span>sessions</span></article><article><small>TOTAL VOLUME</small><b>${total ? Math.round(total).toLocaleString() : "—"}</b><span>${escapeHtml(state.settings.units)} moved</span></article><article><small>CONTINUITY</small><b>${neutralStreak(state) || "—"}</b><span>${neutralStreak(state) ? "nearby training days" : "no record yet"}</span></article><article><small>BEST LIFTS</small><b>${allBests.length || "—"}</b><span>with load + reps</span></article></section>
    <section class="progress-grid"><article class="card trend-card"><header class="section-heading"><div><span class="eyebrow">VOLUME TREND</span><h2>Recent session load</h2></div><span class="soft-badge">Last ${volumes.length}</span></header>${volumes.length ? `<svg class="volume-chart" viewBox="0 0 360 150" role="img" aria-label="Training volume across ${volumes.length} sessions"><path d="M0 35H360M0 80H360M0 125H360"/><polyline points="${points(volumes)}"/></svg><p>Sum of logged weight × repetitions. Bodyweight-only sets contribute zero until a separate load method is reviewed.</p>` : emptyState("No volume trend yet","Complete a weighted workout to create the first point.")}</article><article class="card monthly-card"><span class="eyebrow">FOUR-WEEK ADHERENCE</span><div class="monthly-bars">${recentFourWeeks.map((count,index) => `<span><i style="height:${Math.max(4,Math.min(100,(count/target)*100))}%"></i><small>W${index+1}</small><b>${count}</b></span>`).join("")}</div><p>Completed sessions divided by your saved weekly target; adapted sessions still count when actually logged.</p></article></section>
    <section class="progress-grid"><article class="card calendar-card"><header class="section-heading"><div><span class="eyebrow">LAST 35 DAYS</span><h2>Training calendar</h2></div><span class="soft-badge">Neutral continuity</span></header><div class="training-calendar" aria-label="Workout calendar">${calendar(state,now)}</div><p>Filled dates are completed workouts—not app opens or guilt-based streaks.</p></article><article class="card balance-card"><span class="eyebrow">MUSCLE-LOAD BALANCE</span>${focus.size ? `<div class="balance-list">${[...focus.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7).map(([muscle,count]) => `<span><b>${escapeHtml(muscle)}</b><i><em style="width:${Math.round((count/maxFocus)*100)}%"></em></i><small>${count} sets</small></span>`).join("")}</div><p>Completed set count by intended primary muscle. This is not recovery sensing.</p>` : emptyState("Nothing to balance yet","Muscle-load labels appear after completed exercise sets.")}</article></section>
    <section class="progress-grid"><article class="card bests-card"><header class="section-heading"><div><span class="eyebrow">ESTIMATED STRENGTH</span><h2>Best logged work</h2></div><span class="soft-badge">Epley estimate</span></header>${allBests.length ? `<div class="best-list">${allBests.map((item,index) => `<span><i>${String(index+1).padStart(2,"0")}</i><b>${escapeHtml(item.name)}<small>${item.weight}${escapeHtml(state.settings.units)} × ${item.reps} · ${formatDate(item.at)}</small></b><strong>${item.estimate}<small>est. 1RM</small></strong></span>`).join("")}</div><p>Estimate = load × (1 + reps ÷ 30). Historical set units are converted for this estimate; it is a rough training metric, not a tested maximum.</p>` : emptyState("No defensible estimate","Log a set with both weight and repetitions to create one.")}</article><article class="card history-card"><header class="section-heading"><div><span class="eyebrow">SESSION HISTORY</span><h2>Recent workouts</h2></div></header>${pastSessions.length ? `<div>${[...pastSessions].reverse().slice(0,8).map(session => sessionHistoryRow(session,state.settings.units)).join("")}</div>` : emptyState("History starts empty","FitCoach does not fabricate demo workouts after onboarding.","route","Choose a workout")}</article></section>
    ${nutritionTrendCard(state, now)}
  </div>`;
}

function nutritionTrendCard(state, now = new Date()) {
  const targets = normalizeTargets(state.nutrition?.targets);
  const days = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (6 - offset));
    const key = localDateKey(day);
    return { key, totals: dayTotals(state.nutrition?.days?.[key]) };
  });
  const logged = days.filter(day => day.totals.calories > 0);
  const average = logged.length ? Math.round(logged.reduce((sum, day) => sum + day.totals.calories, 0) / logged.length) : 0;
  const max = Math.max(targets.calories, ...days.map(day => day.totals.calories), 1);
  return `<section class="card nutrition-trend-card"><header class="section-heading"><div><span class="eyebrow">NUTRITION · LAST 7 DAYS</span><h2>${logged.length ? `${average.toLocaleString()} kcal average on logged days` : "No confirmed nutrition yet"}</h2></div><span class="soft-badge">Confirmed only</span></header>
    ${logged.length ? `<div class="monthly-bars nutrition-bars">${days.map(day => `<span><i style="height:${Math.max(4, Math.min(100, (day.totals.calories / max) * 100))}%"></i><small>${escapeHtml(day.key.slice(8))}</small><b>${day.totals.calories ? Math.round(day.totals.calories / 100) / 10 + "k" : "—"}</b></span>`).join("")}</div><p>Confirmed calories per day against your ${targets.calories.toLocaleString()} kcal target line. Draft estimates contribute exactly zero here.</p>` : `<p>Once you confirm food entries in the diary, a 7-day view appears. Nothing is fabricated for the demo.</p>`}
    ${button({ label: "Open nutrition diary", action: "open-nutrition", variant: "secondary" })}
  </section>`;
}
