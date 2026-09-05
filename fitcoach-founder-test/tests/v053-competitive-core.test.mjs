import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createInitialState, normalizeStateForTest } from "../v040/core/store.mjs";
import { detectPerformanceRecords } from "../v040/domain/workouts.mjs";
import { renderModal } from "../v040/ui/modal.mjs";
import { renderProgressScreen } from "../v040/ui/progress-screen.mjs";

function completedExercise({ id = "barbell-back-squat", name = "Barbell Back Squat", weight, reps, unit = "lb" }) {
  return {
    exerciseId: id,
    snapshot: { id, name, primaryMuscles: ["quadriceps"], equipment: ["barbell"] },
    units: unit,
    sets: [{ done: true, weight, reps, unit, rpe: 8, completedAt: "2026-08-31T12:00:00.000Z" }],
  };
}

function session(exercise, unit = "lb") {
  return { completedAt: "2026-08-31T12:00:00.000Z", units: unit, exercises: [exercise] };
}

test("first weighted performance is a baseline, not a fake PR", () => {
  const current = session(completedExercise({ weight: 135, reps: 8 }));
  const receipt = detectPerformanceRecords([], current, "lb");
  assert.equal(receipt.personalRecords.length, 0);
  assert.equal(receipt.baselines.length, 1);
  assert.equal(receipt.baselines[0].kind, "baseline");
});

test("a stronger later performance becomes a verified candidate PR across units", () => {
  const previous = session(completedExercise({ weight: 100, reps: 5, unit: "kg" }), "kg");
  const current = session(completedExercise({ weight: 245, reps: 5, unit: "lb" }), "lb");
  const receipt = detectPerformanceRecords([previous], current, "lb");
  assert.equal(receipt.personalRecords.length, 1);
  assert.equal(receipt.baselines.length, 0);
  assert.ok(receipt.personalRecords[0].value > receipt.personalRecords[0].previousValue);
});

test("invalid and bodyweight-only sets do not fabricate load records", () => {
  const current = session({
    ...completedExercise({ weight: 0, reps: 12 }),
    sets: [
      { done: true, weight: 0, reps: 12, unit: "lb" },
      { done: true, weight: 100, reps: 0, unit: "lb" },
    ],
  });
  const receipt = detectPerformanceRecords([], current, "lb");
  assert.deepEqual(receipt, { personalRecords: [], baselines: [] });
});

test("Progress rejects the same high-rep false precision as PR receipts", () => {
  const state = createInitialState("mo");
  state.sessions = [session(completedExercise({ weight: 100, reps: 40 }))];
  const html = renderProgressScreen({ state, now: new Date("2026-08-31T13:00:00.000Z") });
  assert.match(html, /No defensible estimate/u);
  assert.doesNotMatch(html, /233(?:\.33)?<small>est\. 1RM/u);
});

test("store persists Sunday as day zero and caps recent exercise history", () => {
  const raw = createInitialState("mo");
  raw.profile.preferredDays = [0, 1, 3];
  raw.exercisePreferences.recent = Array.from({ length: 30 }, (_, index) => `exercise-${index}`);
  const normalized = normalizeStateForTest(raw, "mo");
  assert.deepEqual(normalized.profile.preferredDays, [0, 1, 3]);
  assert.equal(normalized.exercisePreferences.recent.length, 20);
});

test("legacy Sunday day seven migrates to day zero without changing weekdays", () => {
  const raw = createInitialState("mo");
  raw.profile.preferredDays = [1, 3, 7, 0, null, "", false, "not-a-day"];
  const normalized = normalizeStateForTest(raw, "mo");
  assert.deepEqual(normalized.profile.preferredDays, [1, 3, 0]);
});

test("competitive discovery, evidence, and strength modules are available offline", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(sw, /domain\/exercise-discovery\.mjs/u);
  assert.match(sw, /domain\/evidence\.mjs/u);
  assert.match(sw, /domain\/strength-tools\.mjs/u);
  assert.match(sw, /\.\.\.ANATOMY_ASSETS/u);
  assert.match(sw, /event\.waitUntil\(cacheWrite\)/u);
  assert.match(sw, /const MEDIA_CACHE = "fitcoach-exercise-images-v0700"/u);
  assert.match(sw, /const MAX_MEDIA_ENTRIES = 12/u);
  assert.match(sw, /if \(exerciseImage\)[\s\S]*?cacheName: MEDIA_CACHE,[\s\S]*?maximumEntries: MAX_MEDIA_ENTRIES/u);
  assert.match(sw, /const brandAsset = url\.pathname\.includes\("\/v040\/assets\/brand\/"\)/u);
  assert.match(sw, /if \(anatomyAsset \|\| brandAsset \|\| fontAsset \|\| legalAsset\)[\s\S]*?cachedOrFetch\(event\.request, event\)/u);
});

test("exercise pagination and food reuse remain explicit user actions", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  const train = readFileSync(new URL("../v040/ui/train-screen.mjs", import.meta.url), "utf8");
  const nutrition = readFileSync(new URL("../v040/ui/nutrition-screen.mjs", import.meta.url), "utf8");
  const premiumStyles = readFileSync(new URL("../v040/premium-redesign.css", import.meta.url), "utf8");
  assert.match(train, /paginateExercises\(exercises, filters\.page\)/u);
  assert.match(train, /Recently viewed/u);
  assert.match(train, /aria-live="polite"/u);
  assert.ok(train.indexOf('${strengthSetupHelper(exercise, current') < train.indexOf('<section class="set-logger card">'));
  assert.match(premiumStyles, /\.workout-finish-bar\s*\{[^}]*position:\s*static/su);
  assert.match(premiumStyles, /\.exercise-library-view \.exercise-grid\s*\{[^}]*repeat\(2,/su);
  assert.match(premiumStyles, /\.filter-scroll \.filter-chip\s*\{[^}]*min-height:\s*44px/su);
  assert.match(premiumStyles, /\.nutrition-page \.nutrition-dash\s*\{[^}]*grid-template-columns:\s*112px minmax\(0, 1fr\)/su);
  assert.match(premiumStyles, /@media \(max-width: 360px\)[\s\S]*?\.nutrition-page \.nutrition-hero-actions\s*\{[^}]*grid-template-columns:\s*1\.2fr 1fr/su);
  assert.match(premiumStyles, /@media \(max-width: 360px\)[\s\S]*?\.nutrition-page \.quick-foods\s*\{[^}]*padding-bottom:\s*10px/su);
  assert.match(app, /nutrition-quick-food/u);
  assert.match(nutrition, /Review, then add/u);
  assert.doesNotMatch(app, /nutrition-quick-food[^\n]+addEntryToDay/u);
});

test("completion receipt distinguishes a verified PR from a first-log baseline", () => {
  const state = createInitialState("mo");
  state.lastWorkoutSummary = {
    durationMinutes: 42,
    completedExercises: 1,
    completedSets: 3,
    totalVolume: 3240,
    personalRecords: [{ exerciseId: "barbell-back-squat", exerciseName: "Barbell Back Squat", metric: "estimated_1rm", kind: "personal_record", value: 171, previousValue: 165, weight: 135, reps: 8, unit: "lb" }],
    baselines: [],
  };
  const pr = renderModal({ type: "completion" }, { state });
  assert.match(pr, /NEW PERSONAL BEST/u);
  assert.match(pr, /135lb × 8/u);
  state.lastWorkoutSummary.personalRecords = [];
  state.lastWorkoutSummary.baselines = [{ exerciseId: "barbell-back-squat", exerciseName: "Barbell Back Squat", metric: "estimated_1rm", kind: "baseline", value: 171, previousValue: null, weight: 135, reps: 8, unit: "lb" }];
  const baseline = renderModal({ type: "completion" }, { state });
  assert.match(baseline, /BASELINE CAPTURED/u);
  assert.match(baseline, /not a fake PR/u);
});

test("device reset copy accurately warns that all FitCoach profiles are removed", () => {
  const state = createInitialState("mo");
  const html = renderModal({ type: "confirm-reset" }, { state });
  assert.match(html, /Reset all FitCoach data on this device/u);
  assert.match(html, /every FitCoach profile/u);
  assert.match(html, /Other websites and apps are not affected/u);
  assert.doesNotMatch(html, /from this local profile/u);
});

test("device reset invalidates async coach work and session-only image previews", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  assert.match(app, /chatRequestController !== requestController \|\| requestController\.signal\.aborted/u);
  assert.match(app, /pendingChat\?\.abort\("fitcoach_thread_closed"\)/u);
  assert.match(app, /trainerClient\.resetSession\?\.\(\)/u);
  assert.match(app, /releaseSavedCommunityPreviews\(\)/u);
  assert.match(app, /ui\.exerciseFilters = \{ query: "", muscle: "", equipment: "", favorites: false, page: 1 \}/u);
  assert.match(app, /ui\.replacementIndex = null/u);
  assert.match(app, /voiceSessionCode = freshRuntimeSessionCode\("voice"\)/u);
  assert.match(app, /nutritionSessionCode = freshRuntimeSessionCode\("nutrition"\)/u);
  assert.match(app, /pendingNutrition\?\.abort\("fitcoach_reset"\)/u);
  assert.match(app, /async function resetFitCoachAccountAndDevice\(\)/u);
  assert.match(app, /await accountClient\.clearSession\(\)/u);
  assert.match(app, /secure_session_clear_failed/u);
  assert.match(app, /catch \(error\) \{[\s\S]*?ui\.account\.error = accountErrorCopy\(error\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?resetRuntimeEffects\(\);/u);
  assert.doesNotMatch(app, /accountClient\.clearSession\(\); \} catch \{\}/u);
  assert.match(app, /ui\.account\.session = null/u);
  assert.match(app, /ui\.account\.entitlement = null/u);
  assert.doesNotMatch(app, /fitcoach-\$\{ui\.founder\}-(?:voice|nutrition)-v040/u);
  assert.match(app, /confirm-clear-chat[^\n]+invalidateCoachActivity\(\{rotateSession:true\}\)/u);
  assert.match(app, /Back online\. Live Coach will be checked with your next message\./u);
  assert.doesNotMatch(app, /Back online\. Live Coach is available\./u);
});
