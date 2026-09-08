import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { createCoordinatedFitCoachStore } from "../v040/core/coordinated-store.mjs";
import { createInitialState } from "../v040/core/store.mjs";
import { EXERCISES } from "../v040/data/exercise-library.mjs";
import {
  approvePlanProposal,
  buildPlan,
  buildWorkoutSchedule,
  createPlanProposal,
  rejectPlanProposal,
  startWorkoutFromIntent,
  startWorkoutFromPlan,
} from "../v040/domain/workouts.mjs";

const NOW = new Date("2026-09-08T15:00:00.000Z");

function stateWithPlan() {
  const state = createInitialState("mo");
  state.profile.onboarded = true;
  state.profile.ageBand = "adult_18_plus";
  state.profile.days = 3;
  state.profile.preferredDays = [1, 3, 5];
  state.activePlan = buildPlan(state, EXERCISES, {
    planId: "A",
    minutes: 45,
  });
  return state;
}

function startPlanIntent(state, planId = state.activePlan.id) {
  return {
    kind: "plan",
    planId,
    baseVersionId: state.activePlan.versionId,
  };
}

test("a plan start uses the exact reviewed version and supports its reduced variants", () => {
  for (const planId of ["A", "B", "MIN"]) {
    const state = stateWithPlan();
    const result = startWorkoutFromIntent(
      state,
      EXERCISES,
      startPlanIntent(state, planId),
      NOW,
    );
    assert.equal(result.resumed, false);
    assert.equal(state.activeWorkout, result.workout);
    assert.equal(result.workout.planId, planId);
    assert.equal(result.workout.startedAt, NOW.toISOString());
    if (planId === "MIN") assert.equal(result.workout.exercises.length, 2);
  }
});

test("an altered plan or invented variant cannot be started from an old control", () => {
  for (const change of [
    (state) => {
      state.activePlan.versionId = "new-version";
    },
    (state) => {
      state.activePlan = null;
    },
    () => {},
  ]) {
    const state = stateWithPlan();
    const intent = startPlanIntent(state);
    change(state);
    if (state.activePlan && state.activePlan.versionId === intent.baseVersionId)
      intent.planId = "invented-plan";
    assert.throws(
      () => startWorkoutFromIntent(state, EXERCISES, intent, NOW),
      /local_plan_changed/u,
    );
    assert.equal(state.activeWorkout, null);
  }
});

test("a schedule control must still identify the same generated slot", () => {
  const state = stateWithPlan();
  const viewed = buildWorkoutSchedule(state, EXERCISES)[1];
  const intent = {
    kind: "schedule",
    slotId: viewed.id,
    planVersionId: viewed.plan.versionId,
  };
  state.activePlan.exercises.reverse();
  assert.throws(
    () => startWorkoutFromIntent(state, EXERCISES, intent, NOW),
    /local_plan_changed/u,
  );
  assert.equal(state.activeWorkout, null);

  const latest = buildWorkoutSchedule(state, EXERCISES)[1];
  const result = startWorkoutFromIntent(
    state,
    EXERCISES,
    {
      ...intent,
      planVersionId: latest.plan.versionId,
    },
    NOW,
  );
  assert.equal(result.dayLabel, latest.dayLabel);
  assert.equal(result.workout.planVersionId, latest.plan.versionId);
});

test("a saved routine must retain its identity, version and save receipt", () => {
  for (const mutate of [
    (routine) => {
      routine.plan.versionId = "replaced-plan";
    },
    (routine) => {
      routine.savedAt = "2026-09-08T16:00:00.000Z";
    },
    (_routine, state) => {
      state.workoutDrafts = [];
    },
  ]) {
    const state = stateWithPlan();
    const routine = {
      id: "routine-1",
      label: "Saved strength",
      savedAt: "2026-09-08T14:00:00.000Z",
      plan: structuredClone(state.activePlan),
    };
    state.workoutDrafts = [routine];
    const intent = {
      kind: "routine",
      routineId: routine.id,
      planVersionId: routine.plan.versionId,
      savedAt: routine.savedAt,
    };
    mutate(routine, state);
    assert.throws(
      () => startWorkoutFromIntent(state, EXERCISES, intent, NOW),
      /local_plan_changed/u,
    );
    assert.equal(state.activeWorkout, null);
  }
});

test("an already-started workout is preserved rather than overwritten", () => {
  const state = stateWithPlan();
  const intent = startPlanIntent(state);
  const existing = startWorkoutFromPlan(state.activePlan, NOW);
  existing.notes = "Saved progress";
  existing.exercises[0].sets[0].done = true;
  state.activeWorkout = existing;
  state.activePlan.versionId = "a-newer-plan-does-not-replace-the-session";
  const result = startWorkoutFromIntent(state, EXERCISES, intent, NOW);
  assert.equal(result.resumed, true);
  assert.equal(result.workout, existing);
  assert.equal(state.activeWorkout.notes, "Saved progress");
  assert.equal(state.activeWorkout.exercises[0].sets[0].done, true);
});

test("a proposal cannot activate after its base plan changes", () => {
  const state = stateWithPlan();
  const proposal = createPlanProposal(
    state,
    EXERCISES,
    {
      minutes: 20,
    },
    NOW,
  );
  state.pendingPlanProposal = proposal;
  state.activePlan = buildPlan(state, EXERCISES, {
    planId: "A",
    minutes: 30,
  });
  const latestVersion = state.activePlan.versionId;
  assert.throws(
    () => approvePlanProposal(state, proposal.id, NOW),
    /local_plan_changed/u,
  );
  assert.equal(state.activePlan.versionId, latestVersion);
  assert.equal(state.pendingPlanProposal.id, proposal.id);
  assert.equal(state.planHistory.length, 0);
});

function pair(initial = stateWithPlan()) {
  const values = new Map();
  const storage = {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
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
  return {
    initial,
    a: createCoordinatedFitCoachStore({ storage, locks }),
    b: createCoordinatedFitCoachStore({ storage, locks }),
  };
}

const appSource = readFileSync(
  new URL("../v040/app.js", import.meta.url),
  "utf8",
);
const startHelpers = appSource.slice(
  appSource.indexOf("function workoutStartView()"),
  appSource.indexOf("function resumeWorkout()"),
);
const proposalHelpers = appSource.slice(
  appSource.indexOf("async function stageProposal("),
  appSource.indexOf("function workoutStartView()"),
);

function installStartHandlers(sandbox) {
  runInNewContext(startHelpers, sandbox);
  return sandbox;
}

function installProposalHandlers(sandbox) {
  runInNewContext(proposalHelpers, sandbox);
  return sandbox;
}

test("the actual staging handler never replaces a peer proposal", async () => {
  const stores = pair();
  await stores.a.load();
  await stores.a.replace(stores.initial);
  await stores.b.load();
  const viewed = stores.b.get();
  const localProposal = createPlanProposal(
    viewed,
    EXERCISES,
    { minutes: 20 },
    NOW,
  );
  const peerProposal = createPlanProposal(
    viewed,
    EXERCISES,
    { minutes: 30 },
    NOW,
  );
  await stores.a.update((draft) => {
    draft.pendingPlanProposal = peerProposal;
  });
  const messages = [];
  const sandbox = installProposalHandlers({
    approvePlanProposal,
    rejectPlanProposal,
    createPlanProposal,
    deepClone: structuredClone,
    uid: () => "unused",
    EXERCISES,
    state: viewed,
    store: stores.b,
    ui: {
      route: "train",
      trainSegment: "workout",
      showActiveWorkout: false,
      exerciseDetailId: null,
      modal: null,
    },
    workoutStartView: () => ({
      route: "train",
      trainSegment: "workout",
      showActiveWorkout: false,
      exerciseDetailId: null,
      modal: null,
    }),
    workoutStartViewIsCurrent: () => true,
    openModal() {},
    closeModal() {},
    render() {},
    renderAppScreen() {},
    renderModalRoot() {},
    toast: (message) => messages.push(message),
  });
  assert.equal(await sandbox.stageProposal(localProposal), false);
  assert.equal(
    (await stores.a.refresh()).pendingPlanProposal.id,
    peerProposal.id,
  );
  assert.match(messages.at(-1), /plan changed before this preview/u);
});

test("the actual approval handler never reports or closes a stale approval", async () => {
  const stores = pair();
  await stores.a.load();
  await stores.a.replace(stores.initial);
  await stores.a.update((draft) => {
    draft.pendingPlanProposal = createPlanProposal(
      draft,
      EXERCISES,
      { minutes: 20 },
      NOW,
    );
  });
  await stores.b.load();
  const viewed = stores.b.get();
  const proposalId = viewed.pendingPlanProposal.id;
  await stores.a.update((draft) => approvePlanProposal(draft, proposalId, NOW));
  const peerVersion = stores.a.get().activePlan.versionId;
  const messages = [];
  let closeCalls = 0;
  const modal = { type: "proposal" };
  const sandbox = installProposalHandlers({
    approvePlanProposal,
    rejectPlanProposal,
    createPlanProposal,
    deepClone: structuredClone,
    uid: () => "unused",
    EXERCISES,
    state: viewed,
    store: stores.b,
    ui: {
      route: "train",
      trainSegment: "workout",
      showActiveWorkout: false,
      exerciseDetailId: null,
      modal,
    },
    workoutStartView() {},
    workoutStartViewIsCurrent: () => true,
    openModal() {},
    closeModal: () => {
      closeCalls += 1;
    },
    render() {},
    renderAppScreen() {},
    renderModalRoot() {},
    toast: (message) => messages.push(message),
  });
  await sandbox.approveProposal(proposalId);
  assert.equal(sandbox.state.activePlan.versionId, peerVersion);
  assert.equal(sandbox.state.pendingPlanProposal, null);
  assert.equal(closeCalls, 0);
  assert.equal(
    messages.includes("Plan version approved and activated."),
    false,
  );
  assert.match(modal.error, /was not activated/u);
});

test("the actual app handler refuses a stale plan and refreshes the visible copy", async () => {
  const stores = pair();
  await stores.a.load();
  await stores.a.replace(stores.initial);
  await stores.b.load();
  const viewed = stores.b.get();
  const messages = [];
  await stores.a.update((draft) => {
    draft.activePlan = buildPlan(draft, EXERCISES, {
      planId: "A",
      minutes: 30,
    });
  });
  const sandbox = installStartHandlers({
    startWorkoutFromIntent,
    buildWorkoutSchedule,
    EXERCISES,
    state: viewed,
    store: stores.b,
    ui: {
      route: "today",
      trainSegment: "workout",
      showActiveWorkout: false,
      exerciseDetailId: null,
      modal: null,
    },
    render() {},
    toast: (message) => messages.push(message),
    window: { scrollTo() {} },
  });
  await sandbox.startWorkout({
    dataset: {
      value: viewed.activePlan.id,
      planVersionId: viewed.activePlan.versionId,
    },
  });
  assert.equal(sandbox.state.activeWorkout, null);
  assert.equal(
    sandbox.state.activePlan.versionId,
    stores.a.get().activePlan.versionId,
  );
  assert.match(messages.at(-1), /changed before it started/u);
  assert.equal(sandbox.ui.route, "today");
});

test("the actual app handler resumes a peer-started session without data loss", async () => {
  const stores = pair();
  await stores.a.load();
  await stores.a.replace(stores.initial);
  await stores.b.load();
  const viewed = stores.b.get();
  await stores.a.update((draft) => {
    draft.activeWorkout = startWorkoutFromPlan(draft.activePlan, NOW);
    draft.activeWorkout.notes = "Started elsewhere";
    draft.activeWorkout.exercises[0].sets[0].done = true;
  });
  const sandbox = installStartHandlers({
    startWorkoutFromIntent,
    buildWorkoutSchedule,
    EXERCISES,
    state: viewed,
    store: stores.b,
    ui: {
      route: "today",
      trainSegment: "workout",
      showActiveWorkout: false,
      exerciseDetailId: null,
      modal: null,
    },
    render() {},
    toast() {},
    window: { scrollTo() {} },
  });
  await sandbox.startWorkout({
    dataset: {
      value: viewed.activePlan.id,
      planVersionId: viewed.activePlan.versionId,
    },
  });
  assert.equal(sandbox.state.activeWorkout.notes, "Started elsewhere");
  assert.equal(sandbox.state.activeWorkout.exercises[0].sets[0].done, true);
  assert.equal(sandbox.ui.route, "train");
  assert.equal(sandbox.ui.showActiveWorkout, true);
});

test("a delayed start never pulls the user back after they navigate elsewhere", async () => {
  const state = stateWithPlan();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const scrolls = [];
  const sandbox = installStartHandlers({
    startWorkoutFromIntent,
    buildWorkoutSchedule,
    EXERCISES,
    state,
    store: {
      async update(updater) {
        await gate;
        updater(state);
        return state;
      },
      async refresh() {
        return state;
      },
    },
    ui: {
      route: "today",
      trainSegment: "workout",
      showActiveWorkout: false,
      exerciseDetailId: null,
      modal: null,
    },
    render() {},
    toast() {},
    window: { scrollTo: (...args) => scrolls.push(args) },
  });
  const pending = sandbox.startWorkout({
    dataset: {
      value: state.activePlan.id,
      planVersionId: state.activePlan.versionId,
    },
  });
  sandbox.ui.route = "nutrition";
  release();
  await pending;
  assert.ok(state.activeWorkout);
  assert.equal(sandbox.ui.route, "nutrition");
  assert.equal(sandbox.ui.showActiveWorkout, false);
  assert.equal(scrolls.length, 0);
});

test("every rendered start control carries the identity its handler validates", () => {
  const train = readFileSync(
    new URL("../v040/ui/train-screen.mjs", import.meta.url),
    "utf8",
  );
  const home = readFileSync(
    new URL("../v040/ui/home-screen.mjs", import.meta.url),
    "utf8",
  );
  assert.match(train, /data-plan-version-id/u);
  assert.match(train, /data-saved-at/u);
  assert.match(home, /data-plan-version-id/u);
  assert.match(appSource, /startWorkout\(target\)/u);
  assert.match(appSource, /startScheduledWorkout\(target\)/u);
  assert.match(appSource, /startSavedRoutine\(target\)/u);
});
