import assert from "node:assert/strict";
import test from "node:test";

import { createInitialState } from "../v040/core/store.mjs";
import { renderProgressScreen } from "../v040/ui/progress-screen.mjs";

const NOW = new Date("2026-09-04T16:00:00.000Z");

function completedSet(overrides = {}) {
  return { done: true, weight: 100, reps: 10, unit: "lb", rpe: 8, ...overrides };
}

function session(overrides = {}) {
  return {
    id: "completed-session",
    completedAt: "2026-09-03T16:00:00.000Z",
    planLabel: "Strength session",
    durationMinutes: 35,
    units: "lb",
    exercises: [{
      exerciseId: "squat",
      snapshot: { name: "Squat", primaryMuscles: ["quadriceps"] },
      sets: [completedSet()],
    }],
    ...overrides,
  };
}

function stateWith(sessions = []) {
  return { ...createInitialState("mo", NOW), sessions };
}

function panel(html, name) {
  const match = html.match(new RegExp(`<article class="progress-v6-panel progress-v6-${name}">([\\s\\S]*?)<\\/article>`, "u"));
  assert.ok(match, `${name} panel is rendered`);
  return match[1];
}

test("Progress muscle distribution and load exclude invalid or unfinished sets", () => {
  const current = session();
  current.exercises[0].sets.push(
    completedSet({ done: false, weight: 500 }),
    completedSet({ reps: 0 }),
    completedSet({ weight: -20 }),
    completedSet({ rpe: 99 }),
  );
  const html = renderProgressScreen({ state: stateWith([current]), now: NOW });
  assert.match(panel(html, "focus"), /quadriceps<\/span><strong>1<small> set<\/small>/u);
  assert.match(panel(html, "volume"), /<strong>1,000<\/strong><span>lb lifted overall/u);
  assert.match(html, /1 completed set · 35 min/u);
  assert.doesNotMatch(html, /NaN|Infinity/u);
});

test("duplicate muscle labels count once per set without losing multi-muscle work", () => {
  const current = session();
  current.exercises[0].snapshot.primaryMuscles = ["quadriceps", "quadriceps", "glutes"];
  const focus = panel(renderProgressScreen({ state: stateWith([current]), now: NOW }), "focus");
  assert.match(focus, /quadriceps<\/span><strong>1<small> set<\/small>/u);
  assert.match(focus, /glutes<\/span><strong>1<small> set<\/small>/u);
  assert.equal((focus.match(/progress-v6-focus-row/gu) || []).length, 2);
});

test("historical units are converted before charting valid volume", () => {
  const current = session();
  current.exercises[0].sets = [completedSet({ unit: "kg", weight: 20, reps: 10 })];
  const html = renderProgressScreen({ state: stateWith([current]), now: NOW });
  assert.match(panel(html, "volume"), /<strong>441<\/strong><span>lb lifted overall/u);
});

test("future and invalid sessions do not earn milestones or enter history", () => {
  const state = stateWith([
    session(),
    session({ id: "future", completedAt: "2030-01-01T12:00:00.000Z", planLabel: "Future session" }),
    session({ id: "invalid", completedAt: "invalid", planLabel: "Invalid session" }),
  ]);
  const html = renderProgressScreen({ state, now: NOW });
  assert.match(html, /1 completed session overall/u);
  assert.match(html, /<h3>First session<\/h3>/u);
  assert.match(html, /4 more sessions to 5\./u);
  assert.doesNotMatch(html, /Future session|Invalid session|Invalid Date/u);
});

test("date-only records stay on their local calendar date in a western time zone", { concurrency: false }, () => {
  const previousZone = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    const state = stateWith([session({ completedAt: "2026-09-04" })]);
    const html = renderProgressScreen({ state, now: NOW });
    const labels = [...html.matchAll(/aria-label="([^"]*1 completed workout)"/gu)].map(match => match[1]);
    assert.equal(labels.length, 2, "the weekly strip and four-week calendar both mark the session");
    for (const label of labels) assert.match(label, /Sep 4: 1 completed workout/u);
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

test("first-day progress preserves confirmed nutrition without a zero-of-target judgment", () => {
  const state = stateWith();
  state.nutrition.days["2026-09-04"] = { entries: [
    { status: "confirmed", nutrients: { calories: 500, protein: 30, carbs: 40, fat: 20 } },
    { status: "draft", nutrients: { calories: 9999, protein: 999, carbs: 999, fat: 999 } },
  ] };
  const html = renderProgressScreen({ state, now: NOW });
  assert.match(html, /Your baseline starts with one session\./u);
  assert.match(html, /data-action="route" data-value="train"/u);
  assert.match(html, /<strong>500<\/strong><span>kcal average/u);
  assert.match(html, /1 logged day/u);
  assert.doesNotMatch(html, /9,999|9999|workouts this week|0\/3/u);
});

test("nutrition averages exclude missing days while chart labels disclose them", () => {
  const state = stateWith();
  state.nutrition.days["2026-09-03"] = { entries: [{ status: "confirmed", nutrients: { calories: 400 } }] };
  state.nutrition.days["2026-09-04"] = { entries: [{ status: "confirmed", nutrients: { calories: 600 } }] };
  const html = renderProgressScreen({ state, now: NOW });
  assert.match(html, /<strong>500<\/strong><span>kcal average/u);
  assert.match(html, /2 logged days/u);
  assert.match(html, /not logged/u);
  assert.match(html, /a logged day is not necessarily a complete day of eating/u);
});

test("photo check-ins preserve private action hooks and escape user captions", () => {
  const state = stateWith();
  state.socialDrafts = [{ id: "note-1", caption: '<script>alert("private")</script>', visibility: "private", createdAt: NOW.toISOString() }];
  const html = renderProgressScreen({ state, now: NOW, communityPreviews: new Map() });
  assert.match(html, /data-action="open-community-draft"/u);
  assert.match(html, /data-action="delete-community-draft" data-value="note-1"/u);
  assert.match(html, /Photo previews stay in this session/u);
  assert.match(html, /&lt;script&gt;/u);
  assert.doesNotMatch(html, /<script>|Publish now|Post publicly/u);
});

test("Progress preserves the previous eight history rows, five lifts and seven muscle groups", () => {
  const sessions = Array.from({ length: 10 }, (_, index) => session({
    id: `session-${index}`, completedAt: `2026-08-${String(20 + index).padStart(2, "0")}`, planLabel: `Session ${index}`,
    exercises: [{ exerciseId: `exercise-${index}`, snapshot: { name: `Exercise ${index}`, primaryMuscles: [`muscle-${index}`] }, sets: [completedSet({ weight: 100 + index })] }],
  }));
  const html = renderProgressScreen({ state: stateWith(sessions), now: NOW });
  const history = html.match(/<ol class="progress-v6-history-list">([\s\S]*?)<\/ol>/u)?.[1];
  assert.ok(history);
  assert.equal((history.match(/<li>/gu) || []).length, 8);
  assert.match(history, /Session 9/u);
  assert.match(history, /Session 2/u);
  assert.doesNotMatch(history, /Session [01]<\/h3>/u);
  assert.equal((panel(html, "bests").match(/<li>/gu) || []).length, 5);
  assert.equal((panel(html, "focus").match(/class="progress-v6-focus-row"/gu) || []).length, 7);
});

test("collapsed four-week adherence shows actual counts against the current target only", () => {
  const state = stateWith([
    session({ id: "outside", completedAt: "2026-08-09" }),
    session({ id: "week-one", completedAt: "2026-08-10" }),
    session({ id: "week-two-a", completedAt: "2026-08-17" }),
    session({ id: "week-two-b", completedAt: "2026-08-23" }),
    session({ id: "current", completedAt: "2026-08-31" }),
    session({ id: "future", completedAt: "2026-09-05" }),
    session({ id: "invalid", completedAt: "not-a-date" }),
  ]);
  state.profile.days = 3;
  const before = JSON.stringify(state);
  const html = renderProgressScreen({ state, now: NOW });
  const calendar = panel(html, "calendar-panel");
  const adherence = calendar.match(/<details class="progress-v6-details"><summary>Four-week consistency[\s\S]*?<\/details>/u)?.[0];
  assert.ok(adherence, "the comparison stays available in a closed disclosure");
  assert.doesNotMatch(adherence, /<details[^>]*\bopen\b/u);
  const counts = [...adherence.matchAll(/<strong>(\d+)<small> \/ (\d+)<\/small><\/strong>/gu)].map(([, count, target]) => [Number(count), Number(target)]);
  assert.deepEqual(counts, [[1, 3], [2, 3], [0, 3], [1, 3]]);
  assert.match(adherence, /This week so far/u);
  assert.match(adherence, /Historical targets are not stored/u);
  assert.match(calendar, /THE LAST FOUR WEEKS/u);
  assert.equal((calendar.match(/role="img" aria-label=/gu) || []).length, 28);
  assert.equal(JSON.stringify(state), before);
});
