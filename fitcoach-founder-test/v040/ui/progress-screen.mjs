import { convertWeight, escapeHtml, formatDate, localDateKey, sessionVolume } from "../core/utils.mjs";
import { sessionsThisWeek } from "../domain/decisions.mjs";
import { dayTotals, normalizeTargets } from "../domain/nutrition.mjs";
import { estimateOneRepMax } from "../domain/strength-tools.mjs";
import { isValidCompletedSet } from "../domain/workouts.mjs";
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
  state.sessions.forEach(session => session.exercises?.forEach(exercise => exercise.sets?.filter(isValidCompletedSet).forEach(set => {
    const weight = convertWeight(set.weight, set.unit || exercise.units || session.units || displayUnit, displayUnit);
    const reps = Number(set.reps) || 0;
    const estimate = estimateOneRepMax(weight, reps);
    if (!Number.isFinite(estimate)) return;
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

function progressStudio(state, communityPreviews = new Map()) {
  const drafts = [...(state.socialDrafts || [])].reverse();
  return `<section class="progress-studio card"><header class="section-heading"><div><span class="eyebrow">PROGRESS STUDIO</span><h2>Your photos, your timeline</h2></div><span class="soft-badge">Private by default</span></header><p>Capture a visual check-in and add the context that numbers miss. Photo previews stay in this session; your note is saved locally.</p><div class="progress-studio-actions">${button({label:"Add progress photo",action:"open-community-draft",variant:"primary",iconName:"camera"})}<span>${icon("info")}You control every private check-in.</span></div>${drafts.length ? `<div class="progress-draft-grid">${drafts.map(item => {const preview=communityPreviews.get(item.id);return `<article>${preview ? `<img src="${escapeHtml(preview)}" alt="Local progress draft preview">` : `<div class="progress-photo-placeholder">${icon("camera")}<span>Photo preview ended</span></div>`}<div><small>${escapeHtml(formatDate(item.createdAt))} · ${escapeHtml(item.visibility === "private" ? "Only me" : "Private note")}</small><b>${escapeHtml(item.caption || "Progress check-in")}</b><button data-action="delete-community-draft" data-value="${escapeHtml(item.id)}">Delete check-in</button></div></article>`;}).join("")}</div>` : `<div class="progress-studio-empty">${icon("camera")}<span><b>No progress photos yet</b><small>Your first private check-in will appear here.</small></span></div>`}</section>`;
}

function weeklyEvidenceCard(evidence) {
  if (!evidence) return "";
  const current = evidence.current;
  return `<section class="weekly-evidence card mode-${escapeHtml(evidence.copy.mode)}"><header><div><span class="eyebrow">WEEKLY PROOF</span><h2>${escapeHtml(evidence.copy.title)}</h2></div><span class="evidence-score"><b>${current.completedSessions}</b><small>of ${evidence.scheduleTarget} sessions</small></span></header><p>${escapeHtml(evidence.copy.body)}</p><div class="weekly-evidence-metrics"><span><b>${current.validSets}</b><small>valid sets</small></span><span><b>${Math.round(current.volume).toLocaleString()}</b><small>${escapeHtml(evidence.displayUnit)} volume</small></span><span><b>${current.verifiedPersonalRecords}</b><small>verified PRs</small></span><span><b>${current.confirmedNutritionDays}</b><small>food-log days</small></span></div><footer>${icon("progress")}<span>${escapeHtml(evidence.copy.comparison)}</span></footer></section>`;
}

export function renderProgressScreen({state,now=new Date(),communityPreviews=new Map(),weeklyEvidence=null}) {
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
  if (!pastSessions.length) {
    return `<div class="page progress-page progress-first-day">
      <section class="progress-empty-hero teal-panel"><div class="first-proof-mark" aria-hidden="true">${icon("progress")}</div><span class="eyebrow">YOUR BASELINE</span><h1>Your baseline starts with one session.</h1><p>Complete a real workout once. From there, FitCoach can show trends, consistency, and useful next targets.</p><div class="baseline-path" aria-label="Your first three progress milestones"><span class="active"><i>01</i><b>Log</b></span><em></em><span><i>02</i><b>See trends</b></span><em></em><span><i>03</i><b>Progress</b></span></div>${button({label:"Choose your first workout",action:"route",value:"train",variant:"primary",iconName:"play"})}</section>
      <section class="first-progress-guide card"><header class="section-heading"><div><span class="eyebrow">WHAT UNLOCKS NEXT</span><h2>Your proof, in order</h2></div></header><div><article><span>01</span><b>Session history<small>Completed sets create the baseline.</small></b></article><article><span>02</span><b>Strength trends<small>Loads and reps gain real context.</small></b></article><article><span>03</span><b>Next target<small>Review a change before it becomes your plan.</small></b></article></div></section>
      ${progressStudio(state, communityPreviews)}
      ${nutritionTrendCard(state, now)}
    </div>`;
  }
  return `<div class="page progress-page">
    <section class="progress-hero teal-panel"><div><span class="eyebrow">PROOF OF THE WORK</span><h1>${pastSessions.length ? `${pastSessions.length} completed session${pastSessions.length === 1 ? "" : "s"}` : "Your first rep starts the record"}</h1><p>${pastSessions.length ? `This device has ${Math.round(total).toLocaleString()} ${escapeHtml(state.settings.units)} of logged volume after converting historical units. No sample workouts are mixed in.` : "Every metric remains empty until you complete a real saved workout."}</p></div><div class="adherence-score"><strong>${Math.min(100,Math.round((week/target)*100))}</strong><span>%</span><small>weekly target</small></div></section>
    ${weeklyEvidenceCard(weeklyEvidence)}
    <section class="progress-grid"><article class="card trend-card"><header class="section-heading"><div><span class="eyebrow">VOLUME TREND</span><h2>Recent session load</h2></div><span class="soft-badge">Last ${volumes.length}</span></header>${volumes.length ? `<svg class="volume-chart" viewBox="0 0 360 150" role="img" aria-label="Training volume across ${volumes.length} sessions"><path d="M0 35H360M0 80H360M0 125H360"/><polyline points="${points(volumes)}"/></svg><p>Sum of logged weight × repetitions. Bodyweight-only sets contribute zero until a separate load method is reviewed.</p>` : emptyState("No volume trend yet","Complete a weighted workout to create the first point.")}</article><article class="card monthly-card"><span class="eyebrow">FOUR-WEEK ADHERENCE</span><div class="monthly-bars">${recentFourWeeks.map((count,index) => `<span><i style="height:${Math.max(4,Math.min(100,(count/target)*100))}%"></i><small>W${index+1}</small><b>${count}</b></span>`).join("")}</div><p>Completed sessions divided by your saved weekly target; adapted sessions still count when actually logged.</p></article></section>
    <section class="progress-grid"><article class="card calendar-card"><header class="section-heading"><div><span class="eyebrow">LAST 35 DAYS</span><h2>Training calendar</h2></div><span class="soft-badge">Neutral continuity</span></header><div class="training-calendar" aria-label="Workout calendar">${calendar(state,now)}</div><p>Filled dates are completed workouts—not app opens or guilt-based streaks.</p></article><article class="card balance-card"><span class="eyebrow">MUSCLE-LOAD BALANCE</span>${focus.size ? `<div class="balance-list">${[...focus.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7).map(([muscle,count]) => `<span><b>${escapeHtml(muscle)}</b><i><em style="width:${Math.round((count/maxFocus)*100)}%"></em></i><small>${count} sets</small></span>`).join("")}</div><p>Completed set count by intended primary muscle. This is not recovery sensing.</p>` : emptyState("Nothing to balance yet","Muscle-load labels appear after completed exercise sets.")}</article></section>
    <section class="progress-grid"><article class="card bests-card"><header class="section-heading"><div><span class="eyebrow">ESTIMATED STRENGTH</span><h2>Best logged work</h2></div><span class="soft-badge">Epley estimate</span></header>${allBests.length ? `<div class="best-list">${allBests.map((item,index) => `<span><i>${String(index+1).padStart(2,"0")}</i><b>${escapeHtml(item.name)}<small>${item.weight}${escapeHtml(state.settings.units)} × ${item.reps} · ${formatDate(item.at)}</small></b><strong>${item.estimate}<small>est. 1RM</small></strong></span>`).join("")}</div><p>Estimate = load × (1 + reps ÷ 30). Historical set units are converted for this estimate; it is a rough training metric, not a tested maximum.</p>` : emptyState("No defensible estimate","Log a set with both weight and repetitions to create one.")}</article><article class="card history-card"><header class="section-heading"><div><span class="eyebrow">SESSION HISTORY</span><h2>Recent workouts</h2></div></header>${pastSessions.length ? `<div>${[...pastSessions].reverse().slice(0,8).map(session => sessionHistoryRow(session,state.settings.units)).join("")}</div>` : emptyState("History starts empty","Your first completed workout will appear here.","route","Choose a workout")}</article></section>
    ${nutritionTrendCard(state, now)}
    ${progressStudio(state, communityPreviews)}
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
    ${logged.length ? `<div class="monthly-bars nutrition-bars">${days.map(day => `<span><i style="height:${Math.max(4, Math.min(100, (day.totals.calories / max) * 100))}%"></i><small>${escapeHtml(day.key.slice(8))}</small><b>${day.totals.calories ? Math.round(day.totals.calories / 100) / 10 + "k" : "—"}</b></span>`).join("")}</div><p>Confirmed calories per day against your ${targets.calories.toLocaleString()} kcal target line. Draft estimates contribute exactly zero here.</p>` : `<p>Once you confirm food entries in the diary, a 7-day view appears. Nothing is added until you log it.</p>`}
    ${button({ label: "Open nutrition diary", action: "open-nutrition", variant: "secondary" })}
  </section>`;
}
