// FitCoach v0.4 nutrition domain — deterministic, local-first, confirmed-only totals.
// Drafts (photo/text estimates) contribute EXACTLY ZERO to any total until the
// the user explicitly confirms them in the review sheet. No provider is involved
// anywhere in this module.
import { clamp, deepClone, hashText, localDateKey, safeNumber, uid } from "../core/utils.mjs";

export const NUTRITION_SCHEMA_VERSION = 1;
export const MEAL_SLOTS = Object.freeze(["breakfast", "lunch", "dinner", "snacks"]);
export const MEAL_SLOT_LABELS = Object.freeze({
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
});
export const ENTRY_SOURCES = Object.freeze(["manual", "recent", "favorite", "barcode", "photo_estimate", "text_estimate"]);
// Estimate sources are structurally forced to start as drafts — there is no
// constructor path that creates a confirmed estimate entry.
export const ESTIMATE_SOURCES = Object.freeze(["photo_estimate", "text_estimate"]);
export const ENTRY_STATUSES = Object.freeze(["draft", "confirmed"]);
export const CONFIDENCE_LEVELS = Object.freeze(["low", "medium"]);
export const MULTIPLIER_MIN = 0.25;
export const MULTIPLIER_MAX = 20;
export const MAX_DAY_ENTRIES = 60;
export const MAX_TRACKED_DAYS = 60;
export const MAX_RECENTS = 20;
export const MAX_FAVORITES = 30;

export const NUTRITION_DISCLAIMER = "Preview nutrition tool. Nutrition values are approximate estimates for training context — not medical, dietetic, or treatment advice.";

const RAW_IMAGE_PAYLOAD = /data:image\/|;base64,|blob:/i;
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const cleanString = (value, fallback = "", max = 160) => (
  typeof value === "string" ? value.trim().slice(0, max) : fallback
);
const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const round1 = value => Math.round(value * 10) / 10;

// ── Preview demo food list ─────────────────────────────────────────────────
// Approximate per-serving values for a private preview. Everything is
// editable before it is confirmed; nothing here claims database-grade accuracy.
const food = (key, name, servingLabel, calories, protein, carbs, fat, fiber = 0, sugar = 0, sodium = 0) => Object.freeze({
  key,
  name,
  servingLabel,
  per: Object.freeze({ calories, protein, carbs, fat, fiber, sugar, sodium }),
});

export const DEMO_FOODS = Object.freeze([
  food("chicken-breast", "Chicken breast, grilled", "1 breast (170 g)", 280, 53, 0, 6, 0, 0, 130),
  food("chicken-thigh", "Chicken thigh, roasted", "1 thigh (100 g)", 210, 26, 0, 11, 0, 0, 95),
  food("eggs", "Eggs, whole", "2 large eggs", 143, 13, 1, 10, 0, 0, 142),
  food("egg-whites", "Egg whites", "4 whites (132 g)", 69, 14, 1, 0, 0, 0, 219),
  food("greek-yogurt", "Greek yogurt, plain nonfat", "1 cup (245 g)", 145, 25, 9, 1, 0, 8, 92),
  food("whey-scoop", "Whey protein shake", "1 scoop in water", 130, 25, 4, 2, 0, 2, 120),
  food("salmon", "Salmon fillet, baked", "1 fillet (150 g)", 310, 34, 0, 19, 0, 0, 90),
  food("ground-beef", "Ground beef 90/10, cooked", "150 g", 264, 39, 0, 12, 0, 0, 100),
  food("tofu", "Tofu, firm", "150 g", 108, 13, 3, 6, 1, 1, 12),
  food("black-beans", "Black beans, cooked", "1 cup (172 g)", 227, 15, 41, 1, 15, 0, 2),
  food("lentils", "Lentils, cooked", "1 cup (198 g)", 230, 18, 40, 1, 16, 4, 4),
  food("white-rice", "White rice, cooked", "1 cup (158 g)", 205, 4, 45, 0, 1, 0, 2),
  food("brown-rice", "Brown rice, cooked", "1 cup (195 g)", 216, 5, 45, 2, 4, 0, 10),
  food("oats", "Oatmeal, cooked", "1 cup (234 g)", 166, 6, 28, 4, 4, 1, 9),
  food("pasta", "Pasta, cooked", "1 cup (140 g)", 220, 8, 43, 1, 3, 1, 1),
  food("bread-slice", "Whole-grain bread", "1 slice (43 g)", 110, 5, 19, 2, 3, 3, 130),
  food("tortilla", "Flour tortilla", "1 large (72 g)", 210, 6, 36, 5, 2, 1, 480),
  food("potato", "Potato, baked", "1 medium (173 g)", 161, 4, 37, 0, 4, 2, 17),
  food("sweet-potato", "Sweet potato, baked", "1 medium (151 g)", 135, 3, 31, 0, 5, 10, 55),
  food("banana", "Banana", "1 medium (118 g)", 105, 1, 27, 0, 3, 14, 1),
  food("apple", "Apple", "1 medium (182 g)", 95, 0, 25, 0, 4, 19, 2),
  food("berries", "Mixed berries", "1 cup (150 g)", 70, 1, 17, 0, 4, 10, 2),
  food("avocado", "Avocado", "1/2 fruit (100 g)", 160, 2, 9, 15, 7, 1, 7),
  food("almonds", "Almonds", "1 oz (28 g)", 164, 6, 6, 14, 4, 1, 0),
  food("peanut-butter", "Peanut butter", "2 tbsp (32 g)", 188, 8, 8, 16, 2, 3, 136),
  food("olive-oil", "Olive oil", "1 tbsp (14 g)", 119, 0, 0, 14, 0, 0, 0),
  food("cheddar", "Cheddar cheese", "1 oz (28 g)", 115, 7, 1, 9, 0, 0, 183),
  food("cottage-cheese", "Cottage cheese, low-fat", "1 cup (226 g)", 183, 24, 11, 5, 0, 9, 918),
  food("milk", "Milk, 2%", "1 cup (244 g)", 122, 8, 12, 5, 0, 12, 95),
  food("broccoli", "Broccoli, steamed", "1 cup (156 g)", 55, 4, 11, 0, 5, 2, 64),
  food("salad-greens", "Salad greens with vinaigrette", "1 bowl", 120, 2, 8, 9, 3, 4, 220),
  food("hummus", "Hummus", "1/4 cup (60 g)", 140, 5, 12, 8, 4, 0, 240),
  food("tuna-can", "Tuna, canned in water", "1 can (142 g)", 121, 27, 0, 1, 0, 0, 320),
  food("protein-bar", "Protein bar", "1 bar (60 g)", 220, 20, 23, 7, 3, 8, 190),
  food("dark-chocolate", "Dark chocolate", "2 squares (20 g)", 120, 2, 9, 8, 2, 5, 5),
  food("orange-juice", "Orange juice", "1 cup (248 g)", 112, 2, 26, 0, 0, 21, 2),
]);

export function findDemoFood(key) {
  return DEMO_FOODS.find(item => item.key === key) || null;
}

// ── Targets ────────────────────────────────────────────────────────────────
// FitCoach does NOT compute a calorie prescription from body data. The user
// sets targets manually; defaults are a neutral starting point, clearly labeled.
export const DEFAULT_TARGETS = Object.freeze({
  calories: 2200,
  protein: 140,
  carbs: 230,
  fat: 70,
  userSet: false,
});

export function normalizeTargets(raw) {
  const base = { ...DEFAULT_TARGETS };
  if (!isObject(raw)) return base;
  return {
    calories: safeNumber(raw.calories, base.calories, 1_000, 6_000),
    protein: safeNumber(raw.protein, base.protein, 30, 400),
    carbs: safeNumber(raw.carbs, base.carbs, 30, 700),
    fat: safeNumber(raw.fat, base.fat, 20, 250),
    userSet: Boolean(raw.userSet),
  };
}

// ── Nutrient math (deterministic) ──────────────────────────────────────────
export function normalizePerServing(raw) {
  if (!isObject(raw)) return null;
  const calories = safeNumber(raw.calories, NaN, 0, 5_000);
  const protein = safeNumber(raw.protein, NaN, 0, 500);
  const carbs = safeNumber(raw.carbs, NaN, 0, 800);
  const fat = safeNumber(raw.fat, NaN, 0, 500);
  if ([calories, protein, carbs, fat].some(value => !Number.isFinite(value))) return null;
  return {
    calories: Math.round(calories),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
    fiber: round1(safeNumber(raw.fiber, 0, 0, 200)),
    sugar: round1(safeNumber(raw.sugar, 0, 0, 500)),
    sodium: Math.round(safeNumber(raw.sodium, 0, 0, 20_000)),
  };
}

export function normalizeMultiplier(value) {
  return clamp(Math.round(safeNumber(value, 1, MULTIPLIER_MIN, MULTIPLIER_MAX) * 100) / 100, MULTIPLIER_MIN, MULTIPLIER_MAX);
}

export function computeNutrients(per, multiplier) {
  const normalizedPer = normalizePerServing(per);
  const factor = normalizeMultiplier(multiplier);
  if (!normalizedPer) return null;
  return {
    calories: Math.round(normalizedPer.calories * factor),
    protein: round1(normalizedPer.protein * factor),
    carbs: round1(normalizedPer.carbs * factor),
    fat: round1(normalizedPer.fat * factor),
    fiber: round1(normalizedPer.fiber * factor),
    sugar: round1(normalizedPer.sugar * factor),
    sodium: Math.round(normalizedPer.sodium * factor),
  };
}

// ── Estimate metadata (drafts only) ────────────────────────────────────────
export function normalizeEstimate(raw) {
  if (!isObject(raw)) return null;
  const range = value => Array.isArray(value) && value.length === 2
    ? [safeNumber(value[0], 0, 0, 10_000), safeNumber(value[1], 0, 0, 10_000)].sort((a, b) => a - b)
    : null;
  const kcalRange = range(raw.kcalRange);
  if (!kcalRange) return null;
  return {
    demo: true, // v1 has no real vision provider; this flag is honest and load-bearing.
    provider: cleanString(raw.provider, "preview-demo-deterministic-v1", 80),
    confidence: oneOf(raw.confidence, CONFIDENCE_LEVELS, "low"),
    kcalRange,
    proteinRange: range(raw.proteinRange) || [0, 0],
    carbsRange: range(raw.carbsRange) || [0, 0],
    fatRange: range(raw.fatRange) || [0, 0],
    assumptions: (Array.isArray(raw.assumptions) ? raw.assumptions : []).map(value => cleanString(value, "", 160)).filter(Boolean).slice(0, 6),
    candidates: (Array.isArray(raw.candidates) ? raw.candidates : []).map(value => cleanString(value, "", 80)).filter(Boolean).slice(0, 3),
    context: cleanString(raw.context, "", 200),
  };
}

export function normalizePhotoMeta(raw) {
  if (!isObject(raw)) return null;
  // Whitelist only: never a pixel, data URL, or base64 payload.
  return {
    name: cleanString(raw.name, "photo", 80),
    size: safeNumber(raw.size, 0, 0, 50_000_000),
    hash: cleanString(raw.hash, "", 16),
  };
}

// ── Entries ────────────────────────────────────────────────────────────────
export function normalizeNutritionEntry(raw) {
  if (!isObject(raw)) return null;
  // Fail closed on any embedded raw-image payload anywhere in the record.
  try {
    if (RAW_IMAGE_PAYLOAD.test(JSON.stringify(raw))) return null;
  } catch {
    return null;
  }
  const name = cleanString(raw.name, "", 120);
  const per = normalizePerServing(raw.per);
  const slot = oneOf(raw.slot, MEAL_SLOTS, null);
  const source = oneOf(raw.source, ENTRY_SOURCES, null);
  if (!name || !per || !slot || !source) return null;
  const multiplier = normalizeMultiplier(raw.multiplier);
  const nutrients = computeNutrients(per, multiplier);
  if (!nutrients) return null;
  const estimate = ESTIMATE_SOURCES.includes(source) ? normalizeEstimate(raw.estimate) : null;
  if (ESTIMATE_SOURCES.includes(source) && !estimate) return null; // estimates without honest metadata fail closed
  let status = oneOf(raw.status, ENTRY_STATUSES, "draft");
  // A confirmed estimate is only valid when the record carries an explicit
  // user confirmation receipt; otherwise it demotes to draft (counts zero).
  if (ESTIMATE_SOURCES.includes(source) && status === "confirmed" && raw.confirmedBy !== "user") status = "draft";
  return {
    id: cleanString(raw.id, uid("food"), 96),
    slot,
    status,
    source,
    name,
    servingLabel: cleanString(raw.servingLabel, "1 serving", 80),
    per,
    multiplier,
    nutrients,
    estimate,
    photo: normalizePhotoMeta(raw.photo),
    confirmedBy: raw.confirmedBy === "user" ? "user" : null,
    confirmedAt: cleanString(raw.confirmedAt, "", 40) || null,
    createdAt: cleanString(raw.createdAt, new Date().toISOString(), 40),
    updatedAt: cleanString(raw.updatedAt, new Date().toISOString(), 40),
    history: (Array.isArray(raw.history) ? raw.history : []).filter(isObject).slice(-10).map(item => ({
      at: cleanString(item.at, "", 40),
      change: cleanString(item.change, "", 160),
    })).filter(item => item.at && item.change),
  };
}

export function createFoodEntry({ slot, source = "manual", food: foodInput, multiplier = 1, estimate = null, photo = null, now = new Date() }) {
  const per = normalizePerServing(foodInput?.per);
  const name = cleanString(foodInput?.name, "", 120);
  if (!per || !name || !MEAL_SLOTS.includes(slot) || !ENTRY_SOURCES.includes(source)) return null;
  const at = now.toISOString();
  const entry = {
    id: uid("food"),
    slot,
    // Structural rule: estimates are ALWAYS born as drafts. There is no
    // argument that can create a confirmed estimate entry.
    status: ESTIMATE_SOURCES.includes(source) ? "draft" : "confirmed",
    source,
    name,
    servingLabel: cleanString(foodInput?.servingLabel, "1 serving", 80),
    per,
    multiplier: normalizeMultiplier(multiplier),
    nutrients: null,
    estimate: ESTIMATE_SOURCES.includes(source) ? normalizeEstimate(estimate) : null,
    photo: normalizePhotoMeta(photo),
    confirmedBy: null,
    confirmedAt: null,
    createdAt: at,
    updatedAt: at,
    history: [],
  };
  if (ESTIMATE_SOURCES.includes(source) && !entry.estimate) return null;
  entry.nutrients = computeNutrients(entry.per, entry.multiplier);
  return normalizeNutritionEntry(entry);
}

// ── Day + state containers ─────────────────────────────────────────────────
export function createNutritionDay(dateKey) {
  return { date: dateKey, entries: [] };
}

export function normalizeNutritionDay(raw, dateKey) {
  const day = createNutritionDay(dateKey);
  if (!isObject(raw)) return day;
  day.entries = (Array.isArray(raw.entries) ? raw.entries : [])
    .map(normalizeNutritionEntry)
    .filter(Boolean)
    .slice(0, MAX_DAY_ENTRIES);
  return day;
}

export function createInitialNutritionState() {
  return {
    schemaVersion: NUTRITION_SCHEMA_VERSION,
    targets: { ...DEFAULT_TARGETS },
    days: {},
    recents: [],
    favorites: [],
  };
}

function normalizeSavedFood(raw) {
  if (!isObject(raw)) return null;
  const name = cleanString(raw.name, "", 120);
  const per = normalizePerServing(raw.per);
  if (!name || !per) return null;
  return {
    name,
    servingLabel: cleanString(raw.servingLabel, "1 serving", 80),
    per,
    multiplier: normalizeMultiplier(raw.multiplier),
    lastUsedAt: cleanString(raw.lastUsedAt, "", 40),
  };
}

// Fail-closed: any corruption inside nutrition drops ONLY the corrupted pieces
// (or, at worst, resets nutrition alone). It can never reset the wider app state.
export function normalizeNutritionState(raw) {
  const base = createInitialNutritionState();
  if (!isObject(raw)) return base;
  const days = {};
  if (isObject(raw.days)) {
    Object.keys(raw.days)
      .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key))
      .sort()
      .slice(-MAX_TRACKED_DAYS)
      .forEach(key => { days[key] = normalizeNutritionDay(raw.days[key], key); });
  }
  return {
    schemaVersion: NUTRITION_SCHEMA_VERSION,
    targets: normalizeTargets(raw.targets),
    days,
    recents: (Array.isArray(raw.recents) ? raw.recents : []).map(normalizeSavedFood).filter(Boolean).slice(0, MAX_RECENTS),
    favorites: (Array.isArray(raw.favorites) ? raw.favorites : []).map(normalizeSavedFood).filter(Boolean).slice(0, MAX_FAVORITES),
  };
}

export function ensureNutritionDay(nutrition, dateKey) {
  if (!nutrition.days[dateKey]) nutrition.days[dateKey] = createNutritionDay(dateKey);
  return nutrition.days[dateKey];
}

export function findEntry(nutrition, dateKey, entryId) {
  return nutrition?.days?.[dateKey]?.entries?.find(entry => entry.id === entryId) || null;
}

// ── Mutations (call inside store.update) ───────────────────────────────────
export function addEntryToDay(nutrition, dateKey, entry) {
  if (!entry) return null;
  const day = ensureNutritionDay(nutrition, dateKey);
  if (day.entries.length >= MAX_DAY_ENTRIES) return null;
  day.entries.push(entry);
  return entry;
}

// The ONLY path from draft to confirmed. Requires a literal user confirmation.
export function confirmNutritionEntry(nutrition, dateKey, entryId, { userConfirmed = false, now = new Date() } = {}) {
  if (userConfirmed !== true) return { ok: false, error: "USER_CONFIRMATION_REQUIRED" };
  const entry = findEntry(nutrition, dateKey, entryId);
  if (!entry) return { ok: false, error: "ENTRY_NOT_FOUND" };
  if (entry.status === "confirmed") return { ok: false, error: "ALREADY_CONFIRMED" };
  entry.status = "confirmed";
  entry.confirmedBy = "user";
  entry.confirmedAt = now.toISOString();
  entry.updatedAt = now.toISOString();
  entry.history = [...(entry.history || []), { at: now.toISOString(), change: "Confirmed by user after review" }].slice(-10);
  return { ok: true, entry };
}

export function applyPortionEdit(nutrition, dateKey, entryId, multiplier, now = new Date()) {
  const entry = findEntry(nutrition, dateKey, entryId);
  if (!entry) return { ok: false, error: "ENTRY_NOT_FOUND" };
  const next = normalizeMultiplier(multiplier);
  const previous = entry.multiplier;
  entry.multiplier = next;
  entry.nutrients = computeNutrients(entry.per, next);
  entry.updatedAt = now.toISOString();
  if (previous !== next) {
    entry.history = [...(entry.history || []), { at: now.toISOString(), change: `Portion ${previous}× → ${next}×` }].slice(-10);
  }
  return { ok: true, entry };
}

export function applyFoodEdit(nutrition, dateKey, entryId, patch, now = new Date()) {
  const entry = findEntry(nutrition, dateKey, entryId);
  if (!entry) return { ok: false, error: "ENTRY_NOT_FOUND" };
  const name = cleanString(patch?.name, entry.name, 120) || entry.name;
  const per = normalizePerServing({ ...entry.per, ...(isObject(patch?.per) ? patch.per : {}) });
  if (!per) return { ok: false, error: "INVALID_NUTRIENTS" };
  entry.name = name;
  entry.per = per;
  entry.nutrients = computeNutrients(per, entry.multiplier);
  entry.updatedAt = now.toISOString();
  entry.history = [...(entry.history || []), { at: now.toISOString(), change: "Details edited before/after review" }].slice(-10);
  return { ok: true, entry };
}

export function removeEntry(nutrition, dateKey, entryId) {
  const day = nutrition?.days?.[dateKey];
  if (!day) return false;
  const before = day.entries.length;
  day.entries = day.entries.filter(entry => entry.id !== entryId);
  return day.entries.length !== before;
}

export function recordRecentFood(nutrition, entry, now = new Date()) {
  if (!entry?.name || !entry?.per) return;
  const snapshot = {
    name: entry.name,
    servingLabel: entry.servingLabel,
    per: { ...entry.per },
    multiplier: entry.multiplier,
    lastUsedAt: now.toISOString(),
  };
  nutrition.recents = [snapshot, ...(nutrition.recents || []).filter(item => item.name.toLowerCase() !== entry.name.toLowerCase())].slice(0, MAX_RECENTS);
}

export function toggleFavoriteFood(nutrition, foodSnapshot) {
  const name = cleanString(foodSnapshot?.name, "", 120).toLowerCase();
  if (!name) return false;
  const existing = (nutrition.favorites || []).some(item => item.name.toLowerCase() === name);
  if (existing) {
    nutrition.favorites = nutrition.favorites.filter(item => item.name.toLowerCase() !== name);
    return false;
  }
  const normalized = normalizeSavedFood(foodSnapshot);
  if (!normalized) return false;
  nutrition.favorites = [normalized, ...(nutrition.favorites || [])].slice(0, MAX_FAVORITES);
  return true;
}

export function isFavoriteFood(nutrition, name) {
  return (nutrition?.favorites || []).some(item => item.name.toLowerCase() === String(name || "").toLowerCase());
}

export function copySlotFromDay(nutrition, fromDateKey, toDateKey, slot, now = new Date()) {
  const source = nutrition?.days?.[fromDateKey];
  if (!source || !MEAL_SLOTS.includes(slot)) return 0;
  const confirmed = source.entries.filter(entry => entry.slot === slot && entry.status === "confirmed");
  let copied = 0;
  confirmed.forEach(entry => {
    const clone = createFoodEntry({
      slot,
      source: "recent",
      food: { name: entry.name, servingLabel: entry.servingLabel, per: deepClone(entry.per) },
      multiplier: entry.multiplier,
      now,
    });
    if (clone && addEntryToDay(nutrition, toDateKey, clone)) copied += 1;
  });
  return copied;
}

// ── Read models (confirmed-only totals) ────────────────────────────────────
const EMPTY_TOTALS = Object.freeze({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 });

export function dayTotals(day) {
  const totals = { ...EMPTY_TOTALS };
  (day?.entries || [])
    .filter(entry => entry.status === "confirmed")
    .forEach(entry => {
      totals.calories += entry.nutrients.calories;
      totals.protein += entry.nutrients.protein;
      totals.carbs += entry.nutrients.carbs;
      totals.fat += entry.nutrients.fat;
      totals.fiber += entry.nutrients.fiber;
      totals.sugar += entry.nutrients.sugar;
      totals.sodium += entry.nutrients.sodium;
    });
  totals.protein = round1(totals.protein);
  totals.carbs = round1(totals.carbs);
  totals.fat = round1(totals.fat);
  totals.fiber = round1(totals.fiber);
  totals.sugar = round1(totals.sugar);
  return totals;
}

export function slotTotals(day, slot) {
  return dayTotals({ entries: (day?.entries || []).filter(entry => entry.slot === slot) });
}

export function draftCount(day) {
  return (day?.entries || []).filter(entry => entry.status === "draft").length;
}

export function remainingTargets(targets, totals) {
  const normalized = normalizeTargets(targets);
  return {
    calories: normalized.calories - totals.calories,
    protein: round1(normalized.protein - totals.protein),
    carbs: round1(normalized.carbs - totals.carbs),
    fat: round1(normalized.fat - totals.fat),
  };
}

export function mealSlotForHour(hour) {
  const value = safeNumber(hour, 12, 0, 23);
  if (value < 10) return "breakfast";
  if (value < 15) return "lunch";
  if (value < 21) return "dinner";
  return "snacks";
}

export function searchFoods(nutrition, query) {
  const normalized = String(query || "").trim().toLowerCase();
  const pool = [
    ...(nutrition?.favorites || []).map(item => ({ ...item, origin: "favorite" })),
    ...(nutrition?.recents || []).map(item => ({ ...item, origin: "recent" })),
    ...DEMO_FOODS.map(item => ({ name: item.name, servingLabel: item.servingLabel, per: item.per, multiplier: 1, origin: "library", key: item.key })),
  ];
  const seen = new Set();
  const unique = pool.filter(item => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!normalized) return unique.slice(0, 12);
  return unique.filter(item => item.name.toLowerCase().includes(normalized)).slice(0, 12);
}

// ── Coach projection (numbers only, local action cards only) ───────────────
// This projection NEVER enters the provider payload; v1's chat contract
// (fitcoach-chat-v3) has no nutrition fields and this build does not add any.
export function projectNutritionForCoach(state, now = new Date()) {
  const dateKey = localDateKey(now);
  const nutrition = state?.nutrition;
  const day = nutrition?.days?.[dateKey];
  const totals = dayTotals(day);
  const targets = normalizeTargets(nutrition?.targets);
  return {
    confirmedCalories: totals.calories,
    targetCalories: targets.calories,
    remainingCalories: targets.calories - totals.calories,
    proteinGrams: totals.protein,
    proteinTarget: targets.protein,
    proteinGapGrams: Math.max(0, round1(targets.protein - totals.protein)),
    draftCount: draftCount(day),
  };
}

export function photoHash(name, size) {
  return hashText(`${name}:${size}`).slice(0, 8);
}
