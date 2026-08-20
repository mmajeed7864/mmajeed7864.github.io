import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import {
  MOVEMENT_PATTERNS,
  validateExerciseLibrary,
  validateExerciseMediaManifest,
} from "../v040/data/exercise-schema.mjs";
import {
  EXERCISES,
  filterExercises,
  getExerciseById,
} from "../v040/data/exercise-library.mjs";
import { EXERCISE_MEDIA_MANIFEST } from "../v040/data/exercise-media-manifest.mjs";

const APP_ROOT = fileURLToPath(new URL("../", import.meta.url));
const COMPETITOR_OR_REMOTE_PATTERN = /https?:\/\/|fitbod|fitness[ -]?online/i;

function localAssetPath(media) {
  const appRelativePath = media.path.replace(/^\/fitcoach-founder-test\//, "");
  return path.join(APP_ROOT, appRelativePath);
}

test("starter library has 16 stable, immutable exercise records", () => {
  assert.equal(EXERCISES.length, 16);
  assert.equal(new Set(EXERCISES.map((item) => item.id)).size, 16);
  assert.ok(Object.isFrozen(EXERCISES));
  assert.ok(EXERCISES.every((item) => Object.isFrozen(item) && Object.isFrozen(item.setupSteps)));
  assert.equal(getExerciseById("air-squat")?.name, "Air Squat");
  assert.equal(getExerciseById("missing-exercise"), null);
});

test("starter library covers every declared movement pattern", () => {
  const representedPatterns = new Set(EXERCISES.map((item) => item.movementPattern));
  assert.deepEqual([...representedPatterns].sort(), [...MOVEMENT_PATTERNS].sort());
});

test("exercise schema and internal references validate", () => {
  const result = validateExerciseLibrary(EXERCISES, EXERCISE_MEDIA_MANIFEST);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.deepEqual(result.errors, []);
});

test("media/license manifest validates and maps one local asset per exercise", () => {
  const result = validateExerciseMediaManifest(EXERCISE_MEDIA_MANIFEST);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(EXERCISE_MEDIA_MANIFEST.length, EXERCISES.length);
  assert.equal(new Set(EXERCISE_MEDIA_MANIFEST.map((entry) => entry.exerciseId)).size, EXERCISES.length);
  assert.ok(EXERCISE_MEDIA_MANIFEST.every((entry) => entry.temporaryOriginal === true));
  assert.ok(EXERCISE_MEDIA_MANIFEST.every((entry) => entry.attributionRequired === false));
  assert.ok(EXERCISE_MEDIA_MANIFEST.every((entry) => entry.license.includes("project-authored original")));
});

test("every active exercise guide uses the approved premium illustration system", () => {
  assert.ok(EXERCISE_MEDIA_MANIFEST.every((entry) => entry.type === "png-two-position-guide"));
  assert.ok(EXERCISE_MEDIA_MANIFEST.every((entry) => entry.path.endsWith("-premium-v1.png")));
  assert.ok(EXERCISE_MEDIA_MANIFEST.every((entry) => entry.width === 1448 && entry.height === 1086));
});

test("every declared exercise guide exists and its size and SHA-256 match the manifest", async () => {
  for (const media of EXERCISE_MEDIA_MANIFEST) {
    const assetPath = localAssetPath(media);
    const [fileStats, contents] = await Promise.all([stat(assetPath), readFile(assetPath)]);
    assert.equal(fileStats.size, media.bytes, `${media.id} byte count drifted`);
    assert.equal(createHash("sha256").update(contents).digest("hex"), media.sha256, `${media.id} checksum drifted`);
  }
});

test("local exercise guides have valid inert formats without remote links", async () => {
  for (const media of EXERCISE_MEDIA_MANIFEST) {
    const contents = await readFile(localAssetPath(media));
    if (media.type === "svg-two-position-guide") {
      const svg = contents.toString("utf8");
      assert.match(svg, /<title\s+id="title">/i, `${media.id} needs a title`);
      assert.match(svg, /<desc\s+id="desc">/i, `${media.id} needs a description`);
      assert.match(svg, /role="img"/i, `${media.id} needs an image role`);
      const withoutStandardSvgNamespace = svg.replace("http://www.w3.org/2000/svg", "");
      assert.doesNotMatch(withoutStandardSvgNamespace, /<script\b|\bon(?:load|click|error)\s*=|\bhref\s*=|https?:\/\//i, `${media.id} must remain inert and local`);
    } else {
      assert.equal(contents.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${media.id} must be a valid PNG`);
    }
  }
});

test("search and filters are deterministic and match aliases and facets", () => {
  assert.deepEqual(filterExercises({ query: "BODYWEIGHT SQUAT" }).map((item) => item.id), ["air-squat"]);
  assert.deepEqual(filterExercises({ movementPattern: "hinge" }).map((item) => item.id), ["hip-hinge", "glute-bridge"]);
  assert.deepEqual(filterExercises({ primaryMuscle: "lats", equipment: "resistance band" }).map((item) => item.id), ["band-row", "band-lat-pulldown"]);
  assert.equal(filterExercises({ location: "outdoors" }).length, 6);
  assert.deepEqual(filterExercises({ difficulty: "intermediate" }).map((item) => item.id), ["half-kneeling-press", "overhead-triceps-extension"]);
});

test("validators reject a competitor hotlink and a missing media reference", () => {
  const hotlinked = [{ ...EXERCISE_MEDIA_MANIFEST[0], path: "https://fitbod.example/exercise.svg" }];
  const hotlinkResult = validateExerciseMediaManifest(hotlinked);
  assert.equal(hotlinkResult.valid, false);
  assert.ok(hotlinkResult.errors.some((error) => error.includes("local FitCoach")));

  const brokenExercise = { ...EXERCISES[0], media: [{ ...EXERCISES[0].media[0], id: "missing-poster" }] };
  const brokenResult = validateExerciseLibrary([brokenExercise, ...EXERCISES.slice(1)], EXERCISE_MEDIA_MANIFEST);
  assert.equal(brokenResult.valid, false);
  assert.ok(brokenResult.errors.some((error) => error.includes("missing-poster")));

  const serializedDomain = JSON.stringify({ exercises: EXERCISES, media: EXERCISE_MEDIA_MANIFEST });
  assert.doesNotMatch(serializedDomain, COMPETITOR_OR_REMOTE_PATTERN);
});
