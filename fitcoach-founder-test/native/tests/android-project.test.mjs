import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  GRADLE_SHA256,
  patchBuildFiles,
  replaceOnce,
  reserveProject,
  validateDebugConfig,
} from "../scripts/prepare-android-project.mjs";

const read = (file) =>
  fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = {
  appId: "com.symbio.fitcoach.dev",
  appName: "FitCoach Dev",
  server: {
    androidScheme: "https",
    cleartext: false,
    appStartPath: "/fitcoach-founder-test/index.html",
  },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: true },
};
const inputs = () => ({
  rootBuild:
    "repositories { google(); mavenCentral() }\nclasspath 'com.android.tools.build:gradle:8.13.0'\n",
  appBuild:
    'namespace = "com.symbio.fitcoach.dev"\napplicationId "com.symbio.fitcoach.dev"\nversionName "1.0"',
  variables:
    "minSdkVersion = 24\ncompileSdkVersion = 36\ntargetSdkVersion = 36",
  wrapper:
    "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.3-all.zip\n",
  referenceRoot: read("android/reference-root-build.gradle"),
  referenceApp: read("android/reference-app-build.gradle"),
  appVersion: "0.7.3",
});

test("project preparation preserves reviewed toolchain, source namespace and development identity", () => {
  const result = patchBuildFiles(inputs());
  assert.match(result.rootBuild, /gradle:8\.13\.2/u);
  assert.match(result.rootBuild, /kotlin-gradle-plugin:2\.3\.20/u);
  assert.match(result.appBuild, /namespace = "com.symbio.fitcoach"/u);
  assert.match(result.appBuild, /applicationId "com.symbio.fitcoach.dev"/u);
  assert.match(result.appBuild, /jvmTarget = '21'/u);
  assert.match(result.appBuild, /versionName "0.7.3"/u);
  assert.match(result.variables, /minSdkVersion = 26/u);
  assert.ok(result.wrapper.includes(`distributionSha256Sum=${GRADLE_SHA256}`));
  assert.match(result.wrapper, /gradle-8\.14\.3-bin\.zip/u);
});

test("unknown or duplicate template markers and toolchain changes require review", () => {
  assert.throws(() => replaceOnce("a a", /a/u, "b", "test"), /2 matches/u);
  assert.throws(
    () => replaceOnce("none", /marker/u, "b", "test"),
    /0 matches/u,
  );
  for (const patch of [
    { rootBuild: "classpath 'com.android.tools.build:gradle:9.0.0'" },
    { appBuild: inputs().appBuild.repeat(2) },
    { variables: "minSdkVersion = 24" },
    { referenceApp: inputs().referenceApp.replaceAll("21", "17") },
    { wrapper: `${inputs().wrapper}distributionSha256Sum=wrong` },
    { appVersion: "1; injected" },
  ])
    assert.throws(() => patchBuildFiles({ ...inputs(), ...patch }));
});

test("development preparer cannot silently build production identity or use a hosted/cleartext app", () => {
  assert.doesNotThrow(() => validateDebugConfig(config));
  for (const patch of [
    { appId: "com.symbio.fitcoach" },
    { appName: "FitCoach" },
    { server: { ...config.server, url: "https://remote.invalid" } },
    { server: { ...config.server, cleartext: true } },
    { server: { ...config.server, appStartPath: "/" } },
    { android: { ...config.android, allowMixedContent: true } },
  ])
    assert.throws(() => validateDebugConfig({ ...config, ...patch }));
});

test("project destination cannot overwrite existing work, web artifacts or linked locations", (t) => {
  const temp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "fitcoach-android-test-")),
  );
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const bundle = path.join(temp, "bundle");
  fs.mkdirSync(bundle);
  const out = path.join(temp, "project");
  assert.equal(reserveProject(out, bundle), out);
  fs.writeFileSync(path.join(out, "keep"), "keep");
  assert.throws(() => reserveProject(out, bundle), /EEXIST/u);
  assert.equal(fs.readFileSync(path.join(out, "keep"), "utf8"), "keep");
  for (const destination of [temp, bundle, path.join(bundle, "nested")])
    assert.throws(() => reserveProject(destination, bundle), /overlaps/u);
  const link = path.join(temp, "linked");
  fs.symlinkSync(out, link);
  assert.throws(
    () => reserveProject(path.join(link, "new"), bundle),
    /symlinks/u,
  );
});

test("camera handoff is app-private and does not expose broad external storage", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml"),
    paths = read("android/app/src/main/res/xml/file_paths.xml");
  assert.match(
    manifest,
    /android:authorities="\$\{applicationId\}\.fileprovider"/u,
  );
  const provider = manifest.match(/<provider[\s\S]*?<\/provider>/u)?.[0];
  assert.match(provider, /android:exported="false"/u);
  assert.match(provider, /android:grantUriPermissions="true"/u);
  assert.match(
    paths,
    /<external-files-path name="capture_images" path="Pictures\/"/u,
  );
  assert.doesNotMatch(
    paths,
    /<external-path|<root-path|<cache-path|path="\."/u,
  );
  assert.doesNotMatch(
    manifest,
    /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/u,
  );
});
