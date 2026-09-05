import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createFitCoachStore, createInitialState } from "../v040/core/store.mjs";
import { localDateKey, uid } from "../v040/core/utils.mjs";
import { EXERCISES, getExerciseById } from "../v040/data/exercise-library.mjs";
import { contextualCoachMessage, localCoachCommand } from "../v040/domain/coach-tools.mjs";
import { deriveTrainerAction } from "../v040/domain/trainer-actions.mjs";
import { buildPlan, createPlanProposal, startWorkoutFromPlan } from "../v040/domain/workouts.mjs";
import { recordExerciseView } from "../v040/domain/exercise-discovery.mjs";
import { addEntryToDay, createFoodEntry, dayTotals } from "../v040/domain/nutrition.mjs";
import { estimateTextMeal } from "../v040/domain/nutrition-estimator.mjs";
import { createTrainerPayload, isPrivateTrainerInput } from "../v040/services/trainer-client.mjs";

const NOW = new Date(2026, 8, 4, 12);
const TODAY = localDateKey(NOW);
const source = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");

class MemoryStorage {
  entries = new Map();
  getItem(key) { return this.entries.get(key) ?? null; }
  setItem(key, value) { this.entries.set(key, String(value)); }
  removeItem(key) { this.entries.delete(key); }
}

function fixture(active = false) {
  const state = createInitialState("mo", NOW);
  state.profile.ageBand = "adult_18_64";
  state.settings.speakReplies = false;
  state.activePlan = buildPlan(state, EXERCISES);
  if (active) {
    state.activeWorkout = startWorkoutFromPlan(state.activePlan, NOW);
    state.activeWorkout.exercises[0].sets[0].done = true;
    state.activeWorkout.notes = "Keep my in-progress log";
  }
  state.chat = [];
  state.lastApi = { at: NOW.toISOString(), provider: "previous-provider", model: "previous-model", route: "fitcoach-chat-v3-contract" };
  return state;
}

function productionBlock(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Production boundary must exist: ${start}`);
  return source.slice(first, last);
}

// Run real app functions and the real persistent store/domain in a VM. Only
// browser rendering, speech hardware, and the remote provider are adapters.
function appHarness({ active = false, remoteResult, voiceActive = false } = {}) {
  const storage = new MemoryStorage();
  const store = createFitCoachStore({ storage, clock: () => NOW });
  store.replace(fixture(active));
  const calls = { provider: [], speech: [], openedVoice: 0, voiceRenders: 0, urls: [] };
  const ui = { route: "coach", trainSegment: "schedule", nutritionDate: "2026-09-01", modal: { type: "quick-actions" }, chatBusy: false, chatDraft: "", founder: "mo", voiceDocked: false, showActiveWorkout: false };
  const sandbox = {
    state: store.get(), store, ui, EXERCISES, uid, localDateKey,
    localCoachCommand, contextualCoachMessage, deriveTrainerAction, isPrivateTrainerInput,
    createPlanProposal, recordExerciseView, getExerciseById,
    estimateTextMeal, createFoodEntry, addEntryToDay,
    AbortController, URL,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [NOW.getTime()])); }
      static now() { return NOW.getTime(); }
    },
    decision: { type: "SAY_NOTHING" }, chatRequestController: null,
    document: { querySelector: () => null },
    window: { scrollY: 0, scrollTo: () => {} },
    location: { href: "https://example.test/?route=coach" },
    history: { replaceState: (_state, _title, url) => calls.urls.push(String(url)) },
    ROUTES: ["today", "train", "coach", "nutrition", "progress", "profile"], CACHE_GENERATION: "0600-test",
    requestAnimationFrame: callback => callback(), queueMicrotask: callback => callback(),
    matchMedia: () => ({ matches: false }),
    render: () => {}, renderAppScreen: () => {}, renderModalRoot: () => {},
    renderVoiceRoot: () => { calls.voiceRenders++; }, toast: () => {},
    openModal: modal => { ui.modal = modal; }, closeModal: () => { ui.modal = null; },
    openVoiceRoom: () => { calls.openedVoice++; },
    speakText: (...args) => calls.speech.push(args),
    releaseNutritionPreview: () => {}, nutritionPreviewUrl: null,
    trainerClient: { requestTurn: async args => { calls.provider.push(args); return remoteResult ?? { status: "unavailable" }; } },
    nativeClient: { createRecognitionSession: () => null }, browserVoice: {}, voiceSpeech: {},
    voiceSessionCode: "test", voiceLastMetadata: null,
    createVoiceRoomController: options => { sandbox.voiceOptions = options; return { getState: () => ({ active: voiceActive }) }; },
  };
  const blocks = [
    ["const voiceController = createVoiceRoomController({", "function invalidateCoachActivity("],
    ["function nutritionDateKey() {", "const trainerClient ="],
    ["function navigate(route) {", "function applyTonePreference("],
    ["function stageProposal(proposal) {", "function stageCandidate("],
    ["function proposePlan(field, value) {", "function approveProposal("],
    ["async function sendChat(raw = null) {", "const browserVoice ="],
    ["function executeTrainerAction(trainerAction,", "function openExercise("],
    ["function openExercise(exerciseId) {", "function applyPlanExercise("],
    ["function openNutritionReview(dateKey, entryId) {", "function shiftNutritionDay("],
  ];
  runInNewContext(blocks.map(([start, end]) => productionBlock(start, end)).join("\n"), sandbox);
  return { sandbox, calls, store, storage, ui };
}

test("exact navigation and duration commands resolve locally without mutating state", () => {
  const state = fixture();
  const before = JSON.stringify(state);
  const commands = [
    ["open workout", "open_workout"], ["bring up the workout", "open_workout"],
    ["take me to the workout", "open_workout"], ["resume session", "open_workout"],
    ["return to my workout", "open_workout"], ["show my progress", "open_progress"],
    ["open workout history", "open_progress"], ["open my food diary", "open_nutrition"],
    ["show today's nutrition", "open_nutrition"], ["open voice room", "open_voice"],
    ["Please open my workout!", "open_workout"], ["I have 20 minutes", "propose_minutes", "20"],
    ["I only have 20 minutes today", "propose_minutes", "20"], ["make my workout 30 minutes", "propose_minutes", "30"],
  ];
  for (const [message, kind, value] of commands) {
    const result = localCoachCommand({ state, message, exercises: EXERCISES });
    assert.equal(result?.action.kind, kind, message);
    if (value) assert.equal(result.action.value, value, message);
    assert.equal(result.localCommand, true);
    assert.equal(result.provider, "on-device");
    assert.equal(result.status, "ready");
    assert.ok(Object.isFrozen(result));
  }
  assert.equal(JSON.stringify(state), before);
});

test("negations, private text, medical context, general questions and food claims do not auto-execute", () => {
  const state = fixture();
  const messages = [
    "Don't open my workout", "Do not show me progress", "Never open voice room",
    "Should I open my workout?", "What can my workout do for knee pain?",
    "open my workout, my password is secret123", "open workout for my diagnosis",
    "I only have 20 minutes because my chest hurts", "I am 15. Open workout",
    "my email is example@example.test. Show progress", "I weigh 130 lb. Open workout",
    "Can you explain nutrition?", "Tell me about Air Squat", "Air Squat",
    "if I have 20 minutes, what should I do?", "I have 25 minutes", "make workout -20 minutes",
    "I ate eggs with toast", "log my lunch", "log this as a draft", "",
  ];
  for (const message of messages) assert.equal(localCoachCommand({ state, message, exercises: EXERCISES }), null, message);
});

test("only explicit, complete known exercise names and aliases open a local guide", () => {
  const state = fixture();
  const squat = EXERCISES.find(exercise => exercise.name === "Air Squat");
  assert.ok(squat);
  for (const message of ["show me Air Squat guide", "open guide for Air Squat", "pull up Air Squat"]) {
    assert.equal(localCoachCommand({ state, message, exercises: EXERCISES })?.action.value, squat.id, message);
  }
  const alias = (squat.aliases || []).find(name => name.length >= 3);
  assert.ok(alias, "catalogue contains a real alias to verify");
  assert.equal(localCoachCommand({ state, message: `open ${alias}`, exercises: EXERCISES })?.action.value, squat.id);
  for (const message of ["open invented exercise", "show Air Squat and Bench Press", "open Air Squat with knee pain", "explain Air Squat", "show Air Squat tomorrow"]) {
    assert.equal(localCoachCommand({ state, message, exercises: EXERCISES }), null, message);
  }
});

test("current-exercise guides resolve the active catalogue ID, never a guessed planned movement", () => {
  const state = fixture(true);
  state.activeWorkout.currentExerciseIndex = 1;
  const expected = state.activeWorkout.exercises[1].exerciseId;
  for (const message of ["open this exercise", "show my current exercise", "pull up current move"]) {
    assert.equal(localCoachCommand({ state, message, exercises: EXERCISES })?.action.value, expected, message);
  }
  for (const index of [-1, 1.5, 999]) {
    state.activeWorkout.currentExerciseIndex = index;
    assert.equal(localCoachCommand({ state, message: "open this exercise", exercises: EXERCISES }), null);
  }
  state.activeWorkout.currentExerciseIndex = 0;
  state.activeWorkout.exercises[0].exerciseId = "not-in-catalogue";
  assert.equal(localCoachCommand({ state, message: "open this exercise", exercises: EXERCISES }), null);
  state.activeWorkout = null;
  assert.equal(localCoachCommand({ state, message: "open this exercise", exercises: EXERCISES }), null);
});

test("actual sendChat runs a local command offline, opens the workout, and persists local-only history", async () => {
  const { sandbox, store, storage, calls, ui } = appHarness({ active: true });
  const before = store.get();
  await sandbox.sendChat("bring up the workout");
  assert.equal(calls.provider.length, 0);
  assert.equal(ui.route, "train");
  assert.equal(ui.trainSegment, "workout");
  assert.equal(ui.showActiveWorkout, true);
  assert.equal(ui.modal, null);
  assert.equal(ui.chatBusy, false);
  assert.deepEqual(store.get().activeWorkout, before.activeWorkout);
  assert.deepEqual(store.get().lastApi, before.lastApi);
  const reloaded = createFitCoachStore({ storage }).load();
  assert.equal(reloaded.chat.length, 2);
  assert.ok(reloaded.chat.every(message => message.providerEligible === false && message.contractVersion === "fitcoach-local-tools-v1"));
  assert.equal(reloaded.chat[1].provider, "on-device");
  assert.equal(reloaded.chat[1].action.kind, "open_workout");
  assert.deepEqual(calls.speech, []);
});

test("local history is excluded from the next real trainer payload, including after reload", async () => {
  const { sandbox, store, storage } = appHarness();
  store.update(draft => { draft.chat.push(
    { id: "remote-user", role: "user", text: "Help me build a consistent routine", at: NOW.toISOString(), providerEligible: true, contractVersion: "fitcoach-chat-v3" },
    { id: "remote-coach", role: "coach", text: "Start with a repeatable training schedule.", at: NOW.toISOString(), providerEligible: true, contractVersion: "fitcoach-chat-v3" },
  ); });
  sandbox.state = store.get();
  await sandbox.sendChat("show my progress");
  const state = createFitCoachStore({ storage }).load();
  const payload = createTrainerPayload({ state, message: "What should I focus on next?", approvedAction: "SAY_NOTHING", storage, now: NOW });
  assert.deepEqual(payload.conversation, [
    { role: "user", content: "Help me build a consistent routine" },
    { role: "assistant", content: "Start with a repeatable training schedule." },
  ]);
  assert.doesNotMatch(JSON.stringify(payload.conversation), /show my progress|Here’s your progress/);
});

test("general coaching still calls the provider and does not auto-open a suggested action", async () => {
  const remoteResult = { status: "ready", reply: "Here is how to make training more consistent.", provider: "test-provider", model: "test-model", speakAllowed: false };
  const { sandbox, calls, ui, store } = appHarness({ remoteResult });
  await sandbox.sendChat("What should I train today?");
  assert.equal(calls.provider.length, 1);
  assert.equal(calls.provider[0].message, "What should I train today?");
  assert.equal(ui.route, "coach");
  assert.ok(store.get().chat.every(item => item.providerEligible && item.contractVersion === "fitcoach-chat-v3"));
  assert.equal(store.get().lastApi.provider, "test-provider");
  assert.equal(store.get().chat.at(-1).action.kind, "open_workout");
});

test("private input and unavailable provider responses cannot leave saved chat or a busy state", async () => {
  const privateHarness = appHarness();
  await privateHarness.sandbox.sendChat("Open workout, my password is supersecret");
  assert.equal(privateHarness.calls.provider.length, 0);
  assert.equal(privateHarness.store.get().chat.length, 0);
  assert.equal(privateHarness.ui.chatNotice.kind, "private");
  const offline = appHarness();
  await offline.sandbox.sendChat("Can you explain a balanced training week?");
  assert.equal(offline.calls.provider.length, 1);
  assert.equal(offline.store.get().chat.length, 0);
  assert.equal(offline.ui.chatBusy, false);
  assert.equal(offline.ui.pendingMessage, "");
  assert.equal(offline.ui.chatNotice.kind, "error");
});

test("a local 20-minute request creates only a pending proposal and retains the active plan and session", async () => {
  const { sandbox, store, calls, ui } = appHarness({ active: true });
  const before = store.get();
  await sandbox.sendChat("I have 20 minutes");
  const after = store.get();
  assert.equal(calls.provider.length, 0);
  assert.equal(after.pendingPlanProposal.status, "pending");
  assert.equal(after.pendingPlanProposal.candidate.minutes, 20);
  assert.equal(after.pendingPlanProposal.baseVersionId, before.activePlan.versionId);
  assert.deepEqual(after.activePlan, before.activePlan);
  assert.deepEqual(after.activeWorkout, before.activeWorkout);
  assert.equal(ui.modal.type, "proposal");
  assert.match(after.chat.at(-1).text, /unchanged until you approve/);
});

test("actual nutrition and exercise navigation preserve the session and select today's diary", () => {
  const { sandbox, store, ui } = appHarness({ active: true });
  const before = store.get().activeWorkout;
  sandbox.executeTrainerAction({ kind: "open_nutrition", value: "nutrition" }, { fromVoice: true });
  assert.equal(ui.route, "nutrition");
  assert.equal(ui.nutritionDate, TODAY);
  assert.equal(ui.modal, null);
  assert.equal(ui.voiceDocked, true);
  const exerciseId = before.exercises[0].exerciseId;
  sandbox.executeTrainerAction({ kind: "open_exercise", value: exerciseId }, { fromVoice: true });
  assert.equal(ui.trainSegment, "exercises");
  assert.equal(ui.exerciseDetailId, exerciseId);
  assert.equal(ui.showActiveWorkout, false);
  assert.ok(store.get().exercisePreferences.recent.includes(exerciseId));
  sandbox.executeTrainerAction({ kind: "open_workout", value: "workout" });
  assert.equal(ui.trainSegment, "workout");
  assert.equal(ui.showActiveWorkout, true);
  assert.deepEqual(store.get().activeWorkout, before);
});

test("the real food-draft action opens review without confirming calories or altering the workout", () => {
  const { sandbox, store, ui } = appHarness({ active: true });
  const before = store.get().activeWorkout;
  const message = "I ate eggs with toast";
  assert.equal(localCoachCommand({ state: store.get(), message, exercises: EXERCISES }), null);
  const action = deriveTrainerAction({ state: store.get(), message, exercises: EXERCISES });
  assert.equal(action.kind, "nutrition_draft");
  assert.equal(sandbox.executeTrainerAction(action), true);
  assert.equal(ui.route, "nutrition");
  assert.equal(ui.modal.type, "nutrition-review");
  assert.equal(ui.modal.dateKey, TODAY);
  const day = store.get().nutrition.days[TODAY];
  assert.equal(day.entries.length, 1);
  assert.equal(day.entries[0].status, "draft");
  assert.equal(day.entries[0].confirmedAt, null);
  assert.equal(day.entries[0].confirmedBy, null);
  assert.equal(dayTotals(day).calories, 0);
  assert.equal(dayTotals(day).protein, 0);
  assert.deepEqual(store.get().activeWorkout, before);
});

test("actual voice commands use the local path, dock for navigation, and keep remote metadata unchanged", async () => {
  const { sandbox, store, calls, ui } = appHarness({ active: true, voiceActive: true });
  const before = store.get();
  const reply = await sandbox.voiceOptions.requestTurn({ transcript: "open my food diary", signal: new AbortController().signal });
  assert.equal(calls.provider.length, 0);
  assert.equal(reply.speak, true);
  sandbox.voiceOptions.onCommitTurn({ transcript: "open my food diary", reply: reply.text });
  assert.equal(ui.route, "nutrition");
  assert.equal(ui.voiceDocked, true);
  assert.equal(ui.nutritionDate, TODAY);
  assert.deepEqual(store.get().lastApi, before.lastApi);
  assert.deepEqual(store.get().activeWorkout, before.activeWorkout);
  assert.ok(store.get().chat.every(item => !item.providerEligible && item.contractVersion === "fitcoach-local-tools-v1"));
  assert.deepEqual(createTrainerPayload({ state: store.get(), message: "hello", now: NOW }).conversation, []);
  sandbox.executeTrainerAction({ kind: "open_voice", value: "voice" });
  assert.equal(ui.voiceDocked, false);
  assert.equal(calls.openedVoice, 0, "active room is reused, not restarted");
});

test("contextual messages resolve only valid exercise references and leave negative or private requests unchanged", () => {
  const state = fixture(true);
  const exercise = getExerciseById(state.activeWorkout.exercises[0].exerciseId);
  state.activeWorkout.exercises[0].snapshot.name = "Untrusted snapshot title";
  state.activeWorkout.notes = "Do not transmit my private journal";
  assert.equal(contextualCoachMessage({ state, message: "Explain this exercise", exercises: EXERCISES }), `Explain ${exercise.name}`);
  for (const message of ["Don't explain this exercise", "Do not open my current exercise", "Explain this exercise; my password is private123", "What should I eat?"]) {
    assert.equal(contextualCoachMessage({ state, message, exercises: EXERCISES }), message);
  }
  for (const index of [-1, 1.5, 999]) {
    state.activeWorkout.currentExerciseIndex = index;
    assert.equal(contextualCoachMessage({ state, message: "Explain this exercise", exercises: EXERCISES }), "Explain this exercise");
  }
  state.activeWorkout.currentExerciseIndex = 0;
  state.activeWorkout.exercises[0].exerciseId = "invalid-catalogue-id";
  assert.equal(contextualCoachMessage({ state, message: "Explain this exercise", exercises: EXERCISES }), "Explain this exercise");
  state.activeWorkout = null;
  assert.equal(contextualCoachMessage({ state, message: "Explain this exercise", exercises: EXERCISES }), "Explain this exercise");
});

test("actual text fallback sends the resolved catalogue name but saves the original user text and excludes extra private context", async () => {
  const remoteResult = { status: "ready", reply: "Use the guide to review the movement setup.", provider: "test-provider", model: "test-model", speakAllowed: false };
  const { sandbox, store, calls, ui } = appHarness({ active: true, remoteResult });
  store.update(draft => {
    draft.activeWorkout.notes = "PRIVATE_WORKOUT_NOTE";
    draft.activeWorkout.exercises[0].notes = "PRIVATE_EXERCISE_NOTE";
    const food = createFoodEntry({ slot: "lunch", source: "manual", food: { name: "PRIVATE_FOOD_NAME", per: { calories: 100, protein: 10, carbs: 10, fat: 2 } }, now: NOW });
    assert.ok(food);
    addEntryToDay(draft.nutrition, TODAY, food);
  });
  sandbox.state = store.get();
  const before = store.get().activeWorkout;
  const exercise = getExerciseById(before.exercises[0].exerciseId);
  await sandbox.sendChat("Explain this exercise");
  assert.equal(calls.provider.length, 1);
  assert.equal(calls.provider[0].message, `Explain ${exercise.name}`);
  assert.equal(store.get().chat[0].text, "Explain this exercise");
  assert.equal(ui.route, "coach", "explanations do not auto-navigate in text chat");
  const payload = createTrainerPayload({ ...calls.provider[0], now: NOW });
  assert.equal(payload.message, `Explain ${exercise.name}`);
  assert.doesNotMatch(JSON.stringify(payload), /PRIVATE_WORKOUT_NOTE|PRIVATE_EXERCISE_NOTE|PRIVATE_FOOD_NAME/);
  assert.deepEqual(store.get().activeWorkout, before);
});

test("actual voice fallback resolves the current exercise but commits the original spoken transcript", async () => {
  const remoteResult = { status: "ready", reply: "Keep the movement controlled and use the guide for setup.", provider: "test-provider", model: "test-model", speakAllowed: true };
  const { sandbox, store, calls, ui } = appHarness({ active: true, voiceActive: true, remoteResult });
  const before = store.get().activeWorkout;
  const exercise = getExerciseById(before.exercises[0].exerciseId);
  const transcript = "Explain this exercise";
  const result = await sandbox.voiceOptions.requestTurn({ transcript, signal: new AbortController().signal });
  assert.equal(calls.provider.length, 1);
  assert.equal(calls.provider[0].message, `Explain ${exercise.name}`);
  sandbox.voiceOptions.onCommitTurn({ transcript, reply: result.text });
  assert.equal(store.get().chat[0].text, transcript);
  assert.equal(store.get().chat[0].providerEligible, true);
  assert.equal(store.get().chat.at(-1).action.value, exercise.id);
  assert.equal(ui.exerciseDetailId, exercise.id);
  assert.equal(ui.voiceDocked, true);
  assert.deepEqual(store.get().activeWorkout, before);
});

test("precise app-capability questions return truthful local help with an explicit null action", () => {
  const state = fixture(true);
  const before = JSON.stringify(state);
  const questions = [
    "What can you help me do in FitCoach? Keep it concise.",
    "What can you do inside FitCoach? Can you open my workout, food diary, progress, and exercise guides? Answer briefly.",
    "What can you do in FitCoach?", "What can you help me with in this app?",
    "Which FitCoach sections can you open?", "Can you open my workout, food diary, progress, and exercise guides?",
    "  WHAT CAN YOU DO WITHIN FITCOACH? Please answer concisely!  ",
    "What can you do?", "What can you help me with?", "How can you help me?",
    "What are your capabilities?", "What can FitCoach do?",
    "What can you do? Keep it brief.", "How can you help me? Answer briefly.",
  ];
  for (const message of questions) {
    const result = localCoachCommand({ state, message, exercises: EXERCISES });
    assert.equal(result?.status, "ready", message);
    assert.equal(result.localCommand, true);
    assert.equal(result.provider, "on-device");
    assert.equal(result.model, "fitcoach-tools-v1");
    assert.equal(result.action, null);
    assert.ok(Object.hasOwn(result, "action"));
    assert.match(result.reply, /I can open your workout, today’s food diary, progress, and exercise guides/);
    assert.match(result.reply, /only after approval/);
    assert.match(result.reply, /drafts until you confirm/);
    assert.doesNotMatch(result.reply, /I (?:have |just )?opened|day one|first day|low energy|you reported|already changed/i);
  }
  assert.equal(JSON.stringify(state), before);
});

test("app help does not intercept exercise, health, private, negated, or mixed-intent questions", () => {
  const state = fixture(true);
  const questions = [
    "What can you help me do for knee pain?", "What can you help me do with an Air Squat?",
    "What can you do in FitCoach for my medication?", "What can you do in FitCoach? My password is secret123.",
    "Don't tell me what you can do in FitCoach.", "What can you do in FitCoach? Don't open my workout.",
    "What can you do in FitCoach? Open my workout.", "What can you do in FitCoach? Is this exercise safe for chest pain?",
    "What can you do in FitCoach? Explain Air Squat.", "What can you do in FitCoach? Send my diary to a friend.",
    "Can you open my workout, food diary, progress, and exercise guides without my permission?",
    "What can you do in FitCoach? Keep it concise. Delete my data.",
    "How can you help me with squats?", "What can you do? I have knee pain.",
    "What are your capabilities for diagnosing injuries?", "What can FitCoach do for my medication?",
    "What should I train today?", "Can you help me get stronger?",
  ];
  for (const message of questions) assert.equal(localCoachCommand({ state, message, exercises: EXERCISES }), null, message);
});

test("actual text capability help never calls AI, derives an action, navigates, or leaks into provider history", async () => {
  const { sandbox, store, storage, calls, ui } = appHarness({ active: true });
  const before = store.get();
  const modal = ui.modal;
  sandbox.deriveTrainerAction = () => { throw new Error("Local help must not derive a fallback action"); };
  const message = "What can you do inside FitCoach? Can you open my workout, food diary, progress, and exercise guides? Answer briefly.";
  await sandbox.sendChat(message);
  assert.equal(calls.provider.length, 0);
  assert.equal(calls.urls.length, 0);
  assert.equal(ui.route, "coach");
  assert.equal(ui.modal, modal);
  assert.equal(ui.chatBusy, false);
  const reloaded = createFitCoachStore({ storage }).load();
  assert.equal(reloaded.chat[0].text, message);
  assert.equal(reloaded.chat[1].action, null);
  assert.ok(reloaded.chat.every(item => !item.providerEligible && item.contractVersion === "fitcoach-local-tools-v1"));
  assert.deepEqual(reloaded.activeWorkout, before.activeWorkout);
  assert.deepEqual(reloaded.activePlan, before.activePlan);
  assert.deepEqual(reloaded.pendingPlanProposal, before.pendingPlanProposal);
  assert.deepEqual(reloaded.lastApi, before.lastApi);
  assert.deepEqual(createTrainerPayload({ state: reloaded, message: "How do I build consistency?", storage, now: NOW }).conversation, []);
});

test("actual voice capability help speaks without AI, navigation, action chips, or remote-history eligibility", async () => {
  const { sandbox, store, calls, ui } = appHarness({ active: true, voiceActive: true });
  const before = store.get();
  sandbox.deriveTrainerAction = () => { throw new Error("Voice help must preserve explicit null action"); };
  const transcript = "What can you help me do in FitCoach? Keep it concise.";
  const reply = await sandbox.voiceOptions.requestTurn({ transcript, signal: new AbortController().signal });
  assert.equal(calls.provider.length, 0);
  assert.equal(reply.speak, true);
  sandbox.voiceOptions.onCommitTurn({ transcript, reply: reply.text });
  assert.equal(calls.urls.length, 0);
  assert.equal(calls.openedVoice, 0);
  assert.equal(ui.route, "coach");
  assert.equal(ui.voiceDocked, false);
  assert.equal(store.get().chat[0].text, transcript);
  assert.equal(store.get().chat[1].action, null);
  assert.ok(store.get().chat.every(item => !item.providerEligible && item.contractVersion === "fitcoach-local-tools-v1"));
  assert.deepEqual(store.get().lastApi, before.lastApi);
  assert.deepEqual(store.get().activeWorkout, before.activeWorkout);
  assert.deepEqual(createTrainerPayload({ state: store.get(), message: "How do I build consistency?", now: NOW }).conversation, []);
});
