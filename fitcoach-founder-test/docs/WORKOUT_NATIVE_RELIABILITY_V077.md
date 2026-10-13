# Workout and native reliability — 0.7.7

This combined update extends the stable exercise controls in 0.7.6. It is a
review/build milestone, not a production or store-readiness claim.

## Workout guarantees and regression evidence

- Finish/End confirmations retain the reviewed session identity and durable
  content. Later sets, unfinished edits, notes, ordering or pause changes require
  a fresh review. Old confirmations cannot close a new workout after background
  data refresh. Refusals appear inside the dialog; late results do not close a
  newer dialog. Volatile scroll/navigation/rest changes do not invalidate review.
- Notes queue each captured input value, check the session and previous saved
  value, preserve peer changes, and keep a rejected draft visible. Completion
  ratings target the original saved session/receipt, not the newest session.
- Finishing while paused excludes the outstanding pause from active duration.
- Pause, countdown adjustment/Skip, previous/next and instructions retain the
  displayed intent. Persisted pause revisions and timer IDs prevent stale actions
  from applying to later transitions/countdowns, including identical deadlines.
- Legacy records keep stable empty identity defaults and their existing deadline.
  Eight seconds of paused rest remains eight seconds through reload and resume;
  the minimum for planned rest recommendations remains unchanged.
- Paused clocks remain frozen and the docked player reports pause correctly.
  Expiry checks the exact session/countdown, emits at most one cue, and removes
  only that timer UI. It does not rebuild unsaved inputs or restart media.

The two new workout suites contain 38 cases using the actual handlers and
coordinated local store. The full web suite passes 473 tests locally. Mobile
Chromium checks cover two-tab conflicts, reload/resume, countdown controls,
displayed navigation/instructions and saving a completed session. A separate
browser-clock expiry scenario preserves the same focused input, unsaved note,
peer's saved note and logged set. External providers are not part of these local
workout mutations. This is not cross-device cloud-sync or physical-phone proof.

## iOS first-boot correction and evidence boundary

Two hosted runs failed during the isolated simulator's first-boot migration at
the old 240-second bootstatus timeout, before any XCTest ran. Full application
compilation and packaged media inspection had passed. Those failures do not
establish whether the pending ad-hoc-signing/Keychain correction works.

The runner now prepares the reviewed iOS 26.2 runtime's dyld shared cache before
booting the newly created, owned simulator. Apple documents cache preparation as
a workaround for first-boot failures after a macOS upgrade. Applying it here is
an evidence-backed mitigation to test, not proof that this was the only cause.

- [Apple Xcode 26.1 release notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-26_1-release-notes)
- [Chromium's runtime-scoped cache preparation and boot-readiness implementation](https://chromium.googlesource.com/chromium/src/+/93b31d4424cb0fddb7cb5a901f21eb9859270658/ios/build/bots/scripts/iossim_util.py)

Cache preparation, boot request and readiness have separate bounded budgets of
180, 60 and 480 seconds. Events record start, elapsed time, success/failure and
failure text in runner-local boot-events.jsonl and job output. Both bootstatus
success and the exact owned device's Booted inventory state are required. The
workflow's 45-minute overall budget includes setup/build, startup, the existing
15-minute XCTest bound and cleanup. It stays on the same standard hosted runner.

No personal machine, alternate runtime, SDK installation, broad cache update,
device wipe, account signing, provisioning or test retry is introduced. Ownership
is rechecked between stages and before cleanup. A cleanup error cannot hide the
original boot/test error. All four exact installed-app tests and signature,
entitlement, secure-storage and packaged-media assertions remain mandatory.

Eight new startup orchestration cases exercise success, failure, timeout,
ownership changes, active-device refusal and readiness checks with injected
command results. They are not real simulator execution. Hosted execution of the
combined source is still required before claiming iOS runtime success.

## Release boundaries

Web version 0.7.7 uses shell generation 0707; media generation 0701 is unchanged.
Native package metadata remains separate. No production provider configuration,
account activation, subscription, store signing, submission or deployment is
included. Physical audio routing, health/purchase flows, production account and
nutrition providers, privacy/store review and qualified media review remain
separate release requirements.
