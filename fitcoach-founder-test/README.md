# FitCoach founder build — runtime map

This directory contains several historical prototypes. **`index.html` and `sw.js` are the authoritative runtime manifests.** Do not choose an implementation merely because a similarly named function appears first in search results.

## Active browser runtime

The current founder build loads these JavaScript files, in order:

1. `v031-part-01.js`
2. `v031-part-02.js`
3. `v031-part-03.js`
4. `v031-part-04.js`
5. `v031-part-05.js`
6. `v031-part-07.js`
7. `v031-part-08.js`
8. `v031-part-10.js` (progress helpers only; legacy audio upload removed)
9. `v031-part-11.js`
10. `v031-part-12.js`
11. `v031-part-13.js`
12. `v033-global-contract.js`
13. `v033-pages.js`
14. `v035-trainer-chat-voice.js` (v0.3.6 runtime)

The active visual bundle is the five `v031-style-*.css` files plus `v033-pages.css`.

## Intentional override boundary

`v033-pages.js` replaces the legacy implementations of:

- `renderToday`
- `renderTrain`
- `startWorkout`
- `renderProgress`
- `renderProfile`
- `render`
- `navigate`

`v035-trainer-chat-voice.js` then replaces the legacy chat and voice adapters. It sends only
the strict synthetic/low-sensitivity v3 request contract, never accepts model-authored memory or
plan mutations, uses browser dictation without uploading raw audio, and changes spoken prosody
without changing deterministic actions or safety behavior.

`v033-global-contract.js` declares those global bindings before the override script loads. This prevents the current page layer from depending on sloppy-mode implicit globals.

## Historical / unreferenced prototypes

The following are not loaded by the current `index.html` and must not be treated as the active implementation without an explicit migration plan:

- `app.js`
- `v03-01-core.js`
- `v03-02-workouts.js`
- `v032-ai-voice.js`
- `js/*.js`
- `styles.css`
- `css/*.css`
- legacy root/icon variants not named by the current manifest

They remain only as historical prototypes until the planned frontend consolidation. Git history is the source for retired code; do not reconnect these files to production casually.

## Required check

Run before merging any FitCoach browser change:

```bash
node fitcoach-founder-test/tests/check-bundle.js
```

The check scans every JavaScript artifact for parse/corruption errors, validates the active script list against the PWA precache, and verifies the strict-safe override contract.

The same check runs in GitHub Actions for FitCoach pull requests and pushes to `main`.
