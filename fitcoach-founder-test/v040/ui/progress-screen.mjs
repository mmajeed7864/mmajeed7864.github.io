import { convertWeight, escapeHtml, formatDate, localDateKey, sessionVolume } from "../core/utils.mjs";
import { buildWeeklyEvidence } from "../domain/evidence.mjs";
import { dayTotals } from "../domain/nutrition.mjs";
import { estimateOneRepMax } from "../domain/strength-tools.mjs";
import { isValidCompletedSet } from "../domain/workouts.mjs";
import { button, icon } from "./components.mjs";

function sessionDate(session) {
  const value = session?.completedAt || session?.date;
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
function validSets(session) {
  return (session.exercises || []).reduce((total, exercise) => total + (exercise.sets || []).filter(isValidCompletedSet).length, 0);
}
function validVolume(session, unit) {
  return sessionVolume({ ...session, exercises: (session.exercises || []).map(exercise => ({ ...exercise, sets: (exercise.sets || []).filter(isValidCompletedSet) })) }, unit);
}
function number(value) { return Math.round(Number(value) || 0).toLocaleString(); }
function shortDate(date) { return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function monday(now) {
  const date = new Date(now);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  date.setHours(0, 0, 0, 0);
  return date;
}
function calendarDays(sessions, now, weeks = 1) {
  const dates = new Map();
  for (const session of sessions) {
    const date = sessionDate(session);
    if (!date || date > now) continue;
    const key = localDateKey(date);
    dates.set(key, (dates.get(key) || 0) + 1);
  }
  const start = monday(now);
  start.setDate(start.getDate() - (weeks - 1) * 7);
  const today = localDateKey(now);
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDateKey(date);
    return { date, key, count: dates.get(key) || 0, today: key === today, future: key > today };
  });
}
function dayLabel(day) {
  return escapeHtml(`${shortDate(day.date)}: ${day.count ? `${day.count} completed workout${day.count === 1 ? "" : "s"}` : day.future ? "upcoming" : "no workout logged"}`);
}
function dayClass(day) { return `${day.count ? "is-complete" : ""} ${day.today ? "is-today" : ""} ${day.future ? "is-future" : ""}`; }
function weekStrip(sessions, now) {
  return `<div class="progress-v6-week" aria-label="This week's completed workouts">${calendarDays(sessions, now).map(day => `<div class="progress-v6-day ${dayClass(day)}" role="img" aria-label="${dayLabel(day)}"><small aria-hidden="true">${escapeHtml(day.date.toLocaleDateString(undefined, { weekday: "narrow" }))}</small><span aria-hidden="true">${day.count ? icon("check") : day.date.getDate()}</span><i aria-hidden="true"></i></div>`).join("")}</div>`;
}
function disclosure(title, content) {
  return `<details class="progress-v6-details"><summary>${escapeHtml(title)}${icon("chevron")}</summary><div>${content}</div></details>`;
}
function heading(eyebrow, title, aside = "") {
  return `<header class="progress-v6-section-header"><div><span class="progress-v6-eyebrow">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2></div>${aside}</header>`;
}
function tag(text) { return `<span class="progress-v6-subtle-tag">${escapeHtml(text)}</span>`; }
function inlineEmpty(iconName, title, detail) {
  return `<div class="progress-v6-inline-empty">${icon(iconName)}<p>${escapeHtml(title)}<small>${escapeHtml(detail)}</small></p></div>`;
}
function bests(sessions, displayUnit) {
  const map = new Map();
  sessions.forEach(session => session.exercises?.forEach(exercise => exercise.sets?.filter(isValidCompletedSet).forEach(set => {
    const weight = convertWeight(set.weight, set.unit || exercise.units || session.units || displayUnit, displayUnit);
    const reps = Number(set.reps) || 0;
    const estimate = estimateOneRepMax(weight, reps);
    if (!Number.isFinite(estimate)) return;
    const key = exercise.exerciseId || exercise.snapshot?.id || exercise.snapshot?.name;
    if (!key) return;
    if (!map.has(key) || estimate > map.get(key).estimate) map.set(key, { name: exercise.snapshot?.name || key, weight, reps, estimate, at: session.completedAt || session.date });
  })));
  return [...map.values()].sort((left, right) => right.estimate - left.estimate).slice(0, 5);
}
function milestones(count) {
  const choices = [
    { count: 1, title: "First session", detail: "You made a start." },
    { count: 5, title: "Finding your rhythm", detail: "Five sessions in the books." },
    { count: 10, title: "Double digits", detail: "Ten sessions. Your work." },
    { count: 25, title: "Built with consistency", detail: "Twenty-five sessions logged." },
    { count: 50, title: "Fifty and counting", detail: "A record worth keeping." },
    { count: 100, title: "The hundred club", detail: "One hundred sessions logged." },
  ];
  const earned = choices.filter(item => item.count <= count);
  const next = choices.find(item => item.count > count);
  const visible = [...earned.slice(-2), ...(next ? [next] : [])];
  return `<section class="progress-v6-milestones">${heading("THE SMALL WINS ADD UP", "Your milestones")}<div class="progress-v6-milestone-grid" style="--milestone-columns:${visible.length}">${visible.map(item => {
    const reached = count >= item.count;
    return `<article class="progress-v6-milestone ${reached ? "is-earned" : "is-next"}"><div class="progress-v6-medal" aria-hidden="true">${icon(reached ? "check" : "train")}</div><span class="progress-v6-milestone-status">${reached ? "Earned" : "Up next"}</span><h3>${escapeHtml(item.title)}</h3><p>${reached ? escapeHtml(item.detail) : `${item.count - count} more session${item.count - count === 1 ? "" : "s"} to ${item.count}.`}</p></article>`;
  }).join("")}</div></section>`;
}
function weeklyHero(evidence, sessions, now) {
  const current = evidence.current;
  const fraction = Math.min(1, current.completedSessions / evidence.scheduleTarget);
  const title = current.completedSessions >= evidence.scheduleTarget ? "You showed up." : current.completedSessions ? "Keep building." : "A new week. Your next move.";
  return `<section class="progress-v6-hero"><header class="progress-v6-heading"><div><span class="progress-v6-eyebrow">PROGRESS / YOUR TRAINING JOURNAL</span><h1>The work.<br>The progress.</h1><p>${escapeHtml(shortDate(monday(now)))} – ${escapeHtml(shortDate(now))}<span> · This week</span></p></div><span class="progress-v7-journal-mark" aria-hidden="true">${icon("progress")}</span></header>
    <div class="progress-v7-week-spread"><div class="progress-v6-week-summary"><span class="progress-v7-status">${escapeHtml(title)}</span><div><span class="progress-v6-hero-number">${String(current.completedSessions).padStart(2, "0")}<small> / ${evidence.scheduleTarget}</small></span><p>workouts this week</p><span class="progress-v6-hero-note">${sessions.length} completed ${sessions.length === 1 ? "session" : "sessions"} overall</span></div><div class="progress-v7-week-meter" role="img" aria-label="${current.completedSessions} of ${evidence.scheduleTarget} planned weekly workouts completed"><i style="width:${Math.max(0,fraction)*100}%"></i></div></div>
    <div class="progress-v7-week-strip"><span class="progress-v6-eyebrow">ONE DAY AT A TIME</span>${weekStrip(sessions, now)}<p>Your own pace.<br>Your own record.</p></div></div>
    <div class="progress-v6-week-stats"><div>${icon("train")}<strong>${number(current.validSets)}</strong><span>completed sets</span></div><div>${icon("clock")}<strong>${number(current.durationMinutes)}<small> min</small></strong><span>training time</span></div><div>${icon("spark")}<strong>${number(current.verifiedPersonalRecords)}</strong><span>personal records</span></div></div>
    ${disclosure("About this week", `<p>${escapeHtml(evidence.copy.body)}</p><p>${escapeHtml(evidence.copy.comparison)}</p><p>Sessions are saved workouts. Sets and records require completed, valid entries. This week runs from Monday through today.</p>`)}
  </section>`;
}
function volumeCard(sessions, unit) {
  const recent = sessions.slice(-10);
  const volumes = recent.map(session => validVolume(session, unit));
  const total = sessions.reduce((sum, session) => sum + validVolume(session, unit), 0);
  const maximum = Math.max(...volumes, 1);
  return `<article class="progress-v6-panel progress-v6-volume">${heading("YOUR TRAINING LOAD", "Every set adds up", tag(`${recent.length} latest`))}<div class="progress-v6-chart-stat"><strong>${number(total)}</strong><span>${escapeHtml(unit)} lifted overall</span></div>
    ${volumes.some(value => value > 0) ? `<div class="progress-v6-volume-chart" role="img" aria-label="Logged training volume for the last ${volumes.length} workouts: ${volumes.map(value => `${number(value)} ${unit}`).join(", ")}">${volumes.map((value, index) => `<div class="progress-v6-volume-column"><span style="--bar-height:${value / maximum * 100}%" class="${index === volumes.length - 1 ? "is-latest" : ""}" title="${escapeHtml(shortDate(sessionDate(recent[index])))}: ${number(value)} ${escapeHtml(unit)}"></span><small>${index === 0 || index === volumes.length - 1 ? escapeHtml(shortDate(sessionDate(recent[index]))) : ""}</small></div>`).join("")}</div>` : inlineEmpty("train", "Bodyweight work counts, too.", "Added-weight sessions will build your load chart.")}
    ${disclosure("How load is calculated", `<p>Completed, valid sets only: added weight × repetitions, converted to ${escapeHtml(unit)}. Bodyweight-only sets count toward completed sets but add no external load. Different exercises and session lengths are not directly comparable strength tests.</p>`)}
  </article>`;
}
function weeklyAdherence(sessions, now, target) {
  const currentWeek = monday(now);
  const rows = Array.from({ length: 4 }, (_, index) => {
    const start = new Date(currentWeek);
    start.setDate(start.getDate() - (3 - index) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const count = sessions.filter(session => { const date = sessionDate(session); return date && date >= start && date < end && date <= now; }).length;
    const lastDay = new Date(end);
    lastDay.setDate(lastDay.getDate() - 1);
    const label = index === 3 ? "This week so far" : `${shortDate(start)} – ${shortDate(lastDay)}`;
    return `<div class="progress-v6-focus-row"><span>${escapeHtml(label)}</span><strong>${count}<small> / ${target}</small></strong><i aria-hidden="true"><em style="width:${Math.min(100, count / target * 100)}%"></em></i></div>`;
  }).join("");
  return disclosure("Four-week consistency", `<div class="progress-v6-focus-list">${rows}</div><p>Completed workouts / your current weekly target of ${target}. Weeks run Monday–Sunday; the current week is still in progress. Historical targets are not stored, so this uses your current target for all four weeks.</p>`);
}
function calendarCard(sessions, now, target) {
  const days = calendarDays(sessions, now, 4);
  const active = days.filter(day => day.count).length;
  return `<article class="progress-v6-panel progress-v6-calendar-panel">${heading("THE LAST FOUR WEEKS", "Your training rhythm", tag(`${active} active ${active === 1 ? "day" : "days"}`))}<div class="progress-v6-calendar"><div class="progress-v6-calendar-labels" aria-hidden="true">${["M", "T", "W", "T", "F", "S", "S"].map(day => `<span>${day}</span>`).join("")}</div><div class="progress-v6-calendar-days">${days.map(day => `<span class="${dayClass(day)}" role="img" aria-label="${dayLabel(day)}">${day.date.getDate()}${day.count ? '<i aria-hidden="true"></i>' : ""}</span>`).join("")}</div></div><div class="progress-v6-calendar-key"><span><i></i>Workout logged</span><small>Rest days belong here, too.</small></div>${weeklyAdherence(sessions, now, target)}</article>`;
}
function focusCard(sessions) {
  const focus = new Map();
  sessions.forEach(session => session.exercises?.forEach(exercise => {
    const count = (exercise.sets || []).filter(isValidCompletedSet).length;
    if (!count) return;
    [...new Set(exercise.snapshot?.primaryMuscles || [])].forEach(muscle => focus.set(muscle, (focus.get(muscle) || 0) + count));
  }));
  const maximum = Math.max(...focus.values(), 1);
  return `<article class="progress-v6-panel progress-v6-focus">${heading("COMPLETED SETS · ALL TIME", "Where the work went")}
    ${focus.size ? `<div class="progress-v6-focus-list">${[...focus.entries()].sort((left, right) => right[1] - left[1]).slice(0, 7).map(([muscle, count]) => `<div class="progress-v6-focus-row"><span>${escapeHtml(muscle)}</span><strong>${count}<small> ${count === 1 ? "set" : "sets"}</small></strong><i aria-hidden="true"><em style="width:${count / maximum * 100}%"></em></i></div>`).join("")}</div>` : inlineEmpty("train", "Your muscle focus appears here.", "Complete exercise sets to start the picture.")}
    ${disclosure("About muscle focus", "<p>Each valid, completed set is counted for its exercise’s intended primary muscles. A set can train more than one group. This describes training emphasis, not muscle recovery or live sensing.</p>")}
  </article>`;
}
function bestsCard(sessions, unit) {
  const items = bests(sessions, unit);
  return `<article class="progress-v6-panel progress-v6-bests">${heading("YOUR STRENGTH BASELINE", "Best logged work")}
    ${items.length ? `<ol class="progress-v6-best-list">${items.map((item, index) => `<li><span class="progress-v6-rank">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(item.name)}</h3><p>${item.weight} ${escapeHtml(unit)} × ${item.reps}<span> · ${escapeHtml(formatDate(item.at))}</span></p></div><strong>${item.estimate}<small>${escapeHtml(unit)} est. 1RM</small></strong></li>`).join("")}</ol>` : inlineEmpty("progress", "Your strength story starts here.", "A completed weighted set builds your baseline.")}
    ${disclosure("About strength estimates", `${items.length ? "" : "<p>No defensible estimate yet.</p>"}<p>Estimated 1RM uses the Epley formula: load × (1 + reps ÷ 30), with historical units converted. Only valid weighted sets with 1–30 repetitions qualify. It is an estimate, not a tested maximum.</p>`)}
  </article>`;
}
function historyCard(sessions, unit) {
  return `<section class="progress-v6-panel progress-v6-history">${heading("SESSION HISTORY", "The work you've put in", tag(`${sessions.length} total`))}<ol class="progress-v6-history-list">${[...sessions].reverse().slice(0, 8).map(session => {
    const date = sessionDate(session);
    const sets = validSets(session);
    const minutes = Math.min(1440, Math.max(0, Number(session.durationMinutes) || 0));
    const volume = validVolume(session, unit);
    return `<li><time datetime="${escapeHtml(localDateKey(date))}"><small>${escapeHtml(date.toLocaleDateString(undefined, { month: "short" }))}</small><b>${date.getDate()}</b></time><div><h3>${escapeHtml(session.planLabel || "Workout")}</h3><p>${sets} completed ${sets === 1 ? "set" : "sets"}${minutes ? ` · ${number(minutes)} min` : ""}</p></div><span class="progress-v6-history-load">${volume ? `<b>${number(volume)}</b><small>${escapeHtml(unit)} volume</small>` : icon("check")}</span></li>`;
  }).join("")}</ol></section>`;
}
function progressStudio(state, communityPreviews = new Map()) {
  const drafts = [...(state.socialDrafts || [])].reverse();
  return `<section class="progress-v6-panel progress-v6-studio">${heading("PROGRESS STUDIO", "More than a number", `<span class="progress-v6-private">${icon("lock")}Private</span>`)}<div class="progress-v6-studio-intro"><div class="progress-v6-photo-frame" aria-hidden="true">${icon("camera")}<i></i></div><div><h3>Your photos. Your story.</h3><p>Capture a moment and a note about how you feel.</p>${button({ label: "Add progress photo", action: "open-community-draft", variant: "secondary", iconName: "plus" })}</div></div>
    ${drafts.length ? `<div class="progress-v6-draft-grid">${drafts.map(item => {
      const preview = communityPreviews.get(item.id);
      return `<article>${preview ? `<img src="${escapeHtml(preview)}" alt="Private progress check-in" loading="lazy">` : `<div class="progress-v6-photo-placeholder">${icon("camera")}<span>Photo preview ended</span></div>`}<div><time>${escapeHtml(formatDate(item.createdAt))}</time><h3>${escapeHtml(item.caption || "Progress check-in")}</h3><button data-action="delete-community-draft" data-value="${escapeHtml(item.id)}" aria-label="Delete check-in from ${escapeHtml(formatDate(item.createdAt))}">Delete check-in</button></div></article>`;
    }).join("")}</div>` : ""}
    ${disclosure("How private check-ins work", "<p>Photo previews stay in this session; your note is saved locally. These check-ins are private and are not published to a public feed.</p>")}
  </section>`;
}
function nutritionTrendCard(state, now = new Date()) {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (6 - offset));
    const key = localDateKey(date);
    const diary = state.nutrition?.days?.[key];
    return { date, key, logged: (diary?.entries || []).some(entry => entry.status === "confirmed"), totals: dayTotals(diary) };
  });
  const logged = days.filter(day => day.logged);
  const average = logged.length ? Math.round(logged.reduce((sum, day) => sum + day.totals.calories, 0) / logged.length) : 0;
  const maximum = Math.max(...days.map(day => day.totals.calories), 1);
  return `<section class="progress-v6-panel progress-v6-nutrition">${heading("NUTRITION · LAST 7 DAYS", "A little more awareness", tag(logged.length ? `${logged.length} logged ${logged.length === 1 ? "day" : "days"}` : "Your next chapter"))}
    ${logged.length ? `<div class="progress-v6-chart-stat"><strong>${number(average)}</strong><span>kcal average · logged days</span></div><div class="progress-v6-food-chart" role="img" aria-label="Confirmed calories for the last seven days: ${days.map(day => `${shortDate(day.date)}, ${day.logged ? `${number(day.totals.calories)} kcal` : "not logged"}`).join("; ")}">${days.map(day => `<div><strong>${day.logged ? number(day.totals.calories) : "—"}</strong><i><em style="height:${day.logged ? Math.max(0, day.totals.calories / maximum * 100) : 0}%"></em></i><small>${escapeHtml(day.date.toLocaleDateString(undefined, { weekday: "narrow" }))}</small></div>`).join("")}</div>` : inlineEmpty("plus", "Start with your next meal.", "A week of food entries becomes a useful picture.")}
    ${button({ label: "Open nutrition diary", action: "open-nutrition", variant: "secondary", iconName: "chevron" })}
    ${disclosure("What this chart includes", "<p>Confirmed only: entries you reviewed and logged. Draft estimates are excluded. Days without a confirmed entry are shown as missing and excluded from the average; a logged day is not necessarily a complete day of eating.</p>")}
  </section>`;
}
function firstDayHero() {
  return `<section class="progress-v6-first-hero"><header class="progress-v6-heading"><div><span class="progress-v6-eyebrow">PROGRESS / YOUR TRAINING JOURNAL</span><h1>Start your<br>own story.</h1></div></header><div class="progress-v7-first-spread"><div class="progress-v7-first-marker" aria-hidden="true"><span>SESSION / ONE</span><b>01</b><svg viewBox="0 0 170 100" fill="none"><path d="M-20 100V54a50 50 0 0 1 100 0v46m-84 0V54a34 34 0 0 1 68 0v46m-52 0V54a18 18 0 0 1 36 0v46M130 0v100m16-100v100m16-100v100" stroke="currentColor" stroke-width="2"/></svg></div><div class="progress-v7-first-copy"><h2>Your baseline starts with one session.</h2><p>Start where you are. Every workout you log adds to your story.</p>${button({ label: "Choose your first workout", action: "route", value: "train", variant: "primary", iconName: "play" })}</div></div><ol class="progress-v6-first-path" aria-label="Your first three progress milestones"><li><i>1</i><span>Log a session</span></li><li><i>2</i><span>Build a rhythm</span></li><li><i>3</i><span>See your progress</span></li></ol></section>`;
}
export function renderProgressScreen({ state, now = new Date(), communityPreviews = new Map(), weeklyEvidence = null }) {
  const unit = state.settings?.units || "lb";
  const pastSessions = [...(state.sessions || [])].filter(session => { const date = sessionDate(session); return date && date <= now; }).sort((left, right) => sessionDate(left) - sessionDate(right));
  const evidence = weeklyEvidence || buildWeeklyEvidence(state, now);
  if (!pastSessions.length) return `<div class="page progress-page progress-v6 progress-v070 progress-first-day">${firstDayHero()}<div class="progress-v7-journal-spread">${nutritionTrendCard(state, now)}${progressStudio(state, communityPreviews)}</div></div>`;
  return `<div class="page progress-page progress-v6 progress-v070">${weeklyHero(evidence, pastSessions, now)}<nav class="progress-v7-index" aria-label="Training journal sections"><a href="#journal-calendar">Calendar ${icon("chevron")}</a><a href="#journal-strength">Strength ${icon("chevron")}</a><a href="#journal-history">History ${icon("chevron")}</a><a href="#journal-studio">Photo notes ${icon("chevron")}</a></nav>${milestones(pastSessions.length)}<div class="progress-v6-grid" id="journal-calendar">${calendarCard(pastSessions, now, evidence.scheduleTarget)}${volumeCard(pastSessions, unit)}</div><div class="progress-v6-grid" id="journal-strength">${bestsCard(pastSessions, unit)}${focusCard(pastSessions)}</div><div id="journal-history">${historyCard(pastSessions, unit)}</div><div class="progress-v7-journal-spread" id="journal-studio">${nutritionTrendCard(state, now)}${progressStudio(state, communityPreviews)}</div></div>`;
}
