import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialState } from "../v040/core/store.mjs";
import { EXERCISES, filterExercises, getExerciseById } from "../v040/data/exercise-library.mjs";
import { buildPlan, startWorkoutFromPlan } from "../v040/domain/workouts.mjs";
import { renderTrainScreen } from "../v040/ui/train-screen.mjs";

const NOW = new Date("2026-09-04T14:00:00.000Z");

function context(overrides = {}) {
  const state = createInitialState("mo", NOW);
  state.activePlan = buildPlan(state, EXERCISES);
  return {
    state,
    plan: state.activePlan,
    exerciseById: getExerciseById,
    exerciseLibrary: EXERCISES,
    filteredExercises: EXERCISES,
    now: NOW,
    ui: { trainSegment: "workout", exerciseFilters: {} },
    ...overrides,
  };
}

test("planned workout retains every exercise action with the right record index", () => {
  const input = context();
  const before = JSON.stringify(input.state);
  const html = renderTrainScreen(input);
  input.plan.exercises.forEach((item, index) => {
    assert.ok(html.includes(`data-plan-exercise="${index}"`));
    for (const action of ["reorder-exercise", "swap-plan-exercise", "remove-plan-exercise"]) {
      assert.ok(html.includes(`data-action="${action}" data-value="${index}"`));
    }
    assert.ok(html.includes(`data-action="open-exercise" data-value="${item.exerciseId}"`));
  });
  assert.match(html, /data-action="start-workout"/);
  assert.match(html, /data-action="save-routine"/);
  assert.match(html, /data-action="why-workout"/);
  assert.match(html, /<details class="training-adjustment">/);
  assert.doesNotMatch(html, /<select\b|<option\b/);
  assert.equal(JSON.stringify(input.state), before);
});

test("a saved active session offers Resume everywhere and never starts a replacement", () => {
  const input = context();
  input.state.activeWorkout = startWorkoutFromPlan(input.plan, NOW);
  input.state.activeWorkout.exercises[0].sets[0].done = true;
  input.state.activeWorkout.notes = "Keep my session";
  const before = JSON.stringify(input.state);
  const html = renderTrainScreen(input);
  assert.match(html, /data-action="resume-workout"/);
  assert.match(html, /1 of \d+ sets logged/);
  assert.doesNotMatch(html, /data-action="start-workout"/);
  assert.equal(JSON.stringify(input.state), before);
});

test("empty filtered results retain the full catalogue's muscle and equipment controls", () => {
  const html = renderTrainScreen(context({
    filteredExercises: [],
    ui: { trainSegment: "exercises", exerciseFilters: { query: "missing move", muscle: "chest", equipment: "barbell" } },
  }));
  assert.match(html, /100 exercises\. Every move, made clear\./);
  assert.match(html, /No exercises match/);
  assert.match(html, /data-field="muscle" data-value="quadriceps"/);
  assert.match(html, /data-field="muscle" data-value="chest"/);
  assert.match(html, /data-field="equipment" data-value="barbell"/);
  assert.match(html, /data-field="equipment" data-value="bodyweight"/);
  assert.match(html, /data-action="clear-exercise-filters"/);
});

test("bodyweight discovery includes older no-equipment records without including loaded moves", () => {
  const bodyweight = filterExercises({ equipment: "bodyweight" });
  assert.ok(bodyweight.some(exercise => exercise.id === "air-squat"));
  assert.ok(bodyweight.some(exercise => exercise.id === "hip-hinge"));
  assert.ok(!bodyweight.some(exercise => exercise.id === "barbell-back-squat"));
  for (const exercise of EXERCISES.filter(record => record.equipment.includes("none"))) {
    assert.ok(bodyweight.some(record => record.id === exercise.id), `${exercise.id} must be discoverable`);
  }
  assert.deepEqual(filterExercises({ equipment: "none" }), bodyweight);
  assert.ok(getExerciseById("air-squat").equipment.includes("none"), "filtering must not mutate catalogue data");
});

test("library pagination stays bounded and every search surface escapes user text", () => {
  const html = renderTrainScreen(context({
    ui: { trainSegment: "exercises", exerciseFilters: { query: '\"><script>alert(1)</script>', page: 2 } },
  }));
  assert.equal([...html.matchAll(/class="exercise-card /g)].length, 20);
  assert.match(html, /data-action="exercise-page" data-value="1"/);
  assert.match(html, /data-action="exercise-page" data-value="3"/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /id="exercise-search"/);
  assert.match(html, /id="exercise-favorites"/);
});

test("all exercise detail pages retain coaching, anatomy, and plan modification controls", () => {
  for (const exercise of EXERCISES) {
    const input = context({ ui: { trainSegment: "exercises", exerciseDetailId: exercise.id, replacementIndex: 0 } });
    input.state.exercisePreferences.favorites = [exercise.id];
    const html = renderTrainScreen(input);
    assert.match(html, /data-action="confirm-exercise-replacement"/);
    assert.match(html, /data-action="close-exercise"/);
    assert.match(html, /data-action="ask-about-exercise"/);
    assert.match(html, /data-action="toggle-favorite"[^>]*aria-pressed="true"/);
    assert.match(html, /class="muscle-map"/);
    assert.match(html, /Common mistakes & safety/);
    assert.match(html, /data-action="set-exercise-preference" data-field="excluded"/);
    assert.equal([...html.matchAll(/<h1>/g)].length, 1);
  }
});

test("reviewed motion remains playable while rejected motion stays quarantined", () => {
  const reviewed = renderTrainScreen(context({ ui: { exerciseDetailId: "barbell-back-squat", motionPaused: false } }));
  assert.match(reviewed, /<video[^>]+data-media-video[^>]+muted loop playsinline autoplay/);
  assert.match(reviewed, /data-action="toggle-exercise-motion"/);
  assert.match(reviewed, /data-action="retry-exercise-motion"/);
  const rejected = renderTrainScreen(context({ ui: { exerciseDetailId: "hollow-body-hold", motionPaused: false } }));
  assert.doesNotMatch(rejected, /<video\b/);
  assert.match(rejected, /data-media-image/);
});

test("exercise details override legacy dark inheritance and keep the guide before supporting sections", () => {
  const css = readFileSync(new URL("../v040/ui/train-v060.css", import.meta.url), "utf8");
  assert.match(css, /\.train-page\.exercise-detail-page \{[^}]*color: var\(--text\);[^}]*background: transparent;/u);
  for (const [selector, order] of [["exercise-detail-nav",0], ["exercise-detail-visual",1], ["training-detail-heading",2], ["training-detail-action",3], ["training-detail-facts",4], ["training-key-cue",5], ["training-detail-sections",6], ["preference-controls",7]]) {
    assert.ok(css.includes(`.exercise-detail-page .training-detail > .${selector} { order: ${order};`), `${selector} must have an explicit position unaffected by legacy order rules`);
  }
  assert.match(css, /\.exercise-detail-page \.training-detail \.preference-controls b \{ color: var\(--text\); \}/u);
  assert.match(css, /\.exercise-detail-page \.training-detail \.preference-controls small \{ color: var\(--muted\); \}/u);
  assert.match(css, /\.exercise-detail-page \.training-detail \.preference-controls \.filter-chip \{ color: var\(--text\); background: var\(--surface-2\);/u);
});

test("paused logbook protects edits and retains units, notes, error and rest state", () => {
  const input = context({ ui: { showActiveWorkout: true } });
  input.state.activeWorkout = startWorkoutFromPlan(input.plan, NOW);
  const workout = input.state.activeWorkout;
  workout.status = "paused";
  workout.units = "kg";
  workout.notes = "<strong>my notes</strong>";
  workout.restTimer = { paused: true, durationSeconds: 45, running: false, endsAt: null };
  workout.exercises[0].sets[0].error = "Enter a valid rep count.";
  const before = JSON.stringify(input.state);
  const html = renderTrainScreen(input);
  assert.match(html, /data-rest-display>0:45/);
  assert.match(html, /<span>KG<\/span>/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /role="alert">Enter a valid rep count/);
  assert.match(html, /&lt;strong&gt;my notes&lt;\/strong&gt;/);
  assert.match(html, /data-action="add-set" disabled/);
  assert.match(html, /data-action="toggle-set"[^>]+disabled/);
  for (const action of ["toggle-workout-pause", "finish-workout", "previous-exercise", "next-exercise", "view-current-instructions"]) {
    assert.ok(html.includes(`data-action="${action}"`));
  }
  assert.equal(JSON.stringify(input.state), before);
});
