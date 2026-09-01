import { registerPlugin } from "@capacitor/core";

export type VoiceRoute = {
  available: boolean;
  input: string | null;
  outputs: string[];
  bluetooth: boolean;
  routeConfirmed?: boolean;
  phase: "idle" | "listening" | "speaking" | "interrupted" | "recovery_required" | "unavailable";
};

export type DailyHealthSummary = {
  bridgeVersion: 1;
  source: "apple_health" | "health_connect";
  localDay: string;
  steps: number;
  activeEnergyKcal: number;
  aggregateOnly: true;
};

export type SubscriptionOffering = {
  logicalId: "premium_monthly" | "premium_yearly";
  productId: string;
  displayName: string;
  localizedPrice: string;
  offerToken?: string;
};

export type StoreTransaction = {
  store: "app_store" | "google_play";
  status: "verification_required" | "pending" | "cancelled" | "failed";
  serverVerified: false;
  entitled: false;
  productId?: string;
  transactionId?: string;
  purchaseToken?: string;
  signedTransaction?: string;
  errorCode?: string;
};

export interface FitCoachNativePlugin {
  configureVoice(): Promise<VoiceRoute>;
  endVoiceSession(): Promise<void>;
  prepareVoiceOutput(): Promise<VoiceRoute>;
  completeVoiceOutput(): Promise<VoiceRoute>;
  startSpeechRecognition(options?: { locale?: string; partialResults?: boolean }): Promise<{ started: boolean }>;
  stopSpeechRecognition(): Promise<void>;
  healthAvailability(): Promise<{ available: boolean; source: "apple_health" | "health_connect"; reason?: string }>;
  requestHealthAuthorization(): Promise<{ requested: boolean; source: "apple_health" | "health_connect"; workoutWriteRequested: false }>;
  readDailyHealthSummary(options?: { localDay?: string }): Promise<DailyHealthSummary>;
  getSubscriptionOfferings(): Promise<{ available: boolean; offerings: SubscriptionOffering[] }>;
  purchaseSubscription(options: { logicalId: "premium_monthly" | "premium_yearly"; accountBinding: string }): Promise<StoreTransaction | { launched: true }>;
  restorePurchases(): Promise<{ transactions: StoreTransaction[] }>;
  completeVerifiedPurchase(options: { transactionId?: string; purchaseToken?: string; serverVerified: true; verificationId: string }): Promise<{ completed: boolean }>;
  openManageSubscriptions(): Promise<{ opened: boolean }>;
  readSecureSession(): Promise<{ session: string | null }>;
  writeSecureSession(options: { session: string }): Promise<{ saved: boolean }>;
  clearSecureSession(): Promise<{ cleared: boolean }>;
  addListener(event: "voiceRouteChanged", listener: (route: VoiceRoute) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(event: "voiceInterrupted", listener: (event: { shouldResumeOutput: boolean }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(event: "speechPartial" | "speechFinal", listener: (event: { transcript: string }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(event: "speechError", listener: (event: { code: string; recoverable: boolean }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(event: "subscriptionTransactionAvailable", listener: (event: StoreTransaction) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(event: "subscriptionEntitlementChanged", listener: (event: { active: boolean; serverVerified: boolean; authoritative: false; productId?: string }) => void): Promise<{ remove: () => Promise<void> }>;
}

export const FitCoachNative = registerPlugin<FitCoachNativePlugin>("FitCoachNative");
