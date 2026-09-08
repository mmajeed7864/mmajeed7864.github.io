import {
  projectStateForEncryptedSync,
  syncAccountScope,
  syncStateDigest,
  syncStateSignature,
} from "../domain/sync-projection.mjs";

// One explicit sync action at a time. Writes are never automatically retried:
// a missing response may mean the server committed the first request already.
export function createSyncCoordinator({ client, getStore, getConsentVersion, deviceId, schemaVersion, applyRemote, onState = () => {}, clock = () => new Date() }) {
  let generation = 0;
  let active = null;

  function cancel() { generation += 1; active = null; }

  async function sync({ preference = "auto", pendingRemote = null } = {}) {
    if (active !== null) throw new Error("sync_in_progress");
    if (!["auto", "cloud", "device"].includes(preference)) throw new Error("invalid_sync_preference");
    const subject = client.session?.user?.id;
    if (!subject) throw new Error("authentication_required");
    const store = getStore();
    const partition = store.founder();
    const run = ++generation;
    active = run;
    const assertCurrent = () => {
      if (run !== generation || client.session?.user?.id !== subject || getStore() !== store || store.founder() !== partition) throw new Error("sync_cancelled");
    };
    const update = async fn => {
      assertCurrent();
      const next = await store.update(draft => { assertCurrent(); return fn(draft); });
      assertCurrent();
      onState(next);
      return next;
    };
    try {
      const accountScope = await syncAccountScope(subject);
      assertCurrent();
      await store.refresh?.();
      assertCurrent();
      const version = getConsentVersion();
      if (!version) throw new Error("ACCOUNT_SYNC_NOT_CONFIGURED");
      const cloud = store.get().integrations.cloudSync;
      const sameAccount = cloud.accountScope === accountScope;
      if (!sameAccount && preference !== "auto") throw new Error("conflict_choice_expired");
      if (!sameAccount) {
        await update(draft => { draft.integrations.cloudSync = { status: "local_only", revision: 0, consentVersion: "", lastSyncedAt: null, accountScope }; });
      }
      if (!sameAccount || cloud.consentVersion !== version) {
        await client.recordSyncConsent({ policyVersion: version, decision: "accepted" });
        assertCurrent();
        await update(draft => { draft.integrations.cloudSync.consentVersion = version; });
      }
      // Always re-read before a conflict choice. Never overwrite a newer unseen revision.
      const remote = await client.pullSync();
      assertCurrent();
      await store.refresh?.();
      assertCurrent();
      const local = store.get();
      const localSignature = syncStateSignature(local);
      const digest = await syncStateDigest(local);
      assertCurrent();
      const ensureUnchanged = () => {
        assertCurrent();
        if (syncStateSignature(store.get()) !== localSignature) throw new Error("local_changes_during_sync");
      };
      ensureUnchanged();
      const localRevision = Number(local.integrations.cloudSync.revision) || 0;
      const remoteRevision = Number(remote.revision) || 0;
      const dirty = local.integrations.cloudSync.lastSyncedDigest !== digest;
      const conflict = async () => {
        await update(draft => { draft.integrations.cloudSync.status = "conflict"; });
        return { status: "conflict", remote };
      };
      if (preference !== "auto" && (!pendingRemote || Number(pendingRemote.revision) !== remoteRevision)) return await conflict();
      const remoteSignature = remote.state ? syncStateSignature(remote.state) : null;
      const sameContent = remoteSignature === localSignature;
      if (remote.state && preference === "auto" && remoteRevision !== localRevision && dirty && !sameContent) return await conflict();

      if (remote.state && (preference === "cloud" || (preference === "auto" && remoteRevision !== localRevision && !dirty && !sameContent))) {
        const remoteDigest = await syncStateDigest(remote.state);
        ensureUnchanged();
        const releaseAccessAllowed = await applyRemote(remote, { lastSyncedDigest: remoteDigest, accountScope }, { expected: local, assertCurrent });
        let status;
        await update(draft => {
          status = syncStateSignature(draft) === remoteSignature ? "connected" : "pending";
          draft.integrations.cloudSync.status = status;
        });
        return { status, restored: true, releaseAccessAllowed };
      }

      if (sameContent) {
        // Also recovers an already-committed PUT whose acknowledgement was lost.
        let status;
        await update(draft => {
          status = syncStateSignature(draft) === localSignature ? "connected" : "pending";
          draft.integrations.cloudSync = { status, revision: remoteRevision, consentVersion: version, lastSyncedAt: remote.updatedAt || clock().toISOString(), lastSyncedDigest: digest, accountScope };
        });
        return { status };
      }

      const result = await client.pushSync({ baseRevision: remoteRevision, deviceId: deviceId(), schemaVersion, state: projectStateForEncryptedSync(local) });
      assertCurrent();
      // Compare immediately after the acknowledgement, without awaiting another hash.
      let status;
      await update(draft => {
        status = syncStateSignature(draft) === localSignature ? "connected" : "pending";
        draft.integrations.cloudSync = { status, revision: Number(result.revision), consentVersion: version, lastSyncedAt: result.updatedAt || clock().toISOString(), lastSyncedDigest: digest, accountScope };
      });
      return { status };
    } catch (error) {
      // Old requests must never repaint/reset a new account or device partition.
      assertCurrent();
      if (error?.message !== "local_reset_detected") await update(draft => { draft.integrations.cloudSync.status = "error"; });
      throw error;
    } finally {
      if (active === run) active = null;
    }
  }
  return Object.freeze({ sync, cancel });
}
