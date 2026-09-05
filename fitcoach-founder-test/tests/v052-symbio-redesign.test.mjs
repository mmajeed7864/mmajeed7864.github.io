import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { renderCoachScreen } from "../v040/ui/coach-screen.mjs";
import { renderOnboarding } from "../v040/ui/onboarding.mjs";
import { createInitialState } from "../v040/core/store.mjs";

const css = readFileSync(new URL("../v040/premium-redesign.css", import.meta.url), "utf8");

test("v0.5.2 dark theme uses the Symbio ground scale, not the retired bright navy", () => {
  assert.match(css, /--bg:\s*#090d16/i);
  assert.match(css, /--bg-soft:\s*#0d1320/i);
  assert.match(css, /--surface:\s*#111726/i);
  assert.match(css, /--elevated:\s*#1d2638/i);
  assert.doesNotMatch(css, /--bg:\s*#061126/i);
  assert.doesNotMatch(css, /#246bfd/i);
});

test("v0.5.2 defines the Symbio blue/purple accent pair in both themes", () => {
  assert.match(css, /--primary:\s*#2f6bff/i);
  assert.match(css, /--accent:\s*#7a4dff/i);
  assert.match(css, /--accent:\s*#9b73ff/i);
  assert.match(css, /--success:\s*#2bd08a/i);
});

test("route accents differentiate the five tabs without repainting whole surfaces", () => {
  assert.match(css, /body\[data-route="coach"\]\s*\{\s*--route-accent:\s*var\(--accent\)/u);
  assert.match(css, /body\[data-route="nutrition"\]\s*\{\s*--route-accent:\s*var\(--success\)/u);
  assert.match(css, /body\[data-route="progress"\]/u);
});

test("keyboard focus ring is unlayered so cascade layers cannot swallow it", () => {
  const unlayeredFocus = css.lastIndexOf("):focus-visible");
  assert.ok(unlayeredFocus > 0, "unlayered focus-visible block must exist");
  assert.match(css, /outline:\s*3px solid color-mix\(in srgb, var\(--focus, #2f6bff\) 62%, transparent\)/u);
  assert.match(css, /@media \(prefers-contrast: more\)/u);
});

test("browser-default buttonface leaks are neutralized on profile hub and plan grips", () => {
  assert.match(css, /\.profile-hub-list > button \{ background: transparent/u);
  assert.match(css, /\.grip-button \{[^}]*background: var\(--surface-2\)/u);
});

test("coach style and memory sections render as persistent disclosures with all controls intact", () => {
  const state = createInitialState("mo");
  state.profile.onboarded = true;
  const html = renderCoachScreen({
    state,
    decision: { title: "Built from your current plan" },
    ui: { disclosures: { "coach-style": true }, chatBusy: false, chatDraft: "" },
    coachConnection: { label: "Ready", state: "unverified" },
  });
  assert.match(html, /<details class="coach-disclosure coach-personality" data-disclosure="coach-style" open>/u);
  assert.match(html, /<details class="coach-disclosure trainer-memory" data-disclosure="coach-memory" >/u);
  assert.match(html, /aria-label="Trainer tone"/u);
  assert.match(html, /aria-label="Answer length"/u);
  assert.match(html, /aria-label="Trainer voice"/u);
  assert.match(html, /Safety rules and plan decisions stay the same\./u);
});

test("onboarding boundary step keeps the doctor-first medical guidance", () => {
  const state = createInitialState("mo");
  const html = renderOnboarding({ step: 16, draft: { profile: state.profile, settings: state.settings, gymProfile: state.gymProfile, consent: false } });
  const source = readFileSync(new URL("../v040/ui/onboarding.mjs", import.meta.url), "utf8");
  assert.match(source, /Check with a doctor or qualified healthcare provider before starting or materially changing a training or nutrition plan\./u);
  assert.match(source, /FitCoach is not medical care/u);
});

test("version and cache generation agree at 0.7.0 / 0700", async () => {
  const constants = await import("../v040/core/constants.mjs");
  assert.equal(constants.BUILD, "0.7.0");
  assert.equal(constants.CACHE_GENERATION, "0700");
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(sw, /const CACHE = "fitcoach-symbio-v0700";/u);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<title>FitCoach v0\.7\.0<\/title>/u);
  assert.doesNotMatch(html, /v=0500/u);
});
