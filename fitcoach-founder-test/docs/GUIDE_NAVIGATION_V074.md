# Responsive exercise-guide navigation — 0.7.4

## User-visible behavior

Opening an exercise is a read-only action. Its guide appears immediately, while
recently viewed history saves separately through the existing coordinated store.
Another tab finishing a save, a full device or a failed history save must not
prevent someone from reading the guide or using its video controls.

The guide still checks the current data-reset epoch before rendering. A reset
detected while saving invokes the existing blocking privacy notice. This does not
relax workout, nutrition, account, sync or deletion mutation safeguards.

## Persistence boundaries

- At most one history write per opening, using the existing five-second lock
  deadline. No automatic retry, lock stealing or optimistic durable-save claim.
- An acknowledgement does not render again, navigate back, scroll or restart media.
- Read the current store after saving, not the delayed acknowledgement snapshot.
  Ignore acknowledgements from an old store after a local partition changes.
- A history-specific failure notice appears only while its guide is still open.
  Leaving the guide suppresses that nonessential notice, but not reset protection.
- Trainer-driven guide navigation resolves immediately rather than waiting for
  history persistence. No new coach powers or model-authored action authority.

## Evidence and limits

Six source-executing regression tests cover immediate render/completion, pending
and rejected saves, late navigation/partition changes, resets and invalid IDs.
The pending-save regression failed on the earlier code before the fix.

A fresh Chromium session at 390 × 844 completed real adult onboarding and used
two same-origin pages with the actual Web Locks API. Before: another page held
the lock and the guide never opened, ending in a generic save error. After: the
guide appeared while the lock remained held; the shipped play control presented
three decoded frames, pause worked, the history timeout left the guide usable,
and Back then Today navigation succeeded. No horizontal overflow, page exceptions
or missing local resources were observed. A test-selector correction was needed
to use the detail screen's Back button before accessing the hidden bottom nav.
The session used synthetic local data; remote requests were blocked. This is not
native/physical-device or production-provider evidence.

The app shell generation advances to 0704; unchanged exercise-media caching stays
separate. Existing service-worker/cache tests and the complete module-graph check
must pass. Native packaging and installed-device checks are separate gates: older
0.7.3 artifacts are not evidence for the modified 0.7.4 source.

The independently observed Android runtime navigation timeout has not been
causally linked to this save-lock defect. A later Android run passed unchanged
production source. Keep the native diagnostic and verification gates intact;
do not describe this fix as resolution of that intermittent failure without proof.
