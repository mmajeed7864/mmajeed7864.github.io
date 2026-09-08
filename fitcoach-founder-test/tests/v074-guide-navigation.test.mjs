import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { recordExerciseView } from "../v040/domain/exercise-discovery.mjs";

// Execute the shipped entry-point functions, not a duplicate navigation model.
const source = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
const start = source.indexOf("async function openExercise(");
const end = source.indexOf("async function applyPlanExercise(", start);
assert.ok(start > 0 && end > start);
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture({ reducedMotion = false } = {}) {
  let resolve, reject;
  const gate = new Promise((done, fail) => { resolve = done; reject = fail; });
  const saved = { exercisePreferences: { recent: [] }, activeWorkout: null };
  const notices = [], errors = [], renders = [], scrolls = [];
  let saves = 0, reads = 0;
  const store = {
    get() { reads++; return structuredClone(saved); },
    update(mutate) { saves++; return gate.then(() => { mutate(saved); return structuredClone(saved); }); },
  };
  const sandbox = {
    state: structuredClone(saved), store,
    ui: { route:"today", exerciseDetailId:null, showActiveWorkout:true },
    getExerciseById: id => ["squat", "curl"].includes(id) ? { id } : undefined,
    recordExerciseView,
    toast: message => notices.push(message),
    handleLocalSaveError: error => errors.push(error),
    render: () => renders.push({ ...sandbox.ui }),
    matchMedia: () => ({ matches:reducedMotion }),
    window: { scrollTo: position => scrolls.push(position) },
  };
  runInNewContext(source.slice(start, end), sandbox);
  return { sandbox, saved, resolve, reject, notices, errors, renders, scrolls,
    saves: () => saves, reads: () => reads };
}

test("opening a guide renders and resolves before a pending history save", async () => {
  const f = fixture({ reducedMotion:true });
  const opening = f.sandbox.openExercise("squat");
  assert.equal(f.sandbox.ui.exerciseDetailId, "squat");
  assert.equal(f.renders.length, 1);
  assert.equal(f.sandbox.ui.route, "train");
  assert.equal(f.sandbox.ui.showActiveWorkout, false);
  assert.equal(f.sandbox.ui.motionPaused, true);
  assert.equal(f.saves(), 1);
  let finished = false;
  opening.then(() => { finished = true; });
  await settle();
  assert.equal(finished, true, "coach navigation must not wait for history persistence");
  assert.deepEqual(f.saved.exercisePreferences.recent, []);
  f.resolve(); await settle();
  assert.deepEqual(f.saved.exercisePreferences.recent, ["squat"]);
  assert.deepEqual(f.sandbox.state.exercisePreferences.recent, ["squat"]);
  assert.equal(f.renders.length, 1, "history acknowledgement must not restart the video");
});

test("a history timeout keeps the guide usable and does not imply lost workout data", async () => {
  const f = fixture();
  await f.sandbox.openExercise("squat");
  f.reject(new Error("local_save_busy")); await settle();
  assert.equal(f.sandbox.ui.exerciseDetailId, "squat");
  assert.equal(f.renders.length, 1);
  assert.deepEqual(f.saved.exercisePreferences.recent, []);
  assert.deepEqual(f.errors, []);
  assert.match(f.notices[0], /Recently viewed history wasn’t saved/u);
  assert.equal(f.saves(), 1, "no automatic retry");
});

test("late history completion cannot navigate back or replace another store's state", async () => {
  const f = fixture();
  await f.sandbox.openExercise("squat");
  f.sandbox.ui.route = "nutrition";
  f.sandbox.ui.exerciseDetailId = null;
  const replacement = { account:"different local partition" };
  f.sandbox.state = replacement;
  f.sandbox.store = { get: () => replacement };
  f.resolve(); await settle();
  assert.equal(f.sandbox.ui.route, "nutrition");
  assert.equal(f.sandbox.state, replacement);
  assert.equal(f.renders.length, 1);
  assert.equal(f.scrolls.length, 1);
});

test("late history errors are quiet after leaving the guide or changing partitions", async () => {
  for (const changedStore of [false, true]) {
    const f = fixture();
    await f.sandbox.openExercise("squat");
    if (changedStore) f.sandbox.store = {};
    else { f.sandbox.ui.route = "today"; f.sandbox.ui.exerciseDetailId = null; }
    f.reject(new Error("local_save_busy")); await settle();
    assert.deepEqual(f.notices, []);
    assert.deepEqual(f.errors, []);
  }
});

test("reset before navigation never renders stale data; reset while saving invokes the existing privacy guard", async () => {
  const before = fixture();
  before.sandbox.store.get = () => { throw new Error("local_reset_detected"); };
  await assert.rejects(before.sandbox.openExercise("squat"), /local_reset_detected/u);
  assert.equal(before.renders.length, 0);
  assert.equal(before.saves(), 0);
  const during = fixture();
  await during.sandbox.openExercise("squat");
  during.reject(new Error("local_reset_detected")); await settle();
  assert.equal(during.errors[0]?.message, "local_reset_detected");
  assert.deepEqual(during.notices, []);
});

test("unknown exercise never reads or writes history, renders or scrolls", async () => {
  const f = fixture();
  await f.sandbox.openExercise("unknown");
  assert.equal(f.renders.length, 0);
  assert.equal(f.scrolls.length, 0);
  assert.equal(f.reads(), 0);
  assert.equal(f.saves(), 0);
  assert.match(f.notices[0], /unavailable/u);
});
