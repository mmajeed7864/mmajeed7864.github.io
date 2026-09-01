import { SESSION_MINUTES } from "../core/constants.mjs";
import { escapeHtml } from "../core/utils.mjs";
import { buildDailyBoard } from "../domain/daily-board.mjs";
import { button, exercisePoster, icon } from "./components.mjs";

function weekStrip(state, now = new Date()) {
  const completed = new Set((state.sessions || []).map(session => new Date(session.completedAt || session.date).toLocaleDateString("en-CA")));
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return ["M", "T", "W", "T", "F", "S", "S"].map((label, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    const key = day.toLocaleDateString("en-CA");
    const today = key === now.toLocaleDateString("en-CA");
    const done = completed.has(key);
    const planned = (state.profile.preferredDays || []).includes(day.getDay());
    return `<span class="week-day ${today ? "today" : ""} ${done ? "done" : ""} ${planned ? "planned" : ""}"><small>${label}</small><b>${done ? icon("check") : day.getDate()}</b><em>${today ? "Today" : planned ? "Plan" : ""}</em></span>`;
  }).join("");
}

function dailyMove({ iconName, eyebrow, title, status, action, value, label }) {
  return `<article class="daily-move">
    <span class="daily-move-icon" aria-hidden="true">${icon(iconName)}</span>
    <div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(status)}</p></div>
    <button data-action="${escapeHtml(action)}" data-value="${escapeHtml(value || "")}" aria-label="${escapeHtml(`${label} ${title}`)}"><span>${escapeHtml(label)}</span>${icon("chevron")}</button>
  </article>`;
}

function planPreview(plan, exerciseById) {
  return (plan.exercises || []).slice(0, 3).map((item, index) => {
    const exercise = exerciseById(item.exerciseId) || { id: item.exerciseId, ...item.snapshot };
    const name = exercise.name || item.snapshot?.name || "Exercise";
    const target = item.snapshot?.target || item.target || {};
    const prescription = target.durationSeconds
      ? `${target.durationSeconds} sec`
      : `${target.sets || 3} × ${target.reps || 8}`;
    return `<button class="plan-preview-card" data-action="open-exercise" data-value="${escapeHtml(item.exerciseId)}" aria-label="Open ${escapeHtml(name)} guide">
      <span class="plan-preview-media">${exercisePoster(exercise, { label: false, eager: index === 0 })}<i>${String(index + 1).padStart(2, "0")}</i></span>
      <span class="plan-preview-copy"><b>${escapeHtml(name)}</b><small>${escapeHtml(prescription)}</small></span>
      ${icon("chevron")}
    </button>`;
  }).join("");
}

export function renderTodayScreen({ state, plan, decision, exerciseById, now = new Date() }) {
  const board = buildDailyBoard(state, plan, now);
  const first = plan.exercises?.[0];
  const firstExercise = first ? exerciseById(first.exerciseId) || { id: first.exerciseId, ...first.snapshot } : null;
  const remaining = Math.max(0, board.target - board.weekDone);
  const startingWeek = board.weekDone === 0;
  const weekHeadline = startingWeek ? "Your week starts today" : board.weekDone >= board.target ? "Weekly target complete" : `${board.weekDone} of ${board.target} sessions done`;
  const weekDetail = startingWeek
    ? `${board.target}-session plan ready · nothing is late`
    : remaining ? `${remaining} left · every valid version counts` : "The work is logged. Recovery counts too.";
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const muscles = [...new Set((plan.exercises || []).flatMap(item => item.snapshot?.primaryMuscles || []))].slice(0, 3);

  return `<div class="page today-page daily-board-page">
    <section class="daily-hero" aria-labelledby="daily-plan-title">
      <header class="daily-hero-top"><div><span class="eyebrow">${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}</span><p>${greeting}</p></div><span class="daily-week-score"><b>${startingWeek ? "NEW" : `${board.weekDone}/${board.target}`}</b><small>${startingWeek ? "baseline" : "this week"}</small></span></header>
      <div class="daily-hero-body">
        <div class="daily-hero-copy"><span class="eyebrow">YOUR NEXT MOVE</span><h1 id="daily-plan-title">${escapeHtml(plan.label)}</h1><p>${plan.exercises.length} exercises · ${escapeHtml(plan.location)}</p><div class="daily-hero-tags"><span>${plan.minutes} min</span>${muscles.map(muscle => `<span>${escapeHtml(muscle)}</span>`).join("")}</div></div>
        <div class="daily-hero-art">${firstExercise ? exercisePoster(firstExercise, { eager: true, label: false }) : ""}</div>
      </div>
      <div class="daily-hero-actions">${button({ label: board.training.label === "See receipt" ? "View workout receipt" : board.training.label === "Resume" ? "Resume workout" : "Start workout", action: board.training.action, value: board.training.value, variant: "primary", iconName: board.training.label === "See receipt" ? "check" : "play" })}<button class="daily-preview-link" data-action="route" data-value="train">Preview & adjust ${icon("chevron")}</button></div>
      <div class="daily-week-summary"><div><b>${weekHeadline}</b><small>${weekDetail}</small></div><span aria-hidden="true"><i style="width:${board.progressPercent}%"></i></span></div>
      <div class="week-strip daily-week-strip">${weekStrip(state, now)}</div>
    </section>

    <section class="daily-moves" aria-labelledby="daily-moves-title">
      <header><div><span class="eyebrow">TODAY</span><h2 id="daily-moves-title">Three useful moves</h2></div><p>No fake streaks—only actions you can finish.</p></header>
      <div class="daily-move-grid">
        ${dailyMove({ iconName: "train", eyebrow: "TRAIN", title: "Your session", ...board.training })}
        ${dailyMove({ iconName: "camera", eyebrow: "FOOD", title: "Log a meal", ...board.food })}
        ${dailyMove({ iconName: "mic", eyebrow: "COACH", title: "Talk it through", ...board.coach })}
      </div>
    </section>

    <section class="daily-coach-signal tone-${escapeHtml(state.profile.tone.toLowerCase())}" aria-labelledby="coach-signal-title">
      <div class="daily-coach-orb" aria-hidden="true"><span></span></div>
      <div class="daily-coach-copy"><span class="eyebrow">${escapeHtml(state.settings.voicePersona.toUpperCase())} · ${escapeHtml(state.profile.tone.toUpperCase())}</span><h2 id="coach-signal-title">${escapeHtml(decision.title)}</h2><p>${escapeHtml(decision.message)}</p></div>
      <div class="daily-coach-actions">${button({ label: decision.primary.label, action: "decision", value: "primary", variant: "primary" })}${decision.secondary ? button({ label: decision.secondary.label, action: "decision", value: "secondary", variant: "quiet" }) : ""}<button class="text-button" data-action="explain-decision">Why this?</button></div>
    </section>

    <section class="daily-checkin card" aria-labelledby="daily-checkin-title">
      <header><div><span class="eyebrow">QUICK CHECK-IN</span><h2 id="daily-checkin-title">Fit today—not an ideal day</h2></div><button class="text-button" data-action="route" data-value="train">More controls</button></header>
      <div class="daily-checkin-block"><span>Energy</span><div class="daily-energy" role="radiogroup" aria-label="Energy right now">${[[1,"Empty"],[2,"Low"],[3,"Ready"],[4,"Strong"],[5,"High"]].map(([value,label]) => `<button role="radio" aria-checked="${state.profile.energy === value && board.energyCheckedToday}" class="${state.profile.energy === value && board.energyCheckedToday ? "active" : ""}" data-action="set-energy" data-value="${value}"><b>${value}</b><small>${label}</small></button>`).join("")}</div></div>
      <div class="daily-checkin-block"><span>Time available</span><div class="daily-duration" role="group" aria-label="Time available">${SESSION_MINUTES.filter(minutes => [12,20,30,45].includes(minutes)).map(minutes => `<button class="${plan.minutes === minutes ? "active" : ""}" data-action="propose-plan" data-field="minutes" data-value="${minutes}"><b>${minutes}</b><small>min</small></button>`).join("")}</div></div>
    </section>

    <section class="plan-preview card" aria-labelledby="plan-preview-title">
      <header><div><span class="eyebrow">UP NEXT</span><h2 id="plan-preview-title">Know the first three moves</h2></div><button class="text-button" data-action="route" data-value="train">Full workout</button></header>
      <div class="plan-preview-rail">${planPreview(plan, exerciseById)}</div>
    </section>

    <section class="daily-coach-dock" aria-label="Open your AI trainer">
      <div class="daily-coach-orb" aria-hidden="true"><span></span></div><div><span class="eyebrow">VOICE COACH</span><h2>Stay in the room with ${escapeHtml(state.settings.voicePersona)}</h2><p>Voice + transcript · approvals stay yours</p></div>${button({ label: "Talk now", action: "open-voice-room", variant: "primary", iconName: "mic" })}
    </section>
  </div>`;
}
