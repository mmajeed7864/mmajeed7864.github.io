import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { CODE_GATES, EXTERNAL_GATES, evaluateReleaseEvidence, sourceWorkingTreeClean } from "./release-evidence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");
const json = process.argv.includes("--json");
const args = process.argv.slice(2);
const evidenceIndex = args.indexOf("--evidence");
const evidencePath = evidenceIndex < 0 ? path.join(root, "release/release-evidence.json") : path.resolve(args[evidenceIndex + 1] || "");
let inputError = null;
if (args.some((arg, index) => !["--strict", "--json", "--evidence"].includes(arg) && !(evidenceIndex >= 0 && index === evidenceIndex + 1))
  || (evidenceIndex >= 0 && (!args[evidenceIndex + 1] || args[evidenceIndex + 1].startsWith("--")))) inputError = "invalid_arguments";
let gates = {};
let evidence = null;
let appVersion = null;
try {
  const constants = fs.readFileSync(path.join(root, "../v040/core/constants.mjs"), "utf8");
  appVersion = constants.match(/export\s+const\s+BUILD\s*=\s*["'](\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?)["']/u)?.[1] || null;
} catch { /* A standalone source kit has no web runtime identity; strict evidence remains incomplete. */ }
try { gates = JSON.parse(fs.readFileSync(path.join(root, "release/release-gates.json"), "utf8")); } catch { inputError = "unreadable_checklist_json"; }
try { evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8")); } catch (error) { if (error.code !== "ENOENT") inputError = "unreadable_evidence_json"; }
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

const missing = requiredFiles.filter(file => {
  try { const stat = fs.statSync(path.join(root, file)); return !stat.isFile() || stat.size === 0; } catch { return true; }
});
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
const incompleteCode = CODE_GATES.filter(name => gates?.code?.[name] !== true);
const external = EXTERNAL_GATES.filter(name => gates?.external?.[name] !== true);
const productionId = process.env.FITCOACH_NATIVE_APP_ID || "";
const releaseEnvironmentValid = process.env.FITCOACH_NATIVE_RELEASE !== "1" || (productionId.length > 4 && !productionId.endsWith(".dev"));
let sourceRevision = null;
let sourceClean = false;
try {
  sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  sourceClean = sourceWorkingTreeClean(root);
} catch { /* Source-only checks remain usable outside Git; strict evidence cannot match an unknown revision. */ }
const release = evaluateReleaseEvidence({ gates, evidence, appVersion, sourceRevision, sourceClean, nativeRoot: root, evidenceRoot: path.dirname(evidencePath) });
const sourceVerified = gates?.schemaVersion === 1 && !missing.length && !incompleteCode.length && !structuralIssues.length && releaseEnvironmentValid;
const report = {
  schemaVersion: 1,
  mode: strict ? "strict" : "source",
  appVersion,
  kitTargetVersion: gates?.targetVersion || null,
  sourceRevision,
  sourceClean,
  sourceVerified,
  releaseEvidenceComplete: sourceVerified && !inputError && release.complete,
  evidenceScope: "Local evidence integrity and recorded results; this command does not compile, test devices, or verify store approval.",
  inputError,
  source: { codeGates: { recordedComplete: CODE_GATES.length - incompleteCode.length, required: CODE_GATES.length }, missingFiles: missing, incompleteCode, structuralIssues, releaseEnvironmentValid },
  checklist: { recordedComplete: EXTERNAL_GATES.length - external.length, required: EXTERNAL_GATES.length, incomplete: external },
  release,
};
if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`FitCoach app ${appVersion || "unknown"}; source-kit checklist target ${report.kitTargetVersion}`);
  console.log(`Source structure: ${sourceVerified ? "verified" : "incomplete"} (${CODE_GATES.length - incompleteCode.length}/${CODE_GATES.length} recorded code gates)`);
  console.log(`Historical external checklist: ${EXTERNAL_GATES.length - external.length}/${EXTERNAL_GATES.length}`);
  for (const [group, count] of Object.entries(release.groups)) console.log(`${group} evidence: ${count.validated}/${count.required}`);
  for (const [platform, project] of Object.entries(release.projects)) console.log(`${platform} generated project: ${project.present ? "present (not compile proof)" : `missing ${project.missing.join(", ")}`}`);
  if (missing.length) console.log(`Missing source files: ${missing.join(", ")}`);
  if (incompleteCode.length) console.log(`Incomplete code gates: ${incompleteCode.join(", ")}`);
  if (structuralIssues.length) console.log(`Structural source issues: ${structuralIssues.join(", ")}`);
  if (!releaseEnvironmentValid) console.log("Release environment: invalid production application ID");
  if (inputError) console.log(`Input issue: ${inputError}`);
  if (release.issues.length) console.log(`Evidence issues: ${release.issues.join(", ")}`);
  console.log(`Release evidence: ${report.releaseEvidenceComplete ? "complete" : "incomplete; use --json for each gate"}`);
  console.log(report.evidenceScope);
}
if (inputError || !sourceVerified || (strict && !report.releaseEvidenceComplete)) process.exitCode = 1;
