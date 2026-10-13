import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createCoordinatedFitCoachStore } from "../v040/core/coordinated-store.mjs";
import { EXERCISES } from "../v040/data/exercise-library.mjs";
import * as workouts from "../v040/domain/workouts.mjs";
import { renderTrainScreen } from "../v040/ui/train-screen.mjs";
import { escapeHtml } from "../v040/core/utils.mjs";

const source = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
const NOW = new Date("2026-09-08T10:00:00.000Z");
const timerKey = (w) => workouts.restTimerKey?.(w) ?? "old-timer";
const pauseKey = (w) => workouts.workoutPauseKey?.(w) ?? "old-pause";

async function fixture() {
  const values = new Map();
  const storage = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
  let tail = Promise.resolve();
  const locks = {
    request(name, options, callback) {
      const next = tail.then(() => callback({ name }));
      tail = next.catch(() => {});
      return next;
    },
  };
  const a = createCoordinatedFitCoachStore({ storage, locks });
  const b = createCoordinatedFitCoachStore({ storage, locks });
  await a.load();
  await a.update((d) => {
    d.activeWorkout = workouts.startWorkoutFromPlan(
      workouts.buildPlan(d, EXERCISES),
      NOW,
    );
  });
  await b.load();
  const notices = [],
    renders = [],
    displays = [],
    opened = [];
  const sandbox = {
    ...workouts,
    state: b.get(),
    store: b,
    ui: {},
    render: () => renders.push(true),
    toast: (v) => notices.push(v),
    document: { querySelectorAll: () => displays, querySelector: () => null },
    window: { scrollTo() {} },
    openExercise: async (id) => opened.push(id),
  };
  runInNewContext(
    source.slice(
      source.indexOf("function formatClock("),
      source.indexOf("function beginRestTicker("),
    ),
    sandbox,
  );
  const helpers = source.indexOf("async function changeWorkoutControl(");
  if (helpers >= 0)
    runInNewContext(
      source.slice(
        helpers,
        source.indexOf("const workoutNoteEdits =", helpers),
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
  const viewed = b.get().activeWorkout;
  const click = (action, patch = {}) => {
    const target = {
      dataset: { action, value: "", workoutId: viewed.id, ...patch },
    };
    target.closest = () => target;
    return sandbox.handleClick({ target });
  };
  const refresh = async () => {
    sandbox.state = await b.refresh();
    return sandbox.state.activeWorkout;
  };
  return {
    a,
    b,
    viewed,
    sandbox,
    click,
    refresh,
    notices,
    renders,
    displays,
    opened,
    storage,
    locks,
  };
}

test("a stale Pause button cannot resume a workout paused in another tab", async () => {
  const f = await fixture();
  const identity = { pauseKey: pauseKey(f.viewed) };
  await f.a.update((d) => {
    d.activeWorkout.status = "paused";
    d.activeWorkout.pausedAt = NOW.toISOString();
  });
  await f.refresh();
  try {
    await f.click("toggle-workout-pause", identity);
  } catch (e) {
    assert.match(e.message, /local_workout_changed/);
  }
  assert.equal((await f.a.refresh()).activeWorkout.status, "paused");
});

test("a stale expiry tick cannot stop a newer rest timer", async () => {
  const f = await fixture();
  await f.a.update((d) => {
    workouts.startRestTimer(d.activeWorkout, 60, NOW);
  });
  await f.refresh(); // viewed timer has already expired at the real wall clock
  await f.a.update((d) => {
    workouts.startRestTimer(d.activeWorkout, 90);
  });
  const expected = f.a.get().activeWorkout.restTimer;
  await f.sandbox.updateRestDisplays();
  assert.deepEqual((await f.a.refresh()).activeWorkout.restTimer, expected);
  assert.equal(f.notices.length, 0);
});

test("Next means the displayed neighbor, not one past a peer's new cursor", async () => {
  const f = await fixture();
  const current = f.viewed.exercises[0],
    next = f.viewed.exercises[1];
  await f.a.update((d) => {
    d.activeWorkout.currentExerciseIndex = 1;
  });
  await f.refresh();
  await f.click("next-exercise", {
    exerciseId: current.exerciseId,
    setId: current.sets[0].id,
    neighborSetId: next.sets[0].id,
  });
  assert.equal((await f.a.refresh()).activeWorkout.currentExerciseIndex, 1);
});

test("pause, short-rest resume and process reload preserve the exact countdown", async () => {
  const f = await fixture();
  await f.a.update((d) => {
    const w = d.activeWorkout;
    workouts.startRestTimer(w, 20, NOW);
    workouts.changeWorkoutPause(
      w,
      { workoutId: w.id, pauseKey: pauseKey(w) },
      new Date(+NOW + 12_000),
    );
  });
  const paused = await f.refresh();
  assert.equal(paused.restTimer.durationSeconds, 8);
  assert.equal(paused.restTimer.paused, true);
  const cold = createCoordinatedFitCoachStore({
    storage: f.storage,
    locks: f.locks,
  });
  await cold.load();
  assert.deepEqual(cold.get().activeWorkout, paused);
  const restart = new Date(+NOW + 300_000);
  await cold.update(
    (d) =>
      workouts.changeWorkoutPause(
        d.activeWorkout,
        { workoutId: paused.id, pauseKey: pauseKey(paused) },
        restart,
      ) && undefined,
  );
  const resumed = cold.get().activeWorkout;
  assert.equal(resumed.accumulatedPausedMs, 288_000);
  assert.equal(resumed.restTimer.durationSeconds, 8);
  assert.equal(workouts.restSecondsRemaining(resumed, restart), 8);
  assert.notEqual(resumed.restTimer.id, paused.restTimer.id);
  await assert.rejects(
    f.click("toggle-workout-pause", { pauseKey: pauseKey(paused) }),
    /local_workout_changed/,
  );
});

test("stale pause intent is invalid even after a complete same-clock pause/resume cycle", async () => {
  const f = await fixture();
  const old = pauseKey(f.viewed);
  await f.a.update((d) => {
    const w = d.activeWorkout;
    workouts.changeWorkoutPause(
      w,
      { workoutId: w.id, pauseKey: pauseKey(w) },
      NOW,
    );
    workouts.changeWorkoutPause(
      w,
      { workoutId: w.id, pauseKey: pauseKey(w) },
      NOW,
    );
  });
  await f.refresh();
  const expected = f.a.get().activeWorkout;
  await assert.rejects(
    f.click("toggle-workout-pause", { pauseKey: old }),
    /local_workout_changed/,
  );
  assert.deepEqual((await f.a.refresh()).activeWorkout, expected);
});

test("rest actions capture the viewed timer, including same-deadline replacements", async () => {
  for (const action of ["adjust-rest", "stop-rest"]) {
    const f = await fixture(),
      future = new Date(Date.now() + 60_000);
    await f.a.update((d) => {
      workouts.startRestTimer(d.activeWorkout, 90, future);
    });
    const old = await f.refresh();
    await f.a.update((d) => {
      workouts.startRestTimer(d.activeWorkout, 90, future);
    });
    const latest = f.a.get().activeWorkout;
    assert.equal(old.restTimer.endsAt, latest.restTimer.endsAt);
    assert.notEqual(old.restTimer.id, latest.restTimer.id);
    await f.refresh();
    await assert.rejects(
      f.click(action, { value: "15", restKey: timerKey(old) }),
      /local_workout_changed/,
    );
    assert.deepEqual(
      (await f.a.refresh()).activeWorkout.restTimer,
      latest.restTimer,
    );
  }
});

test("rest shortening preserves sub-15 seconds and Skip does not create a new timer", async () => {
  const f = await fixture();
  await f.a.update((d) => {
    const w = d.activeWorkout;
    workouts.startRestTimer(w, 20, NOW);
    workouts.changeWorkoutRest(
      w,
      { workoutId: w.id, restKey: timerKey(w) },
      -15,
      NOW,
    );
  });
  const short = await f.refresh();
  assert.equal(short.restTimer.durationSeconds, 5);
  assert.equal(workouts.restSecondsRemaining(short, NOW), 5);
  await f.a.update((d) => {
    workouts.changeWorkoutRest(
      d.activeWorkout,
      { workoutId: short.id, restKey: timerKey(short) },
      "stop",
      NOW,
    );
  });
  const stopped = f.a.get().activeWorkout.restTimer;
  assert.equal(stopped.running, false);
  assert.equal(stopped.endsAt, null);
  assert.equal(stopped.id, short.restTimer.id);
});

test("rest actions reject missing identity, expired or paused timers and unsupported deltas", async () => {
  const f = await fixture();
  const w = f.viewed;
  workouts.startRestTimer(w, 60, NOW);
  const identity = { workoutId: w.id, restKey: timerKey(w) };
  for (const delta of [NaN, Infinity, 0, 1, 600, "15"])
    assert.throws(
      () => workouts.changeWorkoutRest(w, identity, delta, NOW),
      /local_workout_changed/,
    );
  assert.throws(
    () => workouts.changeWorkoutRest(w, {}, 15, NOW),
    /local_workout_changed/,
  );
  assert.throws(
    () => workouts.changeWorkoutRest(w, identity, 15, new Date(+NOW + 60_000)),
    /local_workout_changed/,
  );
  w.status = "paused";
  assert.throws(
    () => workouts.changeWorkoutRest(w, identity, 15, NOW),
    /local_workout_paused/,
  );
});

test("paused ticker holds its value and does not paint a different displayed timer", async () => {
  const f = await fixture();
  await f.a.update((d) => {
    const w = d.activeWorkout;
    workouts.startRestTimer(w, 60, NOW);
    workouts.changeWorkoutPause(
      w,
      { workoutId: w.id, pauseKey: pauseKey(w) },
      new Date(+NOW + 53_000),
    );
  });
  const paused = await f.refresh();
  const matching = {
    dataset: { workoutId: paused.id, restKey: timerKey(paused) },
    textContent: "old",
  };
  const other = {
    dataset: { workoutId: paused.id, restKey: "another" },
    textContent: "unchanged",
  };
  f.displays.push(matching, other);
  await f.sandbox.updateRestDisplays();
  assert.equal(matching.textContent, "0:07");
  assert.equal(other.textContent, "unchanged");
  assert.equal(f.notices.length, 0);
});

test("overlapping expiry ticks produce a single actual completion and cue", async () => {
  const f = await fixture();
  await f.a.update((d) => {
    d.settings.workoutCues = true;
    workouts.startRestTimer(d.activeWorkout, 60, NOW);
  });
  await f.refresh();
  await Promise.all([
    f.sandbox.updateRestDisplays(),
    f.sandbox.updateRestDisplays(),
  ]);
  assert.equal((await f.a.refresh()).activeWorkout.restTimer.running, false);
  assert.deepEqual(f.notices, ["Rest complete. Your next set is ready."]);
  assert.equal(f.renders.length, 0);
});

test("expiry retry remains available after a storage failure", async () => {
  const f = await fixture();
  await f.a.update((d) => {
    workouts.startRestTimer(d.activeWorkout, 60, NOW);
  });
  await f.refresh();
  f.sandbox.store = {
    update: async () => {
      throw Error("local_save_busy");
    },
  };
  await assert.rejects(f.sandbox.updateRestDisplays(), /local_save_busy/);
  assert.equal(f.notices.length, 0);
  f.sandbox.store = f.b;
  await f.sandbox.updateRestDisplays();
  assert.equal((await f.a.refresh()).activeWorkout.restTimer.running, false);
});

test("old controls cannot modify a new workout after a background refresh", async () => {
  for (const action of [
    "toggle-workout-pause",
    "stop-rest",
    "adjust-rest",
    "next-exercise",
    "view-current-instructions",
  ]) {
    const f = await fixture(),
      w = f.viewed;
    await f.a.update((d) => {
      d.activeWorkout = workouts.startWorkoutFromPlan(
        workouts.buildPlan(d, EXERCISES),
      );
    });
    await f.refresh();
    const expected = f.a.get();
    await assert.rejects(
      f.click(action, {
        value: "15",
        restKey: timerKey(w),
        pauseKey: pauseKey(w),
        exerciseId: w.exercises[0].exerciseId,
        setId: w.exercises[0].sets[0].id,
        neighborSetId: w.exercises[1].sets[0].id,
      }),
      /local_workout_changed/,
    );
    assert.deepEqual(await f.a.refresh(), expected);
    assert.equal(f.opened.length, 0);
  }
});

test("navigation and instructions retain identity after peer navigation, refusing a changed neighbor", async () => {
  const f = await fixture(),
    w = f.viewed;
  const identity = {
    exerciseId: w.exercises[1].exerciseId,
    setId: w.exercises[1].sets[0].id,
    neighborSetId: w.exercises[0].sets[0].id,
  };
  await f.a.update((d) => {
    d.activeWorkout.currentExerciseIndex = 3;
    d.activeWorkout.status = "paused";
  });
  await f.refresh();
  await f.click("previous-exercise", identity);
  assert.equal((await f.a.refresh()).activeWorkout.currentExerciseIndex, 0);
  await f.click("view-current-instructions", identity);
  assert.deepEqual(f.opened, [w.exercises[1].exerciseId]);
  await f.a.update((d) => {
    d.activeWorkout.exercises.reverse();
  });
  await assert.rejects(
    f.click("previous-exercise", identity),
    /local_workout_changed/,
  );
});

test("legacy timers upgrade without resetting their persisted deadline", async () => {
  const f = await fixture();
  const end = new Date(Date.now() + 60_000).toISOString();
  await f.a.update((d) => {
    d.activeWorkout.restTimer = {
      endsAt: end,
      running: true,
      paused: false,
      durationSeconds: 60,
    };
    delete d.activeWorkout.pauseRevision;
  });
  const legacy = await f.refresh();
  assert.equal(legacy.restTimer.id, "");
  assert.equal(legacy.restTimer.endsAt, end);
  assert.equal(legacy.pauseRevision, "");
  await f.click("adjust-rest", { value: "15", restKey: timerKey(legacy) });
  const updated = (await f.a.refresh()).activeWorkout;
  assert.match(updated.restTimer.id, /^rest-/);
  assert.ok(new Date(updated.restTimer.endsAt) > new Date(end));
});

test("rendered controls carry the session, countdown and neighbor they describe", async () => {
  const f = await fixture();
  await f.a.update((d) => {
    workouts.startRestTimer(d.activeWorkout, 90, NOW);
  });
  const state = await f.a.refresh();
  const html = renderTrainScreen({
    state,
    now: NOW,
    ui: { showActiveWorkout: true, trainSegment: "workout" },
    exerciseById: (id) => EXERCISES.find((e) => e.id === id),
  });
  for (const action of [
    "toggle-workout-pause",
    "adjust-rest",
    "stop-rest",
    "next-exercise",
    "previous-exercise",
    "view-current-instructions",
  ]) {
    const controls = [
      ...html.matchAll(
        new RegExp(`<button[^>]*data-action="${action}"[^>]*>`, "g"),
      ),
    ];
    assert.ok(controls.length, action);
    for (const [control] of controls)
      assert.ok(
        control.includes(`data-workout-id="${state.activeWorkout.id}"`),
        action,
      );
  }
  assert.match(html, /data-pause-key=/);
  assert.match(html, /data-rest-key=/);
  assert.ok(
    html.includes(
      `data-neighbor-set-id="${state.activeWorkout.exercises[1].sets[0].id}"`,
    ),
  );
});

test("the docked player reports pause accurately and ticks only its own timer", async () => {
  const f = await fixture();
  const mini = { hidden: true, innerHTML: "" };
  Object.assign(f.sandbox, { dom: { mini }, icon: () => "", escapeHtml });
  f.sandbox.ui = { mode: "app", route: "today" };
  f.sandbox.document.documentElement = { classList: { toggle() {} } };
  runInNewContext(
    source.slice(
      source.indexOf("function renderMiniWorkout("),
      source.indexOf("function renderAppScreen("),
    ),
    f.sandbox,
  );
  await f.a.update((d) => {
    d.activeWorkout.status = "paused";
  });
  await f.refresh();
  f.sandbox.renderMiniWorkout();
  assert.equal(mini.hidden, false);
  assert.match(mini.innerHTML, /WORKOUT PAUSED/);
  await f.a.update((d) => {
    d.activeWorkout.status = "active";
    workouts.startRestTimer(d.activeWorkout, 90, new Date(Date.now() + 60_000));
  });
  const current = await f.refresh();
  const label = {
    dataset: { workoutId: current.id, restKey: "retired" },
    textContent: "unchanged",
  };
  f.sandbox.document.querySelector = () => label;
  await f.sandbox.updateRestDisplays();
  assert.equal(label.textContent, "unchanged");
  label.dataset.restKey = timerKey(current);
  await f.sandbox.updateRestDisplays();
  assert.match(label.textContent, /^REST · /);
});

test("expired or zero-length paused rest is not resurrected when resuming", async () => {
  const f = await fixture();
  const w = f.viewed;
  workouts.startRestTimer(w, 15, NOW);
  const later = new Date(+NOW + 20_000);
  workouts.changeWorkoutPause(
    w,
    { workoutId: w.id, pauseKey: pauseKey(w) },
    later,
  );
  assert.equal(w.restTimer.running, false);
  assert.equal(w.restTimer.paused, false);
  // A legacy zero-length paused record should also return to a stopped state.
  w.restTimer.paused = true;
  workouts.changeWorkoutPause(
    w,
    { workoutId: w.id, pauseKey: pauseKey(w) },
    later,
  );
  assert.equal(w.restTimer.running, false);
  assert.equal(w.restTimer.paused, false);
});

test("automatic expiry removes only its own timer without rebuilding unsaved inputs", async () => {
  const f = await fixture();
  await f.a.update((d) => {
    workouts.startRestTimer(d.activeWorkout, 15, NOW);
  });
  const w = await f.refresh();
  const removed = [];
  for (const key of [timerKey(w), "different-timer"])
    f.displays.push({
      dataset: { workoutId: w.id, restKey: key },
      textContent: "0:15",
      closest: () => ({ remove: () => removed.push(key) }),
    });
  await f.sandbox.updateRestDisplays();
  assert.deepEqual(removed, [timerKey(w)]);
  assert.equal(
    f.renders.length,
    0,
    "Background expiry must not destroy input drafts, focus or media elements",
  );
});
