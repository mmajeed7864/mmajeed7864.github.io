import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createCoordinatedFitCoachStore } from "../v040/core/coordinated-store.mjs";
import { EXERCISES } from "../v040/data/exercise-library.mjs";
import * as workouts from "../v040/domain/workouts.mjs";
import { uid } from "../v040/core/utils.mjs";
import { renderTrainScreen } from "../v040/ui/train-screen.mjs";
import { renderModal } from "../v040/ui/modal.mjs";

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
  const viewed = b.get().activeWorkout,
    exercise = viewed.exercises[0];
  const identity = {
    workoutId: viewed.id,
    exerciseId: exercise.exerciseId,
    setId: exercise.sets[0].id,
  };
  const notices = [],
    renders = [];
  const sandbox = {
    state: b.get(),
    store: b,
    ui: { replacementIndex: null, replacementTarget: null },
    ...workouts,
    uid,
    getExerciseById: (id) => EXERCISES.find((item) => item.id === id),
    render: () => renders.push(true),
    renderModalRoot: () => {},
    toast: (message) => notices.push(message),
  };
  sandbox.closeModal = () => {
    sandbox.ui.modal = null;
  };
  const helperStart = source.indexOf("async function addActiveWorkoutSet(");
  if (helperStart >= 0)
    runInNewContext(
      source.slice(
        helperStart,
        source.indexOf("function formatClock(", helperStart),
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
  const click = (action, patch = {}) => {
    const target = { dataset: { ...identity, action, value: "0", ...patch } };
    target.closest = () => target;
    return sandbox.handleClick({ target });
  };
  return { a, b, viewed, exercise, identity, sandbox, click, notices, renders };
}

test("Add set targets the displayed exercise after another tab advances the workout", async () => {
  const f = await fixture();
  await f.a.update((draft) => {
    draft.activeWorkout.currentExerciseIndex = 1;
  });
  await f.click("add-set");
  const latest = (await f.a.refresh()).activeWorkout;
  assert.equal(latest.exercises[0].sets.length, f.exercise.sets.length + 1);
  assert.equal(
    latest.exercises[1].sets.length,
    f.viewed.exercises[1].sets.length,
  );
  assert.equal(latest.currentExerciseIndex, 0);
});

test("Add set follows its stable instance after reordering, even with duplicate exercise IDs", async () => {
  const f = await fixture();
  await f.a.update((draft) => {
    const copy = structuredClone(draft.activeWorkout.exercises[0]);
    copy.sets.forEach((set) => {
      set.id = uid("set");
    });
    draft.activeWorkout.exercises.unshift(copy);
  });
  await f.click("add-set", { value: "999" });
  const latest = f.b.get().activeWorkout;
  assert.equal(latest.exercises[0].sets.length, f.exercise.sets.length);
  assert.equal(latest.exercises[1].sets.length, f.exercise.sets.length + 1);
  assert.equal(latest.currentExerciseIndex, 1);
  const added = latest.exercises[1].sets.at(-1);
  assert.equal(added.unit, latest.units);
  assert.equal(added.done, false);
  assert.equal(added.index, 4);
});

test("Add set reads current limits and pause state inside the coordinated save", async () => {
  const f = await fixture();
  await f.a.update((draft) => {
    draft.activeWorkout.status = "paused";
  });
  await assert.rejects(f.click("add-set"), /local_workout_paused/u);
  await f.a.update((draft) => {
    draft.activeWorkout.status = "active";
    const exercise = draft.activeWorkout.exercises[0];
    while (exercise.sets.length < 20)
      exercise.sets.push({
        ...exercise.sets[0],
        id: uid("set"),
        index: exercise.sets.length + 1,
      });
  });
  await assert.rejects(f.click("add-set"), /local_set_limit/u);
  assert.equal(
    (await f.a.refresh()).activeWorkout.exercises[0].sets.length,
    20,
  );
  assert.equal(f.renders.length, 0);
});

test("stale Add set cannot modify a replaced, removed or different workout", async () => {
  for (const change of [
    (workout) =>
      workouts.swapWorkoutExercise(
        workout,
        0,
        EXERCISES.find((item) => item.id !== workout.exercises[0].exerciseId),
      ),
    (workout) => workout.exercises.shift(),
    (workout) => {
      workout.id = uid("workout");
    },
  ]) {
    const f = await fixture();
    await f.a.update((draft) => {
      change(draft.activeWorkout);
    });
    const before = JSON.stringify(f.a.get());
    await assert.rejects(f.click("add-set"), /local_workout_changed/u);
    assert.equal(JSON.stringify(await f.a.refresh()), before);
  }
});

test("exercise controls reject missing stable identity instead of using the old position", async () => {
  for (const action of [
    "add-set",
    "swap-active-exercise",
    "reorder-active-exercise",
  ]) {
    const f = await fixture();
    await assert.rejects(
      f.click(action, {
        setId: "",
        direction: "1",
        neighborSetId: f.viewed.exercises[1].sets[0].id,
      }),
      /local_workout_changed/u,
    );
    assert.equal(
      f.b.get().activeWorkout.exercises[0].sets.length,
      f.exercise.sets.length,
    );
  }
});

test("reorder resolves the selected instance and keeps its displayed neighbor", async () => {
  const f = await fixture();
  await f.a.update((draft) => {
    const moved = draft.activeWorkout.exercises.pop();
    draft.activeWorkout.exercises.unshift(moved);
  });
  await f.click("reorder-active-exercise", {
    direction: "1",
    neighborSetId: f.viewed.exercises[1].sets[0].id,
  });
  const latest = f.b.get().activeWorkout;
  assert.equal(latest.exercises[2].sets[0].id, f.identity.setId);
  assert.equal(
    latest.exercises[1].sets[0].id,
    f.viewed.exercises[1].sets[0].id,
  );
  assert.equal(latest.currentExerciseIndex, 2);
});

test("a repeated stale move cannot jump over an unselected neighbor", async () => {
  const f = await fixture();
  const intent = {
    direction: "1",
    neighborSetId: f.viewed.exercises[1].sets[0].id,
  };
  await f.click("reorder-active-exercise", intent);
  const before = JSON.stringify(f.b.get());
  await assert.rejects(
    f.click("reorder-active-exercise", intent),
    /local_workout_changed/u,
  );
  assert.equal(JSON.stringify(await f.a.refresh()), before);
});

test("move up and paused reordering retain their existing behavior", async () => {
  const f = await fixture();
  await f.a.update((draft) => {
    draft.activeWorkout.status = "paused";
  });
  await f.click("reorder-active-exercise", {
    exerciseId: f.viewed.exercises[1].exerciseId,
    setId: f.viewed.exercises[1].sets[0].id,
    direction: "-1",
    neighborSetId: f.identity.setId,
  });
  const latest = f.b.get().activeWorkout;
  assert.equal(
    latest.exercises[0].sets[0].id,
    f.viewed.exercises[1].sets[0].id,
  );
  assert.equal(latest.status, "paused");
});

test("reorder rejects altered directions, missing neighbors and completed workouts", async () => {
  for (const patch of [
    { direction: "0" },
    { direction: "2" },
    { direction: "-1" },
    { direction: "1", neighborSetId: "" },
  ]) {
    const f = await fixture();
    await assert.rejects(
      f.click("reorder-active-exercise", {
        neighborSetId: f.viewed.exercises[1].sets[0].id,
        ...patch,
      }),
      /local_workout_changed/u,
    );
  }
  const f = await fixture();
  assert.throws(
    () =>
      workouts.resolveWorkoutSet(
        { ...f.viewed, status: "completed" },
        f.identity,
        { allowPaused: true },
      ),
    /local_workout_changed/u,
  );
  await f.a.update((draft) => {
    draft.activeWorkout = null;
  });
  await assert.rejects(
    f.click("reorder-active-exercise", {
      direction: "1",
      neighborSetId: f.viewed.exercises[1].sets[0].id,
    }),
    /local_workout_changed/u,
  );
});

async function selectReplacement(f) {
  const replacement = EXERCISES.find(
    (item) =>
      !f.viewed.exercises.some((exercise) => exercise.exerciseId === item.id),
  );
  await f.click("swap-active-exercise");
  await f.click("confirm-exercise-replacement", { value: replacement.id });
  return replacement;
}

test("swap selection and confirmation preserve the original exercise across a concurrent reorder", async () => {
  const f = await fixture();
  await f.a.update((draft) => {
    draft.activeWorkout.currentExerciseIndex = 1;
  });
  const replacement = await selectReplacement(f);
  assert.equal(f.sandbox.ui.modal.currentName, f.exercise.snapshot.name);
  assert.equal(f.sandbox.ui.modal.target.setId, f.identity.setId);
  const html = renderModal(f.sandbox.ui.modal, {
    state: f.b.get(),
    exerciseById: f.sandbox.getExerciseById,
  });
  assert.ok(html.includes(f.exercise.snapshot.name));
  assert.ok(html.includes(replacement.name));
  await f.a.update((draft) => {
    draft.activeWorkout.exercises.reverse();
  });
  await f.click("apply-active-swap", { value: replacement.id });
  const latest = f.b.get().activeWorkout;
  assert.equal(latest.exercises.at(-1).exerciseId, replacement.id);
  assert.notEqual(latest.exercises.at(-1).sets[0].id, f.identity.setId);
  assert.equal(latest.currentExerciseIndex, latest.exercises.length - 1);
  assert.equal(f.sandbox.ui.replacementTarget, null);
  assert.equal(f.sandbox.ui.modal, null);
  assert.match(f.notices.at(-1), /Exercise replaced/u);
});

test("a set logged while the swap dialog is open prevents replacement and false success", async () => {
  const f = await fixture();
  const replacement = await selectReplacement(f);
  await f.a.update((draft) => {
    draft.activeWorkout.exercises[0].sets[0].done = true;
  });
  const before = JSON.stringify(f.a.get());
  await assert.rejects(
    f.click("apply-active-swap", { value: replacement.id }),
    /local_exercise_logged/u,
  );
  assert.equal(JSON.stringify(await f.a.refresh()), before);
  assert.equal(f.notices.length, 0);
  assert.equal(f.sandbox.ui.modal.type, "active-swap");
  assert.match(f.sandbox.ui.modal.error, /Not replaced:.*completed sets/u);
  const html = renderModal(f.sandbox.ui.modal, {
    state: f.b.get(), exerciseById: f.sandbox.getExerciseById,
  });
  assert.match(html, /role="alert">Not replaced:/u);
});

test("swap refuses a logged or paused exercise even before selection", async () => {
  for (const [change, error] of [
    [
      (workout) => {
        workout.exercises[0].sets[0].done = true;
      },
      /local_exercise_logged/u,
    ],
    [
      (workout) => {
        workout.status = "paused";
      },
      /local_workout_paused/u,
    ],
  ]) {
    const f = await fixture();
    await f.a.update((draft) => {
      change(draft.activeWorkout);
    });
    await assert.rejects(f.click("swap-active-exercise"), error);
    assert.equal(f.sandbox.ui.replacementTarget, null);
  }
});

test("an open swap cannot apply after a pause, replacement or new workout", async () => {
  for (const [change, error] of [
    [
      (workout) => {
        workout.status = "paused";
      },
      /local_workout_paused/u,
    ],
    [
      (workout) => {
        workout.id = uid("workout");
      },
      /local_workout_changed/u,
    ],
    [
      (workout) => {
        workouts.swapWorkoutExercise(workout, 0, EXERCISES[1]);
      },
      /local_workout_changed/u,
    ],
  ]) {
    const f = await fixture();
    const replacement = await selectReplacement(f);
    await f.a.update((draft) => {
      change(draft.activeWorkout);
    });
    const before = JSON.stringify(f.a.get());
    await assert.rejects(
      f.click("apply-active-swap", { value: replacement.id }),
      error,
    );
    assert.equal(JSON.stringify(await f.a.refresh()), before);
    assert.equal(f.notices.length, 0);
  }
});

test("swap requires the actual pending candidate, and an old confirmation cannot be reused", async () => {
  const f = await fixture();
  const replacement = await selectReplacement(f);
  await assert.rejects(
    f.click("apply-active-swap", { value: f.exercise.exerciseId }),
    /local_workout_changed/u,
  );
  await assert.rejects(
    f.click("apply-active-swap", { value: "missing" }),
    /local_workout_changed/u,
  );
  await f.click("apply-active-swap", { value: replacement.id });
  await assert.rejects(
    f.click("apply-active-swap", { value: replacement.id }),
    /local_workout_changed/u,
  );
  assert.equal(f.notices.length, 1);
});

test("queued mutations capture the clicked identity and preserve any newer modal", async () => {
  const f = await fixture();
  const replacement = await selectReplacement(f);
  const newer = { type: "decision" };
  f.sandbox.store = {
    update: async (mutation) => {
      f.sandbox.ui.modal = newer;
      f.sandbox.ui.replacementIndex = 999;
      await f.a.update((draft) => {
        draft.activeWorkout.exercises.reverse();
      });
      return f.b.update(mutation);
    },
  };
  await f.click("apply-active-swap", { value: replacement.id });
  assert.equal(
    f.b.get().activeWorkout.exercises.at(-1).exerciseId,
    replacement.id,
  );
  assert.equal(f.sandbox.ui.modal, newer);
});

test("all exercise-level rendered actions carry instance IDs and reorder neighbors", async () => {
  const f = await fixture();
  const html = renderTrainScreen({
    state: f.b.get(),
    ui: { showActiveWorkout: true },
    exerciseById: f.sandbox.getExerciseById,
    now: new Date(),
  });
  const controls = [
    ...html.matchAll(
      /<button\b[^>]*data-action="(?:add-set|swap-active-exercise|reorder-active-exercise)"[^>]*>/gu,
    ),
  ].map((match) => match[0]);
  assert.equal(controls.length, 4);
  for (const control of controls) {
    assert.ok(control.includes(`data-workout-id="${f.identity.workoutId}"`));
    assert.ok(control.includes(`data-exercise-id="${f.identity.exerciseId}"`));
    assert.ok(control.includes(`data-set-id="${f.identity.setId}"`));
    assert.ok(!control.includes('data-value="0"'));
  }
  assert.ok(
    controls[3].includes(
      `data-neighbor-set-id="${f.viewed.exercises[1].sets[0].id}"`,
    ),
  );
});

test("replacement refusals and set limits have truthful recovery messages", () => {
  const notices = [],
    toasts = [],
    sandbox = {
      showLocalDataNotice: (message) => notices.push(message),
      toast: (message) => toasts.push(message),
    };
  runInNewContext(
    source.slice(
      source.indexOf("function handleLocalSaveError("),
      source.indexOf("function observeLocalDataChange("),
    ),
    sandbox,
  );
  sandbox.handleLocalSaveError(new Error("local_exercise_logged"));
  assert.match(notices[0], /wasn’t replaced/u);
  assert.match(notices[0], /Reload/u);
  sandbox.handleLocalSaveError(new Error("local_set_limit"));
  assert.match(toasts[1], /No extra set was added/u);
});
