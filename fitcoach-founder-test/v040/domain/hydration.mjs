import { localDateKey } from "../core/utils.mjs";

// A bounded local log, intentionally independent from diet targets.
export function normalizeHydration(raw) {
  const seen = new Set();
  const entries = (Array.isArray(raw?.entries) ? raw.entries : []).filter(entry => {
    if (!entry || typeof entry.id !== "string" || seen.has(entry.id) || entry.id.length > 100) return false;
    const at = new Date(entry.at);
    if (!Number.isFinite(at.getTime()) || !Number.isFinite(entry.ml) || entry.ml < 1 || entry.ml > 2000) return false;
    seen.add(entry.id);
    return true;
  }).map(entry => ({ id: entry.id, at: new Date(entry.at).toISOString(), ml: Math.round(entry.ml) })).slice(-1500);
  return { entries };
}

export function waterForDay(raw, now = new Date()) {
  const key = localDateKey(now);
  const entries = normalizeHydration(raw).entries.filter(entry => localDateKey(new Date(entry.at)) === key && new Date(entry.at) <= now);
  return { entries, totalMl: entries.reduce((sum, entry) => sum + entry.ml, 0) };
}

export function addWater(raw, ml, now = new Date(), id = globalThis.crypto.randomUUID()) {
  const log = normalizeHydration(raw);
  if (!Number.isFinite(ml) || ml < 1 || ml > 2000 || !Number.isFinite(now.getTime())) return log;
  return normalizeHydration({ entries: [...log.entries, { id, at: now.toISOString(), ml }] });
}

export function undoWater(raw, now = new Date()) {
  const log = normalizeHydration(raw);
  const last = waterForDay(log, now).entries.at(-1);
  return { entries: log.entries.filter(entry => entry.id !== last?.id) };
}
