import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  STANDARD_PLATE_INVENTORY,
  buildWarmupRamp,
  calculatePlateLoading,
  estimateOneRepMax,
} from "../v040/domain/strength-tools.mjs";
import { renderStrengthSetupHelper } from "../v040/ui/train-screen.mjs";

test("standard pound loading returns exact plates per side", () => {
  const loading = calculatePlateLoading(225, "lb");
  assert.deepEqual(loading, {
    unit: "lb",
    targetWeight: 225,
    barWeight: 45,
    perSide: [{ weight: 45, count: 2 }],
    totalPlates: 4,
    loadedWeight: 225,
    exact: true,
    possible: true,
    difference: 0,
    remainder: 0,
    direction: "exact",
    reason: null,
  });
});

test("standard kilogram loading chooses the fewest exact plates", () => {
  const loading = calculatePlateLoading(100, "kg");
  assert.equal(loading.exact, true);
  assert.equal(loading.loadedWeight, 100);
  assert.deepEqual(loading.perSide, [
    { weight: 25, count: 1 },
    { weight: 15, count: 1 },
  ]);
  assert.equal(loading.totalPlates, 4);
});

test("unloadable targets expose the nearest lower load and remainder", () => {
  const loading = calculatePlateLoading(137, "lb");
  assert.equal(loading.exact, false);
  assert.equal(loading.possible, false);
  assert.equal(loading.loadedWeight, 135);
  assert.equal(loading.difference, -2);
  assert.equal(loading.remainder, 2);
  assert.equal(loading.direction, "under");
  assert.equal(loading.reason, "not-loadable");
});

test("a target below the bar reports the physical minimum clearly", () => {
  const loading = calculatePlateLoading(30, "lb");
  assert.equal(loading.loadedWeight, 45);
  assert.equal(loading.remainder, 15);
  assert.equal(loading.direction, "over");
  assert.equal(loading.reason, "below-bar");
  assert.deepEqual(loading.perSide, []);
});

test("custom bar and inventory are supported without mutating defaults", () => {
  const before = [...STANDARD_PLATE_INVENTORY.kg.plates];
  const loading = calculatePlateLoading(55, "kg", { barWeight: 15, plates: [10, 5, 2.5] });
  assert.equal(loading.loadedWeight, 55);
  assert.deepEqual(loading.perSide, [{ weight: 10, count: 2 }]);
  assert.deepEqual(STANDARD_PLATE_INVENTORY.kg.plates, before);
});

test("invalid and zero plate targets return no guidance", () => {
  for (const value of [0, -1, "", "not-a-number", Infinity, null, undefined]) {
    assert.equal(calculatePlateLoading(value, "lb"), null);
  }
  assert.equal(calculatePlateLoading(135, "stone"), null);
  assert.equal(calculatePlateLoading(135, "lb", { plates: [] }), null);
});

test("warm-up ramp is loadable, increasing, deduplicated, and below working weight", () => {
  const ramp = buildWarmupRamp(135, "lb");
  assert.deepEqual(ramp.map(item => item.weight), [45, 65, 90, 110]);
  assert.deepEqual(ramp.map(item => item.reps), [10, 8, 5, 3]);
  assert.ok(ramp.every(item => item.loading.exact));
  assert.ok(ramp.every(item => item.weight < 135));
  assert.equal(new Set(ramp.map(item => item.weight)).size, ramp.length);
});

test("warm-up ramp returns no guidance for invalid or non-rampable loads", () => {
  assert.deepEqual(buildWarmupRamp(0, "lb"), []);
  assert.deepEqual(buildWarmupRamp("bad", "lb"), []);
  assert.deepEqual(buildWarmupRamp(45, "lb"), []);
  assert.deepEqual(buildWarmupRamp(20, "kg"), []);
  assert.deepEqual(buildWarmupRamp(100, "stone"), []);
});

test("estimated one-rep max uses Epley while rejecting false precision", () => {
  assert.equal(estimateOneRepMax(100, 1), 100);
  assert.equal(estimateOneRepMax(100, 10), 133.33);
  assert.equal(estimateOneRepMax("80", 5), 93.33);
  assert.equal(estimateOneRepMax(100, 31), null);
  assert.equal(estimateOneRepMax(100, 10.5), null);
  assert.equal(estimateOneRepMax(0, 5), null);
  assert.equal(estimateOneRepMax(100, 6, { maxReps: 5 }), null);
});

test("bar setup receipt reflects the latest committed working weight", () => {
  const exercise = { equipment: ["barbell"] };
  const current = {
    target: { suggestedWeight: 135 },
    sets: [{ done: false, weight: 135 }],
  };
  const before = renderStrengthSetupHelper(exercise, current, "lb");
  current.sets[0].weight = 225;
  const after = renderStrengthSetupHelper(exercise, current, "lb");

  assert.match(before, /data-strength-working-weight="135"/u);
  assert.match(before, /Load 135lb exactly/u);
  assert.match(after, /data-strength-working-weight="225"/u);
  assert.match(after, /Load 225lb exactly/u);
  assert.doesNotMatch(after, /Load 135lb exactly/u);
});

test("committed weight edits rerender the active bar setup receipt", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  assert.match(app, /action === "set-field" && target\.dataset\.field === "weight"[\s\S]*?updateSetField\(target\);[\s\S]*?render\(\);[\s\S]*?return;/u);
});
