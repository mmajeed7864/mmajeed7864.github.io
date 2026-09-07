import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

// Keep requirements independent of the editable historical checklist.
export const CODE_GATES = Object.freeze([
  "capacitorConfig", "dependencyLock", "nativeBridgeContract", "iosReferenceBridge",
  "androidReferenceBridge", "healthDataMinimized", "backgroundMicrophoneDisabled",
  "nativeContractTests", "storeMetadataDrafts", "privacyManifestDraft", "dataSafetyDraft", "iconsGenerated",
]);
export const EXTERNAL_GATE_GROUPS = Object.freeze({
  configuration: Object.freeze([
    "productionBundleIdRegistered", "appleDeveloperAgreementActive", "googlePlayDeveloperIdentityVerified",
    "xcodeInstalled", "androidJdkAndSdkInstalled", "iosSigningConfigured", "androidSigningConfigured",
    "healthKitCapabilityEnabled", "healthConnectConsoleDeclarationApproved", "appStoreProductsCreated",
    "playStoreProductsCreated", "purchaseVerificationBackendLive", "privacyPolicyPublished", "termsPublished",
    "supportUrlPublished", "accountDeletionUrlLive", "legalAndYouthPolicyReviewed", "nutritionLicensesVerified",
  ]),
  device: Object.freeze([
    "realIphoneVoiceHealthTestPassed", "realAndroidVoiceHealthTestPassed", "airpodsAndBluetoothMatrixPassed",
    "phoneCallInterruptionMatrixPassed", "storeSandboxPurchaseMatrixPassed",
  ]),
  store: Object.freeze([
    "appStorePrivacyAnswersSubmitted", "playDataSafetyAnswersSubmitted", "appleAgeRatingCompleted",
    "playTargetAudienceCompleted", "storeScreenshotsAndPreviewApproved", "testflightReviewPassed", "playClosedTestPassed",
  ]),
});
export const EXTERNAL_GATES = Object.freeze(Object.values(EXTERNAL_GATE_GROUPS).flat());
export const COMPILE_GATES = Object.freeze({ ios: "iosReleaseArchiveBuilt", android: "androidReleaseBundleBuilt" });
const PROJECT_FILES = Object.freeze({
  ios: ["ios/App/App.xcodeproj/project.pbxproj"],
  android: [
    "android/settings.gradle", "android/build.gradle", "android/app/build.gradle", "android/gradlew",
    "android/gradle/wrapper/gradle-wrapper.properties", "android/gradle/wrapper/gradle-wrapper.jar",
  ],
});
const record = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = value => typeof value === "string" && value.trim().length > 0;
const sha256 = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);

export function sourceWorkingTreeClean(nativeRoot) {
  const inputs = [
    "../index.html", "../manifest.webmanifest", "../sw.js", "../v040", "../assets", "../legal",
    "bridge", "ios", "android", "assets", "brand", "capacitor.config.ts", "package.json", "package-lock.json",
    "release/store-products.json", "release/app-store-metadata.json", "release/google-play-metadata.json",
  ];
  try {
    return execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "--", ...inputs], {
      cwd: nativeRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim() === "";
  } catch { return false; }
}

export function hashFile(file) {
  const hash = createHash("sha256");
  const descriptor = fs.openSync(file, "r");
  const buffer = Buffer.alloc(64 * 1024);
  try {
    let count;
    while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, count));
    return hash.digest("hex");
  } finally {
    fs.closeSync(descriptor);
  }
}

function fileEvidenceIssue(reference, evidenceRoot) {
  if (!record(reference) || !text(reference.path) || !sha256(reference.sha256)) return "missing_path_or_sha256";
  if (path.isAbsolute(reference.path) || reference.path.split(/[\\/]/u).includes("..")) return "path_outside_evidence_root";
  try {
    const root = fs.realpathSync(evidenceRoot);
    const file = fs.realpathSync(path.resolve(root, reference.path));
    if (!file.startsWith(`${root}${path.sep}`)) return "path_outside_evidence_root";
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0) return "missing_or_empty_file";
    return hashFile(file) === reference.sha256 ? null : "sha256_mismatch";
  } catch {
    return "unreadable_file";
  }
}

function nativeProjectFiles(nativeRoot) {
  return Object.fromEntries(Object.entries(PROJECT_FILES).map(([platform, files]) => {
    const missing = files.filter(file => {
      try { const stat = fs.statSync(path.join(nativeRoot, file)); return !stat.isFile() || stat.size === 0; } catch { return true; }
    });
    return [platform, { present: missing.length === 0, missing }];
  }));
}

export function evaluateReleaseEvidence({
  gates, evidence, appVersion, sourceRevision, sourceClean, nativeRoot, evidenceRoot, now = new Date(),
}) {
  const issues = [];
  if (gates?.schemaVersion !== 1) issues.push("unsupported_checklist_schema");
  if (!record(gates?.external) || EXTERNAL_GATES.some(name => typeof gates.external[name] !== "boolean")) issues.push("invalid_or_missing_external_flags");
  if (Object.keys(gates?.external || {}).some(name => !EXTERNAL_GATES.includes(name))) issues.push("unknown_external_flags");
  if (!record(evidence) || evidence.schemaVersion !== 1) issues.push("missing_or_unsupported_evidence_schema");
  if (!text(appVersion) || evidence?.appVersion !== appVersion) issues.push("evidence_app_version_mismatch");
  if (!/^[a-f0-9]{40}$/u.test(sourceRevision || "") || evidence?.sourceRevision !== sourceRevision) issues.push("evidence_source_revision_mismatch");
  if (sourceClean !== true) issues.push("native_or_web_source_not_clean");

  const projects = nativeProjectFiles(nativeRoot);
  const evidenceRecords = record(evidence?.gates) ? evidence.gates : {};
  const required = [...EXTERNAL_GATES, ...Object.values(COMPILE_GATES)];
  if (Object.keys(evidenceRecords).some(name => !required.includes(name))) issues.push("unknown_evidence_gates");
  const checks = Object.fromEntries(required.map(name => {
    const item = evidenceRecords[name];
    const problems = [];
    if (EXTERNAL_GATES.includes(name) && gates?.external?.[name] !== true) problems.push("checklist_not_complete");
    if (!record(item) || item.status !== "passed") problems.push("missing_passed_record");
    if (item?.appVersion !== appVersion || item?.sourceRevision !== sourceRevision) problems.push("record_build_identity_mismatch");
    if (!text(item?.reviewedBy)) problems.push("missing_reviewer");
    const timestamp = typeof item?.recordedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(item.recordedAt)
      ? Date.parse(item.recordedAt) : NaN;
    if (!Number.isFinite(timestamp) || timestamp > now.getTime()
      || new Date(timestamp).toISOString().replace(".000Z", "Z") !== item.recordedAt.replace(".000Z", "Z")) problems.push("invalid_or_future_timestamp");
    const evidenceIssue = fileEvidenceIssue(item?.evidence, evidenceRoot);
    if (evidenceIssue) problems.push(`evidence_${evidenceIssue}`);
    const platform = Object.keys(COMPILE_GATES).find(key => COMPILE_GATES[key] === name);
    if (platform) {
      if (!text(item?.buildNumber) || !/^[1-9][0-9]*$/u.test(item.buildNumber)) problems.push("missing_native_build_number");
      const suffix = platform === "ios" ? ".ipa" : ".aab";
      if (typeof item?.artifact?.path !== "string" || !item.artifact.path.endsWith(suffix)) problems.push(`artifact_must_be_${suffix.slice(1)}`);
      const artifactIssue = fileEvidenceIssue(item?.artifact, evidenceRoot);
      if (artifactIssue) problems.push(`artifact_${artifactIssue}`);
    } else {
      for (const [target, compileGate] of Object.entries(COMPILE_GATES)) {
        const number = evidenceRecords[compileGate]?.buildNumber;
        const artifactHash = evidenceRecords[compileGate]?.artifact?.sha256;
        if (!text(number) || item?.builds?.[target]?.buildNumber !== number
          || !sha256(artifactHash) || item?.builds?.[target]?.artifactSha256 !== artifactHash) problems.push(`${target}_artifact_binding_mismatch`);
      }
    }
    return [name, { evidenceValidated: problems.length === 0, issues: problems }];
  }));
  const group = names => ({ validated: names.filter(name => checks[name].evidenceValidated).length, required: names.length });
  const groups = Object.fromEntries(Object.entries(EXTERNAL_GATE_GROUPS).map(([name, names]) => [name, group(names)]));
  groups.compiled = group(Object.values(COMPILE_GATES));
  return {
    complete: issues.length === 0 && Object.values(projects).every(item => item.present) && Object.values(checks).every(item => item.evidenceValidated),
    issues, projects, groups, checks,
  };
}
