# FitCoach preview runtime map

This directory contains historical prototypes plus the current v0.6 preview runtime, retained under the `v040/` source directory for compatibility. `index.html` and `sw.js` are the authoritative runtime manifests.

## Active browser runtime

FitCoach v0.6.1 is the active web runtime. Cache generation 0601 introduces a mobile-first visual redesign of Today, Train, Coach, Food, Progress, and Profile, a shared quick-action sheet, private local water logging, keyboard-accessible custom choices, and safer background account initialization. The AI trainer and voice room, workout logging and rest timers, nutrition confirmation and source attribution, progress photos, routines, plan approvals, and existing account/native capability adapters are retained. Every remote capability still fails closed when its reviewed server or store configuration is absent. See `RELEASE-v060.md` for scope, verification, and release boundaries.

- document shell: `index.html?v=0601`
- stylesheets: legacy base styles plus `v040/design-system-v060.css` and route-scoped `ui/*-v060.css`, all referenced with `?v=0601`
- ES-module entry: `v040/app.js?v=0601`
- service worker caches: `fitcoach-symbio-v0601` for the shell/anatomy graph and `fitcoach-exercise-images-v0601` for a bounded runtime image set
- install cache: shell, module graph, six active anatomy maps, and two compact original brand images; exercise images cache after first use with a 12-image limit, while motion video streams directly
- local storage envelope: `fitcoach-v040:<profile>` (currently keeps the legacy local profile key for migration compatibility)

The v0.4 runtime is an ES-module app under `v040/` with these boundaries:

- `core/`: constants, storage, migration, unit helpers, stable utility functions
- `data/`: 100-movement exercise library, local premium visual-guide manifest, written-guide contracts, and schema validators
- `domain/`: deterministic workout planning, intervention decisions, and the nutrition diary (confirmed-only totals; the photo/text estimator is an honestly-labeled deterministic preview demo; no vision provider exists in this build)
- `policy/`: fail-closed nutrition provenance, youth-safety capability, and store-release disclosure contracts
- `services/`: bounded trainer text/spoken-reply payloads plus optional account and native capability adapters
- `ui/`: five-tab browser UI (Today, Train, Coach, Food, Progress), header-accessible profile, modals, exercise detail, active workout, and progress
- `voice/`: foreground half-duplex voice-room state and controller; native builds may supply interruption-aware speech recognition and Bluetooth routing without background microphone capture

## Historical prototypes

The v0.3 files remain for rollback/reference only and must not be treated as active without a deliberate migration:

- `v031-part-*.js`
- `v031-style-*.css`
- `v032-ai-voice.js`
- `v033-*`
- `v034-*`
- `v035-trainer-chat-voice.js`
- root `app.js`, `styles.css`, `js/*.js`, and `css/*.css`

The v0.4 service worker must not precache historical scripts, historical styles, or the 200+ MB exercise-media catalogue in one install transaction.

## Provider boundary

The browser sends only the trainer message the user submits plus a bounded workout-context allow-list to `/api/fitcoach-chat-v3` through Symbio's server. It does not label real user text as synthetic. DeepSeek remains the primary server-side provider, direct Qwen US may be used only as a server-configured backup, and deterministic local fallback remains available.

Nutrition data never enters the provider payload: the chat-v3 contract has no nutrition fields and this build adds none. Coach nutrition help is local-only (deterministic action cards that open the diary or create UNCONFIRMED drafts). Meal photos are never read, uploaded, or stored — a draft keeps only file name/size metadata and a session-scoped preview object URL that is revoked on close.

Food search and barcode lookup use the production chat-v3 nutrition route. Open Food Facts results are identified as community-contributed, keep source and license attribution, and count only after portion review and an explicit Add action. USDA FoodData Central support is implemented server-side but remains unavailable until its server-only API key is configured; the UI must not describe community records as USDA-verified data.

When spoken replies are enabled, the browser may send only the bounded coach reply text to `/api/fitcoach-speech-v2`. That server-only route uses ElevenLabs when configured, offers Nova (female) and Atlas (male) delivery profiles, and falls back to device speech. FitCoach does not create, store, or upload microphone audio.

The model may render conversational wording only. It cannot choose safety outcomes, apply plans, write memory, activate actions, or access raw workout logs, identifiers, measurements, medication details, or raw audio.

## Exercise library and media

The active library has 100 filterable movements and prioritizes gym-specific barbell, cable, machine, and free-weight options when a user selects a full gym. All 100 movements have local original visual media: 59 reviewed, muted motion guides (including 47 hard-gym movements), 17 retained two-position guides, and 100 photoreal gym posters in the navy/electric-blue art direction with realistic athletes—never stick figures. Catalogue surfaces use 100 deterministic 480 px WebP thumbnails (1.7 MiB total versus 185.3 MiB of source PNGs); full-resolution sources remain reserved for technique detail. Hollow Body Hold currently uses its premium poster while a defective generated clip remains quarantined for replacement and review. A movement may intentionally have more than one local asset (poster, motion loop, or retained two-position fallback). The local guides are demonstrations, not live form analysis, medical assessment, or competitor media.

## Required checks

Run before opening or updating a FitCoach PR:

```bash
node --test fitcoach-founder-test/tests/*.test.mjs
node fitcoach-founder-test/tests/check-bundle.js
node --check fitcoach-founder-test/v040/app.js
find fitcoach-founder-test/v040 -name '*.mjs' -print0 | xargs -0 -n1 node --check
git diff --check
```

The same checks run in GitHub Actions for FitCoach pull requests and pushes to `main`.
