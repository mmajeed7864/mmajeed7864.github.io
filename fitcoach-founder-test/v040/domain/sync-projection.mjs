import { deepClone } from "../core/utils.mjs";

const ALLOWED_KEYS = Object.freeze([
  "schemaVersion",
  "build",
  "profile",
  "settings",
  "sessions",
  "decisions",
  "interventionOutcomes",
  "exercisePreferences",
  "activePlan",
  "pendingPlanProposal",
  "planHistory",
  "activeWorkout",
  "workoutDrafts",
  "lastWorkoutSummary",
  "feedback",
  "integrations",
  "gymProfile",
  "nutrition",
  "createdAt",
  "updatedAt",
]);

export const OMITTED_SYNC_FIELDS = Object.freeze([
  "chat",
  "memories",
  "socialDrafts",
  "hydration",
  "lastApi",
  "founder",
  "migration",
]);

export function projectStateForEncryptedSync(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const projected = Object.fromEntries(ALLOWED_KEYS
    .filter(key => Object.hasOwn(state, key))
    .map(key => [key, deepClone(state[key])]));
  if (projected.nutrition?.days && typeof projected.nutrition.days === "object") {
    projected.nutrition.days = Object.fromEntries(Object.entries(projected.nutrition.days).map(([day, value]) => [
      day,
      {
        ...value,
        entries: (Array.isArray(value?.entries) ? value.entries : []).filter(entry => entry?.status === "confirmed"),
      },
    ]));
  }
  if (projected.integrations?.cloudSync) {
    projected.integrations.cloudSync = {
      ...projected.integrations.cloudSync,
      status: "connected",
    };
  }
  return projected;
}

export function hasUnsyncedLocalChanges(state) {
  const updatedAt = Date.parse(state?.updatedAt || "");
  const lastSyncedAt = Date.parse(state?.integrations?.cloudSync?.lastSyncedAt || "");
  if (!Number.isFinite(updatedAt)) return false;
  if (!Number.isFinite(lastSyncedAt)) return true;
  return updatedAt > lastSyncedAt + 1_000;
}

export function mergeRemoteStateWithLocalOnlyFields(remoteState, localState) {
  if (!remoteState || typeof remoteState !== "object" || Array.isArray(remoteState)) return null;
  if (!localState || typeof localState !== "object" || Array.isArray(localState)) return null;
  const merged = deepClone(remoteState);
  for (const key of OMITTED_SYNC_FIELDS) {
    if (Object.hasOwn(localState, key)) merged[key] = deepClone(localState[key]);
  }
  // The local profile identity is a storage partition, not a cloud account ID.
  // Keeping it local avoids a remote payload switching the active partition.
  merged.founder = localState.founder;
  return merged;
}
