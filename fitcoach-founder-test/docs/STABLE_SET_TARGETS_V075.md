# Stable workout-set editing — 0.7.5

## Reproduced defect

Set controls previously identified the exercise and set only by their array
positions. A second tab could reorder the same workout while the first tab still
displayed the old order. The origin-wide save lock prevented overlapping writes,
but did not preserve which set the user actually meant to edit.

The actual two-tab mobile browser reproduction entered 77 in the displayed
Barbell Back Squat weight field. After the other tab moved that exercise down,
the old implementation saved 77 to Back Extension instead and left the squat at
0. A regression executing the real application handler also failed before the fix.

## Change

- Weight, reps, RPE and completion controls carry the rendered workout, exercise
  and set IDs. The handler captures those IDs before waiting for the save lock.
- The existing coordinated mutation resolves exactly one matching set against
  the latest durable workout. Missing, replaced, ambiguous or retired identities
  fail without an index fallback or write to another set.
- The current workout status is checked inside that mutation. A pause in another
  tab rejects edits even if this tab still has enabled inputs. A persistent
  recovery notice and immediate toast explicitly say the change was not saved;
  the unsaved field remains visible rather than being silently discarded.
- Completion uses the button's displayed complete/undo intent. Two stale
  complete buttons cannot undo each other or reset the first completion receipt
  and rest timer. Existing rep validation, units and explicit undo remain.
- The shell generation is 0705 and app version 0.7.5. Media and the 0701 media
  cache are unchanged. No schema or account/provider changes.

## Verification

Ten regression tests execute the real application handlers with actual
coordinated stores, exercise data and renderer. Coverage includes exercise/set
reordering, a non-rendering store refresh, replacement workouts and exercises,
missing/duplicate IDs, paused edits, duplicate completion, undo, zero reps and
the persistent unsaved-change notice.

The mobile Chromium scenario uses fresh synthetic adult onboarding, actual
Start workout, two real browser tabs, Move down, weight input, completion and
pause controls. With the fix, the squat retains 77, the unrelated exercise is
unchanged, duplicate completion preserves its timestamp, and the rejected
paused edit to 88 leaves the saved value at 77. No page exceptions, local 404s
or horizontal overflow were observed at 390 by 844. External requests are
blocked and the isolated browser and local server are closed afterward.

This is browser evidence, not physical-device certification. The complete web
suite, native/build code contracts, module graph and current-generation PWA
checks are run separately before publication of this draft change.

## Boundaries

This fixes set-field and completion targeting. It does not establish that every
other same-workout action is safe across tabs: add-set, replacement selection,
reordering, pause/resume and workout notes still need their own intent audits.
Native packaging and installed-device checks for the new source must pass
separately. No production deployment, store submission or new provider activation
is part of this change.
