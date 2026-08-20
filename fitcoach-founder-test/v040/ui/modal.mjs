import { escapeHtml } from "../core/utils.mjs";
import { isValidCompletedSet } from "../domain/workouts.mjs";
import { button, exercisePoster, icon } from "./components.mjs";

function shell(title, body, actions = "", { eyebrow = "FITCOACH", wide = false } = {}) {
  return `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal-sheet ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close icon-only" data-action="close-modal" aria-label="Close dialog">${icon("close")}</button><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2 id="modal-title">${escapeHtml(title)}</h2>${body}<footer>${actions}</footer></section>`;
}

const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    eyebrow: "START HERE",
    title: "Today is your command center",
    copy: "Pick Full, Reduced, or Minimum, then start the workout. The trainer can explain the choice, but plan changes still wait for your approval.",
    points: ["Use Today for the current session", "Use Train for movement guides and set logging", "Use Progress for receipts and trends"],
  }),
  Object.freeze({
    eyebrow: "TRAIN",
    title: "Every exercise has a guide",
    copy: "Open the movement, check setup and common mistakes, then log only the sets you actually complete.",
    points: ["No stick-figure media in the active guide path", "Rest timers and active workout state stay local", "Swap or reduce only through visible controls"],
  }),
  Object.freeze({
    eyebrow: "COACH",
    title: "Your voice trainer stays in one thread",
    copy: "Use Voice Room when you want to talk. Supportive uses Nova by default, Strict uses Atlas, and Direct can use Bennett.",
    points: ["DeepSeek text first, Qwen backup when configured", "ElevenLabs speaks bounded reply text only", "No microphone audio upload from FitCoach"],
  }),
]);

export function renderModal(modal, context) {
  if (!modal) return "";
  if (modal.type === "proposal") {
    const proposal = context.state.pendingPlanProposal;
    if (!proposal) return "";
    const body = `<p>${escapeHtml(proposal.reason)}</p><div class="proposal-diff"><span><small>CURRENT</small><b>${escapeHtml(context.state.activePlan?.label || "Plan A")}</b><em>${context.state.activePlan?.minutes || 45} min · ${escapeHtml(context.state.activePlan?.location || context.state.profile.location)}</em></span>${icon("chevron")}<span><small>PROPOSED</small><b>${escapeHtml(proposal.candidate.label)}</b><em>${proposal.candidate.minutes} min · ${escapeHtml(proposal.candidate.location)}</em></span></div><ul class="change-list">${proposal.changes.length ? proposal.changes.map(change => `<li>${icon("check")}${escapeHtml(change)}</li>`).join("") : `<li>${icon("check")}No semantic difference detected</li>`}</ul><div class="approval-boundary">${icon("info")}<p>The candidate is inert until you approve it. The language model cannot press this button or activate the plan.</p></div>`;
    return shell("Review the exact plan change",body,button({label:"Keep current plan",action:"reject-proposal",value:proposal.id,variant:"quiet"})+button({label:"Approve change",action:"approve-proposal",value:proposal.id,variant:"primary"}),{eyebrow:"PLAN VERSION PREVIEW"});
  }
  if (modal.type === "tutorial") {
    const stepIndex = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, Number(modal.step || 0)));
    const step = TUTORIAL_STEPS[stepIndex];
    const body = `<div class="tutorial-progress" aria-label="Tutorial progress">${TUTORIAL_STEPS.map((_, index) => `<span class="${index <= stepIndex ? "active" : ""}"></span>`).join("")}</div><p>${escapeHtml(step.copy)}</p><div class="tutorial-points">${step.points.map(point => `<article>${icon("check")}<span>${escapeHtml(point)}</span></article>`).join("")}</div><button class="text-button tutorial-skip" data-action="skip-tutorial">Skip tutorial</button>`;
    const actions = `${stepIndex > 0 ? button({ label: "Back", action: "tutorial-back", variant: "quiet", extra: `data-step="${stepIndex}"` }) : ""}${stepIndex < TUTORIAL_STEPS.length - 1 ? button({ label: "Continue", action: "tutorial-next", variant: "primary", extra: `data-step="${stepIndex}"` }) : button({ label: "Start using FitCoach", action: "finish-tutorial", variant: "primary" })}`;
    return shell(step.title, body, actions, { eyebrow: step.eyebrow });
  }
  if (modal.type === "decision") {
    const decision = context.decision;
    return shell("Why this action cleared",`<p>${escapeHtml(decision.why)}</p><div class="receipt-box"><span>${icon("check")}</span><p><b>${escapeHtml(decision.type.replaceAll("_"," "))}</b><small>Decision ${escapeHtml(decision.id.slice(0,12))} · deterministic rule · current local context</small></p></div><div class="approval-boundary">${icon("info")}<p>This is a concise rule explanation, not hidden model reasoning. The model does not choose the action.</p></div>`,button({label:"Got it",action:"close-modal",variant:"primary"}),{eyebrow:"DECISION RECEIPT"});
  }
  if (modal.type === "why-workout") {
    const plan = context.state.activePlan;
    return shell("Why this workout?",`<p>This plan is generated locally from bounded inputs. It is not a medical recommendation or live form assessment.</p><div class="evidence-grid"><span><small>GOAL</small><b>${escapeHtml(context.state.profile.goal)}</b></span><span><small>TIME</small><b>${plan.minutes} minutes</b></span><span><small>LOCATION</small><b>${escapeHtml(plan.location)}</b></span><span><small>EQUIPMENT</small><b>${escapeHtml(plan.equipment)}</b></span><span><small>INTENSITY</small><b>${escapeHtml(plan.intensity)}</b></span><span><small>HISTORY</small><b>${context.state.sessions.length} sessions</b></span></div>`,button({label:"Open workout",action:"route",value:"train",variant:"primary"}),{eyebrow:"PLAN EVIDENCE"});
  }
  if (modal.type === "finish-workout") {
    const workout = context.state.activeWorkout;
    const completed = workout?.exercises.flatMap(item=>item.sets).filter(isValidCompletedSet).length || 0;
    return shell("Finish and save this workout?",`<p>${completed} valid completed set${completed===1?"":"s"} will become one immutable completion receipt. Unfinished or zero-repetition sets will not be counted.</p><div class="approval-boundary">${icon("info")}<p>Workout history is based only on valid completed sets. You can add a rating after saving.</p></div>`,button({label:"Keep training",action:"close-modal",variant:"quiet"})+button({label:`Save ${completed} set${completed===1?"":"s"}`,action:"confirm-finish-workout",variant:"primary",disabled:completed===0}),{eyebrow:"WORKOUT RECEIPT"});
  }
  if (modal.type === "completion") {
    const summary = context.state.lastWorkoutSummary;
    return shell("Workout saved",`<div class="completion-mark">${icon("check")}</div><p>Your active workout is closed. The recap below is computed from the saved receipt—no performance facts were invented.</p><div class="completion-grid"><span><b>${summary?.durationMinutes || 0}</b><small>minutes</small></span><span><b>${summary?.completedExercises || 0}</b><small>exercises</small></span><span><b>${summary?.completedSets || 0}</b><small>sets</small></span><span><b>${Math.round(summary?.totalVolume || 0).toLocaleString()}</b><small>volume</small></span></div><div class="rating-row"><span>How did this session feel?</span>${[1,2,3,4,5].map(value=>`<button data-action="rate-session" data-value="${value}" aria-label="Rate session ${value} out of 5">${value}</button>`).join("")}</div>`,button({label:"View Progress",action:"close-completion",value:"progress",variant:"primary"})+button({label:"Back to Today",action:"close-completion",value:"today",variant:"quiet"}),{eyebrow:"COMPLETION RECEIPT"});
  }
  if (modal.type === "active-swap") {
    const exercise = context.exerciseById(modal.exerciseId);
    return shell("Replace this exercise?",`${exercise ? exercisePoster(exercise,{className:"modal-poster",eager:true}) : ""}<p>${escapeHtml(modal.currentName)} will be replaced with <b>${escapeHtml(exercise?.name || "the selected exercise")}</b>. Completed sets prevent replacement.</p>`,button({label:"Keep current",action:"close-modal",variant:"quiet"})+button({label:"Confirm replacement",action:"apply-active-swap",value:modal.exerciseId,variant:"primary"}),{eyebrow:"ACTIVE WORKOUT CHANGE"});
  }
  if (modal.type === "confirm-exit-workout") {
    return shell("End this workout without saving?","<p>The active workout and its unsaved set entries will be removed from this device. Completed history is not affected.</p>",button({label:"Keep training",action:"close-modal",variant:"quiet"})+button({label:"End unsaved workout",action:"confirm-exit-workout",variant:"danger"}),{eyebrow:"EMERGENCY EXIT"});
  }
  if (modal.type === "confirm-clear-chat") {
    return shell("Clear the Coach thread?","<p>This removes saved text messages from this founder profile. Workout history and exercise preferences remain.</p>",button({label:"Keep thread",action:"close-modal",variant:"quiet"})+button({label:"Clear thread",action:"confirm-clear-chat",variant:"danger"}),{eyebrow:"LOCAL DATA"});
  }
  if (modal.type === "confirm-reset") {
    return shell("Reset this founder profile?","<p>This creates a fresh v0.4 profile and removes current v0.4 workouts, chat, settings, and preferences. The exact pre-migration v0.3.6 backup is preserved separately.</p>",button({label:"Cancel",action:"close-modal",variant:"quiet"})+button({label:"Reset v0.4 profile",action:"confirm-reset",variant:"danger"}),{eyebrow:"FOUNDER RECOVERY"});
  }
  if (modal.type === "offline") {
    return shell("Live Coach is offline","<p>Your workout, exercise library, timer, set logging, and local plans remain available. FitCoach will not queue or retry a voice transcript automatically.</p>",button({label:"Continue locally",action:"close-modal",variant:"primary"}),{eyebrow:"OFFLINE MODE"});
  }
  return shell("FitCoach",`<p>${escapeHtml(modal.message || "Nothing to review.")}</p>`,button({label:"Close",action:"close-modal",variant:"primary"}));
}
