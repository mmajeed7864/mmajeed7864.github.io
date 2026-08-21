import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createFitCoachStore,
  createInitialState,
  normalizeStateForTest,
  storageKey,
} from "../v040/core/store.mjs";
import {
  DEMO_FOODS,
  addEntryToDay,
  applyPortionEdit,
  computeNutrients,
  confirmNutritionEntry,
  copySlotFromDay,
  createFoodEntry,
  createInitialNutritionState,
  dayTotals,
  draftCount,
  ensureNutritionDay,
  mealSlotForHour,
  normalizeMultiplier,
  normalizeNutritionEntry,
  normalizeNutritionState,
  projectNutritionForCoach,
  remainingTargets,
} from "../v040/domain/nutrition.mjs";
import {
  ESTIMATOR_PROVIDER,
  estimatePhotoMeal,
  estimateTextMeal,
} from "../v040/domain/nutrition-estimator.mjs";
import {
  createNutritionLookupPayload,
  normalizeBarcode,
  normalizeRemoteFood,
} from "../v040/services/nutrition-client.mjs";
import { deriveTrainerAction, isTrainerAction, TRAINER_ACTION_KINDS } from "../v040/domain/trainer-actions.mjs";
import { createTrainerPayload } from "../v040/services/trainer-client.mjs";
import { renderNutritionModalContent, renderNutritionScreen } from "../v040/ui/nutrition-screen.mjs";
import { localDateKey } from "../v040/core/utils.mjs";

class MemoryStorage {
  #values = new Map();

  get length() { return this.#values.size; }

  clear() { this.#values.clear(); }

  getItem(key) {
    return this.#values.has(String(key)) ? this.#values.get(String(key)) : null;
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key) { this.#values.delete(String(key)); }

  setItem(key, value) { this.#values.set(String(key), String(value)); }
}

const FIXED_NOW = new Date("2026-08-20T14:00:00.000Z");
const DATE_KEY = localDateKey(FIXED_NOW);
const appSource = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");

const chickenFood = () => ({
  name: "Chicken breast, grilled",
  servingLabel: "1 breast (170 g)",
  per: { calories: 280, protein: 53, carbs: 0, fat: 6 },
});

function confirmedEntry(overrides = {}) {
  return createFoodEntry({ slot: "lunch", source: "manual", food: chickenFood(), multiplier: 1, now: FIXED_NOW, ...overrides });
}

function photoDraft(overrides = {}) {
  const result = estimatePhotoMeal({ photoName: "meal.jpg", photoSize: 123456, context: "", now: FIXED_NOW });
  return createFoodEntry({
    slot: "lunch",
    source: "photo_estimate",
    food: result.food,
    multiplier: 1,
    estimate: result.estimate,
    photo: result.photo,
    now: FIXED_NOW,
    ...overrides,
  });
}

// ── 1. Only confirmed entries count in totals ──────────────────────────────
test("day totals count confirmed entries only", () => {
  const nutrition = createInitialNutritionState();
  addEntryToDay(nutrition, DATE_KEY, confirmedEntry());
  addEntryToDay(nutrition, DATE_KEY, photoDraft());
  addEntryToDay(nutrition, DATE_KEY, createFoodEntry({ slot: "dinner", source: "text_estimate", ...(() => { const r = estimateTextMeal("pasta", FIXED_NOW); return { food: r.food, estimate: r.estimate }; })(), now: FIXED_NOW }));
  const totals = dayTotals(nutrition.days[DATE_KEY]);
  assert.equal(totals.calories, 280, "only the confirmed manual entry may count");
  assert.equal(totals.protein, 53);
  assert.equal(draftCount(nutrition.days[DATE_KEY]), 2);
  const remaining = remainingTargets(nutrition.targets, totals);
  assert.equal(remaining.calories, 2200 - 280);
});

// ── 2. Photo/text drafts count exactly zero until confirmed ────────────────
test("photo and text estimate drafts contribute exactly zero until user confirmation", () => {
  const nutrition = createInitialNutritionState();
  const draft = addEntryToDay(nutrition, DATE_KEY, photoDraft());
  assert.equal(draft.status, "draft", "estimate sources must be born as drafts");
  assert.equal(dayTotals(nutrition.days[DATE_KEY]).calories, 0);
  assert.equal(projectNutritionForCoach({ nutrition }, FIXED_NOW).confirmedCalories, 0);

  const refused = confirmNutritionEntry(nutrition, DATE_KEY, draft.id, { now: FIXED_NOW });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, "USER_CONFIRMATION_REQUIRED");
  assert.equal(dayTotals(nutrition.days[DATE_KEY]).calories, 0, "a refused confirm must not count");

  const confirmed = confirmNutritionEntry(nutrition, DATE_KEY, draft.id, { userConfirmed: true, now: FIXED_NOW });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.entry.confirmedBy, "user");
  assert.equal(dayTotals(nutrition.days[DATE_KEY]).calories, draft.nutrients.calories);
});

test("estimator output is honest: demo-flagged, ranged, low/medium confidence, deterministic", () => {
  const first = estimatePhotoMeal({ photoName: "a.jpg", photoSize: 999, context: "", now: FIXED_NOW });
  const second = estimatePhotoMeal({ photoName: "a.jpg", photoSize: 999, context: "", now: FIXED_NOW });
  assert.deepEqual(first.food, second.food, "same photo metadata must give the same demo estimate");
  assert.equal(first.estimate.demo, true);
  assert.equal(first.estimate.provider, ESTIMATOR_PROVIDER);
  assert.ok(["low", "medium"].includes(first.estimate.confidence));
  assert.ok(first.estimate.kcalRange[0] < first.estimate.kcalRange[1], "estimates must be ranges, not fake precision");
  assert.ok(first.estimate.assumptions.length >= 1, "estimates must state their assumptions");
});

// ── 3. Portion edits recompute deterministically ───────────────────────────
test("portion edits recompute calories and macros deterministically", () => {
  const nutrition = createInitialNutritionState();
  const entry = addEntryToDay(nutrition, DATE_KEY, confirmedEntry());
  const edited = applyPortionEdit(nutrition, DATE_KEY, entry.id, 1.5, FIXED_NOW);
  assert.equal(edited.ok, true);
  assert.deepEqual(edited.entry.nutrients, computeNutrients(entry.per, 1.5));
  assert.equal(edited.entry.nutrients.calories, 420);
  assert.equal(edited.entry.nutrients.protein, 79.5);
  assert.equal(dayTotals(nutrition.days[DATE_KEY]).calories, 420);
  const restored = applyPortionEdit(nutrition, DATE_KEY, entry.id, 1, FIXED_NOW);
  assert.equal(restored.entry.nutrients.calories, 280, "portion edits must be exactly reversible");
  assert.ok(restored.entry.history.some(item => item.change.includes("Portion")), "portion edits keep history");
  assert.equal(normalizeMultiplier(500), 20, "multipliers are bounded");
});

// ── 4. Corrupted nutrition fails closed without resetting the app ──────────
test("corrupted nutrition entries are dropped individually and never reset wider app state", () => {
  const good = confirmedEntry();
  const corrupted = {
    nutrition: {
      targets: { calories: "NaNish" },
      days: {
        [DATE_KEY]: {
          entries: [
            good,
            { name: "ghost", per: { calories: "many" } },
            null,
            42,
            { ...confirmedEntry(), slot: "brunch" },
            { ...confirmedEntry(), per: { calories: Infinity, protein: 1, carbs: 1, fat: 1 } },
          ],
        },
        "not-a-date": { entries: [confirmedEntry()] },
      },
      recents: [{ name: "", per: {} }, "junk"],
      favorites: "junk",
    },
  };
  const state = normalizeStateForTest({ ...createInitialState("mo", FIXED_NOW), sessions: [{ id: "s1", completedAt: FIXED_NOW.toISOString(), exercises: [] }], ...corrupted }, "mo");
  assert.equal(state.nutrition.days[DATE_KEY].entries.length, 1, "only the valid entry survives");
  assert.equal(state.nutrition.days[DATE_KEY].entries[0].name, good.name);
  assert.equal(state.nutrition.days["not-a-date"], undefined);
  assert.equal(state.nutrition.targets.calories, 2200, "invalid targets fall back to defaults");
  assert.equal(state.sessions.length, 1, "workout history must survive nutrition corruption");
  assert.equal(state.profile.goal, "build muscle");

  const totallyBroken = normalizeNutritionState("💥");
  assert.deepEqual(totallyBroken.days, {});
  assert.equal(totallyBroken.targets.calories, 2200);
});

test("store load survives a corrupt nutrition payload on disk", () => {
  const storage = new MemoryStorage();
  const seeded = createInitialState("mo", FIXED_NOW);
  seeded.sessions = [{ id: "keep-me", completedAt: FIXED_NOW.toISOString(), exercises: [] }];
  seeded.nutrition = { days: { [DATE_KEY]: { entries: [{ evil: true }, confirmedEntry()] } } };
  storage.setItem(storageKey("mo"), JSON.stringify(seeded));
  const store = createFitCoachStore({ storage, founder: "mo", clock: () => FIXED_NOW });
  const state = store.load();
  assert.equal(state.sessions[0].id, "keep-me");
  assert.equal(state.nutrition.days[DATE_KEY].entries.length, 1);
});

// ── 5. Camera draft cannot bypass the review sheet ─────────────────────────
test("a camera draft has no path around review: constructor, normalizer, and confirm all enforce it", () => {
  const sneaky = normalizeNutritionEntry({
    ...photoDraft(),
    status: "confirmed", // forged status without a user receipt
  });
  assert.equal(sneaky.status, "draft", "a confirmed estimate without confirmedBy:user demotes to draft");

  const forgedReceipt = normalizeNutritionEntry({ ...photoDraft(), status: "confirmed", confirmedBy: "coach" });
  assert.equal(forgedReceipt.status, "draft", "only a literal user receipt counts");

  const draft = photoDraft();
  assert.equal(draft.status, "draft", "createFoodEntry cannot create a confirmed estimate");
});

test("app source: the photo handler routes into the review sheet and never confirms", () => {
  assert.match(appSource, /function handleNutritionPhoto[\s\S]{0,700}createDraftFromEstimate/u, "photo input must create a draft");
  assert.match(appSource, /function createDraftFromEstimate[\s\S]{0,1600}openNutritionReview/u, "draft creation must open the review sheet");
  const confirmCalls = appSource.match(/confirmNutritionEntry\(/g) || [];
  assert.equal(confirmCalls.length, 1, "exactly one confirm call site may exist in the app shell");
  assert.match(appSource, /action === "nutrition-confirm-entry"[\s\S]{0,400}confirmNutritionEntry\([\s\S]{0,120}userConfirmed: true/u, "the only confirm call lives in the explicit review-sheet button handler");
  assert.doesNotMatch(appSource, /function handleNutritionPhoto[\s\S]{0,900}confirmNutritionEntry/u, "the photo path must never touch confirm");
});

// ── 6. No raw image/base64 payload in app state or localStorage ────────────
test("raw image payloads are rejected from persisted state", () => {
  const storage = new MemoryStorage();
  const store = createFitCoachStore({ storage, founder: "mo", clock: () => FIXED_NOW });
  store.load();
  store.update(draft => {
    ensureNutritionDay(draft.nutrition, DATE_KEY).entries.push({
      ...photoDraft(),
      photo: { name: "meal.jpg", size: 4, dataUrl: "data:image/jpeg;base64,AAAA" },
    });
    ensureNutritionDay(draft.nutrition, DATE_KEY).entries.push(confirmedEntry());
  });
  const persisted = storage.getItem(storageKey("mo"));
  assert.ok(!/data:image\//.test(persisted), "no data-URL may reach localStorage");
  assert.ok(!/;base64,/.test(persisted), "no base64 image payload may reach localStorage");
  const state = store.get();
  assert.equal(state.nutrition.days[DATE_KEY].entries.length, 1, "the smuggling entry fails closed; the clean one survives");
  const photoMeta = photoDraft().photo;
  assert.deepEqual(Object.keys(photoMeta).sort(), ["hash", "name", "size"], "photo metadata is whitelist-only");
});

test("app source: photos are preview-only object URLs, never read or encoded", () => {
  assert.doesNotMatch(appSource, /FileReader|readAsDataURL|readAsArrayBuffer|canvas/iu, "app shell must not read image bytes");
  assert.match(appSource, /URL\.createObjectURL/u, "preview uses a session object URL");
  assert.match(appSource, /revokeObjectURL/u, "preview object URL must be revocable");
});

test("barcode lookup payload is bounded and never includes profile or nutrition free text", () => {
  assert.equal(normalizeBarcode("0 12345-678901 2"), "0123456789012");
  assert.equal(normalizeBarcode("abc"), "");
  const payload = createNutritionLookupPayload({
    action: "barcode_lookup",
    sessionId: "fitcoach-mo-nutrition-v040",
    barcode: "0123456789012",
  });
  assert.deepEqual(payload, {
    action: "barcode_lookup",
    data_classification: "synthetic_low_sensitivity",
    session_id: "fitcoach-mo-nutrition-v040",
    barcode: "0123456789012",
  });
  assert.doesNotMatch(JSON.stringify(payload), /profile|medication|condition|Grandma/i);
});

test("remote barcode food can be confirmed as a barcode source with portion edits", () => {
  const food = normalizeRemoteFood({
    name: "Greek Yogurt",
    brand: "Example Dairy",
    barcode: "0123456789012",
    servingLabel: "170 g",
    confidence: "high",
    source: "open_food_facts",
    per: { calories: 150, protein: 17, carbs: 9, fat: 4, sodium: 80 },
  });
  assert.equal(food.origin, "barcode");
  const entry = createFoodEntry({ slot: "breakfast", source: "barcode", food, multiplier: 2, now: FIXED_NOW });
  assert.equal(entry.status, "confirmed");
  assert.equal(entry.source, "barcode");
  assert.equal(entry.nutrients.calories, 300);
  assert.equal(entry.nutrients.protein, 34);
});

test("add-food sheet exposes verified barcode lookup separately from demo search", () => {
  const content = renderNutritionModalContent({ type: "nutrition-add", slot: "breakfast", query: "" }, { state: createInitialState("mo", FIXED_NOW) });
  assert.match(content.body, /id="nutrition-barcode"/);
  assert.match(content.body, /data-action="nutrition-barcode-search"/);
  assert.match(content.body, /Uses verified product data/u);
});

// ── 7. Private/safety text never reaches the provider projection ───────────
test("nutrition data is absent from the trainer provider payload", () => {
  const state = createInitialState("mo", FIXED_NOW);
  state.nutrition = createInitialNutritionState();
  const secretName = "Grandma soup my medication 10 mg batch";
  const entry = createFoodEntry({ slot: "lunch", source: "manual", food: { name: secretName, servingLabel: "1 bowl", per: { calories: 300, protein: 12, carbs: 30, fat: 10 } }, now: FIXED_NOW });
  addEntryToDay(state.nutrition, DATE_KEY, entry);
  state.nutrition.recents = [{ name: "call 415-555-0100 shake", servingLabel: "1", per: { calories: 100, protein: 1, carbs: 1, fat: 1 }, multiplier: 1, lastUsedAt: "" }];
  const payload = JSON.stringify(createTrainerPayload({ state, message: "What should I train today?", approvedAction: "SAY_NOTHING", founder: "mo", storage: new MemoryStorage(), now: FIXED_NOW }));
  assert.ok(!payload.includes("medication"), "food names must never reach the provider");
  assert.ok(!payload.includes("Grandma"), "nutrition free text must never reach the provider");
  assert.ok(!payload.includes("415-555"), "recents must never reach the provider");
  assert.ok(!payload.toLowerCase().includes("nutrition"), "chat-v3 contract has no nutrition fields and this build adds none");
});

test("coach projection is bounded numbers only — no free text can leak through it", () => {
  const state = createInitialState("mo", FIXED_NOW);
  addEntryToDay(state.nutrition, localDateKey(new Date()), confirmedEntry());
  const projection = projectNutritionForCoach(state);
  for (const [key, value] of Object.entries(projection)) {
    assert.equal(typeof value, "number", `${key} must be numeric`);
    assert.ok(Number.isFinite(value), `${key} must be finite`);
  }
});

// ── 8. Coach cannot create a confirmed entry ───────────────────────────────
test("coach hooks are draft/open only: no trainer action kind can confirm food", () => {
  assert.ok(TRAINER_ACTION_KINDS.includes("nutrition_draft"));
  assert.ok(TRAINER_ACTION_KINDS.includes("open_nutrition"));
  assert.ok(!TRAINER_ACTION_KINDS.some(kind => /confirm/i.test(kind)), "no confirm-shaped trainer action may exist");
  assert.equal(isTrainerAction({ kind: "nutrition_confirm", value: "x", label: "x", detail: "" }), false);

  const state = createInitialState("mo", FIXED_NOW);
  const action = deriveTrainerAction({ state, message: "Log chicken and rice as my lunch", exercises: [] });
  assert.equal(action.kind, "nutrition_draft");

  const gap = deriveTrainerAction({ state, message: "Show my protein gap", exercises: [] });
  assert.equal(gap.kind, "open_nutrition");
  assert.match(gap.detail, /\d+ g/u);

  const estimate = estimateTextMeal("chicken and rice", FIXED_NOW);
  const draftEntry = createFoodEntry({ slot: estimate.suggestedSlot, source: "text_estimate", food: estimate.food, estimate: estimate.estimate, now: FIXED_NOW });
  assert.equal(draftEntry.status, "draft", "a coach-drafted meal starts unconfirmed");
  assert.match(appSource, /kind === "nutrition_draft"[\s\S]{0,400}createDraftFromEstimate/u, "coach draft handler creates a draft");
  assert.doesNotMatch(appSource, /kind === "nutrition_draft"[\s\S]{0,400}confirmNutritionEntry/u, "coach draft handler must not confirm");
});

// ── 9. Route/UI smoke ──────────────────────────────────────────────────────
test("nutrition screen renders dashboard, meal cards, drafts, and capture entry points", () => {
  const state = createInitialState("mo", FIXED_NOW);
  const todayKey = localDateKey(new Date());
  addEntryToDay(state.nutrition, todayKey, confirmedEntry());
  addEntryToDay(state.nutrition, todayKey, photoDraft());
  const html = renderNutritionScreen({ state, ui: { nutritionDate: null }, now: new Date() });
  assert.match(html, /NUTRITION DIARY/u, "dashboard header renders");
  assert.match(html, /calorie-ring/u, "calorie ring renders");
  assert.match(html, /macro-bar/u, "macro bars render");
  for (const label of ["BREAKFAST", "LUNCH", "DINNER", "SNACKS"]) assert.ok(html.includes(label), `${label} meal card renders`);
  assert.match(html, /nutrition-open-capture/u, "scan entry point renders");
  assert.match(html, /nutrition-open-add/u, "quick add renders");
  assert.match(html, /DRAFT · counts 0/u, "draft rows are labeled as counting zero");
  assert.match(html, /draft-chip/u, "draft review chip renders");
  assert.ok(!/😊|🎉/.test(html));
});

test("review, capture, add, and targets sheets render with honest preview-demo labeling", () => {
  const state = createInitialState("mo", FIXED_NOW);
  const draft = addEntryToDay(state.nutrition, DATE_KEY, photoDraft());
  const context = { state, previewUrl: null };

  const review = renderNutritionModalContent({ type: "nutrition-review", dateKey: DATE_KEY, entryId: draft.id }, context);
  assert.match(review.body, /Preview estimate/u, "review sheet declares the demo estimator");
  assert.match(review.body, /not computer vision/u);
  assert.match(review.body, /–/u, "ranges are shown");
  assert.match(review.actions, /nutrition-confirm-entry/u);
  assert.match(review.actions, /nutrition-discard-entry/u);

  const capture = renderNutritionModalContent({ type: "nutrition-capture", slot: "lunch" }, context);
  assert.match(capture.body, /No vision provider is connected/u, "capture sheet is honest about the demo");
  assert.match(capture.body, /type="file" accept="image\/\*"/u, "camera/library input renders");

  const add = renderNutritionModalContent({ type: "nutrition-add", slot: "dinner", query: "chicken" }, context);
  assert.match(add.body, /nutrition-pick-food/u, "manual search results render");
  assert.match(add.body, /nutrition-toggle-custom/u, "custom food path renders");

  const custom = renderNutritionModalContent({ type: "nutrition-add", slot: "dinner", custom: true }, context);
  assert.match(custom.body, /custom-kcal/u, "manual food form renders");

  const targets = renderNutritionModalContent({ type: "nutrition-targets" }, context);
  assert.match(targets.body, /never adjusts these on its own/u);
  assert.match(targets.body, /Not medical or dietetic advice/u);
});

test("today and progress screens expose the nutrition route entry points", () => {
  const todaySource = readFileSync(new URL("../v040/ui/today-screen.mjs", import.meta.url), "utf8");
  const progressSource = readFileSync(new URL("../v040/ui/progress-screen.mjs", import.meta.url), "utf8");
  const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(todaySource, /nutritionCard\(state, now\)/u, "Today renders the nutrition card");
  assert.match(todaySource, /open-nutrition/u);
  assert.match(progressSource, /nutritionTrendCard\(state, now\)/u, "Progress renders the confirmed-only trend card");
  assert.match(progressSource, /Confirmed only/u);
  assert.match(indexSource, /data-route="nutrition"/u, "Nutrition must be directly visible in bottom navigation");
  assert.match(indexSource, />Food<\/span>/u, "Food tab label must be short enough for mobile");
});

// ── Supporting invariants ──────────────────────────────────────────────────
test("copy-yesterday copies confirmed entries only, slot-scoped", () => {
  const nutrition = createInitialNutritionState();
  const yesterday = "2026-08-19";
  addEntryToDay(nutrition, yesterday, confirmedEntry());
  addEntryToDay(nutrition, yesterday, photoDraft());
  addEntryToDay(nutrition, yesterday, confirmedEntry({ slot: "dinner" }));
  const copied = copySlotFromDay(nutrition, yesterday, DATE_KEY, "lunch", FIXED_NOW);
  assert.equal(copied, 1, "drafts and other slots must not be copied");
  assert.equal(nutrition.days[DATE_KEY].entries[0].status, "confirmed");
  assert.equal(nutrition.days[DATE_KEY].entries[0].source, "recent");
});

test("meal slot inference and demo food list stay sane", () => {
  assert.equal(mealSlotForHour(7), "breakfast");
  assert.equal(mealSlotForHour(12), "lunch");
  assert.equal(mealSlotForHour(19), "dinner");
  assert.equal(mealSlotForHour(23), "snacks");
  assert.ok(DEMO_FOODS.length >= 30);
  for (const item of DEMO_FOODS) {
    assert.ok(item.per.calories >= 0 && Number.isFinite(item.per.calories), `${item.name} has finite calories`);
  }
});
