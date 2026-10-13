import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PRIVATE_BACKUP_FORMAT,
  PRIVATE_BACKUP_ITERATIONS,
  createPrivateBackup,
  inspectPrivateBackup,
  openPrivateBackup,
  privateBackupSummary,
} from "../v040/services/private-backup.mjs";
import { createInitialState } from "../v040/core/store.mjs";
import { renderModal } from "../v040/ui/modal.mjs";
import { renderProfileScreen } from "../v040/ui/profile-screen.mjs";

const PASSPHRASE = "correct horse battery staple";
const NOW = new Date("2026-09-08T16:00:00.000Z");

function stateFixture() {
  const state = createInitialState("mo", NOW);
  state.profile.onboarded = true;
  state.profile.ageBand = "adult_18_plus";
  state.sessions = [{ id: "session-1" }, { id: "session-2" }];
  state.chat = [{ id: "message-1", role: "coach", text: "Welcome back." }];
  state.activeWorkout = { id: "workout-1" };
  state.nutrition.days = {
    "2026-09-08": { date: "2026-09-08", entries: [{ id: "food-1" }, { id: "food-2" }] },
  };
  return state;
}

test("private backup round-trips UTF-8 FitCoach state with authenticated metadata", async () => {
  const state = stateFixture();
  state.memories = ["Café strength day 🏋️"];
  const serialized = await createPrivateBackup(JSON.stringify(state), PASSPHRASE, { now: NOW, appBuild: "0.8.0" });
  const envelope = JSON.parse(serialized);
  assert.equal(envelope.format, PRIVATE_BACKUP_FORMAT);
  assert.equal(envelope.kdf.iterations, PRIVATE_BACKUP_ITERATIONS);
  assert.equal(envelope.kdf.hash, "SHA-256");
  assert.equal(envelope.cipher.name, "AES-GCM");
  assert.equal(envelope.payload.includes("Café"), false);
  assert.equal(serialized.includes("Welcome back"), false);

  const opened = await openPrivateBackup(serialized, PASSPHRASE);
  assert.deepEqual(opened.state, state);
  assert.equal(opened.createdAt, NOW.toISOString());
  assert.equal(opened.appBuild, "0.8.0");
  assert.deepEqual(opened.summary, {
    sessions: 2,
    nutritionEntries: 2,
    coachMessages: 1,
    hasActiveWorkout: true,
    onboarded: true,
  });
});

test("wrong passphrases, ciphertext changes, and authenticated metadata changes fail closed", async () => {
  const serialized = await createPrivateBackup(JSON.stringify(stateFixture()), PASSPHRASE, { now: NOW, appBuild: "0.8.0" });
  await assert.rejects(openPrivateBackup(serialized, "this is the wrong passphrase"), /private_backup_wrong_passphrase_or_corrupt/u);

  const ciphertextTamper = JSON.parse(serialized);
  ciphertextTamper.payload = `${ciphertextTamper.payload.slice(0, -5)}AAAAA`;
  await assert.rejects(openPrivateBackup(JSON.stringify(ciphertextTamper), PASSPHRASE), /private_backup_wrong_passphrase_or_corrupt/u);

  const metadataTamper = JSON.parse(serialized);
  metadataTamper.appBuild = "9.9.9";
  await assert.rejects(openPrivateBackup(JSON.stringify(metadataTamper), PASSPHRASE), /private_backup_wrong_passphrase_or_corrupt/u);
});

test("format inspection rejects KDF downgrade, malformed state, and weak passphrases", async () => {
  await assert.rejects(createPrivateBackup(JSON.stringify(stateFixture()), "too short"), /private_backup_passphrase_too_short/u);
  await assert.rejects(createPrivateBackup(JSON.stringify({ hello: "world" }), PASSPHRASE), /private_backup_invalid_state/u);
  assert.throws(() => inspectPrivateBackup("not json"), /private_backup_invalid_file/u);

  const serialized = await createPrivateBackup(JSON.stringify(stateFixture()), PASSPHRASE, { now: NOW });
  const downgraded = JSON.parse(serialized);
  downgraded.kdf.iterations = 1;
  assert.throws(() => inspectPrivateBackup(JSON.stringify(downgraded)), /private_backup_invalid_file/u);
});

test("backup summary counts only the portable state contents", () => {
  assert.deepEqual(privateBackupSummary(stateFixture()), {
    sessions: 2,
    nutritionEntries: 2,
    coachMessages: 1,
    hasActiveWorkout: true,
    onboarded: true,
  });
});

test("profile and modal expose a private encrypted backup flow with explicit restore review", () => {
  const state = stateFixture();
  const profile = renderProfileScreen({
    state,
    ui: { account: { phase: "unavailable", config: {} }, native: { health: {} }, disclosures: { "profile-tools": true } },
  });
  assert.match(profile, /Private backup &amp; restore/u);
  assert.match(profile, /data-action="open-private-backup"/u);
  assert.doesNotMatch(profile, /data-action="export-data"/u);

  const context = { state, decision: {}, exerciseById: () => null };
  const menu = renderModal({ type: "private-backup", phase: "menu" }, context);
  assert.match(menu, /AES-256 encryption happens on this device/u);
  assert.match(menu, /data-action="private-backup-create"/u);
  assert.match(menu, /type="file"[^>]+data-action="private-backup-file"/u);
  assert.match(menu, /type="password"/u);
  assert.match(menu, /data-action="export-data"/u);
  assert.match(menu, /JSON is unencrypted/u);

  const unlock = renderModal({ type: "private-backup", phase: "restore-unlock", fileName: "history.fitcoach", fileSizeLabel: "4 KB" }, context);
  assert.match(unlock, /Review backup/u);
  assert.match(unlock, /data-action="private-backup-unlock"/u);

  const review = renderModal({ type: "private-backup", phase: "restore-review", summary: privateBackupSummary(state), appBuild: "0.8.0", createdLabel: "Sep 8, 2026" }, context);
  assert.match(review, /Backup authenticated/u);
  assert.match(review, /Replace with this backup/u);
  assert.match(review, /Nothing is uploaded/u);
});

test("application restore keeps account, health, and store authority device-specific", () => {
  const app = readFileSync(new URL("../v040/app.js", import.meta.url), "utf8");
  assert.match(app, /pendingPrivateBackupFile = null/u);
  assert.match(app, /if \(ui\.modal\?\.type === "private-backup"\) clearPendingPrivateBackup\(\)/u);
  assert.match(app, /next\.integrations\.cloudSync = \{ status: "local_only"/u);
  assert.match(app, /next\.integrations\.appleHealth = \{ status: "native_required"/u);
  assert.match(app, /next\.integrations\.payments = \{[\s\S]*status: "not_configured"/u);
  assert.match(app, /store\.replace\(stateForPrivateBackupRestore\(pendingPrivateBackupRestore\), \{\s*expected: pendingPrivateBackupExpectedState,\s*assertCurrent:/u);
  assert.match(app, /private_backup_wrong_passphrase_or_corrupt/u);
});

test("native backup picker preserves the existing web fallback and disables competing file actions while busy", () => {
  const context = { state: stateFixture(), decision: {}, nativeBackupAvailable: true };
  const idle = renderModal({ type: "private-backup", phase: "menu" }, context);
  assert.match(idle, /button[^>]+data-action="private-backup-native-file"/u);
  assert.doesNotMatch(idle, /type="file"/u);
  const busy = renderModal({ type: "private-backup", phase: "menu", busy: true, busyLabel: "Choose your backup…" }, context);
  assert.match(busy, /data-action="private-backup-native-file" disabled/u);
  assert.match(busy, /data-action="export-data" disabled/u);
  assert.match(busy, /Choose your backup…/u);
});
