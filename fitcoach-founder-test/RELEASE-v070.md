# FitCoach 0.7.0 — Athletic editorial

## Design

A new composition system, not another card-skin update: cobalt and paper/ink, self-hosted Barlow Condensed and Manrope, a flat attached navigation bar, ruled sections, restrained corners and original editorial imagery. Dark mode uses the same architecture and consistent ink-blue surfaces.

- Today: dynamic actual-state masthead, edge-to-edge photography, immediate workout controls, local-day training rhythm, food/water ledger, personalized coach recommendations, interactive energy check-in, and exercise contact sheet.
- Train: session edition and real set counts, swipeable movement filmstrip, numbered logbook, weekly agenda, full exercise archive, and media-first detail pages.
- Food: directly accessible search/barcode, confirmed-energy ledger, macro bars, date-aware meal journal, existing regulars and review flows.
- Progress: real training journal, earned statistics and calendar, valid-set/lift history, private photo notes and local community drafts. First-day state remains neutral.
- Coach: personal console, continuous conversation, compact preferences and an expressive voice room. Ring motion reflects real controller phases; no fake listening levels.
- Profile and onboarding retain all controls and safety gates while adopting the new typography and shared surface system.

Existing provider, voice, account, sync and data-projection clients are unchanged. All rendered data-action sets on the five main routes are preserved. Local date-only receipts now agree with the calendar and cannot be counted before their timestamp.

## Verification before publication

- 372 web tests pass; full module/PWA bundle integrity passes.
- 60 route/theme/viewport combinations pass: six routes, light/dark, widths 320, 390, 430, 1440 and 1920. No document overflow; all bottom navigation targets remain at least 44px. Start workout is above the dock at 390×844. Food entry controls are above the dock at 320×568 and 390×844.
- Chromium and WebKit functional journeys pass: age/consent boundaries, muscle selection, hydration persist/undo, custom food entry and local-day navigation, on-device coach commands without remote requests, proposal approval boundaries, search/discovery, actual MP4 advance/pause/resume, set logging, rest persistence, voice consent, separate voice/workout docks, workout completion and earned progress.
- Reduced-motion selection remains functional. Service-worker font delivery and an offline reload retain the redesigned interface and saved energy state. Test-local certificate handling was configured only in the isolated browser runner, not the application.
- Original cover artwork is 86,582 bytes across two responsive WebP variants. Self-hosted fonts total 275,332 bytes with original OFL licenses included. No external font hosts or heavy graphics runtime.
- Native source contracts: 10/10 tests; code gates 12/12. External/native device and store gates remain 0/30. This web redesign does not claim native compile, store readiness, real microphone, AirPods, Bluetooth or interruption validation.

Local functional testing intentionally models the production-only platform/speech endpoints as unavailable from localhost. Live provider verification is separate. Unconfigured accounts/sync/purchases/nutrition provider services remain truthful and disabled; no new public-user, billing or health permissions were activated.

The 100-exercise catalogue and existing reviewed motion media remain available. Previously quarantined media remains quarantined. Real-device technique/content review is not replaced by browser playback tests.

Browser evidence and logs: `/Users/mohammed/Developer/fitcoach-v070-evidence`. Publication and post-deployment results are recorded there after the hosting pipeline finishes.
