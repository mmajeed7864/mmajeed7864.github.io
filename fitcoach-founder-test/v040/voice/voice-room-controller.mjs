import {
  createInitialVoiceRoomState,
  reduceVoiceRoomState,
} from "./voice-room-state.mjs";

const DEFAULT_COOLDOWN_MS = 250;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeClassification(value) {
  if (value === "safety" || value?.kind === "safety") return "safety";
  if (value === "private" || value?.kind === "private") return "private";
  return "normal";
}

function normalizeReply(value) {
  if (typeof value === "string") {
    return { text: normalizeText(value), speak: true, safety: false, private: false };
  }

  return {
    text: normalizeText(value?.text ?? value?.reply ?? value?.display_text),
    speak: value?.speak !== false,
    safety: Boolean(value?.safetyIntercepted ?? value?.safety_intercepted),
    private: Boolean(value?.privateIntercepted ?? value?.private_intercepted ?? value?.privacy_intercepted),
  };
}

function errorDetails(error, fallbackCode, fallbackMessage) {
  return {
    code: normalizeText(error?.code) || fallbackCode,
    message: normalizeText(error?.userMessage) || fallbackMessage,
  };
}

/**
 * Persistent, foreground-only, half-duplex voice-room controller.
 *
 * Recognition, device speech, request, policy classification, persistence, and
 * time are all injected. The controller never handles or stores an audio blob.
 */
export function createVoiceRoomController({
  recognitionFactory,
  speech,
  requestTurn,
  classifyInput = () => ({ kind: "normal" }),
  onCommitTurn = () => {},
  onStateChange = () => {},
  onSafety = () => {},
  clock = globalThis,
  createRoomId,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  initiallyForeground = true,
} = {}) {
  let state = createInitialVoiceRoomState();
  let foreground = Boolean(initiallyForeground);
  if (!foreground) state = reduceVoiceRoomState(state, { type: "SET_FOREGROUND", foreground: false });
  let roomGenerationSerial = 0;
  let turnSerial = 0;
  let turnGenerationSerial = 0;
  let activeRecognition = null;
  let activeSpeech = null;
  let activeRequest = null;
  let cooldownTimer = null;
  let retryStage = null;
  const listeners = new Set();

  const setTimer = typeof clock?.setTimeout === "function"
    ? clock.setTimeout.bind(clock)
    : globalThis.setTimeout.bind(globalThis);
  const clearTimer = typeof clock?.clearTimeout === "function"
    ? clock.clearTimeout.bind(clock)
    : globalThis.clearTimeout.bind(globalThis);

  function notify(callback, ...args) {
    try {
      callback(...args);
    } catch {
      // Observer/storage failures must not corrupt microphone or request cleanup.
    }
  }

  function publish(event) {
    state = reduceVoiceRoomState(state, event);
    notify(onStateChange, state, event);
    for (const listener of listeners) notify(listener, state, event);
    return state;
  }

  function currentRoom(roomGeneration) {
    return state.active && state.roomGeneration === roomGeneration;
  }

  function currentTurn(roomGeneration, turnGeneration) {
    return currentRoom(roomGeneration) && state.turnGeneration === turnGeneration;
  }

  function clearCooldown() {
    if (!cooldownTimer) return;
    clearTimer(cooldownTimer.id);
    cooldownTimer = null;
  }

  function closeRecognition(method = "abort") {
    const record = activeRecognition;
    if (!record) return;
    activeRecognition = null;
    if (record.cleaned) return;
    record.cleaned = true;
    const operation = record.session?.[method];
    if (typeof operation === "function") {
      try { operation.call(record.session); } catch { /* cleanup remains complete */ }
    }
  }

  function closeSpeech() {
    const record = activeSpeech;
    if (!record) return;
    activeSpeech = null;
    if (record.cleaned) return;
    record.cleaned = true;
    try {
      if (typeof record.handle?.cancel === "function") record.handle.cancel();
      else if (typeof speech?.cancel === "function") speech.cancel();
    } catch {
      // The stale callback guards still prevent a cancelled turn from reviving.
    }
  }

  function abortRequest() {
    const record = activeRequest;
    if (!record) return;
    activeRequest = null;
    if (record.aborted) return;
    record.aborted = true;
    try { record.controller.abort(); } catch { /* cleanup remains complete */ }
  }

  function invalidateTurnEffects() {
    turnGenerationSerial += 1;
    clearCooldown();
    closeRecognition("abort");
    closeSpeech();
    abortRequest();
  }

  function pauseFor(code, message) {
    invalidateTurnEffects();
    if (["closed", "consent", "paused", "safety_stop"].includes(state.phase)) return state;
    return publish({ type: "PAUSE", code, message });
  }

  function scheduleNextListen(roomGeneration) {
    clearCooldown();
    const token = Object.freeze({ roomGeneration });
    const id = setTimer(() => {
      if (cooldownTimer?.token !== token) return;
      cooldownTimer = null;
      if (!currentRoom(roomGeneration) || state.phase !== "cooldown") return;
      publish({ type: "COOLDOWN_FINISHED" });
      beginListening(roomGeneration);
    }, Math.max(0, Number(cooldownMs) || 0));
    cooldownTimer = { id, token };
  }

  function finishNormally(roomGeneration) {
    if (!currentRoom(roomGeneration) || state.phase !== "cooldown") return;
    scheduleNextListen(roomGeneration);
  }

  function stopForIntercept(kind, roomGeneration, turnGeneration) {
    if (!currentTurn(roomGeneration, turnGeneration)) return;
    abortRequest();
    retryStage = null;
    const safety = kind === "safety";
    publish({
      type: safety ? "SAFETY_STOP" : "PRIVATE_STOP",
      code: safety ? "safety_intercepted" : "private_input",
      message: safety
        ? "Voice mode stopped for safety. Use the on-screen safety guidance."
        : "That input was not retained. Voice mode is paused.",
    });
    if (safety) {
      // Deliberately omit the spoken transcript from this callback.
      notify(onSafety, Object.freeze({ kind, roomId: state.roomId, turnId: state.turnId }));
    }
  }

  async function performRequest(roomGeneration, turnGeneration) {
    if (!currentTurn(roomGeneration, turnGeneration) || state.phase !== "finalizing") return;
    if (typeof requestTurn !== "function") {
      retryStage = "request";
      publish({
        type: "RETRYABLE_FAILURE",
        turnGeneration,
        code: "request_unavailable",
        message: "Trainer reply is unavailable. Tap retry when ready.",
      });
      return;
    }

    publish({ type: "REQUEST_STARTED", turnGeneration });
    const controller = new AbortController();
    const requestRecord = { controller, roomGeneration, turnGeneration, aborted: false };
    activeRequest = requestRecord;

    try {
      const value = await requestTurn(Object.freeze({
        transcript: state.pendingTranscript,
        roomId: state.roomId,
        turnId: state.turnId,
        signal: controller.signal,
      }));
      if (activeRequest === requestRecord) activeRequest = null;
      if (!currentTurn(roomGeneration, turnGeneration) || state.phase !== "thinking") return;

      const reply = normalizeReply(value);
      if (reply.safety) {
        stopForIntercept("safety", roomGeneration, turnGeneration);
        return;
      }
      if (reply.private) {
        stopForIntercept("private", roomGeneration, turnGeneration);
        return;
      }
      if (!reply.text) throw Object.assign(new Error("EMPTY_TRAINER_REPLY"), { code: "empty_reply" });

      retryStage = null;
      const speechAvailable = Boolean(speech && typeof speech.speak === "function");
      const shouldSpeak = reply.speak && !state.muted && speechAvailable;
      publish({ type: "REPLY_READY", text: reply.text, willSpeak: shouldSpeak });
      const committedTurn = state.turns[state.turns.length - 1];
      notify(onCommitTurn, committedTurn);

      if (!shouldSpeak) {
        finishNormally(roomGeneration);
        return;
      }
      beginSpeech(reply.text, roomGeneration, turnGeneration);
    } catch (error) {
      if (activeRequest === requestRecord) activeRequest = null;
      if (!currentTurn(roomGeneration, turnGeneration) || state.phase !== "thinking") return;
      if (controller.signal.aborted || error?.name === "AbortError") return;
      const details = errorDetails(error, "trainer_unavailable", "Trainer reply failed. Tap retry when ready.");
      retryStage = "request";
      publish({ type: "RETRYABLE_FAILURE", turnGeneration, ...details });
    }
  }

  async function processInput(roomGeneration, turnGeneration) {
    if (!currentTurn(roomGeneration, turnGeneration) || state.phase !== "finalizing") return;
    try {
      const classification = normalizeClassification(await classifyInput(state.pendingTranscript));
      if (!currentTurn(roomGeneration, turnGeneration) || state.phase !== "finalizing") return;
      if (classification !== "normal") {
        stopForIntercept(classification, roomGeneration, turnGeneration);
        return;
      }
      await performRequest(roomGeneration, turnGeneration);
    } catch (error) {
      if (!currentTurn(roomGeneration, turnGeneration) || state.phase !== "finalizing") return;
      const details = errorDetails(error, "classification_failed", "Voice safety check failed. Tap retry when ready.");
      retryStage = "classify";
      publish({ type: "RETRYABLE_FAILURE", turnGeneration, ...details });
    }
  }

  function beginSpeech(text, roomGeneration, turnGeneration, { after = "cooldown" } = {}) {
    if (!currentTurn(roomGeneration, turnGeneration) || state.phase !== "speaking") return;
    let handle;
    const record = { handle: null, roomGeneration, turnGeneration, cleaned: false, after };
    activeSpeech = record;
    const onEnd = () => {
      if (activeSpeech !== record) return;
      activeSpeech = null;
      record.cleaned = true;
      if (!currentTurn(roomGeneration, turnGeneration) || state.phase !== "speaking") return;
      if (record.after === "paused") {
        publish({ type: "PAUSE", code: "replay_finished", message: "Replay finished. Tap resume when ready." });
        return;
      }
      publish({ type: "SPEECH_FINISHED" });
      finishNormally(roomGeneration);
    };
    const onError = error => {
      if (activeSpeech !== record) return;
      activeSpeech = null;
      record.cleaned = true;
      if (!currentTurn(roomGeneration, turnGeneration) || state.phase !== "speaking") return;
      const details = errorDetails(error, "speech_failed", "Device speech failed. Voice mode is paused.");
      publish({ type: "PAUSE", ...details });
    };

    try {
      handle = speech.speak({ text, onEnd, onError });
      record.handle = handle ?? null;
    } catch (error) {
      onError(error);
    }
  }

  function acceptFinalTranscript(rawText, roomGeneration, recognitionRecord) {
    if (activeRecognition !== recognitionRecord || !currentRoom(roomGeneration) || state.phase !== "listening") return;
    const text = normalizeText(rawText);
    closeRecognition("stop");
    if (!text) {
      publish({ type: "PAUSE", code: "no_speech", message: "No speech was detected. Tap resume to try again." });
      return;
    }

    const turnId = ++turnSerial;
    const turnGeneration = ++turnGenerationSerial;
    publish({ type: "FINAL_TRANSCRIPT", text, turnId, turnGeneration });
    processInput(roomGeneration, turnGeneration);
  }

  function beginListening(roomGeneration) {
    if (!currentRoom(roomGeneration) || state.phase !== "starting") return false;
    if (!foreground) {
      publish({ type: "PAUSE", code: "foreground_required", message: "Return to FitCoach and tap resume to use voice mode." });
      return false;
    }
    if (typeof recognitionFactory !== "function") {
      publish({ type: "PAUSE", code: "recognition_unsupported", message: "Voice recognition is not supported on this device." });
      return false;
    }
    if (activeRecognition) return false;

    const recognitionGeneration = ++turnGenerationSerial;
    let record;
    const callbacks = {
      onInterim(value) {
        if (activeRecognition !== record || !currentRoom(roomGeneration) || state.phase !== "listening") return;
        const text = normalizeText(value);
        if (text) publish({ type: "INTERIM_TRANSCRIPT", text });
      },
      onFinal(value) {
        acceptFinalTranscript(value, roomGeneration, record);
      },
      onError(error) {
        if (activeRecognition !== record || !currentRoom(roomGeneration) || state.phase !== "listening") return;
        closeRecognition("abort");
        const details = errorDetails(error, "recognition_failed", "Voice recognition failed. Tap resume to try again.");
        publish({ type: "PAUSE", ...details });
      },
      onEnd() {
        if (activeRecognition !== record || !currentRoom(roomGeneration) || state.phase !== "listening") return;
        activeRecognition = null;
        record.cleaned = true;
        publish({ type: "PAUSE", code: "recognition_ended", message: "Listening ended. Tap resume when ready." });
      },
    };

    try {
      const session = recognitionFactory(callbacks);
      if (!session || typeof session.start !== "function") throw new Error("INVALID_RECOGNITION_SESSION");
      record = { session, roomGeneration, recognitionGeneration, cleaned: false };
      activeRecognition = record;
      publish({ type: "LISTENING_STARTED" });
      session.start();
      return true;
    } catch (error) {
      if (activeRecognition === record) closeRecognition("abort");
      const details = errorDetails(error, "recognition_start_failed", "Voice recognition could not start. Tap resume to try again.");
      if (state.phase === "starting" || state.phase === "listening") publish({ type: "PAUSE", ...details });
      return false;
    }
  }

  function open({ consentGranted = state.consentGranted } = {}) {
    if (state.active || state.phase !== "closed") return false;
    const roomGeneration = ++roomGenerationSerial;
    const roomId = typeof createRoomId === "function"
      ? createRoomId(roomGeneration)
      : `voice-room-${roomGeneration}`;
    publish({ type: consentGranted ? "OPEN_DIRECT" : "OPEN_CONSENT", roomId, roomGeneration });
    if (consentGranted) beginListening(roomGeneration);
    return true;
  }

  function grantConsent() {
    if (state.phase !== "consent") return false;
    const roomGeneration = state.roomGeneration;
    publish({ type: "CONSENT_GRANTED" });
    beginListening(roomGeneration);
    return true;
  }

  function pause() {
    if (["closed", "consent", "paused", "safety_stop"].includes(state.phase)) return false;
    pauseFor(null, "Voice mode paused.");
    return true;
  }

  function resume() {
    if (state.phase !== "paused") return false;
    const roomGeneration = state.roomGeneration;
    publish({ type: "RESUME" });
    beginListening(roomGeneration);
    return true;
  }

  function retry() {
    if (state.phase !== "retryable_error" || !state.pendingTranscript) return false;
    const roomGeneration = state.roomGeneration;
    const turnGeneration = ++turnGenerationSerial;
    const stage = retryStage;
    publish({ type: "RETRY", turnGeneration });
    if (stage === "classify") processInput(roomGeneration, turnGeneration);
    else performRequest(roomGeneration, turnGeneration);
    return true;
  }

  function interrupt() {
    if (state.phase === "speaking") {
      const roomGeneration = state.roomGeneration;
      const returnPaused = activeSpeech?.after === "paused";
      closeSpeech();
      if (returnPaused) {
        publish({ type: "PAUSE", code: "replay_interrupted", message: "Replay stopped. Tap resume when ready." });
        return true;
      }
      publish({ type: "SPEECH_INTERRUPTED" });
      finishNormally(roomGeneration);
      return true;
    }
    if (["starting", "listening", "finalizing", "thinking", "cooldown", "retryable_error"].includes(state.phase)) {
      pauseFor("interrupted", "Voice turn interrupted. Tap resume when ready.");
      return true;
    }
    return false;
  }

  function replayLast() {
    if (!state.active || state.phase === "closed" || state.phase === "consent" || state.phase === "safety_stop") return false;
    const text = normalizeText(state.lastReply);
    if (!text || state.muted || typeof speech?.speak !== "function") return false;
    const roomGeneration = state.roomGeneration;
    const returnPaused = state.phase === "paused" || state.phase === "retryable_error";
    invalidateTurnEffects();
    const turnGeneration = ++turnGenerationSerial;
    publish({ type: "REPLAY_STARTED", text, turnGeneration });
    beginSpeech(text, roomGeneration, turnGeneration, { after: returnPaused ? "paused" : "cooldown" });
    return true;
  }

  function setMuted(muted) {
    if (!state.active || state.phase === "closed") return false;
    const shouldMute = Boolean(muted);
    publish({ type: "SET_MUTED", muted: shouldMute });
    if (shouldMute && state.phase === "speaking") interrupt();
    return true;
  }

  function setForeground(value) {
    const nextForeground = Boolean(value);
    if (foreground === nextForeground) return false;
    foreground = nextForeground;
    publish({ type: "SET_FOREGROUND", foreground });
    if (!foreground && !["closed", "consent", "paused", "safety_stop"].includes(state.phase)) {
      pauseFor("background_paused", "Voice mode paused while FitCoach is in the background.");
    }
    // Returning to the foreground never resumes the microphone automatically.
    return true;
  }

  function exit() {
    if (state.phase === "closed") return false;
    roomGenerationSerial += 1;
    invalidateTurnEffects();
    retryStage = null;
    publish({ type: "CLOSE" });
    return true;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("VOICE_LISTENER_MUST_BE_A_FUNCTION");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    open,
    grantConsent,
    pause,
    resume,
    retry,
    interrupt,
    replayLast,
    setMuted,
    setForeground,
    exit,
    getState: () => state,
    subscribe,
  });
}

/**
 * Optional browser adapter factory. The controller still receives these as
 * injected capabilities; unsupported browsers return null capabilities.
 */
export function createBrowserVoiceAdapters(scope = globalThis) {
  const Recognition = scope?.SpeechRecognition ?? scope?.webkitSpeechRecognition;
  const synthesis = scope?.speechSynthesis;
  const Utterance = scope?.SpeechSynthesisUtterance;

  const recognitionFactory = typeof Recognition === "function"
    ? callbacks => {
      const instance = new Recognition();
      instance.continuous = false;
      instance.interimResults = true;
      instance.onresult = event => {
        let interim = "";
        let final = "";
        for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result?.[0]?.transcript ?? "";
          if (result?.isFinal) final += text;
          else interim += text;
        }
        if (interim.trim()) callbacks.onInterim(interim);
        if (final.trim()) callbacks.onFinal(final);
      };
      instance.onerror = event => callbacks.onError(Object.assign(new Error(event?.error || "recognition_failed"), { code: event?.error }));
      instance.onend = () => callbacks.onEnd();
      return {
        start: () => instance.start(),
        stop: () => instance.stop(),
        abort: () => instance.abort(),
      };
    }
    : null;

  const speech = synthesis && typeof Utterance === "function"
    ? {
      speak({ text, onEnd, onError }) {
        const utterance = new Utterance(text);
        utterance.onend = onEnd;
        utterance.onerror = onError;
        synthesis.speak(utterance);
        return { cancel: () => synthesis.cancel() };
      },
      cancel: () => synthesis.cancel(),
    }
    : null;

  return Object.freeze({
    recognitionFactory,
    speech,
    supported: Object.freeze({
      recognition: Boolean(recognitionFactory),
      speech: Boolean(speech),
    }),
  });
}
