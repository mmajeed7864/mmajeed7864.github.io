import { escapeHtml, localDateKey } from "../core/utils.mjs";
import { buildDailyBoard } from "../domain/daily-board.mjs";
import { normalizeTargets } from "../domain/nutrition.mjs";
import { waterForDay } from "../domain/hydration.mjs";
import { button, exercisePoster, icon } from "./components.mjs";

function weekStrip(state, now) {
  const completed = new Set((state.sessions || []).map(session => {
    const value = session.completedAt || session.date;
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  }).filter(date => Number.isFinite(date.getTime()) && date <= now).map(localDateKey));
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return ["M", "T", "W", "T", "F", "S", "S"].map((label, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    const key = localDateKey(day);
    const today = key === localDateKey(now);
    const done = completed.has(key);
    return `<span class="home-week-day ${today ? "is-today" : ""} ${done ? "is-done" : ""}" aria-label="${escapeHtml(day.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }))}${done ? ", workout complete" : ""}${today ? ", today" : ""}"><small>${label}</small><b>${done ? icon("check") : day.getDate()}</b><i></i></span>`;
  }).join("");
}

function workoutTitle(plan) {
  const muscles = (plan.exercises || []).flatMap(item => item.snapshot?.primaryMuscles || []).map(value => value.toLowerCase());
  const lower = muscles.some(value => /quad|glute|hamstring|calf|calves/.test(value));
  const upper = muscles.some(value => /chest|back|lat|shoulder|bicep|tricep/.test(value));
  if (lower && upper) return "Full body. Full potential.";
  if (lower) return "Build your foundation.";
  if (upper) return "Strength from the top.";
  return "Make your next move.";
}

function movementPreview(plan, exerciseById) {
  return (plan.exercises || []).slice(0, 3).map((item, index) => {
    const exercise = exerciseById(item.exerciseId) || { id: item.exerciseId, ...item.snapshot };
    const target = item.snapshot?.target || item.target || {};
    return `<button class="home-exercise" data-action="open-exercise" data-value="${escapeHtml(item.exerciseId)}" aria-label="Open ${escapeHtml(exercise.name || "exercise")} guide"><span class="home-exercise-art">${exercisePoster(exercise, { label: false })}<em>${String(index + 1).padStart(2, "0")}</em></span><b>${escapeHtml(exercise.name || "Exercise")}</b><small>${target.durationSeconds ? `${target.durationSeconds} sec` : `${target.sets || 3} sets · ${target.reps || 8} reps`}</small></button>`;
  }).join("");
}

export function renderTodayScreen({ state, plan, decision, exerciseById, now = new Date() }) {
  const board = buildDailyBoard(state, plan, now);
  // The in-progress snapshot can differ from the planned session after a swap.
  if (state.activeWorkout) plan = { ...plan, label: state.activeWorkout.planLabel || plan.label, exercises: state.activeWorkout.exercises || [] };
  const heroImage = '<img class="home-cover-image" src="/fitcoach-founder-test/v040/assets/brand/club-day-v070-1200.webp" srcset="/fitcoach-founder-test/v040/assets/brand/club-day-v070-640.webp 640w, /fitcoach-founder-test/v040/assets/brand/club-day-v070-1200.webp 1200w" sizes="(min-width:700px) 640px, 100vw" width="1200" height="800" fetchpriority="high" alt="Athlete training with battle ropes in a blue and concrete studio">';
  const targets = normalizeTargets(state.nutrition?.targets);
  const water = waterForDay(state.hydration, now);
  const voice = String(state.settings.voicePersona || "nova");
  const voiceName = voice.charAt(0).toUpperCase() + voice.slice(1);
  const coachTone = String(state.profile.tone || "Supportive");
  const greeting = now.getHours() < 12 ? "Good morning." : now.getHours() < 18 ? "Good afternoon." : "Good evening.";
  const proteinPercent = Math.max(0, Math.min(100, targets.protein ? board.nutritionTotals.protein / targets.protein * 100 : 0));
  const firstWeek = !(state.sessions || []).length;
  const weekHeading = firstWeek || !board.weekDone ? "Your week starts here." : board.weekDone >= board.target ? "That’s a week well spent." : "Keep showing up.";
  const weekScore = board.weekDone ? `${board.weekDone} of ${board.target}` : `${board.target} planned`;
  const weekSummary = board.weekDone ? `<b>${board.weekDone}<small>/${board.target}</small></b><small>This week</small>` : `<b class="home-week-fresh">${firstWeek ? "First week" : "New week"}</b><small>${board.target} planned</small>`;
  const sessionTiming = board.activeWorkout ? "In progress" : `${plan.minutes} min`;
  const energy = board.energyCheckedToday ? state.profile.energy : null;
  const primary = board.training;
  return `<div class="page today-page daily-board-page home-v6 home-v7">
    <header class="home-greeting"><span class="eyebrow">${escapeHtml(now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }))}</span><span>${greeting}</span></header>
    <div class="home-masthead"><h1>${board.activeWorkout ? "PICK UP.<br><em>POWER ON.</em>" : board.trainedToday ? "YOU CAME.<br><em>YOU DID.</em>" : "YOUR DAY.<br><em>YOUR MOVE.</em>"}</h1><button class="home-week-link" data-action="route" data-value="progress" aria-label="View this week’s progress"><span>${weekSummary}</span>${icon("chevron")}</button></div>
    <div class="home-layout">
      <section class="home-session" aria-labelledby="home-session-title"><div class="home-session-media">${heroImage}<span class="home-photo-stamp" aria-hidden="true">MOVE<br>WITH<br>INTENT.</span><span class="home-status"><i></i>${board.activeWorkout ? "SESSION IN PROGRESS" : board.trainedToday ? "TODAY, COMPLETED" : "MADE FOR YOUR TODAY"}</span></div><div class="home-session-copy"><div class="home-session-top"><span class="home-session-label">${escapeHtml(plan.label)} <i>/</i> ${escapeHtml(plan.location)}</span><button data-action="route" data-value="train" class="home-session-menu" aria-label="Preview and adjust your workout">${icon("chevron")}</button></div><h2 id="home-session-title">${board.activeWorkout ? "Your session is waiting." : board.trainedToday ? "You showed up." : workoutTitle(plan)}</h2><div class="home-session-bottom"><div class="home-session-meta"><span>${icon("clock")}${sessionTiming}</span><span>${icon("train")}${plan.exercises.length} exercises</span></div>${button({ label: board.activeWorkout ? "Resume workout" : board.trainedToday ? "View your session" : "Let’s train", action: primary.action, value: primary.value, variant: "primary", iconName: board.trainedToday ? "check" : "play" })}</div></div></section>
      <section class="home-week" aria-label="Training this week"><header><div><span class="eyebrow">YOUR RHYTHM</span><h2>${weekHeading}</h2></div><span>${weekScore}</span></header><div class="home-week-days">${weekStrip(state, now)}</div><p>${firstWeek ? "One session is all it takes to begin." : board.weekDone >= board.target ? "Your training target is complete. Make room for recovery." : `${Math.max(0, board.target - board.weekDone)} more session${board.target - board.weekDone === 1 ? "" : "s"} in your weekly plan.`}</p></section>
      <section class="home-fuel" aria-labelledby="home-fuel-title"><header class="home-section-heading"><div><span class="eyebrow">02 / THE EVERYDAY</span><h2 id="home-fuel-title">FUEL THE FEELING.</h2></div><button class="text-button" data-action="open-nutrition" data-date="today">Diary ${icon("chevron")}</button></header><div class="home-habits"><button class="home-food-summary" data-action="nutrition-open-add" data-date="today"><span class="home-habit-icon">${icon("food")}</span><span class="home-habit-name">Nutrition</span><strong>${Math.round(board.nutritionTotals.calories).toLocaleString()}<small>kcal logged</small></strong><span class="home-protein"><i><em style="width:${proteinPercent}%"></em></i><small>${Math.round(board.nutritionTotals.protein)} / ${Math.round(targets.protein)} g protein</small></span><span class="home-habit-action">Log a meal ${icon("plus")}</span></button><article class="home-water-summary"><span class="home-habit-icon water">${icon("droplet")}</span><span class="home-habit-name">Water</span><strong>${water.totalMl >= 1000 ? (water.totalMl / 1000).toFixed(2).replace(/0$/, "") : water.totalMl}<small>${water.totalMl >= 1000 ? "litres logged" : "ml logged"}</small></strong><div class="home-water-controls"><button data-action="water-undo" aria-label="Undo last glass of water" ${water.entries.length ? "" : "disabled"}>−</button><span>${water.entries.length ? `${water.entries.length} glass${water.entries.length === 1 ? "" : "es"}` : "Start with a sip"}</span><button data-action="water-add" data-value="250" aria-label="Log 250 ml of water">+</button></div><small class="home-water-note">Tap + for a 250 ml glass</small></article></div></section>
      <section class="home-coach tone-${escapeHtml(coachTone.toLowerCase())}" aria-labelledby="home-coach-title"><span class="home-coach-symbol" aria-hidden="true">${icon("spark")}</span><div class="home-coach-copy"><span class="eyebrow">${escapeHtml(voiceName)} · ${escapeHtml(coachTone)}</span><h2 id="home-coach-title">${escapeHtml(decision?.title || (firstWeek ? "Let’s find your rhythm." : "A plan that moves with you."))}</h2></div><button class="home-coach-start" data-action="open-voice-room" aria-label="Talk to ${escapeHtml(voiceName)}">${icon("mic")}</button><p class="home-coach-message">${escapeHtml(decision?.message || (board.activeWorkout ? "Mid-session question? I’m right here." : "Less time? Equipment busy? We’ll work with it."))}</p>${decision?.primary?.label ? `<div class="home-coach-decision-actions" aria-label="Your coach’s recommendation">${button({ label: decision.primary.label, action: "decision", value: "primary", variant: "primary" })}${decision.secondary?.label ? button({ label: decision.secondary.label, action: "decision", value: "secondary", variant: "quiet" }) : ""}</div>` : ""}<div class="home-coach-prompts"><button data-action="propose-plan" data-field="minutes" data-value="20">I’ve got 20 min ${icon("chevron")}</button><button data-action="route" data-value="coach">Ask your coach ${icon("chevron")}</button></div></section>
      <section class="home-readiness" aria-label="Energy check-in"><header class="home-section-heading"><div><span class="eyebrow">A QUICK CHECK-IN</span><h2>How’s your energy?</h2></div>${energy ? `<span class="home-saved">${icon("check")}Saved</span>` : ""}</header><div class="home-energy" role="radiogroup" aria-label="Energy right now">${[[1,"Low"],[2,"Easy"],[3,"Ready"],[4,"Strong"],[5,"On fire"]].map(([value,label]) => `<button role="radio" aria-checked="${energy === value}" class="${energy === value ? "active" : ""}" data-action="set-energy" data-value="${value}"><span class="energy-bars" aria-hidden="true">${Array.from({ length: 5 }, (_, index) => `<i class="${index < value ? "filled" : ""}"></i>`).join("")}</span><b>${label}</b></button>`).join("")}</div></section>
      <section class="home-preview"><header class="home-section-heading"><div><span class="eyebrow">IN YOUR SESSION</span><h2>A look at what’s next.</h2></div><button class="text-button" data-action="route" data-value="train">View all ${icon("chevron")}</button></header><div class="home-exercise-grid">${movementPreview(plan, exerciseById)}</div></section>
    </div>
    <details class="home-plan-note"><summary>${icon("info")}Why this plan?${icon("chevron")}</summary><h3>Built around your week</h3><p>${escapeHtml(decision?.why || "Your goal, equipment, and available time shape your session.")}</p><button class="text-button" data-action="explain-decision">See the reasoning</button><p>Water logging stays on this device. It records what you add; it is not a daily intake recommendation.</p></details>
  </div>`;
}
