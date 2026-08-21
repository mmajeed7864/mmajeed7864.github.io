import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");

test("Voice Room speaks trainer replies automatically while text chat respects speak-replies setting", () => {
  assert.match(
    appSource,
    /if \(state\.settings\.speakReplies && result\.speakAllowed\) speakText\(coachMessage\.text/u,
    "regular text chat should still respect the Speak replies setting",
  );
  assert.match(
    appSource,
    /return \{ text: result\.reply, speak: result\.speakAllowed !== false \};/u,
    "Voice Room should speak any safe trainer reply without requiring Replay",
  );
  assert.doesNotMatch(
    appSource,
    /requestTurn:[\s\S]{0,900}state\.settings\.speakReplies && result\.speakAllowed/u,
    "Voice Room must not reuse the text-chat Speak replies toggle",
  );
});

test("Voice Room primes one persistent audio element from a user gesture", () => {
  assert.match(appSource, /const sharedPremiumAudio = typeof Audio === "function" \? new Audio\(\) : null/u);
  assert.match(appSource, /audioFactory: url => \{[\s\S]*sharedPremiumAudio\.src = url/u);
  assert.match(appSource, /function unlockVoicePlayback\(\)/u);
  assert.match(appSource, /function openVoiceRoom\(\) \{[\s\S]{0,260}unlockVoicePlayback\(\)/u);
  assert.match(appSource, /action === "voice-consent"\) \{ unlockVoicePlayback\(\)/u);
});
