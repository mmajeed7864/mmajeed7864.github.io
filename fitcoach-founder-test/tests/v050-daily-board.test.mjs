import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createInitialState } from "../v040/core/store.mjs";
import { buildDailyBoard } from "../v040/domain/daily-board.mjs";
import { renderTodayScreen } from "../v040/ui/today-screen.mjs";

const now = new Date("2026-08-26T14:00:00.000Z");
const plan = {
  id: "plan-a",
  label: "Plan A",
  detail: "full session",
  minutes: 45,
  location: "gym",
  intensity: "standard",
  exercises: [
    { exerciseId: "air-squat", snapshot: { name: "Air Squat", primaryMuscles: ["quadriceps"], target: { sets: 3, reps: 8 } } },
    { exerciseId: "push-up", snapshot: { name: "Push-Up", primaryMuscles: ["chest"], target: { sets: 3, reps: 10 } } },
    { exerciseId: "band-row", snapshot: { name: "Band Row", primaryMuscles: ["mid back"], target: { sets: 3, reps: 12 } } },
  ],
};

function decision() {
  return {
    title: "Day one starts with one clear rep",
    message: "This is your first day. Nothing is late.",
    primary: { label: "Start Plan A" },
    secondary: null,
  };
}

test("daily board distinguishes a default energy value from a real daily check-in", () => {
  const state = createInitialState("mo", now);
  let board = buildDailyBoard(state, plan, now);

  assert.equal(board.energyCheckedToday, false);
  assert.equal(board.coach.status, "One minute with your coach");

  state.profile.energy = 4;
  state.profile.energyCheckedAt = now.toISOString();
  board = buildDailyBoard(state, plan, now);
  assert.equal(board.energyCheckedToday, true);
  assert.equal(board.coach.status, "4/5 energy saved");
});

test("daily board keeps nutrition drafts out of confirmed food status", () => {
  const state = createInitialState("mo", now);
  state.nutrition.days["2026-08-26"] = {
    date: "2026-08-26",
    entries: [{ id: "draft", status: "draft" }],
  };
  let board = buildDailyBoard(state, plan, now);
  assert.equal(board.nutritionDrafts, 1);
  assert.equal(board.confirmedFoods, 0);
  assert.equal(board.food.label, "Review");

  state.nutrition.days["2026-08-26"].entries = [{
    id: "confirmed",
    status: "confirmed",
    nutrients: { calories: 420, protein: 30, carbs: 40, fat: 12, fiber: 4, sugar: 2, sodium: 300 },
  }];
  board = buildDailyBoard(state, plan, now);
  assert.equal(board.nutritionDrafts, 0);
  assert.equal(board.confirmedFoods, 1);
  assert.equal(board.nutritionTotals.calories, 420);
  assert.equal(board.food.label, "Open diary");
});

test("daily board moves from start to resume to an evidence receipt", () => {
  const state = createInitialState("mo", now);
  let board = buildDailyBoard(state, plan, now);
  assert.equal(board.training.label, "Start");

  state.activeWorkout = { id: "active" };
  board = buildDailyBoard(state, plan, now);
  assert.equal(board.training.label, "Resume");

  state.activeWorkout = null;
  state.sessions.push({ id: "session", completedAt: now.toISOString(), exercises: [] });
  board = buildDailyBoard(state, plan, now);
  assert.equal(board.training.label, "See receipt");
  assert.equal(board.training.value, "progress");
});

test("Today renders one focused daily loop and removes the duplicated control stack", () => {
  const state = createInitialState("mo", now);
  const exerciseById = id => ({ id, name: plan.exercises.find(item => item.exerciseId === id)?.snapshot.name, media: [] });
  const html = renderTodayScreen({ state, plan, decision: decision(), exerciseById, now });

  assert.match(html, /daily-board-page/u);
  assert.match(html, /Three useful moves/u);
  assert.match(html, /Know the first three moves/u);
  assert.match(html, /Voice \+ transcript/u);
  assert.doesNotMatch(html, /context-controls|nutrition-today|coach-entry/u);
  assert.doesNotMatch(html, /<select/u);
});

test("optional onboarding can skip to the required final boundary review", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  const onboarding = readFileSync(new URL("../v040/ui/onboarding.mjs", import.meta.url), "utf8");

  assert.match(app, /else ui\.onboardingStep=ONBOARDING_STEP_COUNT-1/u);
  assert.match(onboarding, /Skip optional setup/u);
  assert.match(onboarding, /disabled:ageGateBlocked \|\| safeStep===ONBOARDING_STEP_COUNT-1&&!draft\.consent/u);
});
