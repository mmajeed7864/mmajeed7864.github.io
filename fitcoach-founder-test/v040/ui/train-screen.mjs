import { SESSION_MINUTES } from "../core/constants.mjs";
import { escapeHtml, formatDate } from "../core/utils.mjs";
import { buildPersonalizedExerciseLists, paginateExercises } from "../domain/exercise-discovery.mjs";
import { restSecondsRemaining } from "../domain/workouts.mjs";
import { buildWarmupRamp, calculatePlateLoading } from "../domain/strength-tools.mjs";
import {
  button,
  displayEquipment,
  emptyState,
  exerciseMotionGuide,
  exerciseMotionMedia,
  exercisePoster,
  icon,
  muscleMap,
  renderExerciseCard,
} from "./components.mjs";

function segmentControl(segment) {
  return `<div class="segment-control" role="tablist" aria-label="Train sections">${[["workout", "My Workout"], ["schedule", "Schedule"], ["exercises", "Exercises"]].map(([value, label]) => `<button type="button" role="tab" id="train-tab-${value}" aria-controls="train-panel-${value}" aria-selected="${segment === value}" tabindex="${segment === value ? 0 : -1}" class="${segment === value ? "active" : ""}" data-action="train-segment" data-value="${value}">${label}</button>`).join("")}</div>`;
}

function titleCase(value) {
  return String(value || "").replaceAll("-", " ").replace(/\b\w/g, character => character.toUpperCase());
}

function workoutFocusTitle(muscles) {
  const values = new Set(muscles.map(value => String(value).toLowerCase()));
  const lower = ["quadriceps", "glutes", "hamstrings", "calves"].some(value => values.has(value));
  const upper = ["chest", "shoulders", "triceps", "biceps", "lats", "mid back"].some(value => values.has(value));
  if (lower && upper) return "Full-body strength";
  if (lower) return "Lower-body strength";
  if (upper) return "Upper-body strength";
  return "Today’s strength session";
}

function adjustmentTile({ label, detail, action, field, value, active = false }) {
  return `<button class="training-option ${active ? "active" : ""}" data-action="${escapeHtml(action)}" data-field="${escapeHtml(field)}" data-value="${escapeHtml(value)}" aria-pressed="${active}"><b>${escapeHtml(label)}</b><small>${escapeHtml(detail)}</small></button>`;
}

function trainingExerciseRow(item, index, exercise, units) {
  const name = item.snapshot?.name || exercise?.name || "Exercise";
  const muscles = item.snapshot?.primaryMuscles || exercise?.primaryMuscles || [];
  const target = item.target || {};
  return `<article class="training-movement" data-plan-exercise="${index}">
    <button class="training-movement-art" data-action="open-exercise" data-value="${escapeHtml(item.exerciseId)}" aria-label="View ${escapeHtml(name)} technique">${exercisePoster(exercise || item, { className: "training-row-poster", label: false })}<span aria-hidden="true">${String(index + 1).padStart(2, "0")}</span></button>
    <button class="training-movement-copy" data-action="open-exercise" data-value="${escapeHtml(item.exerciseId)}"><small>${escapeHtml(muscles.slice(0, 2).join(" · ") || "Full body")}</small><b>${escapeHtml(name)}</b><span><strong>${target.sets || 0} × ${target.reps || 0}</strong>${target.suggestedWeight ? ` · ${target.suggestedWeight} ${escapeHtml(units)}` : ""} · ${target.restSeconds || 90}s rest</span>${exerciseMotionMedia(exercise) ? `<em>${icon("play")} Motion guide</em>` : ""}</button>
    <details class="training-row-menu"><summary aria-label="Options for ${escapeHtml(name)}"><span aria-hidden="true">···</span></summary><div><button data-action="swap-plan-exercise" data-value="${index}">${icon("swap")} Swap exercise</button><button data-action="reorder-exercise" data-value="${index}">${icon("grip")} Reorder exercise</button><button data-action="remove-plan-exercise" data-value="${index}">${icon("close")} Remove exercise</button></div></details>
  </article>`;
}

function workoutPlan({ state, plan, exerciseById }) {
  if (!plan?.exercises?.length) return emptyState("Your next session starts here", "Explore the exercise library to build your workout.", "add-exercise", "Find exercises");
  const muscles = [...new Set(plan.exercises.flatMap(item => item.snapshot.primaryMuscles || []))];
  const coverExercise = plan.exercises.map(item => exerciseById(item.exerciseId)).find(Boolean);
  const focusTitle = workoutFocusTitle(muscles);
  const totalSets = plan.exercises.reduce((sum, item) => sum + (Number(item.target?.sets) || 0), 0);
  const activeSets = state.activeWorkout?.exercises?.flatMap(item => item.sets || []) || [];
  const startAction = state.activeWorkout ? "resume-workout" : "start-workout";
  const startLabel = state.activeWorkout ? "Resume workout" : "Start workout";
  return `<div class="train-workout-view training-workout">
    <header class="training-page-heading"><div><span class="eyebrow">YOUR NEXT SESSION</span><h1>Make time for stronger.</h1></div><button class="training-icon-button" data-action="train-segment" data-value="schedule" aria-label="View workout schedule">${icon("clock")}</button></header>
    ${state.activeWorkout ? `<button class="training-resume" data-action="resume-workout"><span class="training-resume-icon">${icon("play")}</span><span><b>${escapeHtml(state.activeWorkout.planLabel || "Workout in progress")}</b><small>${activeSets.filter(set => set.done).length} of ${activeSets.length} sets logged · Continue where you left off</small></span>${icon("chevron")}</button>` : ""}
    <section class="training-session-cover" aria-label="Planned workout">
      <div class="training-cover-copy"><span class="training-cover-label">${escapeHtml(plan.label)} <i></i> ${escapeHtml(titleCase(plan.location))}</span><h2>${escapeHtml(focusTitle)}</h2><p>${escapeHtml(titleCase(plan.goal))}</p><span class="training-cover-equipment">${escapeHtml(titleCase(plan.equipment || state.profile.equipment))}</span></div>
      ${coverExercise ? `<div class="training-cover-art" aria-hidden="true">${exercisePoster(coverExercise, { className: "training-cover-poster", eager: true, label: false })}</div>` : ""}
      <div class="training-session-stats"><span>${icon("clock")}<b>${plan.minutes}<small> min</small></b></span><span>${icon("train")}<b>${plan.exercises.length}<small> exercises</small></b></span><span>${icon("check")}<b>${totalSets}<small> sets</small></b></span></div>
      <div class="training-cover-action">${button({ label: startLabel, action: startAction, value: plan.id, variant: "primary", iconName: "play" })}</div>
    </section>

    <details class="training-adjustment"><summary><span class="training-adjustment-icon">${icon("swap")}</span><span><b>Make it fit today</b><small>${plan.minutes} min · ${escapeHtml(titleCase(plan.location))} · ${escapeHtml(titleCase(plan.intensity))}</small></span>${icon("chevron")}</summary><div class="training-adjustment-body"><fieldset><legend>Time available</legend><div class="training-options training-options-minutes">${SESSION_MINUTES.map(value => adjustmentTile({ label: String(value), detail: "min", action: "propose-plan", field: "minutes", value: String(value), active: plan.minutes === value })).join("")}</div></fieldset><fieldset><legend>Training space</legend><div class="training-options">${[
      ["gym", "Gym", "Full equipment"],
      ["home", "Home", "Your space"],
      ["travel", "Travel", "Pack light"],
    ].map(([value, label, detail]) => adjustmentTile({ label, detail, action: "propose-plan", field: "location", value, active: plan.location === value })).join("")}</div></fieldset><fieldset><legend>Effort</legend><div class="training-options">${[
      ["light", "Light", "Leave fresh"],
      ["standard", "Standard", "As planned"],
      ["push", "Push", "A little more"],
    ].map(([value, label, detail]) => adjustmentTile({ label, detail, action: "propose-plan", field: "intensity", value, active: plan.intensity === value })).join("")}</div></fieldset><p>Review each change before updating your plan.</p></div></details>

    <section class="training-session-list"><header class="training-section-heading"><div><span class="eyebrow">THE LINEUP</span><h2>Your exercises</h2></div><button class="training-inline-button" data-action="add-exercise">${icon("plus")} Add</button></header><div class="training-warmup"><span>${icon("flame")}</span><div><b>Ease into it</b><small>${plan.warmupMinutes} min warm-up · ${plan.cooldownMinutes} min cooldown</small></div></div><div class="training-movement-list">${plan.exercises.map((item,index) => trainingExerciseRow(item,index,exerciseById(item.exerciseId),state.settings.units)).join("")}</div><footer class="training-list-footer">${button({ label: "Save routine", action: "save-routine", variant: "quiet", iconName: "plus" })}<button class="training-inline-button" data-action="why-workout">Why this workout ${icon("chevron")}</button></footer></section>
    <button class="training-coach-link" data-action="route" data-value="coach"><span>${icon("spark")}</span><span><b>Train with your coach</b><small>Talk through today’s session.</small></span>${icon("chevron")}</button>
  </div>`;
}

function discoveryRail(label, copy, exercises, state) {
  if (!exercises.length) return "";
  return `<section class="discovery-rail"><header><div><span class="eyebrow">${escapeHtml(label.toUpperCase())}</span><h2>${escapeHtml(copy)}</h2></div><span>${exercises.length}</span></header><div class="discovery-scroll">${exercises.slice(0, 8).map(exercise => renderExerciseCard(exercise, state.exercisePreferences, { compact: true })).join("")}</div></section>`;
}

function exerciseLibrary({ state, exercises, exerciseLibrary: library, filters }) {
  const catalogue = library || exercises;
  const muscles = [...new Set(catalogue.flatMap(item => item.primaryMuscles))];
  const equipment = ["barbell", "dumbbell", "machine", "cable", "kettlebell", "bodyweight", "resistance band", "treadmill"]
    .filter(value => catalogue.some(item => displayEquipment(item.equipment).some(itemValue => String(itemValue).toLowerCase().replace(/s$/, "") === value.replace(/s$/, ""))));
  const hasActiveFilters = Boolean(filters.query || filters.muscle || filters.equipment || filters.favorites);
  const personalized = buildPersonalizedExerciseLists(catalogue, state.exercisePreferences);
  const pagination = paginateExercises(exercises, filters.page);
  const resultLabel = exercises.length === 1 ? "exercise" : "exercises";
  const filterRail = ({ label, field, allLabel, values, activeValue }) => `<section class="filter-rail" aria-label="${escapeHtml(label)} filters"><header><span>${escapeHtml(label)}</span><small>Swipe to explore</small></header><div class="filter-scroll" role="group" aria-label="${escapeHtml(label)} filters"><button type="button" class="filter-chip ${!activeValue ? "active" : ""}" data-action="filter-exercises" data-field="${escapeHtml(field)}" data-value="" aria-pressed="${!activeValue}">${escapeHtml(allLabel)}</button>${values.map(value => `<button type="button" class="filter-chip ${activeValue === value ? "active" : ""}" data-action="filter-exercises" data-field="${escapeHtml(field)}" data-value="${escapeHtml(value)}" aria-pressed="${activeValue === value}">${escapeHtml(value)}</button>`).join("")}</div></section>`;
  return `<div class="exercise-library-view training-library">
    <header class="training-page-heading"><div><span class="eyebrow">YOUR MOVEMENT LIBRARY</span><h1>Find your next move.</h1><p>${catalogue.length} exercises. Every move, made clear.</p></div></header>
    <section class="library-tools card" aria-label="Exercise discovery tools"><div class="library-search-row"><label class="search-field ${filters.query ? "has-clear" : ""}">${icon("search")}<input id="exercise-search" type="search" maxlength="80" placeholder="Search a move or muscle" value="${escapeHtml(filters.query || "")}" aria-label="Search exercises">${filters.query ? `<button class="search-clear" type="button" data-action="clear-exercise-search" aria-label="Clear exercise search">${icon("close")}</button>` : ""}</label><label class="favorite-filter ${filters.favorites ? "active" : ""}"><input id="exercise-favorites" class="sr-only" type="checkbox" data-action="filter-favorites" aria-label="Show favorite exercises only" ${filters.favorites ? "checked" : ""}><span class="favorite-filter-icon" aria-hidden="true">${icon("heart")}</span><span class="favorite-filter-copy"><b>Favorites</b><small>${filters.favorites ? "Showing" : "Only"}</small></span></label></div><details class="training-library-filters" ${filters.muscle || filters.equipment ? "open" : ""}><summary><span>${icon("equipment")} Muscle & equipment</span><small>${filters.muscle || filters.equipment ? escapeHtml([filters.muscle, filters.equipment].filter(Boolean).join(" · ")) : "Filter"}</small>${icon("chevron")}</summary><div>${filterRail({ label: "Muscle focus", field: "muscle", allLabel: "All muscles", values: muscles, activeValue: filters.muscle })}${filterRail({ label: "Equipment", field: "equipment", allLabel: "Any equipment", values: equipment, activeValue: filters.equipment })}</div></details></section>
    ${!hasActiveFilters ? `${discoveryRail("YOUR RECENT MOVES", "Recently viewed", personalized.recent, state)}${discoveryRail("YOUR COLLECTION", "Favorites", personalized.favorites, state)}` : ""}
    <header class="training-results-heading"><h2>${hasActiveFilters ? "Your results" : "Explore all moves"}<span>${exercises.length}</span></h2>${hasActiveFilters ? `<button class="filter-reset" type="button" data-action="clear-exercise-filters">Clear filters</button>` : `<span>Tap for technique</span>`}<p class="sr-only" role="status" aria-live="polite">${exercises.length} ${resultLabel} ${hasActiveFilters ? "matching your filters" : "ready to explore"}</p></header>
    ${exercises.length ? `<section class="exercise-grid" aria-label="Exercise results">${pagination.items.map(exercise => renderExerciseCard(exercise,state.exercisePreferences)).join("")}</section><nav class="library-pagination" aria-label="Exercise pages"><button data-action="exercise-page" data-value="${pagination.page - 1}" ${pagination.hasPrevious ? "" : "disabled"}>${icon("chevron", "flip")}<span>Previous</span></button><span role="status" aria-live="polite" aria-atomic="true"><b>${pagination.page}</b><small>of ${pagination.totalPages}</small></span><button data-action="exercise-page" data-value="${pagination.page + 1}" ${pagination.hasNext ? "" : "disabled"}><span>Next</span>${icon("chevron")}</button></nav>` : emptyState("No exercises match", "Try removing a filter or using another exercise name.", "clear-exercise-filters", "Clear filters")}
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
  return `<div class="schedule-view training-schedule">
    <section class="training-schedule-heading">
      <span class="eyebrow">YOUR TRAINING RHYTHM</span>
      <h1>A stronger week.</h1>
      <p>${workoutSchedule.length} planned sessions. One day at a time.</p>
      <div class="schedule-week-strip">${workoutSchedule.map(slot => `<span><b>${escapeHtml(slot.shortDayLabel)}</b><small>${escapeHtml(slot.label.replace("Strength ","S").replace("Full-body ","FB "))}</small></span>`).join("")}</div>
    </section>

    <section class="schedule-plan-section">
      <header class="training-section-heading"><div><span class="eyebrow">THE PLAN</span><h2>This week’s sessions</h2></div><span class="soft-badge">${workoutSchedule.length} days</span></header>
      <div class="schedule-grid">${workoutSchedule.map(scheduleCard).join("")}</div>
    </section>

    <details class="training-adjustment training-progression"><summary><span class="training-adjustment-icon">${icon("progress")}</span><span><b>Your next targets</b><small>Progression from your completed sets</small></span>${icon("chevron")}</summary><div class="training-adjustment-body progression-list">${progressionRows.length ? progressionRows.map(progressionRow).join("") : `<p>Complete your first workout to start tracking your next targets.</p>`}</div></details>

    <section class="routine-library card">
      <header class="section-heading"><div><span class="eyebrow">SAVED WORKOUTS</span><h2>Your routine library</h2></div>${button({ label: "Save current", action: "save-routine", variant: "quiet", iconName: "plus" })}</header>
      ${routines.length ? `<div class="routine-list">${routines.map(routineCard).join("")}</div>` : emptyState("Your saved routines will appear here", "Save a workout when you want a reliable starting point for another day.", "save-routine", "Save current workout")}
    </section>
  </div>`;
}

function exerciseDetail({ state, exercise, motionPaused = false, replacing = false }) {
  if (!exercise) return emptyState("Exercise unavailable", "The local exercise record could not be loaded.", "close-exercise", "Back to library");
  const motion = exerciseMotionMedia(exercise);
  const visualGuide = exercise.guideStatus === "visual-guide";
  const equipment = displayEquipment(exercise.equipment);
  const favorite = (state.exercisePreferences.favorites || []).includes(exercise.id);
  return `<article class="exercise-detail training-detail">
    <header class="exercise-detail-nav"><button class="back-button" data-action="close-exercise" aria-label="Back to exercise library">←</button><strong>Exercise guide</strong><button class="icon-only favorite-large ${favorite ? "active" : ""}" data-action="toggle-favorite" data-value="${escapeHtml(exercise.id)}" aria-label="${favorite ? "Remove from" : "Add to"} favorites" aria-pressed="${favorite}">${icon("heart")}</button></header>
    <header class="training-detail-heading"><span class="eyebrow">${escapeHtml(exercise.movementPattern.replaceAll("-", " ").toUpperCase())}</span><h1>${escapeHtml(exercise.name)}</h1><p>${escapeHtml(titleCase(exercise.primaryMuscles.join(" · ")))}</p></header>
    <section class="exercise-detail-visual card ${motion ? "motion-guide" : "static-guide"}">
      <div class="guide-stage">${exerciseMotionGuide(exercise,{className:"large concept-art",eager:true,paused:motionPaused})}</div>
      <div class="training-guide-caption"><span>${icon(motion ? "play" : "camera")}${motion ? "Motion guide" : visualGuide ? "Visual guide" : "Technique notes"}</span><small>${escapeHtml(titleCase(exercise.difficulty))}</small></div>
    </section>
    <div class="training-detail-action">${button({label:replacing ? "Replace current exercise" : "Add to workout",action:replacing ? "confirm-exercise-replacement" : "add-exercise-to-plan",value:exercise.id,variant:"primary",iconName:"plus"})}</div>
    <div class="training-detail-facts"><span>${icon("equipment")} ${escapeHtml(titleCase(equipment.join(" · ")))}</span><button data-action="ask-about-exercise" data-value="${escapeHtml(exercise.id)}">${icon("spark")} Ask coach</button></div>
    <section class="training-key-cue"><span>${icon("check")}</span><div><small>ONE CUE TO REMEMBER</small><p>${escapeHtml(exercise.keyCues[0] || exercise.executionSteps[0] || "Move with control.")}</p></div></section>
    <div class="training-detail-sections">
      <section class="card muscle-panel"><header class="training-section-heading"><div><span class="eyebrow">MUSCLE FOCUS</span><h2>Where you’ll feel it</h2></div></header>${muscleMap(exercise)}<div class="muscle-cloud">${exercise.primaryMuscles.map(value => `<strong>${escapeHtml(value)}</strong>`).join("")}${exercise.secondaryMuscles.map(value => `<span>${escapeHtml(value)}</span>`).join("")}</div></section>
      <section class="training-technique" aria-label="Exercise instructions"><h2>Dial in your technique</h2><details class="training-instruction"><summary><span>${icon("equipment")} Setup</span>${icon("chevron")}</summary><div><ol class="instruction-list">${exercise.setupSteps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol></div></details>
      <details class="training-instruction"><summary><span>${icon("play")} Movement & breathing</span>${icon("chevron")}</summary><div><ol class="instruction-list">${exercise.executionSteps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol><div class="breathing-note"><b>Breathing</b><span>${escapeHtml(exercise.breathing)}</span></div></div></details>
      <details class="training-instruction"><summary><span>${icon("spark")} Coaching cues</span>${icon("chevron")}</summary><div class="cue-list">${exercise.keyCues.map(cue => `<span>${icon("check")}${escapeHtml(cue)}</span>`).join("")}</div></details>
      <details class="training-instruction"><summary><span>${icon("info")} Common mistakes & safety</span>${icon("chevron")}</summary><div><ul>${exercise.commonMistakes.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul><p>${escapeHtml(exercise.safetyNotes.join(" "))}</p><p class="training-guide-note">Demonstration only. Muscle highlights show training focus; FitCoach does not assess live form.</p></div></details>
      <details class="training-instruction"><summary><span>${icon("swap")} Easier & harder options</span>${icon("chevron")}</summary><div class="training-alternatives"><div><small>Easier option</small><b>${escapeHtml(exercise.regressions[0] || "Reduce the range")}</b></div><div><small>Harder progression</small><b>${escapeHtml(exercise.progressions[0] || "Add control before load")}</b></div>${exercise.alternatives[0] ? `<button data-action="open-exercise" data-value="${escapeHtml(exercise.alternatives[0])}">Try ${escapeHtml(exercise.alternatives[0].replaceAll("-"," "))} ${icon("chevron")}</button>` : ""}</div></details></section>
    </div>
    <section class="preference-controls card"><span><b>Make it personal</b><small>Use this move in future plans</small></span><div>${["preferred","reduced","excluded"].map(value => `<button class="filter-chip ${(state.exercisePreferences[value] || []).includes(exercise.id) ? "active" : ""}" data-action="set-exercise-preference" data-field="${value}" data-value="${escapeHtml(exercise.id)}" aria-pressed="${(state.exercisePreferences[value] || []).includes(exercise.id)}">${value === "preferred" ? "More often" : value === "reduced" ? "Less often" : "Exclude"}</button>`).join("")}</div></section>
  </article>`;
}

function formatRest(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,"0")}`;
}

export function renderStrengthSetupHelper(exercise, current, unit) {
  const usesBarbell = (exercise?.equipment || current?.snapshot?.equipment || []).some(value => String(value).toLowerCase().includes("barbell"));
  const workingWeight = Number(current?.sets?.find(set => !set.done && Number(set.weight) > 0)?.weight || current?.target?.suggestedWeight || 0);
  if (!usesBarbell || !(workingWeight > 0)) return "";
  const loading = calculatePlateLoading(workingWeight, unit);
  const ramp = buildWarmupRamp(workingWeight, unit);
  if (!loading) return "";
  const plates = loading.perSide.length
    ? loading.perSide.map(plate => `<span><b>${plate.weight}${escapeHtml(unit)}</b><small>× ${plate.count} / side</small></span>`).join("")
    : `<span><b>Empty bar</b><small>${loading.barWeight}${escapeHtml(unit)}</small></span>`;
  return `<details class="strength-helper card" data-strength-working-weight="${workingWeight}"><summary><span>${icon("equipment")}</span><span><b>Bar setup & warm-up</b><small>${loading.exact ? `Load ${workingWeight}${escapeHtml(unit)} exactly` : `Nearest safe loading: ${loading.loadedWeight}${escapeHtml(unit)}`}</small></span>${icon("chevron")}</summary><div class="strength-helper-body"><section><span class="eyebrow">PLATES PER SIDE</span><div class="plate-receipt">${plates}</div>${loading.exact ? "" : `<p>Your available standard plates cannot make the exact target. This shows ${loading.loadedWeight}${escapeHtml(unit)} instead of silently rounding.</p>`}</section>${ramp.length ? `<section><span class="eyebrow">OPTIONAL WARM-UP RAMP</span><div class="warmup-ramp">${ramp.map(stage => `<span><b>${stage.weight}${escapeHtml(unit)}</b><small>${stage.reps} reps · ${stage.actualPercent}%</small></span>`).join("")}</div></section>` : ""}<p class="strength-helper-note">Calculator only. Use a load and warm-up that fit your experience and equipment.</p></div></details>`;
}

function activeWorkout({ state, exerciseById, now, ui }) {
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
  return `<div class="active-workout-view training-active">
    <header class="active-workout-top concept-nav"><button class="icon-only" data-action="minimize-workout" aria-label="Minimize workout">←</button><span><b>${escapeHtml(current.snapshot.name)}</b><small>${escapeHtml(workout.planLabel)} · Set ${Math.min(completed + 1, allSets.length)} of ${allSets.length}</small></span><button class="text-button danger" data-action="exit-workout">End</button></header>
    <section class="active-exercise-hero card concept-guide-card"><div class="active-guide-shell">${exerciseMotionGuide(exercise,{className:"active-large concept-art",eager:true,paused:Boolean(ui?.motionPaused)})}<div class="active-muscle-pills">${(current.snapshot.primaryMuscles || []).slice(0,3).map(muscle => `<span>${escapeHtml(muscle)}</span>`).join("")}</div></div><div class="active-exercise-copy compact"><span class="eyebrow">EXERCISE ${currentIndex + 1} OF ${workout.exercises.length}</span><div><span><small>Suggested load</small><b>${current.target.suggestedWeight ? `${current.target.suggestedWeight}${escapeHtml(workout.units || state.settings.units)}` : "Choose a load"}</b></span><span><small>Today</small><b>${current.target.sets} × ${current.target.reps}</b></span></div></div></section>
    <section class="guide-action-list card"><button data-action="view-current-instructions">${icon("equipment")}<span>Setup</span>${icon("chevron")}</button><button data-action="view-current-instructions">${icon("play")}<span>How to move</span>${icon("chevron")}</button><button data-action="view-current-instructions">${icon("info")}<span>Common mistakes</span>${icon("chevron")}</button></section>
    <section class="workout-progress-line"><span style="width:${Math.round((completed / Math.max(1,allSets.length))*100)}%"></span><p>${completed}/${allSets.length} sets complete</p></section>
    ${rest || workout.restTimer?.paused ? `<section class="rest-timer" aria-live="off"><div><small>${workout.restTimer?.paused ? "REST PAUSED" : "RECOVER & RESET"}</small><strong data-rest-display>${formatRest(rest || workout.restTimer?.durationSeconds || 0)}</strong><span>${paused ? "Resume your workout to continue." : "Take a breath. Your next set is waiting."}</span></div><div><button data-action="adjust-rest" data-value="-15" ${paused ? "disabled" : ""} aria-label="Shorten rest by 15 seconds">−15</button><button data-action="stop-rest" ${paused ? "disabled" : ""}>Skip</button><button data-action="adjust-rest" data-value="15" ${paused ? "disabled" : ""} aria-label="Extend rest by 15 seconds">+15</button></div></section>` : ""}
    ${renderStrengthSetupHelper(exercise, current, workout.units || state.settings.units)}
    <section class="set-logger card"><header><span><b>Sets</b><small>${paused ? "Resume before editing sets" : "Tap the circle after the set"}</small></span><button class="text-button" data-action="add-set" ${paused ? "disabled" : ""}>+ Add set</button></header><div class="set-grid set-grid-head"><span>SET</span><span>${escapeHtml((workout.units || state.settings.units).toUpperCase())}</span><span>REPS</span><span>RPE</span><span>DONE</span></div>${current.sets.map((set,setIndex) => `<div class="set-grid ${set.done ? "done" : ""} ${set.error ? "invalid" : ""}"><span class="set-index">${set.kind === "warmup" ? "W" : setIndex + 1}</span><label><span class="sr-only">Weight set ${setIndex+1}</span><input inputmode="decimal" type="number" min="0" max="5000" step="0.5" data-action="set-field" data-field="weight" data-exercise-index="${currentIndex}" data-set-index="${setIndex}" value="${set.weight}" ${paused ? "disabled" : ""}></label><label><span class="sr-only">Reps set ${setIndex+1}</span><input inputmode="numeric" type="number" min="0" max="1000" data-action="set-field" data-field="reps" data-exercise-index="${currentIndex}" data-set-index="${setIndex}" value="${set.reps}" aria-invalid="${set.error ? "true" : "false"}" ${paused ? "disabled" : ""}></label><label><span class="sr-only">RPE set ${setIndex+1}</span><input inputmode="decimal" type="number" min="1" max="10" step="0.5" data-action="set-field" data-field="rpe" data-exercise-index="${currentIndex}" data-set-index="${setIndex}" value="${set.rpe ?? ""}" placeholder="—" ${paused ? "disabled" : ""}></label><button class="set-check" data-action="toggle-set" data-exercise-index="${currentIndex}" data-set-index="${setIndex}" aria-label="${set.done ? "Mark incomplete" : "Complete"} set ${setIndex+1}" aria-pressed="${set.done}" ${paused ? "disabled" : ""}>${set.done ? icon("check") : ""}</button>${set.error ? `<p class="set-error" role="alert">${escapeHtml(set.error)}</p>` : ""}</div>`).join("")}</section>
    <details class="training-instruction training-workout-notes"><summary><span>${icon("plus")} Workout notes</span>${icon("chevron")}</summary><div><label for="workout-notes" class="sr-only">Workout notes</label><textarea id="workout-notes" maxlength="2000" placeholder="How did the session feel?">${escapeHtml(workout.notes || "")}</textarea></div></details>
    <details class="training-instruction"><summary><span>${icon("equipment")} Session controls</span>${icon("chevron")}</summary><section class="active-tools"><button data-action="swap-active-exercise" data-value="${currentIndex}" ${paused ? "disabled" : ""}>${icon("swap")}<span><b>Swap exercise</b><small>Before any set is logged</small></span></button><button data-action="reorder-active-exercise" data-value="${currentIndex}" data-direction="-1" ${currentIndex === 0 ? "disabled" : ""}>${icon("grip")}<span><b>Move up</b><small>Earlier in the session</small></span></button><button data-action="reorder-active-exercise" data-value="${currentIndex}" data-direction="1" ${currentIndex >= workout.exercises.length - 1 ? "disabled" : ""}>${icon("grip")}<span><b>Move down</b><small>Later in the session</small></span></button><button data-action="toggle-workout-pause">${icon(workout.status === "paused" ? "play" : "pause")}<span><b>${workout.status === "paused" ? "Resume" : "Pause"}</b><small>Your sets stay saved</small></span></button></section></details>
    <section class="exercise-navigation card"><button data-action="previous-exercise" ${previous ? "" : "disabled"}>${icon("chevron")} Previous</button><button data-action="next-exercise" ${next ? "" : "disabled"}>Next ${icon("chevron")}</button></section>
    ${next ? `<section class="next-exercise card"><span class="eyebrow">UP NEXT</span>${exercisePoster(exerciseById(next.exerciseId) || next,{className:"thumb"})}<div><b>${escapeHtml(next.snapshot.name)}</b><small>${next.target.sets} × ${next.target.reps}</small></div><button class="icon-only" data-action="next-exercise" aria-label="Go to next exercise">${icon("chevron")}</button></section>` : ""}
    <div class="workout-finish-bar">${button({label:"Finish workout",action:"finish-workout",variant:"primary"})}</div>
  </div>`;
}

export function renderTrainScreen(context) {
  if (context.state.activeWorkout && context.ui.showActiveWorkout) return activeWorkout(context);
  if (context.ui.exerciseDetailId) return `<div class="page train-page exercise-detail-page">${exerciseDetail({ state: context.state, exercise: context.exerciseById(context.ui.exerciseDetailId), motionPaused: context.ui.motionPaused, replacing: context.ui.replacementIndex != null })}</div>`;
  const content = context.ui.trainSegment === "exercises"
    ? exerciseLibrary({ state: context.state, exercises: context.filteredExercises, exerciseLibrary: context.exerciseLibrary, filters: context.ui.exerciseFilters })
    : context.ui.trainSegment === "schedule"
      ? scheduleView(context)
      : workoutPlan(context);
  const segment = ["workout", "schedule", "exercises"].includes(context.ui.trainSegment) ? context.ui.trainSegment : "workout";
  const panels = ["workout", "schedule", "exercises"].map(value => `<div role="tabpanel" id="train-panel-${value}" aria-labelledby="train-tab-${value}" ${segment === value ? 'tabindex="0"' : "hidden"}>${segment === value ? content : ""}</div>`).join("");
  return `<div class="page train-page">${segmentControl(segment)}${panels}</div>`;
}
