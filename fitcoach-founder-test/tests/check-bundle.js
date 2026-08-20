#!/usr/bin/env node
/**
 * FitCoach bundle integrity check.
 *
 * Why this exists: `v031-part-06.js` was committed CORRUPTED (valid JS for 432 bytes, then
 * binary garbage) in 8298f4e and shipped that way. Because these are classic scripts, the
 * browser silently dropped just that file and the app limped along on redefinitions from
 * v033-pages.js — so nothing surfaced it except reading the repo. This check makes that class
 * of failure impossible to ship again.
 *
 * It asserts:
 *   1. Every JavaScript artifact in this app tree parses and contains no corruption bytes,
 *      even when the file is not currently loaded by index.html.
 *   2. Every script index.html loads exists.
 *   3. The service-worker precache and index.html script tags agree in both directions.
 *   4. The v0.3.3 override contract loads before v033-pages.js and makes its legacy override
 *      names assignable from strict-mode code instead of relying on sloppy implicit globals.
 *   5. The v0.3.6 trainer adapter is the only active AI/voice patch, loads last, and cannot
 *      silently re-enable the retired raw-audio upload path.
 *   6. No loaded script can route FitCoach through a retired provider, endpoint, or raw-audio
 *      primitive if the final adapter fails to initialize.
 *
 * Usage: node tests/check-bundle.js     (exit 0 = pass, 1 = fail)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(DIR, file), 'utf8');
const corruptionPattern = /[\x00-\x08\x0E-\x1F\uFFFD]/g;

const failures = [];
const ok = message => console.log(`  ok    ${message}`);
const bad = message => { failures.push(message); console.log(`  FAIL  ${message}`); };

function listFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolute, relative);
    return [relative];
  });
}

const html = read('index.html');
const loaded = [...html.matchAll(/<script src="\.\/([^"?]+)(\?[^"]*)?"/g)].map(match => match[1]);
const allJavaScript = listFiles(DIR).filter(file => file.endsWith('.js')).sort();

console.log(`\nScanning ${allJavaScript.length} JavaScript artifact(s); index.html loads ${loaded.length}\n`);

// 1. Every JavaScript artifact in the app tree must parse and contain no corruption bytes.
for (const file of allJavaScript) {
  const source = read(file);
  const nonPrintable = (source.match(corruptionPattern) || []).length;

  try {
    new vm.Script(source, { filename: file });
    if (nonPrintable > 0) bad(`${file} parses but contains ${nonPrintable} non-printable byte(s) — likely corrupted`);
    else ok(`${file} parses`);
  } catch (error) {
    bad(`${file} DOES NOT PARSE: ${String(error.message).slice(0, 100)}`);
  }
}

// 2. Every loaded script must exist.
const missingLoaded = loaded.filter(file => !fs.existsSync(path.join(DIR, file)));
if (missingLoaded.length) bad(`referenced by index.html but MISSING on disk: ${missingLoaded.join(', ')}`);
else ok('every script referenced by index.html exists');

// 3. Precache versus script tags.
let serviceWorker;
try { serviceWorker = read('sw.js'); } catch { serviceWorker = null; }
if (serviceWorker) {
  const precached = [...serviceWorker.matchAll(/"\.\/([^"?]+)(\?[^"]*)?"/g)].map(match => match[1]);
  const precachedScripts = precached.filter(file => file.endsWith('.js'));
  const missingFromPrecache = loaded.filter(file => !precachedScripts.includes(file));
  const staleInPrecache = precachedScripts.filter(file => !fs.existsSync(path.join(DIR, file)));

  if (missingFromPrecache.length) bad(`loaded but NOT precached (breaks offline): ${missingFromPrecache.join(', ')}`);
  else ok('every loaded script is precached');

  if (staleInPrecache.length) bad(`precached but MISSING on disk (fails SW install): ${staleInPrecache.join(', ')}`);
  else ok('no stale entries in the precache list');
}

// 4. The legacy v0.3.3 page overrides must no longer depend on sloppy-mode implicit globals.
const contractName = 'v033-global-contract.js';
const pagesName = 'v033-pages.js';
const contractIndex = loaded.indexOf(contractName);
const pagesIndex = loaded.indexOf(pagesName);

if (contractIndex === -1) bad(`${contractName} is not loaded`);
else if (pagesIndex === -1) bad(`${pagesName} is not loaded`);
else if (contractIndex > pagesIndex) bad(`${contractName} must load before ${pagesName}`);
else ok(`${contractName} loads before ${pagesName}`);

if (contractIndex !== -1) {
  const expectedGlobals = [
    'renderToday',
    'renderTrain',
    'startWorkout',
    'renderProgress',
    'renderProfile',
    'render',
    'navigate',
    'setApiState',
    'sendChat',
    'speak',
    'startVoice',
    'stopVoiceAndSend',
    'cancelVoice'
  ];

  try {
    const context = vm.createContext({});
    new vm.Script(read(contractName), { filename: contractName }).runInContext(context);
    const strictAssignments = `"use strict";\n${expectedGlobals.map(name => `${name} = function ${name}ContractProbe() {};`).join('\n')}`;
    new vm.Script(strictAssignments, { filename: 'strict-global-contract-probe.js' }).runInContext(context);

    const missing = expectedGlobals.filter(name => typeof context[name] !== 'function');
    if (missing.length) bad(`global contract did not expose: ${missing.join(', ')}`);
    else ok('v0.3.3 override names are strict-mode assignable');
  } catch (error) {
    bad(`global override contract failed strict-mode probe: ${String(error.message).slice(0, 120)}`);
  }
}

// 5. One authoritative chat/voice patch, with no raw-audio upload in the active adapter.
const trainerName = 'v035-trainer-chat-voice.js';
const retiredVoiceName = 'v032-ai-voice.js';
const trainerIndex = loaded.indexOf(trainerName);
if (trainerIndex === -1) bad(`${trainerName} is not loaded`);
else if (trainerIndex !== loaded.length - 1) bad(`${trainerName} must be the final active script`);
else ok(`${trainerName} is the final active script`);

if (loaded.includes(retiredVoiceName)) bad(`${retiredVoiceName} is historical and must not be loaded`);
else ok(`${retiredVoiceName} is not active`);

if (trainerIndex !== -1) {
  const trainerSource = read(trainerName);
  const forbiddenActiveVoicePrimitives = [
    ['MediaRecorder', /\bMediaRecorder\b/],
    ['raw transcription endpoint', /fitcoach-transcribe/],
    ['base64 audio encoder', /blobToBase64/],
  ];
  const present = forbiddenActiveVoicePrimitives
    .filter(([, pattern]) => pattern.test(trainerSource))
    .map(([label]) => label);
  if (present.length) bad(`${trainerName} reintroduced raw-audio upload primitives: ${present.join(', ')}`);
  else ok(`${trainerName} contains no FitCoach raw-audio upload path`);

  for (const marker of [
    'synthetic_low_sensitivity',
    'DeepSeek primary',
    'Direct Qwen backup',
    'No plan auto-changes',
    'payload.safety_intercepted',
    'payload.approved_action',
  ]) {
    if (!trainerSource.includes(marker)) bad(`${trainerName} is missing contract marker: ${marker}`);
    else ok(`${trainerName} contains contract marker: ${marker}`);
  }

  for (const forbiddenProvider of ['Kimi', 'Moonshot', 'OpenRouter']) {
    if (trainerSource.includes(forbiddenProvider)) bad(`${trainerName} exposes forbidden provider: ${forbiddenProvider}`);
    else ok(`${trainerName} does not expose forbidden provider: ${forbiddenProvider}`);
  }
}

// 6. The complete loaded graph, not just the final patch, must preserve the two-provider boundary.
const loadedSource = loaded.map(file => read(file)).join('\n');
const forbiddenLoadedGraph = [
  ['Kimi', /\bkimi\b/i],
  ['Moonshot', /\bmoonshot\b/i],
  ['OpenRouter', /\bopenrouter\b/i],
  ['legacy FitCoach chat endpoint', /https:\/\/symbioai\.dev\/api\/fitcoach-chat(?:["'`]|\b(?!-v3))/i],
  ['raw transcription endpoint', /fitcoach-transcribe/i],
  ['retired speech endpoint', /fitcoach-speech/i],
  ['MediaRecorder', /\bMediaRecorder\b/],
  ['base64 audio encoder', /\bblobToBase64\b/],
];
const loadedViolations = forbiddenLoadedGraph
  .filter(([, pattern]) => pattern.test(loadedSource))
  .map(([label]) => label);
if (loadedViolations.length) bad(`loaded script graph exposes retired FitCoach paths: ${loadedViolations.join(', ')}`);
else ok('loaded script graph is DeepSeek + direct Qwen only and has no raw-audio upload path');

if (loaded.includes('v031-part-09.js')) bad('legacy raw-audio capture module must not be loaded');
else ok('legacy raw-audio capture module is not active');

console.log(`\n${failures.length ? `${failures.length} FAILURE(S)` : 'bundle integrity OK'}\n`);
process.exit(failures.length ? 1 : 0);
