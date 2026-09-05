import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialState } from "../v040/core/store.mjs";
import { addEntryToDay, createFoodEntry } from "../v040/domain/nutrition.mjs";
import { estimatePhotoMeal } from "../v040/domain/nutrition-estimator.mjs";
import { renderNutritionModalContent, renderNutritionScreen } from "../v040/ui/nutrition-screen.mjs";

const NOW = new Date("2026-09-04T12:00:00Z");
const DATE = "2026-09-04";
const food = {
  name: "Oats & yogurt",
  servingLabel: "1 bowl",
  per: { calories: 320, protein: 22, carbs: 45, fat: 8 },
  multiplier: 1,
};
const screen = state => renderNutritionScreen({ state, ui: { nutritionDate: DATE }, now: NOW });

test("food diary leads to real food lookup and reserves deterministic photo drafts for a labeled disclosure", () => {
  const html = screen(createInitialState("mo", NOW));
  const previewStart = html.indexOf('<details class="fuel-notes">');
  assert.ok(previewStart > 0);
  const diary = html.slice(0, previewStart);
  assert.match(diary, /data-action="nutrition-open-add"/u);
  assert.match(diary, /data-focus="barcode"/u);
  assert.doesNotMatch(diary, /nutrition-open-capture/u);
  assert.match(html.slice(previewStart), /Photo recognition is not active/u);
  assert.match(html.slice(previewStart), /nutrition-open-capture/u);
});

test("energy display counts confirmed food while exposing a separate draft review action", () => {
  const state = createInitialState("mo", NOW);
  addEntryToDay(state.nutrition, DATE, createFoodEntry({ slot: "breakfast", source: "manual", food, now: NOW }));
  const estimate = estimatePhotoMeal({ photoName: "lunch.jpg", photoSize: 900, context: "lunch", now: NOW });
  addEntryToDay(state.nutrition, DATE, createFoodEntry({ slot: "lunch", source: "photo_estimate", food: estimate.food, estimate: estimate.estimate, photo: estimate.photo, now: NOW }));
  const html = screen(state);
  assert.match(html, /aria-label="320 of 2,200 target calories confirmed"/u);
  assert.match(html, />1 food logged</u);
  assert.match(html, /data-action="nutrition-first-draft"/u);
  assert.match(html, /DRAFT · counts 0/u);
  assert.match(html, /1,880/u);
});

test("quick repeat keeps original recent indexes after favorite deduplication and escapes food names", () => {
  const state = createInitialState("mo", NOW);
  state.nutrition.favorites = [{ ...food }];
  state.nutrition.recents = [{ ...food }, { ...food, name: '<img src=x onerror="bad()">' }];
  const html = screen(state);
  assert.match(html, /data-kind="favorite" data-value="0"/u);
  assert.match(html, /data-kind="recent" data-value="1"/u);
  assert.doesNotMatch(html, /data-kind="recent" data-value="0"/u);
  assert.doesNotMatch(html, /<img src=x/u);
  assert.match(html, /&lt;img src=x/u);
});

test("portion review exposes the selected meal and cannot add before a meal is selected", () => {
  const state = createInitialState("mo", NOW);
  const selected = renderNutritionModalContent({ type: "nutrition-add", slot: "lunch", selected: food }, { state });
  assert.match(selected.body, /data-value="lunch" aria-pressed="true"/u);
  assert.match(selected.body, /data-value="dinner" aria-pressed="false"/u);
  const unselected = renderNutritionModalContent({ type: "nutrition-add", slot: "", selected: food }, { state });
  assert.match(unselected.actions, /data-action="nutrition-add-confirm"[^>]*disabled/u);
});

test("add-food entry preserves a historical diary date unless the entry explicitly belongs to today", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  const start = app.indexOf('if (action === "nutrition-open-add")');
  const end = app.indexOf('if (action === "nutrition-quick-food")', start);
  assert.ok(start >= 0 && end > start);
  // Run the real action branch with a fixed clock and in-memory UI dependencies.
  const runAction = new Function("action", "target", "ui", "value", "openModal", "localDateKey", "MEAL_SLOTS", "mealSlotForHour", "requestAnimationFrame", "document", app.slice(start, end));
  const run = (dataset, value = "") => {
    const ui = { nutritionDate: "2026-09-02" };
    let opened = null;
    let focused = false;
    runAction("nutrition-open-add", { dataset }, ui, value, modal => { opened = modal; }, () => DATE, ["breakfast", "lunch", "dinner", "snacks"], () => "lunch", callback => callback(), {
      querySelector: selector => selector === "#nutrition-barcode" ? { focus: () => { focused = true; } } : null,
    });
    return { ui, opened, focused };
  };
  const diary = run({}, "dinner");
  assert.equal(diary.ui.nutritionDate, "2026-09-02");
  assert.equal(diary.opened.slot, "dinner");
  const home = run({ date: "today" });
  assert.equal(home.ui.nutritionDate, DATE);
  assert.equal(home.opened.slot, "lunch");
  const barcode = run({ focus: "barcode" });
  assert.equal(barcode.ui.nutritionDate, "2026-09-02");
  assert.equal(barcode.focused, true);
});
