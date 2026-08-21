import { SESSION_MINUTES } from "../core/constants.mjs";
import { escapeHtml, localDateKey } from "../core/utils.mjs";
import { readiness, sessionsThisWeek } from "../domain/decisions.mjs";
import { dayTotals, draftCount, normalizeTargets } from "../domain/nutrition.mjs";
import { button, exercisePoster, icon } from "./components.mjs";
import { macroBar } from "./nutrition-screen.mjs";

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
    const planned = (state.profile.preferredDays || []).includes(index + 1);
    return `<span class="week-day ${today ? "today" : ""} ${done ? "done" : ""} ${planned ? "planned" : ""}"><small>${label}</small><b>${done ? icon("check") : day.getDate()}</b><em>${today ? "Today" : planned ? "Plan" : ""}</em></span>`;
  }).join("");
}

function quickControls(state) {
  const todayLocation = state.activePlan?.location || state.profile.location;
  const todayIntensity = state.activePlan?.intensity || state.profile.intensity;
  return `<section class="context-controls card" aria-labelledby="context-title">
    <header class="section-heading"><div><span class="eyebrow">TODAY CAN CHANGE</span><h2 id="context-title">Make the plan fit the day</h2></div><span class="soft-badge">Today plan, not default profile</span></header>
    <div class="control-block"><span>Time available</span><div class="choice-row" role="group" aria-label="Time available">${SESSION_MINUTES.map(minutes => `<button class="choice-chip ${state.activePlan?.minutes === minutes ? "active" : ""}" data-action="propose-plan" data-field="minutes" data-value="${minutes}">${minutes}<small>min</small></button>`).join("")}</div></div>
    <div class="control-grid">
      <div class="control-block"><span>Location</span><div class="choice-row compact" role="group" aria-label="Training location">${["gym", "home", "travel"].map(value => `<button class="choice-chip ${todayLocation === value ? "active" : ""}" data-action="propose-plan" data-field="location" data-value="${value}">${escapeHtml(value)}</button>`).join("")}</div></div>
      <div class="control-block"><span>Session feel</span><div class="choice-row compact" role="group" aria-label="Session intensity">${["light", "standard", "push"].map(value => `<button class="choice-chip ${todayIntensity === value ? "active" : ""}" data-action="propose-plan" data-field="intensity" data-value="${value}">${escapeHtml(value)}</button>`).join("")}</div></div>
    </div>
    <div class="energy-scale"><span>Energy right now</span><div role="radiogroup" aria-label="Energy right now">${[[1,"Empty"],[2,"Low"],[3,"Ready"],[4,"Strong"],[5,"High"]].map(([value,label]) => `<button role="radio" aria-checked="${state.profile.energy === value}" class="energy-choice ${state.profile.energy === value ? "active" : ""}" data-action="set-energy" data-value="${value}"><b>${value}</b><small>${label}</small></button>`).join("")}</div><p>Energy changes today’s recommendation—not your worth.</p></div>
  </section>`;
}

function nutritionCard(state, now = new Date()) {
  const day = state.nutrition?.days?.[localDateKey(now)];
  const totals = dayTotals(day);
  const targets = normalizeTargets(state.nutrition?.targets);
  const drafts = draftCount(day);
  const remaining = targets.calories - totals.calories;
  return `<section class="nutrition-today card" aria-label="Nutrition today">
    <header class="section-heading"><div><span class="eyebrow">NUTRITION</span><h2>${totals.calories ? `${totals.calories.toLocaleString()} kcal confirmed` : "Nothing confirmed yet"}</h2></div><span class="soft-badge">${remaining >= 0 ? `${remaining.toLocaleString()} kcal left` : `${Math.abs(remaining).toLocaleString()} kcal over`}</span></header>
    <div class="macro-bars">${macroBar("Protein", totals.protein, targets.protein)}${macroBar("Carbs", totals.carbs, targets.carbs)}${macroBar("Fat", totals.fat, targets.fat)}</div>
    ${drafts ? `<p class="nutrition-draft-note">${drafts} draft estimate${drafts === 1 ? "" : "s"} waiting for review — drafts count zero.</p>` : ""}
    <div class="session-actions">${button({ label: "Open diary", action: "open-nutrition", variant: "primary" })}${button({ label: "Scan food", action: "nutrition-open-capture", variant: "secondary", iconName: "camera" })}</div>
  </section>`;
}

export function renderTodayScreen({ state, plan, decision, exerciseById, now = new Date() }) {
  const weekDone = sessionsThisWeek(state, now).length;
  const target = Number(state.profile.days) || 3;
  const ready = readiness(state, now);
  const muscles = [...new Set(plan.exercises.flatMap(item => item.snapshot.primaryMuscles || []))].slice(0, 4);
  const first = plan.exercises[0];
  const firstExercise = first ? exerciseById(first.exerciseId) : null;
  const remaining = Math.max(0, target - weekDone);
  return `<div class="page today-page">
    <section class="today-intro"><div><span class="eyebrow">${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}</span><h1>${now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening"}</h1><p>Your plan is ready. Change the context, and FitCoach will preview the exact difference before anything moves.</p></div><div class="readiness-orb" style="--score:${ready.score}" aria-label="Readiness ${ready.score}, ${ready.label}"><strong>${ready.score}</strong><small>${ready.label}</small></div></section>

    <section class="coach-decision-card tone-${escapeHtml(state.profile.tone.toLowerCase())}">
      <div class="coach-mark" aria-hidden="true"><span></span></div>
      <div class="decision-copy"><span class="eyebrow">TODAY’S COACH DECISION</span><h2>${escapeHtml(decision.title)}</h2><p>${escapeHtml(decision.message)}</p>
        <div class="decision-actions">${button({ label: decision.primary.label, action: "decision", value: "primary", variant: "primary" })}${decision.secondary ? button({ label: decision.secondary.label, action: "decision", value: "secondary", variant: "quiet" }) : ""}<button class="text-button" data-action="explain-decision">Why this?</button></div>
        <footer><span class="status-dot"></span>${escapeHtml(decision.type.replaceAll("_", " "))} · deterministic action</footer>
      </div>
    </section>

    <section class="weekly-card card"><header><span><small>THIS WEEK</small><b>${weekDone}/${target} sessions</b></span><p>${remaining ? `${remaining} remaining · every valid version counts` : "Weekly target complete"}</p></header><div class="week-strip">${weekStrip(state, now)}</div></section>

    <section class="next-session-card card">
      <div class="session-visual">${firstExercise ? exercisePoster(firstExercise, { eager: true }) : ""}<span class="session-time"><b>${plan.minutes}</b><small>MIN</small></span></div>
      <div class="session-content"><span class="eyebrow">NEXT SESSION · ${escapeHtml(plan.detail.toUpperCase())}</span><h2>${escapeHtml(plan.label)} · ${escapeHtml(state.profile.goal)}</h2><p>${plan.exercises.length} exercises · ${escapeHtml(plan.location)} · ${escapeHtml(plan.intensity)} intent</p>
        <div class="muscle-tags">${muscles.map(muscle => `<span>${escapeHtml(muscle)}</span>`).join("")}</div>
        <div class="session-actions">${button({ label: state.activeWorkout ? "Resume workout" : "Start workout", action: state.activeWorkout ? "resume-workout" : "start-workout", value: plan.id, variant: "primary", iconName: "play" })}${button({ label: "Preview exercises", action: "route", value: "train", variant: "secondary" })}</div>
        <button class="why-workout" data-action="why-workout">${icon("info")}<span><b>Why this workout?</b><small>See the goal, constraints, and exact plan inputs</small></span>${icon("chevron")}</button>
      </div>
    </section>

    ${nutritionCard(state, now)}

    ${quickControls(state)}

    <section class="coach-entry card"><div class="coach-entry-orb"><span></span></div><div><span class="eyebrow">ASK ${escapeHtml(state.settings.voicePersona.toUpperCase())}</span><h2>Need a human-feeling second opinion?</h2><p>Ask by text or enter the persistent Voice Room. Plans still change only after your approval.</p></div><div>${button({ label: "Ask Coach", action: "route", value: "coach", variant: "primary" })}${button({ label: "Voice Room", action: "open-voice-room", variant: "secondary", iconName: "mic" })}</div></section>
  </div>`;
}
