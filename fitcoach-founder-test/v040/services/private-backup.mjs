import { BUILD } from "../core/constants.mjs";

export const PRIVATE_BACKUP_FORMAT = "fitcoach-private-backup";
export const PRIVATE_BACKUP_VERSION = 1;
export const PRIVATE_BACKUP_ITERATIONS = 310_000;
export const PRIVATE_BACKUP_EXTENSION = ".fitcoach";
export const PRIVATE_BACKUP_MAX_PLAINTEXT_BYTES = 8 * 1024 * 1024;
export const PRIVATE_BACKUP_MAX_FILE_BYTES = 12 * 1024 * 1024;
export const PRIVATE_BACKUP_MIN_PASSPHRASE_CHARS = 12;
export const PRIVATE_BACKUP_MAX_PASSPHRASE_CHARS = 128;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const clean = (value, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function fail(code) {
  throw new Error(code);
}

function cryptoApi(cryptoImpl) {
  if (!cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== "function") fail("private_backup_not_supported");
  return cryptoImpl;
}

function passphraseBytes(passphrase) {
  if (typeof passphrase !== "string") fail("private_backup_passphrase_required");
  const length = Array.from(passphrase).length;
  if (length < PRIVATE_BACKUP_MIN_PASSPHRASE_CHARS) fail("private_backup_passphrase_too_short");
  if (length > PRIVATE_BACKUP_MAX_PASSPHRASE_CHARS) fail("private_backup_passphrase_too_long");
  return encoder.encode(passphrase);
}

function bytesToBase64(bytes) {
  let binary = "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let offset = 0; offset < view.length; offset += 0x8000) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value, maximumBytes = PRIVATE_BACKUP_MAX_FILE_BYTES) {
  if (typeof value !== "string" || value.length < 4 || value.length > Math.ceil(maximumBytes * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    fail("private_backup_invalid_file");
  }
  try {
    const binary = atob(value);
    if (binary.length > maximumBytes) fail("private_backup_file_too_large");
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch (error) {
    if (error?.message?.startsWith?.("private_backup_")) throw error;
    fail("private_backup_invalid_file");
  }
}

function normalizedCreatedAt(value) {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) fail("private_backup_invalid_file");
  return new Date(parsed).toISOString();
}

function authenticatedMetadata({ appBuild, createdAt, iterations }) {
  return encoder.encode(`${PRIVATE_BACKUP_FORMAT}|${PRIVATE_BACKUP_VERSION}|${appBuild}|${createdAt}|${iterations}`);
}

async function deriveKey(passphrase, salt, iterations, cryptoImpl, usage) {
  const material = await cryptoImpl.subtle.importKey(
    "raw",
    passphraseBytes(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return cryptoImpl.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

function validatePlaintextState(value) {
  if (!isObject(value) || !Number.isSafeInteger(Number(value.schemaVersion)) || Number(value.schemaVersion) < 1) {
    fail("private_backup_invalid_state");
  }
  return value;
}

export function privateBackupSummary(state) {
  const value = validatePlaintextState(state);
  const nutritionEntries = Object.values(value.nutrition?.days || {}).reduce(
    (count, day) => count + (Array.isArray(day?.entries) ? day.entries.length : 0),
    0,
  );
  return Object.freeze({
    sessions: Array.isArray(value.sessions) ? value.sessions.length : 0,
    nutritionEntries,
    coachMessages: Array.isArray(value.chat) ? value.chat.length : 0,
    hasActiveWorkout: Boolean(value.activeWorkout),
    onboarded: Boolean(value.profile?.onboarded),
  });
}

export async function createPrivateBackup(plaintextJson, passphrase, {
  cryptoImpl = globalThis.crypto,
  now = new Date(),
  appBuild = BUILD,
} = {}) {
  const api = cryptoApi(cryptoImpl);
  if (typeof plaintextJson !== "string") fail("private_backup_invalid_state");
  const plaintext = encoder.encode(plaintextJson);
  if (!plaintext.length || plaintext.length > PRIVATE_BACKUP_MAX_PLAINTEXT_BYTES) fail("private_backup_state_too_large");
  let parsed;
  try { parsed = JSON.parse(plaintextJson); } catch { fail("private_backup_invalid_state"); }
  validatePlaintextState(parsed);

  const salt = api.getRandomValues(new Uint8Array(16));
  const iv = api.getRandomValues(new Uint8Array(12));
  const createdAt = normalizedCreatedAt(now.toISOString());
  const normalizedBuild = clean(appBuild, 32) || "unknown";
  const key = await deriveKey(passphrase, salt, PRIVATE_BACKUP_ITERATIONS, api, "encrypt");
  const ciphertext = await api.subtle.encrypt({
    name: "AES-GCM",
    iv,
    additionalData: authenticatedMetadata({ appBuild: normalizedBuild, createdAt, iterations: PRIVATE_BACKUP_ITERATIONS }),
    tagLength: 128,
  }, key, plaintext);

  return JSON.stringify({
    format: PRIVATE_BACKUP_FORMAT,
    version: PRIVATE_BACKUP_VERSION,
    appBuild: normalizedBuild,
    createdAt,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PRIVATE_BACKUP_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: {
      name: "AES-GCM",
      tagLength: 128,
      iv: bytesToBase64(iv),
    },
    payload: bytesToBase64(ciphertext),
  }, null, 2);
}

export function inspectPrivateBackup(serialized) {
  if (typeof serialized !== "string" || encoder.encode(serialized).length > PRIVATE_BACKUP_MAX_FILE_BYTES) {
    fail("private_backup_file_too_large");
  }
  let envelope;
  try { envelope = JSON.parse(serialized); } catch { fail("private_backup_invalid_file"); }
  if (!isObject(envelope)
    || envelope.format !== PRIVATE_BACKUP_FORMAT
    || envelope.version !== PRIVATE_BACKUP_VERSION
    || envelope.kdf?.name !== "PBKDF2"
    || envelope.kdf?.hash !== "SHA-256"
    || envelope.kdf?.iterations !== PRIVATE_BACKUP_ITERATIONS
    || envelope.cipher?.name !== "AES-GCM"
    || envelope.cipher?.tagLength !== 128) fail("private_backup_invalid_file");
  const appBuild = clean(envelope.appBuild, 32);
  const createdAt = normalizedCreatedAt(envelope.createdAt);
  if (!appBuild) fail("private_backup_invalid_file");
  const salt = base64ToBytes(envelope.kdf.salt, 32);
  const iv = base64ToBytes(envelope.cipher.iv, 32);
  const payload = base64ToBytes(envelope.payload, PRIVATE_BACKUP_MAX_FILE_BYTES);
  if (salt.length !== 16 || iv.length !== 12 || payload.length < 17) fail("private_backup_invalid_file");
  return Object.freeze({ envelope, appBuild, createdAt, salt, iv, payload });
}

export async function openPrivateBackup(serialized, passphrase, { cryptoImpl = globalThis.crypto } = {}) {
  const api = cryptoApi(cryptoImpl);
  const inspected = inspectPrivateBackup(serialized);
  const key = await deriveKey(passphrase, inspected.salt, PRIVATE_BACKUP_ITERATIONS, api, "decrypt");
  let plaintext;
  try {
    plaintext = await api.subtle.decrypt({
      name: "AES-GCM",
      iv: inspected.iv,
      additionalData: authenticatedMetadata({
        appBuild: inspected.appBuild,
        createdAt: inspected.createdAt,
        iterations: PRIVATE_BACKUP_ITERATIONS,
      }),
      tagLength: 128,
    }, key, inspected.payload);
  } catch {
    fail("private_backup_wrong_passphrase_or_corrupt");
  }
  if (plaintext.byteLength > PRIVATE_BACKUP_MAX_PLAINTEXT_BYTES) fail("private_backup_state_too_large");
  let state;
  try { state = JSON.parse(decoder.decode(plaintext)); } catch { fail("private_backup_invalid_state"); }
  validatePlaintextState(state);
  return Object.freeze({
    state,
    summary: privateBackupSummary(state),
    createdAt: inspected.createdAt,
    appBuild: inspected.appBuild,
  });
}
