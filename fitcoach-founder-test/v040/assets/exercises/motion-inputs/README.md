# FitCoach motion-guide inputs

These files are project-owned synthetic generation inputs for the exercise-motion pilot. They contain no user data and are not loaded by the app.

- `barbell-back-squat-start-v1.jpg` — reviewed first-frame composition, SHA-256 `a323ac1c581ede55acb43bc118445514d84ce6c8f4d92e8d0e2f426d3ce835e8`
- `barbell-back-squat-target-v1.jpg` — reviewed target-frame composition, SHA-256 `287972be11727815ba3a10c5f8ef070cda88a0bbc4ecfda2596f35607809a491`

The resulting motion file must remain silent and local, and must pass human movement, equipment-continuity, anatomy, and visual-quality review before it can be added to the active media manifest.

## Hard-gym motion pilot

The app activates 59 reviewed motion loops. They cover 47 of the 48 intermediate/advanced hard-gym targets; Hollow Body Hold remains poster-only while its rejected clip stays quarantined. The generation queue in `v040/data/motion-generation-queue.mjs` retains that one pending replacement as an auditable template. `scripts/openrouter-motion-pilot.mjs` records the bounded OpenRouter generation workflow; any future returned job remains inactive until it is downloaded, stripped and verified for audio, checksummed, and reviewed for movement, equipment, anatomy, and visual quality before being added to `exercise-media-manifest.mjs`.

The active service worker streams MP4 files directly so iOS range requests do not enter Cache Storage. Motion playback therefore requires a network connection; the exercise poster, anatomy map, setup, execution, and cues remain the offline fallback.

The active PWA never sends provider video requests and never loads pending jobs. This keeps an incomplete or unreviewed generation run from changing workout guidance.
