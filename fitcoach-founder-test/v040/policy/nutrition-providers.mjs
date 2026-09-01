/**
 * Nutrition-provider provenance contract.
 *
 * Provider names and confidence values arriving over the network are not
 * authority. This registry assigns the strongest claim FitCoach is allowed to
 * make for each source. Unknown sources fail closed instead of becoming
 * "verified" food records by accident.
 */

export const NUTRITION_VERIFICATION_LEVELS = Object.freeze([
  "government_reference",
  "community_label",
  "user_entered",
]);

export const NUTRITION_PROVIDERS = Object.freeze({
  usda_fdc: Object.freeze({
    id: "usda_fdc",
    label: "USDA FoodData Central",
    verificationLevel: "government_reference",
    accuracyLabel: "USDA reference record",
    license: "CC0 1.0 Universal (public domain dedication)",
    allowedHosts: Object.freeze(["fdc.nal.usda.gov", "api.nal.usda.gov"]),
    productImagesAllowed: false,
    warning: "Branded records can reproduce manufacturer label values. Check the package when exact values matter.",
  }),
  open_food_facts: Object.freeze({
    id: "open_food_facts",
    label: "Open Food Facts",
    verificationLevel: "community_label",
    accuracyLabel: "Community product record",
    license: "Database: ODbL; individual contents: Database Contents License",
    allowedHosts: Object.freeze([
      "openfoodfacts.org",
      "world.openfoodfacts.org",
      "us.openfoodfacts.org",
    ]),
    productImagesAllowed: false,
    warning: "Open Food Facts is community-contributed and does not guarantee accuracy, completeness, or reliability. Check the package label.",
  }),
  user_entered: Object.freeze({
    id: "user_entered",
    label: "Your entry",
    verificationLevel: "user_entered",
    accuracyLabel: "User-entered values",
    license: "Not applicable",
    allowedHosts: Object.freeze([]),
    productImagesAllowed: false,
    warning: "Values were entered manually. Check the package or recipe source.",
  }),
});

export const NUTRITION_PROVIDER_RELEASE_GATE = Object.freeze({
  productionReady: true,
  liveProvider: "open_food_facts",
  governmentReferenceReady: false,
  blocker: "USDA FoodData Central government-reference search remains disabled until its server-side API key is configured. Live search uses clearly labeled Open Food Facts community records.",
  requirements: Object.freeze([
    "Keep provider API keys on the server; never ship them in the browser bundle.",
    "Return a stable provider record ID, retrieval time, serving basis, and source URL with every result.",
    "Preserve provider license and attribution requirements in product and export surfaces.",
    "Show community label data as community-contributed, never as laboratory-verified.",
    "Require user review of serving and portion before any nutrients count.",
    "Monitor provider coverage, stale records, corrections, rate limits, and regional barcode behavior.",
  ]),
});

const clean = (value, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function canonicalProviderId(value) {
  const id = clean(value, 60).toLowerCase().replace(/[ -]+/g, "_");
  if (["fooddata_central", "usda", "usda_fooddata_central"].includes(id)) return "usda_fdc";
  if (["openfoodfacts", "off"].includes(id)) return "open_food_facts";
  return Object.hasOwn(NUTRITION_PROVIDERS, id) ? id : "";
}

function safeSourceUrl(value, provider) {
  const source = clean(value, 400);
  if (!source || !provider.allowedHosts.length) return "";
  try {
    const url = new URL(source);
    if (url.protocol !== "https:") return "";
    const allowed = provider.allowedHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return allowed ? url.toString() : "";
  } catch {
    return "";
  }
}

function defaultSourceUrl(providerId, recordId) {
  if (!recordId) return "";
  if (providerId === "usda_fdc" && /^\d{1,12}$/.test(recordId)) {
    return `https://fdc.nal.usda.gov/food-details/${recordId}/nutrients`;
  }
  if (providerId === "open_food_facts" && /^\d{6,18}$/.test(recordId)) {
    return `https://world.openfoodfacts.org/product/${recordId}`;
  }
  return "";
}

function validRecordId(providerId, recordId) {
  if (providerId === "usda_fdc") return /^\d{1,12}$/.test(recordId);
  if (providerId === "open_food_facts") return /^\d{6,18}$/.test(recordId);
  return false;
}

/** Normalize provenance without trusting authority labels sent by a provider. */
export function normalizeNutritionProvenance(raw = {}) {
  const providerId = canonicalProviderId(raw.providerId || raw.provider || raw.source);
  const provider = NUTRITION_PROVIDERS[providerId];
  if (!provider || providerId === "user_entered") return null;
  const recordId = clean(raw.recordId || raw.sourceId || raw.fdcId || raw.barcode, 40);
  if (!validRecordId(providerId, recordId)) return null;
  const suppliedUrl = safeSourceUrl(raw.sourceUrl, provider);
  const sourceUrl = suppliedUrl || defaultSourceUrl(providerId, recordId);
  const parsedRetrievedAt = Date.parse(raw.retrievedAt || "");
  if (!sourceUrl || !Number.isFinite(parsedRetrievedAt)) return null;
  return Object.freeze({
    providerId,
    providerLabel: provider.label,
    recordId,
    sourceUrl,
    retrievedAt: new Date(parsedRetrievedAt).toISOString(),
    verificationLevel: provider.verificationLevel,
    accuracyLabel: provider.accuracyLabel,
    license: provider.license,
    warning: provider.warning,
  });
}

export function nutritionSourceDisclosure(provenance) {
  const normalized = normalizeNutritionProvenance(provenance || {});
  if (!normalized) {
    return Object.freeze({
      label: NUTRITION_PROVIDERS.user_entered.accuracyLabel,
      warning: NUTRITION_PROVIDERS.user_entered.warning,
      verified: false,
    });
  }
  return Object.freeze({
    label: normalized.accuracyLabel,
    warning: normalized.warning,
    verified: normalized.verificationLevel === "government_reference",
  });
}
