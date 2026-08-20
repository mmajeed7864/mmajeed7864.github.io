/**
 * FitCoach v0.4 exercise-domain contract.
 *
 * This module deliberately has no DOM, storage, or provider dependency. It is
 * shared by the browser runtime and the repository validation tests.
 */

export const EXERCISE_SCHEMA_VERSION = 1;

export const MOVEMENT_PATTERNS = Object.freeze([
  "squat",
  "hinge",
  "horizontal-push",
  "horizontal-pull",
  "vertical-push",
  "vertical-pull",
  "lunge",
  "curl",
  "triceps-extension",
  "lateral-raise",
  "core",
  "cardio-warm-up",
]);

export const DIFFICULTIES = Object.freeze(["beginner", "intermediate"]);
export const LOCATIONS = Object.freeze(["home", "gym", "outdoors"]);
export const MEDIA_TYPES = Object.freeze([
  "poster",
  "image-sequence",
  "gif",
  "webm",
  "mp4",
  "lottie",
  "svg-two-position-guide",
  "png-two-position-guide",
]);
export const CACHE_POLICIES = Object.freeze(["precache", "runtime", "never"]);

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OWNED_MEDIA_PREFIX = "/fitcoach-founder-test/v040/assets/exercises/";

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isNonEmptyStringArray = (value) =>
  Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);

/** @param {unknown} value */
export function isExerciseId(value) {
  return isNonEmptyString(value) && ID_PATTERN.test(value);
}

/**
 * Validate an exercise media/license manifest without reading the filesystem.
 * Filesystem existence and checksums are verified by the repository test.
 *
 * @param {unknown} entries
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateExerciseMediaManifest(entries) {
  const errors = [];
  if (!Array.isArray(entries) || entries.length === 0) {
    return { valid: false, errors: ["Media manifest must be a non-empty array."] };
  }

  const ids = new Set();
  const exerciseIds = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = `media[${index}]`;
    if (!entry || typeof entry !== "object") {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (!isExerciseId(entry.id)) errors.push(`${label}.id is invalid.`);
    if (ids.has(entry.id)) errors.push(`${label}.id duplicates ${entry.id}.`);
    ids.add(entry.id);
    if (!isExerciseId(entry.exerciseId)) errors.push(`${label}.exerciseId is invalid.`);
    if (exerciseIds.has(entry.exerciseId)) {
      errors.push(`${label}.exerciseId duplicates ${entry.exerciseId}.`);
    }
    exerciseIds.add(entry.exerciseId);
    if (!MEDIA_TYPES.includes(entry.type)) errors.push(`${label}.type is unsupported.`);
    if (!isNonEmptyString(entry.path) || !entry.path.startsWith(OWNED_MEDIA_PREFIX)) {
      errors.push(`${label}.path must be a local FitCoach v0.4 exercise asset.`);
    }
    if (/^https?:\/\//i.test(entry.path || "")) errors.push(`${label}.path must not hotlink.`);
    if (!Number.isInteger(entry.width) || entry.width <= 0) errors.push(`${label}.width is invalid.`);
    if (!Number.isInteger(entry.height) || entry.height <= 0) errors.push(`${label}.height is invalid.`);
    if (!isNonEmptyString(entry.view)) errors.push(`${label}.view is required.`);
    if (!CACHE_POLICIES.includes(entry.offlineCachePolicy)) {
      errors.push(`${label}.offlineCachePolicy is unsupported.`);
    }
    if (!isNonEmptyString(entry.license)) errors.push(`${label}.license is required.`);
    if (!isNonEmptyString(entry.licenseSource)) errors.push(`${label}.licenseSource is required.`);
    if (typeof entry.attributionRequired !== "boolean") {
      errors.push(`${label}.attributionRequired must be boolean.`);
    }
    if (entry.attributionRequired && !isNonEmptyString(entry.attribution)) {
      errors.push(`${label}.attribution is required by its license.`);
    }
    if (!isNonEmptyString(entry.creationSource)) errors.push(`${label}.creationSource is required.`);
    if (entry.temporaryOriginal !== true) {
      errors.push(`${label}.temporaryOriginal must truthfully identify this starter asset.`);
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 || "")) errors.push(`${label}.sha256 is invalid.`);
    if (!Number.isInteger(entry.bytes) || entry.bytes <= 0) errors.push(`${label}.bytes is invalid.`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * @param {unknown} exercises
 * @param {unknown} mediaEntries
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateExerciseLibrary(exercises, mediaEntries) {
  const errors = [];
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return { valid: false, errors: ["Exercise library must be a non-empty array."] };
  }

  const ids = new Set();
  const mediaIds = new Set(Array.isArray(mediaEntries) ? mediaEntries.map((entry) => entry.id) : []);
  const requiredStringArrays = [
    "aliases",
    "equipment",
    "location",
    "primaryMuscles",
    "secondaryMuscles",
    "setupSteps",
    "executionSteps",
    "keyCues",
    "commonMistakes",
    "safetyNotes",
    "alternatives",
    "progressions",
    "regressions",
  ];

  for (const [index, exercise] of exercises.entries()) {
    const label = `exercise[${index}]`;
    if (!exercise || typeof exercise !== "object") {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (!isExerciseId(exercise.id)) errors.push(`${label}.id is invalid.`);
    if (ids.has(exercise.id)) errors.push(`${label}.id duplicates ${exercise.id}.`);
    ids.add(exercise.id);
    if (!isNonEmptyString(exercise.name)) errors.push(`${label}.name is required.`);
    if (!MOVEMENT_PATTERNS.includes(exercise.movementPattern)) {
      errors.push(`${label}.movementPattern is unsupported.`);
    }
    if (!DIFFICULTIES.includes(exercise.difficulty)) errors.push(`${label}.difficulty is unsupported.`);
    if (!isNonEmptyString(exercise.instructions)) errors.push(`${label}.instructions is required.`);
    if (!isNonEmptyString(exercise.breathing)) errors.push(`${label}.breathing is required.`);
    if (!isNonEmptyString(exercise.license)) errors.push(`${label}.license is required.`);
    if (!Object.hasOwn(exercise, "attribution")) errors.push(`${label}.attribution must be explicit.`);
    for (const field of requiredStringArrays) {
      if (!isNonEmptyStringArray(exercise[field])) errors.push(`${label}.${field} must be non-empty.`);
    }
    if (!exercise.location?.every((location) => LOCATIONS.includes(location))) {
      errors.push(`${label}.location includes an unsupported value.`);
    }
    if (!Array.isArray(exercise.media) || exercise.media.length === 0) {
      errors.push(`${label}.media must include at least one asset reference.`);
    } else {
      for (const mediaReference of exercise.media) {
        const assetId = typeof mediaReference === "string" ? mediaReference : mediaReference?.id;
        if (!mediaIds.has(assetId)) errors.push(`${label}.media references missing asset ${assetId}.`);
        if (mediaReference && typeof mediaReference === "object" && mediaReference.exerciseId !== exercise.id) {
          errors.push(`${label}.media contains an asset assigned to another exercise.`);
        }
      }
    }
    if (!Array.isArray(exercise.equipmentSubstitutions) || exercise.equipmentSubstitutions.length === 0) {
      errors.push(`${label}.equipmentSubstitutions must be non-empty.`);
    } else {
      for (const substitution of exercise.equipmentSubstitutions) {
        if (
          !substitution ||
          !isNonEmptyString(substitution.insteadOf) ||
          !isNonEmptyString(substitution.use) ||
          !isNonEmptyString(substitution.adjustment)
        ) {
          errors.push(`${label}.equipmentSubstitutions contains an invalid entry.`);
        }
      }
    }
  }

  for (const [index, exercise] of exercises.entries()) {
    for (const alternativeId of exercise.alternatives || []) {
      if (!ids.has(alternativeId)) {
        errors.push(`exercise[${index}].alternatives references missing exercise ${alternativeId}.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
