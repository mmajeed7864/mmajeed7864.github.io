# FitCoach 0.7.2 — acknowledged-content sync

Engineering checkpoint, 8 September 2026. This change does not enable production accounts,
configure a database, or claim App Store / Google Play readiness.

## Why this changed

Timestamp comparisons cannot prove which edits a server saved. A local change during a
request, a same-timestamp edit, or clock skew could previously make unsaved content appear
acknowledged. The client now records a SHA-256 digest of the exact allowed projection sent
in the acknowledged request. Root update timestamps and sync bookkeeping are not content.
Local chat, memory, progress-photo drafts, and other existing excluded fields stay local.

The digest and pseudonymous account scope are local bookkeeping, excluded from cloud
payloads. Legacy clock-only markers are conservatively treated as unacknowledged. Switching
accounts cannot reuse another account's revision, consent marker, or conflict choice.

## Recovery contract

- One explicit sync at a time; no automatic PUT, deletion, or purchase-verification replay.
- Every sync reads the current server revision first. If both copies changed, neither is
  silently overwritten. An explicit cloud/device choice rechecks the viewed revision.
- If a response was lost after the server committed a PUT, matching remote content acknowledges
  that existing save without repeating the write. A concurrent newer edit stays pending.
- `Retry-After` seconds and HTTP dates are honored with positive bounded jitter. Repeated taps
  during the operation cooldown make no request. Missing headers use bounded backoff.
- Requests have a 15-second timeout covering headers and the response body. Temporary failures
  keep sign-in and local workout data, with actionable retry copy.
- Cancellation, sign-out, identity changes and local partition changes invalidate late results.
  Refresh is single-flight, protected session writes are serialized, and a late old refresh
  cannot recreate a signed-out session or replace a newly verified account.
- If secure session erasure fails, sign-out reports the failure and restores usable controls;
  it does not claim secure erasure or reset unrelated local data.
- Shell cache generation advances to 0702; unchanged exercise media retains its 0701 cache.

## Verification and its limits

The focused recovery suite exercises the real store, sync projection, account client and
coordinator with synthetic transport responses. It covers timestamps, changes in flight,
lost acknowledgements, conflicts, cancellation, account changes, retry cooldowns, response
timeouts and session races. The local run passed 390 web tests (17 new recovery tests),
10 native contract tests, and the bundle/module/precache check. The native readiness report
has 12/12 source gates but 0/30 external gates confirmed. These source/native contract checks
are not device execution. Re-run all checks against the final review commit.

The isolated local mobile browser check used a synthetic account and an explicitly mocked
service, not real Supabase credentials or a production database. Profile -> consent -> sync
429 -> repeat-tap cooldown -> successful sync produced a single acknowledged mock revision.
Light 390px and dark 375px layouts had no horizontal overflow. After scoped contrast fixes,
the Account & sync panel had zero axe violations in either theme. Navigation to Today and
browser error checks are separate from database or native-device proof.

Still required before account activation: real staging auth/consent/CAS sync, encrypted
database inspection, export/deletion, distributed API limiter/expiry checks, offline/reconnect
and conflicting edits across two physical devices. Multi-tab coordination and reinstall
recovery also need real-browser validation. Do not activate services, subscriptions or store
release based only on mocked transport or structural native tests.

## Reproduction

```sh
node --test --test-concurrency=1 fitcoach-founder-test/tests/*.test.mjs
node fitcoach-founder-test/tests/check-bundle.js
node --test --test-concurrency=1 fitcoach-founder-test/native/tests/*.test.mjs
node fitcoach-founder-test/native/scripts/release-readiness.mjs
```

The native readiness script deliberately reports external gates separately. A zero exit in
non-strict mode means source gates passed, not that external/device/store gates passed.
