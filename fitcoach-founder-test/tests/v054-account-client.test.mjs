import test from "node:test";
import assert from "node:assert/strict";

import {
  clearAccountSession,
  createAccountClient,
  readAccountSession,
  saveAccountSession,
} from "../v040/services/account-client.mjs";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

const authPayload = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_in: 3600,
  user: { id: "8dc8d384-a565-4ef7-bcb6-6a81caf9bf91", email: "person@example.com" },
};

test("account session uses session storage and can be cleared", () => {
  const storage = memoryStorage();
  const session = {
    accessToken: authPayload.access_token,
    refreshToken: authPayload.refresh_token,
    expiresAt: Date.now() + 3_600_000,
    user: authPayload.user,
  };
  assert.equal(saveAccountSession(session, storage), true);
  assert.equal(readAccountSession(storage)?.user.email, "person@example.com");
  clearAccountSession(storage);
  assert.equal(readAccountSession(storage), null);
});

test("native account session hydrates from secure storage and removes the legacy JS token copy", async () => {
  const storage = memoryStorage();
  const legacy = {
    accessToken: "legacy-access",
    refreshToken: "legacy-refresh",
    expiresAt: Date.now() + 3_600_000,
    user: authPayload.user,
  };
  saveAccountSession(legacy, storage);
  const secureRecord = JSON.stringify({
    accessToken: authPayload.access_token,
    refreshToken: authPayload.refresh_token,
    expiresAt: Date.now() + 3_600_000,
    user: authPayload.user,
  });
  const client = createAccountClient({
    storage,
    secureStorage: {
      available: true,
      read: async () => secureRecord,
      write: async () => true,
      clear: async () => true,
    },
  });
  assert.equal(client.usesSecureStorage, true);
  assert.equal(client.session, null);
  await client.hydrateSession();
  assert.equal(client.session?.accessToken, "access-token");
  assert.equal(readAccountSession(storage), null);
});

test("native auth writes and clears only secure storage", async () => {
  const calls = [];
  const storage = memoryStorage();
  const secureStorage = {
    available: true,
    read: async () => null,
    write: async value => { calls.push(["write", JSON.parse(value)]); return true; },
    clear: async () => { calls.push(["clear"]); return true; },
  };
  const fetchImpl = async url => {
    if (String(url).endsWith("fitcoach-platform-config-v1")) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          auth: { enabled: true, supabaseUrl: "https://project.supabase.co", anonKey: "public-anon-key" },
        }),
      };
    }
    if (String(url).endsWith("/auth/v1/verify")) return { ok: true, json: async () => authPayload };
    if (String(url).endsWith("/auth/v1/logout")) return { ok: true, json: async () => ({}) };
    return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
  };
  const client = createAccountClient({ fetchImpl, storage, secureStorage });
  await client.fetchPlatformConfig();
  await client.hydrateSession();
  await client.verifyEmailCode("person@example.com", "123456");
  assert.equal(readAccountSession(storage), null);
  assert.equal(calls[0][0], "write");
  assert.equal(calls[0][1].accessToken, "access-token");
  await client.signOut();
  assert.deepEqual(calls.map(call => call[0]), ["write", "clear"]);
  assert.equal(readAccountSession(storage), null);
});

test("device reset clears a native session locally without a network sign-out", async () => {
  const calls = [];
  const secureRecord = JSON.stringify({
    accessToken: authPayload.access_token,
    refreshToken: authPayload.refresh_token,
    expiresAt: Date.now() + 3_600_000,
    user: authPayload.user,
  });
  const client = createAccountClient({
    storage: memoryStorage(),
    secureStorage: {
      available: true,
      read: async () => secureRecord,
      write: async () => true,
      clear: async () => { calls.push("clear"); return true; },
    },
    fetchImpl: async () => { calls.push("network"); throw new Error("network must not be used"); },
  });
  await client.hydrateSession();
  assert.ok(client.session);
  await client.clearSession();
  assert.equal(client.session, null);
  assert.deepEqual(calls, ["clear"]);
});

test("device reset fails closed when protected native session erasure is not confirmed", async () => {
  const storage = memoryStorage();
  saveAccountSession({
    accessToken: "legacy-access",
    refreshToken: "legacy-refresh",
    expiresAt: Date.now() + 3_600_000,
    user: authPayload.user,
  }, storage);
  const client = createAccountClient({
    storage,
    secureStorage: {
      available: true,
      read: async () => JSON.stringify({
        accessToken: authPayload.access_token,
        refreshToken: authPayload.refresh_token,
        expiresAt: Date.now() + 3_600_000,
        user: authPayload.user,
      }),
      write: async () => true,
      clear: async () => false,
    },
  });
  await client.hydrateSession();
  await assert.rejects(() => client.clearSession(), /secure_session_clear_failed/u);
  assert.equal(client.session, null);
  assert.equal(readAccountSession(storage), null, "a legacy JS token copy is still removed");
});

test("native auth fails closed when secure storage cannot persist the session", async () => {
  const client = createAccountClient({
    storage: memoryStorage(),
    secureStorage: {
      available: true,
      read: async () => null,
      write: async () => false,
      clear: async () => true,
    },
    fetchImpl: async url => {
      if (String(url).endsWith("fitcoach-platform-config-v1")) {
        return { ok: true, json: async () => ({ ok: true, auth: { enabled: true, supabaseUrl: "https://project.supabase.co", anonKey: "public-anon-key" } }) };
      }
      if (String(url).endsWith("/auth/v1/verify")) return { ok: true, json: async () => authPayload };
      return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    },
  });
  await client.fetchPlatformConfig();
  await assert.rejects(() => client.verifyEmailCode("person@example.com", "123456"), /secure_session_storage_failed/u);
  assert.equal(client.session, null);
});

test("account client fails closed when public platform config is unavailable", async () => {
  const client = createAccountClient({
    storage: memoryStorage(),
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, auth: { available: false }, capabilities: {} }) }),
  });
  const config = await client.fetchPlatformConfig();
  assert.equal(config.available, false);
  await assert.rejects(() => client.requestEmailCode("person@example.com"), /platform_setup_required/u);
});

test("account client accepts only CSP-scoped Supabase project origins", async () => {
  const client = createAccountClient({
    storage: memoryStorage(),
    fetchImpl: async () => ({ ok: true, json: async () => ({
      ok: true,
      auth: { enabled: true, supabaseUrl: "https://attacker.example/supabase", anonKey: "public-anon-key" },
    }) }),
  });
  const config = await client.fetchPlatformConfig();
  assert.equal(config.authAvailable, false);
  assert.equal(config.supabaseUrl, "");
});

test("an HTTP-200 platform payload marked not-ok cannot activate accounts or capabilities", async () => {
  const client = createAccountClient({
    storage: memoryStorage(),
    fetchImpl: async () => ({ ok: true, json: async () => ({
      ok: false,
      reason: "disabled",
      auth: { enabled: true, supabaseUrl: "https://project.supabase.co", anonKey: "public-anon-key" },
      capabilities: { sync: true, subscriptions: true, entitlements: true },
    }) }),
  });
  const config = await client.fetchPlatformConfig();
  assert.equal(config.authAvailable, false);
  assert.deepEqual(config.capabilities, {
    sync: false,
    accountExport: false,
    accountDeletion: false,
    entitlements: false,
    subscriptions: false,
  });
});

test("email-code auth and sync keep bearer access token out of request bodies", async () => {
  const calls = [];
  const storage = memoryStorage();
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("fitcoach-platform-config-v1")) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          config: {
            auth: { enabled: true, supabaseUrl: "https://project.supabase.co", anonKey: "public-anon-key" },
            sync: { available: true, consentVersion: "2026-08-31.1" },
            account: { exportAvailable: true, deletionAvailable: true, entitlementsAvailable: true },
            subscriptions: { available: false },
          },
        }),
      };
    }
    if (String(url).endsWith("/auth/v1/otp")) return { ok: true, json: async () => ({}) };
    if (String(url).endsWith("/auth/v1/verify")) return { ok: true, json: async () => authPayload };
    if (String(url).endsWith("/fitcoach-sync-v1")) return { ok: true, json: async () => ({ ok: true, revision: 1 }) };
    return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
  };
  const client = createAccountClient({ fetchImpl, storage });
  const config = await client.fetchPlatformConfig();
  assert.equal(config.capabilities.entitlements, true);
  assert.equal(config.capabilities.subscriptions, false);
  await client.requestEmailCode("PERSON@example.com");
  await client.verifyEmailCode("person@example.com", "123456");
  const result = await client.pushSync({ baseRevision: 0, deviceId: "device_123456", schemaVersion: 4, state: { profile: { goal: "build muscle" } } });
  assert.equal(result.revision, 1);
  const syncCall = calls.find(call => call.url.endsWith("/fitcoach-sync-v1"));
  assert.equal(syncCall.options.headers.Authorization, "Bearer access-token");
  assert.doesNotMatch(String(syncCall.options.body), /access-token|refresh-token/u);
});

test("account deletion uses the exact server confirmation and no email", async () => {
  const calls = [];
  const storage = memoryStorage();
  saveAccountSession({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 3_600_000,
    user: authPayload.user,
  }, storage);
  const client = createAccountClient({
    storage,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("fitcoach-account-v1")) return { ok: true, json: async () => ({ ok: true, deleted: true }) };
      return { ok: true, json: async () => ({ ok: true, auth: { available: false }, capabilities: {} }) };
    },
  });
  const result = await client.deleteAccount();
  assert.equal(result.deleted, true);
  const body = JSON.parse(calls.at(-1).options.body);
  assert.deepEqual(body, { confirmation: "DELETE MY FITCOACH ACCOUNT" });
});

test("HTTP-2xx false or malformed deletion responses never erase local access", async () => {
  for (const payload of [{ ok: false, deleted: true }, { ok: true, deleted: false }, { ok: true }, {}]) {
    const storage = memoryStorage();
    saveAccountSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 3_600_000,
      user: authPayload.user,
    }, storage);
    const client = createAccountClient({
      storage,
      fetchImpl: async () => ({ ok: true, json: async () => payload }),
    });
    await assert.rejects(() => client.deleteAccount(), /account_deletion_not_confirmed/u);
    assert.ok(client.session, "the local account session remains available for a safe retry");
  }
});
