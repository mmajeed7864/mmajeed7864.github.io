import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeRoutedAudio,
  reconcileVerifiedSubscription,
} from "../v040/services/native-lifecycle.mjs";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

test("pause during native route preparation cancels playback and completes once", async () => {
  const preparation = deferred();
  const calls = [];
  const routed = createNativeRoutedAudio({
    play: async () => { calls.push("play"); },
    pause: () => { calls.push("pause"); },
  }, {
    available: true,
    prepareVoiceOutput: async () => { calls.push("prepare"); await preparation.promise; },
    completeVoiceOutput: async () => { calls.push("complete"); },
  });

  const playback = routed.play();
  routed.pause();
  preparation.resolve();
  await playback;
  assert.deepEqual(calls, ["prepare", "pause", "complete"]);
});

test("native output completes exactly once when media playback rejects", async () => {
  const calls = [];
  const routed = createNativeRoutedAudio({
    play: async () => { throw new Error("media_decode_failed"); },
    pause() {},
  }, {
    available: true,
    prepareVoiceOutput: async () => { calls.push("prepare"); },
    completeVoiceOutput: async () => { calls.push("complete"); },
  });
  await assert.rejects(() => routed.play(), /media_decode_failed/u);
  routed.onerror?.(new Error("media_decode_failed"));
  await Promise.resolve();
  assert.deepEqual(calls, ["prepare", "complete"]);
});

test("verified backend entitlement updates before capped transient store retry", async () => {
  const sequence = [];
  let completionAttempts = 0;
  const entitlement = { premium: true };
  const result = await reconcileVerifiedSubscription({
    refreshEntitlements: async () => { sequence.push("refresh"); return entitlement; },
    hasActiveEntitlement: value => value?.premium === true,
    onAuthoritativeEntitlement: value => sequence.push(value === entitlement ? "unlock" : "wrong"),
    completePurchase: async () => {
      sequence.push(`complete-${++completionAttempts}`);
      if (completionAttempts < 3) throw new Error("APP_STORE_SERVER_FINISH_PENDING");
      return { completed: true };
    },
    sleep: async milliseconds => sequence.push(`sleep-${milliseconds}`),
    baseDelayMs: 100,
    maxAttempts: 4,
  });
  assert.equal(result, entitlement);
  assert.deepEqual(sequence, [
    "refresh", "unlock", "complete-1", "sleep-100", "complete-2", "sleep-200", "complete-3",
  ]);
});

test("store reconciliation does not retry permanent errors and caps transient attempts", async () => {
  const entitlement = { premium: true };
  let attempts = 0;
  let sleeps = 0;
  await assert.rejects(() => reconcileVerifiedSubscription({
    refreshEntitlements: async () => entitlement,
    hasActiveEntitlement: () => true,
    completePurchase: async () => { attempts += 1; throw new Error("PLAY_PURCHASE_NOT_ACKNOWLEDGED_BY_BACKEND"); },
    sleep: async () => { sleeps += 1; },
    maxAttempts: 3,
  }), /PLAY_PURCHASE_NOT_ACKNOWLEDGED_BY_BACKEND/u);
  assert.equal(attempts, 3);
  assert.equal(sleeps, 2);

  attempts = 0;
  sleeps = 0;
  await assert.rejects(() => reconcileVerifiedSubscription({
    refreshEntitlements: async () => entitlement,
    hasActiveEntitlement: () => true,
    completePurchase: async () => { attempts += 1; throw new Error("STORE_ACCOUNT_MISMATCH"); },
    sleep: async () => { sleeps += 1; },
  }), /STORE_ACCOUNT_MISMATCH/u);
  assert.equal(attempts, 1);
  assert.equal(sleeps, 0);
});
