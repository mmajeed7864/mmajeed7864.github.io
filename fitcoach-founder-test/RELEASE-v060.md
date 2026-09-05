# FitCoach 0.6.0 — a visual redesign, with the product preserved

### 0.6.1 release verification patch

Postdeployment checking found exercise detail still inherited dark legacy colors and layout ordering. The follow-up restores theme-aware text and surfaces, places navigation and media before supporting instructions, and makes preference controls legible. The short coach composer prompt no longer wraps into its one-row input. Web build and cache generation are now `0.6.1` / `0601` so an installed 0.6.0 shell receives the corrected assets. No stored data or motion playback behavior changes.

The follow-up passes 339 web tests and the complete bundle check. Separately, coach server renderer `2026-09-04.1` was deployed after 82 server tests, build/lint checks, and full/production dependency audits with zero vulnerabilities. A live synthetic question returned the new renderer through DeepSeek without fallback, and ElevenLabs returned HTTP 200 with MPEG audio. This verifies the provider path, not a physical-device microphone or headphone session.

## Release scope

This is a web UI release, not a replacement app or a claim of native store readiness. Existing local storage keys, saved sessions, routines, nutrition entries, approvals, progress photos, and settings retain their existing contracts. No database migration, provider activation, store submission, or payment configuration is part of this release.

The design uses consistent blue, ink, and white surfaces, with an equivalent dark theme. It replaces oversized nested panels and dense explanatory copy with a clear visual hierarchy, compact summaries, and optional detail. Navigation stays consistent across Today, Train, Coach, Food, Progress, and Profile.

### What changed

- Today: an original AI-created workout cover, real next/resume/completed-session actions, a weekly activity strip, food and protein summaries, water logging with undo, personalized coach recommendations, energy check-in, and exercise previews. The two responsive cover images total less than 40 KB.
- Train: a visual session preview, quieter quick adjustments, clearer exercise cards and search, separated muscle/equipment filters, and a more legible set logbook. Existing gym/home movements, routines, schedule, favorite/recent exercises, swaps, notes, units, rest timers, anatomy maps, and reviewed motion guides remain available.
- Coach: a concise voice-room entry, retained text conversation and replay, contextual current-workout shortcuts, truthful connection diagnostics, and expandable preferences. Existing voices, tones, response-depth modes, automatic spoken replies, interruption logic, trainer navigation tools, and approval rules are retained.
- Food: a clearer diary, manual search/barcode entry, recent/favorite reuse, explicit portion review, and visible source attribution. The existing camera/text preview is retained behind an honest disclosure; it is not presented as real food recognition.
- Progress: actual-session charts, a four-week calendar and expandable adherence summary, earned milestones, best logged lifts, muscle workload, history, nutrition patterns, and private progress photos. Invalid or incomplete sets do not inflate training volume; dates use local calendar semantics.
- Profile: compact settings sections and discoverable account, membership, privacy, health, export, and deletion controls. Setup-required and failed-closed states remain truthful.
- Global: a quick-action sheet, consistent controls and spacing, keyboard-operable custom choices, short route transitions that do not restart on input edits, reduced-motion support, and mobile input sizes that avoid focus zoom. The active session shows actual set progress, not a decorative readiness score.

### Functional corrections

- A late account/platform response no longer replaces the screen while a person is tapping a choice, entering food, or watching an exercise guide. Stale initialization responses are ignored at every asynchronous boundary.
- Opening the exercise library clears a previous exercise-detail/replacement context.
- Resuming a workout or opening voice from quick actions closes the action sheet first.
- Food actions from Today explicitly target today, even after browsing an older diary day.
- Legacy no-equipment movements are included in bodyweight discovery.
- First-day and new-week summaries do not frame an empty workout history as a missed commitment.
- The minimized workout control and notices have explicit light/dark contrast.
- Platform requests declare the current build using the shared version constant.
- Explicit commands such as “open my workout,” “show my food diary,” and “I only have 20 minutes” work on-device without waiting for an AI response. They open existing tools or a pending proposal; they never approve a plan or confirm a meal. Questions and ambiguous or sensitive instructions remain on the existing checked trainer path.
- “This/current exercise” resolves to a known catalogue movement in the active workout. That name, not private workout notes, is used to clarify the existing request. The original text stays visible in chat.
- Local command messages cannot become provider conversation history or falsely mark the coach as connected. They are labelled as on-device tools. Replies use the selected trainer name rather than always saying Nova.
- The voice dock and workout-resume strip have separate space when both are active. The expanded voice room keeps its controls reachable while long captions and consent details scroll.

## Feature-parity audit

Compared with the preceding main release, no existing app action handler was removed. Trainer actions, chat and speech clients, voice-room controller, and youth policies retain their privacy and approval boundaries. Personalized Home decision actions and connection diagnostics were explicitly restored during the parity pass. Moving an advanced control into a disclosure does not disable it.

The active catalogue still contains 100 movements and the same reviewed media. The defective Hollow Body Hold clip stays quarantined, with its poster fallback; this release does not claim to have regenerated that clip. Videos stream directly instead of entering the install cache. The bounded exercise-image cache and compact anatomy precache remain intact.

Water logging is the only new persisted data category. It is local-only, included in device export/deletion, deliberately excluded from cloud sync, capped and validated, and not framed as a prescribed intake goal.

## Design research and rationale

The goal is faster everyday use, not copying another brand or accumulating settings. The following primary product references informed the direction:

- [MyFitnessPal's premium features](https://support.myfitnesspal.com/hc/en-us/articles/360032625951-MyFitnessPal-Premium-features): make food entry and macro awareness easy to reach; keep source verification distinct from a premium-looking interface.
- [MacroFactor's food logging](https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor) and [copy/paste workflows](https://help.macrofactorapp.com/en/articles/95-copy-and-paste): reduce repeated food-entry work while keeping portions editable.
- [Hevy's features](https://www.hevyapp.com/features/) and [Strong's rest timer](https://help.strongapp.io/article/231-rest-timer): prioritize dependable workout logging, history, and session continuity over decorative dashboards.
- [MacroFactor's workout logging](https://help.macrofactorapp.com/en/articles/310-how-to-log-a-workout): make rest, current exercise, and the ability to minimize/resume a session work together. FitCoach additionally keeps its voice controls available while navigating the app.
- [MyFitnessPal's Nutrition Coach](https://support.myfitnesspal.com/hc/en-us/articles/45212266254221-Introducing-Nutrition-Coach-Your-Nutrition-Assistant): distinguish conversational guidance from actual logging permissions. FitCoach's commands open the relevant tools; user confirmation remains required for data-changing actions.
- [Fitbod's workout editing](https://help.fitbod.me/hc/en-us/articles/360006335593-Editing-Workouts-in-Fitbod): make equipment/time adjustments understandable without silently replacing a person's plan.
- [Cronometer's data sources](https://support.cronometer.com/hc/en-us/articles/360018239472-Data-Sources): retain provenance and do not imply that community-contributed nutrition records are verified laboratory data.

FitCoach's intended differentiator is a continuous workout, food, and coaching experience: the coach remains reachable around an active session, navigation does not lose the session, and progress reflects completed work. Whether users prefer this to established apps requires real comparative usability testing; this release does not assert that as a proven result.

## Verification performed locally

- 338 web tests passed, including feature parity, trainer/privacy contracts, actual text/voice command handlers, current-exercise context, local history isolation, actual decision handlers, hydration, keyboard behavior, progress calculations, and delayed platform initialization.
- Bundle integrity and all active module syntax checks passed. The shell, stylesheet links, manifest, service worker, and version constants agree on `0600`.
- 10 native contract tests passed; native source readiness remains 12/12. These are source checks, not physical-device validation.
- Production native dependency audit reported zero vulnerabilities.
- 24 route/width combinations at 320, 390, 430, and 1280 CSS pixels: no horizontal overflow, no page errors, and no visible text inputs smaller than 16 pixels. Six routes were also visually checked in dark mode at 390 pixels.
- Chromium and WebKit mobile-browser journeys passed: age gate, consent, body focus selection, water persistence/undo, correctly dated food logging, on-device coach commands with zero AI requests, proposal approval boundary, exercise discovery, actual advancing video playback with pause/resume, valid-set logging, navigation/reload with a rest timer, voice consent/docking without overlap, quick resume, a single completion receipt, and earned progress.
- Five expanded voice-room phases with long captions were checked in both themes at 320×568: no horizontal overflow and header/footer controls remained within the viewport. This verifies layout, not microphone or headphone behavior.
- Local-browser platform configuration and premium speech were deliberately simulated as unavailable because localhost is not an approved production API origin. Production endpoints were checked separately. The configuration endpoint returned HTTP 200 for the allowed Pages origin and build `0.6.0`, with remote setup-dependent capabilities still disabled. A synthetic live trainer question returned a real provider reply with no fallback. These checks are not authenticated sync, physical microphone, or purchase tests.
- `git diff --check` passed. Browser screenshots and detailed journey evidence were retained outside the shipped bundle.

## Remaining release boundaries

The existing optional account/sync, account export/deletion, subscriptions, and verified USDA provider are not enabled by the deployed server configuration. Open Food Facts remains identified as community data. HealthKit, Health Connect, native audio routing/interruption, signed packages, and store purchase flows still need their real-device, provider, and store-sandbox gates. The external native readiness checklist remains 0/30; a passing web release must not be described as an App Store or Play Store launch.

The current release remains adult-gated. Youth availability, real public social posting, and broader personal-health-data processing must not be enabled simply to make a settings screen look complete. The original privacy and approval protections remain in effect.

## Next evaluation

Test the redesigned flows on real iPhones and Android phones with the owners before widening access: resume a session after interruptions, talk with the coach through headphones, log a meal with portion corrections, discover an exercise, and interpret the progress screen. Measure completion time, errors, and confusion. Activate each remote/native capability only after its existing security and release gates are evidenced.
