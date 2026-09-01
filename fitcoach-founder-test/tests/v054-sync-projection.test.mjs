import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createInitialState, normalizeStateForTest } from "../v040/core/store.mjs";
import { hasUnsyncedLocalChanges, mergeRemoteStateWithLocalOnlyFields, projectStateForEncryptedSync } from "../v040/domain/sync-projection.mjs";
import { canAccessCurrentRelease } from "../v040/policy/youth-safety.mjs";

test("encrypted sync projection excludes chat, coach memory, API metadata, and local photo drafts", () => {
  const state = createInitialState("mo", new Date("2026-08-31T12:00:00.000Z"));
  state.chat = [{ role: "user", text: "private conversation" }];
  state.memories = ["private memory"];
  state.socialDrafts = [{ id: "draft", caption: "photo", hasImagePreview: true }];
  state.lastApi = { provider: "example" };
  state.nutrition.days["2026-08-31"] = {
    entries: [
      { id: "confirmed-food", status: "confirmed", name: "Oats" },
      { id: "photo-estimate", status: "draft", name: "Unconfirmed photo estimate", photo: { fileName: "meal.jpg" } },
    ],
  };
  const projected = projectStateForEncryptedSync(state);
  assert.equal(Object.hasOwn(projected, "chat"), false);
  assert.equal(Object.hasOwn(projected, "memories"), false);
  assert.equal(Object.hasOwn(projected, "socialDrafts"), false);
  assert.equal(Object.hasOwn(projected, "lastApi"), false);
  assert.equal(projected.profile.goal, "build muscle");
  assert.deepEqual(projected.sessions, []);
  assert.deepEqual(projected.nutrition.days["2026-08-31"].entries.map(entry => entry.id), ["confirmed-food"]);
});

test("cloud integration state is normalized without account identifiers", () => {
  const normalized = normalizeStateForTest({
    integrations: { cloudSync: { status: "connected", revision: 4, consentVersion: "2026-08-31.1", lastSyncedAt: "2026-08-31T12:00:00.000Z", email: "should-not-persist@example.com" } },
  });
  assert.deepEqual(normalized.integrations.cloudSync, {
    status: "connected",
    revision: 4,
    consentVersion: "2026-08-31.1",
    lastSyncedAt: "2026-08-31T12:00:00.000Z",
  });
});

test("unsynced change detection requires a local update after the last sync", () => {
  assert.equal(hasUnsyncedLocalChanges({ updatedAt: "2026-08-31T12:00:02Z", integrations: { cloudSync: { lastSyncedAt: "2026-08-31T12:00:00Z" } } }), true);
  assert.equal(hasUnsyncedLocalChanges({ updatedAt: "2026-08-31T12:00:00Z", integrations: { cloudSync: { lastSyncedAt: "2026-08-31T12:00:00Z" } } }), false);
});

test("cloud pull preserves local-only conversation and photo draft fields", () => {
  const local = createInitialState("mo", new Date("2026-08-31T12:00:00.000Z"));
  local.chat = [{ id: "local-chat", text: "stays local" }];
  local.memories = ["local coach memory"];
  local.socialDrafts = [{ id: "local-photo-draft", caption: "private" }];
  const remote = projectStateForEncryptedSync({ ...local, profile: { ...local.profile, goal: "get stronger" } });
  const merged = mergeRemoteStateWithLocalOnlyFields(remote, local);
  assert.equal(merged.profile.goal, "get stronger");
  assert.deepEqual(merged.chat, local.chat);
  assert.deepEqual(merged.memories, local.memories);
  assert.deepEqual(merged.socialDrafts, local.socialDrafts);
  assert.equal(merged.founder, "mo");
});

test("remote teen or unknown profiles re-enter the current release gate immediately", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  for (const ageBand of ["teen_13_17", "unknown"]) {
    const remote = createInitialState("mo", new Date("2026-08-31T12:00:00.000Z"));
    remote.profile.onboarded = true;
    remote.profile.ageBand = ageBand;
    const normalized = normalizeStateForTest(mergeRemoteStateWithLocalOnlyFields(projectStateForEncryptedSync(remote), createInitialState("mo")));
    assert.equal(canAccessCurrentRelease(normalized.profile.ageBand), false);
  }
  assert.match(app, /function applyRemoteCloudState[\s\S]*canAccessCurrentRelease\(state\.profile\?\.ageBand\)[\s\S]*ui\.mode = "onboarding"/u);
  assert.match(app, /Cloud copy restored\. Complete the current age-appropriate setup/u);
});

test("cloud account deletion clears runtime media and account identity before re-onboarding", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  assert.match(app, /async function deleteCloudAccount[\s\S]*await accountClient\.signOut\(\);[\s\S]*resetRuntimeEffects\(\);[\s\S]*ui\.account\.session = null/u);
});
