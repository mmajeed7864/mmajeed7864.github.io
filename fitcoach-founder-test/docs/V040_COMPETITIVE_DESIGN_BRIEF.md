# FitCoach v0.4 competitive design brief

Status: implementation direction for the private founder PWA
Research checked: 2026-08-20
Release target: FitCoach v0.4.0 / cache generation `v=0401`

## Executive direction

FitCoach should combine three strengths without becoming a clone:

1. the fast, editable workout hierarchy and evidence-based progress surfaces associated with Fitbod;
2. the approachable exercise education and broad visual library promoted by Fitness Online; and
3. FitCoach's own persistent-trainer relationship, where the app remembers completed work, adapts to the user's real constraint, explains its reasoning, and never changes a plan without approval.

The v0.4 design target is **Bright Performance**: a crisp, light-first mobile product with deep teal information surfaces, blue primary actions, legible gym-floor controls, and a fully considered dark mode. Competitor research informs interaction priorities only. FitCoach must not copy competitor source, names, logos, screenshots, illustrations, exercise media, wording, layouts, or exact trade dress.

## What the official sources establish

### Fitbod

Fitbod's current official App Store listing promotes personalized workouts based on goals, fitness level, and equipment; single-session modifiers; saved or custom routines; more than 1,000 searchable exercises; multi-angle exercise video; workout history; and integrations with Apple Health, Strava, Fitbit, and Apple Watch. Its current help material makes workout editing concrete: add, replace, delete, and reorder exercises before a workout; edit sets during a workout; filter by muscle or equipment; and inspect or edit logged work later.

Its help center also documents:

- duration and equipment as useful day-of-session modifiers;
- explicit recommend-more, recommend-less, and exclude preferences;
- rest timing after a set, with adjustment controls;
- metrics derived from logs, including volume, records, duration, and exercise history;
- a workout refresh behavior that may replace pre-workout edits when recommendation inputs change, while started workouts remain fixed.

Design lesson: the session must be the main object, with a prominent start action, scannable exercise rows, fast local edits, set-level logging, and progress that traces back to recorded data.

FitCoach opportunity: protect user intent more explicitly. A time, equipment, energy, or exercise change should produce a visible proposal or scoped diff. It should never silently destroy the user's edited session, and a started workout should remain stable.

### Fitness Online

Fitness Online's current official App Store listing promotes goal-based workout plans, a workout diary, an exercise encyclopedia, more than 850 exercises with 3D demonstrations, diet tracking, community features, and direct contact with human coaches. Its official product site similarly emphasizes workout plans, a results diary, an encyclopedia, exercise animation, analytics, trainer messaging, diet, and community.

Design lesson: visual movement education materially lowers the intimidation cost of an unfamiliar exercise. Exercise cards and detail pages should explain what the movement trains, how to set up, how to perform it, and what to do when the preferred equipment is unavailable.

FitCoach opportunity: deliver this educational clarity without the distracting breadth. Community feeds, trainer marketplaces, extensive diet databases, sports-nutrition commerce, and pharmacology content are not part of the private v0.4 founder scope.

## Patterns to borrow, expression to avoid

| Product pattern worth learning from | FitCoach interpretation | Must not be copied |
| --- | --- | --- |
| A workout is visible before it begins | One clear session card, duration, focus, equipment, muscle groups, exercise count, preview, and primary Start action | Screen composition, branded color systems, labels, icons, or animation from a competitor |
| Fast session modification | Time, location/equipment, lower-volume, and one-exercise substitutions generate a scoped preview and deterministic diff | A competitor's exact swap menus, grouping, gestures, or wording |
| Exercise media inside the workout | Original local static two-position guides, meaningful alt/fallback copy, and a dedicated detail route | Competitor videos, screenshots, anatomy drawings, fake playback controls, or hotlinked assets |
| Search and preference controls | Search aliases; filter by muscle, equipment, location, pattern, and difficulty; favorite/prefer/reduce/exclude | Competitor exercise taxonomy copied verbatim where it is proprietary |
| Workout logging optimized for lifting | One-handed set rows, 44px targets, previous verified performance, rest timer, notes, minimize/resume | Exact table styling or interaction trade dress |
| Recovery or muscle context | Explain a conservative, transparent muscle-load summary based on logged sessions | Unsupported readiness or recovery percentages presented as physiological truth |
| Progress reports | Adherence, calendar, volume, records, and defensible comparisons computed from local logs | Decorative charts, invented strength scores, or unlabeled demo results |
| Human coaching relationship | Nova remains available before, during, and after a session; tone and voice presentation are selectable | Competitor coach personas, scripts, avatars, voices, or marketing claims |

## Original FitCoach design principles

### 1. The relationship persists across the workout lifecycle

Today answers “what matters now,” Train makes the plan inspectable and editable, the active workout makes logging effortless, Coach explains or challenges the next decision, and Progress closes the loop with verified results. A persistent mini-player lets the user move among those contexts without losing the active exercise, set state, timer, or practical place in the session.

### 2. Adaptation is collaborative, not judgmental

Low energy, limited time, missed days, or unavailable equipment are constraints to solve. They are not character judgments. Keep the useful Full, Reduced, and 12-minute choices, but label what each option preserves and gives up.

### 3. The user approves every meaningful plan change

The deterministic domain layer calculates a proposed plan and structured diff. The UI shows the reason, affected exercises or volume, and Approve / Keep current plan controls. The model may render display copy only; it cannot select an action, mutate a plan, write memory, or approve its own proposal.

### 4. Recommendations remain explainable

“Why this workout?” should name the relevant recorded facts and product rule in plain language without exposing hidden chain-of-thought. When evidence is missing, the app says so and asks for a check-in rather than inventing readiness.

### 5. The app is useful when AI, speech, media, or the network is unavailable

Workout planning, logging, exercise text instructions, migration, plan approval, timer recovery, and progress calculations are deterministic and local. Missing optional media shows a useful fallback. Typed Coach responses remain independent of text-to-speech. Provider or speech failure cannot block the workout.

### 6. Verified data outranks motivational theater

No fake streaks, records, calories, volume, recovery, or progress. Neutral empty states should make the next useful action obvious. Competitive tone means competing against the user's own verified baseline, never humiliation.

### 7. Privacy and health boundaries are product features

The founder build is not production authentication. It must discourage sensitive medical, medication, identity, and credential input; keep keys server-side; preserve provider-zero-call interception; avoid raw-audio upload; and never imply injury diagnosis, rehabilitation, form verification, or emergency care.

## v0.4 feature priorities

### P0 — release-defining

- A clean isolated `v040/` module boundary; no new giant override layer.
- Light, Dark, and System theme support, with Light as the new-profile default, persisted selection, first-paint initialization, runtime theme-color updates, reduced-motion support, and WCAG AA target contrast.
- Exactly five primary routes: Today, Train, Coach, Progress, and Profile. Train contains My Workout and Exercises.
- A credible Today command center built from real state: readiness/check-in, next session, weekly schedule and adherence, context controls, explanation, and Start.
- A maintainable, machine-validated exercise and media schema with roughly 12–20 starter exercises and safe local visual assets.
- Exercise search/filter, detail, preferences, add, remove, swap, and reorder.
- Visible proposal/preview/approval for meaningful plan changes.
- Persistent active-workout state, compact mini-player, one-handed set logging, refresh recovery, timestamp-based rest timing, and duplicate-safe completion.
- Progress computed only from stored sessions, with honest empty states and metric explanations.
- Versioned, idempotent v0.3.6 migration that preserves a raw backup and does not delete the old payload.
- Existing Coach safety, provider, privacy, deterministic-action, typed-response, and speech boundaries preserved.
- PWA shell and starter media offline; optional/larger media lazy-loaded; manifest and service-worker graph synchronized.

### P1 — high-value follow-through

- Saved routines and scoped regeneration of only an affected exercise or portion.
- Warm-up/cooldown configuration and explicit warm-up set styling.
- Previous comparable performance, optional RPE/RIR, notes, and a defensible completion comparison.
- Favorites and prefer-more / prefer-less / exclude exercise controls.
- Exercise-level history and simple muscle-load balance based on documented calculations.
- Original front/side static two-position guides where they materially improve setup comprehension.
- Contextual Nova entry points from Today, exercise detail, active workout, and completion.
- Foreground voice-room presentation with permission disclosure, persistent transcript, visible listening/thinking/speaking states, manual interruption, replay, stop, and mute.

### P2 — validate after founder use

- More media angles or compressed video after exercise-content review and a measured size budget.
- More sophisticated progression and estimated-strength metrics after calculation review and sufficient real logs.
- Additional exercise substitutions, program templates, comparison periods, and data export/import recovery.
- PWA notification or haptic-style timer cues only where browser support and permission behavior are tested.
- Optional, local/private body measurements with explicit opt-in and no provider payload inclusion.

## Deliberately deferred or excluded

- Public users, production authentication claims, billing, subscriptions, advertisements, trainer marketplace, or community feed.
- Medication reminders, pharmacology, supplement prescriptions, medical-condition programming, injury diagnosis, rehabilitation, or public health claims.
- Meal barcode database, calorie database, or a MyFitnessPal-scale nutrition catalog. v0.4 may support modest, non-medical habit prompts, but not a nutrition-platform expansion.
- Computer-vision form scoring or claims of reliable form correction without validated vision evidence.
- Wearables, Apple Health, HealthKit, Strava, Fitbit, Apple Watch, background audio, push notifications, or real-iPhone claims until each integration is intentionally built and tested.
- Full-duplex neural voice, live barge-in, cloned voices, cloud speech streaming, or raw-audio retention.
- Hundreds of exercise videos in the initial shell.

## Voice experience: honest premium direction

The v0.4 browser implementation may feel focused and polished, but its technical contract is **persistent foreground half-duplex**, not a ChatGPT- or Grok-equivalent full-duplex audio service.

- Speech-to-text uses the browser/device recognition facility when available; device or browser speech services may process microphone audio.
- FitCoach does not record, persist, or upload raw microphone audio.
- A finalized transcript is sent through the same bounded text Coach path and remains in the same conversation after the voice room closes.
- Text is committed and visible independently of speech playback.
- Speech output uses device text-to-speech. Voice availability and quality vary by device.
- Listening pauses while the trainer speaks. Manual interruption can stop speech and return to listening, but simultaneous listening/speaking and reliable semantic barge-in are not promised.
- The voice room is foreground-only. Background, lock-screen, and uninterrupted long-session behavior are not promised.
- If recognition, speech, or the provider fails, the UI exposes a retry or text path without changing the workout.
- A safety interception stops the conversational loop and preserves the deterministic safety response; it does not resume automatically.

## Licensing and provenance rules

Every exercise media record must resolve to a local file and a machine-validated license record. For each asset, store at least:

- stable asset identifier and local path;
- exercise identifier, media type, view, dimensions, and offline-cache policy;
- creator/rightsholder;
- provenance URL or a clear project-original statement;
- exact license identifier or rights statement;
- whether attribution is required and the exact attribution text;
- verification date and, for downloaded third-party files, a checksum;
- whether the asset is a temporary original placeholder.

Project-created diagrams should be labeled accurately, for example “FitCoach project original; temporary founder-build asset; all rights reserved.” Do not invent a Creative Commons or public-domain dedication. A later license change requires the rightsholder's explicit decision.

Third-party media is allowed only after verifying a commercial-compatible license for the exact asset. A generic site-wide claim is insufficient. Preserve evidence beside the manifest. Do not use search-result thumbnails, competitor media, scraped animations, hotlinks, or “fair use” as a production asset strategy. If provenance is uncertain, use an original neutral local diagram instead.

## Success criteria

The redesign is successful when a founder can, at target phone widths and in both themes:

1. understand today's recommendation and its evidence;
2. adjust a real constraint and approve a scoped plan diff;
3. find and understand an exercise without relying on network media;
4. start, minimize, navigate away from, restore, refresh, and finish a workout without losing completed sets or timer state;
5. see progress derived only from completed logs;
6. use Coach by text when speech or the model is unavailable; and
7. identify the private founder-build, privacy, and safety boundaries without reading hidden documentation.

## Official sources

- Apple App Store, [Fitbod: Gym & Fitness Planner](https://apps.apple.com/us/app/fitbod-gym-fitness-planner/id1041517543) — current product listing and developer claims.
- Fitbod Help Center, [Editing Workouts in Fitbod](https://help.fitbod.me/hc/en-us/articles/360006335593-Editing-Workouts-in-Fitbod) — add, replace, delete, reorder, filter, and workout-stage editing behavior.
- Fitbod Help Center, [Customizing Today's Workout](https://help.fitbod.me/hc/en-us/articles/38318585683991-Customizing-Today-s-Workout) — day-of-session duration and equipment modifications.
- Fitbod Help Center, [Recommend More, Less, or Exclude Exercises](https://help.fitbod.me/hc/en-us/articles/9093233634711-Recommend-More-Less-or-Exclude-Exercises) — preference model.
- Fitbod Help Center, [Rest Timer](https://help.fitbod.me/hc/en-us/articles/360006340194-Rest-Timer) — timer start, adjustment, and foreground/background distinctions.
- Fitbod Help Center, [Fitbod Metrics & Records](https://help.fitbod.me/hc/en-us/articles/12732749777047-Fitbod-Metrics-Records) — logged-data metrics and exercise history.
- Fitbod Help Center, [Understanding Fitbod & How It Works](https://help.fitbod.me/hc/en-us/sections/360001078993-Understanding-Fitbod-How-It-Works) — workout recommendation inputs and refresh behavior.
- Apple App Store, [Fitness App: Gym Workout Plan](https://apps.apple.com/us/app/fitness-app-gym-workout-plan/id1114387800) — current Fitness Online listing and developer claims.
- Fitness Online, [official product site](https://www.fitnessonline.app/en/) — plans, diary, exercise animation, analytics, coaching, diet, and community positioning.

Source notes: research used official developer sites, official help material, and Apple-hosted developer listings. Marketing and App Store privacy statements are treated as claims by the respective developers, not as independently audited proof. No competitor assets were downloaded or reused.
