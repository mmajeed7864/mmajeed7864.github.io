import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const trainingCss = readFileSync(new URL("../v040/ui/train-v070.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("weekly schedule owns a single shrinkable title column on phone widths", () => {
  assert.match(trainingCss, /\.training-schedule \.schedule-grid \{[^}]*grid-template-columns: minmax\(0,1fr\)/u);
  assert.match(trainingCss, /\.training-schedule \.schedule-card header \{[^}]*grid-template-columns: minmax\(0,1fr\)/u);
  assert.match(trainingCss, /\.training-schedule \.schedule-card header > \* \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere/u);
  assert.match(trainingCss, /\.training-schedule \.schedule-card > \.button \{[^}]*max-width: 100%/u);
});

test("voice playback primer stays inside the declared media policy", () => {
  assert.match(html, /media-src 'self' blob:/u);
  assert.doesNotMatch(html, /media-src[^;]*data:/u);
});
