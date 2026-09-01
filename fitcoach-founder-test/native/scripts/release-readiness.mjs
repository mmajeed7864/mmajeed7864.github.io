import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");
const gates = JSON.parse(fs.readFileSync(path.join(root, "release/release-gates.json"), "utf8"));
const requiredFiles = [
  "capacitor.config.ts",
  "package-lock.json",
  "bridge/fitcoach-native.ts",
  "bridge/fitcoach-native-contract.mjs",
  "ios/App/App/FitCoachNativePlugin.swift",
  "ios/App/App/FitCoachBridgeViewController.swift",
  "ios/App/App/AppDelegate.swift",
  "ios/App/App/SceneDelegate.swift",
  "ios/App/App/Base.lproj/Main.storyboard",
  "ios/App/App/Base.lproj/LaunchScreen.storyboard",
  "ios/App/App/Info.plist",
  "ios/App/App/PrivacyInfo.xcprivacy",
  "android/app/src/main/AndroidManifest.xml",
  "android/app/src/main/java/com/symbio/fitcoach/MainActivity.kt",
  "android/app/src/main/java/com/symbio/fitcoach/nativebridge/FitCoachNativePlugin.kt",
  "android/app/src/main/res/values/styles.xml",
  "android/reference-root-build.gradle",
  "android/reference-app-build.gradle",
  "assets/store/app-store-1024.png",
  "assets/store/google-play-512.png",
];

const missing = requiredFiles.filter(file => !fs.existsSync(path.join(root, file)));
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const structuralChecks = missing.length ? {} : {
  iosPluginInstanceRegistration: /registerPluginInstance\(FitCoachNativePlugin\(\)\)/u.test(read("ios/App/App/FitCoachBridgeViewController.swift")),
  sceneDelegateProxyForwarding: /SceneDelegateProxy\.shared\.scene/u.test(read("ios/App/App/SceneDelegate.swift")),
  androidPluginRegistration: /registerPlugin\(FitCoachNativePlugin::class\.java\)/u.test(read("android/app/src/main/java/com/symbio/fitcoach/MainActivity.kt")),
  androidHealthCompatibleMinSdk: /minSdk\s+26/u.test(read("android/reference-app-build.gradle")),
  androidKotlinPluginPinned: /kotlin-gradle-plugin:2\.3\.20/u.test(read("android/reference-root-build.gradle"))
    && /apply plugin: 'org\.jetbrains\.kotlin\.android'/u.test(read("android/reference-app-build.gradle")),
  accountBoundCheckoutContract: /accountBinding: string/u.test(read("bridge/fitcoach-native.ts"))
    && /appAccountToken\(accountToken\)/u.test(read("ios/App/App/FitCoachNativePlugin.swift"))
    && /setObfuscatedAccountId/u.test(read("android/app/src/main/java/com/symbio/fitcoach/nativebridge/FitCoachNativePlugin.kt")),
};
const structuralIssues = Object.entries(structuralChecks).filter(([, value]) => value !== true).map(([name]) => name);
const incompleteCode = Object.entries(gates.code).filter(([, value]) => value !== true).map(([name]) => name);
const external = Object.entries(gates.external).filter(([, value]) => value !== true).map(([name]) => name);
const productionId = process.env.FITCOACH_NATIVE_APP_ID || "";
const releaseEnvironmentValid = process.env.FITCOACH_NATIVE_RELEASE !== "1" || (productionId.length > 4 && !productionId.endsWith(".dev"));

console.log(`FitCoach native ${gates.targetVersion} readiness`);
console.log(`Code gates: ${Object.keys(gates.code).length - incompleteCode.length}/${Object.keys(gates.code).length}`);
console.log(`External gates: ${Object.keys(gates.external).length - external.length}/${Object.keys(gates.external).length}`);
if (missing.length) console.log(`Missing files: ${missing.join(", ")}`);
if (incompleteCode.length) console.log(`Incomplete code gates: ${incompleteCode.join(", ")}`);
if (structuralIssues.length) console.log(`Structural source issues: ${structuralIssues.join(", ")}`);
if (external.length) console.log(`External/device/account gates remaining: ${external.join(", ")}`);
if (!releaseEnvironmentValid) console.log("Release environment: invalid production application ID");

if (missing.length || incompleteCode.length || structuralIssues.length || !releaseEnvironmentValid || (strict && external.length)) {
  process.exitCode = 1;
} else if (external.length) {
  console.log("Source scaffold structurally verified. Native compile, device proof, and store release remain blocked by the external gates above.");
}
