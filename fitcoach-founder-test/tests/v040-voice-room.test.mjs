import test from "node:test";
import assert from "node:assert/strict";

import {
  createBrowserVoiceAdapters,
  createVoiceRoomController,
} from "../v040/voice/voice-room-controller.mjs";
import {
  createInitialVoiceRoomState,
  reduceVoiceRoomState,
  VOICE_ROOM_PHASES,
} from "../v040/voice/voice-room-state.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settle() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

function createFakeClock() {
  let serial = 0;
  const pending = new Map();
  return {
    setTimeout(callback) {
      const id = ++serial;
      pending.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    runAll() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback();
    },
    get size() {
      return pending.size;
    },
  };
}

function createRecognitionHarness() {
  const sessions = [];
  const recognitionFactory = callbacks => {
    const session = {
      callbacks,
      starts: 0,
      stops: 0,
      aborts: 0,
      start() { this.starts += 1; },
      stop() { this.stops += 1; },
      abort() { this.aborts += 1; },
    };
    sessions.push(session);
    return session;
  };
  return { sessions, recognitionFactory };
}

function createSpeechHarness() {
  const utterances = [];
  const speech = {
    speak(callbacks) {
      const utterance = {
        ...callbacks,
        cancels: 0,
        cancel() { this.cancels += 1; },
      };
      utterances.push(utterance);
      return utterance;
    },
  };
  return { speech, utterances };
}

function createHarness(overrides = {}) {
  const recognition = createRecognitionHarness();
  const spoken = createSpeechHarness();
  const clock = createFakeClock();
  const commits = [];
  const safetyEvents = [];
  const changes = [];
  const controller = createVoiceRoomController({
    recognitionFactory: recognition.recognitionFactory,
    speech: spoken.speech,
    requestTurn: async ({ transcript }) => ({ text: `Coach: ${transcript}` }),
    classifyInput: () => ({ kind: "normal" }),
    onCommitTurn: turn => commits.push(turn),
    onSafety: event => safetyEvents.push(event),
    onStateChange: (state, event) => changes.push({ state, event }),
    clock,
    cooldownMs: 10,
    ...overrides,
  });
  return { controller, recognition, spoken, clock, commits, safetyEvents, changes };
}

test("pure reducer exposes every required phase and freezes retained state", () => {
  assert.deepEqual(VOICE_ROOM_PHASES, [
    "closed", "consent", "starting", "listening", "finalizing", "thinking",
    "speaking", "cooldown", "paused", "retryable_error", "safety_stop",
  ]);
  const initial = createInitialVoiceRoomState();
  const consent = reduceVoiceRoomState(initial, {
    type: "OPEN_CONSENT",
    roomId: "room-test",
    roomGeneration: 1,
  });
  assert.equal(initial.phase, "closed");
  assert.equal(consent.phase, "consent");
  assert.ok(Object.isFrozen(consent));
  assert.ok(Object.isFrozen(consent.turns));
  assert.throws(() => reduceVoiceRoomState(consent, { type: "REPLY_READY", text: "bad" }), /INVALID_VOICE_TRANSITION/);
});

test("consent opens one listening session and double start is ignored", () => {
  const { controller, recognition } = createHarness();
  assert.equal(controller.open(), true);
  assert.equal(controller.getState().phase, "consent");
  assert.equal(controller.open(), false);
  assert.equal(recognition.sessions.length, 0);

  assert.equal(controller.grantConsent(), true);
  assert.equal(controller.grantConsent(), false);
  assert.equal(recognition.sessions.length, 1);
  assert.equal(recognition.sessions[0].starts, 1);
  assert.equal(controller.getState().phase, "listening");
});

test("normal turns retain transcript and reply, caption each speaker, and persist across exit", async () => {
  const { controller, recognition, spoken, clock, commits } = createHarness();
  controller.open({ consentGranted: true });
  const first = recognition.sessions[0];
  first.callbacks.onInterim("how many");
  assert.deepEqual(controller.getState().caption, { role: "user", text: "how many" });

  first.callbacks.onFinal("How many sets?");
  await settle();
  assert.equal(first.stops, 1);
  assert.equal(controller.getState().phase, "speaking");
  assert.equal(controller.getState().lastTranscript, "How many sets?");
  assert.equal(controller.getState().lastReply, "Coach: How many sets?");
  assert.equal(controller.getState().turns.length, 1);
  assert.equal(commits.length, 1);
  assert.equal(spoken.utterances.length, 1);
  assert.deepEqual(controller.getState().caption, { role: "trainer", text: "Coach: How many sets?" });

  spoken.utterances[0].onEnd();
  assert.equal(controller.getState().phase, "cooldown");
  assert.equal(clock.size, 1);
  clock.runAll();
  assert.equal(controller.getState().phase, "listening");
  assert.equal(recognition.sessions.length, 2);

  controller.exit();
  const closed = controller.getState();
  assert.equal(closed.phase, "closed");
  assert.equal(closed.lastTranscript, "How many sets?");
  assert.equal(closed.lastReply, "Coach: How many sets?");
  assert.equal(closed.turns.length, 1);
});

test("deterministic safety input is never requested, retained, or spoken", async () => {
  let requests = 0;
  const { controller, recognition, spoken, safetyEvents } = createHarness({
    classifyInput: () => ({ kind: "safety" }),
    requestTurn: async () => { requests += 1; return { text: "should not happen" }; },
  });
  controller.open({ consentGranted: true });
  recognition.sessions[0].callbacks.onFinal("sensitive safety phrase");
  await settle();

  const state = controller.getState();
  assert.equal(state.phase, "safety_stop");
  assert.equal(state.pendingTranscript, "");
  assert.equal(state.lastTranscript, "");
  assert.equal(state.turns.length, 0);
  assert.equal(requests, 0);
  assert.equal(spoken.utterances.length, 0);
  assert.equal(safetyEvents.length, 1);
  assert.deepEqual(Object.keys(safetyEvents[0]).sort(), ["kind", "roomId", "turnId"]);
  assert.equal(JSON.stringify(safetyEvents).includes("sensitive safety phrase"), false);
});

test("server private intercept removes the pending transcript and never speaks", async () => {
  const { controller, recognition, spoken, commits } = createHarness({
    requestTurn: async () => ({ text: "private response", privateIntercepted: true }),
  });
  controller.open({ consentGranted: true });
  recognition.sessions[0].callbacks.onFinal("private input");
  await settle();

  const state = controller.getState();
  assert.equal(state.phase, "paused");
  assert.equal(state.error.code, "private_input");
  assert.equal(state.pendingTranscript, "");
  assert.equal(state.lastTranscript, "");
  assert.equal(state.turns.length, 0);
  assert.equal(commits.length, 0);
  assert.equal(spoken.utterances.length, 0);
});

test("reply failure has no automatic retry and explicit retry reuses only pending text", async () => {
  let calls = 0;
  const firstReply = deferred();
  const { controller, recognition, spoken } = createHarness({
    requestTurn: () => {
      calls += 1;
      if (calls === 1) return firstReply.promise;
      return Promise.resolve({ text: "Recovered reply" });
    },
  });
  controller.open({ consentGranted: true });
  recognition.sessions[0].callbacks.onFinal("retry this turn");
  await settle();
  firstReply.reject(Object.assign(new Error("temporary"), { code: "temporary_failure" }));
  await settle();

  assert.equal(controller.getState().phase, "retryable_error");
  assert.equal(controller.getState().pendingTranscript, "retry this turn");
  assert.equal(calls, 1);
  await settle();
  assert.equal(calls, 1);

  assert.equal(controller.retry(), true);
  await settle();
  assert.equal(calls, 2);
  assert.equal(controller.getState().phase, "speaking");
  assert.equal(controller.getState().lastTranscript, "retry this turn");
  assert.equal(spoken.utterances[0].text, "Recovered reply");
});

test("exit aborts an owned request once and ignores its late reply", async () => {
  const pending = deferred();
  let signal;
  let aborts = 0;
  const { controller, recognition, spoken, commits } = createHarness({
    requestTurn: request => {
      signal = request.signal;
      signal.addEventListener("abort", () => { aborts += 1; });
      return pending.promise;
    },
  });
  controller.open({ consentGranted: true });
  recognition.sessions[0].callbacks.onFinal("late reply input");
  await settle();
  assert.equal(controller.getState().phase, "thinking");

  assert.equal(controller.exit(), true);
  assert.equal(controller.exit(), false);
  assert.equal(signal.aborted, true);
  assert.equal(aborts, 1);
  pending.resolve({ text: "must be ignored" });
  await settle();
  assert.equal(controller.getState().phase, "closed");
  assert.equal(controller.getState().turns.length, 0);
  assert.equal(spoken.utterances.length, 0);
  assert.equal(commits.length, 0);
});

test("a late reply from a closed room cannot commit into a newly opened room", async () => {
  const oldReply = deferred();
  let calls = 0;
  const { controller, recognition, spoken } = createHarness({
    requestTurn: () => {
      calls += 1;
      return calls === 1 ? oldReply.promise : Promise.resolve({ text: "new-room reply" });
    },
  });
  controller.open({ consentGranted: true });
  recognition.sessions[0].callbacks.onFinal("old-room input");
  await settle();
  controller.exit();
  controller.open({ consentGranted: true });

  oldReply.resolve({ text: "stale old-room reply" });
  await settle();
  assert.equal(controller.getState().phase, "listening");
  assert.equal(controller.getState().turns.length, 0);
  assert.equal(spoken.utterances.length, 0);

  recognition.sessions[1].callbacks.onFinal("new-room input");
  await settle();
  assert.equal(controller.getState().lastTranscript, "new-room input");
  assert.equal(controller.getState().lastReply, "new-room reply");
});

test("stale recognition callbacks cannot cross room generations", async () => {
  const { controller, recognition, spoken } = createHarness();
  controller.open({ consentGranted: true });
  const stale = recognition.sessions[0];
  controller.exit();
  controller.open({ consentGranted: true });
  const current = recognition.sessions[1];

  stale.callbacks.onInterim("stale interim");
  stale.callbacks.onFinal("stale final");
  stale.callbacks.onError({ code: "stale_error" });
  stale.callbacks.onEnd();
  await settle();
  assert.equal(controller.getState().phase, "listening");
  assert.equal(controller.getState().interimTranscript, "");
  assert.equal(controller.getState().turns.length, 0);
  assert.equal(spoken.utterances.length, 0);

  current.callbacks.onInterim("current interim");
  assert.equal(controller.getState().interimTranscript, "current interim");
});

test("manual speech interrupt cancels once and stale speech callbacks cannot mutate the next turn", async () => {
  const { controller, recognition, spoken, clock } = createHarness();
  controller.open({ consentGranted: true });
  recognition.sessions[0].callbacks.onFinal("interrupt trainer");
  await settle();
  const utterance = spoken.utterances[0];
  assert.equal(controller.interrupt(), true);
  assert.equal(utterance.cancels, 1);
  assert.equal(controller.getState().phase, "cooldown");

  utterance.onEnd();
  utterance.onError({ code: "late_speech_error" });
  assert.equal(controller.getState().phase, "cooldown");
  clock.runAll();
  assert.equal(controller.getState().phase, "listening");
  assert.equal(recognition.sessions.length, 2);
});

test("replay is owned by the voice controller and does not duplicate retained turns", async () => {
  const { controller, recognition, spoken, clock } = createHarness();
  controller.open({ consentGranted: true });
  recognition.sessions[0].callbacks.onFinal("repeat that");
  await settle();
  spoken.utterances[0].onEnd();
  clock.runAll();

  assert.equal(controller.getState().phase, "listening");
  assert.equal(controller.getState().turns.length, 1);
  assert.equal(controller.replayLast(), true);
  assert.equal(recognition.sessions[1].aborts, 1);
  assert.equal(controller.getState().phase, "speaking");
  assert.deepEqual(controller.getState().caption, { role: "trainer", text: "Coach: repeat that" });
  assert.equal(spoken.utterances.length, 2);
  assert.equal(controller.getState().turns.length, 1);

  spoken.utterances[1].onEnd();
  assert.equal(controller.getState().phase, "cooldown");
  clock.runAll();
  assert.equal(controller.getState().phase, "listening");
  assert.equal(recognition.sessions.length, 3);
});

test("pause and exit cleanup are idempotent for recognition", () => {
  const { controller, recognition } = createHarness();
  controller.open({ consentGranted: true });
  const first = recognition.sessions[0];
  assert.equal(controller.pause(), true);
  assert.equal(controller.pause(), false);
  assert.equal(first.aborts, 1);
  assert.equal(controller.getState().phase, "paused");

  assert.equal(controller.exit(), true);
  assert.equal(controller.exit(), false);
  assert.equal(first.aborts, 1);
});

test("unsupported recognition pauses, but recognition without speech still commits text", async () => {
  const spoken = createSpeechHarness();
  const noRecognition = createVoiceRoomController({
    recognitionFactory: null,
    speech: spoken.speech,
    requestTurn: async () => ({ text: "never" }),
  });
  noRecognition.open({ consentGranted: true });
  assert.equal(noRecognition.getState().phase, "paused");
  assert.equal(noRecognition.getState().error.code, "recognition_unsupported");

  const recognition = createRecognitionHarness();
  const commits = [];
  const noSpeech = createVoiceRoomController({
    recognitionFactory: recognition.recognitionFactory,
    speech: null,
    requestTurn: async ({ transcript }) => ({ text: `Text reply: ${transcript}` }),
    onCommitTurn: turn => commits.push(turn),
  });
  noSpeech.open({ consentGranted: true });
  assert.equal(noSpeech.getState().phase, "listening");
  recognition.sessions[0].callbacks.onFinal("speech is unavailable");
  await settle();
  assert.equal(noSpeech.getState().phase, "cooldown");
  assert.equal(noSpeech.getState().lastTranscript, "speech is unavailable");
  assert.equal(noSpeech.getState().lastReply, "Text reply: speech is unavailable");
  assert.equal(commits.length, 1);

  assert.deepEqual(createBrowserVoiceAdapters({}).supported, { recognition: false, speech: false });
});

test("muted mode retains display text but never starts device speech", async () => {
  const { controller, recognition, spoken, clock } = createHarness();
  controller.open({ consentGranted: true });
  controller.setMuted(true);
  recognition.sessions[0].callbacks.onFinal("text only response");
  await settle();

  assert.equal(controller.getState().phase, "cooldown");
  assert.equal(controller.getState().lastTranscript, "text only response");
  assert.equal(controller.getState().lastReply, "Coach: text only response");
  assert.equal(spoken.utterances.length, 0);
  assert.equal(clock.size, 1);
});

test("backgrounding pauses cleanup and returning never restarts the microphone automatically", () => {
  const { controller, recognition } = createHarness();
  controller.open({ consentGranted: true });
  const first = recognition.sessions[0];

  assert.equal(controller.setForeground(false), true);
  assert.equal(first.aborts, 1);
  assert.equal(controller.getState().phase, "paused");
  assert.equal(controller.getState().foreground, false);
  assert.equal(controller.getState().error.code, "background_paused");

  assert.equal(controller.setForeground(true), true);
  assert.equal(controller.getState().phase, "paused");
  assert.equal(recognition.sessions.length, 1);
  assert.equal(controller.resume(), true);
  assert.equal(recognition.sessions.length, 2);
});
