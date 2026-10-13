# Mobile backup reliability — 12 October 2026

This is an October development-branch improvement to the existing 0.8.0 encrypted-backup feature. Every prior product feature and exercise asset is retained. It is not a deployment, signed package, store submission or physical-phone result.

## Behavior

- Native builds with both file methods use the iOS Files export/import interfaces or Android system document picker. The iOS save result comes from the export picker, so completing a clipboard/print activity cannot masquerade as a saved backup. The ordinary browser file/download flow remains available when the bridge is absent.
- The client and native implementations bound files to 12 MiB, validate safe `.fitcoach` names and reject failures instead of reporting a saved file. iOS declares the custom JSON-based backup type so Files can identify it; Android uses document-provider access without broad storage permissions.
- Reads are bounded while streaming. iOS file reads and Android document I/O run away from the UI thread. Invalid UTF-8 fails before the encrypted envelope is inspected.
- Each create/select/unlock/restore operation is tied to the exact open dialog. Closing/replacing it makes a late callback inert. A queued restore checks that identity again inside the origin-wide storage lock, alongside the existing expected-state comparison.
- Passphrase inputs remain in the current form through progress/error/cancellation updates and are cleared when the dialog closes or a new dialog opens. They do not enter persisted app state, logs or account sync.
- Competing file controls are disabled while busy, busy copy describes the current operation, and the native picker uses the same full-width, focus-visible mobile styling as the browser control.
- Readable JSON export has its own `saveDataExport` bridge capability, validates safe `.json` names, JSON-object contents and UTF-8 byte bounds, and uses the same serialized document-save machinery. Its unencrypted warning remains visible. An older native build without that method presents an update message rather than claiming a WebView download saved a file; the ordinary browser still produces a real download.
- Readable export completion is also tied to the exact dialog, preserves current fields through cancellation/failure, never writes the passphrase into its contents, and reports a native save only after an explicit success result. iOS delegate callbacks must match the exact active picker so a stale controller cannot affect a newer document request.

## Fresh evidence

- 499 web tests passed, no skips. Includes native-client success/cancel/invalid-result/UTF-8-byte-bound behavior for both formats and retained web/modal contracts.
- 70 native source/project tests passed, no skips, after reusing the identical pinned dependency lock and Capacitor 8.5.1 template. This is not native OS compilation.
- The 46-module/PWA/media bundle integrity check passed; JavaScript syntax, Swift parsing, plist lint and whitespace checks passed.
- A real isolated Chromium page with a synthetic delayed bridge passed 13 scenarios. These cover the original seven encrypted-backup cases plus readable native cancellation/form preservation, stale readable-save completion, native save failure, explicit native success, older-native capability failure and a real ordinary-browser JSON download. Two mobile modal audits passed with zero diagnostics. The fixture does not execute native OS picker code.
- Earlier checkpoint `68be5e9` passed a full Chromium mobile audit: 84 states at 320/390/430 CSS-pixel widths in light/dark themes, covering all six routes and relevant dialogs; zero errors, missing assets, overflow/accessibility hard failures or undersized enabled targets. The later readable-export addition is covered by the 13-scenario flow and two modal audits above; do not describe the full 84-state matrix as rerun on that addition.
- Full WebKit mobile audit: the same 84 states passed with zero diagnostics, missing assets, hard failures or undersized targets. WebKit uses a local HTTPS fixture to keep the application's existing `upgrade-insecure-requests` CSP intact. The initial HTTP preview was blank because WebKit upgraded its asset URLs to HTTPS. Certificate acceptance is confined to the generated loopback fixture; external requests are blocked and OS/browser trust settings are unchanged. These desktop-engine viewport checks do not prove physical iPhone behavior.

Operational reports and harnesses live outside the source repository under `/Users/mohammed/.codex/artifacts/fitcoach-mohammed/`, including `qa-native-data-export-final-20261012/report.json`, `qa-web-data-export-20261012.tap`, `qa-native-data-export-20261012.tap`, `qa-mobile-chromium-20261012/report.json`, and `qa-mobile-webkit-20261012/report.json`.

Both installed-app runtime suites now require five exact tests instead of four. The additional test invokes the real native bridge and requires seven invalid readable/private document requests to reject before a picker opens. This is an executable acceptance test, not proof it has run; require the new hosted result before claiming native runtime coverage.

## Remaining release checks

Compile the changed full iOS and Android bridges and run the expanded installed-app suites, then verify real Files/document-provider success, cancellation, provider failures, lock/background return and oversized-file behavior for both export formats. Physical-device keyboard/safe-area tests remain required. Test cloud/account/provider/native authority independently after configuration. The interactive 3D direction is separate planned work and has no production-approved scene yet.

Platform references: [Apple document export initializer](https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller/init(forexporting:ascopy:)) and [Android user-selected document access](https://developer.android.com/training/data-storage/shared/documents-files).
