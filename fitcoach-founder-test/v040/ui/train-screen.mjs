import { SESSION_MINUTES } from "../core/constants.mjs";
import { escapeHtml, formatDate } from "../core/utils.mjs";
import { restSecondsRemaining } from "../domain/workouts.mjs";
import {
  button,
  emptyState,
  exerciseMotionGuide,
  exerciseMotionMedia,
  exercisePoster,
  icon,
  muscleMap,
  planExerciseRow,
  renderExerciseCard,
} from "./components.mjs";

function segmentControl(segment) {
  return `<div class="segment-control" role="tablist" aria-label="Train sections"><button role="tab" aria-selected="${segment === "workout"}" class="${segment === "workout" ? "active" : ""}" data-action="train-segment" data-value="workout">My Workout</button><button role="tab" aria-selected="${segment === "schedule"}" class="${segment === "schedule" ? "active" : ""}" data-action="train-segment" data-value="schedule">Schedule</button><button role="tab" aria-selected="${segment === "exercises"}" class="${segment === "exercises" ? "active" : ""}" data-action="train-segment" data-value="exercises">Exercises</button></div>`;
}

function workoutPlan({ state, plan, exerciseById }) {
  const muscles = [...new Set(plan.exercises.flatMap(item => item.snapshot.primaryMuscles || []))];
  return `<div class="train-workout-view">
    <section class="workout-hero teal-panel"><span class="eyebrow">MY WORKOUT · ${escapeHtml(plan.detail.toUpperCase())}</span><h1>${escapeHtml(plan.label)}</h1><p>${escapeHtml(plan.goal)} · ${escapeHtml(plan.location)} · ${escapeHtml(plan.equipment)}</p><div class="workout-metrics"><span>${icon("clock")}<b>${plan.minutes} min</b></span><span>${icon("train")}<b>${plan.exercises.length} exercises</b></span><span>${icon("equipment")}<b>${escapeHtml(muscles.slice(0, 3).join(" · ") || "Full body")}</b></span></div>${button({ label: state.activeWorkout ? "Resume active workout" : "Start workout", action: state.activeWorkout ? "resume-workout" : "start-workout", value: plan.id, variant: "primary", iconName: "play" })}</section>

    <section class="plan-adjust card"><header class="section-heading"><div><span class="eyebrow">FAST ADJUST</span><h2>Change only what today needs</h2></div><span class="soft-badge">Approval required</span></header><div class="control-block"><span>Session length</span><div class="choice-row">${SESSION_MINUTES.map(value => `<button class="choice-chip ${plan.minutes === value ? "active" : ""}" data-action="propose-plan" data-field="minutes" data-value="${value}">${value}<small>min</small></button>`).join("")}</div></div><div class="control-grid"><div class="control-block"><span>Location</span><div class="choice-row compact">${["gym","home","travel"].map(value => `<button class="choice-chip ${plan.location === value ? "active" : ""}" data-action="propose-plan" data-field="location" data-value="${value}">${escapeHtml(value)}</button>`).join("")}</div></div><div class="control-block"><span>Volume</span><div class="choice-row compact">${["light","standard","push"].map(value => `<button class="choice-chip ${plan.intensity === value ? "active" : ""}" data-action="propose-plan" data-field="intensity" data-value="${value}">${escapeHtml(value)}</button>`).join("")}</div></div></div></section>

    <section class="plan-list card"><header class="section-heading"><div><span class="eyebrow">SESSION ORDER</span><h2>${plan.exercises.length} movements</h2></div><button class="text-button" data-action="add-exercise">${icon("plus")} Add exercise</button></header><div>${plan.exercises.map((item,index) => planExerciseRow(item,index,exerciseById(item.exerciseId),state.settings.units)).join("")}</div><footer class="plan-footer"><span>Warm-up ${plan.warmupMinutes} min · cooldown ${plan.cooldownMinutes} min</span><div>${button({ label: "Save as routine", action: "save-routine", variant: "quiet" })}${button({ label: "Start workout", action: "start-workout", value: plan.id, variant: "primary" })}</div></footer></section>

    <section class="training-principles card"><span class="eyebrow">WHY THESE MOVES</span><div><article><b>01</b><span><strong>Goal aligned</strong><small>Patterns match ${escapeHtml(state.profile.goal)} without inventing a new program.</small></span></article><article><b>02</b><span><strong>Context compatible</strong><small>Equipment and location filters change only affected movements.</small></span></article><article><b>03</b><span><strong>History aware</strong><small>Previous loads appear only when this device has a comparable log.</small></span></article></div></section>
  </div>`;
}

function exerciseLibrary({ state, exercises, filters }) {
  const muscles = [...new Set(exercises.flatMap(item => item.primaryMuscles))].slice(0, 8);
  const equipment = ["barbell", "dumbbell", "machine", "cable", "kettlebell", "bodyweight", "resistance band", "treadmill"]
    .filter(value => exercises.some(item => item.equipment.some(itemValue => String(itemValue).replace(/s$/, "") === value.replace(/s$/, ""))));
  const visualGuideCount = exercises.filter(item => item.guideStatus === "visual-guide").length;
  return `<div class="exercise-library-view">
    <section class="library-hero"><div><span class="eyebrow">EXERCISE LIBRARY</span><h1>Build a gym plan you can actually use.</h1><p>Search ${exercises.length} movements by muscle or equipment. Every movement includes setup, cues, and alternatives; visual guides appear only where the artwork is ready.</p></div><span class="library-count"><b>${exercises.length}</b><small>movements</small><em>${visualGuideCount} visual</em></span></section>
    <section class="library-tools card"><label class="search-field">${icon("search")}<input id="exercise-search" type="search" maxlength="80" placeholder="Search exercise or alias" value="${escapeHtml(filters.query || "")}"><button data-action="clear-exercise-search" aria-label="Clear search">${icon("close")}</button></label><div class="filter-scroll" aria-label="Exercise filters"><button class="filter-chip ${!filters.muscle ? "active" : ""}" data-action="filter-exercises" data-field="muscle" data-value="">All muscles</button>${muscles.map(value => `<button class="filter-chip ${filters.muscle === value ? "active" : ""}" data-action="filter-exercises" data-field="muscle" data-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join("")}</div><div class="filter-scroll" aria-label="Equipment filters"><button class="filter-chip ${!filters.equipment ? "active" : ""}" data-action="filter-exercises" data-field="equipment" data-value="">Any equipment</button>${equipment.map(value => `<button class="filter-chip ${filters.equipment === value ? "active" : ""}" data-action="filter-exercises" data-field="equipment" data-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join("")}</div><label class="favorite-filter"><input type="checkbox" data-action="filter-favorites" ${filters.favorites ? "checked" : ""}> Favorites only</label></section>
    ${exercises.length ? `<section class="exercise-grid">${exercises.map(exercise => renderExerciseCard(exercise,state.exercisePreferences)).join("")}</section>` : emptyState("No exercises match", "Try removing a filter or using another exercise name.", "clear-exercise-filters", "Clear filters")}
  </div>`;
}

function scheduleCard(slot) {
  return `<article class="schedule-card">
    <header><span class="schedule-day">${escapeHtml(slot.shortDayLabel)}</span><div><b>${escapeHtml(slot.label)}</b><small>${escapeHtml(slot.focus)}</small></div></header>
    <div class="schedule-meta"><span>${icon("clock")}${slot.minutes} min</span><span>${icon("train")}${slot.exerciseCount} movements</span></div>
    <p>${escapeHtml(slot.exerciseNames.join(" · "))}</p>
    <div class="schedule-muscles">${slot.muscles.map(value => `<span>${escapeHtml(value)}</span>`).join("")}</div>
    ${button({ label: `Start ${slot.label}`, action: "start-scheduled-workout", value: slot.id, variant: "primary", iconName: "play" })}
  </article>`;
}

function progressionRow(row) {
  const last = row.last
    ? `${row.last.weight}${escapeHtml(row.last.unit)} × ${row.last.reps} · ${escapeHtml(formatDate(row.last.date))}`
    : "No completed set yet";
  const best = row.best
    ? `${Math.round(row.best.volume).toLocaleString()} volume`
    : "First proof pending";
  const next = row.next.weight > 0
    ? `${row.next.weight}${escapeHtml(row.next.unit)} × ${row.next.reps}`
    : `${row.next.reps} clean reps`;
  return `<article class="progression-row">
    <div><small>${escapeHtml(row.muscles.join(" · ") || row.movementPattern)}</small><b>${escapeHtml(row.exerciseName)}</b><span>${escapeHtml(row.status)}</span></div>
    <dl><div><dt>Last</dt><dd>${escapeHtml(last)}</dd></div><div><dt>Next</dt><dd>${escapeHtml(next)}</dd></div><div><dt>Best</dt><dd>${escapeHtml(best)}</dd></div></dl>
    <p>${escapeHtml(row.evidence)}</p>
  </article>`;
}

function routineCard(routine) {
  const plan = routine.plan || {};
  const savedAt = routine.savedAt ? formatDate(routine.savedAt) : "Saved locally";
  const exercises = (plan.exercises || []).slice(0, 3).map(item => item.snapshot?.name || item.exerciseId).join(" · ");
  return `<article class="routine-card">
    <span>${icon("spark")}</span>
    <div><b>${escapeHtml(routine.label || plan.label || "Saved workout")}</b><small>${escapeHtml(savedAt)} · ${plan.minutes || "—"} min</small><p>${escapeHtml(exercises || "No exercise snapshot")}</p></div>
    <button class="icon-only" data-action="start-routine" data-value="${escapeHtml(routine.id)}" aria-label="Start saved routine">${icon("play")}</button>
  </article>`;
}

function scheduleView({ state, workoutSchedule = [], progressionRows = [] }) {
  const routines = state.workoutDrafts || [];
  return `<div class="schedule-view">
    <section class="schedule-hero teal-panel">
      <span class="eyebrow">WORKOUTS BY DAY</span>
      <h1>Plan the week, then just press start.</h1>
      <p>Each day keeps its own session thread. The trainer can open the right workout, but confirmed plan changes still require your approval.</p>
      <div class="schedule-week-strip">${workoutSchedule.map(slot => `<span><b>${escapeHtml(slot.shortDayLabel)}</b><small>${escapeHtml(slot.label.replace("Strength ","S").replace("Full-body ","FB "))}</small></span>`).join("")}</div>
    </section>

    <section class="schedule-plan-section">
      <header class="section-heading"><div><span class="eyebrow">WORKOUT SCHEDULE</span><h2>Different days, different sessions</h2></div><span class="soft-badge">${workoutSchedule.length} days</span></header>
      <div class="schedule-grid">${workoutSchedule.map(scheduleCard).join("")}</div>
    </section>

    <section class="progression-card card">
      <header class="section-heading"><div><span class="eyebrow">PROGRESSION TRACKER</span><h2>What to beat next</h2></div><span class="soft-badge">Local proof only</span></header>
      <div class="progression-list">${progressionRows.map(progressionRow).join("")}</div>
    </section>

    <section class="routine-library card">
      <header class="section-heading"><div><span class="eyebrow">SAVED WORKOUTS</span><h2>Your routine library</h2></div>${button({ label: "Save current", action: "save-routine", variant: "quiet", iconName: "plus" })}</header>
      ${routines.length ? `<div class="routine-list">${routines.map(routineCard).join("")}</div>` : emptyState("No saved routines yet", "Save the current workout, then it will appear here as a reusable local template.", "save-routine", "Save current workout")}
    </section>
  </div>`;
}

function exerciseDetail({ state, exercise, motionPaused = false, replacing = false }) {
  if (!exercise) return emptyState("Exercise unavailable", "The local exercise record could not be loaded.", "close-exercise", "Back to library");
  const media = exercise.media?.find(entry => ["poster", "png-two-position-guide", "svg-two-position-guide"].includes(entry.type)) || exercise.media?.[0];
  const motion = exerciseMotionMedia(exercise);
  const visualGuide = exercise.guideStatus === "visual-guide";
  return `<article class="exercise-detail">
    <header class="exercise-detail-nav"><button class="back-button" data-action="close-exercise" aria-label="Back to exercise library">←</button><strong>${escapeHtml(exercise.name)}</strong><button class="icon-only favorite-large" data-action="toggle-favorite" data-value="${escapeHtml(exercise.id)}" aria-label="Toggle favorite">${icon("heart")}</button></header>
    <section class="exercise-detail-visual card ${motion ? "motion-guide" : "static-guide"}"><div class="guide-stage">${exerciseMotionGuide(exercise,{className:"large concept-art",eager:true,paused:motionPaused})}</div><div class="media-facts"><span>${escapeHtml(motion ? "AI-created motion guide" : visualGuide ? `${media?.view || "side/front"} visual guide` : "Written coaching guide")}</span><span>${motion ? "Local looping demonstration" : visualGuide ? "Original local art" : "Motion guide in production"}</span><span>Not form analysis</span></div><span class="media-license">${escapeHtml(motion?.alt || (visualGuide ? media?.alt : "Use the setup, execution, and cue sections below before starting.") || "Original local guide")}</span></section>
    <header class="exercise-detail-header"><span class="eyebrow">${escapeHtml(exercise.movementPattern.replaceAll("-"," ").toUpperCase())}</span><h1>${escapeHtml(exercise.name)}</h1><p>${escapeHtml(exercise.primaryMuscles.join(" · "))} · ${escapeHtml(exercise.equipment.join(" · "))} · ${escapeHtml(exercise.difficulty)}</p><div>${button({label:replacing ? "Replace current exercise" : "Add to workout",action:replacing ? "confirm-exercise-replacement" : "add-exercise-to-plan",value:exercise.id,variant:"primary",iconName:"plus"})}</div></header>
    <div class="exercise-detail-grid">
      <section class="card muscle-panel"><span class="eyebrow">MUSCLE FOCUS</span>${muscleMap(exercise)}<div class="muscle-cloud">${exercise.primaryMuscles.map(value => `<strong>${escapeHtml(value)}</strong>`).join("")}${exercise.secondaryMuscles.map(value => `<span>${escapeHtml(value)}</span>`).join("")}</div><p>Highlighted areas describe intended training focus, not live muscle or form sensing.</p></section>
      <section class="card"><span class="eyebrow">SETUP</span><ol class="instruction-list">${exercise.setupSteps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol></section>
      <section class="card"><span class="eyebrow">EXECUTION</span><ol class="instruction-list">${exercise.executionSteps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol><div class="breathing-note"><b>Breathing</b><span>${escapeHtml(exercise.breathing)}</span></div></section>
      <section class="card"><span class="eyebrow">TRAINER CUES</span><div class="cue-list">${exercise.keyCues.map(cue => `<span>${icon("check")}${escapeHtml(cue)}</span>`).join("")}</div></section>
      <section class="card warning-card"><span class="eyebrow">COMMON MISTAKES</span><ul>${exercise.commonMistakes.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul><p>${escapeHtml(exercise.safetyNotes.join(" "))}</p></section>
      <section class="card alternatives-card"><span class="eyebrow">MAKE IT FIT</span><div><small>Easier option</small><b>${escapeHtml(exercise.regressions[0] || "Reduce the range")}</b></div><div><small>Harder progression</small><b>${escapeHtml(exercise.progressions[0] || "Add control before load")}</b></div>${exercise.alternatives[0] ? `<button data-action="open-exercise" data-value="${escapeHtml(exercise.alternatives[0])}"><small>Exercise alternative</small><b>Open ${escapeHtml(exercise.alternatives[0].replaceAll("-"," "))} →</b></button>` : ""}<button data-action="ask-about-exercise" data-value="${escapeHtml(exercise.id)}"><small>Need context?</small><b>Ask your trainer about this movement →</b></button></section>
    </div>
    <section class="preference-controls card"><span><b>Exercise preference</b><small>Saved locally and used for future plan options</small></span><div>${["preferred","reduced","excluded"].map(value => `<button class="filter-chip ${(state.exercisePreferences[value] || []).includes(exercise.id) ? "active" : ""}" data-action="set-exercise-preference" data-field="${value}" data-value="${escapeHtml(exercise.id)}">${value === "preferred" ? "More often" : value === "reduced" ? "Less often" : "Exclude"}</button>`).join("")}</div></section>
  </article>`;
}

function formatRest(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,"0")}`;
}

function activeWorkout({ state, exerciseById, now }) {
  const workout = state.activeWorkout;
  if (!workout) return "";
  const currentIndex = Math.min(workout.currentExerciseIndex || 0, workout.exercises.length - 1);
  const current = workout.exercises[currentIndex];
  const exercise = exerciseById(current.exerciseId) || current;
  const allSets = workout.exercises.flatMap(item => item.sets);
  const completed = allSets.filter(set => set.done).length;
  const rest = restSecondsRemaining(workout, now);
  const next = workout.exercises[currentIndex + 1];
  const previous = workout.exercises[currentIndex - 1];
  const paused = workout.status === "paused";
  return `<div class="active-workout-view">
    <header class="active-workout-top concept-nav"><button class="icon-only" data-action="minimize-workout" aria-label="Minimize workout">←</button><span><b>${escapeHtml(current.snapshot.name)}</b><small>${escapeHtml(workout.planLabel)} · Set ${Math.min(completed + 1, allSets.length)} of ${allSets.length}</small></span><button class="text-button danger" data-action="exit-workout">End</button></header>
    <section class="active-exercise-hero card concept-guide-card"><div class="active-guide-shell">${exercisePoster(exercise,{className:"active-large concept-art",eager:true})}<div class="active-muscle-pills">${(current.snapshot.primaryMuscles || []).slice(0,3).map(muscle => `<span>${escapeHtml(muscle)}</span>`).join("")}</div></div><div class="active-exercise-copy compact"><span class="eyebrow">EXERCISE ${currentIndex + 1} OF ${workout.exercises.length}</span><div><span><small>Previous</small><b>${current.target.suggestedWeight ? `${current.target.suggestedWeight}${escapeHtml(state.settings.units)}` : "No log"}</b></span><span><small>Today</small><b>${current.target.sets} × ${current.target.reps}</b></span></div></div></section>
    <section class="guide-action-list card"><button data-action="view-current-instructions">${icon("equipment")}<span>Setup</span>${icon("chevron")}</button><button data-action="view-current-instructions">${icon("play")}<span>How to move</span>${icon("chevron")}</button><button data-action="view-current-instructions">${icon("info")}<span>Common mistakes</span>${icon("chevron")}</button></section>
    <section class="workout-progress-line"><span style="width:${Math.round((completed / Math.max(1,allSets.length))*100)}%"></span><p>${completed}/${allSets.length} sets complete</p></section>
    ${rest || workout.restTimer?.paused ? `<section class="rest-timer" aria-live="off"><div><small>${workout.restTimer?.paused ? "REST PAUSED" : "REST TIMER"}</small><strong data-rest-display>${formatRest(rest || workout.restTimer?.durationSeconds || 0)}</strong><span>${paused ? "Resume the workout to continue the rest timer." : "Recovers from its end timestamp after navigation or refresh"}</span></div><div><button data-action="adjust-rest" data-value="-15" ${paused ? "disabled" : ""}>−15</button><button data-action="stop-rest" ${paused ? "disabled" : ""}>Skip</button><button data-action="adjust-rest" data-value="15" ${paused ? "disabled" : ""}>+15</button></div></section>` : ""}
    <section class="set-logger card"><header><span><b>Sets</b><small>${paused ? "Resume before editing sets" : "Tap the circle after the set"}</small></span><button class="text-button" data-action="add-set" ${paused ? "disabled" : ""}>+ Add set</button></header><div class="set-grid set-grid-head"><span>SET</span><span>${escapeHtml((workout.units || state.settings.units).toUpperCase())}</span><span>REPS</span><span>RPE</span><span>DONE</span></div>${current.sets.map((set,setIndex) => `<div class="set-grid ${set.done ? "done" : ""} ${set.error ? "invalid" : ""}"><span class="set-index">${set.kind === "warmup" ? "W" : setIndex + 1}</span><label><span class="sr-only">Weight set ${setIndex+1}</span><input inputmode="decimal" type="number" min="0" max="5000" step="0.5" data-action="set-field" data-field="weight" data-exercise-index="${currentIndex}" data-set-index="${setIndex}" value="${set.weight}" ${paused ? "disabled" : ""}></label><label><span class="sr-only">Reps set ${setIndex+1}</span><input inputmode="numeric" type="number" min="0" max="1000" data-action="set-field" data-field="reps" data-exercise-index="${currentIndex}" data-set-index="${setIndex}" value="${set.reps}" aria-invalid="${set.error ? "true" : "false"}" ${paused ? "disabled" : ""}></label><label><span class="sr-only">RPE set ${setIndex+1}</span><input inputmode="decimal" type="number" min="1" max="10" step="0.5" data-action="set-field" data-field="rpe" data-exercise-index="${currentIndex}" data-set-index="${setIndex}" value="${set.rpe ?? ""}" placeholder="—" ${paused ? "disabled" : ""}></label><button class="set-check" data-action="toggle-set" data-exercise-index="${currentIndex}" data-set-index="${setIndex}" aria-label="${set.done ? "Mark incomplete" : "Complete"} set ${setIndex+1}" aria-pressed="${set.done}" ${paused ? "disabled" : ""}>${set.done ? icon("check") : ""}</button>${set.error ? `<p class="set-error" role="alert">${escapeHtml(set.error)}</p>` : ""}</div>`).join("")}</section>
    <section class="workout-note card"><label for="workout-notes"><b>Workout notes</b><small>Stored locally with this workout</small></label><textarea id="workout-notes" maxlength="2000" placeholder="How did the session feel?">${escapeHtml(workout.notes || "")}</textarea></section>
    <section class="active-tools"><button data-action="swap-active-exercise" data-value="${currentIndex}" ${paused ? "disabled" : ""}>${icon("swap")}<span><b>Swap exercise</b><small>Before any set is logged</small></span></button><button data-action="reorder-active-exercise" data-value="${currentIndex}" data-direction="-1" ${currentIndex === 0 ? "disabled" : ""}>${icon("grip")}<span><b>Move up</b><small>Disabled at the boundary</small></span></button><button data-action="reorder-active-exercise" data-value="${currentIndex}" data-direction="1" ${currentIndex >= workout.exercises.length - 1 ? "disabled" : ""}>${icon("grip")}<span><b>Move down</b><small>Keep viewing this exercise</small></span></button><button data-action="toggle-workout-pause">${icon(workout.status === "paused" ? "play" : "pause")}<span><b>${workout.status === "paused" ? "Resume" : "Pause"}</b><small>Keep all set data</small></span></button></section>
    <section class="exercise-navigation card"><button data-action="previous-exercise" ${previous ? "" : "disabled"}>${icon("chevron")} Previous</button><button data-action="next-exercise" ${next ? "" : "disabled"}>Next ${icon("chevron")}</button></section>
    ${next ? `<section class="next-exercise card"><span class="eyebrow">UP NEXT</span>${exercisePoster(exerciseById(next.exerciseId) || next,{className:"thumb"})}<div><b>${escapeHtml(next.snapshot.name)}</b><small>${next.target.sets} × ${next.target.reps}</small></div><button class="icon-only" data-action="next-exercise" aria-label="Go to next exercise">${icon("chevron")}</button></section>` : ""}
    <div class="workout-finish-bar">${button({label:"Finish workout",action:"finish-workout",variant:"primary"})}</div>
  </div>`;
}

export function renderTrainScreen(context) {
  if (context.state.activeWorkout && context.ui.showActiveWorkout) return activeWorkout(context);
  if (context.ui.exerciseDetailId) return `<div class="page train-page">${segmentControl("exercises")}${exerciseDetail({ state: context.state, exercise: context.exerciseById(context.ui.exerciseDetailId), motionPaused: context.ui.motionPaused, replacing: context.ui.replacementIndex != null })}</div>`;
  const content = context.ui.trainSegment === "exercises"
    ? exerciseLibrary({ state: context.state, exercises: context.filteredExercises, filters: context.ui.exerciseFilters })
    : context.ui.trainSegment === "schedule"
      ? scheduleView(context)
      : workoutPlan(context);
  return `<div class="page train-page">${segmentControl(context.ui.trainSegment)}${content}</div>`;
}
