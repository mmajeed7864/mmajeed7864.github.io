import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialState } from "../v040/core/store.mjs";
import { EXERCISES, getExerciseById } from "../v040/data/exercise-library.mjs";
import { buildPlan, buildWorkoutSchedule, startWorkoutFromPlan } from "../v040/domain/workouts.mjs";
import { renderTrainScreen } from "../v040/ui/train-screen.mjs";

const NOW = new Date("2026-09-05T12:00:00Z");
const context = () => {
  const state = createInitialState("mo", NOW);
  state.activePlan = buildPlan(state, EXERCISES);
  return { state, plan: state.activePlan, exerciseById: getExerciseById, exerciseLibrary: EXERCISES, filteredExercises: EXERCISES, now: NOW, ui: { trainSegment: "workout", exerciseFilters: {} } };
};
const between = (html, start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));

test("the editorial session identity and stats reflect the actual plan, not fabricated activity", () => {
  const input = context();
  input.plan.id = "B";
  input.plan.minutes = 20;
  input.plan.exercises = input.plan.exercises.slice(0, 2);
  input.plan.exercises[0].target.sets = 2;
  input.plan.exercises[1].target.sets = 4;
  const before = JSON.stringify(input.state);
  const html = renderTrainScreen(input);
  assert.match(html, /<h1><span>SESSION<\/span><b>02<\/b><\/h1>/);
  assert.match(html, /<b>20<\/b><small>MINUTES<\/small>/);
  assert.match(html, /<b>2<\/b><small>MOVEMENTS<\/small>/);
  assert.match(html, /<b>6<\/b><small>WORKING SETS<\/small>/);
  assert.doesNotMatch(html, /streak|calories burned|personal record/i);
  assert.equal(JSON.stringify(input.state), before);
  input.plan.id = "schedule-3";
  assert.match(renderTrainScreen(input), /<span>SESSION<\/span><b>03<\/b>/);
  input.plan.id = "unknown";
  assert.match(renderTrainScreen(input), /<span>SESSION<\/span><b>—<\/b>/);
});

test("the interactive contact sheet retains exact exercise IDs and bounded eager image loading", () => {
  const input = context();
  const html = renderTrainScreen(input);
  const film = between(html, '<div class="training-filmstrip"', '<div class="training-session-stats"');
  assert.equal([...film.matchAll(/class="training-film-frame"/g)].length, input.plan.exercises.length);
  assert.equal([...film.matchAll(/loading="eager"/g)].length, Math.min(2,input.plan.exercises.length));
  for (const [index, item] of input.plan.exercises.entries()) {
    assert.ok(film.includes(`data-action="open-exercise" data-value="${item.exerciseId}"`));
    assert.ok(film.includes(`class="training-film-number" aria-hidden="true">${String(index+1).padStart(2,"0")}</span>`));
    assert.ok(html.includes(`data-plan-exercise="${index}"`));
    for (const action of ["swap-plan-exercise", "reorder-exercise", "remove-plan-exercise"]) assert.ok(html.includes(`data-action="${action}" data-value="${index}"`));
  }
  for (const action of ["start-workout", "save-routine", "add-exercise", "propose-plan", "why-workout"]) assert.ok(html.includes(`data-action="${action}"`));
});

test("resume mode preserves the stored active session and never offers a replacement start", () => {
  const input = context();
  input.state.activeWorkout = startWorkoutFromPlan(input.plan, NOW);
  input.state.activeWorkout.exercises[0].sets[0].done = true;
  input.state.activeWorkout.notes = "Saved between devices locally";
  const before = JSON.stringify(input.state);
  const html = renderTrainScreen(input);
  assert.match(html, /1 of \d+ sets logged/);
  assert.match(html, /data-action="resume-workout"/);
  assert.doesNotMatch(html, /data-action="start-workout"/);
  assert.equal(JSON.stringify(input.state), before);
});

test("the archive preserves all 100 discoverable records, pagination and independent facet controls", () => {
  const seen = new Set();
  const input = context();
  input.ui.trainSegment = "exercises";
  for (let page=1;page<=5;page++) {
    input.ui.exerciseFilters.page = page;
    const html = renderTrainScreen(input);
    assert.match(html, /THE MOVEMENT ARCHIVE/);
    assert.match(html, /<strong>100<\/strong>/);
    assert.match(html, /id="exercise-search"/);
    assert.match(html, /id="exercise-favorites"/);
    assert.match(html, /data-field="equipment" data-value="bodyweight"/);
    assert.match(html, /data-field="muscle" data-value="chest"/);
    assert.match(html, /aria-label="Exercise pages"/);
    for (const match of html.matchAll(/class="exercise-card [^"]*" data-exercise-id="([^"]+)"/g)) seen.add(match[1]);
  }
  assert.deepEqual([...seen].sort(), EXERCISES.map(exercise=>exercise.id).sort());
});

test("saved routines, each schedule slot, progression and empty states remain reachable", () => {
  const input = context();
  input.ui.trainSegment = "schedule";
  input.workoutSchedule = buildWorkoutSchedule(input.state, EXERCISES);
  input.state.workoutDrafts = [{id:"routine-my-session",label:"My & favourite session",savedAt:NOW.toISOString(),plan:input.plan}];
  const html = renderTrainScreen(input);
  assert.match(html, /THE<br>TRAINING<br>WEEK/);
  for (const slot of input.workoutSchedule) {
    assert.ok(html.includes(`data-action="start-scheduled-workout" data-value="${slot.id}"`));
    assert.ok(html.includes(`class="schedule-day">${slot.shortDayLabel}</span>`));
  }
  assert.match(html, /data-action="start-routine" data-value="routine-my-session"/);
  assert.match(html, /My &amp; favourite session/);
  assert.match(html, /data-action="save-routine"/);
  assert.match(html, /Your next targets/);
  assert.match(html, /Complete your first workout/);
});

test("all technique pages are media-first in the DOM and retain reviewed media, anatomy and customization", () => {
  for (const exercise of EXERCISES) {
    const input = context();
    input.ui.exerciseDetailId = exercise.id;
    const html = renderTrainScreen(input);
    assert.ok(html.indexOf('class="exercise-detail-visual') < html.indexOf('class="training-detail-heading"'), exercise.id);
    assert.ok(html.indexOf('class="training-detail-heading"') < html.indexOf('class="training-detail-sections"'), exercise.id);
    for (const action of ["close-exercise", "toggle-favorite", "add-exercise-to-plan", "ask-about-exercise", "set-exercise-preference"]) assert.ok(html.includes(`data-action="${action}"`), `${exercise.id}: ${action}`);
    assert.match(html, /class="muscle-map"/);
    assert.match(html, /Common mistakes & safety/);
    assert.equal([...html.matchAll(/<h1>/g)].length,1);
    if(exercise.id==="barbell-back-squat") assert.match(html, /<video[^>]+muted loop playsinline autoplay/);
    if(exercise.id==="hollow-body-hold") assert.doesNotMatch(html, /<video\b/);
  }
});

test("the live logbook renders one marker per real set and keeps all logger/rest/edit hooks", () => {
  const input = context();
  input.ui.showActiveWorkout = true;
  input.state.activeWorkout = startWorkoutFromPlan(input.plan,NOW);
  const workout=input.state.activeWorkout;
  workout.exercises[0].sets[0].done=true;
  workout.exercises[1].sets[0].done=true;
  workout.notes="<script>not markup</script>";
  workout.restTimer={running:true,paused:false,endsAt:new Date(NOW.getTime()+60000).toISOString(),durationSeconds:90};
  const before=JSON.stringify(input.state);
  const html=renderTrainScreen(input);
  const markers=between(html,'<div class="training-set-markers"','</div>');
  assert.equal([...markers.matchAll(/<span class=/g)].length,workout.exercises.flatMap(item=>item.sets).length);
  assert.equal([...markers.matchAll(/class="is-logged"/g)].length,2);
  assert.match(html, /data-rest-display>1:00/);
  assert.match(html, /&lt;script&gt;not markup&lt;\/script&gt;/);
  for(const action of ["set-field","toggle-set","add-set","stop-rest","adjust-rest","swap-active-exercise","reorder-active-exercise","previous-exercise","next-exercise","minimize-workout","toggle-workout-pause","finish-workout","exit-workout","view-current-instructions"]) assert.ok(html.includes(`data-action="${action}"`), action);
  assert.equal(JSON.stringify(input.state),before);
});

test("the replacement stylesheet owns full-page theme and order resets, touch targets, and reduced motion", () => {
  const css=readFileSync(new URL("../v040/ui/train-v070.css",import.meta.url),"utf8");
  assert.doesNotMatch(css, /@import|train-v060/);
  assert.match(css, /\.train-page\.exercise-detail-page \{[^}]*color: var\(--text\);[^}]*background: transparent;/);
  assert.match(css, /\.exercise-detail-page \.training-detail > \.exercise-detail-visual \{ order: 1;/);
  assert.match(css, /\.exercise-detail-page \.training-detail > \.training-detail-heading \{ order: 2;/);
  assert.match(css, /var\(--font-display/);
  assert.match(css, /var\(--font-body/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.training-cover-action \.button \{[^}]*min-height: 58px;/);
  assert.match(css, /@media \(max-width: 699px\) \{\s*\.training-workout \{ gap: 20px; \}\s*\.training-workout \.training-film-frame \{ aspect-ratio: 5 \/ 6; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition: none; animation: none; scroll-behavior: auto/);
  assert.match(css, /\.training-set-markers > \.is-logged/);
});

test("the actual Train tablist has editorial rules without losing its keyboard and panel contract", () => {
  const input = context();
  const css = readFileSync(new URL("../v040/ui/train-v070.css",import.meta.url),"utf8");
  assert.match(css, /\.train-page > \.segment-control \{[^}]*border-bottom: 1px solid var\(--training-line\);[^}]*border-radius: 0;[^}]*background: transparent;[^}]*box-shadow: none;/);
  assert.match(css, /\.train-page > \.segment-control > button \{[^}]*min-height: 52px;[^}]*border-bottom: 2px solid transparent;[^}]*border-radius: 0;/);
  assert.match(css, /\.train-page > \.segment-control > button\.active \{[^}]*border-bottom-color: var\(--primary\);[^}]*background: transparent;/);
  for (const segment of ["workout", "schedule", "exercises"]) {
    input.ui.trainSegment = segment;
    const html = renderTrainScreen(input);
    assert.match(html, /class="segment-control" role="tablist" aria-label="Train sections"/);
    assert.ok(html.includes(`id="train-tab-${segment}" aria-controls="train-panel-${segment}" aria-selected="true" tabindex="0"`));
    assert.ok(html.includes(`role="tabpanel" id="train-panel-${segment}" aria-labelledby="train-tab-${segment}" tabindex="0"`));
    const tabs = between(html, '<div class="segment-control"', '</div>');
    assert.equal([...tabs.matchAll(/data-action="train-segment"/g)].length,3);
  }
});
