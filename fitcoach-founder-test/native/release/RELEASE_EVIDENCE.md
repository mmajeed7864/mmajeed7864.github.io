# Native release evidence

`release-gates.json` retains the original 0.5.4 source-kit checklist and its history. The readiness command reads the actual app version from `v040/core/constants.mjs`; it reports that version separately from the kit target. Neither a version change nor a checked box proves a native build or store result.

From `native/`:

```sh
node scripts/release-readiness.mjs
node scripts/release-readiness.mjs --json
node scripts/release-readiness.mjs --strict --json --evidence /path/to/private-release/release-evidence.json
```

Normal mode preserves source-kit verification for development. Strict mode also requires complete release evidence. JSON output is one report with separate `sourceVerified` and `releaseEvidenceComplete` fields, per-gate problems, generated-project presence, and configuration/compiled/device/store evidence counts. Invalid JSON or arguments fail the command. Missing release evidence keeps normal source verification usable but makes strict mode fail.

## Required evidence

The command maintains the 30 required external gate names independently of the editable checklist. Every flag must be a boolean and true, and every gate needs a corresponding passed evidence record. Removing a gate or changing the checklist schema cannot bypass a requirement. Two additional records are required: `iosReleaseArchiveBuilt` and `androidReleaseBundleBuilt`.

The evidence manifest has `schemaVersion: 1`, `appVersion`, the full 40-character `sourceRevision`, and a `gates` object keyed by those 32 names. Every record contains:

| Field | Required value |
| --- | --- |
| `status` | `passed`, based on an actual reviewed result |
| `appVersion` | Current app `BUILD` |
| `sourceRevision` | Current Git `HEAD`, matching the manifest |
| `recordedAt` | Valid UTC ISO timestamp, not in the future |
| `reviewedBy` | Named reviewer or accountable build service |
| `evidence` | `{ "path": "reports/result.txt", "sha256": "<64 lowercase hex characters>" }` |

Both compilation records also require a positive integer string `buildNumber` and an `artifact` reference with the same path/hash structure: the exported `.ipa` for iOS or `.aab` for Android. Their evidence report should identify the build command, toolchain, signing identity, result, app version, native build number, source revision and artifact hash. Keep credentials and private keys out of reports.

Each of the 30 external records must bind to those exact artifacts with:

```json
{
  "builds": {
    "ios": { "buildNumber": "<tested iOS build number>", "artifactSha256": "<tested IPA SHA-256>" },
    "android": { "buildNumber": "<tested Android build number>", "artifactSha256": "<tested AAB SHA-256>" }
  }
}
```

These placeholders intentionally fail validation. Reuse a report for multiple gates only when it actually contains each named result. Older account/legal approvals may be referenced in a fresh review confirming that they still cover the current version and both artifacts. A later binary, build number, source change or altered report requires renewed evidence; do not simply relabel old device tests.

All reference paths are relative to the evidence manifest's directory. They must resolve to nonempty regular files within that directory, with matching SHA-256 hashes. Absolute paths, `..` traversal and symlinks that escape the directory are rejected. Files are hashed without printing their contents. The manifest and reports can stay in a private evidence directory outside the repository; `--evidence` selects it. The default is `native/release/release-evidence.json`, which is intentionally absent until real evidence is collected.

Finalize and commit the tested app source before collecting evidence. The command independently resolves `HEAD` and rejects staged, unstaged or untracked changes to the web runtime, bundled assets/legal pages, manifests, native bridges/projects/assets, Capacitor configuration, native dependency files, and store metadata/product JSON. Store the evidence after that source commit; committing the evidence itself changes `HEAD` and requires a current manifest. Readiness scripts, tests and documentation are not app binary inputs.

## Proof boundaries

The default generated Capacitor projects must be present: `ios/App/App.xcodeproj/project.pbxproj`, Android root/app/settings Gradle files, `gradlew`, and both Gradle wrapper files. Reference bridge files and reference Gradle snippets do not satisfy that check. Project presence is separate from compilation records, and compilation records are separate from device/store records.

Hashes establish local file integrity and traceability. This command does not compile binaries, execute device tests, authenticate a reviewer's identity, fetch remote services, or independently establish that a report is truthful. A complete report means the required evidence records validate against the current source and artifacts; it is not Apple or Google approval. Reviewers must inspect the underlying results before submission. The JSON field is deliberately named `releaseEvidenceComplete`, not store approval.
