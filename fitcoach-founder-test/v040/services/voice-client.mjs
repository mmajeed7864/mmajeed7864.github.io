import { CACHE_GENERATION, SPEECH_API, TRAINER_TONES, VOICE_PERSONAS } from "../core/constants.mjs";

export const SPEECH_DATA_CLASSIFICATION = "generated_coach_reply_text";
export const MAX_SPEECH_TEXT_CHARS = 1_200;
export const MAX_SPEECH_AUDIO_BYTES = 5_000_000;

const GENDER_BY_PERSONA = Object.freeze({
  nova: "female",
  atlas: "male",
  bennett: "male",
  mira: "female",
});

function cleanText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_SPEECH_TEXT_CHARS);
}

function sessionCode(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/gu, "")
    .slice(0, 80);
}

function normalizedTone(value) {
  const match = TRAINER_TONES.find(tone => tone.toLowerCase() === String(value || "").toLowerCase());
  return (match || "Direct").toLowerCase();
}

function normalizedPersona(value) {
  return VOICE_PERSONAS.includes(value) ? value : "nova";
}

export function createSpeechPayload({ text, sessionId, tone, voicePersona }) {
  const cleaned = cleanText(text);
  const safeSessionId = sessionCode(sessionId);
  const persona = normalizedPersona(voicePersona);
  if (!cleaned || safeSessionId.length < 8) return null;
  return Object.freeze({
    text: cleaned,
    session_id: safeSessionId,
    data_classification: SPEECH_DATA_CLASSIFICATION,
    tone: normalizedTone(tone),
    voice_gender: GENDER_BY_PERSONA[persona],
    voice_profile: persona,
  });
}

function validAudioResponse(response) {
  const type = String(response.headers?.get?.("content-type") || "").toLowerCase();
  const length = Number(response.headers?.get?.("content-length") || 0);
  if (length > MAX_SPEECH_AUDIO_BYTES) return false;
  return !type || type.startsWith("audio/");
}

function voiceFallbackReason(response) {
  if (!response) return "premium_voice_unavailable";
  if (response.status === 429) return String(response.headers?.get?.("x-fitcoach-voice-limit") || "").includes("monthly")
    ? "premium_voice_monthly_budget"
    : "premium_voice_rate_limited";
  if (response.status === 503) return "premium_voice_unavailable";
  if (response.status >= 500) return "premium_voice_provider_error";
  return "premium_voice_invalid_response";
}

/**
 * Streams only bounded trainer reply text to the server-side ElevenLabs route.
 * The browser never sends microphone audio. Failed cloud playback falls back to
 * injected device speech, and every in-flight request/player is cancellable.
 */
export function createPremiumVoiceClient({
  endpoint = SPEECH_API,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  audioFactory = url => new Audio(url),
  createObjectURL = blob => URL.createObjectURL(blob),
  revokeObjectURL = url => URL.revokeObjectURL(url),
  timeoutMs = 12_000,
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
} = {}) {
  let active = null;

  function cancel() {
    active?.cancel();
  }

  function speak({
    text,
    sessionId,
    tone,
    voicePersona,
    deviceFallback,
    onEnd = () => {},
    onError = () => {},
    onMetadata = () => {},
  }) {
    cancel();
    const payload = createSpeechPayload({ text, sessionId, tone, voicePersona });
    const controller = new AbortController();
    let audio = null;
    let deviceHandle = null;
    let objectUrl = null;
    let timer = null;
    let settled = false;
    let cancelled = false;
    let fallbackStarted = false;

    const cleanupCloud = () => {
      if (timer && clearTimer) clearTimer(timer);
      timer = null;
      try { audio?.pause?.(); } catch {}
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
      }
      audio = null;
      if (objectUrl) {
        try { revokeObjectURL(objectUrl); } catch {}
        objectUrl = null;
      }
    };

    const finish = (kind, error) => {
      if (settled || cancelled) return;
      settled = true;
      cleanupCloud();
      if (active === handle) active = null;
      if (kind === "end") onEnd();
      else onError(error || new Error("VOICE_PLAYBACK_UNAVAILABLE"));
    };

    const useDeviceFallback = error => {
      if (settled || cancelled || fallbackStarted) return;
      fallbackStarted = true;
      cleanupCloud();
      if (typeof deviceFallback !== "function") return finish("error", error);
      try {
        onMetadata({
          provider: "device",
          profile: normalizedPersona(voicePersona),
          fallbackUsed: true,
          fallbackReason: error?.fitcoachReason || error?.message || "premium_voice_unavailable",
        });
        deviceHandle = deviceFallback({
          onEnd: () => finish("end"),
          onError: fallbackError => finish("error", fallbackError || error),
        }) || null;
      } catch (fallbackError) {
        finish("error", fallbackError);
      }
    };

    const handle = {
      cancel() {
        if (cancelled || settled) return;
        cancelled = true;
        controller.abort("cancelled");
        try { deviceHandle?.cancel?.(); } catch {}
        cleanupCloud();
        if (active === handle) active = null;
      },
    };
    active = handle;

    (async () => {
      if (!payload || typeof fetchImpl !== "function") {
        useDeviceFallback(new Error("PREMIUM_VOICE_UNAVAILABLE"));
        return;
      }
      if (setTimer) timer = setTimer(() => controller.abort("timeout"), timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-FitCoach-Build": CACHE_GENERATION,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!response?.ok || !validAudioResponse(response)) {
          const error = new Error(voiceFallbackReason(response));
          error.fitcoachReason = error.message;
          throw error;
        }
        const blob = await response.blob();
        if (!blob?.size || blob.size > MAX_SPEECH_AUDIO_BYTES) throw new Error("PREMIUM_VOICE_RESPONSE_INVALID");
        if (cancelled) return;
        objectUrl = createObjectURL(blob);
        audio = audioFactory(objectUrl, Object.freeze({ blob }));
        audio.preload = "auto";
        audio.onended = () => finish("end");
        audio.onerror = error => useDeviceFallback(error);
        onMetadata({
          provider: response.headers?.get?.("x-fitcoach-voice-provider") || "elevenlabs",
          profile: response.headers?.get?.("x-fitcoach-voice-profile") || `${normalizedPersona(voicePersona)}-${normalizedTone(tone)}`,
          fallbackUsed: false,
        });
        await audio.play();
      } catch (error) {
        if (!cancelled) useDeviceFallback(error);
      }
    })();

    return handle;
  }

  return Object.freeze({ speak, cancel });
}
