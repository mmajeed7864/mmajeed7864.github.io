import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState, normalizeStateForTest } from "../v040/core/store.mjs";
import { EXERCISES } from "../v040/data/exercise-library.mjs";
import { deriveTrainerAction, isTrainerAction } from "../v040/domain/trainer-actions.mjs";
import {
  createTrainerClient,
  createTrainerPayload,
  isPrivateTrainerInput,
  resetTrainerSession,
} from "../v040/services/trainer-client.mjs";

class MemoryStorage {
  #values = new Map();

  getItem(key) { return this.#values.get(String(key)) ?? null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
}

const NOW = new Date("2026-08-20T14:00:00.000Z");

function trainerState() {
  const state = createInitialState("mo", NOW);
  state.profile = {
    ...state.profile,
    goal: "get stronger",
    experience: "advanced",
    days: 4,
    duration: 60,
    equipment: "dumbbells only",
    blocker: "motivation",
    energy: 4,
    tone: "Strict",
    // These deliberately unsupported fields must never enter the API payload.
    email: "founder@example.com",
    healthNotes: "must-not-leave-device",
  };
  state.settings.coachMode = "deep";
  state.activePlan = {
    id: "B",
    versionId: "plan-version-test",
    minutes: 30,
    exercises: [
      { exerciseId: "goblet-squat", snapshot: { name: "Goblet Squat" } },
      { exerciseId: "one-arm-row", snapshot: { name: "One-arm Dumbbell Row" } },
      { exerciseId: "goblet-squat", snapshot: { name: "Goblet Squat" } },
    ],
  };
  state.sessions = [{
    id: "session-1",
    completedAt: "2026-08-19T14:00:00.000Z",
    exercises: [],
  }];
  state.chat = [
    { role: "user", text: "Can we keep this concise?", at: "2026-08-20T13:50:00.000Z", providerEligible: true, contractVersion: "fitcoach-chat-v3" },
    { role: "coach", text: "Yes. One useful move at a time.", at: "2026-08-20T13:51:00.000Z", providerEligible: true, contractVersion: "fitcoach-chat-v3" },
  ];
  state.memories = ["must-not-serialize-raw-memory"];
  return state;
}

function jsonResponse(payload, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

test("trainer v3 payload has an exact bounded allow-list", () => {
  const storage = new MemoryStorage();
  const payload = createTrainerPayload({
    state: trainerState(),
    message: "  Help me choose today's workout.  ",
    approvedAction: "OFFER_PLAN_B",
    founder: "mo",
    storage,
    now: NOW,
  });

  assert.deepEqual(Object.keys(payload).sort(), [
    "context",
    "conversation",
    "data_classification",
    "message",
    "response_depth",
    "session_id",
    "style",
  ]);
  assert.deepEqual(Object.keys(payload.context).sort(), [
    "approved_action",
    "blocker_code",
    "days_per_week",
    "days_since_last_session",
    "energy_1_to_5",
    "equipment_code",
    "exercise_codes",
    "experience_code",
    "goal_code",
    "journey_stage",
    "plan_code",
    "plan_minutes",
    "session_minutes",
    "weekly_completed",
    "weekly_target",
  ]);
  assert.equal(payload.message, "Help me choose today's workout.");
  assert.equal(payload.data_classification, "user_provided_fitness_coaching_text");
  assert.equal(payload.style, "strict");
  assert.equal(payload.response_depth, "deep");
  assert.match(payload.session_id, /^fitcoach-session-[a-zA-Z0-9_-]+$/);
  assert.equal(payload.session_id, createTrainerPayload({ state: trainerState(), message: "Again", storage, now: NOW }).session_id);
  assert.equal(storage.getItem("fitcoach-device-id"), null, "chat identity must not persist as a device identifier");
  assert.deepEqual(payload.context, {
    goal_code: "get_stronger",
    experience_code: "advanced",
    days_per_week: 4,
    session_minutes: 60,
    equipment_code: "dumbbells_only",
    blocker_code: "motivation",
    energy_1_to_5: 4,
    weekly_completed: 1,
    weekly_target: 4,
    journey_stage: "active",
    days_since_last_session: 1,
    approved_action: "OFFER_PLAN_B",
    plan_code: "plan_b",
    plan_minutes: 30,
    exercise_codes: ["goblet_squat", "one_arm_dumbbell_row"],
  });
  assert.deepEqual(payload.conversation, [
    { role: "user", content: "Can we keep this concise?" },
    { role: "assistant", content: "Yes. One useful move at a time." },
  ]);
  assert.equal(JSON.stringify(payload).includes("founder@example.com"), false);
  assert.equal(JSON.stringify(payload).includes("must-not-leave-device"), false);
  assert.equal(JSON.stringify(payload).includes("must-not-serialize-raw-memory"), false);
});

test("a fresh profile sends first-day context and accepts the bounded rude style", () => {
  const state = createInitialState("mo", NOW);
  state.profile.tone = "Rude";
  const payload = createTrainerPayload({
    state,
    message: "Give me the day-one standard.",
    founder: "mo",
    storage: new MemoryStorage(),
    now: new Date("2026-08-20T15:00:00.000Z"),
  });
  assert.equal(payload.style, "rude");
  assert.equal(payload.context.journey_stage, "first_day");
  assert.equal(payload.context.weekly_completed, 0);
});

test("migrated and rechecked private chat history are excluded from provider projection", () => {
  const state = trainerState();
  state.chat = [
    { role: "user", text: "legacy visible locally", at: "2026-08-19T13:00:00.000Z" },
    { role: "coach", text: "legacy reply", at: "2026-08-19T13:01:00.000Z", provider: "legacy" },
    { role: "user", text: "My medication dosage is 20mg", at: "2026-08-20T13:00:00.000Z", providerEligible: true, contractVersion: "fitcoach-chat-v3" },
    { role: "user", text: "Use the short answer style.", at: "2026-08-20T13:05:00.000Z", providerEligible: true, contractVersion: "fitcoach-chat-v3" },
  ];

  const payload = createTrainerPayload({
    state,
    message: "What is next?",
    founder: "mo",
    storage: new MemoryStorage(),
    now: NOW,
  });

  assert.deepEqual(payload.conversation, [
    { role: "user", content: "Use the short answer style." },
  ]);
  assert.equal(JSON.stringify(payload).includes("legacy visible locally"), false);
  assert.equal(JSON.stringify(payload).includes("20mg"), false);
});

test("private input is rejected locally with zero network requests", async () => {
  let fetches = 0;
  const client = createTrainerClient({
    fetchImpl: async () => {
      fetches += 1;
      return jsonResponse({ ok: true, reply: "must not be called" });
    },
    storage: new MemoryStorage(),
    clock: () => NOW,
  });

  assert.equal(isPrivateTrainerInput("Email me at founder@example.com"), true);
  assert.equal(isPrivateTrainerInput("My medication dosage is 20mg"), true);
  assert.equal(isPrivateTrainerInput("I weigh 180 pounds"), true);
  assert.equal(isPrivateTrainerInput("My waist is 34 inches"), true);
  assert.equal(isPrivateTrainerInput("My waist is 34"), true);
  assert.equal(isPrivateTrainerInput("I'm 13 years old"), true);
  assert.equal(isPrivateTrainerInput("I’m 13"), true);
  assert.equal(isPrivateTrainerInput("I'm thirteen years old"), true);
  assert.equal(isPrivateTrainerInput("My body fat is 18"), true);
  assert.equal(isPrivateTrainerInput("I'm 180 lbs"), true);
  assert.equal(isPrivateTrainerInput("180 lbs"), true);
  assert.equal(isPrivateTrainerInput("weight 180"), true);
  assert.equal(isPrivateTrainerInput("My chest measures 40 inches"), true);
  assert.equal(isPrivateTrainerInput("I am 6 feet tall"), true);
  assert.equal(isPrivateTrainerInput("I lifted 180 pounds for 5 reps"), false);
  assert.equal(isPrivateTrainerInput("I'm 20 minutes late"), false);
  assert.equal(isPrivateTrainerInput("I am 3 weeks into the plan"), false);
  assert.equal(isPrivateTrainerInput("I'm 5 reps short"), false);
  assert.equal(isPrivateTrainerInput("I am twenty minutes away"), false);
  assert.equal(isPrivateTrainerInput("Chest 3 sets"), false);
  assert.equal(isPrivateTrainerInput("Biceps 4 sets today"), false);
  assert.equal(isPrivateTrainerInput("Can we do chest 3 times a week?"), false);
  const result = await client.requestTurn({
    state: trainerState(),
    message: "My medication dosage is 20mg",
    approvedAction: "SAY_NOTHING",
    founder: "mo",
  });

  assert.deepEqual(result, { status: "private_block", reason: "private_input", persistable: false });
  assert.equal(fetches, 0);
});

test("reset rotates the ephemeral provider session without persisting an identifier", () => {
  const storage = new MemoryStorage();
  const before = createTrainerPayload({ state: trainerState(), message: "Help me train", approvedAction: "SAY_NOTHING", storage, now: NOW }).session_id;
  resetTrainerSession(storage);
  const after = createTrainerPayload({ state: trainerState(), message: "Help me train", approvedAction: "SAY_NOTHING", storage, now: NOW }).session_id;
  assert.notEqual(before, after);
  assert.equal(storage.getItem("fitcoach-device-id"), null);
});

test("a deterministic safety response is explicitly unpersistable and never speakable", async () => {
  const client = createTrainerClient({
    fetchImpl: async () => jsonResponse({
      ok: true,
      reply: "Stop the workout and use the on-screen safety guidance.",
      provider: "deterministic-safety",
      model: "safety-boundary",
      safety_intercepted: true,
      speak_allowed: false,
    }),
    storage: new MemoryStorage(),
    clock: () => NOW,
  });

  const result = await client.requestTurn({
    state: trainerState(),
    message: "ordinary synthetic safety test",
    approvedAction: "SAY_NOTHING",
    founder: "mo",
  });
  assert.equal(result.status, "safety");
  assert.equal(result.speakAllowed, false);
  assert.equal(result.persistable, false);
  assert.equal(result.provider, "deterministic-safety");
  assert.equal(result.model, "safety-boundary");
});

test("text remains a ready result when TTS is disallowed", async () => {
  const reply = "Keep the text visible; voice playback is disabled for this turn.";
  const client = createTrainerClient({
    fetchImpl: async () => jsonResponse({
      ok: true,
      reply,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      safety_intercepted: false,
      speak_allowed: false,
      fallback_used: false,
    }),
    storage: new MemoryStorage(),
    clock: () => NOW,
  });

  const result = await client.requestTurn({
    state: trainerState(),
    message: "Give me a text-only coaching reply.",
    approvedAction: "SAY_NOTHING",
    founder: "mo",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.reply, reply);
  assert.equal(result.speakAllowed, false);
  assert.equal(result.provider, "deepseek");
});

test("request timeout aborts the owned fetch and returns a retryable timeout", async () => {
  let observedSignal;
  const client = createTrainerClient({
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      observedSignal = options.signal;
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }),
    storage: new MemoryStorage(),
    timeoutMs: 5,
    clock: () => NOW,
  });

  const result = await client.requestTurn({
    state: trainerState(),
    message: "Timeout this synthetic request.",
    approvedAction: "SAY_NOTHING",
    founder: "mo",
  });
  assert.equal(observedSignal.aborted, true);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "timeout");
  assert.equal(result.retryable, true);
});

test("caller abort propagates once and is not reported as retryable", async () => {
  const started = Promise.withResolvers();
  let fetchAborts = 0;
  const client = createTrainerClient({
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        fetchAborts += 1;
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }, { once: true });
      started.resolve();
    }),
    storage: new MemoryStorage(),
    timeoutMs: 60_000,
    clock: () => NOW,
  });
  const caller = new AbortController();
  const pending = client.requestTurn({
    state: trainerState(),
    message: "Abort this synthetic request.",
    approvedAction: "SAY_NOTHING",
    founder: "mo",
    signal: caller.signal,
  });
  await started.promise;
  caller.abort("user_cancelled");

  const result = await pending;
  assert.equal(fetchAborts, 1);
  assert.equal(result.status, "error");
  assert.equal(result.reason, "aborted");
  assert.equal(result.retryable, false);
});

test("local trainer actions open exact exercise guides without provider-authored authority", () => {
  const action = deriveTrainerAction({
    state: trainerState(),
    message: "Show me how to do a goblet squat.",
    exercises: EXERCISES,
  });

  assert.deepEqual(action, {
    kind: "open_exercise",
    value: "goblet-squat",
    label: "Open Goblet Squat guide",
    detail: "Local illustrated setup, movement, and mistake guide",
  });
  assert.deepEqual(deriveTrainerAction({
    state: trainerState(),
    message: "Open the barbell back squat guide.",
    exercises: EXERCISES,
  }), {
    kind: "open_exercise",
    value: "barbell-back-squat",
    label: "Open Barbell Back Squat guide",
    detail: "Local illustrated setup, movement, and mistake guide",
  });
  assert.equal(isTrainerAction(action), true);
  assert.equal(isTrainerAction({ kind: "write_memory", value: "x", label: "Do it", detail: "" }), false);
});

test("local trainer actions make plan changes review-only and route verified destinations", () => {
  const state = trainerState();
  assert.deepEqual(deriveTrainerAction({ state, message: "I only have 20 minutes for this workout.", exercises: EXERCISES }), {
    kind: "propose_minutes",
    value: "20",
    label: "Review 20-minute option",
    detail: "Creates a deterministic candidate; your current plan stays active",
  });
  assert.equal(deriveTrainerAction({ state, message: "What should I train today?", exercises: EXERCISES }).kind, "open_workout");
  assert.equal(deriveTrainerAction({ state, message: "Show my progress.", exercises: EXERCISES }).kind, "open_progress");
  assert.equal(deriveTrainerAction({ state, message: "Start voice mode.", exercises: EXERCISES }).kind, "open_voice");
  assert.equal(deriveTrainerAction({ state, message: "Tell me something useful.", exercises: EXERCISES }), null);
});

test("trainer action receipts survive persistence and unknown powers fail closed", () => {
  const state = trainerState();
  state.chat.push(
    {
      id: "message-safe-action",
      role: "coach",
      text: "Open the local guide.",
      at: NOW.toISOString(),
      providerEligible: true,
      contractVersion: "fitcoach-chat-v3",
      action: deriveTrainerAction({ state, message: "Show me goblet squat form.", exercises: EXERCISES }),
    },
    {
      id: "message-forged-action",
      role: "coach",
      text: "This action must be discarded.",
      at: NOW.toISOString(),
      providerEligible: true,
      contractVersion: "fitcoach-chat-v3",
      action: { kind: "activate_plan", value: "B", label: "Activate", detail: "No approval" },
    },
  );

  const normalized = normalizeStateForTest(state, "mo");
  assert.equal(normalized.chat.find(message => message.id === "message-safe-action").action.kind, "open_exercise");
  assert.equal(normalized.chat.find(message => message.id === "message-forged-action").action, null);
});
