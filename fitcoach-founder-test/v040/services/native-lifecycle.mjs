const TRANSIENT_PURCHASE_RECONCILIATION_CODES = new Set([
  "APP_STORE_SERVER_FINISH_PENDING",
  "PLAY_PURCHASE_NOT_ACKNOWLEDGED_BY_BACKEND",
]);

function nativeErrorCode(error) {
  const code = typeof error?.code === "string" ? error.code.trim() : "";
  if (code) return code;
  return typeof error?.message === "string" ? error.message.trim() : "";
}

export function isTransientNativePurchaseReconciliationError(error) {
  return TRANSIENT_PURCHASE_RECONCILIATION_CODES.has(nativeErrorCode(error));
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function reconcileVerifiedSubscription({
  completePurchase,
  refreshEntitlements,
  hasActiveEntitlement,
  onAuthoritativeEntitlement = () => {},
  sleep = wait,
  maxAttempts = 4,
  baseDelayMs = 250,
} = {}) {
  if (typeof completePurchase !== "function"
      || typeof refreshEntitlements !== "function"
      || typeof hasActiveEntitlement !== "function") {
    throw new Error("invalid_subscription_reconciliation_contract");
  }

  // The backend entitlement is the sole unlock authority. Refresh it before
  // waiting for Apple finish / Google acknowledgement propagation so a slow
  // store control plane cannot stall an already verified account.
  const authoritativeEntitlement = await refreshEntitlements();
  if (!hasActiveEntitlement(authoritativeEntitlement)) throw new Error("subscription_not_verified");
  onAuthoritativeEntitlement(authoritativeEntitlement);

  const attempts = Math.max(1, Math.min(5, Math.trunc(Number(maxAttempts) || 1)));
  const initialDelay = Math.max(0, Math.min(2_000, Math.trunc(Number(baseDelayMs) || 0)));
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await completePurchase();
      if (result?.completed !== true) throw new Error("subscription_completion_proof_required");
      return authoritativeEntitlement;
    } catch (error) {
      lastError = error;
      if (!isTransientNativePurchaseReconciliationError(error) || attempt === attempts - 1) throw error;
      await sleep(initialDelay * (2 ** attempt));
    }
  }
  throw lastError || new Error("subscription_completion_proof_required");
}

export function createNativeRoutedAudio(base, nativeClient) {
  if (!nativeClient?.available || !base) return base;
  let generation = 0;
  let preparedGeneration = 0;

  async function completePrepared(expectedGeneration = preparedGeneration) {
    if (!expectedGeneration || preparedGeneration !== expectedGeneration) return;
    preparedGeneration = 0;
    try { await nativeClient.completeVoiceOutput(); } catch {}
  }

  return new Proxy(base, {
    get(target, property) {
      if (property === "play") return async () => {
        const playGeneration = ++generation;
        await nativeClient.prepareVoiceOutput();
        if (playGeneration !== generation) {
          // A pause/cancel landed while native route preparation was pending.
          // Only tear down if a newer playback has not already prepared.
          if (!preparedGeneration || preparedGeneration <= playGeneration) {
            preparedGeneration = playGeneration;
            await completePrepared(playGeneration);
          }
          return;
        }
        preparedGeneration = playGeneration;
        try {
          return await target.play?.();
        } catch (error) {
          await completePrepared(playGeneration);
          throw error;
        }
      };
      if (property === "pause") return () => {
        const activeGeneration = preparedGeneration;
        generation += 1;
        try { target.pause?.(); } finally { void completePrepared(activeGeneration); }
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, property, value) {
      if ((property === "onended" || property === "onerror") && typeof value === "function") {
        Reflect.set(target, property, event => {
          const activeGeneration = preparedGeneration;
          void completePrepared(activeGeneration);
          value(event);
        });
        return true;
      }
      return Reflect.set(target, property, value);
    },
  });
}
