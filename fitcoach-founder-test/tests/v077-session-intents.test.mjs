import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createCoordinatedFitCoachStore } from "../v040/core/coordinated-store.mjs";
import { EXERCISES } from "../v040/data/exercise-library.mjs";
import * as workouts from "../v040/domain/workouts.mjs";
import { deepClone } from "../v040/core/utils.mjs";
import { renderModal } from "../v040/ui/modal.mjs";
import { renderTrainScreen } from "../v040/ui/train-screen.mjs";

const source = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
async function fixture() {
  const values = new Map();
  const storage = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let tail = Promise.resolve();
  const locks = {
    request(name, options, callback) {
      const next = tail.then(() => callback({ name }));
      tail = next.catch(() => {});
      return next;
    },
  };
  const a = createCoordinatedFitCoachStore({ storage, locks }),
    b = createCoordinatedFitCoachStore({ storage, locks });
  await a.load();
  await a.update((draft) => {
    draft.activeWorkout = workouts.startWorkoutFromPlan(
      workouts.buildPlan(draft, EXERCISES),
    );
  });
  await b.load();
  const viewed = b.get().activeWorkout;
  const notices = [],
    renders = [];
  const sandbox = {
    ...workouts,
    deepClone,
    state: b.get(),
    store: b,
    ui: { showActiveWorkout: true },
    render: () => renders.push(true),
    renderModalRoot: () => {},
    toast: (message) => notices.push(message),
    navigate: async () => {},
  };
  sandbox.openModal = (modal) => {
    sandbox.ui.modal = modal;
  };
  sandbox.closeModal = () => {
    sandbox.ui.modal = null;
  };
  const helper = source.indexOf("async function openWorkoutCloseReview(");
  if (helper >= 0)
    runInNewContext(
      source.slice(
        source.indexOf("const workoutNoteEdits ="),
        source.indexOf("async function planMutation(", helper),
      ),
      sandbox,
    );
  else
    runInNewContext(
      source.slice(
        source.indexOf("async function completeActiveWorkout("),
        source.indexOf("async function planMutation("),
      ),
      sandbox,
    );
  runInNewContext(
    source.slice(
      source.indexOf("async function handleClick("),
      source.indexOf("async function handleChange("),
    ),
    sandbox,
  );
  runInNewContext(
    source.slice(
      source.indexOf("async function handleInput("),
      source.indexOf("// Custom choice buttons"),
    ),
    sandbox,
  );
  const click = (action, patch = {}) => {
    const target = {
      dataset: { action, value: "", workoutId: viewed.id, ...patch },
    };
    target.closest = () => target;
    return sandbox.handleClick({ target });
  };
  return { a, b, viewed, sandbox, click, notices, renders };
}

test("an old End workout confirmation must never discard a newer session", async () => {
  const f = await fixture();
  await f.click("exit-workout");
  await f.a.update((draft) => {
    draft.activeWorkout = workouts.startWorkoutFromPlan(
      workouts.buildPlan(draft, EXERCISES),
    );
  });
  const newer = f.a.get().activeWorkout;
  // A background store refresh must not retarget an already-open confirmation.
  await f.b.refresh();
  try {
    await f.click("confirm-exit-workout");
  } catch (error) {
    assert.match(error.message, /local_workout_changed/u);
  }
  assert.equal((await f.a.refresh()).activeWorkout?.id, newer.id);
});

async function logSet(f, index = 0) {
  await f.a.update((draft) => {
    const set = draft.activeWorkout.exercises[0].sets[index];
    set.done = true;
    set.completedAt = new Date().toISOString();
  });
}

test("a reviewed Finish cannot save changed sets or erase unfinished edits", async () => {
  for (const change of [
    (workout) => {
      workout.exercises[0].sets[1].done = true;
    },
    (workout) => {
      workout.exercises[0].sets[1].weight = 55;
    },
    (workout) => {
      workout.notes = "Added after review";
    },
    (workout) => {
      workout.exercises.reverse();
    },
    (workout) => {
      workout.status = "paused";
    },
  ]) {
    const f = await fixture();
    await logSet(f);
    await f.click("finish-workout");
    await f.a.update((draft) => {
      change(draft.activeWorkout);
    });
    const before = JSON.stringify(f.a.get());
    await assert.rejects(
      f.click("confirm-finish-workout"),
      /local_workout_changed/u,
    );
    assert.equal(JSON.stringify(await f.a.refresh()), before);
    assert.match(f.sandbox.ui.modal.error, /was not saved/u);
  }
});

test("finish review remains tied to its displayed content during a background refresh", async () => {
  const f = await fixture();
  await logSet(f);
  await f.click("finish-workout");
  await logSet(f, 1);
  await f.b.refresh();
  const html = renderModal(f.sandbox.ui.modal, { state: f.b.get() });
  assert.match(html, /1 completed set will be saved/u);
  assert.doesNotMatch(html, /2 completed sets will be saved/u);
  await assert.rejects(
    f.click("confirm-finish-workout"),
    /local_workout_changed/u,
  );
});

test("finish saves exactly once and pins the completion receipt", async () => {
  const f = await fixture();
  await logSet(f);
  await f.click("finish-workout");
  await f.click("confirm-finish-workout");
  assert.equal(f.b.get().activeWorkout, null);
  assert.equal(f.b.get().sessions.length, 1);
  assert.equal(f.b.get().sessions[0].id, f.viewed.id);
  assert.equal(f.sandbox.ui.modal.summary.sessionId, f.viewed.id);
  assert.equal(f.sandbox.ui.modal.summary.completedSets, 1);
  await assert.rejects(
    f.click("confirm-finish-workout"),
    /local_workout_changed/u,
  );
  assert.equal((await f.a.refresh()).sessions.length, 1);
});

test("unchanged paused workouts can finish and timer/navigation do not invalidate a review", async () => {
  const f = await fixture();
  await logSet(f);
  await f.a.update((draft) => {
    draft.activeWorkout.status = "paused";
  });
  await f.click("finish-workout");
  await f.a.update((draft) => {
    draft.activeWorkout.currentExerciseIndex = 1;
    draft.activeWorkout.scrollTop = 220;
    draft.activeWorkout.restTimer.running = false;
  });
  await f.click("confirm-finish-workout");
  assert.equal(f.b.get().sessions.length, 1);
});

test("a new review sees updated content and valid End removes only that active workout", async () => {
  const f = await fixture();
  await f.click("exit-workout");
  await logSet(f);
  await assert.rejects(
    f.click("confirm-exit-workout"),
    /local_workout_changed/u,
  );
  await f.click("exit-workout");
  assert.equal(f.sandbox.ui.modal.workout.exercises[0].sets[0].done, true);
  await f.click("confirm-exit-workout");
  assert.equal(f.b.get().activeWorkout, null);
  assert.equal(f.b.get().sessions.length, 0);
});

test("an old Finish dialog cannot save a different workout even after store refresh", async () => {
  const f = await fixture();
  await logSet(f);
  await f.click("finish-workout");
  await f.a.update((draft) => {
    workouts.completeWorkout(draft);
    draft.activeWorkout = workouts.startWorkoutFromPlan(
      workouts.buildPlan(draft, EXERCISES),
    );
    draft.activeWorkout.exercises[0].sets[0].done = true;
  });
  await f.b.refresh();
  const before = JSON.stringify(f.b.get());
  await assert.rejects(
    f.click("confirm-finish-workout"),
    /local_workout_changed/u,
  );
  assert.equal(JSON.stringify(await f.a.refresh()), before);
});

test("opening review requires the clicked workout ID, never a newer visible-store fallback", async () => {
  for (const action of ["finish-workout", "exit-workout"]) {
    const f = await fixture();
    await assert.rejects(
      f.click(action, { workoutId: "" }),
      /local_workout_changed/u,
    );
    await f.a.update((draft) => {
      draft.activeWorkout = workouts.startWorkoutFromPlan(
        workouts.buildPlan(draft, EXERCISES),
      );
    });
    await assert.rejects(f.click(action), /local_workout_changed/u);
    assert.equal(f.sandbox.ui.modal, undefined);
  }
});

test("close confirmations without a matching modal cannot mutate the session", async () => {
  for (const action of ["confirm-finish-workout", "confirm-exit-workout"]) {
    const f = await fixture();
    await logSet(f);
    f.sandbox.ui.modal = { type: "decision" };
    await assert.rejects(f.click(action), /local_workout_changed/u);
    assert.equal((await f.a.refresh()).activeWorkout.id, f.viewed.id);
  }
});

test("late finish and discard completion cannot close or replace a newer modal", async () => {
  for (const [open, confirm] of [
    ["finish-workout", "confirm-finish-workout"],
    ["exit-workout", "confirm-exit-workout"],
  ]) {
    const f = await fixture();
    await logSet(f);
    await f.click(open);
    const newer = { type: "decision" };
    f.sandbox.store = {
      update: async (mutation) => {
        f.sandbox.ui.modal = newer;
        return f.b.update(mutation);
      },
    };
    await f.click(confirm);
    assert.equal(f.sandbox.ui.modal, newer);
    assert.equal(f.b.get().activeWorkout, null);
  }
});

function noteInput(f, initial = "") {
  const alert = { hidden: true, textContent: "" };
  return {
    id: "workout-notes",
    dataset: { workoutId: f.viewed.id },
    defaultValue: initial,
    value: initial,
    closest: () => ({ querySelector: () => alert }),
    alert,
  };
}

test("rapid note typing queues captured values without overwriting newer keystrokes", async () => {
  const f = await fixture(),
    input = noteInput(f);
  input.value = "First ";
  const first = f.sandbox.handleInput({ target: input });
  input.value = "First set ";
  const second = f.sandbox.handleInput({ target: input });
  input.value = "First set felt steady";
  const third = f.sandbox.handleInput({ target: input });
  await Promise.all([first, second, third]);
  assert.equal(f.b.get().activeWorkout.notes, "First set felt steady");
  assert.equal(input.value, "First set felt steady");
  assert.equal(input.alert.hidden, true);
});

test("another tab's note survives a conflicting draft and its pending keystrokes", async () => {
  const f = await fixture(),
    input = noteInput(f);
  await f.a.update((draft) => {
    draft.activeWorkout.notes = "Peer note";
  });
  input.value = "My unsaved draft";
  await assert.rejects(
    f.sandbox.handleInput({ target: input }),
    /local_workout_notes_changed/u,
  );
  input.value += " continued";
  await assert.rejects(
    f.sandbox.handleInput({ target: input }),
    /local_workout_notes_changed/u,
  );
  assert.equal((await f.a.refresh()).activeWorkout.notes, "Peer note");
  assert.equal(input.value, "My unsaved draft continued");
  assert.equal(input.alert.hidden, false);
  assert.match(input.alert.textContent, /Copy your draft before reloading/u);
});

test("stale notes cannot attach to a new workout or update completed history", async () => {
  for (const replace of [true, false]) {
    const f = await fixture(),
      input = noteInput(f);
    input.value = "Old session note";
    await logSet(f);
    await f.a.update((draft) => {
      workouts.completeWorkout(draft);
      if (replace)
        draft.activeWorkout = workouts.startWorkoutFromPlan(
          workouts.buildPlan(draft, EXERCISES),
        );
    });
    await f.b.refresh();
    const before = JSON.stringify(f.b.get());
    await assert.rejects(
      f.sandbox.handleInput({ target: input }),
      /local_workout_changed/u,
    );
    assert.equal(JSON.stringify(await f.a.refresh()), before);
    assert.equal(input.value, "Old session note");
  }
});

test("notes preserve paused editing and the existing 2000-character bound", async () => {
  const f = await fixture(),
    input = noteInput(f);
  await f.a.update((draft) => {
    draft.activeWorkout.status = "paused";
  });
  input.value = "a".repeat(2100);
  await f.sandbox.handleInput({ target: input });
  assert.equal(f.b.get().activeWorkout.notes.length, 2000);
  assert.equal(f.b.get().activeWorkout.status, "paused");
});

test("an old completion rating targets its actual receipt after a newer session finishes", async () => {
  const f = await fixture();
  await logSet(f);
  await f.click("finish-workout");
  await f.click("confirm-finish-workout");
  const summary = deepClone(f.sandbox.ui.modal.summary);
  await f.a.update((draft) => {
    draft.activeWorkout = workouts.startWorkoutFromPlan(
      workouts.buildPlan(draft, EXERCISES),
    );
    draft.activeWorkout.exercises[0].sets[0].done = true;
    workouts.completeWorkout(draft);
  });
  await f.b.refresh();
  const html = renderModal(f.sandbox.ui.modal, { state: f.b.get() });
  assert.ok(html.includes(`data-session-id="${summary.sessionId}"`));
  assert.ok(html.includes(`data-receipt-id="${summary.receiptId}"`));
  await f.click("rate-session", {
    sessionId: summary.sessionId,
    receiptId: summary.receiptId,
    value: "5",
  });
  assert.equal(f.b.get().sessions[0].rating, 5);
  assert.equal(f.b.get().sessions[1].rating, null);
  assert.equal(f.sandbox.ui.modal.summary.sessionId, summary.sessionId);
});

test("rating rejects missing receipts and values outside integer 1 through 5", async () => {
  const f = await fixture();
  await logSet(f);
  await f.click("finish-workout");
  await f.click("confirm-finish-workout");
  const summary = f.sandbox.ui.modal.summary;
  for (const patch of [
    { value: "0" },
    { value: "6" },
    { value: "2.5" },
    { receiptId: "wrong" },
    { sessionId: "" },
  ]) {
    await assert.rejects(
      f.click("rate-session", {
        sessionId: summary.sessionId,
        receiptId: summary.receiptId,
        value: "4",
        ...patch,
      }),
      /local_workout_changed/u,
    );
  }
  assert.equal((await f.a.refresh()).sessions[0].rating, null);
});

test("rendered session actions and notes carry their workout identity", async () => {
  const f = await fixture();
  const html = renderTrainScreen({
    state: f.b.get(),
    ui: { showActiveWorkout: true },
    exerciseById: (id) => EXERCISES.find((item) => item.id === id),
    now: new Date(),
  });
  for (const action of ["exit-workout", "finish-workout"]) {
    const tag = [...html.matchAll(/<button\b[^>]*>/gu)].find((match) =>
      match[0].includes(`data-action="${action}"`),
    )?.[0];
    assert.ok(tag.includes(`data-workout-id="${f.viewed.id}"`));
  }
  assert.match(html, /<textarea[^>]*id="workout-notes"[^>]*data-workout-id=/u);
  assert.match(html, /data-workout-notes-error role="alert" hidden/u);
});

test("review keys reject changed content but ignore only declared volatile fields", async () => {
  const f = await fixture();
  const review = {
    workoutId: f.viewed.id,
    key: workouts.workoutReviewKey(f.viewed),
  };
  assert.equal(
    workouts.resolveWorkoutReview(
      { ...f.viewed, scrollTop: 50, currentExerciseIndex: 1, restTimer: {} },
      review,
    ).id,
    f.viewed.id,
  );
  for (const changed of [
    null,
    { ...f.viewed, id: "other" },
    { ...f.viewed, notes: "different" },
    { ...f.viewed, status: "completed" },
  ]) {
    assert.throws(
      () => workouts.resolveWorkoutReview(changed, review),
      /local_workout_changed/u,
    );
  }
});

test("End workout cannot discard sets logged after its confirmation was opened", async () => {
  const f = await fixture();
  await f.click("exit-workout");
  await f.a.update((draft) => {
    draft.activeWorkout.exercises[0].sets[0].done = true;
  });
  try {
    await f.click("confirm-exit-workout");
  } catch (error) {
    assert.match(error.message, /local_workout_changed/u);
  }
  assert.equal(
    (await f.a.refresh()).activeWorkout?.exercises[0].sets[0].done,
    true,
  );
});

test("finishing while paused excludes the outstanding pause from workout duration", async () => {
  const f = await fixture();
  const state = deepClone(f.b.get());
  state.activeWorkout.startedAt = "2026-09-08T10:00:00.000Z";
  state.activeWorkout.status = "paused";
  state.activeWorkout.pausedAt = "2026-09-08T10:10:00.000Z";
  state.activeWorkout.accumulatedPausedMs = 2 * 60_000;
  state.activeWorkout.exercises[0].sets[0].done = true;
  const result = workouts.completeWorkout(
    state,
    new Date("2026-09-08T10:40:00.000Z"),
  );
  assert.equal(result.error, null);
  assert.equal(result.session.durationMinutes, 8);
  assert.equal(result.state.lastWorkoutSummary.durationMinutes, 8);
});
