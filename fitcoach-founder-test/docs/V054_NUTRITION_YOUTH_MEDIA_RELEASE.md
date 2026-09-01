# FitCoach nutrition, youth safety, media, and store-release contract

Updated 2026-08-31. This is an engineering and product-safety specification, not legal advice or a claim of regulatory compliance.

## What this implementation actually completes

- Every provider-backed nutrition record now carries a known provider ID, stable record ID, source URL, fixed reliability class, license disclosure, and provider-specific warning.
- Unknown nutrition providers fail closed. A network response cannot call itself verified and gain authority.
- USDA FoodData Central is classified as a government reference. Open Food Facts is classified as a community product record and is never described as verified.
- Barcode entries preserve source provenance through local persistence and portion edits.
- Food values still count only after explicit user review; photo/text estimates remain demo drafts and count zero until confirmation.
- The 100 exercise-card posters have deterministic 480 px WebP thumbnails. The conversion reduced catalogue media from 185.3 MiB of source PNGs to 1.7 MiB of thumbnails (99.1% smaller), while retaining full-resolution originals for technique detail.
- A machine-readable teen-safety policy and store-disclosure gate now fail closed rather than inferring that incomplete release work is done.

## Nutrition provider architecture

### Primary: USDA FoodData Central

Use a server-side FoodData Central integration for reference-food search and details. USDA requires a data.gov API key, says keys must not be made public, publishes FoodData Central under CC0, and requests source attribution. FitCoach must keep the key on its server and return a stable FDC ID, data type, retrieval time, serving basis, nutrient basis, and source URL.

USDA branded-food records can reflect manufacturer label submissions. The UI must say “USDA FoodData Central record,” not imply every branded value is laboratory-tested.

### Secondary: Open Food Facts

Use Open Food Facts for regional barcode coverage only with an explicit “Community product record” label. Its own documentation says the data is volunteered by users and provides no assurance of accuracy, completeness, or reliability. The database is ODbL, individual contents use the Database Contents License, and product images have separate CC BY-SA terms. This implementation does not import or display provider product images.

### Production blockers

The browser contract is ready, but provider production readiness is **false** until all of these are evidenced:

1. A real nutrition route exists instead of overloading the trainer route.
2. USDA credentials are server-only and production calls pass from deployed infrastructure.
3. Open Food Facts is a fallback, not a source described as verified.
4. Provider timeout, 429, 5xx, no-result, stale-data, and correction behavior is monitored.
5. Regional barcode tests pass for the release markets.
6. Export and deletion include provider provenance without retaining raw meal photos.

The live smoke test on 2026-08-31 returned `502 NUTRITION_PROVIDER_UNAVAILABLE` for provider text search. The app therefore directs users to manual package-label entry and must not claim live verified search in store metadata.

## Youth safety: intended 13–17 mode

FitCoach is currently configured as an **18+ release**. The intended future minimum is 13 only after consent, moderation, deletion, policy, and legal gates pass.

### Under 13

- Account creation and personal-data collection are blocked.
- No workaround “parent checkbox” is treated as verifiable parental consent.
- Marketing must not intentionally target this group while the product is not designed and approved for it.

### Ages 13–17

- Supportive, Direct, and evidence-bounded Strict coaching may be offered.
- Rude/roast and Competitive modes are disabled; there is no humiliation, body shaming, sexualized feedback, “earn/burn food,” or punishment exercise.
- Nutrition is log-only and confirmed-only. No app-generated calorie deficit, fasting target, weight-loss ranking, or aggressive body-composition goal.
- Public posts, public progress photos, direct messages, and exact location sharing are disabled until a dedicated, reviewed youth community system exists.
- No targeted advertising and no health data used for advertising or marketing.
- Purchases require the reviewed age/guardian purchase flow; dark patterns, countdown pressure, and streak-loss pressure are prohibited.
- Export, account deletion, report/block, safety escalation, and consent withdrawal must work before teen release.

### Required teen launch evidence

1. Neutral age gate before account creation or data collection.
2. Region-aware consent and parental-consent analysis.
3. Public privacy policy and terms reviewed for the actual data flows and legal entity.
4. Tested retention, export, deletion, and consent-withdrawal workflows.
5. Community moderation, filtering, report/block, reviewer tools, and child-safety escalation.
6. Youth-safety and nutrition review by qualified independent experts.

## Media delivery contract

Run:

```sh
node scripts/build-exercise-thumbnails.mjs
```

The build refuses to create a partial release unless it finds exactly 100 production poster PNGs. It strips metadata, creates 480 px WebP card images at quality 78, writes hashes and byte sizes to `generated-thumbnail-definitions.mjs`, and fails if a thumbnail is not smaller than its source.

Release tests require:

- exactly 100 thumbnail records;
- every file exists and matches its SHA-256;
- every thumbnail is at most 150 kB;
- aggregate thumbnail bytes are at least 90% smaller than source posters;
- catalogue cards use WebP while technique detail keeps source resolution;
- Cache Storage remains capped at 12 on-demand exercise images;
- motion MP4s continue direct streaming for Safari Range behavior.

Next media step: serve full-detail WebP/AVIF variants from object storage/CDN with immutable hashes and responsive `srcset`, then remove source PNGs from the shipped mobile bundle while retaining archival masters outside it.

## Store submission disclosures and blockers

Both stores need a public, non-placeholder privacy policy describing actual collection, sharing, processors, retention, deletion, and consent withdrawal. The developer legal entity, contact, processor list, retention schedule, production URLs, and final SDK inventory are not established in this repository, so a publishable legal policy must not be fabricated here.

Apple blockers include App Privacy answers, in-app privacy-policy access, in-app account deletion when accounts exist, StoreKit purchase and restore handling, specific HealthKit purpose strings, and a prohibition on health/youth data for advertising or data mining.

Google Play blockers include Data Safety and Health apps declarations, in-app account deletion plus a public deletion-request URL when accounts exist, Play Billing entitlement handling, least-privilege Health Connect declarations and Manage access, and an accurate target-audience declaration.

Do not submit until `evaluateStoreReleaseReadiness()` returns `ready: true` from production evidence—not manually toggled placeholders.

## Current first-party sources

- USDA FoodData Central API and license: https://fdc.nal.usda.gov/api-guide/
- Open Food Facts API data and license limitations: https://openfoodfacts.github.io/openfoodfacts-server/api/
- FTC COPPA parental-consent rule: https://www.ftc.gov/system/files/ftc_gov/pdf/coppa_sbp_1.16_0.pdf
- Apple App Review Guidelines, privacy, kids, health, accounts, and subscriptions: https://developer.apple.com/app-store/review/guidelines/
- Apple account deletion: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple HealthKit privacy guidance: https://developer.apple.com/design/human-interface-guidelines/healthkit
- Google Play health-content policy: https://support.google.com/googleplay/android-developer/answer/16679511
- Google Play target audience and Families requirements: https://support.google.com/googleplay/android-developer/answer/9867159
- Google Play account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Android Health Connect permissions and user controls: https://developer.android.com/health-and-fitness/health-connect/ui/permissions
