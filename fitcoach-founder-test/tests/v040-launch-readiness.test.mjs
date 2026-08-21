import test from "node:test";
import assert from "node:assert/strict";

import {
  EXERCISE_EXPANSION_CATEGORIES,
  EXERCISE_EXPANSION_TARGETS,
  validateExerciseExpansionTargets,
} from "../v040/data/exercise-expansion-targets.mjs";
import {
  createFitCoachStore,
  createInitialState,
  normalizeStateForTest,
} from "../v040/core/store.mjs";
import {
  ONBOARDING_STEP_COUNT,
  renderOnboarding,
} from "../v040/ui/onboarding.mjs";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(String(key)) ? this.#values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }

  removeItem(key) {
    this.#values.delete(String(key));
  }
}

test("exercise expansion target list maps 100 quality movements without claiming live assets", () => {
  assert.equal(EXERCISE_EXPANSION_TARGETS.length, 100);
  assert.equal(new Set(EXERCISE_EXPANSION_TARGETS.map(item => item.id)).size, 100);
  assert.equal(EXERCISE_EXPANSION_CATEGORIES.length, 10);
  assert.deepEqual(EXERCISE_EXPANSION_CATEGORIES.map(item => item.count), Array(10).fill(10));
  assert.ok(EXERCISE_EXPANSION_TARGETS.every(item => item.guideStatus === "premium_motion_needed"));
  assert.ok(EXERCISE_EXPANSION_TARGETS.every(item => item.plannedGuide === "animated-start-finish-plus-cues"));
  assert.ok(EXERCISE_EXPANSION_TARGETS.some(item => item.id === "barbell-back-squat"));
  assert.ok(EXERCISE_EXPANSION_TARGETS.some(item => item.id === "lat-pulldown"));
  assert.ok(EXERCISE_EXPANSION_TARGETS.some(item => item.id === "farmer-carry"));

  const validation = validateExerciseExpansionTargets(EXERCISE_EXPANSION_TARGETS);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("expansion validator rejects duplicate ids and premature live-guide claims", () => {
  const [first] = EXERCISE_EXPANSION_TARGETS;
  const result = validateExerciseExpansionTargets([
    first,
    { ...first, name: "Duplicate Squat" },
    { ...EXERCISE_EXPANSION_TARGETS[1], guideStatus: "live" },
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes("duplicated")));
  assert.ok(result.errors.some(error => error.includes("must stay out of the live guide library")));
});

test("launch integrations and draft surfaces are explicit non-production contracts", () => {
  const state = createInitialState("mo", new Date("2026-08-20T14:00:00.000Z"));
  assert.equal(state.integrations.appleHealth.status, "native_required");
  assert.equal(state.integrations.appleHealth.syncMode, "manual_until_ios");
  assert.equal(state.integrations.payments.status, "not_configured");
  assert.equal(state.integrations.payments.trialDays, 7);
  assert.deepEqual(state.socialDrafts, []);
  assert.ok(state.gymProfile.equipment.includes("dumbbells"));
  assert.ok(state.gymProfile.equipment.includes("squat rack"));
});

test("onboarding answers use premium tap bubbles instead of native dropdowns", () => {
  const state = createInitialState("mo", new Date("2026-08-20T14:00:00.000Z"));
  const draft = { profile: state.profile, settings: state.settings, consent: true };

  for (let step = 0; step < ONBOARDING_STEP_COUNT; step += 1) {
    const html = renderOnboarding({ step, draft });
    assert.doesNotMatch(html, /<select\b/i, `step ${step + 1} must not use a dropdown`);
    assert.doesNotMatch(html, /<option\b/i, `step ${step + 1} must not use native select options`);
  }

  for (const step of [2, 3, 4, 5, 6, 8, 9, 10, 11]) {
    const html = renderOnboarding({ step, draft });
    assert.match(html, /answer-option/, `step ${step + 1} must render custom answer bubbles`);
  }
});

test("normalization keeps photo drafts as metadata only and drops corrupt drafts", () => {
  const normalized = normalizeStateForTest({
    socialDrafts: [
      {
        id: "draft-one",
        status: "published",
        visibility: "everyone",
        caption: "x".repeat(500),
        hasImagePreview: true,
        imagePersisted: true,
        imageDataUrl: "data:image/png;base64,SHOULD_NOT_SURVIVE",
      },
      { id: "empty-draft", caption: "", hasImagePreview: false },
    ],
    integrations: {
      appleHealth: { status: "connected", syncMode: "unsafe" },
      payments: { status: "live", trialDays: 999, selectedPlan: "monthly" },
    },
    gymProfile: {
      selectedGymName: "Downtown Gym",
      selectedGymAddress: "Broad location note",
      source: "location-gps",
      equipment: ["dumbbells", "dumbbells", "cables"],
    },
  });

  assert.equal(normalized.socialDrafts.length, 1);
  assert.equal(normalized.socialDrafts[0].status, "draft");
  assert.equal(normalized.socialDrafts[0].visibility, "private");
  assert.equal(normalized.socialDrafts[0].caption.length, 280);
  assert.equal(normalized.socialDrafts[0].hasImagePreview, true);
  assert.equal(normalized.socialDrafts[0].imagePersisted, false);
  assert.equal("imageDataUrl" in normalized.socialDrafts[0], false);
  assert.equal(normalized.integrations.appleHealth.status, "connected");
  assert.equal(normalized.integrations.appleHealth.syncMode, "manual_until_ios");
  assert.equal(normalized.integrations.payments.trialDays, 30);
  assert.deepEqual(normalized.gymProfile.equipment, ["dumbbells", "cables"]);
  assert.equal(normalized.gymProfile.source, "manual");
});

test("store persists launch readiness fields without storing image bytes", () => {
  const storage = new MemoryStorage();
  const store = createFitCoachStore({ storage, founder: "mo", clock: () => new Date("2026-08-20T14:00:00.000Z") });
  store.load();
  const updated = store.update(draft => {
    draft.integrations.appleHealth.status = "planned";
    draft.integrations.appleHealth.requestedAt = "2026-08-20T14:00:00.000Z";
    draft.gymProfile.selectedGymName = "Founder Gym";
    draft.gymProfile.equipment = ["dumbbells", "cables", "machines"];
    draft.socialDrafts.push({
      id: "local-draft-one",
      status: "draft",
      visibility: "founders",
      caption: "Local progress post",
      hasImagePreview: true,
      imagePersisted: false,
      imageDataUrl: "data:image/jpeg;base64,NOT_ALLOWED",
      createdAt: "2026-08-20T14:00:00.000Z",
    });
  });

  assert.equal(updated.integrations.appleHealth.status, "planned");
  assert.equal(updated.gymProfile.selectedGymName, "Founder Gym");
  assert.equal(updated.socialDrafts[0].hasImagePreview, true);
  assert.equal("imageDataUrl" in updated.socialDrafts[0], false);
  assert.doesNotMatch(JSON.stringify(updated), /data:image|NOT_ALLOWED/);
});
