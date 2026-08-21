#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const APP_ROOT = path.resolve(__dirname, "..");
const GENERATION = "0410";
const corruptionPattern = /[\x00-\x08\x0E-\x1F\uFFFD]/g;
const failures = [];

const read = file => fs.readFileSync(path.join(APP_ROOT, file), "utf8");
const exists = file => fs.existsSync(path.join(APP_ROOT, file));
const ok = message => console.log(`  ok    ${message}`);
const bad = message => { failures.push(message); console.log(`  FAIL  ${message}`); };

function normalizeRelative(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier.split("?")[0]));
}

function staticImports(file) {
  const source = read(file);
  const matches = [
    ...source.matchAll(/import\s+(?:[^"'()]+?\s+from\s+)?["']([^"']+)["']/g),
    ...source.matchAll(/export\s+[^"'()]+?\s+from\s+["']([^"']+)["']/g),
  ];
  return matches.map(match => normalizeRelative(file, match[1])).filter(Boolean);
}

function moduleGraph(entry) {
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!exists(file)) return;
    for (const child of staticImports(file)) visit(child);
  };
  visit(entry);
  return [...seen].sort();
}

function swAssets(source) {
  return [...source.matchAll(/["'](\.\/[^"']+\?v=0410|\.[^"']+)["']/g)]
    .map(match => match[1].replace(/^\.\//, "").replace(/\?v=0410$/, ""))
    .filter(value => value && !value.includes("${"));
}

function syntaxCheck(file) {
  try {
    execFileSync(process.execPath, ["--check", path.join(APP_ROOT, file)], { stdio: "pipe" });
    ok(`${file} syntax-checks`);
  } catch (error) {
    bad(`${file} does not syntax-check: ${String(error.stderr || error.message).slice(0, 180)}`);
  }
}

(async () => {
  const html = read("index.html");
  const moduleMatch = html.match(/<script\s+type=["']module["']\s+src=["']\.\/([^"']+app\.js)\?v=0410["']/);
  if (!moduleMatch) bad("index.html must load ./v040/app.js?v=0410 as a module");
  else ok("index.html loads the v0.4 module entry");

  const entry = moduleMatch?.[1] || "v040/app.js";
  const graph = moduleGraph(entry);
  const missing = graph.filter(file => !exists(file));
  if (missing.length) bad(`module graph has missing imports: ${missing.join(", ")}`);
  else ok(`module graph resolves ${graph.length} file(s)`);

  for (const file of graph) syntaxCheck(file);

  const corrupted = graph.filter(file => (read(file).match(corruptionPattern) || []).length);
  if (corrupted.length) bad(`module graph contains corruption bytes: ${corrupted.join(", ")}`);
  else ok("module graph contains no corruption bytes");

  if (!exists("v040/styles.css") || read("v040/styles.css").trim().length < 1_000) bad("v040/styles.css must exist and be nonempty");
  else ok("v040/styles.css exists and is nonempty");

  const manifest = JSON.parse(read("manifest.webmanifest"));
  const constants = read("v040/core/constants.mjs");
  const sw = read("sw.js");
  if (!html.includes(`v=${GENERATION}`) || !manifest.start_url.includes(`v=${GENERATION}`) || !sw.includes(`v${GENERATION}`) || !constants.includes(`CACHE_GENERATION = "${GENERATION}"`)) {
    bad("index, manifest, service worker, and constants must agree on 0410");
  } else ok("document, manifest, service worker, and constants agree on 0410");

  const precached = new Set(swAssets(sw));
  const graphMissingFromSw = graph.filter(file => !precached.has(file));
  if (graphMissingFromSw.length) bad(`service worker missing module graph file(s): ${graphMissingFromSw.join(", ")}`);
  else ok("service-worker required graph contains complete module graph");

  if (!precached.has("v040/styles.css")) bad("service worker must precache v040/styles.css");
  else ok("service worker precaches v040/styles.css");

  const { EXERCISE_MEDIA_MANIFEST } = await import(pathToFileURL(path.join(APP_ROOT, "v040/data/exercise-media-manifest.mjs")).href);
  if (EXERCISE_MEDIA_MANIFEST.length !== 16) bad("media manifest must contain sixteen local exercise guides");
  for (const media of EXERCISE_MEDIA_MANIFEST) {
    const file = media.path.replace(/^\/fitcoach-founder-test\//, "");
    if (!exists(file)) bad(`missing exercise media file: ${file}`);
    if (!precached.has(file)) bad(`service worker does not precache exercise media: ${file}`);
    if (media.type !== "png-two-position-guide" || !file.endsWith("-premium-v1.png")) {
      bad(`${media.id} must use an approved premium two-position PNG`);
    }
  }
  if (!failures.some(value => value.includes("exercise media") || value.includes("local guide") || value.includes("premium two-position"))) ok("all sixteen premium exercise guides exist and are precached");

  const activeSource = graph.map(read).join("\n");
  const forbiddenActive = [
    ["MediaRecorder", /\bMediaRecorder\b/],
    ["raw transcription route", /fitcoach-transcribe/i],
    ["raw audio encoder", /\bblobToBase64\b|\bAudioContext\b.*\bencode/i],
    ["retired speech route", /fitcoach-speech(?!-v2)/i],
    ["Kimi", /\bkimi\b/i],
    ["Moonshot", /\bmoonshot\b/i],
    ["OpenRouter", /\bopenrouter\b/i],
    ["legacy FitCoach chat endpoint", /\/api\/fitcoach-chat(?:["'`]|\b(?!-v3))/i],
  ];
  const activeViolations = forbiddenActive.filter(([, pattern]) => pattern.test(activeSource)).map(([label]) => label);
  if (activeViolations.length) bad(`active module graph exposes forbidden path(s): ${activeViolations.join(", ")}`);
  else ok("active graph has no raw-audio, retired endpoint, Kimi, Moonshot, or OpenRouter path");

  if (!activeSource.includes("/api/fitcoach-chat-v3")) bad("active graph must use only /api/fitcoach-chat-v3");
  else ok("active graph uses /api/fitcoach-chat-v3");

  if (!activeSource.includes("/api/fitcoach-speech-v2")) bad("active graph must use only /api/fitcoach-speech-v2 for premium spoken replies");
  else ok("active graph uses /api/fitcoach-speech-v2 with no microphone-audio upload path");

  if (/v03[0-9]|v031|v032|v033|v034|v035/.test(html)) bad("index.html must not load historical v0.3 files");
  else ok("index.html does not load historical v0.3 files");

  const providerClient = read("v040/services/trainer-client.mjs");
  const authorityHits = [/approvePlanProposal/, /activePlan\s*=/, /pendingPlanProposal\s*=/, /memories\s*\.push/, /draft\.memories/].filter(pattern => pattern.test(providerClient));
  if (authorityHits.length) bad("provider client contains plan/memory mutation authority");
  else ok("provider client cannot apply plans, write memory, or choose actions");

  const remoteMedia = JSON.stringify(EXERCISE_MEDIA_MANIFEST).match(/https?:\/\/|fitbod|myfitnesspal|freeletics|nike|runna/i);
  if (remoteMedia) bad("exercise media manifest contains competitor or remote hotlink");
  else ok("exercise media manifest contains no competitor-domain hotlinks");

  console.log(`\n${failures.length ? `${failures.length} FAILURE(S)` : "bundle integrity OK"}\n`);
  process.exit(failures.length ? 1 : 0);
})();
