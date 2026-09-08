import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CAPACITOR_SWIFT_REVISION =
  "6afa7424fd2fcd8ca1e577478e8a00af284b7e82";

export function inspectSimulatorExecutable(bytes) {
  if (
    bytes.length < 32 ||
    bytes.readUInt32LE(0) !== 0xfeedfacf ||
    bytes.readUInt32LE(12) !== 2
  )
    throw new Error(
      "Expected a compiled 64-bit Mach-O executable, not a source/placeholder bundle",
    );
  const count = bytes.readUInt32LE(16),
    end = 32 + bytes.readUInt32LE(20);
  if (!count || count > 10000 || end > bytes.length)
    throw new Error("Malformed Mach-O commands");
  let offset = 32,
    platform;
  for (let index = 0; index < count; index++) {
    if (offset + 8 > end) throw new Error("Truncated Mach-O command");
    const command = bytes.readUInt32LE(offset),
      size = bytes.readUInt32LE(offset + 4);
    if (size < 8 || size % 8 || offset + size > end)
      throw new Error("Invalid Mach-O command size");
    if (command === 0x32) {
      if (size < 24 || platform) throw new Error("Ambiguous Mach-O platform");
      platform = {
        platform: bytes.readUInt32LE(offset + 8),
        minimumMajor: bytes.readUInt32LE(offset + 12) >>> 16,
        sdkMajor: bytes.readUInt32LE(offset + 16) >>> 16,
      };
    }
    offset += size;
  }
  if (
    offset !== end ||
    platform?.platform !== 7 ||
    platform.minimumMajor !== 17 ||
    platform.sdkMajor < 26
  )
    throw new Error(
      "Expected iOS Simulator executable built with SDK 26+ and iOS 17 minimum",
    );
  return platform;
}

export function verifyIOSApp(appDirectory, projectDirectory) {
  if (process.platform !== "darwin")
    throw new Error("Built iOS inspection needs macOS");
  const app = path.resolve(appDirectory),
    project = path.resolve(projectDirectory);
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const read = (file) => {
    if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== file)
      throw new Error("Unlinked regular build input required");
    return fs.readFileSync(file);
  };
  const plist = (file) =>
    JSON.parse(
      execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", file], {
        encoding: "utf8",
      }),
    );
  const report = JSON.parse(
    read(path.join(project, "fitcoach-ios-inputs.json")),
  );
  if (
    !report.simulatorOnly ||
    !report.developmentOnly ||
    report.applicationId !== "com.symbio.fitcoach.dev"
  )
    throw new Error("Not the development simulator project");
  const info = plist(path.join(app, "Info.plist"));
  if (
    info.CFBundleIdentifier !== report.applicationId ||
    info.CFBundleShortVersionString !== report.appVersion ||
    info.CFBundleDisplayName !== "FitCoach Dev" ||
    info.CFBundleExecutable !== "App"
  )
    throw new Error(
      "Built app identity/version does not match verified inputs",
    );
  if (
    info.UIBackgroundModes ||
    info.NSHealthUpdateUsageDescription ||
    info.NSAppTransportSecurity
  )
    throw new Error("Unexpected background/write/network permission");
  for (const key of [
    "NSMicrophoneUsageDescription",
    "NSSpeechRecognitionUsageDescription",
    "NSHealthShareUsageDescription",
  ])
    if (!info[key]) throw new Error(`Missing permission explanation: ${key}`);
  const executable = read(path.join(app, info.CFBundleExecutable));
  const platform = inspectSimulatorExecutable(executable);
  const privacy = plist(path.join(app, "PrivacyInfo.xcprivacy"));
  if (privacy.NSPrivacyTracking !== false)
    throw new Error("Missing compiled privacy declaration");
  const config = JSON.parse(read(path.join(app, "capacitor.config.json")));
  if (
    config.server?.url ||
    config.server?.cleartext !== false ||
    config.server?.appStartPath !== "/fitcoach-founder-test/index.html"
  )
    throw new Error("Built app does not launch its local bundle");
  const inventory = JSON.parse(
    read(path.join(project, "dist/fitcoach-web-bundle.json")),
  );
  if (inventory.contentSha256 !== report.webContentSha256)
    throw new Error("Wrong build inventory");
  for (const item of inventory.files) {
    if (
      typeof item.path !== "string" ||
      item.path.split("/").some((part) => part === ".." || part === "") ||
      path.isAbsolute(item.path)
    )
      throw new Error("Unsafe bundled file path");
    const bytes = read(path.join(app, "public", item.path));
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256)
      throw new Error(`Built bundle changed: ${item.path}`);
  }
  const resolved = JSON.parse(
    read(
      path.join(
        project,
        "ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved",
      ),
    ),
  );
  if (
    resolved.pins?.length !== 1 ||
    resolved.pins[0].identity !== "capacitor-swift-pm" ||
    resolved.pins[0].state?.version !== "8.5.1" ||
    resolved.pins[0].state?.revision !== CAPACITOR_SWIFT_REVISION
  )
    throw new Error(
      "Swift resolution differs from the verified upstream 8.5.1 revision",
    );
  return {
    applicationId: report.applicationId,
    appVersion: report.appVersion,
    ...platform,
    executableSha256: hash(executable),
    webContentSha256: report.webContentSha256,
    verifiedWebFiles: inventory.files.length,
    swiftRevision: CAPACITOR_SWIFT_REVISION,
    runtimeTested: false,
    physicalDeviceTested: false,
    storeSubmitted: false,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--app" || args[2] !== "--project")
      throw new Error(
        "Usage: verify-ios-app.mjs --app COMPILED_APP --project GENERATED_PROJECT",
      );
    console.log(JSON.stringify(verifyIOSApp(args[1], args[3]), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
