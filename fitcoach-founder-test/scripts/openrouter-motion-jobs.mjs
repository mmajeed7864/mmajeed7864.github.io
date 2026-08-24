#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { buildMotionGenerationPayload, getMotionGenerationJob, MOTION_GENERATION_POLICY, PENDING_MOTION_GENERATION_QUEUE } from "../v040/data/motion-generation-queue.mjs";

const args = new Set(process.argv.slice(2));
const targetId = process.argv.find((value) => value.startsWith("--exercise="))?.slice("--exercise=".length) || "";
const model = process.env.OPENROUTER_VIDEO_MODEL || "";

function printUsage() {
  console.log(`FitCoach motion jobs (dry run by default)

List pending jobs:
  node scripts/openrouter-motion-jobs.mjs --list

Preview one bounded request (no network):
  OPENROUTER_VIDEO_MODEL=<reviewed-model> node scripts/openrouter-motion-jobs.mjs --preview --exercise=<id>

Submit one job only (spends provider credits):
  OPENROUTER_API_KEY=... OPENROUTER_VIDEO_MODEL=<reviewed-model> node scripts/openrouter-motion-jobs.mjs --submit --exercise=<id>

The returned job must be downloaded, muted, checksum-recorded, and human-reviewed before it is added to the media manifest.`);
}

if (args.has("--help") || (!args.has("--list") && !args.has("--preview") && !args.has("--submit"))) {
  printUsage();
  process.exit(args.has("--help") ? 0 : 1);
}

if (args.has("--list")) {
  console.table(PENDING_MOTION_GENERATION_QUEUE.map(({ exerciseId, name, difficulty, status }) => ({ exerciseId, name, difficulty, status })));
  process.exit(0);
}

const job = getMotionGenerationJob(targetId);
if (!job) throw new Error(`Unknown or already reviewed motion target: ${targetId || "(missing --exercise)"}`);
const payload = buildMotionGenerationPayload(job, { model });

if (args.has("--preview")) {
  console.log(JSON.stringify({ endpoint: MOTION_GENERATION_POLICY.endpoint, exerciseId: job.exerciseId, payload }, null, 2));
  process.exit(0);
}

if (!args.has("--submit")) throw new Error("Use --preview or --submit");
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for --submit");

const response = await fetch(MOTION_GENERATION_POLICY.endpoint, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const body = await response.text();
if (!response.ok) throw new Error(`OpenRouter returned ${response.status}: ${body.slice(0, 500)}`);
const result = JSON.parse(body);
await writeFile(`motion-job-${job.exerciseId}.json`, `${JSON.stringify({ ...result, exerciseId: job.exerciseId, submittedAt: new Date().toISOString() }, null, 2)}\n`, { flag: "wx" });
console.log(`Submitted ${job.exerciseId}. Job metadata saved locally; no video was activated.`);
