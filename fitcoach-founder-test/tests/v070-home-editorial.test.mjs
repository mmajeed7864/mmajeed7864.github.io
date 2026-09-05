import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialState } from "../v040/core/store.mjs";
import { buildPlan, startWorkoutFromPlan } from "../v040/domain/workouts.mjs";
import { EXERCISES, getExerciseById } from "../v040/data/exercise-library.mjs";
import { renderTodayScreen } from "../v040/ui/home-screen.mjs";

const now = new Date(2026, 8, 5, 12);
function fixture() {
  const state = createInitialState("mo", now);
  const plan = buildPlan(state, EXERCISES);
  state.activePlan = plan;
  return { state, plan, exerciseById: getExerciseById, now };
}
test("the new front page uses original responsive artwork and a distinct editorial composition", () => {
  const html = renderTodayScreen(fixture());
  assert.match(html, /home-masthead/);
  assert.match(html, /YOUR DAY\.<br><em>YOUR MOVE\./);
  assert.match(html, /club-day-v070-640\.webp 640w/);
  assert.match(html, /club-day-v070-1200\.webp 1200w/);
  assert.doesNotMatch(html, /training-day-v060|home-session-shade/);
  assert.ok(html.indexOf("home-masthead") < html.indexOf("home-session-media"));
  assert.ok(html.indexOf("home-session-media") < html.indexOf("home-session-copy"));
});
test("the masthead changes only when the actual session state changes", () => {
  const f = fixture();
  f.state.activeWorkout = startWorkoutFromPlan(f.plan, now);
  assert.match(renderTodayScreen(f), /PICK UP\.<br><em>POWER ON\./);
  f.state.activeWorkout = null;
  f.state.sessions = [{ id: "completed", completedAt: now.toISOString(), exercises: [] }];
  assert.match(renderTodayScreen(f), /YOU CAME\.<br><em>YOU DID\./);
});
test("the editorial surface retains all daily actions and bounded, real state", () => {
  const html = renderTodayScreen(fixture());
  for (const action of ["water-add", "water-undo", "nutrition-open-add", "open-nutrition", "open-voice-room", "set-energy", "propose-plan", "open-exercise", "explain-decision"]) assert.ok(html.includes(`data-action="${action}"`), action);
  assert.equal((html.match(/role="radio"/g) || []).length, 5);
  assert.match(html, /3 planned/);
  assert.match(html, /Water logging stays on this device/);
});
test("legacy date-only receipts agree with the visible local-day calendar", () => {
  const f = fixture();
  f.state.sessions = [{ id: "local-date", date: "2026-09-05", exercises: [] }];
  const html = renderTodayScreen(f);
  assert.match(html, /YOU CAME\.<br><em>YOU DID\./);
  assert.match(html, /TODAY, COMPLETED/);
  assert.doesNotMatch(html, /data-action="start-workout"/);
  f.now = new Date(2026, 8, 7, 12);
  f.state.sessions = [{ id: "monday", date: "2026-09-07", exercises: [] }];
  assert.match(renderTodayScreen(f), /1 of 3/);
  f.now = now;
  f.state.sessions = [{ id: "future", completedAt: new Date(now.getTime() + 3_600_000).toISOString(), exercises: [] }];
  assert.match(renderTodayScreen(f), /YOUR DAY\.<br><em>YOUR MOVE\./);
});
test("the replacement system supplies self-hosted fonts, flat navigation and a motion opt-out", () => {
  const css = readFileSync(new URL("../v040/design-system-v070.css", import.meta.url), "utf8");
  assert.match(css, /@font-face[\s\S]*BarlowCondensed-Bold\.ttf/);
  assert.match(css, /@font-face[\s\S]*Manrope-Variable\.ttf/);
  assert.match(css, /#bottom-nav\.bottom-nav \{[^}]*bottom: 0;[^}]*border-radius: 0;/);
  assert.match(css, /\.home-energy \.active \.energy-bars/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /@import/);
});
