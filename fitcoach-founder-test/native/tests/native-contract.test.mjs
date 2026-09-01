import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeHealthSummary, recoverVoicePhase } from "../bridge/fitcoach-native-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function pngHeader(file) {
  const data = fs.readFileSync(path.join(root, file));
  assert.equal(data.subarray(1, 4).toString("ascii"), "PNG");
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), colorType: data[25] };
}

test("health summaries accept only aggregate source/day/numeric values", () => {
  assert.deepEqual(normalizeHealthSummary({ source: "apple_health", localDay: "2026-08-31", steps: 4567.6, activeEnergyKcal: 312.25 }), {
    bridgeVersion: 1,
    source: "apple_health",
    localDay: "2026-08-31",
    steps: 4568,
    activeEnergyKcal: 312.3,
    aggregateOnly: true,
  });
  assert.equal(normalizeHealthSummary({ source: "fake", localDay: "2026-08-31", steps: 1, activeEnergyKcal: 1 }), null);
  assert.equal(normalizeHealthSummary({ source: "health_connect", localDay: "today", steps: 1, activeEnergyKcal: 1 }), null);
  assert.equal(normalizeHealthSummary({ source: "health_connect", localDay: "2026-08-31", steps: -1, activeEnergyKcal: 1 }), null);
});

test("interruption recovery never silently restarts microphone capture", () => {
  const interrupted = recoverVoicePhase({ phase: "listening" }, { type: "call_started" });
  assert.equal(interrupted.phase, "interrupted");
  assert.equal(interrupted.resumeListening, false);
  const ended = recoverVoicePhase(interrupted, { type: "interruption_ended", systemAllowsResume: true });
  assert.equal(ended.phase, "recovery_required");
  assert.equal(ended.resumeListening, false);
  assert.equal(recoverVoicePhase(ended, { type: "user_resume" }).resumeListening, true);
  const speaking = recoverVoicePhase({ phase: "speaking" }, { type: "audio_focus_lost" });
  assert.equal(recoverVoicePhase(speaking, { type: "interruption_ended", systemAllowsResume: true }).resumeOutput, true);
});

test("native voice separates speech input from high-quality Bluetooth output", () => {
  const contract = read("bridge/fitcoach-native.ts");
  const ios = read("ios/App/App/FitCoachNativePlugin.swift");
  const android = read("android/app/src/main/java/com/symbio/fitcoach/nativebridge/FitCoachNativePlugin.kt");
  for (const method of ["prepareVoiceOutput", "completeVoiceOutput"]) {
    assert.match(contract, new RegExp(method, "u"));
    assert.match(ios, new RegExp(method, "u"));
    assert.match(android, new RegExp(method, "u"));
  }
  assert.match(ios, /setCategory\(\.playback, mode: \.spokenAudio\)/u);
  assert.match(ios, /outputSessionActive/u);
  assert.match(ios, /if self\.voiceSessionActive \{[\s\S]*configureVoiceRoomAudioSession\(\)/u);
  assert.match(ios, /setActive\(false, options: \[\.notifyOthersOnDeactivation\]\)/u);
  const iosPrepareOutput = ios.slice(ios.indexOf("func prepareVoiceOutput"), ios.indexOf("func completeVoiceOutput"));
  assert.doesNotMatch(iosPrepareOutput, /voiceSessionActive = true/u);
  const iosCompleteOutput = ios.slice(ios.indexOf("func completeVoiceOutput"), ios.indexOf("func startSpeechRecognition"));
  assert.match(iosCompleteOutput, /outputSessionActive = false/u);
  assert.match(iosCompleteOutput, /voiceSessionActive[\s\S]*configureVoiceRoomAudioSession[\s\S]*setActive\(false/u);
  assert.match(ios, /recognitionTapInstalled/u);
  assert.match(ios, /MICROPHONE_INPUT_FORMAT_UNAVAILABLE/u);
  assert.match(ios, /outputInterrupted && AVAudioSession\.InterruptionOptions/u);
  assert.match(android, /MODE_IN_COMMUNICATION/u);
  assert.match(android, /MODE_NORMAL/u);
  assert.match(android, /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.O/u);
  assert.match(android, /AudioManager\.STREAM_VOICE_CALL/u);
  assert.match(android, /setCommunicationDevice\(preferred\)/u);
  assert.match(android, /clearCommunicationDevice\(\)/u);
  assert.match(android, /voiceInputSessionActive/u);
  assert.match(android, /routeConfirmed/u);
  assert.doesNotMatch(android, /bluetoothRemoved/u);
  assert.match(android, /setAcceptsDelayedFocusGain\(false\)/u);
  assert.match(android, /handleOnPause[\s\S]*recovery_required/u);
  assert.match(android, /shouldResumeOutput = outputInterrupted/u);
  assert.match(ios, /voiceSessionActive/u);
  assert.match(ios, /guard voiceSessionActive \|\| outputSessionActive else \{ return \}/u);
  assert.match(ios, /guard voiceSessionActive else \{[\s\S]*VOICE_SESSION_NOT_CONFIGURED/u);
  assert.match(ios, /DispatchQueue\.main\.async[\s\S]*stopRecognition/u);
  assert.match(read("policies/DEVICE_TEST_MATRIX.md"), /Android 26–30[\s\S]*legacy Bluetooth SCO[\s\S]*unconfirmed/u);
});

test("native manifests request only foreground microphone and read-only health types", () => {
  const android = read("android/app/src/main/AndroidManifest.xml");
  assert.match(android, /android\.permission\.RECORD_AUDIO/u);
  assert.match(android, /android\.permission\.health\.READ_STEPS/u);
  assert.match(android, /android\.permission\.health\.READ_ACTIVE_CALORIES_BURNED/u);
  assert.doesNotMatch(android, /WRITE_ACTIVE_CALORIES_BURNED|WRITE_EXERCISE/u);
  assert.doesNotMatch(android, /BLUETOOTH_SCAN|ACCESS_FINE_LOCATION|READ_HEALTH_DATA_IN_BACKGROUND|FOREGROUND_SERVICE_MICROPHONE|AD_ID/u);
  const ios = read("ios/App/App/Info.plist");
  assert.match(ios, /NSMicrophoneUsageDescription/u);
  assert.match(ios, /NSSpeechRecognitionUsageDescription/u);
  assert.match(ios, /NSHealthShareUsageDescription/u);
  assert.doesNotMatch(ios, /NSHealthUpdateUsageDescription|UIBackgroundModes/u);
  const contract = read("bridge/fitcoach-native.ts");
  const iosBridge = read("ios/App/App/FitCoachNativePlugin.swift");
  const androidBridge = read("android/app/src/main/java/com/symbio/fitcoach/nativebridge/FitCoachNativePlugin.kt");
  assert.match(contract, /requestHealthAuthorization\(\): Promise<\{ requested: boolean;[\s\S]*workoutWriteRequested: false/u);
  assert.doesNotMatch(contract, /writeApprovedWorkout|includeWorkoutWrite/u);
  assert.match(iosBridge, /toShare: \[\]/u);
  assert.match(iosBridge, /"workoutWriteRequested": false/u);
  assert.doesNotMatch(iosBridge, /writeApprovedWorkout/u);
  assert.match(androidBridge, /val requestedPermissions = readHealthPermissions/u);
  assert.match(androidBridge, /healthPermissionContract\.createIntent\(context, requestedPermissions\)/u);
  assert.match(androidBridge, /put\("workoutWriteRequested", false\)/u);
  assert.match(androidBridge, /today\.minusDays\(29\)[\s\S]*HEALTH_CONNECT_HISTORY_PERMISSION_REQUIRED/u);
  assert.doesNotMatch(androidBridge, /writeHealthPermissions|writeApprovedWorkout/u);
  assert.match(iosBridge, /requestedDay\.range[\s\S]*INVALID_LOCAL_DAY/u);
  assert.doesNotMatch(read("bridge/fitcoach-native-contract.mjs"), /createApprovedWorkoutEnvelope/u);
});

test("Capacitor platform entry points explicitly register the local native plugin", () => {
  const iosController = read("ios/App/App/FitCoachBridgeViewController.swift");
  const mainStoryboard = read("ios/App/App/Base.lproj/Main.storyboard");
  const androidActivity = read("android/app/src/main/java/com/symbio/fitcoach/MainActivity.kt");
  assert.match(iosController, /override func capacitorDidLoad\(\)/u);
  assert.match(iosController, /bridge\?\.registerPluginInstance\(FitCoachNativePlugin\(\)\)/u);
  assert.doesNotMatch(iosController, /bridge\?\.registerPluginType/u);
  assert.match(mainStoryboard, /customClass="FitCoachBridgeViewController"/u);
  assert.match(mainStoryboard, /customModuleProvider="target"/u);
  assert.doesNotMatch(mainStoryboard, /customModule="\$\(/u);
  assert.match(read("ios/App/App/AppDelegate.swift"), /class AppDelegate: UIResponder, UIApplicationDelegate/u);
  const sceneDelegate = read("ios/App/App/SceneDelegate.swift");
  assert.match(sceneDelegate, /class SceneDelegate: UIResponder, UIWindowSceneDelegate/u);
  assert.match(sceneDelegate, /SceneDelegateProxy\.shared\.scene[\s\S]*willConnectTo/u);
  assert.match(sceneDelegate, /SceneDelegateProxy\.shared\.scene[\s\S]*openURLContexts/u);
  assert.match(sceneDelegate, /SceneDelegateProxy\.shared\.scene[\s\S]*continue: userActivity/u);
  const registration = androidActivity.indexOf("registerPlugin(FitCoachNativePlugin::class.java)");
  const superOnCreate = androidActivity.indexOf("super.onCreate(savedInstanceState)");
  assert.ok(registration >= 0 && superOnCreate > registration);
  assert.match(read("android/app/src/main/AndroidManifest.xml"), /android:name="\.MainActivity"/u);
});

test("native account tokens use OS-backed storage and never plaintext preferences", () => {
  const contract = read("bridge/fitcoach-native.ts");
  const ios = read("ios/App/App/FitCoachNativePlugin.swift");
  const android = read("android/app/src/main/java/com/symbio/fitcoach/nativebridge/FitCoachNativePlugin.kt");
  for (const method of ["readSecureSession", "writeSecureSession", "clearSecureSession"]) {
    assert.match(contract, new RegExp(method, "u"));
    assert.match(ios, new RegExp(method, "u"));
    assert.match(android, new RegExp(method, "u"));
  }
  assert.match(ios, /import Security/u);
  assert.match(ios, /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/u);
  assert.match(ios, /SecItemUpdate\(query as CFDictionary, attributes as CFDictionary\)/u);
  const iosWrite = ios.slice(ios.indexOf("func writeSecureSession"), ios.indexOf("func clearSecureSession"));
  assert.doesNotMatch(iosWrite, /SecItemDelete/u);
  assert.match(android, /AndroidKeyStore/u);
  assert.match(android, /AES\/GCM\/NoPadding/u);
  assert.doesNotMatch(android, /putString\([^,]+,\s*session/u);
});

test("store purchase bridges stay fail closed until server verification", () => {
  const contract = read("bridge/fitcoach-native.ts");
  const ios = read("ios/App/App/FitCoachNativePlugin.swift");
  const android = read("android/app/src/main/java/com/symbio/fitcoach/nativebridge/FitCoachNativePlugin.kt");
  for (const method of ["getSubscriptionOfferings", "purchaseSubscription", "restorePurchases", "completeVerifiedPurchase", "openManageSubscriptions"]) {
    assert.match(contract, new RegExp(method, "u"));
    assert.match(ios, new RegExp(method, "u"));
    assert.match(android, new RegExp(method, "u"));
  }
  assert.match(ios, /Do not finish or unlock here[\s\S]*backend must verify/u);
  assert.match(ios, /verificationId[\s\S]*SERVER_VERIFICATION_REQUIRED/u);
  assert.match(ios, /Transaction\.unfinished[\s\S]*APP_STORE_SERVER_FINISH_PENDING/u);
  assert.doesNotMatch(ios, /await transaction\.finish\(\)/u);
  assert.match(android, /serverVerified[\s\S]*verificationId/u);
  assert.match(android, /PLAY_PURCHASE_NOT_ACKNOWLEDGED_BY_BACKEND/u);
  assert.doesNotMatch(android, /acknowledgePurchase|AcknowledgePurchaseParams/u);
  assert.match(android, /Purchase\.PurchaseState\.PENDING/u);
  assert.match(ios, /Transaction\.unfinished[\s\S]*notifyStoreTransaction/u);
  assert.match(ios, /DispatchQueue\.main\.async[\s\S]*notifyListeners\("subscriptionTransactionAvailable", data: payload, retainUntilConsumed: true\)/u);
  assert.match(android, /bridge\.executeOnMainThread[\s\S]*startSpeechInternal/u);
  assert.match(android, /bridge\.executeOnMainThread[\s\S]*launchBillingFlow/u);
  assert.match(android, /notifyListeners\("subscriptionTransactionAvailable", payload, true\)/u);
  assert.match(android, /Purchase\.PurchaseState\.PURCHASED -> "verification_required"/u);
  assert.match(android, /else -> return null/u);
  assert.match(contract, /accountBinding: string/u);
  assert.match(ios, /appAccountToken\(accountToken\)/u);
  assert.match(android, /setObfuscatedAccountId\(accountBindingHash\(accountBinding\)\)/u);
  assert.match(android, /billingConnectionInProgress/u);
  assert.match(android, /connectBillingOnMainThread\(\)/u);
  assert.match(android, /filter \{ it\.offerId == null \}/u);
  assert.match(android, /status", "failed"/u);
  assert.match(ios, /notifyListeners\("subscriptionEntitlementChanged"/u);
  assert.match(android, /notifyListeners\(\s*"subscriptionEntitlementChanged"/u);
  const products = JSON.parse(read("release/store-products.json"));
  assert.equal(products.rules.localizedPriceComesFromStore, true);
  assert.equal(products.rules.serverVerificationRequired, true);
  assert.equal(products.rules.backendEntitlementIsSoleAuthority, true);
  assert.equal(products.rules.clientEntitlementEventIsAdvisory, true);
  assert.equal(products.rules.googleAcknowledgementPerformedByBackend, true);
  assert.equal(products.rules.pendingPurchaseDoesNotUnlock, true);
  assert.equal(products.rules.storeAccountBindingRequired, true);
  const handoff = read("release/PURCHASE_VERIFICATION_HANDOFF.md");
  assert.match(handoff, /POST \/api\/fitcoach-subscriptions-v1/u);
  assert.match(handoff, /only source of truth/u);
  assert.match(handoff, /Google, the backend performs acknowledgement/u);
});

test("release configuration cannot accidentally use the dev ID for a store build", () => {
  const config = read("capacitor.config.ts");
  const iosRelease = read("ios/FitCoachRelease.xcconfig");
  const info = read("ios/App/App/Info.plist");
  assert.match(config, /com\.symbio\.fitcoach\.dev/u);
  assert.match(config, /FITCOACH_NATIVE_RELEASE/u);
  assert.match(config, /throw new Error/u);
  assert.doesNotMatch(config, /server:\s*\{[\s\S]*url:/u);
  assert.match(iosRelease, /SWIFT_VERSION = 5\.0/u);
  assert.match(info, /\$\(MARKETING_VERSION\)/u);
  assert.match(info, /\$\(CURRENT_PROJECT_VERSION\)/u);
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(lock.packages["node_modules/@capacitor/core"].version, "8.5.1");
  assert.equal(lock.packages["node_modules/@capacitor/ios"].version, "8.5.1");
  assert.equal(lock.packages["node_modules/@capacitor/android"].version, "8.5.1");
  const rootBuild = read("android/reference-root-build.gradle");
  const appBuild = read("android/reference-app-build.gradle");
  assert.match(rootBuild, /com\.android\.tools\.build:gradle:8\.13\.2/u);
  assert.match(rootBuild, /kotlin-gradle-plugin:2\.3\.20/u);
  assert.match(appBuild, /apply plugin: 'org\.jetbrains\.kotlin\.android'/u);
  assert.match(appBuild, /minSdk\s+26/u);
  assert.match(appBuild, /compileSdk\s+36/u);
  assert.match(appBuild, /jvmTarget = '17'/u);
});

test("store icons have exact dimensions and no alpha channel", () => {
  assert.deepEqual(pngHeader("assets/store/app-store-1024.png"), { width: 1_024, height: 1_024, colorType: 2 });
  assert.deepEqual(pngHeader("assets/store/google-play-512.png"), { width: 512, height: 512, colorType: 2 });
  const ios = JSON.parse(read("assets/ios/AppIcon.appiconset/Contents.json"));
  assert.equal(ios.images.some(image => image.idiom === "ios-marketing" && image.size === "1024x1024" && image.scale === "1x"), true);
});

test("privacy and youth release gates remain explicit rather than claimed complete", () => {
  const gates = JSON.parse(read("release/release-gates.json"));
  assert.equal(gates.external.privacyPolicyPublished, false);
  assert.equal(gates.external.legalAndYouthPolicyReviewed, false);
  assert.equal(gates.external.realIphoneVoiceHealthTestPassed, false);
  assert.equal(gates.external.realAndroidVoiceHealthTestPassed, false);
  assert.equal(gates.external.storeSandboxPurchaseMatrixPassed, false);
  const youth = read("policies/YOUTH_AND_PRIVACY_REQUIREMENTS.md");
  assert.match(youth, /Under 13: do not create an account/u);
  assert.match(youth, /Trainer tone cannot be `Rude`/u);
  assert.match(youth, /private by default/u);
  assert.match(youth, /initial health bridge is read-only/u);
  assert.doesNotMatch(read("policies/STORE_PRIVACY_INVENTORY.md"), /Optional write after explicit approval/u);
});
