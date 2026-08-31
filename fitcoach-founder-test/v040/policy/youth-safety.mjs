/**
 * Product-safety policy for an eventual 13+ release.
 *
 * This is an enforceable product contract, not a claim of legal compliance.
 * The current web preview remains adult-only until the neutral age gate,
 * consent handling, deletion workflow, moderation, and legal review are live.
 */

export const AGE_BANDS = Object.freeze(["unknown", "under_13", "teen_13_17", "adult_18_plus"]);
export const CURRENT_RELEASE_MINIMUM_AGE = 18;

export const TEEN_RELEASE_GATE = Object.freeze({
  status: "blocked_pending_implementation_and_legal_review",
  intendedMinimumAge: 13,
  currentMinimumAge: CURRENT_RELEASE_MINIMUM_AGE,
  requirements: Object.freeze([
    "Neutral age gate before account creation or collection of personal data.",
    "Region-aware consent and parental-consent review where applicable.",
    "Public privacy policy, terms, retention schedule, export, and account deletion.",
    "Photo/community moderation, report/block flows, and child-safety escalation process.",
    "Teen-safe nutrition and coaching review by qualified clinical and youth-safety experts.",
    "No targeted advertising or health-data marketing.",
  ]),
});

const ADULT_CAPABILITIES = Object.freeze({
  canCreateAccount: true,
  canUsePrivateTraining: true,
  canUsePrivateNutritionLog: true,
  canSetCalorieTargets: true,
  canUseRudeTone: true,
  canUseCompetitiveTone: true,
  canPostCommunityContent: true,
  canShareProgressPhotos: true,
  canUseDirectMessages: false,
  canPurchaseWithoutGuardianGate: true,
  canReceiveTargetedAds: false,
  canUseHealthDataForMarketing: false,
  nutritionMode: "standard_confirmed_only",
});

const TEEN_CAPABILITIES = Object.freeze({
  ...ADULT_CAPABILITIES,
  canSetCalorieTargets: false,
  canUseRudeTone: false,
  canUseCompetitiveTone: false,
  canPostCommunityContent: false,
  canShareProgressPhotos: false,
  canUseDirectMessages: false,
  canPurchaseWithoutGuardianGate: false,
  nutritionMode: "log_only_no_deficit_coaching",
});

const BLOCKED_CAPABILITIES = Object.freeze({
  canCreateAccount: false,
  canUsePrivateTraining: false,
  canUsePrivateNutritionLog: false,
  canSetCalorieTargets: false,
  canUseRudeTone: false,
  canUseCompetitiveTone: false,
  canPostCommunityContent: false,
  canShareProgressPhotos: false,
  canUseDirectMessages: false,
  canPurchaseWithoutGuardianGate: false,
  canReceiveTargetedAds: false,
  canUseHealthDataForMarketing: false,
  nutritionMode: "blocked",
});

export function normalizeAgeBand(value) {
  return AGE_BANDS.includes(value) ? value : "unknown";
}

export function ageBandFromAge(value) {
  const age = Number(value);
  if (!Number.isInteger(age) || age < 0 || age > 120) return "unknown";
  if (age < 13) return "under_13";
  if (age < 18) return "teen_13_17";
  return "adult_18_plus";
}

export function capabilitiesForAgeBand(value) {
  const ageBand = normalizeAgeBand(value);
  if (ageBand === "adult_18_plus") return ADULT_CAPABILITIES;
  if (ageBand === "teen_13_17") return TEEN_CAPABILITIES;
  return BLOCKED_CAPABILITIES;
}

export function sanitizeCoachToneForAge(tone, ageBand) {
  const requested = typeof tone === "string" ? tone : "Direct";
  const capabilities = capabilitiesForAgeBand(ageBand);
  if (requested === "Rude" && !capabilities.canUseRudeTone) return "Direct";
  if (requested === "Competitive" && !capabilities.canUseCompetitiveTone) return "Direct";
  return requested;
}

export function teenReleaseEligibility({
  ageBand,
  neutralAgeGate = false,
  consentReviewComplete = false,
  deletionFlowLive = false,
  moderationLive = false,
  legalReviewComplete = false,
} = {}) {
  const normalized = normalizeAgeBand(ageBand);
  if (normalized === "under_13" || normalized === "unknown") return Object.freeze({ eligible: false, reason: "age_not_eligible" });
  if (normalized === "adult_18_plus") return Object.freeze({ eligible: true, reason: "adult" });
  const gates = { neutralAgeGate, consentReviewComplete, deletionFlowLive, moderationLive, legalReviewComplete };
  const missing = Object.entries(gates).filter(([, ready]) => ready !== true).map(([name]) => name);
  return Object.freeze({ eligible: missing.length === 0, reason: missing.length ? "teen_release_gates_incomplete" : "teen_gates_complete", missing: Object.freeze(missing) });
}
