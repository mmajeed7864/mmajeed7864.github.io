import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createFitCoachStore, createInitialState } from "../v040/core/store.mjs";
import { localDateKey } from "../v040/core/utils.mjs";
import { addWater, normalizeHydration, undoWater, waterForDay } from "../v040/domain/hydration.mjs";
import { mergeRemoteStateWithLocalOnlyFields, projectStateForEncryptedSync } from "../v040/domain/sync-projection.mjs";
import { buildPlan, createPlanProposal, startWorkoutFromPlan } from "../v040/domain/workouts.mjs";
import { computeDecision } from "../v040/domain/decisions.mjs";
import { EXERCISES, getExerciseById } from "../v040/data/exercise-library.mjs";
import { renderTodayScreen } from "../v040/ui/home-screen.mjs";
import { renderModal } from "../v040/ui/modal.mjs";

const NOW = new Date(2026, 8, 4, 12, 0, 0);
const BEFORE = new Date(2026, 8, 3, 12, 0, 0);
const AFTER = new Date(2026, 8, 4, 13, 0, 0);

class MemoryStorage {
  entries = new Map();
  get length() { return this.entries.size; }
  key(index) { return [...this.entries.keys()][index] ?? null; }
  getItem(key) { return this.entries.get(key) ?? null; }
  setItem(key, value) { this.entries.set(key, value); }
  removeItem(key) { this.entries.delete(key); }
}

function fixture() {
  const state = createInitialState("mo", NOW);
  state.profile.ageBand = "adult_18_64";
  state.activePlan = buildPlan(state, EXERCISES);
  return { state, plan: state.activePlan, exerciseById: getExerciseById, now: NOW };
}

// Execute the production event handler with the real domain/store and small
// adapters for browser effects, so routing tests exercise the actual branches.
function clickHarness(overrides = {}) {
  const source = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("function handleClick(event) {"), source.indexOf("function handleChange(event) {"));
  assert.ok(handler.startsWith("function handleClick(event) {"));
  const calls = [];
  const ui = { route: "today", nutritionDate: null, modal: null };
  const sandbox = {
    ui,
    localDateKey,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [NOW.getTime()])); }
      static now() { return NOW.getTime(); }
    },
    render: () => calls.push("render"),
    toast: message => calls.push(["toast", message]),
    openModal: modal => { ui.modal = modal; calls.push(["modal", modal.type]); },
    closeModal: () => { ui.modal = null; calls.push("close-modal"); },
    navigate: route => calls.push(["route", route]),
    openVoiceRoom: () => calls.push("voice"),
    resumeWorkout: () => calls.push("resume"),
    MEAL_SLOTS: ["breakfast", "lunch", "dinner", "snacks"],
    mealSlotForHour: () => "lunch",
    requestAnimationFrame: callback => callback(),
    document: { querySelector: () => null },
    ...overrides,
  };
  runInNewContext(handler, sandbox);
  return {
    sandbox,
    calls,
    click: (action, dataset = {}) => sandbox.handleClick({ target: { closest: () => ({ dataset: { action, ...dataset }, tagName: "BUTTON" }) } }),
  };
}

test("hydration drops invalid or duplicated entries and never mutates its input", () => {
  const good = { id: "one", at: NOW.toISOString(), ml: 250.4, extra: "discard this" };
  const raw = { entries: [good, { ...good, ml: 900 }, null,
    { id: "bad-time", at: "invalid", ml: 250 },
    { id: "string-volume", at: NOW.toISOString(), ml: "250" },
    { id: "negative", at: NOW.toISOString(), ml: -1 },
    { id: "zero", at: NOW.toISOString(), ml: 0 },
    { id: "too-much", at: NOW.toISOString(), ml: 2001 },
    { id: "infinite", at: NOW.toISOString(), ml: Infinity },
    { id: "x".repeat(101), at: NOW.toISOString(), ml: 250 },
  ] };
  const normalized = normalizeHydration(raw);
  assert.deepEqual(normalized, { entries: [{ id: "one", at: NOW.toISOString(), ml: 250 }] });
  assert.equal(raw.entries[0].ml, 250.4);
  assert.equal(raw.entries[0].extra, "discard this");
  assert.deepEqual(normalizeHydration({ entries: "broken" }), { entries: [] });
});

test("daily water totals follow the local day and exclude future timestamps", () => {
  const log = { entries: [
    { id: "yesterday", at: BEFORE.toISOString(), ml: 500 },
    { id: "today", at: NOW.toISOString(), ml: 250 },
    { id: "future", at: AFTER.toISOString(), ml: 750 },
  ] };
  assert.equal(waterForDay(log, NOW).totalMl, 250);
  assert.equal(waterForDay(log, AFTER).totalMl, 1000);
  assert.equal(waterForDay(log, BEFORE).totalMl, 500);
  const undone = undoWater(log, NOW);
  assert.deepEqual(undone.entries.map(entry => entry.id), ["yesterday", "future"]);
  assert.equal(waterForDay(undone, NOW).totalMl, 0);
  assert.equal(log.entries.length, 3);
});

test("water insertion is bounded and invalid volume cannot become a logged drink", () => {
  const initial = addWater(null, 250, NOW, "valid");
  for (const value of [-1, 0, 2001, NaN, Infinity, "250", undefined]) {
    assert.deepEqual(addWater(initial, value, NOW, "rejected"), initial);
  }
  assert.deepEqual(addWater(initial, 250, new Date("invalid"), "rejected"), initial);
  const full = { entries: Array.from({ length: 1500 }, (_, index) => ({ id: `water-${index}`, at: NOW.toISOString(), ml: 250 })) };
  const result = addWater(full, 250, NOW, "newest");
  assert.equal(result.entries.length, 1500);
  assert.equal(result.entries[0].id, "water-1");
  assert.equal(result.entries.at(-1).id, "newest");
  assert.equal(full.entries[0].id, "water-0");
});

test("real water actions persist through reload, undo, export, and local deletion", () => {
  const storage = new MemoryStorage();
  const store = createFitCoachStore({ storage, clock: () => NOW });
  store.load();
  let sequence = 0;
  const harness = clickHarness({
    state: store.get(), store,
    addWater: (log, amount) => addWater(log, amount, NOW, `drink-${++sequence}`),
    undoWater: log => undoWater(log, NOW),
  });
  harness.click("water-add", { value: "250" });
  harness.click("water-add", { value: "250" });
  const reloaded = createFitCoachStore({ storage, clock: () => NOW });
  assert.equal(waterForDay(reloaded.load().hydration, NOW).totalMl, 500);
  harness.click("water-undo");
  assert.equal(waterForDay(reloaded.load().hydration, NOW).totalMl, 250);
  assert.equal(JSON.parse(reloaded.export()).hydration.entries.length, 1);
  assert.equal(reloaded.reset().hydration.entries.length, 0);
  assert.equal(createFitCoachStore({ storage }).load().hydration.entries.length, 0);
});

test("hydration remains local during encrypted upload and survives remote restoration", () => {
  const input = fixture();
  input.state.hydration = addWater(null, 250, NOW, "local-glass");
  const projected = projectStateForEncryptedSync(input.state);
  assert.equal(Object.hasOwn(projected, "hydration"), false);
  const remote = { ...projected, profile: { ...projected.profile, goal: "get stronger" }, hydration: { entries: [{ id: "remote-injection", at: NOW.toISOString(), ml: 1000 }] } };
  const merged = mergeRemoteStateWithLocalOnlyFields(remote, input.state);
  assert.equal(merged.profile.goal, "get stronger");
  assert.deepEqual(merged.hydration, input.state.hydration);
  merged.hydration.entries[0].ml = 500;
  assert.equal(input.state.hydration.entries[0].ml, 250);
  assert.equal(remote.hydration.entries[0].id, "remote-injection");
});

test("the actual new Home welcomes a first day without presenting an adherence deficit", () => {
  const input = fixture();
  const html = renderTodayScreen(input);
  assert.match(html, /Your week starts here/);
  assert.match(html, /3 planned/);
  assert.doesNotMatch(html, />0\s*of\s*3<|<b>0<small>\/3<\/small>/);
  assert.match(html, /data-action="start-workout"/);
  assert.doesNotMatch(html, /data-action="resume-workout"/);
  assert.match(html, /aria-label="View this week’s progress"/);
  assert.match(html, /data-action="water-undo"[^>]*disabled/);
  assert.equal([...html.matchAll(/aria-checked="false"/g)].length, 5);
});

test("returning users begin a new week with a neutral planned count", () => {
  const input = fixture();
  input.state.sessions = [{ id: "past-session", completedAt: new Date(2026, 7, 28, 12).toISOString(), exercises: [] }];
  const html = renderTodayScreen(input);
  assert.match(html, /New week/);
  assert.match(html, /3 planned/);
  assert.doesNotMatch(html, />0\s*of\s*3<|<b>0<small>\/3<\/small>/);
  assert.doesNotMatch(html, /First week/);
  assert.match(html, /data-action="start-workout"/);
});

test("Home previews the saved active session instead of a different current plan", () => {
  const input = fixture();
  const sessionPlan = { ...input.plan, label: "My travel session", minutes: 20, exercises: input.plan.exercises.slice(0, 2) };
  input.state.activeWorkout = startWorkoutFromPlan(sessionPlan, NOW);
  const html = renderTodayScreen(input);
  const hero = html.slice(html.indexOf('<section class="home-session"'), html.indexOf('</section>'));
  assert.match(hero, /My travel session/);
  assert.match(hero, /2 exercises/);
  assert.match(hero, /In progress/);
  assert.doesNotMatch(hero, /45 min/);
  assert.equal([...html.matchAll(/class="home-exercise"/g)].length, 2);
});

test("Home changes from Start to Resume to completed-session progress without mutating state", () => {
  const input = fixture();
  input.state.activeWorkout = startWorkoutFromPlan(input.plan, NOW);
  input.state.activeWorkout.exercises[0].sets[0].done = true;
  const before = JSON.stringify(input.state);
  let html = renderTodayScreen(input);
  assert.match(html, /SESSION IN PROGRESS/);
  assert.match(html, /data-action="resume-workout"/);
  assert.doesNotMatch(html, /data-action="start-workout"/);
  assert.equal(JSON.stringify(input.state), before);
  input.state.activeWorkout = null;
  input.state.sessions.push({ id: "session-completed", completedAt: NOW.toISOString(), exercises: [] });
  html = renderTodayScreen(input);
  const hero = html.slice(html.indexOf('<section class="home-session"'), html.indexOf('</section>'));
  assert.match(hero, /TODAY, COMPLETED/);
  assert.match(hero, /You showed up/);
  assert.match(hero, /data-action="route" data-value="progress"/);
  assert.match(html, /workout complete/);
  assert.doesNotMatch(hero, /data-action="start-workout"/);
});

test("Home uses only confirmed nutrition and real same-day energy check-ins", () => {
  const input = fixture();
  input.state.nutrition.days[localDateKey(NOW)] = { entries: [
    { id: "confirmed", status: "confirmed", nutrients: { calories: 420, protein: 30, carbs: 40, fat: 12, fiber: 4, sugar: 2, sodium: 300 } },
    { id: "draft", status: "draft", nutrients: { calories: 900, protein: 90, carbs: 90, fat: 40 } },
  ] };
  input.state.profile.energy = 4;
  input.state.profile.energyCheckedAt = NOW.toISOString();
  const html = renderTodayScreen(input);
  assert.match(html, /420<small>kcal logged/);
  assert.doesNotMatch(html, /1,320<small>kcal logged/);
  assert.equal([...html.matchAll(/aria-checked="true"/g)].length, 1);
  assert.match(html, /aria-checked="true"[^>]+data-value="4"/);
});

test("Home retains personalized first-day coach copy, tone, and both decision choices", () => {
  const input = fixture();
  input.decision = computeDecision(input.state, NOW);
  const html = renderTodayScreen(input);
  const coach = html.slice(html.indexOf('<section class="home-coach '), html.indexOf('<section class="home-readiness"'));
  assert.match(coach, /Day one starts with one clear rep/);
  assert.match(coach, /This is your first day/);
  assert.match(coach, /Atlas · Strict/);
  assert.match(coach, /tone-strict/);
  assert.match(coach, /data-action="decision" data-value="primary"/);
  assert.match(coach, /data-action="decision" data-value="secondary"/);
  assert.match(coach, /Start Plan A/);
  assert.match(coach, /See Minimum Dose/);
  assert.match(coach, /data-action="open-voice-room"/);
  assert.match(coach, /data-action="route" data-value="coach"/);
  assert.match(coach, /data-action="propose-plan" data-field="minutes" data-value="20"/);
  assert.doesNotMatch(coach, /data-action="approve-proposal"/);
});

test("personalized decision actions still stage proposals for review and reach the alternate plan", () => {
  const input = fixture();
  input.state.sessions = [{ id: "previous-session", completedAt: BEFORE.toISOString(), exercises: [] }];
  const decision = computeDecision(input.state, NOW);
  assert.equal(decision.type, "MOVE_SESSION");
  input.state.decisions = [decision];
  const store = createFitCoachStore({ storage: new MemoryStorage(), clock: () => NOW });
  store.replace(input.state);
  const startingPlan = JSON.stringify(store.get().activePlan);
  const starts = [];
  const harness = clickHarness({ state: store.get(), store, decision, startWorkout: id => starts.push(id) });
  harness.sandbox.proposePlan = (field, value) => {
    harness.sandbox.state = store.update(draft => {
      draft.pendingPlanProposal = createPlanProposal(draft, EXERCISES, { [field]: value }, NOW);
    });
    harness.sandbox.ui.modal = { type: "proposal" };
  };
  const source = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  const decisionHandler = source.slice(source.indexOf("function handleDecision(kind) {"), source.indexOf("async function forceRefresh() {"));
  assert.ok(decisionHandler.startsWith("function handleDecision(kind) {"));
  runInNewContext(decisionHandler, harness.sandbox);
  harness.click("decision", { value: "primary" });
  assert.equal(JSON.stringify(store.get().activePlan), startingPlan);
  assert.equal(store.get().pendingPlanProposal.status, "pending");
  assert.equal(harness.sandbox.ui.modal.type, "proposal");
  assert.equal(starts.length, 0);
  assert.equal(store.get().interventionOutcomes.at(-1).outcome, "primary");
  harness.click("decision", { value: "secondary" });
  assert.deepEqual(starts, ["MIN"]);
  assert.equal(store.get().interventionOutcomes.at(-1).outcome, "secondary");
});

test("coach recommendation text is escaped and absent secondary choices remain absent", () => {
  const input = fixture();
  input.decision = {
    title: '<script>unsafe title</script>', message: '<img src=x onerror="alert(1)">',
    primary: { label: 'Review <my> choice', kind: "route", value: "train" },
  };
  const html = renderTodayScreen(input);
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;script&gt;unsafe title&lt;\/script&gt;/);
  assert.match(html, /Review &lt;my&gt; choice/);
  assert.match(html, /data-action="decision" data-value="primary"/);
  assert.doesNotMatch(html, /data-action="decision" data-value="secondary"/);
});

test("quick actions expose food, training, discovery, coach, and progress with real app handlers", () => {
  const input = fixture();
  const source = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  let html = renderModal({ type: "quick-actions" }, input);
  assert.match(html, /role="dialog" aria-modal="true"/);
  for (const action of ["nutrition-open-add", "route", "open-library", "open-voice-room"]) {
    assert.ok(html.includes(`data-action="${action}"`));
    assert.ok(source.includes(`action === "${action}"`));
  }
  input.state.activeWorkout = startWorkoutFromPlan(input.plan, NOW);
  html = renderModal({ type: "quick-actions" }, input);
  assert.match(html, /Resume workout/);
  assert.match(html, /data-action="resume-workout"/);
  const harness = clickHarness();
  harness.click("open-quick-actions");
  assert.equal(harness.sandbox.ui.modal.type, "quick-actions");
  harness.click("open-voice-room");
  assert.equal(harness.sandbox.ui.modal, null);
  assert.deepEqual(harness.calls.slice(-2), ["close-modal", "voice"]);
});

test("global exercise discovery leaves any previous exercise detail", () => {
  const harness = clickHarness();
  Object.assign(harness.sandbox.ui, { route: "train", trainSegment: "exercises", exerciseDetailId: "air-squat", modal: { type: "quick-actions" } });
  harness.click("open-library");
  assert.equal(harness.sandbox.ui.route, "train");
  assert.equal(harness.sandbox.ui.trainSegment, "exercises");
  assert.equal(harness.sandbox.ui.exerciseDetailId, null);
  assert.equal(harness.sandbox.ui.modal, null);
});

test("today food shortcuts cannot silently log into a previously viewed diary date", () => {
  const harness = clickHarness();
  harness.sandbox.ui.nutritionDate = localDateKey(BEFORE);
  harness.click("nutrition-open-add", { value: "lunch", date: "today" });
  assert.equal(harness.sandbox.ui.nutritionDate || localDateKey(NOW), localDateKey(NOW));
  assert.equal(harness.sandbox.ui.modal.type, "nutrition-add");
  harness.sandbox.ui.nutritionDate = localDateKey(BEFORE);
  harness.click("nutrition-open-add", { value: "dinner" });
  assert.equal(harness.sandbox.ui.nutritionDate, localDateKey(BEFORE), "diary logging must retain an intentional historical date");
  const input = fixture();
  const home = renderTodayScreen(input);
  const quick = renderModal({ type: "quick-actions" }, input);
  assert.match(home, /data-action="nutrition-open-add"[^>]*data-date="today"/);
  assert.match(quick, /data-action="nutrition-open-add"[^>]*data-date="today"/);
});
