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

1. Install Node 22+, Xcode 26+, Android Studio 2025.2.1+, its JDK 17 toolchain, and Android SDK tooling. CocoaPods is optional because Capacitor 8 defaults to Swift Package Manager.
2. From this directory, run `npm ci` with Node 22+ using the committed dependency lockfile.
3. Copy the audited production web bundle into `dist/`. Do not use a hosted `server.url` for store builds.
4. Generate the Capacitor platform projects, then merge the included AppDelegate/SceneDelegate/bridge-controller and MainActivity registration scaffolds into the generated targets. Merge both Groovy Android reference Gradle files and update generated `variables.gradle` to minSdk 26 so the Kotlin bridge compiles. The iOS bridge controller registers an app-local plugin instance because Capacitor 8 type registration is disabled after automatic registration. The source files here are not an Xcode project or Gradle build by themselves.
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
