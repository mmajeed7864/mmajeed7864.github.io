import test from "node:test";
import assert from "node:assert/strict";
import { createFitCoachStore } from "../v040/core/store.mjs";
import { createAccountClient, accountRetryDelay, saveAccountSession, readAccountSession } from "../v040/services/account-client.mjs";
import { createSyncCoordinator } from "../v040/services/sync-coordinator.mjs";
import { hasUnsyncedLocalChanges, syncAccountScope, syncStateDigest, syncStateSignature, projectStateForEncryptedSync, mergeRemoteStateWithLocalOnlyFields } from "../v040/domain/sync-projection.mjs";

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const SUBJECT = "8dc8d384-a565-4ef7-bcb6-6a81caf9bf91";
const VERSION = "2026-08-31.1";
const DATE = new Date("2026-09-08T12:00:00Z");

async function harness({ acknowledged = true } = {}) {
  const storage = memoryStorage();
  const store = createFitCoachStore({ storage, clock: () => DATE });
  store.load();
  if (acknowledged) {
    const digest = await syncStateDigest(store.get());
    const accountScope = await syncAccountScope(SUBJECT);
    store.update(draft => { draft.integrations.cloudSync = { status: "connected", revision: 1, consentVersion: VERSION, lastSyncedAt: DATE.toISOString(), lastSyncedDigest: digest, accountScope }; });
  }
  const calls = { consent: 0, pull: 0, push: 0, apply: 0 };
  const h = { store, calls, remote: { revision: acknowledged ? 1 : 0, state: acknowledged ? projectStateForEncryptedSync(store.get()) : null }, pull: null, push: null };
  const client = {
    session: { user: { id: SUBJECT } },
    async recordSyncConsent() { calls.consent++; },
    async pullSync() { calls.pull++; return h.pull ? h.pull() : structuredClone(h.remote); },
    async pushSync(payload) {
      calls.push++;
      if (h.push) return h.push(payload);
      assert.equal(payload.baseRevision, h.remote.revision);
      h.remote = { state: payload.state, revision: h.remote.revision + 1 };
      return { revision: h.remote.revision, updatedAt: "2099-01-01T00:00:00Z" };
    },
  };
  const coordinator = createSyncCoordinator({
    client, getStore: () => store, getConsentVersion: () => VERSION, deviceId: () => "device_test_123", schemaVersion: 4, clock: () => DATE,
    applyRemote(remote, metadata) {
      calls.apply++;
      const merged = mergeRemoteStateWithLocalOnlyFields(remote.state, store.get());
      merged.integrations.cloudSync = { status: "connected", revision: remote.revision, consentVersion: VERSION, lastSyncedAt: DATE.toISOString(), ...metadata };
      store.replace(merged);
      return true;
    },
  });
  return { ...h, client, coordinator, source: h };
}

test("an unchanged acknowledged copy performs no write; local-only edits do not dirty sync", async () => {
  const h = await harness();
  h.store.update(draft => { draft.chat.push({ id: "local", role: "user", text: "Private", at: DATE.toISOString() }); });
  assert.equal(await hasUnsyncedLocalChanges(h.store.get()), false);
  assert.equal((await h.coordinator.sync()).status, "connected");
  assert.equal(h.calls.push, 0);
});

test("edits made at the same timestamp are saved and markers survive store reload", async () => {
  const h = await harness();
  h.store.update(draft => { draft.profile.energy = 5; });
  assert.equal(await hasUnsyncedLocalChanges(h.store.get()), true);
  await h.coordinator.sync();
  assert.equal(h.calls.push, 1);
  h.store.load();
  assert.equal(await hasUnsyncedLocalChanges(h.store.get()), false);
  const projected = projectStateForEncryptedSync(h.store.get());
  assert.equal(projected.integrations.cloudSync.accountScope, undefined);
  assert.equal(projected.integrations.cloudSync.lastSyncedDigest, undefined);
});

test("edits during a PUT stay pending and are not falsely covered by its acknowledgement", async () => {
  const h = await harness();
  h.store.update(draft => { draft.profile.energy = 4; });
  const entered = deferred(), response = deferred();
  h.source.push = async payload => { entered.resolve(payload); return response.promise; };
  const running = h.coordinator.sync();
  const sent = await entered.promise;
  h.store.update(draft => { draft.profile.energy = 5; });
  h.source.remote = { state: sent.state, revision: 2 };
  response.resolve({ revision: 2, updatedAt: "2099-01-01T00:00:00Z" });
  assert.equal((await running).status, "pending");
  assert.equal(h.store.get().profile.energy, 5);
  assert.equal(await hasUnsyncedLocalChanges(h.store.get()), true);
  h.source.push = null;
  await h.coordinator.sync();
  assert.equal(h.source.remote.state.profile.energy, 5);
  assert.equal(await hasUnsyncedLocalChanges(h.store.get()), false);
});

test("a lost PUT acknowledgement is reconciled by reading, not blindly repeating the write", async () => {
  const h = await harness();
  h.store.update(draft => { draft.profile.energy = 4; });
  h.source.push = async payload => {
    h.source.remote = { revision: 2, state: payload.state };
    throw new Error("account_network_unavailable");
  };
  await assert.rejects(h.coordinator.sync(), /account_network_unavailable/);
  assert.equal(h.store.get().profile.energy, 4);
  assert.equal(await hasUnsyncedLocalChanges(h.store.get()), true);
  assert.equal((await h.coordinator.sync()).status, "connected");
  assert.equal(h.calls.push, 1);
});

test("a newer cloud copy cannot overwrite a local edit, including a legacy clock-only marker", async () => {
  for (const acknowledged of [true, false]) {
    const h = await harness({ acknowledged });
    h.store.update(draft => { draft.profile.energy = 5; });
    const before = syncStateSignature(h.store.get());
    h.source.remote = { revision: 2, state: projectStateForEncryptedSync({ ...h.store.get(), profile: { ...h.store.get().profile, energy: 1 } }) };
    const result = await h.coordinator.sync();
    assert.equal(result.status, "conflict");
    assert.equal(syncStateSignature(h.store.get()), before);
    assert.equal(h.calls.apply, 0);
    assert.equal(h.calls.push, 0);
  }
});

test("conflict resolution rechecks the server and rejects an unseen newer revision", async () => {
  for (const preference of ["cloud", "device"]) {
    const h = await harness();
    h.source.remote.revision = 3;
    const result = await h.coordinator.sync({ preference, pendingRemote: { revision: 2 } });
    assert.equal(result.status, "conflict");
    assert.equal(h.calls.apply, 0);
    assert.equal(h.calls.push, 0);
  }
});

test("a reviewed cloud choice restores the remote copy but keeps local chat and drafts", async () => {
  const h = await harness();
  h.store.update(draft => { draft.chat.push({ role: "user", text: "Private", at: DATE.toISOString() }); });
  h.source.remote = { revision: 2, state: projectStateForEncryptedSync({ ...h.store.get(), profile: { ...h.store.get().profile, energy: 1 } }) };
  const result = await h.coordinator.sync({ preference: "cloud", pendingRemote: { revision: 2 } });
  assert.equal(result.restored, true);
  assert.equal(h.store.get().profile.energy, 1);
  assert.equal(h.store.get().chat[0].text, "Private");
  assert.equal(await hasUnsyncedLocalChanges(h.store.get()), false);
});

test("overlapping sync calls do not issue duplicate requests", async () => {
  const h = await harness();
  const entered = deferred(), response = deferred();
  h.source.pull = async () => { entered.resolve(); return response.promise; };
  const running = h.coordinator.sync();
  await entered.promise;
  await assert.rejects(h.coordinator.sync(), /sync_in_progress/);
  response.resolve(h.remote);
  await running;
  assert.equal(h.calls.pull, 1);
});

test("late responses after cancel, account change or partition switch never change current data", async () => {
  for (const change of [h => h.coordinator.cancel(), h => { h.client.session = null; }, h => h.store.switchFounder("another-local-profile")]) {
    const h = await harness();
    const entered = deferred(), response = deferred();
    h.source.pull = async () => { entered.resolve(); return response.promise; };
    const running = h.coordinator.sync();
    await entered.promise;
    change(h);
    const before = h.store.export();
    response.resolve({ revision: 2, state: { ...h.remote.state, profile: { energy: 1 } } });
    await assert.rejects(running, /sync_cancelled/);
    assert.equal(h.store.export(), before);
    assert.equal(h.calls.apply, 0);
  }
});

test("another account cannot reuse the previous account's revision, consent or conflict choice", async () => {
  const h = await harness();
  h.client.session = { user: { id: "a441b8f4-753e-4d93-9820-ae2cebe9e9dc" } };
  await assert.rejects(h.coordinator.sync({ preference: "device", pendingRemote: h.remote }), /conflict_choice_expired/);
  h.source.remote = { revision: 4, state: { ...h.remote.state, profile: { ...h.remote.state.profile, energy: 1 } } };
  assert.equal((await h.coordinator.sync()).status, "conflict");
  assert.equal(h.calls.consent, 1);
  assert.equal(h.store.get().integrations.cloudSync.revision, 0);
  assert.equal(h.calls.push, 0);
});

function clientHarness(fetchImpl, options = {}) {
  const storage = memoryStorage();
  saveAccountSession({ accessToken: "test-access", refreshToken: "test-refresh", expiresAt: Date.now() + 3_600_000, user: { id: SUBJECT, email: "test@example.com" } }, storage);
  return { storage, client: createAccountClient({ storage, fetchImpl, random: () => 0, ...options }) };
}
const ok = payload => ({ ok: true, json: async () => payload });
const failed = (status, value = "5") => ({ ok: false, status, headers: { get: name => name === "Retry-After" ? value : null }, json: async () => ({ error: status === 429 ? "RATE_LIMITED" : "TEMPORARILY_UNAVAILABLE" }) });

test("Retry-After accepts seconds and HTTP dates; malformed values use a bounded default", () => {
  assert.equal(accountRetryDelay("30", DATE.getTime()), 30_000);
  assert.equal(accountRetryDelay(new Date(DATE.getTime() + 60_000).toUTCString(), DATE.getTime()), 60_000);
  assert.equal(accountRetryDelay("nonsense", DATE.getTime()), 5_000);
  assert.equal(accountRetryDelay("0", DATE.getTime()), 1_000);
});

test("429 and 503 have a cooldown, retain sign-in, and never perform a hidden retry", async () => {
  for (const status of [429, 503]) {
    let now = Date.now(), calls = 0;
    const h = clientHarness(async () => { calls++; return calls === 1 ? failed(status, "30") : ok({ ok: true, revision: 0, state: null }); }, { clock: () => now });
    await assert.rejects(h.client.pullSync(), error => error.status === status && error.retryAt === now + 30_000);
    await assert.rejects(h.client.pullSync(), error => error.retryAt === now + 30_000);
    assert.equal(calls, 1);
    assert.ok(readAccountSession(h.storage));
    now += 30_000;
    await h.client.pullSync();
    assert.equal(calls, 2);
  }
});

test("write, deletion and subscription failures are never automatically replayed", async () => {
  for (const operation of [
    c => c.pushSync({ baseRevision: 0, deviceId: "device_test_123", schemaVersion: 4, state: {} }),
    c => c.deleteAccount(), c => c.verifySubscription({ operation: "verify" }),
  ]) {
    let calls = 0;
    const h = clientHarness(async () => { calls++; return failed(503); });
    await assert.rejects(operation(h.client));
    await assert.rejects(operation(h.client));
    assert.equal(calls, 1);
    assert.ok(h.client.session);
  }
});

test("a stalled network is aborted and returns a retryable error without erasing sign-in", async () => {
  const h = clientHarness((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("abort")), { once: true })), { requestTimeoutMs: 10 });
  await assert.rejects(h.client.pullSync(), error => error.message === "account_timeout" && error.retryAt > Date.now());
  assert.ok(h.client.session);
});

test("the timeout also covers a response body that stalls after HTTP headers", async () => {
  const h = clientHarness(async (_url, { signal }) => ({ ok: true, json: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("abort")), { once: true })) }), { requestTimeoutMs: 10 });
  await assert.rejects(h.client.pullSync(), error => error.message === "account_timeout" && error.retryAt > Date.now());
  assert.ok(h.client.session);
});

test("simultaneous requests share one refresh; a late refresh cannot recreate a signed-out session", async () => {
  for (const signOut of [false, true]) {
    const entered = deferred(), refresh = deferred();
    let refreshes = 0;
    const h = clientHarness(async url => {
      if (url.endsWith("fitcoach-platform-config-v1")) return ok({ ok: true, auth: { enabled: true, supabaseUrl: "https://test.supabase.co", anonKey: "public-test-key" } });
      if (url.includes("grant_type=refresh_token")) { refreshes++; entered.resolve(); return refresh.promise; }
      return ok({ ok: true, revision: 0, state: null });
    }, { clock: () => Date.now() + 3_550_000 });
    const first = h.client.pullSync(), second = h.client.pullSync();
    const settled = Promise.allSettled([first, second]);
    await entered.promise;
    if (signOut) await h.client.clearSession();
    refresh.resolve(ok({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 7200, user: { id: SUBJECT, email: "test@example.com" } }));
    const results = await settled;
    assert.equal(refreshes, 1);
    assert.ok(results.every(result => result.status === (signOut ? "rejected" : "fulfilled")));
    assert.equal(Boolean(readAccountSession(h.storage)), !signOut);
    assert.equal(Boolean(h.client.session), !signOut);
  }
});

test("a newly verified account never waits on or reuses the previous account's refresh", async () => {
  const entered = deferred(), previous = deferred();
  const nextSubject = "a441b8f4-753e-4d93-9820-ae2cebe9e9dc";
  const nextPayload = { access_token: "next-access", refresh_token: "next-refresh", expires_in: 3600, user: { id: nextSubject, email: "next@example.test" } };
  const refreshedTokens = [];
  const h = clientHarness(async (url, options) => {
    if (url.endsWith("fitcoach-platform-config-v1")) return ok({ ok: true, auth: { enabled: true, supabaseUrl: "https://test.supabase.co", anonKey: "public-test-key" } });
    if (url.includes("grant_type=refresh_token")) {
      const token = JSON.parse(options.body).refresh_token;
      refreshedTokens.push(token);
      if (token === "test-refresh") { entered.resolve(); return previous.promise; }
      return ok(nextPayload);
    }
    if (url.endsWith("/verify")) return ok(nextPayload);
    throw new Error("unexpected_request");
  });
  const oldRefresh = h.client.refreshSession();
  const rejected = assert.rejects(oldRefresh, /authentication_changed/);
  await entered.promise;
  await h.client.verifyEmailCode("next@example.test", "123456");
  await h.client.refreshSession();
  assert.deepEqual(refreshedTokens, ["test-refresh", "next-refresh"]);
  previous.resolve(ok({ ...nextPayload, user: { id: SUBJECT, email: "previous@example.test" } }));
  await rejected;
  assert.equal(h.client.session.user.id, nextSubject);
  assert.equal(readAccountSession(h.storage).user.id, nextSubject);
});
