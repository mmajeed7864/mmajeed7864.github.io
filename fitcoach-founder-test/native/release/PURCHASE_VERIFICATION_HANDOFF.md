# Purchase verification handoff

Status: contract drafted; production verifier credentials are not configured. No client path may unlock premium while `purchaseVerificationBackendLive` is false.

## Authority boundary

The authenticated account entitlement stored by the FitCoach backend is the only source of truth. StoreKit and Play Billing payloads, local storage, UI state, and native events are not entitlement proof. `subscriptionEntitlementChanged` is an advisory signal to refresh the account; it must never unlock premium by itself.

The backend route is `POST /api/fitcoach-subscriptions-v1`. It requires the current Supabase bearer token plus the backend's origin and build gates.

Supported request fields:

- `operation`: `verify`, `restore`, or `reconcile`
- `platform`: `apple` or `google`
- `product_id`: the store product identifier
- Apple: `transaction_id`
- Google: `purchase_token`

The production backend must validate the authenticated user, product allowlist, bundle/package identity, environment, store signature/token, purchase state, expiry, cancellation/refund/revocation state, and replay/idempotency before persisting an entitlement. It must also match Apple's `appAccountToken` or Google's obfuscated account identifier to the authenticated FitCoach account binding created at checkout. A response marked `setup_required`, `pending`, `deferred`, `cancelled`, `expired`, `revoked`, `unverified`, or `error` never unlocks.

## Native completion

1. Native purchase or restore emits `subscriptionTransactionAvailable` with `serverVerified:false` and `entitled:false`.
2. The web account client sends the store payload to the route above.
3. The backend verifies it, stores the account entitlement, and returns a non-secret `verification_id` suitable for audit correlation.
4. For Apple, the backend finishes the verified transaction through App Store Server API. Native will not trust a JavaScript boolean or opaque correlation ID to call `Transaction.finish()`.
5. For Google, the backend performs acknowledgement after verification. Native completion succeeds only after Play Billing reports the purchase as already acknowledged; it cannot acknowledge a purchase itself.
6. The web client calls `completeVerifiedPurchase` only to reconcile the transaction's store state, then refreshes the authenticated account. Only that account-entitlement response can enable premium.

The `serverVerified` boolean and `verification_id` are integration correlation values, not cryptographic proof. They are intentionally insufficient to finish an Apple transaction or grant local entitlement. If Apple still reports a transaction as unfinished, native returns `APP_STORE_SERVER_FINISH_PENDING`; if Google has not acknowledged it, native returns `PLAY_PURCHASE_NOT_ACKNOWLEDGED_BY_BACKEND`.

## Required backend work before release

- Configure reviewed App Store Server API and Google Play Developer API credentials without exposing them to the client.
- Verify signed Apple transactions and Google purchase tokens in production and sandbox/test environments separately.
- Configure App Store Server Notifications V2 and Google Real-time Developer Notifications.
- Make verification, Apple transaction finish, Google acknowledgement, restore, refund/revocation, and webhook processing idempotent.
- Reconcile entitlement on login, app foreground, purchase completion, restore, and webhook updates.
- Return stable error states that the UI can explain without pretending a purchase succeeded.
- Add integration tests for pending, Ask to Buy/deferred, grace, hold, expiry, cancellation, refund, revocation, replay, wrong account, wrong product, wrong environment, and second-device restore.
- Verify account binding: Apple receives the authenticated account UUID as `appAccountToken`; Google receives only its lowercase SHA-256 hash through `setObfuscatedAccountId`. Never log or expose either value as entitlement proof.
