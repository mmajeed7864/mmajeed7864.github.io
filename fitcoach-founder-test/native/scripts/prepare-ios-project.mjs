import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { reserveOutput, verifyLosslessBundle } from "./lossless-web-bundle.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = path.resolve(ROOT, "..");
const require = createRequire(path.join(ROOT, "package.json"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const inside = (parent, child) =>
  child === parent || child.startsWith(`${parent}${path.sep}`);
export const IOS_TEMPLATE_SHA256 =
  "24187638fe233b82991b568d4d8b842824faf1048b122e69e379863a1b2836f1";
export const IOS_TEMPLATE_ICONS = Object.freeze({
  "AppIcon-512@2x.png":
    "29e4777e319de3ee5a52c3a8004ec19d0568414004257e36d7c94a077d71c93b",
  "Contents.json":
    "5c09bec6eede599b14fa9e4c44b03e7febebc930615a0cd70f02981c09dfe48a",
});
export const IOS_SOURCE_FILES = Object.freeze([
  "AppDelegate.swift",
  "SceneDelegate.swift",
  "FitCoachBridgeViewController.swift",
  "FitCoachNativePlugin.swift",
  "Info.plist",
  "PrivacyInfo.xcprivacy",
  "App.entitlements",
  "Base.lproj/Main.storyboard",
  "Base.lproj/LaunchScreen.storyboard",
]);

function regular(file) {
  if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== file)
    throw new Error(`Not a regular unlinked input: ${file}`);
  return file;
}

export function replaceExpected(source, before, after, count = 1) {
  if (source.split(before).length - 1 !== count)
    throw new Error(`Unreviewed iOS template marker: ${before}`);
  return source.split(before).join(after);
}

export function validateIOSDebugConfig(config) {
  if (
    config.appId !== "com.symbio.fitcoach.dev" ||
    config.appName !== "FitCoach Dev"
  )
    throw new Error("Only the existing development identity can be prepared");
  if (
    config.webDir !== "dist" ||
    (config.ios?.path !== undefined && config.ios.path !== "ios") ||
    config.ios?.buildOptions !== undefined ||
    config.ios?.scheme !== "FitCoachDev"
  )
    throw new Error("Unreviewed iOS path, scheme or signing configuration");
  if (
    config.server?.url ||
    config.server?.allowNavigation !== undefined ||
    (config.server?.hostname !== undefined &&
      config.server.hostname !== "localhost") ||
    (config.server?.iosScheme !== undefined &&
      config.server.iosScheme !== "capacitor") ||
    config.server?.cleartext !== false ||
    config.server?.appStartPath !== "/fitcoach-founder-test/index.html"
  )
    throw new Error("Only the local packaged iOS origin may launch");
  if (config.experimental !== undefined || config.cordova !== undefined)
    throw new Error(
      "Additional native plugins/toolchain settings require review",
    );
}

export function reserveIOSProject(destination, bundle) {
  const output = path.resolve(destination),
    input = fs.realpathSync(bundle);
  if (inside(APP, output) || inside(input, output) || inside(output, input))
    throw new Error("iOS output overlaps source or the web bundle");
  return reserveOutput(output, APP);
}

export function installIOSIcons(output, icons) {
  const root = path.resolve(output);
  if (fs.realpathSync(root) !== root || inside(APP, root))
    throw new Error(
      "Icons require an unlinked generated output outside source",
    );
  const names = icons.map((item) => item.file);
  if (new Set(names).size !== names.length || !names.includes("Contents.json"))
    throw new Error("Incomplete or duplicate reviewed icon inventory");
  for (const { file, bytes } of icons)
    if (
      !/^[a-zA-Z0-9@._-]+\.png$|^Contents\.json$/u.test(file) ||
      !Buffer.isBuffer(bytes)
    )
      throw new Error("Unsafe reviewed icon input");
  const manifest = JSON.parse(
    icons.find((item) => item.file === "Contents.json").bytes,
  );
  const expected = [
    ...new Set(manifest.images.map((image) => image.filename)),
    "Contents.json",
  ].sort();
  if (JSON.stringify([...names].sort()) !== JSON.stringify(expected))
    throw new Error("Reviewed icon files do not match their manifest");
  const iconDir = path.join(
    root,
    "ios/App/App/Assets.xcassets/AppIcon.appiconset",
  );
  const originals = Object.entries(IOS_TEMPLATE_ICONS);
  if (
    JSON.stringify(fs.readdirSync(iconDir).sort()) !==
    JSON.stringify(originals.map(([file]) => file).sort())
  )
    throw new Error("Generated icon set differs from the pinned template");
  for (const [file, expectedHash] of originals)
    if (
      hash(fs.readFileSync(regular(path.join(iconDir, file)))) !== expectedHash
    )
      throw new Error("Generated icon bytes differ from the pinned template");
  // Only reached for a freshly generated, checksum-verified template. Preserve
  // the entire original set outside the app instead of deleting or shipping it.
  const archive = path.join(root, "fitcoach-template-reference");
  fs.mkdirSync(archive);
  fs.renameSync(iconDir, path.join(archive, "AppIcon.appiconset"));
  fs.mkdirSync(iconDir);
  for (const { file, bytes } of icons)
    fs.writeFileSync(path.join(iconDir, file), bytes, { flag: "wx" });
  return originals.map(([file, sha256]) => ({
    file,
    sha256,
    archivePath: `fitcoach-template-reference/AppIcon.appiconset/${file}`,
  }));
}

export function patchIOSProject(source, appVersion) {
  if (!/^\d+\.\d+\.\d+$/u.test(appVersion))
    throw new Error("Invalid app version");
  if (
    /DEVELOPMENT_TEAM|CODE_SIGN_ENTITLEMENTS|PBXShellScriptBuildPhase/u.test(
      source,
    )
  )
    throw new Error("Unreviewed existing signing or script settings");
  source = replaceExpected(
    source,
    "IPHONEOS_DEPLOYMENT_TARGET = 15.0;",
    "IPHONEOS_DEPLOYMENT_TARGET = 17.0;",
    4,
  );
  source = replaceExpected(
    source,
    "MARKETING_VERSION = 1.0;",
    `MARKETING_VERSION = ${appVersion};`,
    2,
  );
  source = replaceExpected(
    source,
    "PRODUCT_BUNDLE_IDENTIFIER = com.symbio.fitcoach.dev;",
    "PRODUCT_BUNDLE_IDENTIFIER = com.symbio.fitcoach.dev;",
    2,
  );
  // Simulator compilation only. Signing, device provisioning and store builds
  // require a separate reviewed path and never inherit an installed Apple account.
  source = replaceExpected(
    source,
    'CODE_SIGN_IDENTITY = "iPhone Developer";',
    'CODE_SIGN_IDENTITY = "";\n\t\t\t\tCODE_SIGNING_ALLOWED = NO;',
    2,
  );
  source = replaceExpected(
    source,
    "CODE_SIGN_STYLE = Automatic;",
    "CODE_SIGN_STYLE = Manual;\n\t\t\t\tCODE_SIGNING_ALLOWED = NO;\n\t\t\t\tSUPPORTED_PLATFORMS = iphonesimulator;\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;",
    2,
  );
  source = replaceExpected(
    source,
    "SDKROOT = iphoneos;",
    "SDKROOT = iphonesimulator;",
    2,
  );
  const additions = [
    ["FitCoachBridgeViewController.swift", "sourcecode.swift", "Sources"],
    ["FitCoachNativePlugin.swift", "sourcecode.swift", "Sources"],
    ["PrivacyInfo.xcprivacy", "text.xml", "Resources"],
    ["App.entitlements", "text.plist.entitlements", null],
  ];
  let references = "",
    builds = "",
    children = "",
    sources = "",
    resources = "";
  for (const [name, type, phase] of additions) {
    const ref = hash(`fitcoach-reference:${name}`).slice(0, 24).toUpperCase();
    const build = hash(`fitcoach-build:${name}`).slice(0, 24).toUpperCase();
    if (
      source.includes(ref) ||
      source.includes(build) ||
      source.includes(`path = ${name};`)
    )
      throw new Error(`Duplicate native target input: ${name}`);
    references += `\t\t${ref} /* ${name} */ = {isa = PBXFileReference; lastKnownFileType = ${type}; path = ${name}; sourceTree = "<group>"; };\n`;
    children += `\t\t\t\t${ref} /* ${name} */,\n`;
    if (phase) {
      builds += `\t\t${build} /* ${name} in ${phase} */ = {isa = PBXBuildFile; fileRef = ${ref} /* ${name} */; };\n`;
      const entry = `\t\t\t\t${build} /* ${name} in ${phase} */,\n`;
      if (phase === "Sources") sources += entry;
      else resources += entry;
    }
  }
  source = replaceExpected(
    source,
    "/* End PBXBuildFile section */",
    `${builds}/* End PBXBuildFile section */`,
  );
  source = replaceExpected(
    source,
    "/* End PBXFileReference section */",
    `${references}/* End PBXFileReference section */`,
  );
  const childAnchor =
    "\t\t\t\t9582B6822FE993A50072D4E8 /* SceneDelegate.swift */,\n";
  const sourceAnchor =
    "\t\t\t\t9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */,\n";
  const resourceAnchor =
    "\t\t\t\t2FAD9763203C412B000D30F8 /* config.xml in Resources */,\n";
  source = replaceExpected(source, childAnchor, childAnchor + children);
  source = replaceExpected(source, sourceAnchor, sourceAnchor + sources);
  return replaceExpected(source, resourceAnchor, resourceAnchor + resources);
}

export async function prepareIOSProject({ destination, webBundle }) {
  if (process.env.FITCOACH_NATIVE_RELEASE === "1")
    throw new Error("Release mode cannot use the simulator preparer");
  const cwd = process.cwd();
  let config;
  try {
    process.chdir(ROOT);
    config = (
      await require("./node_modules/@capacitor/cli/dist/config.js").loadConfig()
    ).app.extConfig;
  } finally {
    process.chdir(cwd);
  }
  validateIOSDebugConfig(config);
  const lock = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"),
  );
  for (const name of ["ios", "core", "cli"]) {
    const version = require(`@capacitor/${name}/package.json`).version;
    if (
      version !== "8.5.1" ||
      lock.packages[`node_modules/@capacitor/${name}`]?.version !== version
    )
      throw new Error(`Pinned Capacitor mismatch: ${name}`);
  }
  const template = fs.readFileSync(
    regular(
      path.join(
        ROOT,
        "node_modules/@capacitor/cli/assets/ios-spm-template.tar.gz",
      ),
    ),
  );
  if (hash(template) !== IOS_TEMPLATE_SHA256)
    throw new Error("Unreviewed iOS template bytes");
  const sources = IOS_SOURCE_FILES.map((file) => ({
    file,
    bytes: fs.readFileSync(regular(path.join(ROOT, "ios/App/App", file))),
  }));
  const iconRoot = path.join(ROOT, "assets/ios/AppIcon.appiconset");
  const iconManifest = JSON.parse(
    fs.readFileSync(regular(path.join(iconRoot, "Contents.json")), "utf8"),
  );
  const iconNames = [
    ...new Set(iconManifest.images.map((item) => item.filename)),
    "Contents.json",
  ];
  const icons = iconNames.map((file) => {
    if (
      typeof file !== "string" ||
      !/^[a-zA-Z0-9@._-]+\.(png|json)$/u.test(file)
    )
      throw new Error("Unreviewed icon path");
    return { file, bytes: fs.readFileSync(regular(path.join(iconRoot, file))) };
  });
  const inventory = verifyLosslessBundle(webBundle);
  const output = reserveIOSProject(destination, webBundle);
  fs.writeFileSync(
    path.join(output, "package.json"),
    json({
      name: "fitcoach-ios-development-build",
      private: true,
      dependencies: { "@capacitor/ios": "8.5.1", "@capacitor/core": "8.5.1" },
    }),
    { flag: "wx" },
  );
  fs.symlinkSync(
    path.join(ROOT, "node_modules"),
    path.join(output, "node_modules"),
    "dir",
  );
  fs.cpSync(webBundle, path.join(output, "dist"), {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  fs.writeFileSync(path.join(output, "capacitor.config.json"), json(config), {
    flag: "wx",
  });
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "node_modules/@capacitor/cli/bin/capacitor"),
      "add",
      "ios",
      "--packagemanager",
      "SPM",
    ],
    {
      cwd: output,
      env: { ...process.env, CI: "1", CAPACITOR_TELEMETRY_DISABLED: "1" },
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Capacitor iOS add failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  const project = path.join(output, "ios/App"),
    app = path.join(project, "App");
  const projectFile = regular(
    path.join(project, "App.xcodeproj/project.pbxproj"),
  );
  fs.writeFileSync(
    projectFile,
    patchIOSProject(fs.readFileSync(projectFile, "utf8"), inventory.appVersion),
  );
  const packageText = fs.readFileSync(
    regular(path.join(project, "CapApp-SPM/Package.swift")),
    "utf8",
  );
  if (
    !packageText.includes(
      '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.1")',
    ) ||
    [...packageText.matchAll(/\.package\(/gu)].length !== 1
  )
    throw new Error(
      "Swift package graph is not the locked Capacitor-only graph",
    );
  for (const { file, bytes } of sources) {
    const target = path.join(app, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  const plist = path.join(app, "Info.plist");
  fs.writeFileSync(
    plist,
    replaceExpected(
      fs.readFileSync(plist, "utf8"),
      "<key>CFBundleDisplayName</key>\n  <string>$(PRODUCT_NAME)</string>",
      "<key>CFBundleDisplayName</key>\n  <string>FitCoach Dev</string>",
    ),
  );
  const templateIconFiles = installIOSIcons(output, icons);
  for (const item of inventory.files) {
    const bytes = fs.readFileSync(regular(path.join(app, "public", item.path)));
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256)
      throw new Error(`Changed bundled payload: ${item.path}`);
  }
  const report = {
    schema: 1,
    developmentOnly: true,
    simulatorOnly: true,
    applicationId: config.appId,
    appVersion: inventory.appVersion,
    capacitor: "8.5.1",
    minimumIOS: "17.0",
    signingAllowed: false,
    templateSha256: IOS_TEMPLATE_SHA256,
    webContentSha256: inventory.contentSha256,
    projectSha256: hash(fs.readFileSync(projectFile)),
    swiftPackageSha256: hash(packageText),
    sourceFiles: sources.map(({ file, bytes }) => ({
      file,
      sha256: hash(bytes),
    })),
    iconFiles: icons.map(({ file, bytes }) => ({ file, sha256: hash(bytes) })),
    templateIconFiles,
  };
  fs.writeFileSync(
    path.join(output, "fitcoach-ios-inputs.json"),
    json(report),
    { flag: "wx" },
  );
  return report;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--web-bundle" || args[2] !== "--out")
      throw new Error(
        "Usage: prepare-ios-project.mjs --web-bundle VERIFIED_DIRECTORY --out NEW_DIRECTORY",
      );
    console.log(
      json(
        await prepareIOSProject({
          webBundle: path.resolve(args[1]),
          destination: path.resolve(args[3]),
        }),
      ),
    );
  } catch (error) {
    console.error(
      `iOS preparation failed: ${error.message}. Existing source and outputs are preserved.`,
    );
    process.exitCode = 1;
  }
}
