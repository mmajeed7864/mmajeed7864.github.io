#!/usr/bin/env node
/**
 * Bounded founder-only motion pilot.
 *
 * This downloads generated clips into motion-generated/, which is deliberately
 * outside the exercise manifest and service-worker graph. A clip is not live
 * until it passes media validation and a human review promotes it.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { buildMotionGenerationPayload, getMotionGenerationJob, PENDING_MOTION_GENERATION_QUEUE, MOTION_GENERATION_POLICY } from "../v040/data/motion-generation-queue.mjs";

const apiKey = process.env.OPENROUTER_API_KEY || "";
const model = process.env.OPENROUTER_VIDEO_MODEL || "";
const limit = Number(process.argv.find((value) => value.startsWith("--limit="))?.slice(8) || PENDING_MOTION_GENERATION_QUEUE.length);
const only = process.argv.find((value) => value.startsWith("--exercise="))?.slice(11) || "";
const outputDir = new URL("../v040/assets/exercises/motion-generated/", import.meta.url);

if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");
if (!model) throw new Error("OPENROUTER_VIDEO_MODEL is required");
if (!Number.isInteger(limit) || limit < 1 || limit > PENDING_MOTION_GENERATION_QUEUE.length) throw new Error("--limit must be a positive queue-sized integer");
await mkdir(outputDir, { recursive: true });

const queue = only ? [getMotionGenerationJob(only)].filter(Boolean) : PENDING_MOTION_GENERATION_QUEUE.slice(0, limit);
const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

async function waitForVideo(pollingUrl) {
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const body = await jsonRequest(pollingUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (body.status === "completed") return body;
    if (body.status === "failed" || body.status === "cancelled") throw new Error(`generation ${body.status}`);
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  throw new Error("generation timed out after 150 seconds");
}

for (const job of queue) {
  const outputPath = new URL(`${job.exerciseId}.mp4`, outputDir);
  if (existsSync(outputPath)) {
    console.log(`SKIP ${job.exerciseId} (already downloaded)`);
    continue;
  }
  const payload = buildMotionGenerationPayload(job, { model });
  console.log(`SUBMIT ${job.exerciseId}`);
  const submitted = await jsonRequest(MOTION_GENERATION_POLICY.endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
  const finished = await waitForVideo(submitted.polling_url || `${MOTION_GENERATION_POLICY.endpoint}/${submitted.id}`);
  const contentUrl = finished.unsigned_urls?.[0];
  if (!contentUrl) throw new Error(`no content URL for ${job.exerciseId}`);
  const content = await fetch(contentUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!content.ok) throw new Error(`content ${content.status} for ${job.exerciseId}`);
  const bytes = Buffer.from(await content.arrayBuffer());
  await writeFile(outputPath, bytes, { flag: "wx", mode: 0o644 });
  await writeFile(new URL(`${job.exerciseId}.json`, outputDir), `${JSON.stringify({ exerciseId: job.exerciseId, model, duration: payload.duration, resolution: payload.resolution, aspectRatio: payload.aspect_ratio, jobId: submitted.id, generationId: finished.generation_id, usage: finished.usage || null }, null, 2)}\n`, { flag: "wx", mode: 0o644 });
  console.log(`DONE ${job.exerciseId} ${bytes.length} bytes cost=${finished.usage?.cost ?? "unknown"}`);
}
