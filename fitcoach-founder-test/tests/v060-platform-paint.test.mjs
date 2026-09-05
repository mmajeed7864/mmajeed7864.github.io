import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createInitialState } from "../v040/core/store.mjs";
import { ONBOARDING_STEP_COUNT, renderOnboarding } from "../v040/ui/onboarding.mjs";

const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
const initializationSource = app.slice(app.indexOf("async function initializePlatform() {"), app.indexOf("function applyRemoteCloudState(remote) {"));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness({ mode = "app", route = "profile", session = null } = {}) {
  const hydrate = deferred(), config = deferred(), native = deferred(), listeners = deferred(), entitlement = deferred();
  const configStarted = deferred(), listenersStarted = deferred(), entitlementStarted = deferred();
  const calls = [], paints = [];
  const ui = { mode, route, account: { phase: "idle", config: null, session: null }, native: { existing: true } };
  const accountClient = {
    session,
    hydrateSession() { calls.push("hydrate"); return hydrate.promise; },
    fetchPlatformConfig() { calls.push("config"); configStarted.resolve(); return config.promise; },
  };
  const sandbox = {
    ui, accountClient, platformInitializationSequence: 0,
    nativeClient: { initialize() { calls.push("native"); return native.promise; } },
    render() { paints.push({ mode: ui.mode, route: ui.route, phase: ui.account.phase, config: ui.account.config }); },
    refreshEntitlements() { calls.push("entitlements"); entitlementStarted.resolve(); return entitlement.promise; },
    replaceNativePlatformListeners(sequence) { calls.push(["listeners", sequence]); listenersStarted.resolve(); return listeners.promise; },
  };
  runInNewContext(initializationSource, sandbox);
  return { sandbox, ui, accountClient, calls, paints, hydrate, config, native, listeners, entitlement,
    configStarted, listenersStarted, entitlementStarted,
    run: () => sandbox.initializePlatform(),
    async completeConfig(result = { authAvailable: true, capabilities: {} }) {
      hydrate.resolve();
      await configStarted.promise;
      config.resolve(result);
      native.resolve({ available: false, platform: "web" });
    },
  };
}

for (const [mode, route] of [["onboarding", "today"], ["onboarding", "profile"], ["app", "today"], ["app", "train"], ["app", "nutrition"], ["app", "coach"], ["app", "progress"]]) {
  test(`delayed account bootstrap never repaints ${mode}/${route}`, async () => {
    const h = harness({ mode, route });
    const pending = h.run();
    assert.equal(h.ui.account.phase, "checking");
    assert.equal(h.paints.length, 0);
    await h.completeConfig();
    await h.listenersStarted.promise;
    assert.equal(h.paints.length, 0);
    h.listeners.resolve();
    await pending;
    assert.equal(h.paints.length, 0);
    assert.equal(h.ui.account.phase, "ready", "background data still initializes without replacing the user's screen");
    assert.equal(h.ui.native.platform, "web");
  });
}

test("Profile paints checking and then the resolved account/native state", async () => {
  const session = { user: { id: "account-one" } };
  const h = harness({ session });
  const pending = h.run();
  assert.deepEqual(h.paints.map(paint => paint.phase), ["checking"]);
  await h.completeConfig();
  await h.entitlementStarted.promise;
  assert.equal(h.paints.length, 1, "do not paint an intermediate account state before awaited work settles");
  h.entitlement.resolve();
  await h.listenersStarted.promise;
  h.listeners.resolve();
  await pending;
  assert.deepEqual(h.paints.map(paint => paint.phase), ["checking", "ready"]);
  assert.equal(h.ui.account.session, session);
  assert.equal(h.ui.account.config.authAvailable, true);
  assert.equal(h.ui.native.existing, true);
  assert.equal(h.ui.native.platform, "web");
});

test("Profile presents unavailable configuration without inventing account readiness", async () => {
  const h = harness();
  const pending = h.run();
  await h.completeConfig({ authAvailable: false, capabilities: {} });
  await h.listenersStarted.promise;
  h.listeners.resolve();
  await pending;
  assert.deepEqual(h.paints.map(paint => paint.phase), ["checking", "unavailable"]);
  assert.equal(h.calls.includes("entitlements"), false);
});

test("leaving Profile during initialization never repaints the destination", async () => {
  for (const [mode, route] of [["app", "train"], ["app", "nutrition"], ["onboarding", "profile"]]) {
    const h = harness();
    const pending = h.run();
    h.ui.mode = mode;
    h.ui.route = route;
    await h.completeConfig();
    await h.listenersStarted.promise;
    h.listeners.resolve();
    await pending;
    assert.deepEqual(h.paints.map(paint => paint.route), ["profile"]);
  }
});

test("entering Profile during initialization receives its final state", async () => {
  const h = harness({ route: "today" });
  const pending = h.run();
  await h.completeConfig();
  await h.listenersStarted.promise;
  h.ui.route = "profile";
  h.listeners.resolve();
  await pending;
  assert.deepEqual(h.paints.map(paint => [paint.route, paint.phase]), [["profile", "ready"]]);
});

test("a stale hydration result cannot start native/config work or overwrite the current session", async () => {
  const h = harness({ session: { user: { id: "old" } } });
  const pending = h.run();
  h.sandbox.platformInitializationSequence += 1;
  const currentSession = { user: { id: "new" } };
  Object.assign(h.ui.account, { phase: "ready", session: currentSession });
  h.hydrate.resolve();
  await pending;
  assert.deepEqual(h.calls, ["hydrate"]);
  assert.equal(h.ui.account.session, currentSession);
  assert.equal(h.ui.account.phase, "ready");
  assert.equal(h.paints.length, 1);
});

test("a stale config/native result cannot overwrite current account state or repaint", async () => {
  const h = harness();
  const pending = h.run();
  h.hydrate.resolve();
  await h.configStarted.promise;
  h.sandbox.platformInitializationSequence += 1;
  const currentConfig = { authAvailable: true, marker: "new-config" };
  Object.assign(h.ui.account, { phase: "ready", config: currentConfig });
  h.config.resolve({ authAvailable: false, marker: "old-config" });
  h.native.resolve({ platform: "stale-native" });
  await pending;
  assert.equal(h.ui.account.config, currentConfig);
  assert.equal(h.ui.account.phase, "ready");
  assert.equal(h.ui.native.platform, undefined);
  assert.equal(h.calls.some(call => Array.isArray(call) && call[0] === "listeners"), false);
  assert.equal(h.paints.length, 1);
});

test("an initialization superseded during entitlement refresh cannot install listeners or repaint", async () => {
  const h = harness({ session: { user: { id: "old" } } });
  const pending = h.run();
  await h.completeConfig();
  await h.entitlementStarted.promise;
  h.sandbox.platformInitializationSequence += 1;
  h.listeners.resolve();
  h.entitlement.resolve();
  await pending;
  assert.equal(h.calls.some(call => Array.isArray(call) && call[0] === "listeners"), false);
  assert.equal(h.paints.length, 1);
});

test("an initialization superseded while installing listeners cannot repaint Profile", async () => {
  const h = harness();
  const pending = h.run();
  await h.completeConfig();
  await h.listenersStarted.promise;
  h.sandbox.platformInitializationSequence += 1;
  h.listeners.resolve();
  await pending;
  assert.equal(h.paints.length, 1);
});

test("skip link targets one focusable main landmark throughout onboarding and the app shell", () => {
  const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(index, /class="skip-link" href="#main-content"/u);
  assert.match(app, /<main id="main-content" class="app-main" tabindex="-1">/u);
  const state = createInitialState("mo");
  state.profile.ageBand = "adult_18_64";
  const draft = { profile: state.profile, settings: state.settings, gymProfile: state.gymProfile, consent: false };
  for (let step = 0; step < ONBOARDING_STEP_COUNT; step += 1) {
    const html = renderOnboarding({ step, draft });
    assert.equal((html.match(/id="main-content"/gu) || []).length, 1);
    assert.match(html, /<main id="main-content" tabindex="-1">/u);
  }
});
