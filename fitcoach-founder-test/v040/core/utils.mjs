export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function uid(prefix = "fc") {
  const value = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

export function slug(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatDate(value, options = { month: "short", day: "numeric" }) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat([], options).format(date);
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function safeNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

export function normalizeUnit(value, fallback = "lb") {
  return value === "kg" || value === "lb" ? value : fallback;
}

export function convertWeight(value, fromUnit = "lb", toUnit = "lb") {
  const amount = safeNumber(value, 0, 0, 5_000);
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return amount;
  const converted = from === "kg" ? amount * 2.2046226218 : amount / 2.2046226218;
  return Math.round(converted * 10) / 10;
}

export function stableExerciseId(name = "exercise") {
  return slug(name) || "exercise";
}

export function sessionVolume(session, outputUnit = session?.units || "lb") {
  const targetUnit = normalizeUnit(outputUnit, session?.units || "lb");
  return (session?.exercises || []).reduce((sum, exercise) => sum + (exercise.sets || [])
    .filter(set => set.done !== false)
    .reduce((inner, set) => inner + convertWeight(set.weight, set.unit || exercise.units || session?.units || "lb", targetUnit) * safeNumber(set.reps), 0), 0);
}

export function elapsedMinutes(startedAt, endedAt = Date.now()) {
  const start = new Date(startedAt).getTime();
  const end = endedAt instanceof Date ? endedAt.getTime() : new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60_000));
}

export function deepClone(value) {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function hashText(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
