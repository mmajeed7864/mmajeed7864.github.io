import { EXERCISE_EXPANSION_TARGETS } from "./exercise-expansion-targets.mjs";
import { EXERCISES } from "./exercise-library.mjs";
import { PENDING_HARD_GYM_MOTION_IDS } from "./motion-guide-coverage.mjs";

const pendingIds = new Set(PENDING_HARD_GYM_MOTION_IDS);
const targetById = new Map(EXERCISE_EXPANSION_TARGETS.map((target) => [target.id, target]));
const exerciseById = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

export const MOTION_GENERATION_POLICY = Object.freeze({
  provider: "openrouter-video-api",
  endpoint: "https://openrouter.ai/api/v1/videos",
  output: "silent-local-mp4",
  defaultDurationSeconds: 6,
  defaultResolution: "720p",
  defaultAspectRatio: "1:1",
  reviewRequiredBeforeActivation: true,
  appLoadsGeneratedJobs: false,
});

function makePrompt(target) {
  return [
    `Create a clean, premium exercise demonstration for ${target.name}.`,
    `Show one adult athlete performing one controlled repetition with ${target.equipment.join(" or ")}.`,
    "Use a fixed camera and a centered full-body three-quarter view on a simple navy studio background with restrained electric-blue accents.",
    "Show the start position, the controlled movement, and the return to start in one seamless loop.",
    "No spoken words, no music, no text, no logos, no watermark, no extra people, no camera movement, no anatomical exaggeration, and no claim of live form analysis.",
  ].join(" ");
}

export const PENDING_MOTION_GENERATION_QUEUE = Object.freeze(
  PENDING_HARD_GYM_MOTION_IDS
    .filter((id) => pendingIds.has(id) && exerciseById.has(id))
    .map((id) => {
      const target = targetById.get(id);
      const exercise = exerciseById.get(id);
      return Object.freeze({
      exerciseId: id,
      name: target?.name || exercise.name,
      difficulty: target?.difficulty || exercise.difficulty,
      equipment: Object.freeze([...(target?.equipment || exercise.equipment)]),
      status: "needs-generation-and-review",
      prompt: makePrompt({ name: target?.name || exercise.name, equipment: target?.equipment || exercise.equipment }),
      });
    }),
);

export function getMotionGenerationJob(exerciseId) {
  return PENDING_MOTION_GENERATION_QUEUE.find((job) => job.exerciseId === exerciseId) || null;
}

export function buildMotionGenerationPayload(job, { model } = {}) {
  if (!job || job.status !== "needs-generation-and-review") throw new Error("Only pending motion jobs can be submitted");
  if (typeof model !== "string" || !model.trim() || model.length > 120) throw new Error("A reviewed OpenRouter video model is required");
  return Object.freeze({
    model: model.trim(),
    prompt: job.prompt,
    duration: MOTION_GENERATION_POLICY.defaultDurationSeconds,
    resolution: MOTION_GENERATION_POLICY.defaultResolution,
    aspect_ratio: MOTION_GENERATION_POLICY.defaultAspectRatio,
    generate_audio: false,
  });
}
