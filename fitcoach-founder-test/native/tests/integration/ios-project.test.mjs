import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  IOS_SOURCE_FILES,
  IOS_TEMPLATE_ICONS,
  IOS_TEMPLATE_SHA256,
} from "../../scripts/prepare-ios-project.mjs";
import {
  IOS_RUNTIME_FILES,
  IOS_RUNTIME_TARGET,
  iosRuntimeScheme,
  iosAppScheme,
} from "../../scripts/ios-runtime-project.mjs";

if (!process.env.FITCOACH_TEST_IOS_PROJECT || process.platform !== "darwin")
  throw new Error(
    "A real prepared iOS project and macOS plist parser are required",
  );
const root = path.resolve(process.env.FITCOACH_TEST_IOS_PROJECT),
  project = path.join(root, "ios/App"),
  app = path.join(project, "App");
const read = (file) => fs.readFileSync(path.join(project, file), "utf8");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const plist = (file) =>
  JSON.parse(
    execFileSync(
      "/usr/bin/plutil",
      ["-convert", "json", "-o", "-", path.join(project, file)],
      { encoding: "utf8" },
    ),
  );
const report = JSON.parse(
  fs.readFileSync(path.join(root, "fitcoach-ios-inputs.json"), "utf8"),
);

test("actual Xcode project parses and includes both native Swift sources and privacy in its build target", () => {
  const pbx = plist("App.xcodeproj/project.pbxproj"),
    objects = pbx.objects;
  const targets = Object.values(objects).filter(
    (o) => o.isa === "PBXNativeTarget",
  );
  assert.equal(targets.length, report.runtimeTests ? 2 : 1);
  const target = targets.find((item) => item.name === "App");
  assert.equal(target.name, "App");
  const phases = target.buildPhases.map((id) => objects[id]);
  const paths = (isa) =>
    phases
      .filter((o) => o.isa === isa)
      .flatMap((phase) =>
        phase.files.map((id) => objects[objects[id].fileRef]?.path),
      );
  assert.deepEqual(
    paths("PBXSourcesBuildPhase").sort(),
    [
      "AppDelegate.swift",
      "SceneDelegate.swift",
      "FitCoachBridgeViewController.swift",
      "FitCoachNativePlugin.swift",
    ].sort(),
  );
  assert.ok(paths("PBXResourcesBuildPhase").includes("PrivacyInfo.xcprivacy"));
  assert.ok(paths("PBXResourcesBuildPhase").includes("public"));
  const configurations = objects[
    target.buildConfigurationList
  ].buildConfigurations.map((id) => objects[id].buildSettings);
  assert.equal(configurations.length, 2);
  for (const settings of configurations) {
    assert.equal(settings.PRODUCT_BUNDLE_IDENTIFIER, "com.symbio.fitcoach.dev");
    assert.equal(settings.IPHONEOS_DEPLOYMENT_TARGET, "17.0");
    assert.equal(settings.MARKETING_VERSION, report.appVersion);
    assert.equal(settings.CODE_SIGNING_ALLOWED, "NO");
    assert.equal(settings.SUPPORTED_PLATFORMS, "iphonesimulator");
    assert.equal(settings.DEVELOPMENT_TEAM, undefined);
    assert.equal(settings.CODE_SIGN_ENTITLEMENTS, "App/App.entitlements");
  }
  assert.equal(
    report.projectSha256,
    hash(read("App.xcodeproj/project.pbxproj")),
  );
  assert.equal(report.templateSha256, IOS_TEMPLATE_SHA256);
  assert.equal(report.simulatorOnly, true);
  assert.equal(report.signingAllowed, false);
});

test("optional runtime target is hosted by the actual app and cannot ship its probes as application source", () => {
  const objects = plist("App.xcodeproj/project.pbxproj").objects;
  const target = objects[IOS_RUNTIME_TARGET];
  if (!report.runtimeTests) {
    assert.equal(target, undefined);
    assert.equal(
      fs.existsSync(path.join(project, "FitCoachRuntimeTests")),
      false,
    );
    return;
  }
  assert.equal(target.name, "FitCoachRuntimeTests");
  assert.equal(target.productType, "com.apple.product-type.bundle.unit-test");
  const appTarget = Object.values(objects).find(
    (item) => item.isa === "PBXNativeTarget" && item.name === "App",
  );
  assert.equal(target.dependencies.length, 1);
  assert.equal(objects[objects[target.dependencies[0]].target].name, "App");
  assert.deepEqual(appTarget.dependencies, []);
  const phases = target.buildPhases.map((key) => objects[key]);
  const files = (isa) =>
    phases
      .filter((item) => item.isa === isa)
      .flatMap((phase) =>
        phase.files.map((key) => objects[objects[key].fileRef].path),
      );
  assert.deepEqual(files("PBXSourcesBuildPhase"), [
    "FitCoachRuntimeTests.swift",
  ]);
  assert.deepEqual(files("PBXResourcesBuildPhase"), ["ios-probes.js"]);
  for (const key of objects[target.buildConfigurationList]
    .buildConfigurations) {
    const settings = objects[key].buildSettings;
    assert.equal(settings.TEST_HOST, "$(BUILT_PRODUCTS_DIR)/App.app/App");
    assert.equal(settings.BUNDLE_LOADER, "$(TEST_HOST)");
    assert.equal(settings.CODE_SIGNING_ALLOWED, "NO");
    assert.equal(settings.IPHONEOS_DEPLOYMENT_TARGET, "17.0");
    assert.equal(settings.SUPPORTED_PLATFORMS, "iphonesimulator");
    assert.equal(settings.DEVELOPMENT_TEAM, undefined);
  }
  assert.deepEqual(
    report.runtimeFiles.map((item) => item.file),
    IOS_RUNTIME_FILES,
  );
  for (const item of report.runtimeFiles) {
    assert.equal(hash(read(`FitCoachRuntimeTests/${item.file}`)), item.sha256);
    assert.equal(
      hash(
        fs.readFileSync(new URL(`../runtime/${item.file}`, import.meta.url)),
      ),
      item.sha256,
    );
    assert.equal(fs.existsSync(path.join(app, item.file)), false);
    assert.equal(fs.existsSync(path.join(app, "public", item.file)), false);
  }
  assert.equal(
    read("App.xcodeproj/xcshareddata/xcschemes/FitCoachRuntime.xcscheme"),
    iosRuntimeScheme(),
  );
  assert.equal(
    read("App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"),
    iosAppScheme(),
  );
});

test("actual generated iOS launch, privacy, permissions and icons preserve reviewed source", () => {
  assert.deepEqual(
    report.sourceFiles.map((f) => f.file),
    IOS_SOURCE_FILES,
  );
  for (const item of report.sourceFiles) {
    assert.equal(
      item.sha256,
      hash(
        fs.readFileSync(
          new URL(`../../ios/App/App/${item.file}`, import.meta.url),
        ),
      ),
      `Generated project uses the current source: ${item.file}`,
    );
    let bytes = fs.readFileSync(path.join(app, item.file));
    if (item.file === "Info.plist")
      bytes = Buffer.from(
        bytes
          .toString()
          .replace(
            "<key>CFBundleDisplayName</key>\n  <string>FitCoach Dev</string>",
            "<key>CFBundleDisplayName</key>\n  <string>$(PRODUCT_NAME)</string>",
          ),
      );
    assert.equal(hash(bytes), item.sha256, item.file);
  }
  const info = plist("App/Info.plist"),
    privacy = plist("App/PrivacyInfo.xcprivacy");
  assert.equal(info.CFBundleDisplayName, "FitCoach Dev");
  assert.equal(info.UIMainStoryboardFile, "Main");
  assert.ok(info.NSMicrophoneUsageDescription);
  assert.ok(info.NSSpeechRecognitionUsageDescription);
  assert.ok(info.NSHealthShareUsageDescription);
  for (const key of [
    "UIBackgroundModes",
    "NSHealthUpdateUsageDescription",
    "NSAppTransportSecurity",
  ])
    assert.equal(info[key], undefined);
  assert.equal(privacy.NSPrivacyTracking, false);
  assert.match(
    read("App/Base.lproj/Main.storyboard"),
    /customClass="FitCoachBridgeViewController"/u,
  );
  assert.match(
    read("App/FitCoachBridgeViewController.swift"),
    /registerPluginInstance\(FitCoachNativePlugin\(\)\)/u,
  );
  for (const item of report.iconFiles)
    assert.equal(
      hash(
        fs.readFileSync(
          path.join(app, "Assets.xcassets/AppIcon.appiconset", item.file),
        ),
      ),
      item.sha256,
    );
  assert.deepEqual(
    fs.readdirSync(path.join(app, "Assets.xcassets/AppIcon.appiconset")).sort(),
    report.iconFiles.map((item) => item.file).sort(),
  );
  assert.equal(report.templateIconFiles.length, 2);
  for (const item of report.templateIconFiles) {
    assert.equal(item.sha256, IOS_TEMPLATE_ICONS[item.file]);
    assert.equal(
      item.archivePath,
      `fitcoach-template-reference/AppIcon.appiconset/${item.file}`,
    );
    assert.equal(
      hash(fs.readFileSync(path.join(root, item.archivePath))),
      item.sha256,
    );
  }
  assert.equal(
    hash(read("CapApp-SPM/Package.swift")),
    report.swiftPackageSha256,
  );
  assert.ok(read("CapApp-SPM/Package.swift").includes('exact: "8.5.1"'));
});

test("actual iOS package retains local launch and every verified app and media payload", async () => {
  const config = JSON.parse(read("App/capacitor.config.json"));
  assert.equal(config.server.url, undefined);
  assert.equal(config.server.cleartext, false);
  assert.equal(config.server.appStartPath, "/fitcoach-founder-test/index.html");
  const publicDir = path.join(app, "public");
  const { EXERCISE_MEDIA_MANIFEST: media } = await import(
    pathToFileURL(
      path.join(
        publicDir,
        "fitcoach-founder-test/v040/data/exercise-media-manifest.mjs",
      ),
    )
  );
  assert.equal(media.filter((item) => item.type === "poster").length, 100);
  assert.equal(media.filter((item) => item.type === "mp4").length, 59);
  const inventory = JSON.parse(
    fs.readFileSync(path.join(root, "dist/fitcoach-web-bundle.json"), "utf8"),
  );
  assert.equal(inventory.contentSha256, report.webContentSha256);
  for (const item of inventory.files) {
    const bytes = fs.readFileSync(path.join(publicDir, item.path));
    assert.equal(bytes.length, item.bytes, item.path);
    assert.equal(hash(bytes), item.sha256, item.path);
  }
});
