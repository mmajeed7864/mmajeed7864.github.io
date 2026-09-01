function pluginFromScope(scope = globalThis) {
  return scope?.Capacitor?.Plugins?.FitCoachNative || scope?.FitCoachNative || null;
}

const clean = (value, max = 240) => typeof value === "string" ? value.trim().slice(0, max) : "";

function normalizeStoreTransaction(value) {
  if (!value || typeof value !== "object") return null;
  const store = value.store === "app_store" || value.store === "google_play" ? value.store : "";
  const status = ["verification_required", "pending", "cancelled", "failed"].includes(value.status) ? value.status : "";
  if (!store || !status) return null;
  return Object.freeze({
    store,
    status,
    serverVerified: false,
    entitled: false,
    productId: clean(value.productId, 240) || undefined,
    transactionId: clean(value.transactionId, 240) || undefined,
    purchaseToken: clean(value.purchaseToken, 4_000) || undefined,
    signedTransaction: clean(value.signedTransaction, 16_000) || undefined,
    errorCode: clean(value.errorCode, 120) || undefined,
  });
}

export function createNativePlatformClient({ plugin = pluginFromScope(), clock = () => new Date() } = {}) {
  const available = Boolean(plugin && typeof plugin === "object");
  const secureStorageAvailable = available
    && typeof plugin.readSecureSession === "function"
    && typeof plugin.writeSecureSession === "function"
    && typeof plugin.clearSecureSession === "function";

  function requireMethod(name) {
    if (!available || typeof plugin?.[name] !== "function") throw new Error("native_capability_unavailable");
    return plugin[name].bind(plugin);
  }

  function createRecognitionSession(callbacks = {}) {
    if (!available || typeof plugin.startSpeechRecognition !== "function") return null;
    let stopped = false;
    let listeners = [];

    async function removeListeners() {
      const current = listeners;
      listeners = [];
      await Promise.all(current.map(async listener => {
        try { await listener?.remove?.(); } catch {}
      }));
    }

    async function stop() {
      if (stopped) return;
      stopped = true;
      try { await plugin.stopSpeechRecognition?.(); } catch {}
      try { await plugin.endVoiceSession?.(); } catch {}
      await removeListeners();
    }

    return Object.freeze({
      async start() {
        try {
          const route = await requireMethod("configureVoice")();
          if (route?.available !== true) throw new Error("native_voice_unavailable");
          const registrations = await Promise.all([
            plugin.addListener("speechPartial", event => { if (!stopped) callbacks.onInterim?.(clean(event?.transcript, 2_000)); }),
            plugin.addListener("speechFinal", event => { if (!stopped) callbacks.onFinal?.(clean(event?.transcript, 2_000)); }),
            plugin.addListener("speechError", event => {
              if (stopped) return;
              const error = Object.assign(new Error(clean(event?.code, 80) || "native_recognition_failed"), { code: clean(event?.code, 80) || "native_recognition_failed" });
              callbacks.onError?.(error);
            }),
          ]);
          if (stopped) {
            await Promise.all(registrations.map(listener => listener?.remove?.()));
            return;
          }
          listeners = registrations;
          await plugin.startSpeechRecognition({ locale: "en-US", partialResults: true });
        } catch (error) {
          await stop();
          callbacks.onError?.(error);
        }
      },
      stop,
      abort: stop,
    });
  }

  async function addListener(name, listener) {
    if (!available || typeof plugin.addListener !== "function") return Object.freeze({ remove: async () => {} });
    return plugin.addListener(name, listener);
  }

  const secureSessionStorage = Object.freeze({
    available: secureStorageAvailable,
    async read() {
      if (!secureStorageAvailable) return null;
      const result = await plugin.readSecureSession();
      return clean(result?.session, 16_000) || null;
    },
    async write(session) {
      if (!secureStorageAvailable) return false;
      const bounded = clean(session, 16_000);
      if (!bounded) throw new Error("invalid_secure_session");
      const result = await plugin.writeSecureSession({ session: bounded });
      return result?.saved === true;
    },
    async clear() {
      if (!secureStorageAvailable) return false;
      const result = await plugin.clearSecureSession();
      return result?.cleared === true;
    },
  });

  return Object.freeze({
    available,
    createRecognitionSession,
    secureSessionStorage,
    async initialize() {
      if (!available) return Object.freeze({ available: false, health: { available: false }, billingAvailable: false, offerings: [] });
      let health = { available: false, reason: "native_health_unavailable" };
      let offerings = [];
      try { health = await requireMethod("healthAvailability")(); } catch {}
      if (typeof plugin.getSubscriptionOfferings === "function") {
        try {
          const result = await plugin.getSubscriptionOfferings();
          offerings = Array.isArray(result?.offerings) ? result.offerings.filter(offer => offer?.logicalId && offer?.localizedPrice) : [];
        } catch {}
      }
      return Object.freeze({
        available: true,
        health,
        billingAvailable: offerings.length > 0,
        offerings: Object.freeze(offerings),
      });
    },
    // The current product surface is read-only. Workout-write authorization is
    // deliberately not exposed until an explicit approved-export action ships.
    async requestHealthAuthorization() { return requireMethod("requestHealthAuthorization")(); },
    async readDailyHealthSummary(localDay) {
      const requestedDay = clean(localDay, 10);
      return requireMethod("readDailyHealthSummary")(requestedDay ? { localDay: requestedDay } : {});
    },
    async purchaseSubscription(logicalId, accountBinding) {
      const binding = clean(accountBinding, 64);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(binding)) {
        throw new Error("native_purchase_account_binding_required");
      }
      const result = await requireMethod("purchaseSubscription")({ logicalId, accountBinding: binding });
      return result?.launched === true ? Object.freeze({ launched: true }) : normalizeStoreTransaction(result);
    },
    async restorePurchases() {
      const result = await requireMethod("restorePurchases")();
      const transactions = Array.isArray(result?.transactions)
        ? result.transactions.map(normalizeStoreTransaction).filter(Boolean)
        : [];
      return Object.freeze({ transactions: Object.freeze(transactions) });
    },
    async completeVerifiedPurchase({ transactionId, purchaseToken, verificationId } = {}) {
      const reference = clean(verificationId, 128);
      const appleId = clean(transactionId, 240);
      const googleToken = clean(purchaseToken, 4_000);
      if (!/^[A-Za-z0-9_-]{16,128}$/u.test(reference) || (!appleId && !googleToken)) {
        throw new Error("native_purchase_proof_required");
      }
      return requireMethod("completeVerifiedPurchase")({
        ...(appleId ? { transactionId: appleId } : {}),
        ...(googleToken ? { purchaseToken: googleToken } : {}),
        serverVerified: true,
        verificationId: reference,
      });
    },
    async openManageSubscriptions() { return requireMethod("openManageSubscriptions")(); },
    async prepareVoiceOutput() {
      if (!available || typeof plugin.prepareVoiceOutput !== "function") return { available: false };
      return plugin.prepareVoiceOutput();
    },
    async completeVoiceOutput() {
      if (!available || typeof plugin.completeVoiceOutput !== "function") return { available: false };
      return plugin.completeVoiceOutput();
    },
    async onVoiceInterrupted(listener) {
      return addListener("voiceInterrupted", listener);
    },
    async onSubscriptionTransactionAvailable(listener) {
      return addListener("subscriptionTransactionAvailable", event => {
        const transaction = normalizeStoreTransaction(event);
        if (transaction) listener?.(transaction);
      });
    },
    async onSubscriptionEntitlementChanged(listener) {
      return addListener("subscriptionEntitlementChanged", () => listener?.());
    },
    async endVoiceSession() {
      if (!available) return;
      try { await plugin.endVoiceSession?.(); } catch {}
    },
  });
}
