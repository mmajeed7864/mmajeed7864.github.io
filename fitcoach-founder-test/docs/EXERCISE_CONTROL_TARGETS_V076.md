# Stable exercise controls — 0.7.6

## Reproduced defect

In two real mobile-width browser tabs sharing one active workout, the second
tab advanced from Barbell Back Squat to Back Extension. Clicking Add set on
the still-displayed squat in the first tab added a fourth set to Back Extension
instead. The existing save lock serialized the writes but could not identify
the exercise the user meant. The regression test failed before this fix.

Swap selection/confirmation and exercise reordering also used mutable indices.
The old swap handler reported success even when newly completed sets caused the
domain function to decline replacement. Its review omitted the original name.

## Change

- Add set, Swap exercise and Move up/down carry the rendered workout ID,
  library exercise ID and an existing set ID as an exercise-instance anchor.
  Repeated occurrences of the same exercise remain distinguishable; replacement
  generates new set IDs, making obsolete controls fail safely.
- Handlers capture intent before awaiting the coordinated store. Mutations
  resolve that identity against the latest workout under its existing save lock.
  They never fall back to an old index or the other tab's current exercise.
- Add set preserves units, target reps and the 20-set limit. Pause, missing
  targets and retired workouts reject the change; the limit has explicit feedback.
- Reorder also validates the displayed neighbor. Repeated stale Move down cannot
  skip across another exercise. Existing paused reordering remains available.
- The replacement review names both exercises and retains the original identity
  through selection, confirmation and concurrent reorder. Completed sets and a
  newer pause/replacement prevent the mutation, with no false success toast.
- Refusals appear inside the open review dialog with an accessible alert, not
  only behind its backdrop. Late completion cannot close a newer, unrelated modal.
- Version 0.7.6 and shell generation 0706 agree across all entry points. The 0701
  media cache and exercise media are unchanged. No data schema/provider change.

## Verification

- 17 new regressions execute actual application handlers, coordinated stores,
  library data and rendered controls. Includes stale/duplicate identities,
  reorder adjacency, limits, pause, replacement, completed sets, candidate
  confirmation, delayed saves and refusal messages.
- Complete local web suite: **435 passed, zero failures/skips**.
- Native/build code contracts: **61 passed, zero failures/skips**. These are not
  installed-platform or physical-device results for this revision.
- Module graph, syntax, PWA/cache agreement and whitespace checks pass.
- Fresh adult onboarding and two Chromium tabs at 390×844 reproduce the failure
  before the change and verify the correct fourth set afterward. Real controls
  also verify Move down/up, the named swap review, refusal after a peer logs a
  set, explicit undo, peer reorder and successful replacement of the original
  exercise. Its four sets remain attached to the replacement, with no changes
  to the unrelated movement. Dialog screenshots were visually reviewed; the
  initially obscured refusal was corrected and the visible alert reverified.
- No page exceptions, local 404s or horizontal overflow in that scenario. All
  network requests stayed on the isolated local preview; no external API was
  used or simulated as a real provider. Browser/server close after the run.

## Boundaries

This extends the set-field/completion fixes in 0.7.5. It does not certify every
workout intent: pause/resume, rest controls, navigation, notes, finish/end and
plan-level changes require their own cross-tab audit. The new native build must
pass separate installed-app checks; physical devices, staging accounts/sync and
store release remain unverified. This draft does not deploy or activate services.
