# iOS release settings

Status: reference checklist only. No Xcode project, archive, provisioning profile, TestFlight build, or App Store submission was generated on this host.

## Generated project requirements

- Generate the iOS project from the pinned Capacitor 8.5.1 dependencies and commit its dependency resolution file.
- Keep `FitCoachBridgeViewController` as the Main storyboard class so the app-local `FitCoachNativePlugin` instance is registered in `capacitorDidLoad`, and include the provided AppDelegate and SceneDelegate in the app target. Do not replace this with `registerPluginType` after Capacitor 8 automatic registration.
- Use the registered production bundle ID, Apple team, automatic or reviewed manual signing, iOS 17 minimum, approved marketing version, and monotonically increasing build number.
- Build an archived Release configuration with the local `dist/` web bundle. Do not configure a remote Capacitor `server.url` for the store binary.
- Add the HealthKit capability only after the App ID has it enabled. The initial release is read-only; do not add workout-share permission or an update usage description without a reviewed explicit export flow.
- Include and reconcile `PrivacyInfo.xcprivacy` against Xcode's final privacy report and every compiled SDK.
- Keep background audio/microphone and HealthKit background delivery capabilities absent from the initial release.
- Confirm export-compliance, encryption, age rating, App Privacy, account deletion, support/privacy URLs, and review notes in App Store Connect.
- Use the generated opaque AppIcon asset and verify it on light/dark/tinted Home Screen treatments and the App Store listing.

## Store and device gates

- Create `fitcoach_premium_monthly` and `fitcoach_premium_yearly`, a subscription group, pricing, localization, review screenshot, and sandbox testers.
- Configure the server verifier, App Store Server API transaction finish, and App Store Server Notifications V2 before enabling purchase UI. The native bridge never finishes a transaction from a JavaScript boolean or opaque correlation ID.
- Exercise purchase, pending/Ask to Buy, renew, expire, cancel, refund, revoke, restore, reinstall, and second-device paths in StoreKit sandbox.
- Run the complete built-in audio, AirPods HFP/A2DP, route loss, phone/Siri/alarm interruption, speech permission, HealthKit permission, accessibility, screen-lock, and foreground recovery matrix on physical iPhones.
