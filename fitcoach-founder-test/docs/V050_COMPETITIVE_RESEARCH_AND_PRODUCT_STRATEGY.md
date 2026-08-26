# FitCoach v0.5 competitive research and product strategy

Status: product strategy for an adult founder-beta path, then a public-ready product

Research check: 2026-08-26

## Decision summary

FitCoach should not try to be a thinner clone of ten successful fitness apps. Its
defensible product is a **trustworthy, visual, action-taking trainer**: it knows
the user's approved plan and recorded work, can open the relevant workout, guide,
food entry, or progress view when asked, and keeps the user in control of every
meaningful change.

The daily loop is deliberately small:

```text
One useful recommendation -> visual guidance -> effortless logging
-> honest progress -> optional coach adaptation -> one next commitment
```

That loop combines the best observed patterns without inheriting their weakest
ones: Fitbod's actionable personalization, Hevy's in-workout help, Cal AI's
capture/review/save flow, Ladder's low-choice daily session, Strava's
activity-based connection, and Apple Fitness+'s calm visual clarity.

For the next two weeks, the credible target is an **adult, invited founder beta**
with a complete core loop and honest capability boundaries. It is not credible to
call an unmoderated social feed, unvalidated calorie camera, or browser-only voice
prototype a fully complete public iOS/Android release. Store readiness must be
earned with tested native capabilities, accounts, deletion/export, content rights,
and moderation controls.

## Methodology and limits

This is a deliberately chosen ten-app benchmark set, not a universal ranking of
fitness products and not proof that a feature will work for FitCoach. It covers
social fitness, trainer-led content, lifting logs, nutrition capture, adaptive
workouts, and premium subscription experiences:

- Strava, Nike Training Club, MyFitnessPal, Fitbod, and Hevy;
- Ladder, Freeletics, Peloton, Cal AI, and Apple Fitness+.

Research used official product sites, official investor/press material, official
help pages, and Apple App Store or Google Play developer listings. Store counts,
ratings, feature lists, and prices are point-in-time, region/platform-dependent
snapshots. A listing's marketing copy is a developer claim, not independent
verification.

Labels used below:

- **Store/official evidence** — a feature, price, age rating, or listing figure
  shown by the platform or company source.
- **Vendor-reported scale** — a company claim about users, sessions, or reach;
  useful only as a directional reach signal, not proof of quality, retention, or
  teen adoption.
- **FitCoach inference** — a product conclusion made from the benchmark; it is
  not a claim made by the referenced company.

No competitor interface, copy, logo, asset, exercise illustration, media, or
trade dress may be reused. Learn from interaction patterns, then create original
FitCoach content and presentation.

## Ten-app comparison

| App | Official/store evidence | Engagement and interface pattern | Free / paid pattern and scale | FitCoach inference |
| --- | --- | --- | --- | --- |
| **Strava** | Tracks activities across 40+ sport types, supports devices, community, routes, challenges, and analysis. Its current App Store listing shows #1 Health & Fitness, 369K ratings and 4.8; Google Play shows 100M+ downloads, 1.14M reviews and 4.6. | The social object is an actual activity, route, club, or challenge—not an empty generic post. | Free recording, community, and safety tools; paid routes/history/analysis/goals/challenges. US annual plan is listed at $79.99, with a 30-day trial; student annual is $39.99. **Vendor-reported scale:** Strava says it has 180M active people. | Make a completed workout, food log, or progress milestone a useful artifact. Start with private progress and explicit sharing rather than a default-public feed or engagement pressure. |
| **Nike Training Club** | Offers trainer-led video and whiteboard workouts, gym/home strength, HIIT, yoga/Pilates, recovery, mindfulness, programs, and achievements. Apple shows 281K ratings/4.8 and a free 9+ app; Nike says there are 180+ free workouts. | High-quality guided content is the surface. The user picks a modality/level and receives visual instruction rather than a wall of settings. | Free to Nike Members. No core-workout paywall is presented in the cited sources. | A free visual library can acquire users, but FitCoach must not imply Nike-scale production, athlete partnerships, or licensed content it does not actually have. |
| **MyFitnessPal** | Google Play lists calorie/macro, food, workout, barcode, voice, and meal-scan features; 100M+ downloads, 2.91M reviews/4.4, ads and in-app purchases. | Logging friction is reduced with scan/search/voice and a daily, goal-oriented view. | Free basics with ads; Premium is listed at $79.99/year or $19.99/month. Premium+ is listed at $99.99/year or $24.99/month and adds meal planning/grocery support. | A food camera must end in a review/edit/save step with portion controls and uncertainty—not present a vision estimate as fact. Keep ads away from focused workout and logging flows. |
| **Fitbod** | Uses goals, history, and equipment to personalize workouts; offers 1,000+ exercises, multi-angle video/instructions, routine editing, and integrations. Apple shows 282K ratings/4.8; Google Play shows 1M+ downloads and 30.6K reviews/4.4. | Personalization becomes valuable when it produces a concrete session immediately, with easy swaps and teaching media at the moment of need. | Official subscription material lists a 7-day trial, then $15.99/month or $95.99/year in the US. | Charge for durable personalization and advanced history, not for the first useful guided workout. Show a deterministic plan diff before applying a material change. |
| **Hevy** | Supports routine planning, logging, PRs, rest timers, graphs, exercise "How" guidance, private progress photos, and a workout-centric feed. Google Play shows 5M+ downloads and 236K reviews/4.8. | The user can open a visual exercise guide while logging without discarding the workout. The social artifact is a real workout/PR. | Hevy markets a free, no-ad tier; Pro lifts routine/history/customization limits. One official feature page markets Pro at $2.99/month; current checkout price must be verified before any user-facing comparison. | Put the guide, timer, and coach beside the active set, never behind a navigation dead end. Social/photo sharing is later work requiring privacy, moderation, reporting, and blocking. |
| **Ladder** | Coach-built daily plans renew weekly; video demos, in-ear coaching, timers, progressive overload, and a journal for reps/weights. Apple shows 185K ratings/5.0, #11 US Health & Fitness, and a 7-day free trial. | A named coach presents one prescribed session, sharply reducing choice paralysis. Audio, video, and logging live in the same workout loop. | Trial-to-subscription. The sources reviewed did not expose one reliable current standard price. | Nova should give one clear recommended next action, while retaining transparent Full/Reduced/Minimum choices and user approval. Do not claim human-coach credentials or content scale without operations to support it. |
| **Freeletics** | Offers home/gym/cardio coaching, feedback-driven adaptation, Apple Health/Watch, badges/streaks, skill progressions, and a paid Coach layer. Apple lists free + IAP, 22K US ratings/4.6, and a 13+ rating. | Feedback after sessions feeds an adaptive daily plan. The product also uses plans, calendars, challenges, and progression. | Free discovery includes selected HIIT and exercises; paid Coach adds broader adaptation and programs. **Vendor-reported scale:** Freeletics says 60M users and 450M sessions. | Make feedback change only an explainable, scoped part of a plan. Avoid giant choice walls, punitive streak mechanics, or adult community features for minor users. |
| **Peloton** | Provides live/on-demand classes, scheduling, stacks, bookmarks, filters, Apple Watch/heart-rate support, and challenges. Apple shows 816K ratings/4.9 and a 13+ free + IAP app. | Scheduling and stacking turn motivation into a calendar commitment; instructor voice/music/community make sessions feel eventful. | 30-day new-member trial; the last unambiguous official price release lists App One at $15.99/month and App+ at $28.99/month, effective October 2025. **Vendor-reported scale:** Peloton reported 5.8M Members, 2.662M paid connected subscriptions, and 0.522M paid App subscriptions at March 31, 2026. | Build a lightweight schedule and one next commitment. Do not inherit a costly live-instructor/music/leaderboard operating model or social-comparison pressure. |
| **Cal AI** | Promotes photo/depth volume estimation, barcode/text logging, food database, progress, and suggestions. Apple lists 358K ratings/4.8, #8 US Health & Fitness, 9+, and free + IAP. | One dominant camera action creates a short loop: capture -> recognize -> review -> correct -> save. | Free + IAP; the reviewed store listing did not provide a stable interval/price to quote. **Vendor-reported scale:** Cal AI says 5M users and a 4.9 rating. | The camera can be visually delightful only if the user can correct food, serving, and confidence before it changes the diary. Do not mimic opaque data practices or imply clinical nutritional accuracy. |
| **Apple Fitness+** | Offers 12 workout types and meditation, weekly new sessions, 5–45 minute workouts, recommendations/custom plans, and supported Watch/AirPods/Bluetooth HRM metrics. | Calm, concise navigation and consistently visual choices create a premium feel without excessive UI decoration. | Official US price: $9.99/month or $79.99/year, with one month free; Apple One allows family sharing for up to five. Apple does not publish a current subscriber count on the cited product page. | FitCoach should use restrained hierarchy, generous spacing, clear duration/goal choices, and tactile feedback—but cannot claim Apple-level studio/hardware integration until it is actually built and tested. |

### Direct sources

#### Strava

- [Apple App Store listing](https://apps.apple.com/us/app/strava-run-bike-walk/id426826309)
- [Google Play listing](https://play.google.com/store/apps/details/?hl=en-US&id=com.strava)
- [Official subscription page](https://www.strava.com/subscribe)
- [Strava 2025 Year in Sport report](https://press.strava.com/en-gb/articles/strava-releases-12th-annual-year-in-sport-trend-report-2025) — company-published research; its Gen Z findings are vendor-reported, not independent market measurement.

#### Nike Training Club

- [Apple App Store listing](https://apps.apple.com/us/app/nike-training-club/id301521403)
- [Nike official apps page](https://www.nike.com/gb/membership/free-running-training-apps)

#### MyFitnessPal

- [Google Play listing](https://play.google.com/store/apps/details?hl=en_US&id=com.myfitnesspal.android)
- [Official membership tiers](https://blog.myfitnesspal.com/myfitnesspal-membership-pricing-tiers/)
- [Official Premium page](https://www.myfitnesspal.com/premium?legacy=true)

#### Fitbod

- [Apple App Store listing](https://apps.apple.com/us/app/fitbod-gym-fitness-planner/id1041517543)
- [Google Play listing](https://play.google.com/store/apps/details?id=com.fitbod.fitbod)
- [Official subscription help](https://help.fitbod.me/hc/en-us/sections/1500000506081-Subscriptions)
- [Official product FAQ](https://fitbod.me/faqs/)

#### Hevy

- [Google Play listing](https://play.google.com/store/apps/details?id=com.hevy)
- [Official pricing](https://hevy.com/pricing)
- [Official exercise performance guidance](https://www.hevyapp.com/features/exercise-performance/)
- [Official social features](https://www.hevyapp.com/features/social-features/)
- [Official progress photo feature](https://www.hevyapp.com/features/gym-progress/)

#### Ladder

- [Apple App Store listing](https://apps.apple.com/us/app/ladder-strength-training-plans/id1502936453)
- [Official product page](https://www.joinladder.com/)

#### Freeletics

- [Apple App Store listing](https://apps.apple.com/us/app/freeletics-workouts-fitness/id654810212?ls=1)
- [Official home page](https://www.freeletics.com/en/) — user/session totals are vendor-reported.
- [Official Coach feature breakdown](https://www.freeletics.com/en/blog/posts/all-your-coach-benefits-in-a-nutshell/)
- [Official subscription help](https://help.freeletics.com/hc/en-us/articles/360020109819-Purchase-a-Coach-subscription)

#### Peloton

- [Apple App Store listing](https://apps.apple.com/us/app/peloton-fitness-workouts/id792750948)
- [Official investor Q3 FY26 release](https://investor.onepeloton.com/news-releases/news-release-details/peloton-announces-q3-fy2026-financial-results/) — member/subscription totals are company-reported.
- [Official app membership page](https://www.onepeloton.com/app-membership)
- [Official October 2025 app-price release](https://investor.onepeloton.com/news-releases/news-release-details/peloton-enters-new-era-ai-powered-peloton-iq-and-new-product)

#### Cal AI

- [Official product page](https://www.calai.app/) — user/rating totals are vendor-reported.
- [Apple App Store listing](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)
- [Google Play data-safety listing](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai)

#### Apple Fitness+

- [Official Apple Fitness+ page](https://www.apple.com/apple-fitness-plus/)

## Patterns FitCoach should adopt

The following are FitCoach product inferences, not feature promises by the
benchmarks.

| Pattern | Benchmark signal | FitCoach expression | Acceptance proof |
| --- | --- | --- | --- |
| **One prescribed action, not a dashboard of choices** | Ladder's daily session and Freeletics' adaptive Coach reduce decision load. | Today has one recommended action with a short reason, a duration, and Full/Reduced/Minimum choices. | A new user can start a useful session in two taps from Today; each variation names what changes. |
| **Coach as an action layer** | Fitbod turns inputs into a session; Hevy keeps exercise instruction available while logging. | “Show my pull workout,” “swap this,” “how do I do this?” and “log this meal” open the appropriate native object while Coach stays available. | Each Coach-initiated navigation is visible, reversible, and backed by deterministic data; the model cannot mutate a plan. |
| **Visual instruction at the exact moment of need** | NTC, Fitbod, Hevy, and Ladder put video/demonstration alongside the workout. | Original, licensed exercise poster/loop, muscle-focus map, short setup cues, common mistakes, and a text fallback live beside the active exercise. | Every exercise has a verified provenance record and useful text fallback; media failure never becomes an empty or fake player. |
| **Capture -> review -> correct -> save** | Cal AI and MyFitnessPal make intake logging fast. | Camera, barcode, text, and recent-food inputs all create a draft with serving edit, confidence/range, source, and explicit Save. | No calorie/macronutrient estimate enters the diary without a visible user confirmation or correction path. |
| **Progress from completed evidence** | Strava and Hevy center recorded activities, PRs, calendars, and history. | Progress shows only completed logs: attendance, volume, comparable exercise history, and optional private photos. | Empty states show no invented streak, PR, calorie burn, or physiological readiness value. |
| **Lightweight commitment and accountability** | Peloton scheduling and Strava clubs/challenges encourage return. | A private weekly plan, optional reminders, an upcoming session, and later opt-in friend accountability. | Users can turn reminders and sharing off; nothing posts or invites contacts automatically. |
| **Adaptation with control** | Fitbod/Freeletics adapt based on feedback. | Low energy, time, equipment, or exercise dislikes produce a scoped proposal, reason, evidence receipt, and Approve/Keep-current controls. | A plan cannot change because of free-form model output; stale proposals are rejected. |
| **Premium restraint** | Apple Fitness+ demonstrates calm, concise hierarchy; NTC avoids data overload. | Blue performance palette, consistent spacing/type scale, one clear primary action, sufficient touch targets, visual cards only when they add action or understanding. | iPhone-width visual QA confirms no overlap, clipped copy, tiny controls, fake chrome, or unearned “AI” status decoration. |

## Patterns FitCoach should avoid

| Avoid | Why it fails FitCoach | Safer replacement |
| --- | --- | --- |
| Exact competitor visual copying | It risks trade-dress/copyright issues and results in an incoherent product. | Copy the *principle*—e.g., one clear session—not layouts, assets, type, color systems, labels, or illustrations. |
| A giant configuration wall before the first workout | It makes the product feel generic and delays value. | Ask one useful onboarding question at a time; give a sensible default and a visible “change later” path. |
| Fake/failed media states dressed up as premium | A looping replay label, unavailable player, or generated-media claim destroys trust. | Show an original poster or playable, tested local loop; otherwise show a candid “Technique guide” with text and a retry only when a real retry exists. |
| Public-by-default posts, photos, or location | It is inappropriate for an early product and dangerous for younger users. | Private by default, explicit share preview, opt-in small groups only after account safety and moderation are proven. |
| Calorie/weight-loss certainty from a photo | Computer vision is an estimate; presenting precision as fact can harm trust and users. | Show estimate range/confidence, editable food/serving, data source, and a save confirmation; do not use medical language. |
| Ads or disruptive upsells during a workout | They interrupt the very moment FitCoach needs to earn trust. | Free core training/logging; a calm, separately disclosed premium upgrade around durable value. |
| Punitive streaks, humiliation, body-shaming, or social comparison | They are especially unsafe for teens and contradict FitCoach's collaborative adaptation principle. | Celebrate verified participation, offer reset/return language, and keep Strict/Competitive presentation firm but non-humiliating. |
| Claiming live form analysis, rehabilitation, recovery scores, or diagnosis without evidence | This exceeds the product's safety/validation boundary. | Clear movement education and self-directed setup cues; direct emergencies/injury concerns to appropriate professional help. |
| Content-scale promises before rights, review, and operations exist | “100 videos” is not a product benefit if the assets are unlicensed, inconsistent, or broken. | Use a content production queue with provenance, quality review, platform/device playback tests, and an honest coverage counter. |

## FitCoach differentiation

### The core promise

**A personal trainer that can explain, show, and act—without taking control away.**

FitCoach should win on five connected attributes:

1. **Context with receipts.** It remembers only approved local/account data and
   identifies why a recommendation is being made using visible recorded facts and
   deterministic rules. It does not invent hidden readiness, streaks, or results.
2. **A coach that navigates.** A request becomes a visible in-app action:
   session, exercise guide, food draft, progress point, or plan-change proposal.
   The user can decline, edit, or return without losing workout state.
3. **Premium visual teaching.** Each movement has original/licensed visual media,
   a muscle-focus explanation, setup, execution, common mistakes, and a reliable
   low-bandwidth text fallback. “Premium” means consistent, working media—not a
   decorative image or fake motion player.
4. **Nutrition with uncertainty and control.** Camera recognition is one helpful
   input alongside barcode, text, saved meals, and manual entries. It labels its
   uncertainty and lets the user correct it before the diary changes.
5. **A firm but humane coach.** Supportive, Direct, Strict, Competitive, and any
   future Rude presentation modes may change voice and wording only. Safety,
   privacy, plan authority, and anti-humiliation rules stay identical across
   modes. “Rude” must never be available to teen accounts or become harassment.

### Product boundaries that protect the promise

- No plan is auto-changed from model output; material changes require a
  deterministic diff and user approval.
- No raw microphone audio is persisted or uploaded by FitCoach without a clear,
  intentional architecture and consent flow.
- No health, medication, injury, diagnosis, rehabilitation, or form-correction
  claim is made without a separately validated product capability and review.
- No calorie-camera result is presented as verified truth.
- No user-photo/social feature ships before its privacy, deletion, reporting,
  blocking, moderation, and age behavior are implemented and tested.

## Teen-safe launch guardrails

This is product guidance, not legal or clinical advice. Before allowing minors,
obtain jurisdiction-specific legal/privacy review and qualified adolescent-health
content review. The safer near-term launch is **18+ invited founder beta**.

### Eligibility, tone, and health boundaries

- Treat age ratings as store metadata, not evidence of suitability. Do not infer
  teen safety from a competitor's 9+, 13+, or Teen rating.
- For under-18 accounts, disable Rude/roast mode, appearance-first targets,
  public before/after comparison, body-ranking language, and calorie-deficit
  gamification. Strict language may be clear, but never humiliating.
- Do not make adolescent calorie restriction, body-fat goals, supplement advice,
  medication reminders, diagnosis, recovery claims, or injury programming a
  default product path. The American Academy of Pediatrics identifies adolescent
  dieting/weight-loss practices as an eating-disorder risk; use age-appropriate,
  enjoyable activity framing and escalate sensitive questions to a caregiver or
  qualified professional rather than an AI answer.
- Preserve non-medical movement education: technique cues and general activity
  guidance are not live form assessment, medical care, or rehabilitation.

### Data, camera, voice, and location

- Minimize collection. Ask only for data that changes the current product loop;
  make location, photos, contacts, microphone, HealthKit/Health Connect, and
  social features opt-in and purpose-specific.
- Keep photos private by default. Show the audience before any share, provide
  per-item delete, export/deletion routes, retention rules, and a clear statement
  of whether media is used for model training (the default should be no).
- Treat food photos and voice transcripts as sensitive. Do not retain raw audio;
  make food-image processing, source/provider, retention, and deletion clear.
- Do not request a gym's exact location just to determine equipment. Let the
  user select equipment manually or use a local, explicit optional scan.
- For U.S. children under 13, COPPA imposes notice/parental-consent and data
  obligations; do not launch that age group until the complete compliance design
  is reviewed and implemented.

### Community / user-generated content gate

No public post, public progress photo, comments, DMs, or discoverable profile
should launch until all of the following are real and tested:

1. authenticated account, age treatment, privacy policy, terms, and deletion;
2. private-by-default audience controls and explicit consent before publishing;
3. report, block, filtering/moderation, review queue, escalation, and developer
   contact information; and
4. abuse monitoring, rate limits, data retention, and response ownership.

Apple's App Review Guidelines and Google Play's user-generated-content policy
make moderation/reporting/blocking requirements material store concerns, not
optional polish.

### Teen-safety sources

- [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play user-generated-content policy](https://support.google.com/googleplay/android-developer/answer/9876937)
- [American Academy of Pediatrics: Preventing obesity and eating disorders in adolescents](https://publications.aap.org/pediatrics/article-abstract/138/3/e20161649/52684)
- [CDC youth physical activity guidance](https://www.cdc.gov/physical-activity-education/guidelines/index.html)

## Staged roadmap

### Now — two-week adult founder beta

**Goal:** a coherent, testable daily loop; not a public-market completeness claim.

- Complete the five-route loop: Today -> Train -> Active Workout -> Coach ->
  Progress, with Food as a secondary action in the same shell.
- Make every exercise route honest: original/rights-cleared poster or tested local
  motion loop, concise cues, muscle-focus explanation, visible fallback, and no
  fake playback/retry state.
- Ensure Coach can open a workout, exercise, food draft, or progress view while
  preserving the active workout and transcript; keep deterministic actions and
  approval boundaries intact.
- Ship food drafts only as estimates with manual text/portion correction and
  explicit save. Do not call a camera demo “accurate calorie recognition.”
- Remove founder-password/prototype copy from the user surface; retain only an
  accurate version label and a concise capability/privacy explanation.
- Test the core loop on real iPhone Safari and Android Chrome widths, including
  first-use, no data, first session, media unavailable, offline, speech denied,
  and provider failure states.
- Keep the beta adult/invited. No public social posting, billing, ads, minor
  onboarding, clinical claims, or public health promises.

**Exit evidence:** a founder can complete and recover a workout, see only
verified progress, use typed Coach despite speech/provider/media failure, correct
a food estimate before saving it, and delete their locally stored test data.

### Next — public-store readiness

**Goal:** turn the founder PWA into a defensible product platform before broad
distribution or paid claims.

- Build accounts, secure server-side storage, device sync, authenticated export,
  account deletion, retention policy, backups, and audit logs.
- Replace food-camera placeholders with a licensed/verified nutrition data
  provider, barcode lookup, source/provenance, serving editor, confidence range,
  and correction feedback loop. Validate results across representative foods
  before marketing accuracy.
- Expand to 100 quality exercise guides through a rights/provenance pipeline;
  each record needs original/licensed media, accessibility text, QA, and actual
  device playback evidence. Start with the movements needed by real plans rather
  than a cosmetic count.
- Implement native HealthKit and Health Connect only with purpose-limited
  permissions, clear user consent, data minimization, and tested disconnect/
  deletion behavior.
- Build voice as a native-capability workstream: interruption, Bluetooth/AirPods,
  call/background recovery, speech detection, text fallback, and device-specific
  test matrix. Do not call a browser speech loop equivalent to premium realtime
  voice before those tests pass.
- Add store-native purchase plumbing and entitlement verification only after the
  free/premium boundary is agreed. Preserve free core workout, basic logging, and
  food correction; position premium around deeper personalization, history,
  advanced plans, premium voice, and higher scan capacity.
- Resolve dependency alerts and establish release security checks before public
  distribution.

**Exit evidence:** authenticated account lifecycle works end-to-end; all premium
entitlements are server-verified; native integrations pass on supported devices;
media and food providers have recorded provenance; accessibility, privacy, and
store-policy review have no unresolved launch blocker.

### Later — scale carefully after real retention evidence

**Goal:** extend what founders and early users repeatedly use, rather than adding
surface area for a marketing checklist.

- Opt-in accountability circles, challenge mechanics, and eventually a social
  sharing layer after the community safety gate is met.
- A richer saved-program builder, periodization/progression tools, and coach
  adaptation based only on sufficient verified history.
- More exercise angles, higher-quality motion, localized content, and human
  editorial review—only where engagement and support data justify the production
  cost.
- Family plans, student pricing, and carefully designed creator/coach pathways
  after identity, revenue, content rights, moderation, and support operations are
  ready.
- Recommendation experimentation only with explicit success metrics, reversible
  flags, and no degradation of safety, consent, or user plan authority.

## Launch scorecard

Do not make a public-store or paid-feature claim until every applicable item has
concrete evidence:

- [ ] core workout/log/restore/complete loop tested on iPhone and Android;
- [ ] no invented progress, streak, calorie, record, or readiness result;
- [ ] exercise media is original/licensed, attributed where required, playable,
  accessible, and recoverable when optional media fails;
- [ ] Coach navigation/actions are deterministic, visible, reversible, and
  incapable of silently changing a plan;
- [ ] food estimates support source, confidence/range, correction, and save;
- [ ] account data can be exported and deleted, with clear retention semantics;
- [ ] payment entitlements work across supported storefronts and server checks;
- [ ] HealthKit/Health Connect and voice claims match actual device tests;
- [ ] dependency/security/privacy review is green;
- [ ] social/photo/teen features remain off unless their specific safety gate is
  demonstrably complete.

The product wins by making the next useful action feel clear, visual, and
trustworthy—not by claiming every capability of every benchmark on day one.
