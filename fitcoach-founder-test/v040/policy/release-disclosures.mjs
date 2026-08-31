/** Machine-readable store disclosure and release-gate contract. */

export const STORE_DISCLOSURE_REQUIREMENTS = Object.freeze({
  shared: Object.freeze([
    "Public, non-placeholder privacy policy describing collection, sharing, retention, deletion, and consent withdrawal.",
    "Accurate account, nutrition, health, voice, photo, analytics, and AI data-flow declarations.",
    "In-app support contact and a tested export/deletion route.",
    "Health and fitness purpose, limitations, risks, and professional-advice disclaimer.",
    "Age-target declaration consistent with the actual product and marketing creative.",
  ]),
  apple: Object.freeze([
    "App Privacy responses and an in-app privacy-policy link.",
    "In-app account deletion when account creation is offered.",
    "StoreKit purchase, restore-purchase, subscription terms, and entitlement handling.",
    "Specific HealthKit data-use descriptions and least-privilege permissions.",
    "No HealthKit or youth data used for advertising, marketing, or data mining.",
  ]),
  googlePlay: Object.freeze([
    "Data Safety and Health apps declarations.",
    "In-app account deletion plus a public web deletion-request URL when account creation is offered.",
    "Play Billing purchase, acknowledgement, restore, refund, and entitlement handling.",
    "Health Connect permissions matching declared data types and an in-app Manage access path.",
    "Target audience declaration and Families-policy review for any included child age group.",
  ]),
});

const REQUIRED_RELEASE_FLAGS = Object.freeze([
  "privacyPolicyUrlLive",
  "termsUrlLive",
  "supportContactLive",
  "ageGateLive",
  "accountDeletionLive",
  "dataExportLive",
  "nutritionProviderVerified",
  "subscriptionReceiptsVerified",
  "healthPermissionFlowsVerified",
  "storeMetadataComplete",
]);

export function evaluateStoreReleaseReadiness(flags = {}) {
  const missing = REQUIRED_RELEASE_FLAGS.filter(flag => flags[flag] !== true);
  return Object.freeze({
    ready: missing.length === 0,
    missing: Object.freeze(missing),
    evaluatedFlags: Object.freeze(Object.fromEntries(REQUIRED_RELEASE_FLAGS.map(flag => [flag, flags[flag] === true]))),
  });
}

export const CURRENT_STORE_DISCLOSURES = Object.freeze({
  releaseChannel: "web_preview",
  accountStorage: "Local browser profile in the current build; account sync is not yet verified here.",
  nutrition: "Manual and demo estimates are user-reviewed. Provider-backed barcode readiness is not proof that a production provider is active.",
  photos: "Meal and progress-photo previews are local object URLs; current preview code does not persist or upload raw image bytes.",
  microphone: "Browser speech recognition may be processed by the browser or operating system. FitCoach does not persist microphone audio in app state.",
  health: "HealthKit and Health Connect require native apps and explicit system permission; no live sync is claimed by this web preview.",
  subscriptions: "No paid entitlement is production-ready until store receipts and server-side entitlement checks pass.",
  youth: "The current release is 18+ while the 13–17 safety, consent, moderation, and legal gates remain incomplete.",
});
