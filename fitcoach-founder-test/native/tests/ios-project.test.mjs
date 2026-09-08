import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  IOS_SOURCE_FILES,
  installIOSIcons,
  patchIOSProject,
  replaceExpected,
  reserveIOSProject,
  validateIOSDebugConfig,
} from "../scripts/prepare-ios-project.mjs";

const config = {
  appId: "com.symbio.fitcoach.dev",
  appName: "FitCoach Dev",
  webDir: "dist",
  ios: { scheme: "FitCoachDev" },
  server: {
    cleartext: false,
    appStartPath: "/fitcoach-founder-test/index.html",
  },
};
const fixture = () =>
  [
    "IPHONEOS_DEPLOYMENT_TARGET = 15.0;\n".repeat(4),
    "MARKETING_VERSION = 1.0;\n".repeat(2),
    "PRODUCT_BUNDLE_IDENTIFIER = com.symbio.fitcoach.dev;\n".repeat(2),
    'CODE_SIGN_IDENTITY = "iPhone Developer";\n'.repeat(2),
    "CODE_SIGN_STYLE = Automatic;\n".repeat(2),
    "SDKROOT = iphoneos;\n".repeat(2),
    "/* End PBXBuildFile section */\n/* End PBXFileReference section */\n",
    "\t\t\t\t9582B6822FE993A50072D4E8 /* SceneDelegate.swift */,\n",
    "\t\t\t\t9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */,\n",
    "\t\t\t\t2FAD9763203C412B000D30F8 /* config.xml in Resources */,\n",
  ].join("");

test("iOS project integrates actual bridge/privacy sources with an unsigned simulator-only identity", () => {
  const result = patchIOSProject(fixture(), "0.7.3");
  assert.equal(
    (result.match(/IPHONEOS_DEPLOYMENT_TARGET = 17\.0/g) || []).length,
    4,
  );
  assert.equal((result.match(/MARKETING_VERSION = 0\.7\.3/g) || []).length, 2);
  assert.equal((result.match(/CODE_SIGNING_ALLOWED = NO/g) || []).length, 4);
  assert.equal(
    (result.match(/SUPPORTED_PLATFORMS = iphonesimulator/g) || []).length,
    2,
  );
  for (const name of [
    "FitCoachNativePlugin.swift",
    "FitCoachBridgeViewController.swift",
  ])
    assert.ok(result.includes(`${name} in Sources`));
  assert.ok(result.includes("PrivacyInfo.xcprivacy in Resources"));
  assert.ok(result.includes("CODE_SIGN_ENTITLEMENTS = App/App.entitlements"));
  assert.doesNotMatch(
    result,
    /DEVELOPMENT_TEAM|CODE_SIGN_STYLE = Automatic|SDKROOT = iphoneos;/u,
  );
});

test("new generated icon sets contain only approved icons and preserve the pinned template outside the app", (t) => {
  const output = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "fitcoach-ios-icons-")),
  );
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const iconDir = path.join(
    output,
    "ios/App/App/Assets.xcassets/AppIcon.appiconset",
  );
  fs.mkdirSync(iconDir, { recursive: true });
  const template = new URL(
    "../node_modules/@capacitor/cli/assets/ios-spm-template.tar.gz",
    import.meta.url,
  );
  for (const file of ["AppIcon-512@2x.png", "Contents.json"])
    fs.writeFileSync(
      path.join(iconDir, file),
      execFileSync("tar", [
        "-xzOf",
        fileURLToPath(template),
        `App/App/Assets.xcassets/AppIcon.appiconset/${file}`,
      ]),
    );
  const source = new URL("../assets/ios/AppIcon.appiconset/", import.meta.url);
  const icons = fs
    .readdirSync(source)
    .map((file) => ({ file, bytes: fs.readFileSync(new URL(file, source)) }));
  for (const bad of [
    [],
    [...icons, icons[0]],
    [...icons, { file: "../escape.png", bytes: Buffer.from("x") }],
    icons.filter((item) => item.file !== "Contents.json"),
  ])
    assert.throws(() => installIOSIcons(output, bad));
  fs.writeFileSync(path.join(iconDir, "unexpected.png"), "preserve");
  assert.throws(() => installIOSIcons(output, icons));
  fs.renameSync(
    path.join(iconDir, "unexpected.png"),
    path.join(output, "preserved-unexpected.png"),
  );
  const original = fs.readFileSync(path.join(iconDir, "AppIcon-512@2x.png"));
  fs.writeFileSync(path.join(iconDir, "AppIcon-512@2x.png"), "changed");
  assert.throws(() => installIOSIcons(output, icons));
  fs.writeFileSync(path.join(iconDir, "AppIcon-512@2x.png"), original);
  const archive = path.join(output, "fitcoach-template-reference");
  fs.mkdirSync(archive);
  fs.writeFileSync(path.join(archive, "keep"), "existing archive");
  assert.throws(() => installIOSIcons(output, icons));
  fs.renameSync(archive, path.join(output, "preserved-existing-archive"));
  const report = installIOSIcons(output, icons);
  assert.equal(report.length, 2);
  assert.deepEqual(
    fs.readdirSync(iconDir).sort(),
    icons.map((item) => item.file).sort(),
  );
  assert.deepEqual(
    fs.readFileSync(path.join(output, report[0].archivePath)),
    original,
  );
  for (const { file, bytes } of icons)
    assert.deepEqual(fs.readFileSync(path.join(iconDir, file)), bytes);
  assert.throws(() => installIOSIcons(output, icons));
  assert.equal(
    fs.readFileSync(path.join(output, "preserved-unexpected.png"), "utf8"),
    "preserve",
  );
  assert.equal(
    fs.readFileSync(
      path.join(output, "preserved-existing-archive/keep"),
      "utf8",
    ),
    "existing archive",
  );
});

test("iOS voice uses current SDK symbols without raising the supported OS baseline or changing audio categories", () => {
  const plugin = fs.readFileSync(
    new URL("../ios/App/App/FitCoachNativePlugin.swift", import.meta.url),
    "utf8",
  );
  assert.match(plugin, /AVAudioApplication\.requestRecordPermission/u);
  assert.doesNotMatch(
    plugin,
    /audioSession\.requestRecordPermission|\.allowBluetooth\b/u,
  );
  assert.equal((plugin.match(/\.allowBluetoothHFP/g) || []).length, 2);
  assert.match(plugin, /\[\.defaultToSpeaker, \.allowBluetoothHFP\]/u);
  assert.match(
    plugin,
    /\[\.allowBluetoothA2DP, \.defaultToSpeaker, \.allowBluetoothHFP\]/u,
  );
  assert.match(plugin, /setCategory\(\.playback, mode: \.spokenAudio\)/u);
  assert.match(
    patchIOSProject(fixture(), "0.7.3"),
    /IPHONEOS_DEPLOYMENT_TARGET = 17\.0;/u,
  );
});

test("changed iOS templates, repeated integration and unsafe versions fail rather than silently patching", () => {
  for (const source of [
    fixture().replace("15.0", "18.0"),
    fixture().repeat(2),
    fixture() + "DEVELOPMENT_TEAM = unknown;",
    fixture() + "PBXShellScriptBuildPhase",
    patchIOSProject(fixture(), "0.7.3"),
  ])
    assert.throws(() => patchIOSProject(source, "0.7.3"));
  assert.throws(() => patchIOSProject(fixture(), "1; command"));
  assert.throws(() => replaceExpected("missing", "a", "b"));
  assert.throws(() => replaceExpected("a a", "a", "b"));
});

test("iOS configuration cannot silently use production signing, external navigation or alternate project paths", () => {
  assert.doesNotThrow(() => validateIOSDebugConfig(config));
  for (const patch of [
    { appId: "com.symbio.fitcoach" },
    { appName: "FitCoach" },
    { webDir: "private" },
    { ios: { ...config.ios, path: "../existing" } },
    { ios: { ...config.ios, scheme: "FitCoach" } },
    { ios: { ...config.ios, buildOptions: { signingStyle: "automatic" } } },
    ...[
      { url: "https://remote.invalid" },
      { hostname: "other.invalid" },
      { allowNavigation: ["*"] },
      { cleartext: true },
      { appStartPath: "/" },
      { iosScheme: "https" },
    ].map((server) => ({ server: { ...config.server, ...server } })),
    { experimental: {} },
    { cordova: {} },
  ])
    assert.throws(() => validateIOSDebugConfig({ ...config, ...patch }));
});

test("iOS destination reservation preserves source, existing projects, bundles and symlink targets", (t) => {
  const temp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "fitcoach-ios-test-")),
  );
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const bundle = path.join(temp, "bundle"),
    output = path.join(temp, "output");
  fs.mkdirSync(bundle);
  fs.writeFileSync(path.join(bundle, "keep"), "retained");
  assert.equal(reserveIOSProject(output, bundle), output);
  fs.writeFileSync(path.join(output, "keep"), "retained");
  for (const bad of [output, bundle, path.join(bundle, "nested"), temp])
    assert.throws(() => reserveIOSProject(bad, bundle));
  const link = path.join(temp, "link");
  fs.symlinkSync(output, link, "dir");
  assert.throws(() => reserveIOSProject(path.join(link, "child"), bundle));
  assert.equal(fs.readFileSync(path.join(output, "keep"), "utf8"), "retained");
  assert.equal(fs.readFileSync(path.join(bundle, "keep"), "utf8"), "retained");
});

test("iOS integration inventory retains launch, native features, privacy and existing scope", () => {
  assert.equal(IOS_SOURCE_FILES.length, 9);
  for (const file of IOS_SOURCE_FILES)
    assert.ok(
      fs.statSync(new URL(`../ios/App/App/${file}`, import.meta.url)).isFile(),
    );
  const plugin = fs.readFileSync(
    new URL("../ios/App/App/FitCoachNativePlugin.swift", import.meta.url),
    "utf8",
  );
  assert.match(plugin, /import HealthKit/u);
  assert.match(plugin, /import StoreKit/u);
  assert.match(plugin, /import Security/u);
  const prep = fs.readFileSync(
    new URL("../scripts/prepare-ios-project.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    prep,
    /allowProvisioningUpdates|accept.*license|--force|fs\.rmSync|fs\.unlinkSync/u,
  );
  assert.ok(prep.includes('exact: "8.5.1"'));
});

test("iOS workflow evaluates runner paths only inside runner-time steps", () => {
  const workflow = fs.readFileSync(
    new URL(
      "../../../.github/workflows/fitcoach-ios-build.yml",
      import.meta.url,
    ),
    "utf8",
  );
  const [jobConfig, steps] = workflow.split("    steps:\n");
  assert.ok(steps, "Expected the iOS job's steps");
  // GitHub rejects runner context in jobs.<id>.env before assigning a runner.
  assert.doesNotMatch(jobConfig, /\$\{\{\s*runner\./u);
  for (const step of steps.split(/\n      - /u)) {
    for (const name of ["FITCOACH_TEST_IOS_PROJECT", "FITCOACH_IOS_DERIVED"]) {
      if (!step.includes(`$${name}`)) continue;
      assert.match(step, /\n        env:\n/u);
      assert.ok(
        step.includes(
          `          ${name}: ` + "${{ runner.temp }}/fitcoach-ios",
        ),
        `${name} must be supplied by that step's environment`,
      );
    }
  }
});

test("bundle CI installs the locked Capacitor template before running native tests", () => {
  const workflow = fs.readFileSync(
    new URL(
      "../../../.github/workflows/fitcoach-bundle-integrity.yml",
      import.meta.url,
    ),
    "utf8",
  );
  const check = workflow.slice(
    workflow.indexOf("- name: Verify native bridge"),
    workflow.indexOf("- name: Audit production native dependencies"),
  );
  const install = check.indexOf("npm ci --ignore-scripts --no-audit --no-fund");
  assert.ok(
    install >= 0 && check.indexOf("node --test tests/*.test.mjs") > install,
  );
  assert.match(check, /working-directory: fitcoach-founder-test\/native/u);
  assert.match(check, /node scripts\/release-readiness\.mjs/u);
  assert.equal((workflow.match(/npm ci /gu) || []).length, 1);
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/u);
});
