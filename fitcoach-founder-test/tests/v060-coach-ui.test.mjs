import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialState } from "../v040/core/store.mjs";
import { renderCoachScreen, renderVoiceRoom } from "../v040/ui/coach-screen.mjs";

const NOW = new Date("2026-09-04T12:00:00Z");
const render = (state, ui = {}, coachConnection = { label: "Connection unavailable", state: "offline" }) => renderCoachScreen({
  state,
  decision: { title: "Begin with your first session" },
  ui,
  coachConnection,
});

test("coach exposes its actual connection state and places voice entry before optional detail", () => {
  const html = render(createInitialState("mo", NOW));
  assert.match(html, /data-connection="offline"/u);
  assert.match(html, /Connection unavailable/u);
  assert.doesNotMatch(html, /Connected|Live coaching is ready/u);
  assert.ok(html.indexOf("Start Voice Room") < html.indexOf('id="chat-log"'));
  assert.ok(html.indexOf('id="coach-input"') < html.indexOf('class="suggested-prompts"'));
  assert.doesNotMatch(html, /data-action="ask-about-exercise"/u);
  assert.match(html, /<details class="mentor-privacy">/u);
});

test("coach keeps connection diagnostics reachable from a truthful keyboard-accessible status button", () => {
  for (const connection of [{ state: "offline", label: "Offline mode" }, { state: "unverified", label: "Coach status" }, { state: "live", label: "Live reply received" }]) {
    const html = render(createInitialState("mo", NOW), {}, connection);
    const control = html.match(/<button\b[^>]*data-action="connection-info"[^>]*>[\s\S]*?<\/button>/u)?.[0];
    assert.ok(control, "connection details remain a native button using the existing handler");
    assert.ok(control.includes(`data-connection="${connection.state}"`));
    assert.ok(control.includes(`aria-label="Coach connection: ${connection.label}. Show connection details"`));
    assert.ok(control.includes(connection.label));
    assert.doesNotMatch(control, /disabled|tabindex="-1"/u);
  }
});

test("coach workout shortcuts use the current movement and keep user data escaped", () => {
  const state = createInitialState("mo", NOW);
  state.activeWorkout = {
    planLabel: "Plan A",
    currentExerciseIndex: 1,
    exercises: [
      { exerciseId: "air-squat", snapshot: { name: "Air Squat" } },
      { exerciseId: "goblet-squat", snapshot: { name: 'Goblet <Squat> & "hold"' } },
    ],
  };
  const html = render(state);
  assert.match(html, /data-action="ask-about-exercise" data-value="goblet-squat"/u);
  assert.match(html, /data-action="resume-workout"/u);
  assert.match(html, /Goblet &lt;Squat&gt; &amp; &quot;hold&quot;/u);
  assert.doesNotMatch(html, />Goblet <Squat>/u);
});

test("conversation preserves a pending draft and retry notice without bypassing a pending request", () => {
  const html = render(createInitialState("mo", NOW), {
    chatBusy: true,
    chatDraft: 'Can you explain <this> & that?',
    pendingMessage: "My pending question",
    chatNotice: { kind: "info", title: "Try again", message: "Your draft is safe.", retryable: true },
  });
  assert.match(html, /id="coach-input"[^>]*disabled/u);
  assert.match(html, /Can you explain &lt;this&gt; &amp; that\?/u);
  assert.match(html, /data-action="send-chat"[^>]*disabled/u);
  assert.match(html, /data-action="restore-chat-draft"/u);
  assert.match(html, /My pending question/u);
});

test("trainer replies use the selected persona without relabeling local tools as live coaching", () => {
  const state = createInitialState("mo", NOW);
  state.settings.voicePersona = "atlas";
  state.chat = [
    { id: "reply-live", role: "coach", provider: "symbio", text: "One useful next step.", at: NOW.toISOString() },
    { id: "reply-local", role: "coach", provider: "on-device", text: "Opened your workout.", at: NOW.toISOString() },
  ];
  const html = render(state);
  assert.match(html, /data-message-id="reply-live"[\s\S]*?<footer><span>Atlas<\/span>/u);
  assert.match(html, /data-message-id="reply-local"[\s\S]*?<footer><span>FitCoach tools · on this device<\/span>/u);
});

test("every active voice phase preserves its exit, captions and existing state-specific controls", () => {
  const state = createInitialState("mo", NOW);
  const phases = ["consent", "starting", "listening", "finalizing", "thinking", "speaking", "cooldown", "paused", "retryable_error", "safety_stop"];
  for (const phase of phases) {
    const voice = { active: true, phase, muted: false, lastTranscript: "A <private> question", lastReply: "A safe & useful answer." };
    const html = renderVoiceRoom(voice, state);
    assert.ok(html.includes(`data-phase="${phase}"`));
    assert.match(html, /role="dialog" aria-modal="true"/u);
    assert.match(html, /data-action="voice-text-mode"/u);
    assert.match(html, /data-action="voice-exit"/u);
    assert.match(html, /data-action="voice-mute" aria-pressed="false"/u);
    assert.match(html, /data-action="voice-replay"/u);
    assert.match(html, /A &lt;private&gt; question/u);
    assert.match(html, /A safe &amp; useful answer\./u);
    assert.equal(html.includes('data-action="voice-resume"'), phase === "paused");
    assert.equal(html.includes('data-action="voice-retry"'), phase === "retryable_error");
    assert.equal(html.includes('data-action="voice-consent"'), phase === "consent");
  }
  assert.equal(renderVoiceRoom({ active: false, phase: "closed" }, state), "");
});

test("docked voice keeps readable copy hooks and all navigation controls in every phase", () => {
  const state = createInitialState("mo", NOW);
  for (const phase of ["consent", "starting", "listening", "finalizing", "thinking", "speaking", "cooldown", "paused", "retryable_error", "safety_stop"]) {
    const html = renderVoiceRoom({ active: true, phase, muted: true, currentReply: "Long & <escaped> trainer answer ".repeat(80) }, state, { docked: true });
    assert.match(html, /<aside class="voice-dock" role="region"/u);
    assert.match(html, /class="voice-dock-copy"/u);
    assert.match(html, /data-action="voice-expand"/u);
    assert.match(html, /data-action="voice-mute" aria-pressed="true"/u);
    assert.match(html, /data-action="voice-exit"/u);
    assert.match(html, /Long &amp; &lt;escaped&gt; trainer answer/u);
    assert.doesNotMatch(html, /role="dialog"|aria-modal="true"/u);
  }
});

test("voice layout has bounded content, readable themed controls and stacked dock clearance", () => {
  const css = readFileSync(new URL("../v040/ui/coach-v060.css", import.meta.url), "utf8");
  assert.match(css, /#voice-room\.voice-room \{[^}]*height: 100dvh;[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto auto;/u);
  assert.match(css, /#voice-room\.voice-room > main \{[^}]*min-height: 0;[^}]*overflow-y: auto;/u);
  assert.match(css, /#voice-room\.voice-room \.voice-consent \{[^}]*max-height: 44dvh;[^}]*overflow-y: auto;/u);
  assert.match(css, /#voice-root\.docked \.voice-dock-main \{[^}]*background: transparent;[^}]*color: var\(--text\);/u);
  assert.match(css, /#voice-root\.docked \.voice-dock-control \{[^}]*min-height: 44px;/u);
  assert.match(css, /html\.voice-is-docked\.workout-is-docked \.app-main \{ padding-bottom: calc\(270px \+ var\(--safe-bottom\)\);/u);
  assert.match(css, /@media \(max-height: 620px\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/u);
});
