import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createCoordinatedFitCoachStore } from "../v040/core/coordinated-store.mjs";
import { EXERCISES } from "../v040/data/exercise-library.mjs";
import * as workouts from "../v040/domain/workouts.mjs";
import { safeNumber } from "../v040/core/utils.mjs";
import { renderTrainScreen } from "../v040/ui/train-screen.mjs";

const source = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
const start = source.indexOf("async function updateSetField(");
const end = source.indexOf("function formatClock(", start);
assert.ok(start > 0 && end > start);
async function fixture() {
  const values = new Map();
  const storage = { get length() { return values.size; }, key:i => [...values.keys()][i] ?? null,
    getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,String(value)), removeItem:key => values.delete(key) };
  let tail = Promise.resolve();
  const locks = { request(name, options, callback) {
    const next = tail.then(() => {
      if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      return callback({ name });
    });
    tail = next.catch(() => {}); return next;
  } };
  const a = createCoordinatedFitCoachStore({ storage, locks }), b = createCoordinatedFitCoachStore({ storage, locks });
  await a.load();
  await a.update(draft => { draft.activeWorkout = workouts.startWorkoutFromPlan(workouts.buildPlan(draft, EXERCISES)); });
  await b.load();
  const viewed = b.get().activeWorkout, exercise = viewed.exercises[0], set = exercise.sets[0];
  const element = { dataset:{ workoutId:viewed.id, exerciseId:exercise.exerciseId, setId:set.id, exerciseIndex:"0", setIndex:"0", field:"weight" }, value:"77",
    getAttribute: name => name === "aria-pressed" ? "false" : null };
  const notices = [];
  const sandbox = { state:b.get(), store:b, safeNumber, ...workouts, render:() => {}, toast:message => notices.push(message) };
  runInNewContext(source.slice(start,end), sandbox);
  return {a,b,viewed,element,exercise,set,sandbox,notices};
}

test("the real set editor keeps the rendered set identity after another tab reorders exercises", async () => {
  const f = await fixture();
  await f.a.update(draft => {
    const [first] = draft.activeWorkout.exercises.splice(0,1);
    draft.activeWorkout.exercises.splice(1,0,first);
  });
  // A non-rendering history save may refresh the underlying store without changing
  // the input the user still sees. Identity must come from that rendered input.
  await f.b.update(draft => { draft.exercisePreferences.recent = [f.exercise.exerciseId]; });
  f.sandbox.state = f.b.get();
  await f.sandbox.updateSetField(f.element);
  const latest = (await f.a.refresh()).activeWorkout;
  const intended = latest.exercises.find(item => item.exerciseId === f.exercise.exerciseId);
  assert.equal(intended.sets[0].weight, 77);
  assert.equal(latest.exercises[0].sets[0].weight, f.viewed.exercises[1].sets[0].weight);
});

test("the real done button completes its original set after a concurrent reorder", async () => {
  const f = await fixture();
  await f.a.update(draft => { draft.activeWorkout.exercises.reverse(); });
  await f.sandbox.toggleSet(f.element);
  const latest = (await f.a.refresh()).activeWorkout;
  assert.equal(latest.exercises.find(item => item.exerciseId === f.exercise.exerciseId).sets[0].done, true);
  assert.equal(latest.exercises.filter(item => item.exerciseId !== f.exercise.exerciseId).flatMap(item => item.sets).some(set => set.done), false);
});

test("an old set control cannot write into a replacement exercise or a replacement workout", async () => {
  for (const action of ["swap", "new-workout"]) {
    const f = await fixture();
    await f.a.update(draft => {
      if (action === "swap") workouts.swapWorkoutExercise(draft.activeWorkout,0,EXERCISES.find(item => item.id !== f.exercise.exerciseId));
      else draft.activeWorkout = workouts.startWorkoutFromPlan(workouts.buildPlan(draft,EXERCISES));
    });
    await f.b.refresh(); f.sandbox.state = f.b.get();
    const before = JSON.stringify(f.b.get().activeWorkout);
    await assert.rejects(f.sandbox.updateSetField(f.element), /local_workout_changed/u);
    assert.equal(JSON.stringify((await f.a.refresh()).activeWorkout), before);
  }
});

test("pause in another tab is checked atomically instead of trusting the old screen", async () => {
  for (const method of ["updateSetField", "toggleSet"]) {
    const f = await fixture();
    await f.a.update(draft => { draft.activeWorkout.status = "paused"; });
    const before = JSON.stringify(f.a.get().activeWorkout);
    await assert.rejects(f.sandbox[method](f.element), /local_workout_paused/u);
    assert.equal(JSON.stringify((await f.a.refresh()).activeWorkout), before);
  }
});

test("two tabs marking the same set complete cannot toggle each other's completion off", async () => {
  const f = await fixture();
  const completedAt = "2026-09-08T12:00:00.000Z";
  await f.a.update(draft => {
    draft.activeWorkout.exercises[0].sets[0].done = true;
    draft.activeWorkout.exercises[0].sets[0].completedAt = completedAt;
  });
  await f.sandbox.toggleSet(f.element);
  const saved = (await f.a.refresh()).activeWorkout.exercises[0].sets[0];
  assert.equal(saved.done,true);
  assert.equal(saved.completedAt,completedAt);
});

test("explicit undo preserves intent and zero-rep validation is retained", async () => {
  const f = await fixture();
  await f.sandbox.toggleSet(f.element);
  f.element.getAttribute = name => name === "aria-pressed" ? "true" : null;
  await f.sandbox.toggleSet(f.element);
  assert.equal(f.b.get().activeWorkout.exercises[0].sets[0].done,false);
  f.element.dataset.field = "reps"; f.element.value = "0";
  await f.sandbox.updateSetField(f.element);
  f.element.getAttribute = name => name === "aria-pressed" ? "false" : null;
  await f.sandbox.toggleSet(f.element);
  const set = f.b.get().activeWorkout.exercises[0].sets[0];
  assert.equal(set.done,false);
  assert.match(set.error,/at least 1 rep/u);
});

test("every rendered set input and done control carries its stable workout, exercise and set IDs", async () => {
  const f = await fixture();
  const html = renderTrainScreen({ state:f.b.get(), ui:{showActiveWorkout:true}, exerciseById:id => EXERCISES.find(item => item.id === id), now:new Date() });
  const controls = [...html.matchAll(/<(?:input|button)\b[^>]*data-action="(?:set-field|toggle-set)"[^>]*>/gu)].map(match => match[0]);
  assert.equal(controls.length,f.exercise.sets.length*4);
  for (const [index,control] of controls.entries()) {
    assert.ok(control.includes(`data-workout-id="${f.viewed.id}"`));
    assert.ok(control.includes(`data-exercise-id="${f.exercise.exerciseId}"`));
    assert.ok(control.includes(`data-set-id="${f.exercise.sets[Math.floor(index/4)].id}"`));
  }
});

test("stable set lookup refuses missing, ambiguous and retired identities without changing data", async () => {
  const f = await fixture();
  const identity = f.element.dataset;
  for (const target of [undefined, null, {}, {...identity,setId:""}, {...identity,setId:"deleted"}, {...identity,exerciseId:"other"}, {...identity,workoutId:"other"}]) {
    assert.throws(() => workouts.resolveWorkoutSet(f.viewed,target), /local_workout_changed/u);
  }
  const duplicate = structuredClone(f.viewed);
  duplicate.exercises[0].sets.push({...duplicate.exercises[0].sets[0]});
  assert.throws(() => workouts.resolveWorkoutSet(duplicate,identity), /local_workout_changed/u);
  assert.throws(() => workouts.resolveWorkoutSet({...f.viewed,status:"completed"},identity), /local_workout_changed/u);
  assert.throws(() => workouts.resolveWorkoutSet({...f.viewed,exercises:{}},identity), /local_workout_changed/u);
  assert.deepEqual(f.viewed, f.b.get().activeWorkout);
});

test("set identity survives set reordering and missing IDs never fall back to an array index", async () => {
  const f = await fixture();
  await f.a.update(draft => { draft.activeWorkout.exercises[0].sets.reverse(); });
  await f.sandbox.updateSetField(f.element);
  const sets = (await f.a.refresh()).activeWorkout.exercises[0].sets;
  assert.equal(sets.find(set => set.id === f.set.id).weight,77);
  assert.equal(sets[0].weight,0);
  delete f.element.dataset.setId;
  const before = JSON.stringify(f.a.get().activeWorkout);
  await assert.rejects(f.sandbox.updateSetField(f.element), /local_workout_changed/u);
  assert.equal(JSON.stringify((await f.a.refresh()).activeWorkout),before);
});

test("paused stale inputs report an unsaved change with a persistent recovery notice", async () => {
  const f = await fixture();
  await f.a.update(draft => { draft.activeWorkout.status = "paused"; });
  await f.b.refresh(); f.sandbox.state = f.b.get();
  await assert.rejects(f.sandbox.updateSetField(f.element), /local_workout_paused/u);
  const notices = [], toasts = [];
  const sandbox = { showLocalDataNotice:message => notices.push(message), toast:message => toasts.push(message) };
  runInNewContext(source.slice(source.indexOf("function handleLocalSaveError("),source.indexOf("function observeLocalDataChange(")),sandbox);
  sandbox.handleLocalSaveError(new Error("local_workout_paused"));
  assert.equal(notices.length,1);
  assert.match(notices[0],/wasn’t saved/u);
  assert.match(notices[0],/Reload or resume/u);
  assert.deepEqual(toasts,notices);
});
