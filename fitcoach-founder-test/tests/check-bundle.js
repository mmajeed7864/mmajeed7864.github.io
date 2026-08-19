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
 * It asserts three things:
 *   1. Every script index.html loads actually parses.
 *   2. The service-worker precache list and index.html's script tags agree — a precached file
 *      that 404s fails the whole SW install, and a loaded file that is not precached breaks
 *      offline.
 *   3. No file is loaded that does not exist on disk.
 *
 * Usage: node tests/check-bundle.js     (exit 0 = pass, 1 = fail)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

let failures = [];
const ok = m => console.log(`  ok    ${m}`);
const bad = m => { failures.push(m); console.log(`  FAIL  ${m}`); };

const html = read('index.html');
const loaded = [...html.matchAll(/<script src="\.\/([^"?]+)(\?[^"]*)?"/g)].map(m => m[1]);
console.log(`\nindex.html loads ${loaded.length} script(s)\n`);

// 1. every loaded script exists and parses
for (const f of loaded) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) { bad(`${f} is referenced by index.html but MISSING on disk`); continue; }
  const src = fs.readFileSync(p, 'utf8');
  // catch the exact corruption signature too: unexpected control/replacement bytes
  const nonPrintable = (src.match(/[\x00-\x08\x0E-\x1F�]/g) || []).length;
  try {
    new vm.Script(src, { filename: f });
    if (nonPrintable > 0) bad(`${f} parses but contains ${nonPrintable} non-printable byte(s) — likely corrupted`);
    else ok(`${f} parses`);
  } catch (e) {
    bad(`${f} DOES NOT PARSE: ${String(e.message).slice(0, 90)}`);
  }
}

// 2. precache vs script tags
let sw;
try { sw = read('sw.js'); } catch { sw = null; }
if (sw) {
  const pre = [...sw.matchAll(/"\.\/([^"?]+)(\?[^"]*)?"/g)].map(m => m[1]);
  const preJs = pre.filter(f => f.endsWith('.js'));
  const missingFromPre = loaded.filter(f => !preJs.includes(f));
  const staleInPre = preJs.filter(f => !fs.existsSync(path.join(DIR, f)));
  if (missingFromPre.length) bad(`loaded but NOT precached (breaks offline): ${missingFromPre.join(', ')}`);
  else ok('every loaded script is precached');
  if (staleInPre.length) bad(`precached but MISSING on disk (fails SW install): ${staleInPre.join(', ')}`);
  else ok('no stale entries in the precache list');
}

console.log(`\n${failures.length ? `${failures.length} FAILURE(S)` : 'bundle integrity OK'}\n`);
process.exit(failures.length ? 1 : 0);
