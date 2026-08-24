# FitCoach motion-guide inputs

These files are project-owned synthetic generation inputs for the exercise-motion pilot. They contain no user data and are not loaded by the app.

- `barbell-back-squat-start-v1.jpg` — reviewed first-frame composition, SHA-256 `a323ac1c581ede55acb43bc118445514d84ce6c8f4d92e8d0e2f426d3ce835e8`
- `barbell-back-squat-target-v1.jpg` — reviewed target-frame composition, SHA-256 `287972be11727815ba3a10c5f8ef070cda88a0bbc4ecfda2596f35607809a491`

The resulting motion file must remain silent and local, and must pass human movement, equipment-continuity, anatomy, and visual-quality review before it can be added to the active media manifest.

## Remaining hard-gym queue

The app currently activates 20 reviewed motion loops. The remaining 40 intermediate/advanced gym movements are tracked in `v040/data/motion-generation-queue.mjs`. `scripts/openrouter-motion-jobs.mjs` can list or preview a bounded OpenRouter request and submits only one job at a time when explicitly passed `--submit` with both `OPENROUTER_API_KEY` and a reviewed `OPENROUTER_VIDEO_MODEL`. A returned job is not app media: download it, strip/verify audio, record a checksum, run movement/equipment/anatomy/visual review, and only then add it to `exercise-media-manifest.mjs`.

The active PWA never sends provider video requests and never loads pending jobs. This keeps an incomplete or unreviewed generation run from changing workout guidance.
