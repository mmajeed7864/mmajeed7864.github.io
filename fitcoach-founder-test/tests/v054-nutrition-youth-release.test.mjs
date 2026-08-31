import test from "node:test";
import assert from "node:assert/strict";

import {
  NUTRITION_PROVIDER_RELEASE_GATE,
  normalizeNutritionProvenance,
  nutritionSourceDisclosure,
} from "../v040/policy/nutrition-providers.mjs";
import {
  CURRENT_RELEASE_MINIMUM_AGE,
  TEEN_RELEASE_GATE,
  ageBandFromAge,
  capabilitiesForAgeBand,
  sanitizeCoachToneForAge,
  teenReleaseEligibility,
} from "../v040/policy/youth-safety.mjs";
import {
  CURRENT_STORE_DISCLOSURES,
  STORE_DISCLOSURE_REQUIREMENTS,
  evaluateStoreReleaseReadiness,
} from "../v040/policy/release-disclosures.mjs";
import { normalizeRemoteFood } from "../v040/services/nutrition-client.mjs";
import { createFoodEntry, normalizeNutritionEntry } from "../v040/domain/nutrition.mjs";

test("nutrition provenance never upgrades a community product record to verified", () => {
  const off = normalizeNutritionProvenance({
    provider: "open_food_facts",
    barcode: "0123456789012",
    sourceUrl: "https://world.openfoodfacts.org/product/0123456789012",
  });
  assert.equal(off.verificationLevel, "community_label");
  assert.equal(nutritionSourceDisclosure(off).verified, false);
  assert.match(off.warning, /community-contributed/i);

  const usda = normalizeNutritionProvenance({
    provider: "usda_fdc",
    fdcId: "171077",
    sourceUrl: "https://fdc.nal.usda.gov/food-details/171077/nutrients",
  });
  assert.equal(usda.verificationLevel, "government_reference");
  assert.equal(nutritionSourceDisclosure(usda).verified, true);
  assert.match(usda.license, /CC0/i);
});

test("unknown providers and untrusted provenance URLs fail closed", () => {
  assert.equal(normalizeNutritionProvenance({ provider: "mystery", recordId: "42" }), null);
  const food = normalizeRemoteFood({
    name: "Mystery bar",
    barcode: "0123456789012",
    source: "mystery",
    per: { calories: 200, protein: 10, carbs: 20, fat: 8 },
  });
  assert.equal(food, null);

  const off = normalizeNutritionProvenance({
    provider: "open_food_facts",
    barcode: "0123456789012",
    sourceUrl: "https://tracker.example/food/0123456789012",
  });
  assert.equal(off.sourceUrl, "https://world.openfoodfacts.org/product/0123456789012");
});

test("provider provenance survives a confirmed barcode entry and storage normalization", () => {
  const food = normalizeRemoteFood({
    name: "Plain yogurt",
    brand: "Example",
    barcode: "0123456789012",
    servingLabel: "170 g",
    source: "open_food_facts",
    per: { calories: 120, protein: 15, carbs: 8, fat: 3 },
  });
  const entry = createFoodEntry({ slot: "breakfast", source: "barcode", food, now: new Date("2026-08-31T12:00:00Z") });
  assert.equal(entry.provenance.providerId, "open_food_facts");
  assert.equal(entry.provenance.verificationLevel, "community_label");
  assert.equal(normalizeNutritionEntry(JSON.parse(JSON.stringify(entry))).provenance.recordId, "0123456789012");
});

test("nutrition provider remains a release blocker until server-side integration is proven", () => {
  assert.equal(NUTRITION_PROVIDER_RELEASE_GATE.productionReady, false);
  assert.match(NUTRITION_PROVIDER_RELEASE_GATE.blocker, /not been verified/i);
  assert.ok(NUTRITION_PROVIDER_RELEASE_GATE.requirements.some(item => /server/i.test(item)));
});

test("teen policy disables humiliation, public sharing, calorie targets, ads, and health-data marketing", () => {
  assert.equal(ageBandFromAge(12), "under_13");
  assert.equal(ageBandFromAge(13), "teen_13_17");
  assert.equal(ageBandFromAge(17), "teen_13_17");
  assert.equal(ageBandFromAge(18), "adult_18_plus");
  const teen = capabilitiesForAgeBand("teen_13_17");
  assert.equal(teen.canUseRudeTone, false);
  assert.equal(teen.canUseCompetitiveTone, false);
  assert.equal(teen.canSetCalorieTargets, false);
  assert.equal(teen.canPostCommunityContent, false);
  assert.equal(teen.canShareProgressPhotos, false);
  assert.equal(teen.canPurchaseWithoutGuardianGate, false);
  assert.equal(teen.canReceiveTargetedAds, false);
  assert.equal(teen.canUseHealthDataForMarketing, false);
  assert.equal(teen.nutritionMode, "log_only_no_deficit_coaching");
  assert.equal(sanitizeCoachToneForAge("Rude", "teen_13_17"), "Direct");
  assert.equal(sanitizeCoachToneForAge("Competitive", "teen_13_17"), "Direct");
});

test("teen access fails closed until every consent, deletion, moderation, and review gate is live", () => {
  assert.equal(CURRENT_RELEASE_MINIMUM_AGE, 18);
  assert.match(TEEN_RELEASE_GATE.status, /blocked/);
  const blocked = teenReleaseEligibility({ ageBand: "teen_13_17", neutralAgeGate: true });
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.missing.includes("legalReviewComplete"));
  const eligible = teenReleaseEligibility({
    ageBand: "teen_13_17",
    neutralAgeGate: true,
    consentReviewComplete: true,
    deletionFlowLive: true,
    moderationLive: true,
    legalReviewComplete: true,
  });
  assert.equal(eligible.eligible, true);
  assert.equal(teenReleaseEligibility({ ageBand: "under_13" }).eligible, false);
});

test("store readiness cannot pass on placeholder or omitted implementation flags", () => {
  const blocked = evaluateStoreReleaseReadiness({ privacyPolicyUrlLive: true });
  assert.equal(blocked.ready, false);
  assert.ok(blocked.missing.includes("accountDeletionLive"));
  assert.ok(blocked.missing.includes("nutritionProviderVerified"));
  assert.ok(STORE_DISCLOSURE_REQUIREMENTS.apple.some(item => /account deletion/i.test(item)));
  assert.ok(STORE_DISCLOSURE_REQUIREMENTS.googlePlay.some(item => /Health apps/i.test(item)));
  assert.match(CURRENT_STORE_DISCLOSURES.youth, /18\+/);
});
