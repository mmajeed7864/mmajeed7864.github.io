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
const hash = (data) => createHash("sha256").update(data).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const inside = (parent, child) =>
  child === parent || child.startsWith(`${parent}${path.sep}`);
export const TEMPLATE_SHA256 =
  "31b24059b85cc6ec74efe7bf3b45f07485b71427f333dade43bde4e19a4a7e7a";
export const GRADLE_SHA256 =
  "bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531";
export const SOURCE_FILES = Object.freeze([
  "AndroidManifest.xml",
  "java/com/symbio/fitcoach/MainActivity.kt",
  "java/com/symbio/fitcoach/PermissionsRationaleActivity.kt",
  "java/com/symbio/fitcoach/nativebridge/FitCoachNativePlugin.kt",
  "res/values/health_permissions.xml",
  "res/values/strings.xml",
  "res/values/styles.xml",
  "res/xml/backup_rules.xml",
  "res/xml/data_extraction_rules.xml",
  "res/xml/file_paths.xml",
  "res/xml/network_security_config.xml",
]);
export const INSTRUMENTATION_FILES = Object.freeze([
  "java/com/symbio/fitcoach/FitCoachRuntimeTest.kt",
]);

function regular(file) {
  if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== file)
    throw new Error(`Not a regular unlinked input: ${file}`);
  return file;
}

export function replaceOnce(source, pattern, replacement, label) {
  const count = [
    ...source.matchAll(
      new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`),
    ),
  ].length;
  if (count !== 1)
    throw new Error(`Unreviewed Android template: ${label} (${count} matches)`);
  return source.replace(pattern, replacement);
}

export function validateDebugConfig(config) {
  if (
    config.webDir !== "dist" ||
    (config.android?.path !== undefined && config.android.path !== "android") ||
    config.android?.buildOptions !== undefined
  )
    throw new Error("Unreviewed web/platform path or signing options");
  if (
    config.appId !== "com.symbio.fitcoach.dev" ||
    config.appName !== "FitCoach Dev"
  )
    throw new Error(
      "This preparer supports the existing development identity only; release signing needs its separate reviewed path",
    );
  if (
    config.server?.url ||
    (config.server?.hostname !== undefined &&
      config.server.hostname !== "localhost") ||
    config.server?.allowNavigation !== undefined ||
    config.server?.cleartext !== false ||
    config.android?.allowMixedContent !== false ||
    config.server?.androidScheme !== "https" ||
    config.server?.appStartPath !== "/fitcoach-founder-test/index.html"
  )
    throw new Error("Unsafe or unreviewed native origin/launch configuration");
  if (config.android?.webContentsDebuggingEnabled !== true)
    throw new Error("Unexpected development debugging configuration");
}

export function reserveProject(destination, bundle) {
  const output = path.resolve(destination),
    input = fs.realpathSync(bundle);
  // New projects must be outside source AND the verified web artifact. Never
  // rename/delete an existing platform directory to make Capacitor add succeed.
  if (inside(APP, output) || inside(input, output) || inside(output, input))
    throw new Error("Android output overlaps source or the web bundle");
  return reserveOutput(output, APP);
}

export function patchBuildFiles({
  rootBuild,
  appBuild,
  variables,
  wrapper,
  referenceRoot,
  referenceApp,
  appVersion,
}) {
  if (!/^\d+\.\d+\.\d+$/u.test(appVersion))
    throw new Error("Invalid bundled app version");
  const classpaths = [
    ...referenceRoot.matchAll(/^\s*classpath '[^']+'$/gmu),
  ].map((m) => m[0].trim());
  if (
    classpaths.length !== 2 ||
    !classpaths.some((s) =>
      s.includes("com.android.tools.build:gradle:8.13.2"),
    ) ||
    !classpaths.some((s) =>
      s.includes("org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.20"),
    )
  )
    throw new Error("Unreviewed Android toolchain references");
  rootBuild = replaceOnce(
    rootBuild,
    /classpath 'com\.android\.tools\.build:gradle:8\.13\.0'/u,
    classpaths.join("\n        "),
    "AGP classpath",
  );
  appBuild = replaceOnce(
    appBuild,
    /namespace = "com\.symbio\.fitcoach\.dev"/u,
    'namespace = "com.symbio.fitcoach"',
    "source namespace",
  );
  appBuild = replaceOnce(
    appBuild,
    /versionName "1\.0"/u,
    `versionName "${appVersion}"`,
    "version name",
  );
  variables = replaceOnce(
    variables,
    /minSdkVersion = 24/u,
    "minSdkVersion = 26",
    "Health Connect minimum SDK",
  );
  if (
    !variables.includes("compileSdkVersion = 36") ||
    !variables.includes("targetSdkVersion = 36")
  )
    throw new Error("Unreviewed Android SDK versions");
  if (
    !referenceApp.includes("jvmTarget = '21'") ||
    !referenceApp.includes("JavaVersion.VERSION_21")
  )
    throw new Error("Kotlin/Java targets must match Capacitor's Java 21");
  const additions = replaceOnce(
    referenceApp,
    /apply plugin: 'com\.android\.application'/u,
    "",
    "duplicate application plugin",
  );
  appBuild += `\n// FitCoach-owned bridge configuration, reapplied on every clean preparation.\n${additions}\n`;
  wrapper = replaceOnce(
    wrapper,
    /gradle-8\.14\.3-all\.zip/u,
    "gradle-8.14.3-bin.zip",
    "Gradle distribution",
  );
  if (/distributionSha256Sum/u.test(wrapper))
    throw new Error("Unexpected existing Gradle checksum");
  wrapper += `\ndistributionSha256Sum=${GRADLE_SHA256}\n`;
  return { rootBuild, appBuild, variables, wrapper };
}

export async function prepareAndroidProject({ destination, webBundle }) {
  if (process.env.FITCOACH_NATIVE_RELEASE === "1")
    throw new Error(
      "Release configuration cannot use the development preparer",
    );
  const previousCwd = process.cwd();
  let config;
  try {
    process.chdir(ROOT);
    config = (
      await require("./node_modules/@capacitor/cli/dist/config.js").loadConfig()
    ).app.extConfig;
  } finally {
    process.chdir(previousCwd);
  }
  validateDebugConfig(config);
  const lock = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"),
  );
  for (const name of ["android", "core", "cli"]) {
    const installed = require(`@capacitor/${name}/package.json`).version;
    if (
      installed !== "8.5.1" ||
      installed !== lock.packages[`node_modules/@capacitor/${name}`]?.version
    )
      throw new Error(`Pinned Capacitor package mismatch: ${name}`);
  }
  const cli = path.join(ROOT, "node_modules/@capacitor/cli/bin/capacitor");
  const template = fs.readFileSync(
    regular(
      path.join(
        ROOT,
        "node_modules/@capacitor/cli/assets/android-template.tar.gz",
      ),
    ),
  );
  if (hash(template) !== TEMPLATE_SHA256)
    throw new Error("Unreviewed Capacitor Android template bytes");
  const source = SOURCE_FILES.map((file) => ({
    file,
    bytes: fs.readFileSync(
      regular(path.join(ROOT, "android/app/src/main", file)),
    ),
  }));
  const instrumentation = INSTRUMENTATION_FILES.map((file) => ({
    file,
    bytes: fs.readFileSync(
      regular(path.join(ROOT, "android/app/src/androidTest", file)),
    ),
  }));
  const inventory = verifyLosslessBundle(webBundle);
  const output = reserveProject(destination, webBundle);
  fs.writeFileSync(
    path.join(output, "package.json"),
    json({
      name: "fitcoach-android-development-build",
      private: true,
      dependencies: {
        "@capacitor/android": "8.5.1",
        "@capacitor/core": "8.5.1",
      },
    }),
    { flag: "wx" },
  );
  // The single explicit dependency link is build-only and never copied to the APK.
  fs.symlinkSync(
    path.join(ROOT, "node_modules"),
    path.join(output, "node_modules"),
    "dir",
  );
  fs.cpSync(webBundle, path.join(output, "dist"), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  fs.writeFileSync(path.join(output, "capacitor.config.json"), json(config), {
    flag: "wx",
  });
  const result = spawnSync(process.execPath, [cli, "add", "android"], {
    cwd: output,
    env: { ...process.env, CI: "1", CAPACITOR_TELEMETRY_DISABLED: "1" },
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Capacitor add failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  const android = path.join(output, "android");
  const read = (file) =>
    fs.readFileSync(regular(path.join(android, file)), "utf8");
  const patched = patchBuildFiles({
    rootBuild: read("build.gradle"),
    appBuild: read("app/build.gradle"),
    variables: read("variables.gradle"),
    wrapper: read("gradle/wrapper/gradle-wrapper.properties"),
    referenceRoot: fs.readFileSync(
      path.join(ROOT, "android/reference-root-build.gradle"),
      "utf8",
    ),
    referenceApp: fs.readFileSync(
      path.join(ROOT, "android/reference-app-build.gradle"),
      "utf8",
    ),
    appVersion: inventory.appVersion,
  });
  for (const [key, file] of Object.entries({
    rootBuild: "build.gradle",
    appBuild: "app/build.gradle",
    variables: "variables.gradle",
    wrapper: "gradle/wrapper/gradle-wrapper.properties",
  }))
    fs.writeFileSync(path.join(android, file), patched[key]);
  const generatedJava = path.join(
    android,
    "app/src/main/java/com/symbio/fitcoach/dev/MainActivity.java",
  );
  if (
    !fs
      .readFileSync(regular(generatedJava), "utf8")
      .includes("class MainActivity extends BridgeActivity")
  )
    throw new Error("Unexpected template launcher");
  fs.unlinkSync(generatedJava); // Only the launcher just generated in this new output.
  const templateTest = path.join(
    android,
    "app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java",
  );
  if (
    hash(fs.readFileSync(regular(templateTest))) !==
    "ff50b4c110a7434312f9af54171f9e8523b015836f707c9b387b76d4c38a97f8"
  )
    throw new Error("Unknown generated example test; preserve it for review");
  // This newly generated placeholder asserts Capacitor's example package ID.
  // Our actual installed-app tests replace it; no original reference file is removed.
  fs.unlinkSync(templateTest);
  for (const { file, bytes } of source) {
    const target = path.join(android, "app/src/main", file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  for (const { file, bytes } of instrumentation) {
    const target = path.join(android, "app/src/androidTest", file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: "wx" });
  }
  const strings = path.join(android, "app/src/main/res/values/strings.xml");
  fs.writeFileSync(
    strings,
    replaceOnce(
      fs.readFileSync(strings, "utf8"),
      /<string name="app_name">FitCoach<\/string>/u,
      '<string name="app_name">FitCoach Dev</string>',
      "development app label",
    ),
  );
  const iconRoot = path.join(ROOT, "assets/android/res");
  for (const dir of fs.readdirSync(iconRoot)) {
    if (!/^(mipmap-[a-z0-9-]+|values)$/u.test(dir))
      throw new Error("Unknown icon directory");
    for (const file of fs.readdirSync(path.join(iconRoot, dir))) {
      if (!/^[a-z_]+\.(png|xml)$/u.test(file))
        throw new Error("Unknown icon file");
      const bytes = fs.readFileSync(regular(path.join(iconRoot, dir, file))),
        target = path.join(android, "app/src/main/res", dir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
  }
  // Capacitor may add its bridge scripts, but every verified app payload byte must survive copy.
  for (const item of inventory.files) {
    const bytes = fs.readFileSync(
      regular(path.join(android, "app/src/main/assets/public", item.path)),
    );
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256)
      throw new Error(`Capacitor changed bundled payload: ${item.path}`);
  }
  const report = {
    schema: 1,
    developmentOnly: true,
    applicationId: config.appId,
    namespace: "com.symbio.fitcoach",
    appVersion: inventory.appVersion,
    capacitor: "8.5.1",
    jdk: 21,
    templateSha256: TEMPLATE_SHA256,
    gradleDistributionSha256: GRADLE_SHA256,
    webContentSha256: inventory.contentSha256,
    sourceFiles: source.map(({ file, bytes }) => ({
      file,
      sha256: hash(bytes),
    })),
    instrumentationFiles: instrumentation.map(({ file, bytes }) => ({
      file,
      sha256: hash(bytes),
    })),
  };
  fs.writeFileSync(
    path.join(output, "fitcoach-android-inputs.json"),
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
        "Usage: prepare-android-project.mjs --web-bundle VERIFIED_DIRECTORY --out NEW_DIRECTORY",
      );
    console.log(
      json(
        await prepareAndroidProject({
          webBundle: path.resolve(args[1]),
          destination: path.resolve(args[3]),
        }),
      ),
    );
  } catch (error) {
    console.error(
      `Android preparation failed: ${error.message}. Existing source and outputs are preserved.`,
    );
    process.exitCode = 1;
  }
}
