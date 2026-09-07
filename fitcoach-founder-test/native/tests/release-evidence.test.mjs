import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BUILD } from "../../v040/core/constants.mjs";
import { CODE_GATES, EXTERNAL_GATES, COMPILE_GATES, evaluateReleaseEvidence, hashFile, sourceWorkingTreeClean } from "../scripts/release-evidence.mjs";

const nativeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const currentRevision = "a".repeat(40);
const generatedFiles = [
  "ios/App/App.xcodeproj/project.pbxproj", "android/settings.gradle", "android/build.gradle", "android/app/build.gradle",
  "android/gradlew", "android/gradle/wrapper/gradle-wrapper.properties", "android/gradle/wrapper/gradle-wrapper.jar",
];

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fitcoach-release-evidence-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, contents = "Synthetic test fixture, not actual release evidence.") => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    return { path: name, sha256: hashFile(file) };
  };
  for (const name of generatedFiles) write(name);
  const proof = write("evidence/report.txt");
  const artifacts = { ios: write("evidence/fitcoach.ipa"), android: write("evidence/fitcoach.aab") };
  const identity = { appVersion: BUILD, sourceRevision: currentRevision };
  const builds = Object.fromEntries(Object.entries(artifacts).map(([platform, artifact]) => [platform, { buildNumber: "7", artifactSha256: artifact.sha256 }]));
  const entry = () => ({ ...identity, status: "passed", recordedAt: "2026-09-06T12:00:00Z", reviewedBy: "Fixture reviewer", evidence: { ...proof }, builds: structuredClone(builds) });
  const evidence = { schemaVersion: 1, ...identity, gates: Object.fromEntries(EXTERNAL_GATES.map(name => [name, entry()])) };
  for (const [platform, name] of Object.entries(COMPILE_GATES)) evidence.gates[name] = { ...entry(), buildNumber: "7", artifact: artifacts[platform] };
  const options = {
    gates: { schemaVersion: 1, code: Object.fromEntries(CODE_GATES.map(name => [name, true])), external: Object.fromEntries(EXTERNAL_GATES.map(name => [name, true])) },
    evidence, ...identity, sourceClean: true, nativeRoot: root, evidenceRoot: root, now: new Date("2026-09-07T12:00:00Z"),
  };
  return { root, options, write, evaluate: () => evaluateReleaseEvidence(options) };
}

test("complete synthetic evidence is traceable across configuration, compilation, device and store groups", t => {
  const f = fixture(t);
  const result = f.evaluate();
  assert.equal(result.complete, true);
  assert.equal(EXTERNAL_GATES.length, 30);
  assert.deepEqual(result.groups.compiled, { validated: 2, required: 2 });
  assert.equal(Object.keys(result.checks).length, 32);
});

test("flipping all historical flags cannot replace evidence or remove required gates", t => {
  const f = fixture(t);
  f.options.evidence = null;
  assert.equal(f.evaluate().complete, false);
  assert.equal(f.evaluate().groups.compiled.validated, 0);
  for (const value of [undefined, "true", 1]) {
    f.options.gates.external.privacyPolicyPublished = value;
    assert.ok(f.evaluate().issues.includes("invalid_or_missing_external_flags"));
  }
  delete f.options.gates.external.privacyPolicyPublished;
  assert.equal(Object.keys(f.evaluate().checks).length, 32);
  f.options.gates.schemaVersion = 2;
  assert.ok(f.evaluate().issues.includes("unsupported_checklist_schema"));
});

test("manifest and each gate must match the current version and revision, with clean app sources", t => {
  const f = fixture(t);
  for (const field of ["appVersion", "sourceRevision"]) {
    const saved = f.options.evidence[field];
    f.options.evidence[field] = "stale";
    assert.equal(f.evaluate().complete, false);
    f.options.evidence[field] = saved;
    f.options.evidence.gates.privacyPolicyPublished[field] = "stale";
    assert.ok(f.evaluate().checks.privacyPolicyPublished.issues.includes("record_build_identity_mismatch"));
    f.options.evidence.gates.privacyPolicyPublished[field] = saved;
  }
  f.options.sourceClean = false;
  assert.ok(f.evaluate().issues.includes("native_or_web_source_not_clean"));
});

test("changes to bundled legal pages, web icons, native assets and store metadata invalidate source identity", t => {
  const f = fixture(t);
  const repository = path.join(f.root, "source-repository");
  const native = path.join(repository, "fitcoach-founder-test/native");
  fs.mkdirSync(native, { recursive: true });
  execFileSync("git", ["init", "--quiet", repository]);
  assert.equal(sourceWorkingTreeClean(native), true);
  for (const name of ["../legal/privacy.html", "../assets/icon-symbio.svg", "assets/store/app-store-1024.png", "release/app-store-metadata.json"]) {
    const file = path.resolve(native, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "Changed bundled release input");
    assert.equal(sourceWorkingTreeClean(native), false, name);
    fs.unlinkSync(file);
    assert.equal(sourceWorkingTreeClean(native), true, name);
  }
});

test("every record requires a named reviewer and a valid non-future UTC timestamp", t => {
  const f = fixture(t);
  const item = f.options.evidence.gates.privacyPolicyPublished;
  for (const value of [undefined, "yesterday", "2026-02-30T12:00:00Z", "2099-01-01T00:00:00Z"]) {
    item.recordedAt = value;
    assert.ok(f.evaluate().checks.privacyPolicyPublished.issues.includes("invalid_or_future_timestamp"));
  }
  item.reviewedBy = " ";
  assert.ok(f.evaluate().checks.privacyPolicyPublished.issues.includes("missing_reviewer"));
});

test("altered, missing, empty and non-file evidence cannot validate a gate", t => {
  const f = fixture(t);
  const file = path.join(f.root, "evidence/report.txt");
  fs.appendFileSync(file, "Changed after review");
  assert.ok(f.evaluate().checks.privacyPolicyPublished.issues.includes("evidence_sha256_mismatch"));
  fs.writeFileSync(file, "");
  assert.ok(f.evaluate().checks.privacyPolicyPublished.issues.includes("evidence_missing_or_empty_file"));
  fs.unlinkSync(file);
  assert.ok(f.evaluate().checks.privacyPolicyPublished.issues.includes("evidence_unreadable_file"));
  fs.mkdirSync(file);
  assert.ok(f.evaluate().checks.privacyPolicyPublished.issues.includes("evidence_missing_or_empty_file"));
});

test("evidence rejects absolute, traversal and escaping symlink references", t => {
  const f = fixture(t);
  const item = f.options.evidence.gates.privacyPolicyPublished;
  for (const value of [path.join(f.root, "evidence/report.txt"), "../report.txt"]) {
    item.evidence.path = value;
    assert.ok(f.evaluate().checks.privacyPolicyPublished.issues.includes("evidence_path_outside_evidence_root"));
  }
  fs.symlinkSync(os.tmpdir(), path.join(f.root, "outside"));
  item.evidence.path = "outside";
  assert.ok(f.evaluate().checks.privacyPolicyPublished.issues.includes("evidence_path_outside_evidence_root"));
});

test("generated projects must exist and do not substitute for successful compile records", t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.root, generatedFiles[0]));
  assert.equal(f.evaluate().projects.ios.present, false);
  assert.equal(f.evaluate().complete, false);
  f.write(generatedFiles[0]);
  fs.writeFileSync(path.join(f.root, "android/gradlew"), "");
  assert.equal(f.evaluate().projects.android.present, false);
  f.write("android/gradlew");
  delete f.options.evidence.gates.iosReleaseArchiveBuilt;
  assert.equal(f.evaluate().groups.compiled.validated, 1);
  assert.equal(f.evaluate().complete, false);
});

test("both compiled artifacts and all later gate bindings must match the reviewed native builds", t => {
  const f = fixture(t);
  const compilation = f.options.evidence.gates.androidReleaseBundleBuilt;
  compilation.status = "failed";
  assert.equal(f.evaluate().complete, false);
  compilation.status = "passed";
  compilation.artifact.path = 42;
  assert.ok(f.evaluate().checks.androidReleaseBundleBuilt.issues.includes("artifact_must_be_aab"));
  compilation.artifact.path = "evidence/fitcoach.aab";
  fs.appendFileSync(path.join(f.root, compilation.artifact.path), "tampered");
  assert.ok(f.evaluate().checks.androidReleaseBundleBuilt.issues.includes("artifact_sha256_mismatch"));
  f.options.evidence.gates.realIphoneVoiceHealthTestPassed.builds.ios.buildNumber = "8";
  assert.ok(f.evaluate().checks.realIphoneVoiceHealthTestPassed.issues.includes("ios_artifact_binding_mismatch"));
});

test("JSON command preserves successful source verification while strict release evidence fails", () => {
  for (const strict of [false, true]) {
    const result = spawnSync(process.execPath, [path.join(nativeRoot, "scripts/release-readiness.mjs"), "--json", ...(strict ? ["--strict"] : [])], { encoding: "utf8", env: { ...process.env, FITCOACH_NATIVE_RELEASE: "0" } });
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, strict ? 1 : 0, result.stderr);
    assert.equal(report.appVersion, BUILD);
    assert.equal(report.kitTargetVersion, "0.5.4");
    assert.equal(report.sourceVerified, true);
    assert.equal(report.releaseEvidenceComplete, false);
    assert.equal(report.checklist.required, 30);
  }
});

test("malformed evidence and invalid arguments return one JSON report and fail", t => {
  const f = fixture(t);
  f.write("malformed.json", "{bad json");
  for (const args of [["--evidence", path.join(f.root, "malformed.json")], ["--bogus"], ["--evidence"]]) {
    const result = spawnSync(process.execPath, [path.join(nativeRoot, "scripts/release-readiness.mjs"), "--json", ...args], { encoding: "utf8" });
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 1);
    assert.equal(report.releaseEvidenceComplete, false);
    assert.ok(report.inputError);
  }
});

test("an incomplete source copy without runtime constants still emits a JSON report", t => {
  const f = fixture(t);
  for (const name of ["release-readiness.mjs", "release-evidence.mjs"]) {
    f.write(`native/scripts/${name}`, fs.readFileSync(path.join(nativeRoot, "scripts", name), "utf8"));
  }
  f.write("native/release/release-gates.json", JSON.stringify(f.options.gates));
  const result = spawnSync(process.execPath, [path.join(f.root, "native/scripts/release-readiness.mjs"), "--strict", "--json"], { encoding: "utf8" });
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(report.appVersion, null);
  assert.equal(report.sourceVerified, false);
  assert.equal(report.releaseEvidenceComplete, false);
  assert.ok(report.source.missingFiles.length > 0);
});
