# Reproducible Android development project

The reference Kotlin files were not a buildable application on their own. The
preparer now uses the locked Capacitor 8.5.1 CLI/template to create a real Gradle
project, then integrates the FitCoach-owned launcher, bridge, resources and icons.
The original `android/` reference directory is never removed or replaced.

## Prepare and compile

With Node 22+, the committed npm dependencies and the lossless media build tools:

```sh
npm ci --ignore-scripts
node scripts/prepare-android-project.mjs --web-bundle /absolute/verified/web-bundle --out /absolute/new/android-workspace
FITCOACH_TEST_ANDROID_PROJECT=/absolute/new/android-workspace node --test tests/integration/android-project.test.mjs
```

The web bundle must first pass `web:build` / `web:verify` as described in
[WEB_BUNDLE.md](WEB_BUNDLE.md). Preparation independently verifies it again and
checks that Capacitor copied every payload byte unchanged. It does not build a
placeholder shell or redirect to the public website. All 100 exercise posters,
59 active videos, legal pages, anatomy and fonts remain local.

On a machine with JDK 21 and Android SDK 36 already configured, enter the generated
`android/` directory and run:

```sh
./gradlew --no-daemon --max-workers=2 -Dorg.gradle.jvmargs=-Xmx2g -Pkotlin.compiler.execution.strategy=in-process :app:assembleDebug :app:lintDebug
```

The existing GitHub integrity workflow runs the same generation, integration tests
and real compilation on a standard Ubuntu runner. It does not upload the APK,
cache large build artifacts, use signing credentials, accept store terms, call
Play APIs or deploy a release. A debug APK uses Android's development signing,
not Mohammed's production upload key; it must never be submitted to a store.

## What the preparer guarantees

- Uses only the existing development identity `com.symbio.fitcoach.dev` and label
  `FitCoach Dev`. It rejects release mode, a production/custom ID, remote launch
  URLs, cleartext, mixed content, changed web/platform paths, signing options,
  navigation allowlists, non-local origins and a changed app start path.
- Refuses existing output, source overlap, web-bundle overlap and symlinked
  parents. Partial/earlier outputs remain evidence, never deletion targets.
- Verifies pinned installed Capacitor versions against the lockfile and checks
  the exact official Android template SHA-256 before executing the CLI.
- Integrates AGP 8.13.2, Kotlin 2.3.20, minSdk 26 and SDK/target 36. Java and Kotlin
  both target 21, matching the installed Capacitor Android library and generated
  `capacitor.build.gradle`; the former Java 17 reference was incompatible.
- Pins Gradle 8.14.3's smaller binary distribution with its [official SHA-256](https://services.gradle.org/distributions/gradle-8.14.3-bin.zip.sha256).
  Unknown/duplicate template markers fail for review rather than silently merging.
- Keeps source namespace `com.symbio.fitcoach` distinct from the development
  application ID. The Kotlin launcher registers the local bridge before `super`
  builds it. Only the newly generated unused Java template launcher is removed.
- Retains explicit privacy/health/voice/storage/purchase code, disables Android
  backups and cleartext, and exposes camera output only through a non-exported
  FileProvider restricted to app-owned `Pictures/`, not all external storage.
- Includes Android navigation/density configuration changes recommended by
  [Capacitor's Android migration guide](https://capacitorjs.com/docs/updating/8-0)
  to avoid unnecessary WebView recreation on resizing.
- Records source hashes, template/Gradle hashes and the verified web digest in
  `fitcoach-android-inputs.json`. This is traceability, not approval or a signature.

The generated workspace has one explicit build-only `node_modules` link to the
locked source dependencies. It is not copied into the Android asset bundle. Keep
that source dependency installation available while compiling; rebuild on a new
machine rather than relocating this workspace and assuming links are portable.

## Still required before release

Successful compilation is not phone-runtime evidence. Test launch/bridge injection,
camera picker, speech/audio routes, calls, background/process recovery, health
permissions/revocation, purchases and secure storage on supported physical devices.
Release identity/version-code policy, final developer accounts, signed AAB,
Gradle dependency locks/verification metadata, R8/shrinking review, store sandbox
transactions, legal/privacy review and Play submission remain separate work.
iOS project integration and signed-device evidence are still required too.

## Actual installed-app smoke test

The integrity workflow also prepares a new Android 36 Google APIs x86_64 emulator
on its standard Linux runner. It refuses any already connected ADB device and
keeps the new AVD in a fresh runner-temp directory. It never starts an emulator on
the user's Mac, reuses a personal device, uploads an APK, or accepts new SDK terms.
Existing runner SDK license grants must cover image installation; otherwise it
fails. The provisioner uses the runner's installed `sdkmanager` / `avdmanager`
interfaces, not newly installed command-line tools or a third-party action.

Three AndroidX instrumentation tests install the real development application:

- Local HTTPS onboarding renders in the actual Capacitor WebView with its native
  plugin, a health-availability response, no horizontal overflow and no microphone
  grant. Emulator Wi-Fi/mobile data are disabled before application launch.
- The packaged manifest retains all 100 posters and 59 motion records, and three
  representative full-resolution WebP posters actually decode in that WebView.
- A synthetic-only session round-trips through the production secure-storage
  client and Android bridge, uses ciphertext/IV preferences and an Android Keystore
  key, survives Activity recreation, and is deleted through that same client.

`android-runtime-smoke.mjs` fails on missing, skipped, duplicated or failing test
results even if Gradle returns success. Instrumentation sources/dependencies stay
in `androidTest` and do not ship in the app. Reports are ephemeral CI output, not
physical-device certification. Activity recreation is **not** proof of process
death, reinstall, reboot, hardware-backed keys, background/call recovery, purchases,
or physical Bluetooth behavior. No account tokens, real health records or paid
provider calls are used. Success is claimed only after an actual run passes.

References: [Android instrumented-test runner](https://developer.android.com/training/testing/instrumented-tests/androidx-test-libraries/runner),
[AndroidX test releases](https://developer.android.com/jetpack/androidx/releases/test),
[emulator command line](https://developer.android.com/studio/run/emulator-commandline),
and [standard GitHub runner acceleration](https://github.blog/changelog/2024-04-02-github-actions-hardware-accelerated-android-virtualization-now-available/).
