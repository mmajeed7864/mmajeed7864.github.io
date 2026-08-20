// FitCoach v0.4 founder-prototype meal estimator.
//
// HONESTY CONTRACT: there is NO vision provider in this build. This module is a
// deterministic demo that exercises the full review UX. It never fabricates a
// provider response: every result is flagged { demo: true }, labeled with a
// deterministic provider id, carries wide ranges + low confidence, and must be
// reviewed and explicitly confirmed by the founder before it counts anywhere.
// The photo itself is never read, uploaded, or stored — only name/size metadata
// feeds the deterministic selection.
import { hashText, safeNumber } from "../core/utils.mjs";
import { DEMO_FOODS, mealSlotForHour, photoHash } from "./nutrition.mjs";

export const ESTIMATOR_PROVIDER = "founder-demo-deterministic-v1";
export const ESTIMATOR_DISCLAIMER = "Founder prototype: deterministic demo estimate, not computer vision. Photo estimates can be wrong — review, edit, and confirm before anything counts.";

const meal = (name, servingLabel, calories, protein, carbs, fat, assumptions) => Object.freeze({
  name,
  servingLabel,
  per: Object.freeze({ calories, protein, carbs, fat, fiber: 0, sugar: 0, sodium: 0 }),
  assumptions: Object.freeze(assumptions),
});

export const DEMO_MEALS = Object.freeze([
  meal("Chicken, rice, and vegetables", "1 plate (~450 g)", 620, 45, 62, 18, ["Assuming grilled chicken, not fried", "Assuming ~1 cup cooked rice", "Sauce or added oil not visible"]),
  meal("Mixed salad with protein", "1 large bowl", 430, 30, 18, 26, ["Assuming dressed greens with one protein", "Dressing amount is a guess", "Croutons or cheese may be missed"]),
  meal("Pasta with tomato sauce", "1 bowl (~350 g)", 560, 18, 88, 14, ["Assuming ~1.5 cups cooked pasta", "Assuming tomato-based sauce, not cream", "Added cheese not counted"]),
  meal("Burrito or wrap", "1 large wrap", 680, 32, 74, 27, ["Assuming a standard flour tortilla", "Fillings are estimated, not identified", "Sour cream or guac may be missed"]),
  meal("Eggs with toast", "2 eggs + 2 slices", 420, 22, 39, 19, ["Assuming eggs cooked with some fat", "Assuming standard bread slices", "Butter or spreads are a guess"]),
  meal("Oatmeal with toppings", "1 bowl (~300 g)", 380, 12, 60, 11, ["Assuming milk or water base", "Toppings estimated broadly", "Added sugar not visible"]),
  meal("Sandwich", "1 sandwich", 520, 26, 52, 22, ["Assuming two bread slices with one protein", "Condiments are a guess", "Side items not counted"]),
  meal("Stir-fry with rice", "1 plate (~420 g)", 590, 28, 68, 22, ["Assuming oil-based stir-fry", "Protein type estimated", "Sauce sugar content is a guess"]),
  meal("Burger and fries", "1 burger + small fries", 850, 34, 78, 44, ["Assuming a single-patty burger", "Fry portion is a guess", "Sauces add unseen calories"]),
  meal("Yogurt with fruit and granola", "1 bowl (~280 g)", 340, 18, 48, 9, ["Assuming plain or lightly sweetened yogurt", "Granola amount is a guess", "Honey or syrup may be missed"]),
  meal("Soup with bread", "1 bowl + 1 slice", 380, 16, 46, 14, ["Soup base (broth vs cream) is a guess", "Assuming one bread slice", "Added oil not visible"]),
  meal("Smoothie", "1 large glass (~500 ml)", 320, 14, 56, 6, ["Ingredients are not identifiable from outside", "Assuming fruit + milk or yogurt base", "Protein powder may be missed"]),
]);

const KEYWORDS = Object.freeze([
  ["chicken", "Chicken, rice, and vegetables"],
  ["rice", "Chicken, rice, and vegetables"],
  ["stir", "Stir-fry with rice"],
  ["salad", "Mixed salad with protein"],
  ["pasta", "Pasta with tomato sauce"],
  ["spaghetti", "Pasta with tomato sauce"],
  ["burrito", "Burrito or wrap"],
  ["wrap", "Burrito or wrap"],
  ["taco", "Burrito or wrap"],
  ["egg", "Eggs with toast"],
  ["toast", "Eggs with toast"],
  ["oat", "Oatmeal with toppings"],
  ["sandwich", "Sandwich"],
  ["burger", "Burger and fries"],
  ["fries", "Burger and fries"],
  ["yogurt", "Yogurt with fruit and granola"],
  ["granola", "Yogurt with fruit and granola"],
  ["soup", "Soup with bread"],
  ["smoothie", "Smoothie"],
  ["shake", "Smoothie"],
]);

const findMeal = name => DEMO_MEALS.find(item => item.name === name) || null;

function matchByKeywords(text) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return null;
  for (const [keyword, name] of KEYWORDS) {
    if (normalized.includes(keyword)) return findMeal(name);
  }
  const demoFood = DEMO_FOODS.find(item => normalized.includes(item.name.split(",")[0].toLowerCase()));
  if (demoFood) {
    return {
      name: demoFood.name,
      servingLabel: demoFood.servingLabel,
      per: demoFood.per,
      assumptions: ["Matched from your description, not from the photo", "Portion size is a standard serving guess"],
    };
  }
  return null;
}

function widen(value, low, high) {
  return [Math.max(0, Math.round(value * low)), Math.round(value * high)];
}

function buildEstimate(candidate, alternates, { confidence, context }) {
  return {
    demo: true,
    provider: ESTIMATOR_PROVIDER,
    confidence,
    kcalRange: widen(candidate.per.calories, 0.7, 1.35),
    proteinRange: widen(candidate.per.protein, 0.65, 1.35),
    carbsRange: widen(candidate.per.carbs, 0.65, 1.35),
    fatRange: widen(candidate.per.fat, 0.6, 1.45),
    assumptions: [...candidate.assumptions],
    candidates: [candidate.name, ...alternates.map(item => item.name)].slice(0, 3),
    context: String(context || "").slice(0, 200),
  };
}

// Deterministic photo "estimate": same file metadata + context always yields the
// same result. The image content is never inspected.
export function estimatePhotoMeal({ photoName = "photo", photoSize = 0, context = "", now = new Date() } = {}) {
  const described = matchByKeywords(context);
  const seed = parseInt(hashText(`${photoName}:${photoSize}:${String(context).toLowerCase()}`), 16);
  const index = seed % DEMO_MEALS.length;
  const candidate = described || DEMO_MEALS[index];
  const alternates = [DEMO_MEALS[(index + 5) % DEMO_MEALS.length], DEMO_MEALS[(index + 9) % DEMO_MEALS.length]]
    .filter(item => item.name !== candidate.name);
  return {
    food: {
      name: candidate.name,
      servingLabel: candidate.servingLabel,
      per: { ...candidate.per },
    },
    estimate: buildEstimate(candidate, alternates, {
      confidence: described ? "medium" : "low",
      context,
    }),
    photo: {
      name: String(photoName).slice(0, 80),
      size: safeNumber(photoSize, 0, 0, 50_000_000),
      hash: photoHash(photoName, photoSize),
    },
    suggestedSlot: mealSlotForHour(now.getHours()),
  };
}

// Deterministic text "estimate" for coach-drafted meals ("log chicken and rice").
export function estimateTextMeal(description, now = new Date()) {
  const candidate = matchByKeywords(description) || {
    name: "Mixed meal (describe to refine)",
    servingLabel: "1 plate",
    per: { calories: 500, protein: 25, carbs: 50, fat: 20, fiber: 0, sugar: 0, sodium: 0 },
    assumptions: ["No demo match for this description", "Values are a broad placeholder — edit before confirming"],
  };
  const alternates = DEMO_MEALS.filter(item => item.name !== candidate.name).slice(0, 2);
  return {
    food: {
      name: candidate.name,
      servingLabel: candidate.servingLabel,
      per: { ...candidate.per },
    },
    estimate: buildEstimate(candidate, alternates, {
      confidence: matchByKeywords(description) ? "medium" : "low",
      context: description,
    }),
    photo: null,
    suggestedSlot: mealSlotForHour(now.getHours()),
  };
}
