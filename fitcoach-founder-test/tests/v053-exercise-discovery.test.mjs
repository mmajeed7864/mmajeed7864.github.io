import assert from "node:assert/strict";
import test from "node:test";

import {
  EXERCISE_PAGE_SIZE,
  RECENT_EXERCISE_LIMIT,
  buildFavoriteExerciseList,
  buildPersonalizedExerciseLists,
  buildRecentExerciseList,
  normalizeRecentExerciseIds,
  paginateExercises,
  recordExerciseView,
} from "../v040/domain/exercise-discovery.mjs";

const library = Object.freeze([
  Object.freeze({ id: "air-squat", name: "Air Squat" }),
  Object.freeze({ id: "bench-press", name: "Bench Press" }),
  Object.freeze({ id: "deadlift", name: "Deadlift" }),
  Object.freeze({ id: "row", name: "Row" }),
]);

test("recent exercise IDs are trimmed, deduplicated, capped, and never mutate the source", () => {
  const input = [" air-squat ", "bench-press", "air-squat", "", null, "deadlift", "row"];
  const snapshot = [...input];

  assert.deepEqual(normalizeRecentExerciseIds(input, { limit: 3 }), ["air-squat", "bench-press", "deadlift"]);
  assert.deepEqual(input, snapshot);
  assert.equal(RECENT_EXERCISE_LIMIT, 12);
  assert.deepEqual(normalizeRecentExerciseIds(input, { limit: 0 }), []);
  assert.deepEqual(normalizeRecentExerciseIds(null), []);
});

test("recording a view moves it to the front while retaining stable remaining order", () => {
  const recent = Object.freeze(["air-squat", "bench-press", "deadlift"]);

  assert.deepEqual(recordExerciseView(recent, "deadlift"), ["deadlift", "air-squat", "bench-press"]);
  assert.deepEqual(recordExerciseView(recent, " row ", { limit: 3 }), ["row", "air-squat", "bench-press"]);
  assert.deepEqual(recordExerciseView(recent, null), ["air-squat", "bench-press", "deadlift"]);
  assert.deepEqual(recent, ["air-squat", "bench-press", "deadlift"]);
});

test("personalized lists keep recent chronology and stable catalogue order for favorites", () => {
  const recentIds = ["deadlift", "missing", "air-squat", "deadlift"];
  const favoriteIds = ["row", "air-squat", "missing"];

  assert.deepEqual(buildRecentExerciseList(library, recentIds), [library[2], library[0]]);
  assert.deepEqual(buildFavoriteExerciseList(library, favoriteIds), [library[0], library[3]]);
  assert.deepEqual(
    buildPersonalizedExerciseLists(library, { recent: recentIds, favorites: favoriteIds }),
    { recent: [library[2], library[0]], favorites: [library[0], library[3]] },
  );
  assert.deepEqual(recentIds, ["deadlift", "missing", "air-squat", "deadlift"]);
  assert.deepEqual(favoriteIds, ["row", "air-squat", "missing"]);
});

test("personalized builders ignore malformed inputs and duplicate library IDs safely", () => {
  const duplicateLibrary = [library[0], { id: "air-squat", name: "Duplicate" }, null, library[1]];
  assert.deepEqual(buildRecentExerciseList(duplicateLibrary, ["air-squat"]), [library[0]]);
  assert.deepEqual(buildFavoriteExerciseList(duplicateLibrary, ["air-squat"]), [library[0]]);
  assert.deepEqual(buildPersonalizedExerciseLists(null, null), { recent: [], favorites: [] });
});

test("pagination returns fixed 20-item pages with bounded navigation metadata", () => {
  const exercises = Object.freeze(Array.from({ length: 45 }, (_, index) => Object.freeze({ id: `exercise-${index + 1}` })));

  const first = paginateExercises(exercises, 1);
  assert.equal(EXERCISE_PAGE_SIZE, 20);
  assert.deepEqual(first, {
    items: exercises.slice(0, 20),
    page: 1,
    pageSize: 20,
    totalItems: 45,
    totalPages: 3,
    hasNext: true,
    hasPrevious: false,
  });

  const middle = paginateExercises(exercises, 2);
  assert.deepEqual(middle.items, exercises.slice(20, 40));
  assert.equal(middle.hasNext, true);
  assert.equal(middle.hasPrevious, true);

  const boundedLast = paginateExercises(exercises, 99);
  assert.equal(boundedLast.page, 3);
  assert.deepEqual(boundedLast.items, exercises.slice(40));
  assert.equal(boundedLast.hasNext, false);
  assert.equal(boundedLast.hasPrevious, true);

  assert.equal(paginateExercises(exercises, -5).page, 1);
  assert.equal(paginateExercises(exercises, "2.9").page, 2);
  assert.deepEqual(exercises.map(item => item.id), Array.from({ length: 45 }, (_, index) => `exercise-${index + 1}`));
});

test("empty pagination remains usable and reports no pages or navigation", () => {
  assert.deepEqual(paginateExercises(null, Number.NaN), {
    items: [],
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
  });
});
