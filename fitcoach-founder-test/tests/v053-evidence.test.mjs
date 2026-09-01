import assert from "node:assert/strict";
import test from "node:test";

import { buildWeeklyEvidence } from "../v040/domain/evidence.mjs";

const NOW = new Date("2026-08-26T14:00:00.000Z");

function set(overrides = {}) {
  return {
    id: "set-1",
    done: true,
    reps: 8,
    weight: 100,
    unit: "lb",
    rpe: 8,
    ...overrides,
  };
}

function session({ id = "session", completedAt, durationMinutes = 45, sets = [set()], personalRecords = [] }) {
  return {
    id,
    completedAt,
    durationMinutes,
    units: "lb",
    exercises: [{
      exerciseId: "barbell-squat",
      units: "lb",
      snapshot: { id: "barbell-squat", name: "Barbell Squat" },
      sets,
    }],
    personalRecords,
  };
}

function state(overrides = {}) {
  return {
    settings: { units: "lb" },
    profile: { days: 3 },
    sessions: [],
    nutrition: { days: {} },
    ...overrides,
  };
}

test("weekly evidence stays honest when no evidence exists", () => {
  const result = buildWeeklyEvidence(state(), NOW);

  assert.equal(result.scheduleTarget, 3);
  assert.equal(result.current.completedSessions, 0);
  assert.equal(result.current.validSets, 0);
  assert.equal(result.current.volume, 0);
  assert.equal(result.current.verifiedPersonalRecords, 0);
  assert.equal(result.current.confirmedNutritionDays, 0);
  assert.equal(result.copy.mode, "empty");
  assert.match(result.copy.body, /Nothing is behind/u);
  assert.doesNotMatch(JSON.stringify(result.copy), /failed|behind schedule|diet|medical/iu);
});

test("older history never gets mislabeled as a first-ever session", () => {
  const result = buildWeeklyEvidence(state({
    sessions: [session({ completedAt: "2026-07-01T14:00:00.000Z" })],
  }), NOW);

  assert.equal(result.current.completedSessions, 0);
  assert.equal(result.previous.completedSessions, 0);
  assert.equal(result.copy.mode, "lapsed");
  assert.match(result.copy.title, /history is here/u);
  assert.match(result.copy.comparison, /Older records remain in Progress/u);
  assert.doesNotMatch(JSON.stringify(result.copy), /first completed|failed|behind schedule|worse/iu);
});

test("older confirmed nutrition evidence also preserves returning-user language", () => {
  const result = buildWeeklyEvidence(state({
    nutrition: { days: { "2026-07-01": { entries: [{ status: "confirmed" }] } } },
  }), NOW);

  assert.equal(result.copy.mode, "lapsed");
  assert.doesNotMatch(JSON.stringify(result.copy), /first completed/iu);
});

test("the first logged week is labeled as a baseline, not an improvement", () => {
  const result = buildWeeklyEvidence(state({
    sessions: [session({ completedAt: "2026-08-25T14:00:00.000Z" })],
    nutrition: { days: { "2026-08-25": { entries: [{ status: "confirmed" }] } } },
  }), NOW);

  assert.equal(result.current.completedSessions, 1);
  assert.equal(result.current.validSets, 1);
  assert.equal(result.current.durationMinutes, 45);
  assert.equal(result.current.volume, 800);
  assert.equal(result.current.confirmedNutritionDays, 1);
  assert.equal(result.previous.completedSessions, 0);
  assert.equal(result.copy.mode, "baseline");
  assert.match(result.copy.comparison, /not available for an honest comparison/u);
  assert.doesNotMatch(JSON.stringify(result.copy), /improv|better|worse/iu);
});

test("calendar-week comparison normalizes units and counts only set-backed personal records", () => {
  const verifiedRecord = {
    kind: "personal_record",
    exerciseId: "barbell-squat",
    metric: "estimated_1rm",
    value: 130,
    previousValue: 120,
    weight: 100,
    reps: 8,
    unit: "lb",
  };
  const currentSession = session({
    id: "current",
    completedAt: "2026-08-25T14:00:00.000Z",
    personalRecords: [verifiedRecord, { ...verifiedRecord }],
  });
  const previousSession = session({
    id: "previous",
    completedAt: "2026-08-18T14:00:00.000Z",
    durationMinutes: 30,
    sets: [set({ weight: 20, unit: "kg", reps: 10 })],
  });
  const result = buildWeeklyEvidence(state({
    sessions: [previousSession, currentSession],
    nutrition: {
      days: {
        "2026-08-18": { entries: [{ status: "confirmed" }] },
        "2026-08-25": { entries: [{ status: "confirmed" }] },
        "2026-08-26": { entries: [{ status: "confirmed" }] },
      },
    },
  }), NOW);

  assert.equal(result.current.volume, 800);
  assert.equal(result.previous.volume, 441);
  assert.equal(result.current.verifiedPersonalRecords, 1, "duplicate receipts count once");
  assert.equal(result.previous.verifiedPersonalRecords, 0);
  assert.equal(result.current.confirmedNutritionDays, 2);
  assert.equal(result.previous.confirmedNutritionDays, 1);
  assert.equal(result.deltas.volume, 359);
  assert.equal(result.copy.mode, "comparison");
  assert.match(result.copy.comparison, /versus last calendar week/u);
});

test("invalid completed-set shapes are excluded from set, volume, and PR evidence", () => {
  const invalidSets = [
    set({ id: "not-done", done: false }),
    set({ id: "no-reps", reps: 0 }),
    set({ id: "negative-weight", weight: -1 }),
    set({ id: "bad-rpe", rpe: 11 }),
  ];
  const result = buildWeeklyEvidence(state({
    sessions: [session({
      completedAt: "2026-08-25T14:00:00.000Z",
      sets: invalidSets,
      personalRecords: [{
        kind: "personal_record",
        exerciseId: "barbell-squat",
        metric: "estimated_1rm",
        value: 130,
        previousValue: 120,
        weight: 100,
        reps: 8,
        unit: "lb",
      }],
    })],
  }), NOW);

  assert.equal(result.current.completedSessions, 1);
  assert.equal(result.current.validSets, 0);
  assert.equal(result.current.volume, 0);
  assert.equal(result.current.verifiedPersonalRecords, 0);
});

test("draft nutrition never counts as a confirmed nutrition day", () => {
  const result = buildWeeklyEvidence(state({
    nutrition: {
      days: {
        "2026-08-24": { entries: [{ status: "draft" }, { status: "draft" }] },
        "2026-08-25": { entries: [{ status: "draft" }, { status: "confirmed" }] },
        "2026-08-26": { entries: [{ status: "draft" }] },
      },
    },
  }), NOW);

  assert.equal(result.current.confirmedNutritionDays, 1);
  assert.equal(result.current.completedSessions, 0);
  assert.equal(result.copy.mode, "baseline");
});
