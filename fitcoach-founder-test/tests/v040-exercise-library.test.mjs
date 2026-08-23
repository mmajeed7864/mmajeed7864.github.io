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
import { exerciseMotionGuide, exerciseMotionMedia, muscleMap } from "../v040/ui/components.mjs";

const APP_ROOT = fileURLToPath(new URL("../", import.meta.url));
const COMPETITOR_OR_REMOTE_PATTERN = /https?:\/\/|fitbod|fitness[ -]?online/i;

function localAssetPath(media) {
  const appRelativePath = media.path.replace(/^\/fitcoach-founder-test\//, "");
  return path.join(APP_ROOT, appRelativePath);
}

test("library has 100 stable, immutable exercise records with honest guide status", () => {
  assert.equal(EXERCISES.length, 100);
  assert.equal(new Set(EXERCISES.map((item) => item.id)).size, 100);
  assert.ok(Object.isFrozen(EXERCISES));
  assert.ok(EXERCISES.every((item) => Object.isFrozen(item) && Object.isFrozen(item.setupSteps)));
  assert.equal(getExerciseById("air-squat")?.name, "Air Squat");
  assert.equal(getExerciseById("barbell-back-squat")?.guideStatus, "visual-guide");
  assert.equal(EXERCISES.filter((item) => item.guideStatus === "visual-guide").length, 33);
  assert.equal(EXERCISES.filter((item) => item.guideStatus === "written-guide").length, 67);
  assert.ok(EXERCISES.every((item) => item.location.includes("gym")));
  assert.equal(getExerciseById("missing-exercise"), null);
});

test("all 100 exercises expose a local muscle map without remote tutorial links", () => {
  for (const exercise of EXERCISES) {
    const map = muscleMap(exercise);
    assert.match(map, /class="muscle-map"/u);
    assert.match(map, /Primary/u);
    assert.match(map, /Secondary/u);
  }
  assert.doesNotMatch(JSON.stringify(EXERCISES), /youtube|youtu\.be|https?:\/\//iu);
});

test("motion guides use local muted looping playback with a poster fallback", () => {
  const exercise = {
    ...EXERCISES[0],
    media: [
      ...EXERCISES[0].media,
      { type: "mp4", path: "/fitcoach-founder-test/v040/assets/exercises/motion/air-squat-motion-v1.mp4", width: 720, height: 720, durationSeconds: 8, hasAudio: false, motionReviewStatus: "approved", alt: "Air squat motion guide." },
    ],
  };
  assert.equal(exerciseMotionMedia(exercise)?.type, "mp4");
  const playing = exerciseMotionGuide(exercise, { eager: true });
  assert.match(playing, /<video/u);
  assert.match(playing, /muted loop playsinline autoplay/u);
  assert.match(playing, /poster="\/fitcoach-founder-test\/v040\/assets\/exercises\/air-squat-premium-v1\.png"/u);
  assert.doesNotMatch(exerciseMotionGuide(exercise, { paused: true }), / autoplay/u);
  assert.match(exerciseMotionGuide(EXERCISES[0]), /<figure class="exercise-poster/u);
  const unreviewed = { ...exercise, media: exercise.media.map(entry => entry.type === "mp4" ? { ...entry, motionReviewStatus: "pending" } : entry) };
  assert.equal(exerciseMotionMedia(unreviewed), null);
});

test("a reviewed production exercise renders its real motion asset muted and inline", () => {
  const exercise = getExerciseById("barbell-back-squat");
  const motion = exerciseMotionMedia(exercise);
  assert.equal(motion?.path, "/fitcoach-founder-test/v040/assets/exercises/motion/barbell-back-squat-motion-v1.mp4");
  assert.equal(motion?.hasAudio, false);
  assert.equal(motion?.motionReviewStatus, "approved");
  const guide = exerciseMotionGuide(exercise, { eager: true });
  assert.match(guide, /<video/u);
  assert.match(guide, /muted loop playsinline autoplay/u);
  assert.match(guide, /data-action="toggle-exercise-motion"/u);
});

test("library covers every declared movement pattern", () => {
  const representedPatterns = new Set(EXERCISES.map((item) => item.movementPattern));
  assert.deepEqual([...representedPatterns].sort(), [...MOVEMENT_PATTERNS].sort());
});

test("exercise schema and internal references validate", () => {
  const result = validateExerciseLibrary(EXERCISES, EXERCISE_MEDIA_MANIFEST);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.deepEqual(result.errors, []);
});

test("media/license manifest validates and every visual guide has local media", () => {
  const result = validateExerciseMediaManifest(EXERCISE_MEDIA_MANIFEST);
  assert.equal(result.valid, true, result.errors.join("\n"));
  const visualGuides = EXERCISES.filter((item) => item.guideStatus === "visual-guide");
  assert.equal(new Set(EXERCISE_MEDIA_MANIFEST.map((entry) => entry.exerciseId)).size, visualGuides.length);
  assert.ok(EXERCISE_MEDIA_MANIFEST.every((entry) => entry.temporaryOriginal === true));
  assert.ok(EXERCISE_MEDIA_MANIFEST.every((entry) => entry.attributionRequired === false));
  assert.ok(EXERCISE_MEDIA_MANIFEST.every((entry) => entry.license.includes("project-authored original")));
});

test("every visual exercise guide uses the approved premium illustration system", () => {
  const illustrations = EXERCISE_MEDIA_MANIFEST.filter((entry) => entry.type === "png-two-position-guide");
  assert.equal(illustrations.length, 17);
  assert.ok(illustrations.every((entry) => entry.path.endsWith("-premium-v1.png")));
  assert.ok(illustrations.every((entry) => entry.width === 1448 && entry.height === 1086));
});

test("the reviewed motion pilot uses muted local runtime-cached MP4 guides", () => {
  const motions = EXERCISE_MEDIA_MANIFEST.filter((entry) => entry.type === "mp4");
  assert.equal(motions.length, 20);
  assert.ok(motions.every((entry) => entry.path.includes("/assets/exercises/motion/")));
  assert.ok(motions.every((entry) => entry.path.endsWith("-motion-v1.mp4")));
  assert.ok(motions.every((entry) => entry.hasAudio === false));
  assert.ok(motions.every((entry) => entry.motionReviewStatus === "approved"));
  assert.ok(motions.every((entry) => entry.offlineCachePolicy === "runtime"));
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
    } else if (media.type === "png-two-position-guide" || media.type === "poster") {
      assert.equal(contents.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${media.id} must be a valid PNG`);
    } else if (media.type === "mp4") {
      assert.equal(contents.subarray(4, 8).toString("ascii"), "ftyp", `${media.id} must be a valid MP4`);
    } else if (media.type === "webm") {
      assert.equal(contents.subarray(0, 4).toString("hex"), "1a45dfa3", `${media.id} must be a valid WebM`);
    }
  }
});

test("search and filters are deterministic and match aliases and facets", () => {
  assert.deepEqual(filterExercises({ query: "BODYWEIGHT SQUAT" }).map((item) => item.id), ["air-squat"]);
  assert.ok(filterExercises({ movementPattern: "hinge" }).map((item) => item.id).includes("conventional-deadlift"));
  assert.ok(filterExercises({ movementPattern: "hinge" }).map((item) => item.id).includes("hip-hinge"));
  assert.deepEqual(filterExercises({ primaryMuscle: "lats", equipment: "resistance band" }).map((item) => item.id), ["band-row", "band-lat-pulldown"]);
  assert.equal(filterExercises({ location: "outdoors" }).length, 6);
  assert.ok(filterExercises({ difficulty: "intermediate" }).some((item) => item.id === "half-kneeling-press"));
  assert.ok(filterExercises({ equipment: "cable" }).some((item) => item.id === "lat-pulldown"));
  assert.ok(filterExercises({ equipment: "dumbbell" }).some((item) => item.id === "dumbbell-bench-press"));
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

test("media validator permits one poster plus one motion file and rejects duplicate types", () => {
  const poster = EXERCISE_MEDIA_MANIFEST[0];
  const motion = {
    ...poster,
    id: "air-squat-motion",
    type: "mp4",
    path: "/fitcoach-founder-test/v040/assets/exercises/motion/air-squat-motion-v1.mp4",
    durationSeconds: 8,
    hasAudio: false,
    motionReviewStatus: "approved",
  };
  assert.equal(validateExerciseMediaManifest([poster, motion]).valid, true);
  const duplicate = { ...motion, id: "air-squat-motion-two" };
  const result = validateExerciseMediaManifest([poster, motion, duplicate]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("duplicates mp4 media")));
  const unsafeAudio = validateExerciseMediaManifest([{ ...motion, hasAudio: true }]);
  assert.equal(unsafeAudio.valid, false);
  assert.ok(unsafeAudio.errors.some((error) => error.includes("hasAudio must be false")));
});
