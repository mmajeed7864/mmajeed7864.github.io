# FitCoach native release kit

This directory is a production-oriented native boundary for the existing FitCoach web app. It does **not** claim that an iOS or Android binary has been signed, installed on a device, submitted, or approved.

## What is implemented here

- A pinned Capacitor 8.5.1 configuration with release/debug separation and no remote-server wrapper.
- A typed bridge contract for native voice/audio lifecycle, read-only health summaries, store transactions, and secure native account-session storage.
- Separate input/output route phases so headset microphones can use the call route while coach audio can return to higher-quality A2DP output. The bridge routes audio only; the approved speech provider still supplies the actual coach audio.
- iOS Swift implementation for `AVAudioSession`, AirPods/Bluetooth routing, interruption recovery, HealthKit permission, daily steps/active energy, Keychain session storage, and explicit Capacitor plugin registration.
- Android Kotlin implementation for audio focus, Bluetooth communication-device selection, native partial/final speech events, Health Connect permission, daily steps/active energy, Keystore-encrypted session storage, and explicit Capacitor plugin registration.
- Minimal permission manifests. There is no Bluetooth scanning, location, advertising ID, background microphone, or background health permission.
- Fail-closed StoreKit 2 and Google Play Billing reference bridges. Prices come from the store; pending/deferred transactions never unlock premium; every transaction must be verified by the backend before Apple server finish or Google acknowledgement and entitlement refresh.
- Draft store metadata, privacy/data-safety inventories, age-safety policy, and machine-readable release gates.
- Opaque iOS, Android adaptive, and store icon assets generated from the FitCoach Symbio mark.
- Structural and behavioral tests that run without Xcode or Android Studio.

The health bridges return daily aggregate values only. They do not persist raw HealthKit or Health Connect samples. The current release asks only for read access and exposes no workout-write bridge or permission. A future workout export must add a separate explicit approval action, contextual write permission, store disclosure, and device tests before any write API is restored.

## Intentionally not claimed

- Full-duplex or always-listening voice
- Background microphone capture
- Automatic microphone restart after a call, route loss, permission change, or app suspension
- Health sync while the app is closed
- Store subscription entitlement without server verification
- A production privacy policy, legal approval, signed binary, TestFlight/Play test result, or store review

The voice bridge may restore output after a transient audio interruption only when the operating system says resumption is appropriate. Listening always returns to a visible `recovery_required` state so the person knowingly restarts the microphone.

## Build path

1. Install Node 22+, Xcode 26+, Android Studio 2025.2.1+, JDK 21, and Android SDK 36 tooling. The installed Capacitor 8.5.1 Android library and generated project both compile with Java 21. CocoaPods is optional because Capacitor 8 defaults to Swift Package Manager.
2. From this directory, run `npm ci` with Node 22+ using the committed dependency lockfile.
3. With build-only `cwebp`, `ffmpeg` and `ffprobe` available, run `npm run web:build`, then `npm run web:verify` to assemble and verify `dist/`. The builder preserves `/fitcoach-founder-test/` paths, packages all 100 full-resolution posters losslessly, checks decoded pixels/ICC profiles and retains videos/font licenses. It never replaces an existing output directory; preserve/move an old `dist/` aside before rebuilding. Source PNGs remain unchanged; `web:build:source` is the diagnostic unoptimized builder. Read [WEB_BUNDLE.md](WEB_BUNDLE.md). Do not use a hosted `server.url` for store builds.
4. For Android, run `node scripts/prepare-android-project.mjs --web-bundle dist --out /absolute/new/project-directory` and follow [ANDROID_BUILD.md](ANDROID_BUILD.md). For iOS, use `node scripts/prepare-ios-project.mjs --web-bundle dist --out /absolute/new/ios-directory` and [IOS_BUILD.md](IOS_BUILD.md). Both preserve the original reference sources and automate native launcher/bridge, privacy, icons and local-web-asset integration. The iOS path is unsigned/simulator-only; production identity, signing and physical-device testing remain separate gates. The iOS bridge controller registers an app-local plugin instance because Capacitor 8 type registration is disabled after automatic registration.
5. Register the final application ID and set `FITCOACH_NATIVE_APP_ID` and `FITCOACH_NATIVE_RELEASE=1`.
6. Configure signing, HealthKit capability, Health Connect declarations, store products, server notifications, legal/support URLs, and deletion endpoint.
7. Run `node scripts/release-readiness.mjs --strict`, Xcode tests, Android instrumentation tests, real-device audio-route tests, store sandbox purchase tests, and accessibility QA.

Read the platform build checklists in `ios/RELEASE_SETTINGS.md` and `android/RELEASE_SETTINGS.md`. The purchase/account trust boundary is defined in `release/PURCHASE_VERIFICATION_HANDOFF.md`. In particular, `subscriptionEntitlementChanged` is an advisory refresh signal, never authorization to unlock premium; the authenticated backend account entitlement is the sole authority.

Run the local checks now with:

```bash
node --test tests/*.test.mjs
node scripts/release-readiness.mjs
```

The non-strict readiness command reports honest blockers and exits successfully. `--strict` exits nonzero until every external release gate is explicitly recorded as complete.
