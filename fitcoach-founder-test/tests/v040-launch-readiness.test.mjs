import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
import { renderCoachScreen } from "../v040/ui/coach-screen.mjs";
import { renderModal } from "../v040/ui/modal.mjs";
import { renderProfileScreen } from "../v040/ui/profile-screen.mjs";
import { renderProgressScreen } from "../v040/ui/progress-screen.mjs";
import { renderTodayScreen } from "../v040/ui/home-screen.mjs";
import { renderTrainScreen } from "../v040/ui/train-screen.mjs";
import { EXERCISES } from "../v040/data/exercise-library.mjs";

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

test("premium surface uses the approved blue system rather than the retired teal palette", () => {
  const css = readFileSync(new URL("../v040/premium-redesign.css", import.meta.url), "utf8");
  assert.match(css, /--primary:\s*#2f6bff/i);
  assert.match(css, /linear-gradient\(145deg, #22438f, #0e1118/i);
  assert.doesNotMatch(css, /--primary:\s*#08796f/i);
  assert.doesNotMatch(css, /#0a746c|#0b756d|#07575b/i);
});

test("body-focus onboarding inherits the blue product surface in every theme", () => {
  const css = readFileSync(new URL("../v040/premium-redesign.css", import.meta.url), "utf8");
  const start = css.indexOf(".ai-setup-screen:has(.body-focus-step) {");
  const end = css.indexOf("@media (max-width: 430px)", start);
  const focusSurface = css.slice(start, end);

  assert.ok(start >= 0 && end > start, "body-focus surface styles must remain explicit");
  assert.match(focusSurface, /linear-gradient\(180deg, var\(--bg\), var\(--bg-soft\)\)/u);
  assert.match(focusSurface, /color:\s*var\(--text\)/u);
  assert.match(focusSurface, /background:\s*linear-gradient\(180deg, var\(--action\), var\(--action-2\)\)/u);
  assert.doesNotMatch(focusSurface, /#0b0c0f|rgba\(11,\s*12,\s*15/u);
  assert.match(css, /\.ai-setup-screen:has\(\.body-focus-step\) main \{ padding-bottom: calc\(128px \+ var\(--safe-bottom\)\); \}/u);
});

test("focused exercise motion keeps its native geometry and one deliberate control", () => {
  const css = readFileSync(new URL("../v040/premium-redesign.css", import.meta.url), "utf8");
  const playerStart = css.lastIndexOf("/* Focused exercise details: one header, native video proportions, one control. */");
  const playerStyles = css.slice(playerStart);
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");

  assert.ok(playerStart >= 0, "the focused exercise player styles must remain explicit");
  assert.match(playerStyles, /aspect-ratio:\s*var\(--motion-aspect, 16 \/ 9\)/u);
  assert.match(playerStyles, /object-fit:\s*contain/u);
  assert.match(playerStyles, /pointer-events:\s*none/u);
  assert.match(playerStyles, /\.exercise-detail-page \.exercise-detail-visual \.media-play-hint \{ display: none; \}/u);
  assert.match(playerStyles, /\.exercise-detail-page \.exercise-detail-visual \.exercise-motion\.media-paused:not\(\.media-error\) \.media-play-hint/u);
  assert.doesNotMatch(playerStyles, /aspect-ratio:\s*1\s*\/\s*1/u);
  assert.match(app, /const exerciseDetailFullscreen = ui\.route === "train" && Boolean\(ui\.exerciseDetailId\);/u);
  assert.match(app, /dom\.nav\.hidden = focusedSurface;/u);
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
  const draft = { profile: state.profile, settings: state.settings, gymProfile: state.gymProfile, consent: true };

  for (let step = 0; step < ONBOARDING_STEP_COUNT; step += 1) {
    const html = renderOnboarding({ step, draft });
    assert.doesNotMatch(html, /<select\b/i, `step ${step + 1} must not use a dropdown`);
    assert.doesNotMatch(html, /<option\b/i, `step ${step + 1} must not use native select options`);
  }

  for (const step of [0, 1, 2, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16]) {
    const html = renderOnboarding({ step, draft });
    assert.match(html, /answer-option/, `step ${step + 1} must render custom answer bubbles`);
  }
  const ageGate = renderOnboarding({ step: 0, draft });
  assert.match(ageGate, /Which age range are you in\?/u);
  assert.match(ageGate, /Adult preview only/u);
  assert.match(renderOnboarding({ step: 3, draft }), /body-focus-chip/u);
  assert.match(renderOnboarding({ step: 3, draft }), /body-focus-map/u);
  assert.match(renderOnboarding({ step: 10, draft }), /onboarding-gym-name/u);
  assert.match(renderOnboarding({ step: 11, draft }), /equipment-scan-option/u);
});

test("body-focus onboarding exposes one clear visual state and a stateful action", () => {
  const state = createInitialState("mo", new Date("2026-08-20T14:00:00.000Z"));
  const targetedDraft = {
    profile: { ...state.profile, focusAreas: ["arms", "abs"] },
    settings: state.settings,
    gymProfile: state.gymProfile,
    consent: true,
  };
  const targeted = renderOnboarding({ step: 3, draft: targetedDraft });

  assert.match(targeted, /body-focus-selection-panel/u);
  assert.match(targeted, /body-focus-balance-chip/u);
  assert.match(targeted, /2 of 3 selected/u);
  assert.match(targeted, /Continue with 2 areas/u);
  assert.match(targeted, /data-value="arms"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-value="arms"/u);

  const balanced = renderOnboarding({
    step: 3,
    draft: { ...targetedDraft, profile: { ...state.profile, focusAreas: ["full body"] } },
  });
  assert.match(balanced, /Balanced full-body plan/u);
  assert.match(balanced, /Use balanced plan/u);
  assert.match(balanced, /body-focus-balance-chip active/u);
});

test("exercise discovery uses compact scroll rails with an accessible favorites control", () => {
  const state = createInitialState("mo", new Date("2026-08-20T14:00:00.000Z"));
  const html = renderTrainScreen({
    state,
    filteredExercises: EXERCISES,
    ui: {
      trainSegment: "exercises",
      exerciseDetailId: null,
      showActiveWorkout: false,
      exerciseFilters: { query: "squat", muscle: "quadriceps", equipment: "barbell", favorites: true },
    },
  });

  assert.equal((html.match(/class="filter-rail"/gu) || []).length, 2);
  assert.equal((html.match(/class="filter-scroll" role="group"/gu) || []).length, 2);
  assert.match(html, /class="favorite-filter active"/u);
  assert.match(html, /id="exercise-favorites" class="sr-only" type="checkbox" data-action="filter-favorites" aria-label="Show favorite exercises only" checked/u);
  assert.match(html, /data-action="clear-exercise-search"/u);
  assert.match(html, /data-action="clear-exercise-filters"/u);
  assert.match(html, /aria-pressed="true"/u);
  assert.doesNotMatch(html, /<select\b|<option\b/iu);
});

test("default and expanded Profile setup use premium radio choices without native dropdowns", () => {
  const state = createInitialState("mo", new Date("2026-08-20T14:00:00.000Z"));
  const views = {
    default: renderProfileScreen({ state, ui: {} }),
    training: renderProfileScreen({ state, ui: { profileEditing: "training" } }),
    coach: renderProfileScreen({ state, ui: { profileEditing: "coach" } }),
  };

  for (const [name, html] of Object.entries(views)) {
    assert.doesNotMatch(html, /<select\b/i, `${name} Profile must not use a dropdown`);
    assert.doesNotMatch(html, /<option\b/i, `${name} Profile must not use native select options`);
  }

  assert.equal((views.training.match(/<section class="profile-plan-field"/gu) || []).length, 7);
  assert.equal((views.training.match(/class="profile-plan-options" role="radiogroup"/gu) || []).length, 7);
  assert.match(views.training, /data-action="profile-field" data-field="goal" data-value="build muscle"/u);
  assert.match(views.training, /data-action="profile-number" data-field="duration" data-value="45"/u);
  assert.match(views.training, /data-action="setting-field" data-field="units" data-value="lb"/u);
  assert.match(views.training, /role="radio" aria-checked="true"/u);
});

test("progress-post visibility uses premium choices instead of a dropdown", () => {
  const state = createInitialState("mo", new Date("2026-08-20T14:00:00.000Z"));
  const html = renderModal(
    { type: "community-draft", visibility: "private", caption: "" },
    { state, communityPreviewUrl: null },
  );

  assert.doesNotMatch(html, /<select\b|<option\b/iu);
  assert.equal((html.match(/data-action="community-visibility"/gu) || []).length, 3);
  assert.match(html, /role="radiogroup" aria-label="Draft visibility"/u);
  assert.match(html, /role="radio" aria-checked="true"/u);
});

test("Progress exposes a private photo timeline without claiming public publishing", () => {
  const state = createInitialState("mo", new Date("2026-08-20T14:00:00.000Z"));
  const html = renderProgressScreen({ state, now: new Date("2026-08-20T14:00:00.000Z"), communityPreviews: new Map() });
  assert.match(html, /PROGRESS STUDIO/u);
  assert.match(html, /Add progress photo/u);
  assert.match(html, /Photo previews stay in this session/u);
  assert.doesNotMatch(html, /Publish now|Post publicly/u);
});

test("a profile with no training history never gets a zero-of-target score", () => {
  const now = new Date("2026-08-20T14:00:00.000Z");
  const state = createInitialState("mo", new Date("2026-08-01T14:00:00.000Z"));
  const exercise = {
    id: "air-squat",
    name: "Air Squat",
    media: [],
  };
  const plan = {
    id: "plan-a",
    minutes: 45,
    detail: "full session",
    label: "Plan A",
    location: "gym",
    intensity: "standard",
    exercises: [{ exerciseId: exercise.id, snapshot: { primaryMuscles: ["quadriceps"] } }],
  };
  const decision = {
    title: "Start with one honest session",
    message: "Today establishes the baseline.",
    type: "CHECK_IN",
    primary: { label: "Start Plan A" },
    secondary: null,
  };

  const html = renderTodayScreen({ state, plan, decision, exerciseById: () => exercise, now });
  assert.match(html, /Your week starts here/u);
  assert.match(html, /3 planned/u);
  assert.doesNotMatch(html, /0(?:<[^>]*>)*\/3|0 of 3/u);
});

test("the opening week state stays welcoming even when older history exists", () => {
  const now = new Date("2026-08-20T14:00:00.000Z");
  const state = createInitialState("mo", new Date("2026-07-01T14:00:00.000Z"));
  state.sessions = [{ id: "older-session", completedAt: "2026-07-10T14:00:00.000Z", exercises: [] }];
  const plan = {
    id: "plan-a", minutes: 45, detail: "full session", label: "Plan A", location: "gym", intensity: "standard",
    exercises: [{ exerciseId: "air-squat", snapshot: { primaryMuscles: ["quadriceps"] } }],
  };
  const decision = {
    title: "Start with one honest session", message: "Today starts this week.", type: "CHECK_IN",
    primary: { label: "Start Plan A" }, secondary: null,
  };
  const exercise = { id: "air-squat", name: "Air Squat", media: [] };

  const html = renderTodayScreen({ state, plan, decision, exerciseById: () => exercise, now });
  assert.match(html, /Your week starts here/u);
  assert.doesNotMatch(html, /0(?:<[^>]*>)*\/3|0 of 3/u);
});

test("active app has no password gate or visible founder picker", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  const onboarding = readFileSync(new URL("../v040/ui/onboarding.mjs", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  for (const source of [app, onboarding, html]) {
    assert.doesNotMatch(source, /renderGate|Founder access code|founder-code|enter-gate|choose-founder|type="password"/i);
  }

  assert.match(html, /FitCoach v0\.6\.2/u);
});

test("premium shell keeps five focused tabs and moves Profile into the header", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const labels = [...html.matchAll(/<span>(Today|Train|Coach|Food|Progress|Profile)<\/span>/gu)].map(match => match[1]);

  assert.deepEqual(labels, ["Today", "Train", "Coach", "Food", "Progress"]);
  assert.doesNotMatch(html, /data-route="profile"/u);
  assert.match(readFileSync(new URL("../v040/app.js", import.meta.url), "utf8"), /data-action="route" data-value="profile"/u);
});

test("first-day Progress, Coach, and Profile avoid prototype-facing UI", () => {
  const now = new Date("2026-08-20T14:00:00.000Z");
  const state = createInitialState("mo", now);
  const decision = { title: "Start with one honest session", message: "Build the first baseline." };
  const ui = { chatBusy: false, chatDraft: "", pendingMessage: "", chatNotice: null, speakingMessageId: null };
  const coach = renderCoachScreen({ state, decision, ui, coachConnection: { label: "Coach status", state: "unverified" } });
  const progress = renderProgressScreen({ state, now });
  const profile = renderProfileScreen({ state, ui: {} });
  const visibleProfileText = profile.replace(/<[^>]*>/gu, " ");

  assert.doesNotMatch(coach, /<select\b|DeepSeek|Qwen|browser online|coach unverified|deterministic action/iu);
  assert.match(coach, /Talk naturally\. Hear the answer\./u);
  assert.match(progress, /Your baseline starts with one session\./u);
  assert.match(progress, /Your first three progress milestones/u);
  assert.doesNotMatch(progress, /0\/3|weekly target<\/small>/u);
  assert.doesNotMatch(profile, /<select\b/iu);
  assert.doesNotMatch(visibleProfileText, /roadmap|founder|DeepSeek|Qwen/iu);
  assert.match(profile, /Help and local data/u);
});

test("unverified coach status never claims readiness", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");

  assert.match(app, /return \{ label: "Coach status", state: "unverified" \}/u);
  assert.match(app, /return \{ label: "Checking coach", state: "busy" \}/u);
  assert.doesNotMatch(app, /Coach ready/u);
  assert.doesNotMatch(app, /Live coaching is ready/u);
  assert.match(app, /Live coach status has not been confirmed yet/u);
});

test("the CSP-safe boot script owns service-worker upgrades and modules refresh network-first", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const boot = readFileSync(new URL("../v040/boot.js", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

  assert.match(html, /<script src="\.\/v040\/boot\.js\?v=0602"><\/script>/u);
  assert.match(boot, /serviceWorker\.register\("\.\/sw\.js\?v=0602", \{ updateViaCache: "none" \}\)/u);
  assert.doesNotMatch(app, /serviceWorker\.register/u);
  assert.match(worker, /async function networkOrCached/u);
  assert.match(worker, /fetch\(request, \{ cache: "no-store" \}\)/u);
  assert.match(worker, /if \(versioned \|\| moduleAsset\) \{\s*event\.respondWith\(networkOrCached/u);
  assert.match(worker, /motionVideo = exerciseAsset && url\.pathname\.endsWith\("\.mp4"\)/u);
});

test("Voice Room takes focus when its dialog opens", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  assert.match(app, /previousVoiceAction/u);
  assert.match(app, /data-action=\\?"voice-consent/u);
  assert.match(app, /focus\(\{ preventScroll: true \}\)/u);
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
    draft.gymProfile.selectedGymName = "Preview Gym";
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
  assert.equal(updated.gymProfile.selectedGymName, "Preview Gym");
  assert.equal(updated.socialDrafts[0].hasImagePreview, true);
  assert.equal("imageDataUrl" in updated.socialDrafts[0], false);
  assert.doesNotMatch(JSON.stringify(updated), /data:image|NOT_ALLOWED/);
});
