import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState } from "../v040/core/store.mjs";
import { localDateKey } from "../v040/core/utils.mjs";
import { EXERCISES } from "../v040/data/exercise-library.mjs";
import { deriveTrainerAction, isTrainerAction, TRAINER_ACTION_KINDS } from "../v040/domain/trainer-actions.mjs";
import { createTrainerPayload } from "../v040/services/trainer-client.mjs";

function fixture() {
  const state = createInitialState("mo");
  state.activeWorkout = { currentExerciseIndex: 1, exercises: [
    { exerciseId: "air-squat", snapshot: { id: "air-squat", name: "Old label" } },
    { exerciseId: "goblet-squat", snapshot: { id: "goblet-squat", name: "Untrusted snapshot name" } },
  ] };
  return state;
}
function action(message, state = fixture()) { return deriveTrainerAction({ state, message, exercises: EXERCISES }); }

test("explicit current-exercise requests resolve the active index to the catalogue guide", () => {
  const state = fixture();
  const before = JSON.stringify(state);
  for (const message of ["Show this exercise", "Show me the current exercise.", "Explain this move", "Open my current movement guide", "How do I do this exercise?", "How to perform the current move?", "Could you show me this exercise please?"]) {
    const result = action(message, state);
    assert.equal(result?.kind, "open_exercise", message);
    assert.equal(result.value, "goblet-squat", message);
    assert.equal(result.label, "Open Goblet Squat guide");
    assert.ok(isTrainerAction(result));
    assert.ok(Object.isFrozen(result));
  }
  assert.equal(JSON.stringify(state), before);
});

test("an explicitly named exercise wins over active context", () => {
  const result = action("Explain Barbell Back Squat instead of this exercise");
  assert.equal(result.kind, "open_exercise");
  assert.equal(result.value, "barbell-back-squat");
});

test("ambiguous, negative, previous and next references never guess the current exercise", () => {
  for (const message of ["Show this", "What is this?", "Show the next exercise", "Explain the previous move", "Don't show this exercise", "Explain this exercise or something else", "I was wondering about this exercise"]) {
    assert.equal(action(message), null, message);
  }
});

test("missing, empty, corrupt or unknown active snapshots fail closed", () => {
  for (const activeWorkout of [null, {}, { exercises: [] }, { exercises: [{ exerciseId: "goblet-squat" }], currentExerciseIndex: -1 },
    { exercises: [{ exerciseId: "goblet-squat" }], currentExerciseIndex: 2 },
    { exercises: [{ exerciseId: "goblet-squat" }], currentExerciseIndex: "0" },
    { exercises: [{ exerciseId: "goblet-squat" }], currentExerciseIndex: 0.5 },
    { exercises: [null] }, { exercises: [{ snapshot: { name: "Goblet Squat" } }] },
    { exercises: [{ exerciseId: "unknown", snapshot: { id: "goblet-squat", name: "Goblet Squat" } }] }]) {
    const state = fixture(); state.activeWorkout = activeWorkout;
    assert.equal(action("Show this exercise", state), null);
  }
  const state = fixture();
  assert.equal(deriveTrainerAction({ state, message: "Show this exercise", exercises: [] }), null);
});

test("valid legacy snapshot IDs and a missing index can resolve the first active move", () => {
  const state = fixture();
  state.activeWorkout = { exercises: [{ snapshot: { id: "air-squat", name: "Old name" } }] };
  assert.equal(action("Show this exercise", state).value, "air-squat");
});

test("resume and return requests use the existing read-only workout action", () => {
  for (const message of ["Resume workout", "Resume my workout", "Return to my workout", "Back to the workout", "Continue the workout please"]) {
    assert.equal(action(message).kind, "open_workout", message);
    assert.equal(action(message).value, "train");
  }
  const state = fixture(); state.activeWorkout = null;
  assert.equal(action("Return to my workout", state).kind, "open_workout");
});

test("nutrition cards show current confirmed energy and protein versus saved targets", () => {
  const state = fixture();
  state.nutrition.targets = { ...state.nutrition.targets, calories: 2200, protein: 140, userSet: true };
  const nutrients = { calories: 600, protein: 35, carbs: 65, fat: 20, fiber: 3, sugar: 5, sodium: 100 };
  state.nutrition.days[localDateKey(new Date())] = { entries: [
    { status: "confirmed", nutrients },
    { status: "draft", nutrients: { ...nutrients, calories: 9999, protein: 999 } },
  ] };
  const result = action("How many calories have I eaten today?", state);
  assert.equal(result.kind, "open_nutrition");
  assert.match(result.detail, /600 \/ 2200 kcal/u);
  assert.match(result.detail, /35 \/ 140 g protein confirmed today/u);
  assert.match(result.detail, /Drafts don't count/u);
  assert.doesNotMatch(result.detail, /9999|999|should eat|must eat|burn off/u);
  assert.ok(isTrainerAction(result));
  const protein = action("Show my protein gap", state);
  assert.match(protein.detail, /35 \/ 140 g protein confirmed today/u);
  assert.match(protein.detail, /105 g below target/u);
});

test("no food data remains an honest zero and protein above target is not called a deficit", () => {
  const state = fixture();
  const empty = action("Show my food diary", state);
  assert.match(empty.detail, /^0 \/ \d+ kcal · 0 \/ \d+ g protein confirmed today/u);
  state.nutrition.days[localDateKey(new Date())] = { entries: [{ status: "confirmed", nutrients: { calories: 1000, protein: 999, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 } }] };
  const protein = action("How much protein?", state);
  assert.match(protein.detail, /target reached in the log/u);
  assert.doesNotMatch(protein.detail, /below target|eat|consume/u);
});

test("context improvements preserve action kinds, approvals and provider payload privacy", () => {
  const state = fixture();
  const storage = {};
  const before = createTrainerPayload({ state, message: "Show this exercise", approvedAction: "SAY_NOTHING", storage });
  action("Show this exercise", state);
  action("Show my protein gap", state);
  const after = createTrainerPayload({ state, message: "Show this exercise", approvedAction: "SAY_NOTHING", storage });
  assert.deepEqual(after, before);
  assert.equal(TRAINER_ACTION_KINDS.length, 7);
  assert.equal(TRAINER_ACTION_KINDS.some(kind => /confirm|activate|write/iu.test(kind)), false);
  assert.equal(action("I only have 20 minutes for my workout", state).kind, "propose_minutes");
  assert.equal(action("Log chicken and rice as my lunch", state).kind, "nutrition_draft");
  assert.doesNotMatch(JSON.stringify(after.context), /nutrition|protein|calorie|currentExercise|activeWorkout/u);
});
