import { EXERCISES } from "./exercise-library.mjs";

const HARD_DIFFICULTIES = new Set(["intermediate", "advanced"]);

export function hasReviewedMotionGuide(exercise) {
  return Boolean(exercise?.media?.some?.((media) =>
    ["mp4", "webm"].includes(media.type)
    && media.hasAudio === false
    && media.motionReviewStatus === "approved"
    && media.offlineCachePolicy === "never"
  ));
}

const hardGymExercises = EXERCISES.filter((exercise) =>
  exercise.location?.includes("gym") && HARD_DIFFICULTIES.has(exercise.difficulty)
);

export const HARD_GYM_MOTION_TARGETS = Object.freeze(hardGymExercises.map((exercise) => exercise.id));
export const REVIEWED_HARD_GYM_MOTION_IDS = Object.freeze(
  hardGymExercises.filter(hasReviewedMotionGuide).map((exercise) => exercise.id),
);
export const PENDING_HARD_GYM_MOTION_IDS = Object.freeze(
  hardGymExercises.filter((exercise) => !hasReviewedMotionGuide(exercise)).map((exercise) => exercise.id),
);

export const MOTION_GUIDE_COVERAGE = Object.freeze({
  totalExercises: EXERCISES.length,
  hardGymTargets: HARD_GYM_MOTION_TARGETS.length,
  reviewedHardGymGuides: REVIEWED_HARD_GYM_MOTION_IDS.length,
  pendingHardGymGuides: PENDING_HARD_GYM_MOTION_IDS.length,
});

export function validateMotionGuideCoverage(exercises = EXERCISES) {
  const errors = [];
  for (const exercise of exercises) {
    const motion = exercise.media?.filter?.((media) => ["mp4", "webm"].includes(media.type)) || [];
    if (motion.length > 1) errors.push(`${exercise.id} declares more than one motion asset`);
    for (const media of motion) {
      if (media.hasAudio !== false) errors.push(`${exercise.id} motion must be silent`);
      if (media.motionReviewStatus !== "approved") errors.push(`${exercise.id} motion must be reviewed before activation`);
      if (media.offlineCachePolicy !== "never") errors.push(`${exercise.id} motion must stream directly instead of caching partial responses`);
      if (!String(media.path || "").includes("/assets/exercises/motion/")) errors.push(`${exercise.id} motion must remain local`);
    }
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
