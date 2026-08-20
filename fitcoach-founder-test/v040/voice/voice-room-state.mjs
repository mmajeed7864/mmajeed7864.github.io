/**
 * FitCoach v0.4 voice-room state.
 *
 * This module is deliberately pure. It owns no browser, network, microphone, or
 * speech side effects, which keeps privacy and lifecycle behavior testable.
 */

export const VOICE_ROOM_PHASES = Object.freeze([
  "closed",
  "consent",
  "starting",
  "listening",
  "finalizing",
  "thinking",
  "speaking",
  "cooldown",
  "paused",
  "retryable_error",
  "safety_stop",
]);

const PHASE_SET = new Set(VOICE_ROOM_PHASES);

function freezeTurn(turn) {
  return Object.freeze({ ...turn });
}

function freezeState(state) {
  return Object.freeze({
    ...state,
    caption: Object.freeze({ ...state.caption }),
    turns: Object.freeze(state.turns.map(freezeTurn)),
    error: state.error ? Object.freeze({ ...state.error }) : null,
  });
}

export function createInitialVoiceRoomState() {
  return freezeState({
    active: false,
    phase: "closed",
    roomId: null,
    roomGeneration: 0,
    turnId: 0,
    turnGeneration: 0,
    consentGranted: false,
    foreground: true,
    muted: false,
    interimTranscript: "",
    pendingTranscript: "",
    currentReply: "",
    lastTranscript: "",
    lastReply: "",
    caption: { role: "status", text: "" },
    speechAvailable: true,
    turns: [],
    error: null,
  });
}

function requirePhase(state, allowed, eventType) {
  if (!allowed.includes(state.phase)) {
    throw new Error(`INVALID_VOICE_TRANSITION:${state.phase}:${eventType}`);
  }
}

/**
 * Reduce one lifecycle event. Safety/private stop events intentionally clear
 * the in-progress transcript before it can reach the retained turn history.
 */
export function reduceVoiceRoomState(state, event) {
  if (!state || !PHASE_SET.has(state.phase)) throw new Error("INVALID_VOICE_STATE");
  if (!event || typeof event.type !== "string") throw new Error("INVALID_VOICE_EVENT");

  let next;
  switch (event.type) {
    case "OPEN_CONSENT":
      requirePhase(state, ["closed"], event.type);
      next = {
        ...state,
        active: true,
        phase: "consent",
        roomId: event.roomId,
        roomGeneration: event.roomGeneration,
        consentGranted: false,
        interimTranscript: "",
        pendingTranscript: "",
        currentReply: "",
        caption: { role: "status", text: "Microphone permission is required to start voice mode." },
        error: null,
      };
      break;

    case "OPEN_DIRECT":
      requirePhase(state, ["closed"], event.type);
      next = {
        ...state,
        active: true,
        phase: "starting",
        roomId: event.roomId,
        roomGeneration: event.roomGeneration,
        consentGranted: true,
        interimTranscript: "",
        pendingTranscript: "",
        currentReply: "",
        caption: { role: "status", text: "Starting voice mode…" },
        error: null,
      };
      break;

    case "CONSENT_GRANTED":
      requirePhase(state, ["consent"], event.type);
      next = {
        ...state,
        phase: "starting",
        consentGranted: true,
        caption: { role: "status", text: "Starting voice mode…" },
        error: null,
      };
      break;

    case "LISTENING_STARTED":
      requirePhase(state, ["starting"], event.type);
      next = {
        ...state,
        phase: "listening",
        interimTranscript: "",
        pendingTranscript: "",
        currentReply: "",
        caption: { role: "status", text: "Listening…" },
        error: null,
      };
      break;

    case "INTERIM_TRANSCRIPT":
      requirePhase(state, ["listening"], event.type);
      next = {
        ...state,
        interimTranscript: event.text,
        caption: { role: "user", text: event.text },
      };
      break;

    case "FINAL_TRANSCRIPT":
      requirePhase(state, ["listening"], event.type);
      next = {
        ...state,
        phase: "finalizing",
        turnId: event.turnId,
        turnGeneration: event.turnGeneration,
        interimTranscript: "",
        pendingTranscript: event.text,
        currentReply: "",
        caption: { role: "user", text: event.text },
        error: null,
      };
      break;

    case "REQUEST_STARTED":
      requirePhase(state, ["finalizing"], event.type);
      next = {
        ...state,
        phase: "thinking",
        turnGeneration: event.turnGeneration,
        caption: { role: "status", text: "Trainer is thinking…" },
        error: null,
      };
      break;

    case "REPLY_READY": {
      requirePhase(state, ["thinking"], event.type);
      const turn = {
        id: state.turnId,
        transcript: state.pendingTranscript,
        reply: event.text,
      };
      next = {
        ...state,
        phase: event.willSpeak ? "speaking" : "cooldown",
        pendingTranscript: "",
        currentReply: event.text,
        lastTranscript: turn.transcript,
        lastReply: turn.reply,
        caption: { role: "trainer", text: event.text },
        turns: [...state.turns, turn],
        error: null,
      };
      break;
    }

    case "REPLAY_STARTED":
      requirePhase(state, ["starting", "listening", "finalizing", "thinking", "speaking", "cooldown", "paused", "retryable_error"], event.type);
      next = {
        ...state,
        phase: "speaking",
        turnGeneration: event.turnGeneration,
        interimTranscript: "",
        pendingTranscript: "",
        currentReply: event.text,
        caption: { role: "trainer", text: event.text },
        error: null,
      };
      break;

    case "SPEECH_FINISHED":
      requirePhase(state, ["speaking"], event.type);
      next = {
        ...state,
        phase: "cooldown",
        caption: { role: "status", text: "Ready for your next question." },
      };
      break;

    case "SPEECH_INTERRUPTED":
      requirePhase(state, ["speaking"], event.type);
      next = {
        ...state,
        phase: "cooldown",
        caption: { role: "status", text: "Trainer stopped. Listening again…" },
      };
      break;

    case "COOLDOWN_FINISHED":
      requirePhase(state, ["cooldown"], event.type);
      next = {
        ...state,
        phase: "starting",
        currentReply: "",
        caption: { role: "status", text: "Starting voice mode…" },
      };
      break;

    case "RETRYABLE_FAILURE":
      requirePhase(state, ["finalizing", "thinking"], event.type);
      next = {
        ...state,
        phase: "retryable_error",
        turnGeneration: event.turnGeneration ?? state.turnGeneration,
        caption: { role: "status", text: event.message },
        error: { code: event.code, message: event.message },
      };
      break;

    case "RETRY":
      requirePhase(state, ["retryable_error"], event.type);
      next = {
        ...state,
        phase: "finalizing",
        turnGeneration: event.turnGeneration,
        caption: { role: "user", text: state.pendingTranscript },
        error: null,
      };
      break;

    case "PAUSE":
      requirePhase(state, ["starting", "listening", "finalizing", "thinking", "speaking", "cooldown", "retryable_error"], event.type);
      next = {
        ...state,
        phase: "paused",
        interimTranscript: "",
        pendingTranscript: "",
        currentReply: "",
        caption: { role: "status", text: event.message || "Voice mode paused." },
        error: event.code ? { code: event.code, message: event.message || "Voice mode paused." } : null,
      };
      break;

    case "RESUME":
      requirePhase(state, ["paused"], event.type);
      next = {
        ...state,
        phase: "starting",
        caption: { role: "status", text: "Starting voice mode…" },
        error: null,
      };
      break;

    case "SAFETY_STOP":
      requirePhase(state, ["listening", "finalizing", "thinking"], event.type);
      next = {
        ...state,
        phase: "safety_stop",
        interimTranscript: "",
        pendingTranscript: "",
        currentReply: "",
        caption: { role: "status", text: event.message || "Voice mode stopped for safety." },
        error: { code: event.code || "safety_intercepted", message: event.message || "Voice mode stopped for safety." },
      };
      break;

    case "PRIVATE_STOP":
      requirePhase(state, ["listening", "finalizing", "thinking"], event.type);
      next = {
        ...state,
        phase: "paused",
        interimTranscript: "",
        pendingTranscript: "",
        currentReply: "",
        caption: { role: "status", text: event.message || "That input was not retained. Voice mode is paused." },
        error: { code: event.code || "private_input", message: event.message || "That input was not retained. Voice mode is paused." },
      };
      break;

    case "SET_MUTED":
      requirePhase(state, VOICE_ROOM_PHASES.filter(phase => phase !== "closed"), event.type);
      next = { ...state, muted: Boolean(event.muted) };
      break;

    case "SET_FOREGROUND":
      next = { ...state, foreground: Boolean(event.foreground) };
      break;

    case "CLOSE":
      next = {
        ...state,
        active: false,
        phase: "closed",
        roomId: null,
        consentGranted: state.consentGranted,
        muted: false,
        interimTranscript: "",
        pendingTranscript: "",
        currentReply: "",
        caption: { role: "status", text: "" },
        error: null,
      };
      break;

    default:
      throw new Error(`UNKNOWN_VOICE_EVENT:${event.type}`);
  }

  return freezeState(next);
}

// Compact aliases keep the state module convenient outside the app runtime.
export const createVoiceRoomState = createInitialVoiceRoomState;
export const reduceVoiceRoom = reduceVoiceRoomState;
