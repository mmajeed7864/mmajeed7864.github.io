# Private backup and authenticated restore — 0.8.0

FitCoach 0.8.0 adds an optional local encrypted backup alongside the existing
readable JSON export. This is a device-data portability milestone, not proof of
production account sync, database provisioning, native sharing, or store
publication.

## User journey

Profile → Help and local data → Private backup & restore opens one focused
sheet. A person can:

1. create a passphrase of 12–128 characters;
2. download an encrypted `.fitcoach` backup;
3. choose an existing backup and unlock it locally;
4. review its creation time, originating app version and content counts; and
5. explicitly replace the current device copy.

A separate, clearly warned JSON export remains available for human-readable
data portability. FitCoach never silently uploads either export.

## Cryptographic boundary

- Web Crypto performs PBKDF2-HMAC-SHA-256 with 310,000 iterations and a fresh
  128-bit salt for every backup.
- AES-256-GCM uses a fresh 96-bit IV. The format version, app build, timestamp
  and KDF iteration count are authenticated as additional data.
- The passphrase is never stored in app state, local storage, account sync,
  logs, markup, or the backup. FitCoach cannot recover a forgotten passphrase.
- Malformed envelopes, KDF downgrades, oversized files, wrong passphrases,
  changed metadata, changed ciphertext and invalid FitCoach state fail closed.
- Plaintext state is limited to 8 MiB and the backup file to 12 MiB before
  expensive processing.

This protects a backup file at rest against casual disclosure and detects
tampering. It does not protect an unlocked device, a malicious browser/OS, a
weak or reused passphrase, screenshots, or a readable JSON export.

## Restore boundary

Decrypted contents remain only in memory while the review sheet is open. The
restore uses the coordinated origin-wide data lock and the exact device state
observed at review time. If another tab changes FitCoach before confirmation,
the replacement is refused and current data remains intact.

Cloud-sync revision/consent metadata, HealthKit or Health Connect state, and
store-payment authority never transfer from a backup. They return to local or
unconfigured states; authenticated server entitlements and native permissions
must be refreshed through their real platform authorities.

## Required verification

- Cryptographic round trip including UTF-8 data.
- Wrong-passphrase, ciphertext-tamper, authenticated-metadata-tamper, malformed
  envelope, KDF-downgrade and weak-passphrase rejection.
- Rendered create, unlock and destructive restore-review states.
- 320, 390 and 430 CSS-pixel mobile checks in light and dark themes.
- Full web regression, module/PWA integrity, native contract regression and
  immutable native bundle verification.

Physical-device Files/Share-sheet behavior and restore from files created by a
released build remain external device gates until recorded on supported iPhone
and Android hardware.
