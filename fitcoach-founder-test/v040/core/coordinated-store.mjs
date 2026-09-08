import { createFitCoachStore } from "./store.mjs";

// One origin-wide lock also covers reset, which clears every local partition.
// Never hold it across a provider request or use lock stealing/time-based leases.
export const LOCAL_DATA_LOCK = "fitcoach-local-data-v1";
export const LOCAL_RESET_KEY = "fitcoach-local-reset-epoch";

export function createCoordinatedFitCoachStore({
  storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks,
  founder = "mo",
  clock,
  lockTimeoutMs = 5_000,
} = {}) {
  const base = createFitCoachStore({ storage, founder, ...(clock ? { clock } : {}) });
  let loaded = false;
  let epoch;
  let invalidated = false;
  const readEpoch = () => storage.getItem(LOCAL_RESET_KEY) || "initial";
  const assertEpoch = expected => {
    if (invalidated || (loaded && readEpoch() !== expected)) {
      invalidated = true;
      throw new Error("local_reset_detected");
    }
  };
  async function exclusive(operation, { initialize = false } = {}) {
    if (!locks?.request) throw new Error("local_coordination_unavailable");
    const expected = epoch;
    if (!initialize && !loaded) throw new Error("local_store_not_loaded");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), lockTimeoutMs);
    try {
      return await locks.request(LOCAL_DATA_LOCK, { mode: "exclusive", signal: controller.signal }, () => {
        clearTimeout(timeout);
        assertEpoch(expected);
        return operation();
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error("local_save_busy");
      throw error;
    } finally { clearTimeout(timeout); }
  }
  const get = () => {
    if (!loaded) throw new Error("local_store_not_loaded");
    assertEpoch(epoch);
    return base.get();
  };
  return Object.freeze({
    load: () => exclusive(() => {
      if (!loaded && !storage.getItem(LOCAL_RESET_KEY)) storage.setItem(LOCAL_RESET_KEY, globalThis.crypto.randomUUID());
      const next = base.load();
      epoch = readEpoch();
      loaded = true;
      return next;
    }, { initialize: true }),
    refresh: () => exclusive(() => base.load()),
    get,
    update: updater => {
      // Capture the user's viewed workout before waiting. Index-based edits must
      // not apply to a different workout started in another tab while queued.
      const viewedWorkoutId = get().activeWorkout?.id;
      return exclusive(() => {
        const latest = base.load();
        return base.update(draft => {
          const result = updater(draft);
          if (result?.then) throw new Error("local_mutation_must_be_synchronous");
          const next = result === undefined ? draft : result;
          if (viewedWorkoutId !== latest.activeWorkout?.id && JSON.stringify(next.activeWorkout) !== JSON.stringify(latest.activeWorkout)) {
            throw new Error("local_workout_changed");
          }
          return next;
        });
      });
    },
    replace: (next, { expected = get(), assertCurrent = () => {} } = {}) => exclusive(() => {
      assertCurrent();
      const latest = base.load();
      if (JSON.stringify(latest) !== JSON.stringify(expected)) throw new Error("local_changes_during_sync");
      return base.replace(next);
    }),
    reset: () => exclusive(() => {
      // Invalidate older tabs even if writing the new initial state then fails.
      const nextEpoch = globalThis.crypto.randomUUID();
      storage.setItem(LOCAL_RESET_KEY, nextEpoch);
      epoch = nextEpoch;
      return base.reset({ preserveKeys: [LOCAL_RESET_KEY] });
    }),
    export: () => exclusive(() => { base.load(); return base.export(); }),
    subscribe: base.subscribe,
    key: base.key,
    founder: base.founder,
    checkForReset: () => assertEpoch(epoch),
  });
}
