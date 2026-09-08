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
    delete projected.integrations.cloudSync.lastSyncedDigest;
    delete projected.integrations.cloudSync.accountScope;
  }
  return projected;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function syncStateSignature(state) {
  const projected = projectStateForEncryptedSync(state);
  if (!projected) throw new Error("invalid_cloud_state");
  delete projected.updatedAt;
  if (projected.integrations) delete projected.integrations.cloudSync;
  return JSON.stringify(canonical(projected));
}

async function digestText(value) {
  if (!globalThis.crypto?.subtle) throw new Error("sync_integrity_unavailable");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export const syncStateDigest = state => digestText(syncStateSignature(state));
export const syncAccountScope = subject => digestText(`fitcoach-sync-account-v1:${subject}`);

export async function hasUnsyncedLocalChanges(state) {
  const acknowledged = state?.integrations?.cloudSync?.lastSyncedDigest;
  // Old clock-only markers cannot prove which content reached the server.
  if (!/^[a-f0-9]{64}$/u.test(acknowledged || "")) return true;
  return await syncStateDigest(state) !== acknowledged;
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
