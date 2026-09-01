# Youth and privacy requirements — product draft

Status: implementation requirements for product and legal review; **not** a published privacy policy or legal opinion.

## Audience boundary

FitCoach intends to support people aged 13 and older. It is not a Kids Category app and must not be marketed to children under 13. A neutral date-of-birth/age-band screen must run before account creation and before any analytics, community, cloud coach, nutrition photo, or personalized offer SDK initializes.

- Under 13: do not create an account; show an age-appropriate blocked screen and delete any transient input.
- 13–17: enable teen-safe defaults below.
- 18+: standard experience, still subject to consent and safety controls.
- Unknown age: use the teen-safe path and do not initialize age-restricted processing.

## Teen-safe defaults

- Trainer tone cannot be `Rude`. No humiliation, sexual-attractiveness framing, body shaming, punishment, starvation, purging, dehydration, supplement/drug pressure, or appearance comparison.
- Do not prescribe an aggressive calorie deficit, weight-loss pace, or macro target. Nutrition remains descriptive logging and general education until the youth policy receives clinical/legal review.
- Community/profile discovery is off by default. Progress photos are private by default, stripped of metadata, excluded from model training, and require a separate explicit share action.
- No public direct messages, location sharing, searchable real name, contact syncing, leaderboards based on body weight, or adult-to-minor messaging in the first release.
- No personalized ads, advertising ID, data broker sharing, or sale of health/fitness data for any user.
- Health permissions are requested just in time and remain optional. A denial cannot block core manual logging.
- Subscription screens use plain pricing, renewal, trial, cancellation, and restore language. No countdowns, fake scarcity, or shame.

## Data minimization

FitCoach may process only the data needed for the feature the person chose. The initial health bridge is read-only: it requests daily aggregate steps and active-energy totals and exposes no workout-write method or permission. Any future completed-workout export requires a separately reviewed action and just-in-time consent. Raw HealthKit/Health Connect samples, microphone audio, Bluetooth identifiers, contacts, precise location, advertising identifiers, and photo EXIF are not retained by this native layer.

The production privacy notice must enumerate each data type and each processor, retention period, deletion behavior, export path, security safeguards, store disclosure, and youth treatment. It must be available at a public non-geofenced HTML URL and from inside the app.

## Required controls before public release

1. In-app account and associated-data deletion plus an unauthenticated public deletion-request URL.
2. Machine-readable export and readable export.
3. Per-feature consent ledger with policy version, timestamp, and revocation.
4. Block/report/moderation/appeal operations before enabling any community feature.
5. A tested safety escalation flow for self-harm, eating disorder, abuse, medical emergency, and acute injury language.
6. Legal review for COPPA, state privacy laws, GDPR/UK GDPR age of digital consent, consumer health-data laws, subscription rules, and every launch country.
7. Store disclosures reconciled against the actual production SDK dependency graph and backend logs.

## Product-copy rule

FitCoach is a fitness and nutrition organizer, not medical care, diagnosis, rehabilitation, emergency response, or live form assessment. That boundary must be visible when relevant without burying every ordinary screen in repetitive disclaimer text.
