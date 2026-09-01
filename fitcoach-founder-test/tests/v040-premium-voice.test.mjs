import assert from "node:assert/strict";
import test from "node:test";

import {
  createPremiumVoiceClient,
  createSpeechPayload,
} from "../v040/services/voice-client.mjs";

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("premium voice payload is exact, bounded, and maps reviewed personas to gender and profile", () => {
  assert.deepEqual(createSpeechPayload({
    text: "  One   honest set.  ",
    sessionId: "fitcoach-mo-voice-v040",
    tone: "Supportive",
    voicePersona: "nova",
  }), {
    text: "One honest set.",
    session_id: "fitcoach-mo-voice-v040",
    data_classification: "generated_coach_reply_text",
    tone: "supportive",
    voice_gender: "female",
    voice_profile: "nova",
  });
  assert.equal(createSpeechPayload({
    text: "Stay exact.",
    sessionId: "fitcoach-ravi-voice-v040",
    tone: "Strict",
    voicePersona: "atlas",
  }).voice_gender, "male");
  assert.deepEqual(createSpeechPayload({
    text: "Clear and calm.",
    sessionId: "fitcoach-mo-voice-v040",
    tone: "Direct",
    voicePersona: "bennett",
  }).voice_profile, "bennett");
  assert.equal(createSpeechPayload({ text: "", sessionId: "valid-session", tone: "Direct", voicePersona: "nova" }), null);
  assert.equal(createSpeechPayload({ text: "Ready", sessionId: "short", tone: "Direct", voicePersona: "nova" }), null);
});

test("ElevenLabs audio plays once and releases the object URL", async () => {
  const requests = [];
  const metadata = [];
  const revoked = [];
  let audio;
  let ended = 0;
  const client = createPremiumVoiceClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(new Blob(["premium-audio"], { type: "audio/mpeg" }), {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "x-fitcoach-voice-provider": "elevenlabs",
          "x-fitcoach-voice-profile": "nova-supportive",
        },
      });
    },
    audioFactory: url => {
      audio = { url, preload: "", onended: null, onerror: null, pauses: 0, plays: 0, async play() { this.plays += 1; }, pause() { this.pauses += 1; } };
      return audio;
    },
    createObjectURL: () => "blob:premium-voice",
    revokeObjectURL: url => revoked.push(url),
    setTimer: () => 1,
    clearTimer: () => {},
  });

  client.speak({
    text: "You completed the useful work.",
    sessionId: "fitcoach-mo-voice-v040",
    tone: "Supportive",
    voicePersona: "nova",
    onEnd: () => { ended += 1; },
    onMetadata: value => metadata.push(value),
  });
  await tick();
  await tick();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://symbioai.dev/api/fitcoach-speech-v2");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(Object.keys(JSON.parse(requests[0].options.body)).sort(), ["data_classification", "session_id", "text", "tone", "voice_gender", "voice_profile"]);
  assert.equal(audio.plays, 1);
  assert.deepEqual(metadata, [{ provider: "elevenlabs", profile: "nova-supportive", fallbackUsed: false }]);

  audio.onended();
  assert.equal(ended, 1);
  assert.deepEqual(revoked, ["blob:premium-voice"]);
});

test("provider or autoplay failure falls back to device speech exactly once", async () => {
  let fallback = 0;
  let fallbackCallbacks;
  let ended = 0;
  const metadata = [];
  const client = createPremiumVoiceClient({
    fetchImpl: async () => new Response(JSON.stringify({ ok: false }), { status: 503, headers: { "content-type": "application/json" } }),
    setTimer: () => 1,
    clearTimer: () => {},
  });

  client.speak({
    text: "Keep the next action clear.",
    sessionId: "fitcoach-mo-voice-v040",
    tone: "Direct",
    voicePersona: "atlas",
    deviceFallback: callbacks => {
      fallback += 1;
      fallbackCallbacks = callbacks;
      return { cancel() {} };
    },
    onEnd: () => { ended += 1; },
    onMetadata: value => metadata.push(value),
  });
  await tick();

  assert.equal(fallback, 1);
  assert.deepEqual(metadata, [{
    provider: "device",
    profile: "atlas",
    fallbackUsed: true,
    fallbackReason: "premium_voice_unavailable",
  }]);
  fallbackCallbacks.onEnd();
  assert.equal(ended, 1);
});

test("premium voice rate or budget limits are exposed before device fallback", async () => {
  const metadata = [];
  const client = createPremiumVoiceClient({
    fetchImpl: async () => new Response(JSON.stringify({ ok: false }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "x-fitcoach-voice-limit": "monthly-char-budget",
      },
    }),
    setTimer: () => 1,
    clearTimer: () => {},
  });

  client.speak({
    text: "Keep the text available.",
    sessionId: "fitcoach-mo-voice-v040",
    tone: "Strict",
    voicePersona: "atlas",
    deviceFallback: () => ({ cancel() {} }),
    onMetadata: value => metadata.push(value),
  });
  await tick();

  assert.equal(metadata[0].fallbackReason, "premium_voice_monthly_budget");
});

test("an autoplay rejection and late media error still start only one device fallback", async () => {
  let fallback = 0;
  let audio;
  const client = createPremiumVoiceClient({
    fetchImpl: async () => new Response(new Blob(["voice"], { type: "audio/mpeg" }), { status: 200, headers: { "content-type": "audio/mpeg" } }),
    audioFactory: () => {
      audio = { preload: "", onended: null, onerror: null, pause() {}, async play() { throw new Error("autoplay blocked"); } };
      return audio;
    },
    createObjectURL: () => "blob:blocked",
    revokeObjectURL: () => {},
    setTimer: () => 1,
    clearTimer: () => {},
  });
  client.speak({
    text: "Keep the text visible.",
    sessionId: "fitcoach-mo-voice-v040",
    tone: "Direct",
    voicePersona: "nova",
    deviceFallback: () => { fallback += 1; return { cancel() {} }; },
  });
  await tick();
  await tick();
  audio.onerror?.(new Error("late media error"));
  assert.equal(fallback, 1);
});

test("cancelling an in-flight premium request never starts fallback playback", async () => {
  let fallback = 0;
  let aborted = false;
  const client = createPremiumVoiceClient({
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      }, { once: true });
    }),
    setTimer: () => 1,
    clearTimer: () => {},
  });
  const handle = client.speak({
    text: "This should never play.",
    sessionId: "fitcoach-mo-voice-v040",
    tone: "Competitive",
    voicePersona: "nova",
    deviceFallback: () => { fallback += 1; },
  });
  handle.cancel();
  await tick();

  assert.equal(aborted, true);
  assert.equal(fallback, 0);
});
