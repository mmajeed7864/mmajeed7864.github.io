import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const PAGES = Object.freeze([
  "privacy.html",
  "terms.html",
  "delete-account.html",
  "support.html",
]);

const load = name => readFile(new URL(`../legal/${name}`, import.meta.url), "utf8");

test("public legal and support pages are complete, linked, and mobile-ready", async () => {
  const pages = await Promise.all(PAGES.map(async name => [name, await load(name)]));
  for (const [name, html] of pages) {
    assert.match(html, /^<!doctype html>/iu, `${name} must be a standalone document`);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/u);
    assert.match(html, /href="\.\/legal\.css"/u);
    assert.match(html, /support@symbioai\.dev/u);
    assert.doesNotMatch(html, /\b(?:TODO|TBD|FIXME|placeholder|lorem ipsum)\b/iu);
    assert.doesNotMatch(html, /approved (?:by|for) (?:Apple|Google)|App Store approved|Play Store approved/iu);
    for (const linked of PAGES) {
      assert.match(html, new RegExp(`href="\\./${linked.replace(".", "\\.")}"`, "u"), `${name} must link to ${linked}`);
    }
  }
});

test("privacy and deletion pages describe the actual preview boundaries", async () => {
  const [privacy, terms, deletion, support] = await Promise.all(PAGES.map(load));
  assert.match(privacy, /18\+ engineering preview/u);
  assert.match(privacy, /Cloud accounts and device sync are unavailable/u);
  for (const provider of ["Supabase", "Vercel", "ElevenLabs", "USDA FoodData Central", "Open Food Facts", "Apple and Google"]) {
    assert.match(privacy, new RegExp(provider, "u"));
  }
  assert.match(deletion, /Cloud account creation, sync, and server deletion are unavailable/u);
  assert.match(deletion, /Reset FitCoach/u);
  assert.match(deletion, /does not cancel billing managed by Apple or Google/u);
  assert.match(terms, /You must be at least 18 years old/u);
  assert.match(terms, /does not diagnose, treat, rehabilitate/u);
  assert.match(support, /No guaranteed response time/u);
});

test("legal center stylesheet uses the Symbio blue system and responsive navigation", async () => {
  const css = await readFile(new URL("../legal/legal.css", import.meta.url), "utf8");
  assert.match(css, /--ground:\s*#06142f/u);
  assert.match(css, /--blue:\s*#2f7dff/u);
  assert.match(css, /--violet:\s*#7f71ff/u);
  assert.match(css, /@media \(max-width: 48rem\)/u);
  assert.match(css, /prefers-reduced-motion/u);
});
