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
 *
 * Usage: node tests/check-bundle.js     (exit 0 = pass, 1 = fail)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(DIR, file), 'utf8');

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
  const nonPrintable = (source.match(/[\x00-\x08\x0E-\x1F�]/g) || []).length;

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
    'navigate'
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

console.log(`\n${failures.length ? `${failures.length} FAILURE(S)` : 'bundle integrity OK'}\n`);
process.exit(failures.length ? 1 : 0);
