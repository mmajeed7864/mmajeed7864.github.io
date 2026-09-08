# Plan-start and iPhone runtime reliability — 0.7.8

This combined milestone protects the moment a reviewed plan becomes an active
workout and corrects the account-free iPhone simulator evidence check. It is a
review/build milestone, not a production deployment or App Store claim.

## Exact workout-start intent

Every rendered start control now carries the durable identity of the plan it
describes. The coordinated local-store mutation validates that identity again
at commit time:

- Plan A, Plan B and Minimum starts require the exact active plan version and a
  supported plan ID.
- Schedule starts require the exact regenerated slot plan version.
- Saved routines require their routine ID, plan version and saved-at receipt.
- An already-started workout always wins. A second tab resumes the saved session
  and cannot replace its exercises, notes, set progress or timers.
- A delayed save opens the workout only if the user is still on the view that
  requested it; later navigation is not reversed.

When a displayed plan becomes stale, FitCoach refreshes the latest durable
state, starts nothing and asks the user to review the current version. The
12-case regression suite exercises the domain rules, actual application
handlers, two-view conflicts and rendered identity attributes.

## Proposal conflict protection

Plan previews now retain their base plan and the pending proposal they observed.
A delayed preview cannot replace a proposal created in another tab. Approval and
rejection require the exact current pending proposal, and activation requires
the candidate's base version to remain current. A stale dialog stays visible
with a truthful error instead of reporting success or closing a newer dialog.

## Account-free iPhone simulator evidence

Hosted iPhone execution proved that first boot now completes and all four exact
installed-app tests pass: packaged artwork, native bridge launch, motion
play/pause/resume/loop, and secure-session reload/clear. The job then failed only
because its post-test verifier expected an application identifier inside the
embedded entitlement plist.

The actual ad-hoc simulator product reported the reviewed bundle identifier,
ad-hoc signing, no team, no signing authority, no provisioning profile and an
empty embedded entitlement dictionary. The secure-session XCTest passed against
that same installed product. The verifier now requires that exact account-free
shape: the bundle identity must come from the code-signature details and any
embedded entitlement, including HealthKit, application groups, Keychain groups
or a team identifier, fails the simulator check.

This correction does not prove or change production signing. Store identifiers,
provisioning, production HealthKit entitlements and device execution remain
separate release gates.

## Verification and release boundary

The local verification target is 485 web tests, 69 native code tests, complete
module-graph/syntax checks, bundle integrity and mobile browser conflict flows.
Hosted Android and iPhone jobs must pass again on the exact published commit
before this milestone is called green.

Web version 0.7.8 uses shell generation 0708; media generation 0701 is unchanged.
No production provider configuration, account activation, subscription, store
signing, submission, physical-device claim or live deployment is included.
