import test from "node:test";
import assert from "node:assert/strict";

import { createNativePlatformClient } from "../v040/services/native-client.mjs";

test("readable exports have a separate capability and propagate save, cancel and failure", async () => {
  const absent = createNativePlatformClient({ plugin: { savePrivateBackup: async () => ({ saved: true }), pickPrivateBackup: async () => ({ cancelled: true }) } });
  assert.equal(absent.dataExportAvailable, false);
  await assert.rejects(absent.saveDataExport("data.json", "{}"), /native_capability_unavailable/u);
  let result = { saved: true };
  const calls = [];
  const client = createNativePlatformClient({ plugin: { saveDataExport: async value => { calls.push(value); return result; } } });
  assert.equal(client.dataExportAvailable, true);
  assert.equal(client.privateBackupAvailable, false);
  assert.deepEqual(await client.saveDataExport("data.json", '{"title":"Café 🏋️"}'), { saved: true, cancelled: false });
  result = { cancelled: true, saved: false };
  assert.deepEqual(await client.saveDataExport("data.json", "{}"), { saved: false, cancelled: true });
  result = {};
  await assert.rejects(client.saveDataExport("data.json", "{}"), /native_data_export_save_failed/u);
  assert.equal(calls.length, 3);
});

test("readable exports validate JSON objects, names and UTF-8 bytes before native IO", async () => {
  let calls = 0;
  const client = createNativePlatformClient({ plugin: { saveDataExport: async () => { calls += 1; return { saved: true }; } } });
  for (const fileName of [".json", "data.fitcoach", "../data.json", "folder\\data.json", "a\u0000.json", "a\u007f.json", `${"a".repeat(120)}.json`]) {
    await assert.rejects(client.saveDataExport(fileName, "{}"), /invalid_data_export/u);
  }
  for (const contents of ["", "not JSON", "null", "[]", "1", '"text"', `{"title":"${"é".repeat(6 * 1024 * 1024)}"}`]) {
    await assert.rejects(client.saveDataExport("data.json", contents), /invalid_data_export/u);
  }
  assert.equal(calls, 0);
});

test("private native backups require both methods and preserve system cancellation", async () => {
  for (const plugin of [null, {}, { savePrivateBackup: async () => ({ saved: true }) }]) {
    const client = createNativePlatformClient({ plugin });
    assert.equal(client.privateBackupAvailable, false);
    await assert.rejects(() => client.savePrivateBackup("history.fitcoach", "{}"), /native_capability_unavailable/u);
    await assert.rejects(() => client.pickPrivateBackup(), /native_capability_unavailable/u);
  }
  const calls = [];
  const client = createNativePlatformClient({ plugin: {
    savePrivateBackup: async options => { calls.push(options); return { saved: false, cancelled: true }; },
    pickPrivateBackup: async () => ({ cancelled: true }),
  } });
  assert.equal(client.privateBackupAvailable, true);
  assert.deepEqual(await client.savePrivateBackup("history.fitcoach", "{}"), { saved: false, cancelled: true });
  assert.deepEqual(await client.pickPrivateBackup(), { cancelled: true });
  assert.deepEqual(calls, [{ fileName: "history.fitcoach", contents: "{}" }]);
});

test("private native backups bound UTF-8 bytes and reject unsafe names before calling the bridge", async () => {
  let called = 0;
  const client = createNativePlatformClient({ plugin: {
    savePrivateBackup: async () => { called += 1; return { saved: true }; },
    pickPrivateBackup: async () => ({ fileName: "history.fitcoach", contents: "{}" }),
  } });
  for (const name of ["history.json", ".fitcoach", "../history.fitcoach", "folder\\history.fitcoach", "a\u0000.fitcoach", "a\u007f.fitcoach", `${"a".repeat(120)}.fitcoach`]) {
    await assert.rejects(() => client.savePrivateBackup(name, "{}"), /invalid_private_backup/u);
  }
  await assert.rejects(() => client.savePrivateBackup("history.fitcoach", ""), /invalid_private_backup/u);
  await assert.rejects(() => client.savePrivateBackup("history.fitcoach", "é".repeat(6 * 1024 * 1024 + 1)), /invalid_private_backup/u);
  assert.equal(called, 0);
  assert.deepEqual(await client.savePrivateBackup("history.fitcoach", "{}"), { saved: true, cancelled: false });
  assert.deepEqual(await client.pickPrivateBackup(), { cancelled: false, fileName: "history.fitcoach", contents: "{}" });
});

test("private native backup errors cannot masquerade as a saved or opened file", async () => {
  let selected = { fileName: "history.json", contents: "{}" };
  let saved = {};
  const client = createNativePlatformClient({ plugin: {
    savePrivateBackup: async () => saved,
    pickPrivateBackup: async () => selected,
  } });
  await assert.rejects(() => client.savePrivateBackup("history.fitcoach", "{}"), /native_private_backup_save_failed/u);
  for (const file of [selected, { fileName: "history.fitcoach", contents: "" }, { fileName: `${"a".repeat(120)}.fitcoach`, contents: "{}" }, { fileName: "history.fitcoach", contents: "é".repeat(6 * 1024 * 1024 + 1) }]) {
    selected = file;
    await assert.rejects(() => client.pickPrivateBackup(), /native_private_backup_invalid_file/u);
  }
  saved = { saved: false, cancelled: true };
  assert.deepEqual(await client.savePrivateBackup("history.fitcoach", "{}"), { saved: false, cancelled: true });
});

test("native client fails closed when no bridge is installed", async () => {
  const client = createNativePlatformClient({ plugin: null });
  assert.equal(client.available, false);
  assert.deepEqual(await client.initialize(), { available: false, health: { available: false }, billingAvailable: false, offerings: [] });
  await assert.rejects(() => client.requestHealthAuthorization(), /native_capability_unavailable/u);
});

test("native recognition configures audio route and forwards partial/final transcripts", async () => {
  const callbacks = {};
  const events = new Map();
  const calls = [];
  const plugin = {
    configureVoice: async () => ({ available: true, bluetooth: true }),
    addListener: async (name, listener) => {
      events.set(name, listener);
      return { remove: async () => events.delete(name) };
    },
    startSpeechRecognition: async options => calls.push(["start", options]),
    stopSpeechRecognition: async () => calls.push(["stop"]),
    healthAvailability: async () => ({ available: true, source: "apple_health" }),
    getSubscriptionOfferings: async () => ({ offerings: [{ logicalId: "premium_yearly", localizedPrice: "$49.99" }] }),
  };
  const client = createNativePlatformClient({ plugin });
  const values = [];
  const session = client.createRecognitionSession({
    onInterim: value => values.push(["partial", value]),
    onFinal: value => values.push(["final", value]),
    onError: error => values.push(["error", error.code]),
  });
  await session.start();
  events.get("speechPartial")({ transcript: "hello" });
  events.get("speechFinal")({ transcript: "hello coach" });
  assert.deepEqual(values, [["partial", "hello"], ["final", "hello coach"]]);
  assert.equal(calls[0][0], "start");
  const readiness = await client.initialize();
  assert.equal(readiness.health.available, true);
  assert.equal(readiness.billingAvailable, true);
  await session.abort();
  assert.equal(calls.at(-1)[0], "stop");
});

test("native purchase events are normalized and listener removal is preserved", async () => {
  let registered;
  let removed = false;
  const client = createNativePlatformClient({
    plugin: {
      addListener: async (name, listener) => {
        registered = { name, listener };
        return { remove: async () => { removed = true; } };
      },
    },
  });
  const received = [];
  const handle = await client.onSubscriptionTransactionAvailable(transaction => received.push(transaction));
  assert.equal(registered.name, "subscriptionTransactionAvailable");
  registered.listener({
    store: "app_store",
    status: "verification_required",
    serverVerified: true,
    entitled: true,
    transactionId: "transaction-123",
    productId: "fitcoach_premium_monthly",
  });
  assert.deepEqual(received, [{
    store: "app_store",
    status: "verification_required",
    serverVerified: false,
    entitled: false,
    productId: "fitcoach_premium_monthly",
    transactionId: "transaction-123",
    purchaseToken: undefined,
    signedTransaction: undefined,
    errorCode: undefined,
  }]);
  registered.listener({
    store: "google_play",
    status: "failed",
    errorCode: "play_billing_6",
  });
  assert.deepEqual(received.at(-1), {
    store: "google_play",
    status: "failed",
    serverVerified: false,
    entitled: false,
    productId: undefined,
    transactionId: undefined,
    purchaseToken: undefined,
    signedTransaction: undefined,
    errorCode: "play_billing_6",
  });
  await handle.remove();
  assert.equal(removed, true);
});

test("native checkout requires an account UUID and forwards the binding to the store", async () => {
  const calls = [];
  const client = createNativePlatformClient({
    plugin: {
      purchaseSubscription: async options => {
        calls.push(options);
        return { launched: true };
      },
    },
  });
  await assert.rejects(() => client.purchaseSubscription("premium_monthly", "not-an-account"), /native_purchase_account_binding_required/u);
  assert.deepEqual(await client.purchaseSubscription("premium_monthly", "123e4567-e89b-12d3-a456-426614174000"), { launched: true });
  assert.deepEqual(calls, [{ logicalId: "premium_monthly", accountBinding: "123e4567-e89b-12d3-a456-426614174000" }]);
});

test("native health reads let the platform choose local today unless a day is explicit", async () => {
  const calls = [];
  const client = createNativePlatformClient({
    clock: () => new Date("2026-09-01T00:30:00.000Z"),
    plugin: {
      readDailyHealthSummary: async options => { calls.push(options); return { localDay: options.localDay || "native-today" }; },
    },
  });
  await client.readDailyHealthSummary();
  await client.readDailyHealthSummary("2026-08-31");
  assert.deepEqual(calls, [{}, { localDay: "2026-08-31" }]);
});

test("native purchase completion requires server proof before forwarding finish or acknowledgement", async () => {
  const calls = [];
  const client = createNativePlatformClient({
    plugin: {
      completeVerifiedPurchase: async options => {
        calls.push(options);
        return { completed: true };
      },
    },
  });
  await assert.rejects(() => client.completeVerifiedPurchase({ transactionId: "tx-1" }), /native_purchase_proof_required/u);
  await assert.rejects(() => client.completeVerifiedPurchase({ verificationId: "proof_reference_1234" }), /native_purchase_proof_required/u);
  assert.equal(calls.length, 0);
  assert.deepEqual(await client.completeVerifiedPurchase({
    transactionId: "tx-1",
    verificationId: "verification_ref_123456",
  }), { completed: true });
  assert.deepEqual(calls, [{
    transactionId: "tx-1",
    serverVerified: true,
    verificationId: "verification_ref_123456",
  }]);
});

test("secure native session adapter is unavailable without all bridge methods and bounded when present", async () => {
  const unavailable = createNativePlatformClient({ plugin: { readSecureSession: async () => ({ session: "secret" }) } });
  assert.equal(unavailable.secureSessionStorage.available, false);
  assert.equal(await unavailable.secureSessionStorage.read(), null);

  const calls = [];
  const available = createNativePlatformClient({
    plugin: {
      readSecureSession: async () => ({ session: " encrypted-session " }),
      writeSecureSession: async options => { calls.push(["write", options]); return { saved: true }; },
      clearSecureSession: async () => { calls.push(["clear"]); return { cleared: true }; },
    },
  });
  assert.equal(available.secureSessionStorage.available, true);
  assert.equal(await available.secureSessionStorage.read(), "encrypted-session");
  assert.equal(await available.secureSessionStorage.write("session-json"), true);
  assert.equal(await available.secureSessionStorage.clear(), true);
  assert.deepEqual(calls, [["write", { session: "session-json" }], ["clear"]]);
});
