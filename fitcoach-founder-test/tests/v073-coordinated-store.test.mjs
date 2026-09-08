import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createCoordinatedFitCoachStore, LOCAL_DATA_LOCK, LOCAL_RESET_KEY } from "../v040/core/coordinated-store.mjs";
import { createFitCoachStore } from "../v040/core/store.mjs";
import { addWater } from "../v040/domain/hydration.mjs";
import { createFoodEntry, addEntryToDay } from "../v040/domain/nutrition.mjs";
import { buildPlan, startWorkoutFromPlan, completeWorkout } from "../v040/domain/workouts.mjs";
import { EXERCISES } from "../v040/data/exercise-library.mjs";
import { createSyncCoordinator } from "../v040/services/sync-coordinator.mjs";
import { projectStateForEncryptedSync, syncAccountScope, syncStateDigest } from "../v040/domain/sync-projection.mjs";

function storageFixture() {
  const values = new Map();
  return {
    get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key),
  };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
// FIFO adapter only for deterministic contract tests; real browser tests use
// navigator.locks with separate pages, not this implementation.
function lockFixture() {
  let tail = Promise.resolve();
  return { request(name, options, callback) {
    assert.equal(name, LOCAL_DATA_LOCK);
    const next = tail.then(() => {
      if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      return callback({ name, mode: "exclusive" });
    });
    tail = next.catch(() => {});
    return next;
  } };
}
const DATE = new Date("2026-09-08T12:00:00Z");
async function pair() {
  const storage = storageFixture(), locks = lockFixture();
  const options = { storage, locks, clock: () => DATE };
  const a = createCoordinatedFitCoachStore(options), b = createCoordinatedFitCoachStore(options);
  await Promise.all([a.load(), b.load()]);
  return { storage, locks, a, b, options };
}
function logFood(draft, id) {
  const food = { name: `Test food ${id}`, servingLabel: "1 serving", per: { calories: 100, protein: 5, carbs: 10, fat: 4 } };
  const entry = createFoodEntry({ slot: "lunch", source: "manual", food });
  assert.ok(entry);
  addEntryToDay(draft.nutrition, "2026-09-08", entry);
}

test("queued edits in two tabs preserve all hydration and food entries", async () => {
  const { a, b } = await pair();
  await Promise.all(Array.from({ length: 30 }, (_, index) => [
    a.update(draft => { draft.hydration = addWater(draft.hydration, 250, DATE, `water-${index}`); }),
    b.update(draft => logFood(draft, index)),
  ]).flat());
  const next = await a.refresh();
  assert.equal(next.hydration.entries.length, 30);
  assert.equal(JSON.stringify(next.nutrition).match(/Test food /g)?.length, 30);
  assert.deepEqual(await b.refresh(), next);
});

test("preferences and exercise favorites do not overwrite another tab's changes", async () => {
  const { a, b } = await pair();
  await Promise.all([
    a.update(draft => { draft.settings.theme = "dark"; }),
    b.update(draft => { draft.exercisePreferences.favorites.push(EXERCISES[0].id); }),
  ]);
  const exported = JSON.parse(await a.export());
  assert.equal(exported.settings.theme, "dark");
  assert.deepEqual(exported.exercisePreferences.favorites, [EXERCISES[0].id]);
});

test("whole-copy restore refuses a stale baseline and preserves the latest saved entry", async () => {
  const { a, b } = await pair();
  const expected = a.get(), replacement = structuredClone(expected);
  replacement.profile.energy = 5;
  await b.update(draft => logFood(draft, "new"));
  await assert.rejects(a.replace(replacement, { expected }), /local_changes_during_sync/);
  assert.match(await a.export(), /Test food new/);
});

test("deletion invalidates older tabs and operations already queued after reset", async () => {
  const { a, b, storage, options } = await pair();
  await a.update(draft => logFood(draft, "old"));
  const results = await Promise.allSettled([a.reset(), b.update(draft => logFood(draft, "resurrected"))]);
  assert.equal(results[0].status, "fulfilled");
  assert.match(results[1].reason.message, /local_reset_detected/);
  assert.throws(() => b.get(), /local_reset_detected/);
  await assert.rejects(b.load(), /local_reset_detected/);
  assert.ok(storage.getItem(LOCAL_RESET_KEY));
  const reopened = createCoordinatedFitCoachStore(options);
  assert.doesNotMatch(JSON.stringify(await reopened.load()), /Test food/);
  await reopened.update(draft => { draft.settings.theme = "dark"; });
  assert.equal(reopened.get().settings.theme, "dark");
});

test("a stale workout action cannot edit a different workout started in another tab", async () => {
  const { a, b } = await pair();
  await a.update(draft => { draft.activeWorkout = startWorkoutFromPlan(buildPlan(draft, EXERCISES)); });
  await b.refresh();
  await a.update(draft => { draft.activeWorkout = startWorkoutFromPlan(buildPlan(draft, EXERCISES)); });
  await assert.rejects(b.update(draft => { draft.activeWorkout.notes = "stale notes"; }), /local_workout_changed/);
  assert.notEqual(a.get().activeWorkout.notes, "stale notes");
});

test("finishing a workout preserves food saved by another tab and records completion only once", async () => {
  const { a, b } = await pair();
  await a.update(draft => {
    draft.activeWorkout = startWorkoutFromPlan(buildPlan(draft, EXERCISES));
    const set = draft.activeWorkout.exercises[0].sets[0];
    set.done = true; set.reps = 8; set.completedAt = DATE.toISOString();
  });
  await b.update(draft => logFood(draft, "during-workout"));
  await a.update(draft => completeWorkout(draft, DATE).state);
  await a.update(draft => completeWorkout(draft, DATE).state);
  const next = await a.refresh();
  assert.equal(next.sessions.length, 1);
  assert.match(JSON.stringify(next.nutrition), /Test food during-workout/);
});

test("asynchronous mutations are rejected without committing an empty/partial state", async () => {
  const { a, storage } = await pair();
  const previous = storage.getItem(a.key());
  await assert.rejects(a.update(async draft => { draft.settings.theme = "dark"; }), /local_mutation_must_be_synchronous/);
  assert.equal(storage.getItem(a.key()), previous);
});

test("a timed-out queued save is cancelled, never applied later", async () => {
  const { a, locks, options } = await pair();
  const b = createCoordinatedFitCoachStore({ ...options, lockTimeoutMs: 5 });
  await b.load();
  const hold = deferred();
  const owner = locks.request(LOCAL_DATA_LOCK, {}, () => hold.promise);
  const waiting = b.update(draft => { draft.settings.theme = "dark"; });
  await new Promise(resolve => setTimeout(resolve, 15));
  hold.resolve(); await owner;
  await assert.rejects(waiting, /local_save_busy/);
  assert.notEqual((await a.refresh()).settings.theme, "dark");
});

test("unsupported locks do not silently write, but the existing raw backup stays available", async () => {
  const storage = storageFixture();
  const original = createFitCoachStore({ storage }); original.load();
  const before = storage.getItem(original.key());
  const store = createCoordinatedFitCoachStore({ storage, locks: null });
  await assert.rejects(store.load(), /local_coordination_unavailable/);
  assert.equal(storage.getItem(original.key()), before);
});

test("storage failures retain the previous durable state", async () => {
  const { a, storage } = await pair();
  const previous = storage.getItem(a.key());
  storage.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
  await assert.rejects(a.update(draft => { draft.settings.theme = "dark"; }), /Full/);
  assert.equal(storage.getItem(a.key()), previous);
});

test("a cloud acknowledgement cannot mark another tab's newer local edit as synced", async () => {
  const { a, b } = await pair();
  const subject = "8dc8d384-a565-4ef7-bcb6-6a81caf9bf91", consentVersion = "2026-08-31.1";
  const accountScope = await syncAccountScope(subject);
  await a.update(draft => { draft.integrations.cloudSync.accountScope = accountScope; draft.integrations.cloudSync.consentVersion = consentVersion; });
  const entered = deferred(), release = deferred(); let sent;
  const client = {
    session: { user: { id: subject } },
    async pullSync() { return { revision: 0, state: null }; },
    async pushSync(payload) { sent = payload.state; entered.resolve(); await release.promise; return { revision: 1 }; },
  };
  const coordinator = createSyncCoordinator({ client, getStore: () => a, getConsentVersion: () => consentVersion, deviceId: () => "local-test", schemaVersion: 4 });
  const run = coordinator.sync(); await entered.promise;
  await b.update(draft => logFood(draft, "newer-than-cloud"));
  release.resolve();
  assert.equal((await run).status, "pending");
  const next = await a.refresh();
  assert.match(JSON.stringify(next.nutrition), /newer-than-cloud/);
  assert.equal(next.integrations.cloudSync.lastSyncedDigest, await syncStateDigest(sent));
  assert.notEqual(await syncStateDigest(projectStateForEncryptedSync(next)), next.integrations.cloudSync.lastSyncedDigest);
});

test("the real click dispatcher blocks duplicate submissions, preserves gestures and unlocks after failure", async () => {
  const source = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  const start = source.indexOf("const pendingClickActions = new Set();");
  const end = source.indexOf("async function navigate(", start);
  assert.ok(start > 0 && end > start);
  const first = deferred(); let calls = 0; const errors = [];
  const target = { dataset: { action: "nutrition-custom-add" }, busy: false,
    setAttribute() { this.busy = true; }, removeAttribute() { this.busy = false; } };
  const event = { target: { closest: () => target } };
  const sandbox = { handleClick: () => { calls++; return first.promise; }, handleLocalSaveError: error => errors.push(error) };
  runInNewContext(source.slice(start, end), sandbox);
  const pending = sandbox.dispatchClick(event);
  assert.equal(calls, 1, "the handler starts synchronously in the original user gesture");
  await sandbox.dispatchClick(event);
  assert.equal(calls, 1);
  assert.equal(target.busy, true);
  first.resolve(); await pending;
  assert.equal(target.busy, false);
  sandbox.handleClick = async () => { calls++; throw new Error("save_failed"); };
  await sandbox.dispatchClick(event);
  assert.equal(errors.length, 1);
  assert.equal(target.busy, false);
  assert.equal(calls, 2, "there is no hidden retry");
});
