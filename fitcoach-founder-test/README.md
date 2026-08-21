# FitCoach founder build runtime map

This directory contains historical prototypes plus the current v0.4 founder runtime. `index.html` and `sw.js` are the authoritative runtime manifests.

## Active browser runtime

FitCoach v0.4.0 is the active runtime (cache generation 0407 refreshes the one-question onboarding flow):

- document shell: `index.html?v=0407`
- stylesheet: `v040/styles.css?v=0407`
- ES-module entry: `v040/app.js?v=0407`
- service worker cache: `fitcoach-symbio-v0407`
- local storage envelope: `fitcoach-v040:<founder>`

The v0.4 runtime is an ES-module app under `v040/` with these boundaries:

- `core/`: constants, storage, migration, unit helpers, stable utility functions
- `data/`: exercise library, local premium two-position guide manifest, schema validators
- `domain/`: deterministic workout planning, intervention decisions, and the nutrition diary (confirmed-only totals; the photo/text estimator is an honestly-labeled deterministic founder demo — no vision provider exists in this build)
- `services/`: bounded trainer text and spoken-reply API payload mapping
- `ui/`: five-tab browser UI plus the Nutrition route (reached from Today/Progress cards, not a sixth tab), modals, exercise detail, active workout, progress, profile
- `voice/`: foreground half-duplex voice-room state and controller

## Historical prototypes

The v0.3 files remain for rollback/reference only and must not be treated as active without a deliberate migration:

- `v031-part-*.js`
- `v031-style-*.css`
- `v032-ai-voice.js`
- `v033-*`
- `v034-*`
- `v035-trainer-chat-voice.js`
- root `app.js`, `styles.css`, `js/*.js`, and `css/*.css`

The v0.4 service worker must not precache those historical scripts or styles.

## Provider boundary

The browser sends ordinary low-sensitivity trainer text only to `/api/fitcoach-chat-v3` through Symbio's server. DeepSeek remains the primary server-side provider, direct Qwen US may be used only as a server-configured backup, and deterministic local fallback remains available.

Nutrition data never enters the provider payload: the chat-v3 contract has no nutrition fields and this build adds none. Coach nutrition help is local-only (deterministic action cards that open the diary or create UNCONFIRMED drafts). Meal photos are never read, uploaded, or stored — a draft keeps only file name/size metadata and a session-scoped preview object URL that is revoked on close.

When spoken replies are enabled, the browser may send only the bounded coach reply text to `/api/fitcoach-speech-v2`. That server-only route uses ElevenLabs when configured, offers Nova (female) and Atlas (male) delivery profiles, and falls back to device speech. FitCoach does not create, store, or upload microphone audio.

The model may render conversational wording only. It cannot choose safety outcomes, apply plans, write memory, activate actions, or access raw workout logs, identifiers, measurements, medication details, or raw audio.

## Exercise media

The current exercise visuals are sixteen local, original, static premium PNG two-position guides. They show start and finish positions with illustrated human athletes—never stick figures. They are not animations, videos, form analysis, medical assessment, or competitor media.

## Required checks

Run before opening or updating a FitCoach PR:

```bash
node --test fitcoach-founder-test/tests/v040-*.test.mjs
node fitcoach-founder-test/tests/check-bundle.js
node --check fitcoach-founder-test/v040/app.js
find fitcoach-founder-test/v040 -name '*.mjs' -print0 | xargs -0 -n1 node --check
git diff --check
```

The same checks run in GitHub Actions for FitCoach pull requests and pushes to `main`.
