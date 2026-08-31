# FitCoach v0.5.3 — Competitive Core and Next Release Gates

Research checked against official product/help sources on 2026-08-31. This document separates features that are implemented in the current branch from capabilities that still require native, backend, licensed-content, or product-operations work.

## Product direction

FitCoach should not become ten disconnected apps inside one tab bar. Its strongest position is an evidence-led trainer that connects the workout, food diary, readiness, and progress while leaving consequential changes under the user’s control.

The product loop is:

1. Make the next useful action obvious.
2. Make logging fast enough to use while tired.
3. Turn completed work into trustworthy evidence.
4. Let the coach explain one next adjustment.
5. Require the user to approve any material plan change.

## Competitive benchmark

| Product | Officially documented strength | FitCoach response |
| --- | --- | --- |
| MyFitnessPal | Barcode, meal scan, voice logging, favorites, meal/day macros, weekly digests, exports, multi-device access | Keep confirmed-only totals, surface fast repeat foods, then add verified nutrition data, saved meals/recipes, source provenance, and accounts/sync |
| MacroFactor | Weekly evidence-led check-ins, user-declinable target changes, workout dashboard, records and exercise trends | Weekly proof is now deterministic; next add one explainable review card without automatic target changes |
| Cronometer | Large verified food catalogue, micronutrients, reports, recipe import | Add provider-backed verified foods and micronutrients before claiming nutrition parity |
| Fitbod | Equipment/history/recovery-aware plans, learned progression and gym profiles | Deepen multiple gym profiles, substitution learning, progression calibration, and recovery context |
| Hevy | Very fast set logging, previous values, rest timer, RPE, warm-up/plate calculators, live PRs, routines and social | v0.5.3 adds tested plate/warm-up tools and real PR receipts; supersets and safe squads remain |
| Strong | Low-friction logging, best sets, estimated 1RM, cloud/device support | Preserve one-screen logging and add secure sync/native watch support |
| Nike Training Club | Guided trainer video and progressive programs | Standardize licensed visual direction and build structured programs after core logging reliability |
| Strava | Goals, training log, personal performance, challenges, clubs and safety tools | Add private invite-only challenges before any public feed; avoid public body ranking |
| Freeletics | Context-aware training journeys and equipment/space adaptations | Add crowded-gym, quiet, soreness, and limited-space context as deterministic options |
| Peloton | Deep guided content, live metrics, streaks/PBs, teams and multi-device delivery | Treat content scale, TV/watch and teams as later capital-intensive expansion—not a PWA claim |

Official sources:

- https://support.myfitnesspal.com/hc/en-us/articles/360032625951-MyFitnessPal-Premium-features
- https://help.macrofactorapp.com/en/articles/247-introduction-to-check-ins-and-coaching-modules
- https://help.macrofactorapp.com/en/articles/275-getting-to-know-your-workouts-dashboard
- https://mobile.cronometer.com/gold/
- https://fitbod.me/blog/fitbod-algorithm/
- https://www.hevyapp.com/features/
- https://www.strong.app/
- https://www.nike.com/help/a/ntc-info/app
- https://support.strava.com/en-us/articles/15402044-strava-subscription-features
- https://www.onepeloton.com/app

## Implemented in v0.5.3

### Faster exercise discovery

- The 100-exercise catalogue is paginated to 20 grid cards per page.
- Recently viewed and favorite exercises appear as compact personalized rails.
- Recent history is deterministic, deduplicated, capped, local, and stable across reloads.
- Filtering returns to page one and pagination stays within valid bounds.

### Stronger active-workout tools

- Barbell movements with a positive working load get an optional plate-loading receipt.
- Standard lb/kg inventories, custom configuration support, exact/unavailable states, and nearest-lower disclosure are covered by pure tests.
- An optional warm-up ramp uses only loadable weights below the working set.
- Invalid or zero loads produce no guidance.

### Trustworthy performance receipts

- Weighted completed sets can establish a baseline or beat a prior estimated-1RM record.
- A first log is explicitly a baseline, not a fabricated PR.
- Mixed units are converted before comparison.
- Bodyweight-only, zero-repetition, incomplete, invalid-RPE, or high-repetition false-precision sets cannot create records.
- Completion receipts and weekly evidence show only verified set-backed records.

### Weekly evidence loop

- Progress now consolidates current-week sessions, valid sets, duration, normalized volume, verified PRs, and confirmed food-log days.
- Previous-week comparison appears only when earlier evidence exists.
- Empty and first-week states use honest “nothing is behind” and “baseline” language.
- Draft nutrition and unverified PR flags count zero.

### Faster food reuse

- Favorites and recent foods are visible as a Quick Repeat rail.
- Reuse opens the existing review sheet with a meal slot and portion before the user adds anything.
- The shortcut cannot silently log food and does not weaken confirmed-only totals.

### Quality corrections

- Preferred weekdays now use one persisted 0–6 representation, including Sunday.
- Schedule is included in the valid Train segment list.
- Bottom-navigation labels are larger and use the stronger secondary text token.
- Light and dark phone layouts were checked at 390 × 844 without horizontal overflow or random black surfaces.
- The mobile exercise catalogue uses two visual columns, reducing a 20-card page from roughly 11,000 px to roughly 4,600 px at 390 px wide.
- The service worker installs only the shell, module graph, and six anatomy maps. Viewed exercise images use a separate 12-entry cache capped below a 30 MiB release budget; motion video streams directly for Safari Range reliability.
- Reset removes FitCoach state, legacy/recovery copies, theme, and retired persistent device identifiers while preserving unrelated origin data.
- Version, manifest, service worker, and offline module graph move together to 0.5.3 / 0503.

## Release gates still open

### P0 — production foundation

1. Secure accounts, encrypted database, cross-device sync, recovery, export, and deletion.
2. Instrumented Coach/Voice uptime, latency, fallbacks, and real-device Bluetooth/interruption testing.
3. Verified nutrition provider, real barcode/label coverage, camera recognition, portion units, source/confidence review, and region testing.
4. Native iOS/Android shell with HealthKit, Health Connect, background recovery, notifications, accessibility, and store purchase handling.
5. Subscription backend, receipts, restore purchase, entitlement sync, refunds, and server-side access control.
6. Privacy policy, terms, age gate, parental-consent review, security review, incident response, analytics consent, and support workflow.

### P1 — retention and differentiation

1. One weekly coach proposal with evidence, before/after impact, Approve and Decline.
2. Supersets/circuits, reusable warm-up templates, custom exercises, and more detailed exercise history.
3. Saved meals, recipes, meal-level macros, label scanning, and micronutrient views.
4. Multiple gym profiles, crowded-gym mode, learned substitutions, and equipment availability states.
5. Private invite-only squads and consistency challenges with report/block/moderation controls.
6. Compressed onboarding: core plan inputs first; optional voice/theme/gym details after value is shown.

### P2 — scale investments

1. Licensed, consistently art-directed exercise motion and progressive guided programs.
2. Apple Watch/Wear OS, widgets, TV casting, and richer live activities.
3. Outdoor GPS/routes and safety sharing.
4. Public discovery only after production accounts, moderation, deletion, youth protection, and abuse operations exist.

## Youth-safe rules for the intended 13–50 audience

- Block use below 13 and complete jurisdiction-specific consent review.
- Disable rude/roast coaching for minors; prohibit humiliation, body shaming, unsafe pressure, and protected-class abuse for everyone.
- Do not auto-prescribe aggressive calorie deficits, fasting, “burn off food,” or body-fat rankings to minors.
- Keep profiles/photos private by default; never expose exact location or photo metadata.
- Reward consistency, skill, recovery, and strength—not thinness or public body comparison.
- Make every chart color-independent, scalable, reduced-motion compatible, and understandable without shame-based scoring.

## Validation completed for this branch

- 177 automated tests pass.
- Bundle/module/offline-cache integrity passes.
- 390 × 844 light and dark browser audits pass with zero console/page errors and zero horizontal overflow.
- Exercise grid renders exactly 20 catalogue cards per page.
- Food reuse opens review before add.
- Weekly evidence, barbell loading, and warm-up ramp render from real seeded records.
