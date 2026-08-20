# FitCoach v0.4 architecture and migration boundary

Status: target architecture and compatibility contract
Release target: `0.4.0` / query and cache generation `v=0401`
Legacy rollback baseline: v0.3.6 at repository commit `80decb479dadef229db0e97937ebedd616a4ff57`

## Decision summary

v0.4 is a clean browser runtime inside `fitcoach-founder-test/v040/`. The document entry loads `v040/styles.css` and `v040/app.js`, with `app.js` loaded as an ES module. v0.4 must not append a new global override to the v0.3.1/v0.3.3/v0.3.6 stack.

The v0.3.6 implementation remains the compatibility and rollback baseline:

- source data key: `fitcoach-v031:<founder>`;
- v3 Coach API: `https://symbioai.dev/api/fitcoach-chat-v3`;
- deterministic action vocabulary and approved-action authority;
- private/sensitive input interception;
- typed reply independence from speech;
- browser/device dictation with no FitCoach raw-audio upload.

v0.4 writes a new versioned envelope under `fitcoach-v040:<founder>`. Migration copies and normalizes founder data; it does not delete or overwrite the v0.3.6 key. That separation makes a code rollback safe, but a rolled-back v0.3.6 UI will not automatically see sessions created only in v0.4. Export v0.4 data before a downgrade where preserving post-migration activity matters; do not attempt an implicit lossy down-migration.

## Current baseline inspected

The v0.3.6 document currently loads classic scripts from three generations:

- the v0.3.1 `v031-part-*` state, workout, and view files;
- the v0.3.3 global contract and page replacement;
- `v035-trainer-chat-voice.js` as the final active Coach/voice adapter.

`index.html` and `sw.js` are the authoritative runtime manifests. Historical `app.js`, `js/*.js`, `styles.css`, `css/*.css`, `v03-*`, `v032-ai-voice.js`, and the retired raw-audio module must stay inactive. The v0.3.6 storage normalizer accepts even older founder keys and converges on `fitcoach-v031:<founder>`.

The baseline state contains, at minimum:

- founder, profile, settings, sessions, and active workout;
- chat, feedback, deterministic decisions, memories, and intervention outcomes;
- plan proposals, accepted plan notes, and last API metadata;
- `fitcoach-session` convenience-gate state and `fitcoach-device-id`.

The v0.3.6 active workout stores a plan id/label, start time, exercises by name, and sets with id, index, weight, reps, and completion. Its rest timer is an in-memory interval, so it is not recoverable after navigation teardown or refresh. v0.4 must preserve valid sets while converting the workout to stable exercise identifiers and timestamp-based timer state.

## Runtime boundary

The `v040/` directory is a product boundary, not another override layer. The logical dependency direction is:

```text
index.html
  -> v040/app.js (ES module composition root)
      -> core: storage, migrations, router, theme, events
      -> domain: plans, diffs, workouts, progress, exercises
      -> services: bounded Coach API, device speech, connectivity
      -> ui: shell, route views, dialogs, workout mini-player
      -> data: exercise library and media/license manifest
v040/styles.css
  -> tokenized Bright Performance presentation for every route/state
```

The exact internal file count may remain small for the founder build, but these ownership boundaries are mandatory:

| Boundary | Owns | Must not own |
| --- | --- | --- |
| `app.js` composition root | startup order, dependency wiring, one application instance | workout rules, migration transforms, API authority, or large route templates |
| core storage/migrations | safe parsing, schema validation, backups, atomic envelope writes, subscriptions | DOM rendering or model calls |
| core router/theme | five-route navigation, internal Train segments, first-paint theme, persisted theme selection | workout mutation |
| domain plans | deterministic plan creation, immutable versions, proposal diffs, approval/rejection | persuasive model copy or direct DOM writes |
| domain workouts | active-workout commands, set persistence, timer timestamps, completion and duplicate prevention | route ownership or provider calls |
| domain progress | documented calculations over completed sessions | demo values or inferred health outcomes |
| domain exercises | schema validation, search/filter, preferences, substitutions by stable id | asset fetching from competitor domains |
| Coach service adapter | strict v0.3.6-compatible request/response mapping and timeouts | selecting actions, applying plans, clearing safety, or writing memory from model output |
| device speech adapter | recognition/TTS capability checks and lifecycle | raw-audio persistence/upload or blocking typed replies |
| UI views/components | escaped rendering, accessible interaction, dispatching typed domain commands | direct localStorage writes or hidden plan mutation |

Avoid implicit globals. Modules exchange narrow functions and plain structured data. User-controlled strings must be rendered through text nodes or escaped before HTML insertion. Domain commands should return a new validated state plus an auditable result rather than mutate global state from event handlers.

## Startup order

1. Inline first-paint code reads only the v0.4 theme preference (or a small theme hint), applies `data-theme`, and sets `meta[name="theme-color"]` before render-blocking presentation work. New profiles default to Light; System is used only when chosen.
2. Load `v040/styles.css?v=0400`.
3. Load `v040/app.js?v=0400` as an ES module.
4. Parse the founder convenience session without implying production authentication.
5. Load or migrate the selected founder envelope through the storage boundary.
6. Validate the resulting schema; recover to a safe new envelope without deleting malformed source text.
7. Construct deterministic domain services, then the Coach and device-speech adapters.
8. Render the requested valid route or Today; restore an active-workout mini-player whenever an active workout exists.
9. Register `sw.js?v=0400`, update deliberately, and surface connection/update state without blanking the UI.

An optional exercise asset, speech API, provider response, or chart failure must not prevent steps 5–8.

## v0.4 storage envelope

Canonical key:

```text
fitcoach-v040:<founder>
```

Recommended top-level shape:

```js
{
  schemaVersion: 4,
  appVersion: "0.4.0",
  founder: "mo",
  revision: 1,
  profile: {},
  settings: {},
  theme: { selection: "light" },
  coachPresentation: {},
  exercisePreferences: {},
  plans: { current: null, proposals: [], history: [] },
  sessions: [],
  activeWorkout: null,
  chat: [],
  decisions: [],
  memories: [],
  feedback: [],
  interventionOutcomes: [],
  acceptedPlanNotes: [],
  lastApi: null,
  migration: {
    sourceKey: "fitcoach-v031:mo",
    sourceVersion: "0.3.6",
    sourceFingerprint: "...",
    completedSteps: [],
    migratedAt: "..."
  },
  createdAt: "...",
  updatedAt: "..."
}
```

`revision` increments after each material domain write. Save the complete validated envelope through one storage function. If quota or serialization fails, keep the current in-memory state, display a durable error, and do not report the action as saved.

### Stable identifiers and snapshots

- Exercise library records use stable lowercase identifiers that are never reassigned to a different movement.
- Active and completed workouts reference `exerciseId`, not display name alone.
- A completed session also stores an `exerciseSnapshot` sufficient to render history after library changes: id, name, movement pattern, primary/secondary muscles, equipment, unit, and an optional local poster reference.
- Set ids and session ids are stable. Completion uses the active workout id as the session id or records an explicit source id, and refuses a second completion when that id already exists.
- Changing exercise display copy or media does not rewrite historical sessions.

## Deterministic plan, version, diff, and evidence contracts

A meaningful change is modeled before it is rendered:

```js
Plan = {
  id,
  version,
  basedOnVersion,
  title,
  goal,
  minutes,
  location,
  equipment,
  exercises,
  createdAt
}

PlanProposal = {
  id,
  planId,
  baseVersion,
  proposedVersion,
  trigger,
  diff,
  evidenceReceipt,
  status: "pending" | "approved" | "rejected",
  createdAt,
  resolvedAt
}

PlanDiff = {
  duration: { before, after } | null,
  equipment: { before, after } | null,
  added: [],
  removed: [],
  replaced: [],
  reordered: [],
  setChanges: []
}

EvidenceReceipt = {
  facts: [{ key, value, source, observedAt }],
  ruleId,
  explanation
}
```

Only the deterministic plan service creates `diff` and `evidenceReceipt`. Approval is an explicit user command that verifies the proposal remains pending and `baseVersion` still matches the current plan. A stale proposal is rejected and recalculated; it is never applied over a newer plan. Rejection retains an audit record and leaves the plan unchanged.

The language model may rewrite the human-facing explanation but cannot create or alter the structured diff, evidence facts, action, proposal status, or plan version.

## Active workout and timer contract

Recommended active-workout additions:

```js
{
  id,
  planId,
  planVersion,
  startedAt,
  updatedAt,
  status: "active" | "paused",
  currentExerciseId,
  currentExerciseIndex,
  scrollAnchor,
  exercises: [{ exerciseId, exerciseSnapshot, sets, notes }],
  restTimer: {
    status: "idle" | "running" | "paused" | "complete",
    durationSeconds,
    startedAt,
    endsAt,
    pausedRemainingSeconds
  }
}
```

Persist after every material change: starting, set edit/completion, add/remove/swap/reorder, notes, exercise navigation, pause/resume, timer adjustment, and minimize/restore. A display interval only repaints. Remaining rest is always derived from `endsAt - Date.now()`, so refresh and navigation cannot reset the countdown. Pausing captures remaining seconds; resuming creates new timestamps.

Completion must:

1. validate at least one completed set;
2. build a completed-session snapshot from only saved workout facts;
3. check that the session/source workout id does not already exist;
4. write the session and clear the active workout in one envelope save;
5. compute records and recap facts deterministically;
6. show an error and keep the active workout if persistence fails.

The model may render recap wording only from the deterministic recap facts. It cannot invent volume, duration, muscles trained, records, comparison, or adherence.

## Migration from v0.3.6

### Inputs

Primary source: `fitcoach-v031:<founder>`.

Older keys remain the responsibility of the existing v0.3.6 normalizer:

- `fitcoach-founder:<founder>`;
- `fitcoach-founder-live-v1:<founder>`;
- `fitcoach-founder-live-v1<founder>`.

If no v0.3.1 key exists, v0.4 may reuse the proven legacy normalization logic as a pure transform, but it must not reactivate old scripts. It should migrate the normalized value into the v0.4 envelope.

### Backup

Before transforming a parseable or malformed source payload, preserve its exact string under a founder-scoped backup key. A recommended deterministic key is:

```text
fitcoach-backup:v031:<founder>:<sourceFingerprint>
```

Store metadata separately or in a wrapper without altering the raw payload. Do not create a duplicate backup on every load for the same fingerprint. Never delete a backup automatically during v0.4.

### Transform steps

1. Read the current v0.4 key. If it validates at schema 4, return it; do not rerun migration.
2. Read the v0.3.1 source string and compute a stable fingerprint.
3. Preserve the exact source string before parsing or transformation.
4. Parse inside a guarded boundary. On malformed JSON, retain the backup, create a clean v0.4 envelope, disclose recovery in the UI, and provide founder-only export/reset options.
5. Merge profile defaults without replacing valid explicit values. Preserve onboarding, goal, experience, days, duration, equipment, blocker, tone, quiet hours, proactive preference, energy, and preferred days where valid.
6. Move units, Coach depth, and speech preference into validated settings/Coach presentation fields. Use Light for a founder with no prior v0.4 theme choice; do not infer Dark from the old all-dark UI.
7. Preserve chat, feedback, decisions, intervention outcomes, accepted plan notes, and last API metadata after shape validation. Do not treat model-authored legacy content as new authority.
8. Preserve only bounded, valid memories already accepted under the legacy contract. No migration step calls a model.
9. Convert sessions without changing ids. Deduplicate by stable id first; for id-less legacy records use a conservative composite fingerprint. Convert exercise names to known stable ids through an explicit alias map; unknown exercises receive a deterministic `legacy-*` id and a complete text snapshot rather than being dropped.
10. Convert exercise preferences through the same alias map. Unknown preferences remain recoverable, not silently applied to another movement.
11. Convert an active workout conservatively. Preserve set ids, weights, reps, and completion. Add exercise snapshots and stable ids. If `startedAt` is invalid, retain set data and mark the workout paused with a migration notice.
12. Legacy in-memory rest intervals cannot be recovered because no timestamp was stored. Initialize `restTimer.status` to `idle` and state this once; do not invent remaining rest.
13. Translate legacy pending plan proposals into versioned proposals only when their target and changes validate. Otherwise retain them as migration notes with no Apply control. Accepted notes remain historical text and do not mutate the current plan.
14. Write the fully validated v0.4 envelope, reread it, validate again, and only then mark migration complete.

### Idempotency rules

- A valid `fitcoach-v040:<founder>` envelope wins over legacy source data.
- Every migration step has a stable id in `migration.completedSteps`.
- Reprocessing the same source fingerprint yields the same ids and does not add sessions, chat messages, proposals, or memories twice.
- Failed migration never mutates the source or deletes the v0.4 value that last validated.
- Migration is pure and network-free. It never invokes Coach, speech, or service-worker APIs.

### Theme and Coach preference mappings

| v0.3.6 value | v0.4 destination | Rule |
| --- | --- | --- |
| no theme field | `theme.selection = "light"` | Light is the new-profile and migrated-profile default unless a v0.4 choice already exists |
| `settings.units` | `settings.units` | Accept only supported `lb` / `kg` values |
| `settings.coachMode` | `coachPresentation.responseDepth` | Map `fast`, `smart`, `deep`; default `smart` |
| `profile.tone` | `coachPresentation.tone` | Supportive, Direct, Strict, Competitive; unknown values become Direct without deleting the original backup |
| `settings.speakReplies` | `coachPresentation.speakReplies` | Preserve explicit boolean; typed replies remain independent |
| no voice persona | `coachPresentation.voicePersona` | Use a documented product default; do not claim a specific device voice exists |

## Rollback and recovery

### Code rollback

- The Git rollback point is the v0.3.6 base commit named above.
- Keep the old source in Git history; do not silently reconnect historical runtime files inside v0.4.
- Service-worker generation changes to `v0400`, so rollback requires restoring the v0.3.6 document, manifest, and service-worker graph together and publishing a new cache generation if a deployment had occurred.
- This feature branch must not be merged or deployed without explicit approval.

### Data rollback

- v0.4 never deletes or overwrites `fitcoach-v031:<founder>`.
- v0.3.6 can therefore reopen its pre-migration snapshot.
- Work logged after migration exists only in the v0.4 envelope unless the user exports it. This is intentional: automatic dual-write or down-migration would risk corrupting the legacy schema.
- Founder recovery tools may export the v0.4 envelope and exact source backup, reset only v0.4 after confirmation, or retry a failed migration from the preserved source.
- Reset must name the exact founder and keys affected and must not clear unrelated origin storage.

## Coach compatibility contract

The v0.4 Coach UI can change; its authority boundary cannot.

### Request

- Continue to call the existing v3 endpoint through a compatibility client.
- Keep provider keys server-side.
- Preserve `data_classification: "synthetic_low_sensitivity"` and the existing bounded enumeration/coded context rather than sending raw private profile records.
- Keep conversation history bounded and text-only.
- Run private/sensitive interception before fetch, and make intercepted input a zero-provider-call path.
- Preserve the deterministic `approved_action` calculated locally from the existing allowed action vocabulary.

### Response

- Treat `reply` as display copy only.
- Treat `safety_intercepted` as a non-overridable safety path.
- Preserve `approved_action` only as confirmation of the already-authorized deterministic action; never accept a model-selected action outside the local contract.
- Never consume model-authored memory writes, plan mutations, diagnoses, medication instructions, proactive-contact permission, or safety clearance.
- A timeout, malformed response, provider failure, or speech failure leaves plan and memory unchanged and exposes a text fallback/retry state.

Provider routing remains server-owned and unchanged by v0.4. UI labels must not claim a backup provider is live unless configuration and a real fallback test prove it. This redesign is not a provider migration.

## Voice-room compatibility contract

The target interaction is a persistent **foreground half-duplex** room built around the same text Coach adapter:

```text
consent -> starting -> listening -> finalizing -> thinking -> speaking -> cooldown
                               \-> safety stop
                    failures -> paused or retryable error
```

- Obtain microphone consent in context and explain device/browser speech processing.
- Use browser/device speech-to-text when supported. Do not instantiate `MediaRecorder`, encode audio, retain blobs, or call a transcription upload endpoint.
- Keep interim transcript ephemeral; commit only final text through the normal bounded text path.
- Append the final user transcript and text reply to the same conversation so both remain after leaving voice mode.
- Use device text-to-speech after the text reply is already visible. Mute, stop, replay, or speech failure never removes the text.
- Listening pauses during TTS. Manual interruption may cancel TTS and resume a new listen turn, but the browser build does not claim simultaneous full-duplex audio, robust semantic barge-in, background continuation, or premium neural voice parity.
- Pause when the page becomes hidden or support becomes unreliable. Do not promise lock-screen continuity.
- A safety interception ends automatic relistening and displays the deterministic safety response without speaking when the response contract disallows speech.

## PWA boundary

- `index.html`, its style/module references, and `sw.js` precache must agree exactly.
- Cache only same-origin FitCoach-owned shell and starter assets.
- Cache the local starter posters required for offline exercise recognition; lazy-load larger sequences/video.
- A media fetch failure renders a local fallback and cannot fail service-worker installation or application startup.
- Use a new cache identifier for v0.4 and delete only older FitCoach cache names, never broad origin caches.
- Network-first or stale-while-revalidate choices must not overwrite locally logged workout state; local state is not stored in Cache Storage.
- Theme tokens are CSS/data state, not separate stale assets.
- Update behavior must be explicit; do not reload while an unsaved in-memory action is pending.

## Testing gates for this boundary

Automated tests must cover:

- module parse and active HTML/service-worker graph parity;
- no retired script, provider, endpoint, `MediaRecorder`, raw-audio encoder, or transcription upload in the active graph;
- v0.3.6 Coach request/response and action vocabulary compatibility;
- provider-zero-call sensitive/safety interception;
- Light/Dark/System first-paint and persistence behavior;
- migration of complete, partial, malformed, repeated, and id-less v0.3.6 fixtures;
- exact source backup, migration idempotency, session deduplication, and stable exercise id mapping;
- active-workout set persistence, refresh recovery, timer timestamp recovery, completion atomicity, and duplicate prevention;
- plan proposal version checks, visible diff, approve, reject, and stale proposal refusal;
- exercise schema, local media existence, complete license manifest, and no competitor-domain hotlinks;
- Coach text success when TTS is absent or throws;
- voice state transitions without raw-audio paths;
- honest empty progress and metric calculations from known fixtures.

Manual browser testing must record emulation separately from a real device. Passing desktop mobile emulation at 390×844, 393×852, and 430×932 is not proof of real-iPhone, installed-PWA, background, microphone, TTS-voice, haptic, or offline behavior on iOS.

## Change discipline

- Keep v0.4 work on `agent/fitcoach-v040-full-redesign` and stop at a pushed branch plus draft pull request.
- Do not modify the API repository for this visual/data redesign.
- Do not merge or deploy merely because tests pass.
- Run the existing bundle integrity check, the v0.4 suite, `git diff --check`, a credential scan, and a final manual inspection of the loaded/precache graph.
- Record actual shell, JavaScript, CSS, and media bytes. Do not describe unmeasured performance or untested offline/phone behavior as complete.
