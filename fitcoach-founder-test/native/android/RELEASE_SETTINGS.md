# Android release settings

Status: reference checklist only. No Gradle project, Android App Bundle, upload key, or Play Console release was generated on this host.

## Generated project requirements

- Generate the Android project from the pinned Capacitor 8.5.1 dependencies and commit its dependency lockfiles/checksums.
- Merge `reference-root-build.gradle` into the generated root `build.gradle` and `reference-app-build.gradle` into generated `app/build.gradle`: Capacitor's generated Android template is Groovy and Java-only while the local bridge is Kotlin. Replace, rather than duplicate, the generated AGP classpath line. Keep `google()` in buildscript repositories. The reviewed pairing is AGP 8.13.2, Capacitor's generated Gradle wrapper 8.14.3, Kotlin Gradle Plugin 2.3.20, and JDK 17.
- Update generated `variables.gradle` to `minSdkVersion = 26`, `compileSdkVersion = 36`, and `targetSdkVersion = 36`; do not leave the template minSdk at 24.
- Keep the provided `MainActivity` launcher and its pre-bridge `registerPlugin(FitCoachNativePlugin::class.java)` call; do not rely on npm plugin discovery for this app-local plugin.
- Keep `minSdkVersion = 26`, `compileSdkVersion = 36`, and `targetSdkVersion = 36`. Health Connect `connect-client:1.1.0` declares minSdk 26, minCompileSdk 36, and minimum AGP 8.9.1; using Capacitor's lower template minSdk will fail manifest/AAR validation. Google Play requires new apps and updates submitted from August 31, 2026 to target Android 16 / API 36 or higher.
- Produce a release Android App Bundle (`.aab`), not a debug APK. Set a monotonically increasing `versionCode` and the approved public version name.
- Use a private upload key and Play App Signing. Store neither key material nor passwords in this repository.
- Disable WebView debugging, cleartext traffic, debuggable builds, test-only flags, and verbose production logging.
- Keep Health Connect read-only in the initial release. Do not add write permissions until a reviewed, explicit completed-workout export action exists.
- Enable R8/resource shrinking after testing reflection-sensitive Capacitor, Billing, and Health Connect paths.
- Copy the generated adaptive icons and verify all density/round-mask previews in Android Studio.

## Console and device gates

- Register the final package name and verified developer identity.
- Configure the `fitcoach_premium` subscription with `monthly` and `yearly` base plans, license testers, and the server verifier/notification service.
- Submit Health apps, Data safety, Target audience/content, App access, account deletion, content rating, and privacy-policy declarations that match the final binary and backend.
- Verify Health Connect permission rationale/navigation on Android 13 and the system-integrated flow on Android 14+.
- The initial bridge requests ordinary recent-history reads only and does not request `READ_HEALTH_DATA_HISTORY`; older imports must remain unavailable unless a reviewed feature and updated disclosure add that permission.
- Run the complete Bluetooth, call/audio-focus, process recreation, speech, Health Connect, Play Billing, accessibility, and offline matrix on physical Pixel and Samsung devices.
