import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialState } from "../v040/core/store.mjs";
import { MODEL_MODES, TRAINER_TONES, VOICE_PERSONAS } from "../v040/core/constants.mjs";
import { renderCoachScreen, renderVoiceRoom } from "../v040/ui/coach-screen.mjs";

const NOW = new Date("2026-09-05T12:00:00Z");
const css = readFileSync(new URL("../v040/ui/coach-v070.css", import.meta.url), "utf8");
const initial = () => createInitialState("mo", NOW);
const render = (state = initial(), ui = {}) => renderCoachScreen({
  state,
  decision: { title: "Start with your current plan" },
  ui,
  coachConnection: { state: "unverified", label: "Coach status" },
});

test("editorial Coach replaces the old card stack without dropping voice or text entry", () => {
  const html = render();
  assert.match(html, /class="page coach-page coach-v070"/u);
  assert.match(html, /class="coach-v7-masthead"/u);
  assert.match(html, /class="coach-v7-stage"[^>]*data-phase="idle"/u);
  assert.match(html, /class="coach-v7-control-deck"/u);
  assert.doesNotMatch(html, /mentor-voice-card|mentor-conversation|coach-v060/u);
  for (const [, classes] of html.matchAll(/class="([^"]*)"/gu)) {
    assert.equal(classes.split(/\s+/u).includes("card"), false);
  }
  assert.ok(html.indexOf('data-action="open-voice-room"') < html.indexOf('id="chat-log"'));
  assert.match(html, /id="chat-log"[^>]*role="log"[^>]*aria-live="polite"/u);
  assert.match(html, /Message your trainer/u);
  assert.match(html, /id="coach-input"[^>]*maxlength="2000"/u);
  assert.match(html, /data-action="send-chat" aria-label="Send message"/u);
  assert.match(html, /data-action="connection-info" data-connection="unverified"/u);
  assert.match(html, /data-action="clear-chat"/u);
  assert.equal((html.match(/data-action="quick-prompt"/gu) || []).length, 4);
});

test("launcher reacts only to known reply playback, not fabricated microphone activity", () => {
  assert.match(render(), /class="coach-v7-stage"[^>]*data-phase="idle"/u);
  const playing = render(initial(), { speakingMessageId: "actual-message-id" });
  assert.match(playing, /class="coach-v7-stage"[^>]*data-phase="speaking"/u);
  assert.match(playing, /Reply playing/u);
  assert.match(playing, /data-connection="unverified"/u);
  assert.doesNotMatch(playing, /Connected|Live reply received|data-phase="listening"/u);
  for (const html of [render(), playing]) {
    assert.match(html, /class="voice-v7-signal"[^>]*aria-hidden="true"[^>]*focusable="false"/u);
    assert.doesNotMatch(html, /<canvas|<audio|<video|data-audio-level|data-decibel|Math\.random/u);
  }
});

test("all presentation controls and disclosure persistence remain available", () => {
  for (const tone of TRAINER_TONES) {
    for (const voice of VOICE_PERSONAS) {
      const state = initial();
      state.profile.tone = tone;
      state.settings.voicePersona = voice;
      state.settings.coachMode = "deep";
      const html = render(state, { disclosures: { "coach-style": true, "coach-memory": true } });
      for (const value of TRAINER_TONES) {
        assert.match(html, new RegExp(`role="radio" aria-checked="${value === tone}"[^>]*data-action="set-tone" data-value="${value}"`, "u"));
      }
      for (const value of VOICE_PERSONAS) {
        assert.match(html, new RegExp(`role="radio" aria-checked="${value === voice}"[^>]*data-action="set-voice-persona" data-value="${value}"`, "u"));
      }
      for (const value of Object.keys(MODEL_MODES)) {
        assert.match(html, new RegExp(`role="radio" aria-checked="${value === "deep"}"[^>]*data-action="set-answer-depth" data-value="${value}"`, "u"));
      }
      assert.match(html, /data-disclosure="coach-style" open/u);
      assert.match(html, /data-disclosure="coach-memory" open/u);
      assert.match(html, /data-action="explain-decision"/u);
      assert.match(html, /Safety rules and plan decisions stay the same/u);
      assert.doesNotMatch(html, /<select\b/u);
    }
  }
  const closed = render();
  assert.doesNotMatch(closed, /data-disclosure="coach-(?:style|memory)" open/u);
});

test("plan proposals remain previews requiring approval and conversation tools retain their handlers", () => {
  const state = initial();
  state.pendingPlanProposal = {
    id: "proposal-1",
    candidate: { label: "Shorter <session>", minutes: 20 },
    reason: "Time & equipment",
    changes: ["Keep your current plan until approved."],
  };
  state.chat = [
    { id: "coach-1", role: "coach", provider: "on-device", text: "Open your <food diary>.", at: NOW.toISOString(), action: { kind: "open_nutrition", value: "today", label: "Food diary", detail: "Review before logging" } },
  ];
  const html = render(state, { chatBusy: true, chatDraft: "Keep <my> draft" });
  assert.match(html, /PLAN CHANGE PREVIEW/u);
  assert.match(html, /Shorter &lt;session&gt;/u);
  assert.match(html, /data-action="reject-proposal" data-value="proposal-1"/u);
  assert.match(html, /data-action="approve-proposal" data-value="proposal-1"/u);
  assert.match(html, /data-action="coach-message-action" data-kind="open_nutrition" data-value="today"/u);
  assert.match(html, /FitCoach tools · on this device/u);
  assert.match(html, /data-action="speak-message" data-value="coach-1"/u);
  assert.match(html, /id="coach-input"[^>]*disabled[^>]*>Keep &lt;my&gt; draft/u);
  assert.match(html, /data-action="send-chat"[^>]*disabled/u);
  assert.match(html, /Training guidance, not medical care/u);
  assert.match(html, /Your full profile stays on this device/u);
});

test("every voice phase has an actual-state signal and an accessible persistent transport", () => {
  for (const phase of ["consent", "starting", "listening", "finalizing", "thinking", "speaking", "cooldown", "paused", "retryable_error", "safety_stop"]) {
    const voice = { active: true, phase, muted: false, lastTranscript: "A <question>", lastReply: "Your answer & context." };
    const html = renderVoiceRoom(voice, initial());
    assert.ok(html.includes(`data-phase="${phase}"`));
    assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="voice-room-title"/u);
    assert.match(html, /<button type="button" class="voice-room-orb" data-action="voice-interrupt"/u);
    assert.match(html, /class="voice-v7-signal"[^>]*aria-hidden="true"/u);
    assert.match(html, /data-action="voice-text-mode"/u);
    assert.match(html, /data-action="voice-exit"/u);
    assert.match(html, /data-action="voice-mute" aria-pressed="false"/u);
    assert.match(html, /data-action="voice-replay"/u);
    assert.match(html, /A &lt;question&gt;/u);
    assert.match(html, /Your answer &amp; context\./u);
    assert.equal(html.includes('data-action="voice-consent"'), phase === "consent");
    assert.equal(html.includes('data-action="voice-resume"'), phase === "paused");
    assert.equal(html.includes('data-action="voice-retry"'), phase === "retryable_error");
    const dock = renderVoiceRoom(voice, initial(), { docked: true });
    assert.match(dock, /role="region" aria-label="Active trainer voice session"/u);
    assert.match(dock, /class="voice-v7-signal"/u);
    assert.match(dock, /data-action="voice-expand"/u);
    assert.match(dock, /data-action="voice-exit"/u);
    assert.doesNotMatch(dock, /role="dialog"|aria-modal/u);
  }
  assert.equal(renderVoiceRoom({ active: false, phase: "closed" }, initial()), "");
});

test("privacy remains explicit and no replay control is invented without a saved reply", () => {
  const consent = renderVoiceRoom({ active: true, phase: "consent", muted: false }, initial());
  assert.match(consent, /data-action="voice-consent"/u);
  assert.match(consent, /Your browser or operating system may process speech/u);
  assert.match(consent, /FitCoach does not upload microphone audio/u);
  assert.match(consent, /Avoid private medical details, identifiers, and credentials/u);
  assert.doesNotMatch(consent, /data-action="voice-replay"/u);
  const safe = renderVoiceRoom({ active: true, phase: "safety_stop", caption: { text: "Stop & seek help." } }, initial());
  assert.match(safe, /FitCoach will not automatically resume/u);
  assert.match(safe, /Stop &amp; seek help/u);
  assert.doesNotMatch(safe, /data-action="voice-resume"|data-action="voice-retry"/u);
});

test("v070 uses its own type system, bounded mobile room, themed controls and reduced motion", () => {
  assert.match(css, /--coach-blue: #2457ff;/u);
  assert.match(css, /--coach-paper: #f3f3ef;/u);
  assert.match(css, /--coach-ink: #142033;/u);
  assert.match(css, /var\(--font-display, "Barlow Condensed"\)/u);
  assert.match(css, /var\(--font-body, "Manrope"\)/u);
  assert.match(css, /html\[data-theme="dark"\] #voice-root/u);
  assert.match(css, /#voice-room\.voice-room \{[^}]*height: 100dvh;[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto auto;/u);
  assert.match(css, /#voice-room\.voice-room > main \{[^}]*min-height: 0;[^}]*overflow-y: auto;/u);
  assert.match(css, /#voice-room\.voice-room \.voice-consent \{[^}]*max-height: 44dvh;[^}]*overflow-y: auto;/u);
  assert.match(css, /\.coach-v070 \.coach-composer textarea \{[^}]*font-size: 16px;/u);
  assert.match(css, /#voice-root\.docked \.voice-dock-control \{[^}]*min-height: 44px;/u);
  assert.match(css, /html\.voice-is-docked\.workout-is-docked \.app-main \{ padding-bottom: calc\(276px \+ var\(--safe-bottom\)\);/u);
  assert.match(css, /@media \(max-width: 359px\)/u);
  assert.match(css, /@media \(max-height: 620px\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important; transition: none !important;/u);
  assert.doesNotMatch(css, /radial-gradient|linear-gradient|backdrop-filter: blur/u);
  const animatedRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].filter(([, , body]) => /animation: coach-v7-/u.test(body));
  assert.equal(animatedRules.length, 3);
  for (const [, selectors] of animatedRules) {
    for (const selector of selectors.trim().split(",")) {
      assert.match(selector, /\[data-phase="(?:speaking|thinking|listening)"\]/u);
    }
  }
});
