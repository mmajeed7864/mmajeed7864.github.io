# Reproducible iOS development project

The iOS reference files are integrated into a new, real Capacitor Swift Package
Manager Xcode project. The existing `ios/` source is preserved. This preparer does
not install Xcode, accept Apple terms, choose an Apple account, provision a device,
sign, archive, upload or publish anything.

## Prepare and inspect

Use Node 22+, the committed npm dependencies, and a verified lossless web bundle
from [WEB_BUNDLE.md](WEB_BUNDLE.md). With the source dependency installation retained:

```sh
npm ci --ignore-scripts
node scripts/prepare-ios-project.mjs --web-bundle /absolute/verified/web-bundle --out /absolute/new/ios-workspace
FITCOACH_TEST_IOS_PROJECT=/absolute/new/ios-workspace node --test tests/integration/ios-project.test.mjs
```

The integration-test command requires macOS's real property-list parser. Missing tooling or
missing generated output fails rather than skipping. These tests inspect actual
Xcode build-target membership, permission/privacy property lists and every copied
app/media byte; they do not compile Swift or prove simulator launch.

## Guarantees and boundaries

- Only the existing `com.symbio.fitcoach.dev` identity and `FitCoach Dev` display
  name, local `capacitor://localhost` origin and nested app launch path are used.
  Remote launch/navigation, release configuration, unreviewed platform paths and
  signing options are rejected.
- Pins installed CLI/core/iOS to the existing lockfile's 8.5.1 and checks the exact
  official SPM template bytes. Uses `cap add ios --packagemanager SPM`; verifies the
  CLI-generated package dependency is exactly Capacitor 8.5.1, not a floating range.
- The generated App target explicitly compiles AppDelegate, SceneDelegate,
  FitCoachBridgeViewController and FitCoachNativePlugin. The main storyboard uses
  the custom controller; its local plugin instance registration is preserved.
- PrivacyInfo.xcprivacy is a build resource. Existing read-only HealthKit, speech,
  Keychain and StoreKit boundaries remain intact. No background capture/health or
  new write permission is added. Entitlements are copied, not activated on an
  Apple developer account. Final SDK privacy reports still require review.
- Sets the existing iOS 17 minimum, web app marketing version and development build
  number 1. **Signing is disabled and supported platform is simulator only.** This
  is a compile/QA project, not a store candidate or a substitute for signed-device
  testing. Production identity and monotonic release-build policy remain separate.
- Copies the approved existing icons, all 100 posters, all 59 active videos, fonts
  and license files. Every verified web payload must survive byte-for-byte. The
  single dependency-directory link is build-only and is not packaged in the app.
- Refuses existing/overlapping output or linked source paths; no original files or
  earlier projects are deleted. Input hashes and generated project/package hashes
  are recorded in `fitcoach-ios-inputs.json`. This is traceability, not approval.

## Next verification

With full Xcode 26+ already configured, compile the actual generated project, not
the reference folder:

```sh
xcodebuild -project /absolute/new/ios-workspace/ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /absolute/new/derived-data -jobs 2 CODE_SIGNING_ALLOWED=NO build
```

Inspect the resolved Swift package revision and built bundle/permissions/media,
then test launch, native storage, navigation and playback in an isolated simulator.
No compile or runtime pass is implied by preparation. Afterwards, real signing,
physical iPhone audio/AirPods/calls/health/camera tests, store sandbox transactions,
privacy reports and store submission remain required. Preserve every existing
release gate in [ios/RELEASE_SETTINGS.md](ios/RELEASE_SETTINGS.md).

The iOS development workflow performs the full build on GitHub's standard public
`macos-15-intel` runner using its preinstalled Xcode 26.3. It never installs Xcode or
accepts new terms on Mohammed's Mac. No paid/larger runner, signing, simulator launch,
artifact upload or store API is used. After compilation, `verify-ios-app.mjs` checks
the actual Mach-O executable's simulator platform and SDK, built identity/permissions,
privacy resource, every web payload and the resolved official Capacitor 8.5.1 commit.
Compiled inspection fails if source folders or placeholder files are passed as an app.
Both single-architecture and universal executables are inspected. Every x86_64/arm64
member must be an iOS Simulator executable with the required deployment minimum and
SDK; malformed, overlapping, duplicate or contradictory architecture entries fail.
Unit fixtures test the parser, not app launch or execution on either architecture.

References: [Capacitor iOS requirements](https://capacitorjs.com/docs/ios),
[Swift Package Manager integration](https://capacitorjs.com/docs/ios/spm), and the
locked installed Capacitor 8.5.1 template and CLI implementation. Executable parsing
uses Apple's [universal-container layout](https://github.com/apple-oss-distributions/cctools/blob/main/include/mach-o/fat.h)
and [Mach-O load-command definitions](https://github.com/apple-oss-distributions/xnu/blob/main/EXTERNAL_HEADERS/mach-o/loader.h).
