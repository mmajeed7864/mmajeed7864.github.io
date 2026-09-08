import { BUILD } from "../core/constants.mjs";

const DEFAULT_API_BASE = "https://symbioai.dev/api";
const SESSION_STORAGE_KEY = "fitcoach-v054-auth-session";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const OTP_RE = /^[0-9]{6,8}$/u;
const DEVICE_RE = /^[a-zA-Z0-9_-]{8,80}$/u;

export class AccountRequestError extends Error {
  constructor(code, { status = 0, retryAt = 0 } = {}) {
    super(code);
    this.name = "AccountRequestError";
    this.status = status;
    this.retryAt = retryAt;
  }
}

export function accountRetryDelay(value, now, fallback = 5_000) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (/^\d+$/u.test(raw) && Number.isSafeInteger(Number(raw))) return Math.max(1_000, Math.min(Number.MAX_SAFE_INTEGER - now, Number(raw) * 1_000));
  const date = raw && Date.parse(raw);
  return Number.isFinite(date) && date > now ? date - now : fallback;
}

const isRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clean = (value, max = 240) => typeof value === "string" ? value.trim().slice(0, max) : "";
const safeJson = async response => {
  try { return await response.json(); } catch { return {}; }
};

function normalizedSupabaseProjectUrl(value) {
  const candidate = clean(value, 500).replace(/\/$/u, "");
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.endsWith(".supabase.co")) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function normalizeConfig(payload) {
  const platformOk = payload?.ok === true;
  const root = isRecord(payload?.config) ? payload.config : payload;
  const auth = isRecord(root?.auth) ? root.auth : {};
  const capabilities = isRecord(root?.capabilities) ? root.capabilities : {};
  const sync = isRecord(root?.sync) ? root.sync : {};
  const account = isRecord(root?.account) ? root.account : {};
  const subscriptions = isRecord(root?.subscriptions) ? root.subscriptions : {};
  const supabaseUrl = normalizedSupabaseProjectUrl(auth.supabase_url || auth.supabaseUrl || root?.supabase_url);
  const anonKey = clean(auth.anon_key || auth.anonKey || auth.public_key || root?.supabase_anon_key, 8_000);
  const authAvailable = platformOk && (auth.available === true || auth.enabled === true) && Boolean(supabaseUrl) && Boolean(anonKey);
  return Object.freeze({
    available: authAvailable,
    authAvailable,
    supabaseUrl: authAvailable ? supabaseUrl : "",
    anonKey: authAvailable ? anonKey : "",
    consentVersion: clean(root?.consent_version || root?.consentVersion || sync.consentVersion, 40),
    capabilities: Object.freeze({
      sync: platformOk && (capabilities.sync === true || sync.available === true),
      accountExport: platformOk && (capabilities.account_export === true || capabilities.accountExport === true || account.exportAvailable === true),
      accountDeletion: platformOk && (capabilities.account_deletion === true || capabilities.accountDeletion === true || account.deletionAvailable === true),
      entitlements: platformOk && (capabilities.entitlements === true || account.entitlementsAvailable === true),
      subscriptions: platformOk && (capabilities.subscriptions === true || subscriptions.available === true),
    }),
    reason: clean(root?.reason || auth.reason, 120) || (authAvailable ? "" : "platform_setup_required"),
  });
}

function normalizeSession(payload) {
  const accessToken = clean(payload?.access_token, 5_000);
  const refreshToken = clean(payload?.refresh_token, 5_000);
  const expiresIn = Number(payload?.expires_in);
  const userId = clean(payload?.user?.id, 120);
  const email = clean(payload?.user?.email, 320).toLowerCase();
  if (!accessToken || !refreshToken || !userId || !EMAIL_RE.test(email)) return null;
  return Object.freeze({
    accessToken,
    refreshToken,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? Math.max(60, expiresIn) : 3_600) * 1_000,
    user: Object.freeze({ id: userId, email }),
  });
}

function sessionStorageOwner(storage) {
  return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function" ? storage : null;
}

function accountSessionRecord(session) {
  const normalized = session && normalizeSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_in: Math.max(60, Math.floor((Number(session.expiresAt) - Date.now()) / 1_000)),
    user: session.user,
  });
  if (!normalized) return null;
  return {
    accessToken: normalized.accessToken,
    refreshToken: normalized.refreshToken,
    expiresAt: Number(session.expiresAt) || normalized.expiresAt,
    user: normalized.user,
  };
}

function accountSessionFromRecord(parsed) {
  if (!isRecord(parsed)) return null;
  const session = normalizeSession({
    access_token: parsed.accessToken,
    refresh_token: parsed.refreshToken,
    expires_in: Math.max(60, Math.floor((Number(parsed.expiresAt) - Date.now()) / 1_000)),
    user: parsed.user,
  });
  return session ? Object.freeze({ ...session, expiresAt: Number(parsed.expiresAt) }) : null;
}

export function readAccountSession(storage = globalThis.sessionStorage) {
  const owner = sessionStorageOwner(storage);
  if (!owner) return null;
  try {
    return accountSessionFromRecord(JSON.parse(owner.getItem(SESSION_STORAGE_KEY) || "null"));
  } catch {
    return null;
  }
}

export function saveAccountSession(session, storage = globalThis.sessionStorage) {
  const owner = sessionStorageOwner(storage);
  const record = accountSessionRecord(session);
  if (!owner || !record) return false;
  owner.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));
  return true;
}

export function clearAccountSession(storage = globalThis.sessionStorage) {
  try { sessionStorageOwner(storage)?.removeItem(SESSION_STORAGE_KEY); } catch {}
}

export function consumeSupabaseAuthFragment(url = globalThis.location?.href, storage = globalThis.sessionStorage) {
  if (!url) return null;
  const parsed = new URL(url, "https://fitcoach.invalid");
  const params = new URLSearchParams(parsed.hash.replace(/^#/u, ""));
  const session = normalizeSession({
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    expires_in: params.get("expires_in"),
    user: {
      id: params.get("user_id") || params.get("sub"),
      email: params.get("email"),
    },
  });
  if (!session) return null;
  saveAccountSession(session, storage);
  params.delete("access_token");
  params.delete("refresh_token");
  params.delete("expires_in");
  parsed.hash = params.toString();
  try { globalThis.history?.replaceState?.({}, "", `${parsed.pathname}${parsed.search}${parsed.hash}`); } catch {}
  return session;
}

export function createAccountClient({
  apiBase = DEFAULT_API_BASE,
  fetchImpl = globalThis.fetch,
  storage = globalThis.sessionStorage,
  secureStorage = null,
  clock = () => Date.now(),
  random = Math.random,
  requestTimeoutMs = 15_000,
} = {}) {
  let config = null;
  const nativeSecureStorage = secureStorage?.available === true
    && typeof secureStorage.read === "function"
    && typeof secureStorage.write === "function"
    && typeof secureStorage.clear === "function"
    ? secureStorage
    : null;
  let session = nativeSecureStorage ? null : readAccountSession(storage);
  let hydration = null;
  let sessionGeneration = 0;
  let refreshing = null;
  let storageWork = Promise.resolve();
  const cooldowns = new Map();
  const assertSession = generation => { if (generation !== sessionGeneration) throw new Error("authentication_changed"); };
  const queueStorage = work => {
    const result = storageWork.then(work);
    storageWork = result.catch(() => {});
    return result;
  };

  async function requestJson(url, options = {}, fallbackCode = "account_request_failed") {
    const key = `${options.method || "GET"}:${url.split("?")[0]}`;
    const cooldown = cooldowns.get(key);
    if (cooldown?.retryAt > clock()) throw new AccountRequestError(cooldown.code, cooldown);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, requestTimeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal, redirect: "error" });
      const payload = await safeJson(response);
      if (controller.signal.aborted) throw new Error("request_aborted");
      if (!response.ok) {
        const code = clean(payload?.error_description || payload?.msg || payload?.error, 160) || `${fallbackCode}_${response.status}`;
        const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
        const fallback = Math.min(60_000, (cooldown?.delay || 2_500) * 2);
        const delay = retryable ? accountRetryDelay(response.headers?.get?.("Retry-After"), clock(), fallback) + Math.floor(Math.max(0, Math.min(1, random())) * 1_000) : 0;
        const retryAt = delay ? clock() + delay : 0;
        if (delay) cooldowns.set(key, { code, status: response.status, retryAt, delay: fallback });
        throw new AccountRequestError(code, { status: response.status, retryAt });
      }
      cooldowns.delete(key);
      return payload;
    } catch (error) {
      if (error instanceof AccountRequestError) throw error;
      const code = controller.signal.aborted ? "account_timeout" : "account_network_unavailable";
      const delay = Math.min(60_000, (cooldown?.delay || 2_500) * 2);
      const retryAt = clock() + delay + Math.floor(Math.max(0, Math.min(1, random())) * 1_000);
      cooldowns.set(key, { code, status: 0, retryAt, delay });
      throw new AccountRequestError(code, { retryAt });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }

  async function hydrateSession() {
    if (!nativeSecureStorage) return session;
    if (!hydration) {
      const generation = sessionGeneration;
      hydration = (async () => {
        try {
          const raw = await nativeSecureStorage.read();
          if (generation === sessionGeneration) session = raw ? accountSessionFromRecord(JSON.parse(raw)) : null;
        } catch {
          if (generation === sessionGeneration) session = null;
        }
        // A native build must not retain a legacy JS-accessible token copy.
        clearAccountSession(storage);
        return session;
      })();
    }
    return hydration;
  }

  async function persistSession(nextSession, generation = sessionGeneration) {
    return queueStorage(async () => {
      assertSession(generation);
      const record = accountSessionRecord(nextSession);
      if (!record) throw new Error("invalid_auth_session");
      if (nativeSecureStorage) {
        const saved = await nativeSecureStorage.write(JSON.stringify(record));
        if (!saved) throw new Error("secure_session_storage_failed");
        assertSession(generation);
        clearAccountSession(storage);
        return;
      }
      if (!saveAccountSession(nextSession, storage)) throw new Error("session_storage_failed");
    });
  }

  async function clearPersistedSession() {
    return queueStorage(async () => {
      if (nativeSecureStorage) {
        let cleared = false;
        try { cleared = await nativeSecureStorage.clear(); } finally { clearAccountSession(storage); }
        if (cleared !== true) throw new Error("secure_session_clear_failed");
        return;
      }
      clearAccountSession(storage);
    });
  }

  async function fetchPlatformConfig({ signal } = {}) {
    try {
      const payload = await requestJson(`${apiBase}/fitcoach-platform-config-v1`, {
        method: "GET",
        headers: { Accept: "application/json", "X-FitCoach-Build": BUILD },
        cache: "no-store",
        signal,
      });
      config = normalizeConfig(payload);
    } catch {
      config = normalizeConfig({ ok: false, reason: "platform_unavailable" });
    }
    return config;
  }

  async function requireConfig() {
    const current = config || await fetchPlatformConfig();
    if (!current.authAvailable) throw new Error(current.reason || "platform_setup_required");
    return current;
  }

  async function supabase(path, { method = "POST", body, accessToken } = {}) {
    const current = await requireConfig();
    return requestJson(`${current.supabaseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        apikey: current.anonKey,
        Authorization: `Bearer ${accessToken || current.anonKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    }, "auth");
  }

  async function requestEmailCode(email, redirectTo = globalThis.location?.href) {
    const normalized = clean(email, 320).toLowerCase();
    if (!EMAIL_RE.test(normalized)) throw new Error("invalid_email");
    const redirect = redirectTo && /^https:\/\//u.test(String(redirectTo))
      ? String(redirectTo).split("#")[0]
      : "";
    const path = redirect ? `/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}` : "/auth/v1/otp";
    await supabase(path, {
      body: {
        email: normalized,
        create_user: true,
      },
    });
    return Object.freeze({ sent: true, email: normalized });
  }

  async function verifyEmailCode(email, token) {
    const normalizedEmail = clean(email, 320).toLowerCase();
    const normalizedToken = clean(token, 12).replace(/\s/gu, "");
    if (!EMAIL_RE.test(normalizedEmail) || !OTP_RE.test(normalizedToken)) throw new Error("invalid_email_code");
    const generation = ++sessionGeneration;
    refreshing = null;
    const payload = await supabase("/auth/v1/verify", {
      body: { type: "email", email: normalizedEmail, token: normalizedToken },
    });
    const nextSession = normalizeSession(payload);
    assertSession(generation);
    if (!nextSession) throw new Error("invalid_auth_session");
    await persistSession(nextSession, generation);
    assertSession(generation);
    session = nextSession;
    return session;
  }

  async function refreshSession() {
    if (refreshing) return refreshing;
    if (!session?.refreshToken) throw new Error("authentication_required");
    const generation = sessionGeneration;
    const refreshToken = session.refreshToken;
    const task = (async () => {
      const payload = await supabase("/auth/v1/token?grant_type=refresh_token", {
        body: { refresh_token: refreshToken },
      });
      const nextSession = normalizeSession(payload);
      assertSession(generation);
      if (!nextSession) throw new Error("invalid_auth_session");
      await persistSession(nextSession, generation);
      assertSession(generation);
      session = nextSession;
      return session;
    })();
    refreshing = task;
    try { return await task; } finally { if (refreshing === task) refreshing = null; }
  }

  async function activeAccessToken({ recent = false } = {}) {
    if (!session) throw new Error("authentication_required");
    const remaining = session.expiresAt - clock();
    if (remaining < 120_000) await refreshSession();
    if (recent && session.expiresAt - clock() > 10 * 60 * 1_000) {
      // Token issue time is verified by the API. This branch only communicates intent.
    }
    return session.accessToken;
  }

  async function accountFetch(path, { method = "GET", body, recent = false } = {}) {
    const generation = sessionGeneration;
    const token = await activeAccessToken({ recent });
    assertSession(generation);
    const payload = await requestJson(`${apiBase}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-FitCoach-Build": BUILD,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    }, "account");
    assertSession(generation);
    return payload;
  }

  function verifiedAccountPayload(payload, error = "invalid_account_response") {
    if (!isRecord(payload) || payload.ok !== true) throw new Error(error);
    return payload;
  }

  return Object.freeze({
    get config() { return config; },
    get session() { return session; },
    get usesSecureStorage() { return Boolean(nativeSecureStorage); },
    hydrateSession,
    fetchPlatformConfig,
    requestEmailCode,
    verifyEmailCode,
    refreshSession,
    async clearSession() {
      sessionGeneration += 1;
      refreshing = null;
      session = null;
      await clearPersistedSession();
      return true;
    },
    async signOut() {
      const accessToken = session?.accessToken;
      sessionGeneration += 1;
      refreshing = null;
      session = null;
      await clearPersistedSession();
      if (accessToken) {
        try { await supabase("/auth/v1/logout", { accessToken, body: {} }); } catch {}
      }
      return true;
    },
    async pullSync() {
      const payload = verifiedAccountPayload(await accountFetch("/fitcoach-sync-v1"), "invalid_sync_response");
      if (!Number.isSafeInteger(Number(payload.revision)) || Number(payload.revision) < 0 || !(payload.state === null || isRecord(payload.state))) throw new Error("invalid_sync_response");
      return payload;
    },
    async pushSync({ baseRevision, deviceId, schemaVersion, state }) {
      if (!DEVICE_RE.test(clean(deviceId, 80))) throw new Error("invalid_device_id");
      const payload = verifiedAccountPayload(await accountFetch("/fitcoach-sync-v1", {
        method: "PUT",
        body: { base_revision: Number(baseRevision) || 0, device_id: deviceId, schema_version: Number(schemaVersion) || 0, state },
      }), "invalid_sync_response");
      if (!Number.isSafeInteger(Number(payload.revision)) || Number(payload.revision) < 1) throw new Error("invalid_sync_response");
      return payload;
    },
    async exportAccount() {
      const payload = verifiedAccountPayload(await accountFetch("/fitcoach-account-v1?mode=export"), "invalid_account_export_response");
      if (!isRecord(payload.export) || payload.export.format !== "fitcoach-portable-export-v1") throw new Error("invalid_account_export_response");
      return payload;
    },
    async recordSyncConsent({ policyVersion, decision }) {
      const payload = verifiedAccountPayload(await accountFetch("/fitcoach-account-v1", {
        method: "POST",
        body: { policy: "sync_processing", policy_version: clean(policyVersion, 40), decision },
      }), "invalid_consent_response");
      if (!isRecord(payload.consent)) throw new Error("invalid_consent_response");
      return payload;
    },
    async deleteAccount() {
      const payload = verifiedAccountPayload(await accountFetch("/fitcoach-account-v1", {
        method: "DELETE",
        recent: true,
        body: { confirmation: "DELETE MY FITCOACH ACCOUNT" },
      }), "account_deletion_not_confirmed");
      if (payload.deleted !== true) throw new Error("account_deletion_not_confirmed");
      return payload;
    },
    async getEntitlements() {
      const payload = verifiedAccountPayload(await accountFetch("/fitcoach-entitlements-v1"), "invalid_entitlements_response");
      if (!Array.isArray(payload.entitlements) || typeof payload.premium !== "boolean") throw new Error("invalid_entitlements_response");
      return payload;
    },
    async verifySubscription(request) {
      const payload = verifiedAccountPayload(await accountFetch("/fitcoach-subscriptions-v1", { method: "POST", body: request }), "subscription_not_verified");
      const verificationId = clean(payload.verification_id || payload.verificationId, 128);
      if (payload.reconciled !== true || !Array.isArray(payload.entitlements) || typeof payload.premium !== "boolean" || !/^[A-Za-z0-9_-]{16,128}$/u.test(verificationId)) throw new Error("subscription_not_verified");
      return { ...payload, verification_id: verificationId };
    },
  });
}
