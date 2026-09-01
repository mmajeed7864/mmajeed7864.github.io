import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createInitialState } from "../v040/core/store.mjs";
import { createNativePlatformClient } from "../v040/services/native-client.mjs";
import { renderProfileScreen } from "../v040/ui/profile-screen.mjs";

test("Profile stays honestly local-only when remote account configuration is absent", () => {
  const state = createInitialState("mo");
  state.profile.onboarded = true;
  const html = renderProfileScreen({
    state,
    ui: {
      account: { phase: "unavailable", config: { authAvailable: false, capabilities: {} } },
      native: { available: false, health: { available: false }, offerings: [] },
    },
  });
  assert.match(html, /Cloud account setup is not live yet/u);
  assert.match(html, /Your workouts and food log remain safely on this device/u);
  assert.match(html, /legal\/privacy\.html/u);
  assert.match(html, /Native store setup required/u);
  assert.doesNotMatch(html, /Premium is active/u);
});

test("only the canonical server premium flag can activate Premium UI", () => {
  const state = createInitialState("premium-conflict");
  const html = renderProfileScreen({
    state,
    ui: {
      account: {
        phase: "ready",
        session: { user: { email: "person@example.com" } },
        config: { authAvailable: true, capabilities: { subscriptions: true, entitlements: true } },
        entitlement: {
          ok: true,
          premium: false,
          active: true,
          entitlements: [{ source: "unrelated", active: true }],
        },
      },
      native: { billingAvailable: false, offerings: [] },
    },
  });
  assert.doesNotMatch(html, /Premium is active/u);
  assert.match(html, /One membership\. Every platform\./u);
});

test("Profile legal links are mobile-sized controls instead of undersized inline text", () => {
  const css = readFileSync(new URL("../v040/premium-redesign.css", import.meta.url), "utf8");
  assert.match(css, /\.privacy-links a \{[^}]*min-height:\s*46px/su);
  assert.match(css, /\.privacy-links a:focus-visible/u);
});

test("store offers never render before an account session exists", () => {
  const state = createInitialState("mo");
  const html = renderProfileScreen({
    state,
    ui: {
      account: { config: { capabilities: { subscriptions: true, entitlements: true } }, session: null },
      native: { billingAvailable: true, offerings: [{ logicalId: "fitcoach_pro_monthly", displayName: "Monthly", localizedPrice: "$9.99" }] },
    },
  });
  assert.match(html, /Sign in before purchasing/u);
  assert.doesNotMatch(html, /data-action="subscription-purchase"/u);
});

test("signed-in account deletion requires the exact destructive phrase", () => {
  const state = createInitialState("mo");
  const html = renderProfileScreen({
    state,
    ui: {
      account: {
        phase: "ready",
        confirmDelete: true,
        session: { user: { email: "person@example.com" } },
        config: { authAvailable: true, capabilities: { sync: true, accountExport: true, accountDeletion: true, subscriptions: false } },
      },
      native: { available: false, health: { available: false }, offerings: [] },
    },
  });
  assert.match(html, /DELETE MY FITCOACH ACCOUNT/u);
  assert.match(html, /data-action="account-delete-confirm"/u);
  assert.doesNotMatch(html, /data-action="subscription-purchase"/u);
});

test("native checkout remains unavailable until a verified FitCoach account can own the entitlement", () => {
  const state = createInitialState("mo");
  const html = renderProfileScreen({
    state,
    ui: {
      account: { phase: "ready", session: null, config: { authAvailable: true, capabilities: { subscriptions: true, entitlements: true } } },
      native: { available: true, billingAvailable: true, offerings: [{ logicalId: "premium_monthly", displayName: "Monthly", localizedPrice: "$9.99" }] },
    },
  });
  assert.match(html, /Sign in before purchasing/u);
  assert.doesNotMatch(html, /data-action="subscription-purchase"/u);
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  assert.match(app, /async function purchaseSubscription[\s\S]*if \(!accountClient\.session\) throw new Error\("authentication_required"\)/u);
  assert.match(app, /nativeClient\.purchaseSubscription\(logicalId, accountClient\.session\.user\.id\)/u);
  assert.match(app, /async function restoreSubscriptions[\s\S]*if \(!accountClient\.session\) throw new Error\("authentication_required"\)/u);
});

test("native provider output routing has an explicit prepare and completion lifecycle", async () => {
  const calls = [];
  const client = createNativePlatformClient({
    plugin: {
      prepareVoiceOutput: async () => { calls.push("prepare"); return { available: true, phase: "speaking" }; },
      completeVoiceOutput: async () => { calls.push("complete"); return { available: true, phase: "idle" }; },
    },
  });
  await client.prepareVoiceOutput();
  await client.completeVoiceOutput();
  assert.deepEqual(calls, ["prepare", "complete"]);
});

test("active Voice Room prefers native recognition and native builds use secure token storage", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  const account = readFileSync(new URL("../v040/services/account-client.mjs", import.meta.url), "utf8");
  const nativeLifecycle = readFileSync(new URL("../v040/services/native-lifecycle.mjs", import.meta.url), "utf8");
  assert.match(app, /nativeClient\.createRecognitionSession\(callbacks\)[\s\S]*browserVoice\.recognitionFactory/u);
  assert.match(app, /createNativeRoutedAudio\(base, nativeClient\)/u);
  assert.match(nativeLifecycle, /nativeClient\.prepareVoiceOutput\(\)/u);
  assert.match(nativeLifecycle, /nativeClient\.completeVoiceOutput\(\)/u);
  assert.match(app, /secureStorage: nativeClient\.secureSessionStorage/u);
  assert.match(app, /await accountClient\.hydrateSession\(\)/u);
  assert.match(account, /nativeSecureStorage\.write\(JSON\.stringify\(record\)\)/u);
  assert.match(account, /A native build must not retain a legacy JS-accessible token copy/u);
  assert.match(account, /globalThis\.sessionStorage/u);
  assert.doesNotMatch(account, /localStorage/u);
});

test("native subscription lifecycle verifies with backend before store completion or entitlement", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  const nativeLifecycle = readFileSync(new URL("../v040/services/native-lifecycle.mjs", import.meta.url), "utf8");
  assert.match(app, /accountClient\.verifySubscription\(payload\)/u);
  assert.match(app, /verificationId[\s\S]*nativeClient\.completeVerifiedPurchase/u);
  assert.match(app, /onSubscriptionTransactionAvailable/u);
  assert.match(app, /onSubscriptionEntitlementChanged/u);
  assert.match(app, /pendingNativeTransactions\.set\(key, transaction\)/u);
  assert.match(app, /verifyAccountCode[\s\S]*replayPendingNativeTransactions\(\)/u);
  assert.match(app, /removeNativePlatformListeners/u);
  assert.match(app, /function invalidateNativePlatform\(\) \{[\s\S]*platformInitializationSequence \+= 1;[\s\S]*removeNativePlatformListeners\(\)/u);
  assert.match(app, /window\.addEventListener\("pagehide",\(\)=>\{[\s\S]*invalidateNativePlatform\(\)/u);
  const verifyIndex = app.indexOf("accountClient.verifySubscription(payload)");
  const reconcileIndex = app.indexOf("reconcileVerifiedSubscription({", verifyIndex);
  const entitlementIndex = app.indexOf("accountClient.getEntitlements()", reconcileIndex);
  const unlockIndex = app.indexOf("ui.account.entitlement = authoritativeEntitlement", entitlementIndex);
  const completeIndex = app.indexOf("nativeClient.completeVerifiedPurchase({", unlockIndex);
  assert.ok(verifyIndex >= 0 && reconcileIndex > verifyIndex && entitlementIndex > reconcileIndex && unlockIndex > entitlementIndex && completeIndex > unlockIndex);
  assert.match(nativeLifecycle, /TRANSIENT_PURCHASE_RECONCILIATION_CODES/u);
  assert.match(nativeLifecycle, /initialDelay \* \(2 \*\* attempt\)/u);
});

test("health connection copy and bridge request stay read-only and permission-honest", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  const native = readFileSync(new URL("../v040/services/native-client.mjs", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../v040/ui/profile-screen.mjs", import.meta.url), "utf8");
  assert.match(app, /permission\?\.requested !== true/u);
  assert.match(app, /appleHealth\.status = "permission_requested"/u);
  assert.match(profile, /made available today/u);
  assert.match(native, /requestHealthAuthorization\(\) \{ return requireMethod\("requestHealthAuthorization"\)\(\); \}/u);
  assert.doesNotMatch(native, /writeApprovedWorkout|includeWorkoutWrite/u);
});

test("legacy onboarded profiles cannot bypass the current adult release gate", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  assert.match(app, /state\.profile\.onboarded && canAccessCurrentRelease\(state\.profile\.ageBand\)/u);
  assert.match(app, /!canAccessCurrentRelease\(ui\.onboardingDraft\?\.profile\?\.ageBand\)/u);
});
