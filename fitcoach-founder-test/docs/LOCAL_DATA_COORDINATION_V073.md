# Local data coordination — FitCoach 0.7.3

## Problem and behavior

The original browser store kept an independent whole-state snapshot per tab. A
food save could overwrite a workout saved by another tab, even though both saves
individually succeeded. `localStorage` does not provide a read/modify/write lock
across tabs ([HTML storage standard](https://html.spec.whatwg.org/multipage/webstorage.html)).

The production app now uses `createCoordinatedFitCoachStore`. Every load, mutation,
export, whole-copy replacement and reset obtains the same short origin-wide
[Web Lock](https://w3c.github.io/web-locks/). Mutations reread durable state inside
that lock before applying their synchronous edit. The lock is never held over a
provider request, user input or media operation. Waiting has a five-second bound;
an aborted queued operation cannot run later. There is no time-based lease,
lock stealing, unlocked fallback or automatic save retry.

- Unrelated food, water, settings and workout changes accumulate in the latest copy.
- A stale action cannot mutate a different active workout. Completing a workout
  operates on the latest copy, not an obsolete whole-state replacement.
- Whole-copy cloud restoration requires the exact expected local baseline inside
  the lock. Cloud acknowledgement compares the latest content inside its metadata
  transaction; another tab's newer edits remain pending, not falsely synced.
- A reset epoch is created on first coordinated load, changed before deletion and
  preserved during deletion. Old and already-queued operations fail after reset.
  An older tab stops runtime effects, hides its old view and asks for a reload.
- Ordinary storage-change notices do not replace the active form or restart media.
  They occupy normal document flow, behind any active dialog, with an explicit
  reload button. They do not discard an unfinished entry automatically.
- Click dispatch starts immediately to preserve the audio user gesture, while
  duplicate pending actions are ignored. Save errors unlock controls without retry.
- Unsupported locking or unavailable storage has a visible recovery screen and a
  local saved-copy download. It must not present an unsafe unlocked app as usable.

The synchronous pure store remains available for domain fixtures and migration;
production app mutations await the coordinated wrapper. Existing source-executing
tests now await production handlers rather than stripping their `async` boundary.

## Verification on 8 September 2026

- 12 additional tests cover concurrent food/water saves, preferences/favorites,
  stale restore/workout actions, deletion, duplicate completion, synchronous-only
  mutations, queued timeout, unsupported locking, failed durable writes, cloud
  acknowledgement races, and real click-dispatch duplicate/error/gesture behavior.
- Full web suite: 402 passed. Native contract suite: 10 passed. Bundle integrity
  resolves and syntax-checks 45 modules, including the precached coordinated store.
- Isolated Chrome session with actual `navigator.locks` and shared `localStorage`:
  an unfinished custom-food form survived a workout set save in the other tab;
  saving that meal retained the completed 45-weight/8-rep set. Completing the
  workout retained the meal and produced exactly one session.
- Reset in one tab stopped the second tab, hid its previous view, rejected an old
  store mutation with `local_reset_detected`, and left no old meal in durable state.
- Visual verification found clipped custom-food fields at 390px. Scoped min-width
  and grid constraints corrected them; every food input/button then fit at both
  390px and 320px. Browser error output was empty at the checked checkpoints.
- During local development an old service-worker shell retained a pre-fix stylesheet;
  the isolated test cache was cleared and the actual new stylesheet rechecked.
  Shell generation is 0703; unchanged exercise media cache remains 0701.

## Boundaries

This is same-origin, same-browser local coordination, not a database or two-device
sync test. All simultaneous tabs must run the coordinated version: an old build
that writes without the lock cannot be made cooperative by a new tab. Reload all
open FitCoach tabs after upgrading. Concurrent edits to the same field are still
last-completed-edit wins; there is no collaborative field-level conflict editor.

The browser scenarios used synthetic local data, no real account or nutrition
provider. They do not prove Safari, native WKWebView/Android, background suspension,
physical-device audio, database encryption/CAS or store readiness. Native Web Locks
availability and recovery must be verified on supported devices before activation.
No production account capability, paid service or store publication was enabled.

Local evidence screenshots and logs are kept in the development operational folder,
not committed as user data. The source changes remain in the existing draft PR16.
