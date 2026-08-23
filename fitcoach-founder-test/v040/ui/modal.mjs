import { escapeHtml } from "../core/utils.mjs";
import { EXERCISE_EXPANSION_CATEGORIES, EXERCISE_EXPANSION_TARGETS } from "../data/exercise-expansion-targets.mjs";
import { EXERCISE_MEDIA_MANIFEST } from "../data/exercise-media-manifest.mjs";
import { isValidCompletedSet } from "../domain/workouts.mjs";
import { button, exercisePoster, icon } from "./components.mjs";
import { renderNutritionModalContent } from "./nutrition-screen.mjs";

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
    points: ["High-quality movement illustrations show each position", "Rest timers and active workout state stay local", "Swap or reduce only through visible controls"],
  }),
  Object.freeze({
    eyebrow: "COACH",
    title: "Your voice trainer stays in one thread",
    copy: "Use Voice Room when you want to talk. Supportive uses Nova by default, Strict uses Atlas, and Direct can use Bennett.",
    points: ["Voice replies play automatically", "Tap once to interrupt the trainer", "FitCoach never uploads microphone audio"],
  }),
]);

const EQUIPMENT_OPTIONS = Object.freeze([
  "dumbbells",
  "kettlebells",
  "barbells",
  "plates",
  "squat rack",
  "benches",
  "cables",
  "machines",
  "pull-up bar",
  "resistance bands",
  "treadmill",
  "bike",
  "rower",
  "sled",
]);

function renderAppleHealthPlan(state) {
  return `<div class="health-sync-modal">
    <div class="native-sync-hero">${icon("heart")}<span><b>Coming with the iPhone app</b><small>Apple Health permissions are available only inside the native FitCoach app.</small></span></div>
    <div class="sync-benefit-list">
      <article>${icon("train")}<span><b>Write completed workouts</b><small>Only after a saved FitCoach receipt and explicit Health permission.</small></span></article>
      <article>${icon("flame")}<span><b>Read active energy</b><small>Used for progress context, never diagnosis or medical advice.</small></span></article>
      <article>${icon("progress")}<span><b>Read weight/body stats only if allowed</b><small>Optional, skippable, and visible in the profile.</small></span></article>
      <article>${icon("info")}<span><b>Manual mode remains first-class</b><small>Users can skip sync and still use training, nutrition, and Coach.</small></span></article>
    </div>
    <p class="modal-note">Apple Health is not available in this web version. Saving this preference does not access or import any health data.</p>
  </div>`;
}

function renderProPreview(state) {
  const selected = state.integrations?.payments?.selectedPlan || "yearly";
  const planCopy = selected === "monthly" ? "$15.99/month target" : "$95.99/year target · about $8/month";
  return `<div class="pro-preview-card">
    <div class="pro-logo">F</div>
    <h3>Try 7 days free</h3>
    <p>${escapeHtml(planCopy)}. Final prices will always appear before a purchase.</p>
    <div class="billing-toggle" role="radiogroup" aria-label="Billing preview">
      <button class="${selected === "yearly" ? "active" : ""}" data-action="select-pro-plan" data-value="yearly">Yearly</button>
      <button class="${selected === "monthly" ? "active" : ""}" data-action="select-pro-plan" data-value="monthly">Monthly</button>
    </div>
    <div class="pro-benefit-list">
      <article>${icon("check")}<span><b>Adaptive progression</b><small>Reps, sets, and substitutions update from logged behavior.</small></span></article>
      <article>${icon("check")}<span><b>Premium AI voice trainer</b><small>Mode-matched natural voices with a device fallback.</small></span></article>
      <article>${icon("check")}<span><b>Camera nutrition drafts</b><small>Photo estimates stay drafts until the user confirms them.</small></span></article>
      <article>${icon("check")}<span><b>Apple Health sync</b><small>Native permission flow, not web scraping or hidden uploads.</small></span></article>
    </div>
  </div>`;
}

function renderExerciseRoadmap() {
  const liveMotionExerciseIds = new Set(
    EXERCISE_MEDIA_MANIFEST
      .filter(item => item.type === "mp4" && item.motionReviewStatus === "approved")
      .map(item => item.exerciseId),
  );
  const remainingTargets = EXERCISE_EXPANSION_TARGETS.filter(item => !liveMotionExerciseIds.has(item.id));
  const sampleTargets = remainingTargets.slice(0, 14);
  return `<div class="exercise-roadmap">
    <div class="roadmap-counter"><b>${liveMotionExerciseIds.size}</b><span>reviewed motion guides live · ${remainingTargets.length} remaining</span></div>
    <div class="roadmap-categories">${EXERCISE_EXPANSION_CATEGORIES.map(item => `<span><b>${escapeHtml(item.category)}</b><small>${item.count} targets</small></span>`).join("")}</div>
    <div class="target-chip-cloud">${sampleTargets.map(item => `<span>${escapeHtml(item.name)}</span>`).join("")}</div>
    <p class="modal-note">The 20 live guides are reviewed, muted, local motion loops. The remaining movements keep their written coaching until each replacement passes movement, equipment, visual, and licensing review.</p>
  </div>`;
}

function renderGymSetup(state) {
  const profile = state.gymProfile || {};
  const selected = new Set(profile.equipment || []);
  return `<div class="gym-setup-modal">
    <label><span>Gym name</span><input id="gym-name" maxlength="120" value="${escapeHtml(profile.selectedGymName || "")}" placeholder="Crunch Fitness, Planet Fitness, home gym"></label>
    <label><span>Address or note</span><input id="gym-address" maxlength="180" value="${escapeHtml(profile.selectedGymAddress || "")}" placeholder="Optional · keep this general"></label>
    <div class="equipment-stack">
      ${EQUIPMENT_OPTIONS.map(item => `<label><span>${escapeHtml(item)}</span><input type="checkbox" data-action="gym-toggle-equipment" data-value="${escapeHtml(item)}" ${selected.has(item) ? "checked" : ""}></label>`).join("")}
    </div>
    <p class="modal-note">Automatic gym discovery is not available in this web version. Your manual equipment profile stays on this device.</p>
  </div>`;
}

function renderCommunityDraft(context) {
  const modal = context.modal || {};
  return `<div class="community-draft-modal">
    <div class="draft-camera-box">
      ${context.communityPreviewUrl ? `<img src="${escapeHtml(context.communityPreviewUrl)}" alt="Local progress photo preview">` : `<span>${icon("camera")}<b>Add a progress photo</b><small>The photo preview disappears when you close this draft.</small></span>`}
      <input type="file" accept="image/*" data-action="community-photo" aria-label="Choose a progress photo">
    </div>
    <label><span>Caption draft</span><textarea id="community-caption" maxlength="280" rows="4" placeholder="Example: Week 3 check-in. Better consistency, same plan.">${escapeHtml(modal.caption || "")}</textarea></label>
    <div class="community-visibility" role="radiogroup" aria-label="Draft visibility"><span>Who is this for?</span><div><button role="radio" aria-checked="${modal.visibility === "private"}" class="${modal.visibility === "private" ? "active" : ""}" data-action="community-visibility" data-value="private"><b>Only me</b><small>Private local draft</small></button><button role="radio" aria-checked="${modal.visibility === "founders"}" class="${modal.visibility === "founders" ? "active" : ""}" data-action="community-visibility" data-value="founders"><b>My team</b><small>Label only · no sharing yet</small></button><button role="radio" aria-checked="${modal.visibility === "public_preview"}" class="${modal.visibility === "public_preview" ? "active" : ""}" data-action="community-visibility" data-value="public_preview"><b>Community later</b><small>Publishing is not available</small></button></div></div>
    <p class="modal-note">No public feed or image upload is active. This surface saves a local draft only.</p>
  </div>`;
}

export function renderModal(modal, context) {
  if (!modal) return "";
  const modalContext = { ...context, modal };
  if (typeof modal.type === "string" && modal.type.startsWith("nutrition-")) {
    const content = renderNutritionModalContent(modal, context);
    if (!content) return "";
    return shell(content.title, content.body, content.actions, { eyebrow: content.eyebrow });
  }
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
    return shell("Why this action cleared",`<p>${escapeHtml(decision.why)}</p><div class="receipt-box"><span>${icon("check")}</span><p><b>${escapeHtml(decision.type.replaceAll("_"," "))}</b><small>Decision ${escapeHtml(decision.id.slice(0,12))} · current plan and training context</small></p></div><div class="approval-boundary">${icon("info")}<p>This is the short explanation for the action. Your trainer cannot choose or apply it.</p></div>`,button({label:"Got it",action:"close-modal",variant:"primary"}),{eyebrow:"DECISION RECEIPT"});
  }
  if (modal.type === "why-workout") {
    const plan = context.state.activePlan;
    return shell("Why this workout?",`<p>This plan uses your saved goal, time, location, equipment, and workout history. It is not medical advice or live form assessment.</p><div class="evidence-grid"><span><small>GOAL</small><b>${escapeHtml(context.state.profile.goal)}</b></span><span><small>TIME</small><b>${plan.minutes} minutes</b></span><span><small>LOCATION</small><b>${escapeHtml(plan.location)}</b></span><span><small>EQUIPMENT</small><b>${escapeHtml(plan.equipment)}</b></span><span><small>INTENSITY</small><b>${escapeHtml(plan.intensity)}</b></span><span><small>HISTORY</small><b>${context.state.sessions.length} sessions</b></span></div>`,button({label:"Open workout",action:"route",value:"train",variant:"primary"}),{eyebrow:"PLAN EVIDENCE"});
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
    return shell("Clear the Coach thread?","<p>This removes saved text messages from this local profile. Workout history and exercise preferences remain.</p>",button({label:"Keep thread",action:"close-modal",variant:"quiet"})+button({label:"Clear thread",action:"confirm-clear-chat",variant:"danger"}),{eyebrow:"LOCAL DATA"});
  }
  if (modal.type === "confirm-reset") {
    return shell("Reset FitCoach on this device?","<p>This removes your current workouts, Coach thread, settings, food diary, and exercise preferences from this local profile.</p>",button({label:"Cancel",action:"close-modal",variant:"quiet"})+button({label:"Reset FitCoach",action:"confirm-reset",variant:"danger"}),{eyebrow:"LOCAL DATA"});
  }
  if (modal.type === "offline") {
    return shell("Live Coach is offline","<p>Your workout, exercise library, timer, set logging, and local plans remain available. FitCoach will not queue or retry a voice transcript automatically.</p>",button({label:"Continue locally",action:"close-modal",variant:"primary"}),{eyebrow:"OFFLINE MODE"});
  }
  if (modal.type === "apple-health") {
    return shell("Sync with Apple Health", renderAppleHealthPlan(context.state), button({ label: "Save my interest", action: "mark-apple-health-planned", variant: "primary" }) + button({ label: "Not now", action: "close-modal", variant: "quiet" }), { eyebrow: "APPLE HEALTH" });
  }
  if (modal.type === "pro-preview") {
    return shell("FitCoach Pro", renderProPreview(context.state), button({ label: "Not now", action: "close-modal", variant: "quiet" }) + button({ label: "Save my preference", action: "mark-pro-preview", variant: "primary" }), { eyebrow: "MEMBERSHIP PREVIEW" });
  }
  if (modal.type === "exercise-roadmap") {
    return shell("100-exercise guide expansion", renderExerciseRoadmap(), button({ label: "Open current library", action: "open-library", variant: "primary" }) + button({ label: "Close", action: "close-modal", variant:"quiet" }), { eyebrow: "MOVEMENT LIBRARY", wide: true });
  }
  if (modal.type === "gym-setup") {
    return shell("Gym and equipment setup", renderGymSetup(context.state), button({ label: "Save equipment profile", action: "save-gym-profile", variant: "primary" }) + button({ label: "Cancel", action: "close-modal", variant: "quiet" }), { eyebrow: "AVAILABLE EQUIPMENT", wide: true });
  }
  if (modal.type === "community-draft") {
    return shell("Draft a progress post", renderCommunityDraft(modalContext), button({ label: "Save local draft", action: "save-community-draft", variant: "primary" }) + button({ label: "Cancel", action: "close-modal", variant: "quiet" }), { eyebrow: "PROGRESS DRAFT" });
  }
  return shell("FitCoach",`<p>${escapeHtml(modal.message || "Nothing to review.")}</p>`,button({label:"Close",action:"close-modal",variant:"primary"}));
}
