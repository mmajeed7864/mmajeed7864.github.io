import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const AVD_NAME = "fitcoach-ci-smoke";
export const SERIAL = "emulator-5554";
export const IMAGE = "system-images;android-36;google_apis;x86_64";
export const TESTS = Object.freeze([
  "launchesPackagedOnboardingWithNativeBridge",
  "decodesPackagedExerciseArtwork",
  "secureSessionSurvivesRecreationAndClears",
  "motionControlsPlayPauseResumeAndLoopOffline",
]);

export function validateRuntimeHost(env, platform = process.platform) {
  if (
    platform !== "linux" ||
    env.GITHUB_ACTIONS !== "true" ||
    env.CI !== "true"
  )
    throw new Error(
      "Runtime smoke is restricted to the isolated Linux CI runner",
    );
  for (const key of [
    "RUNNER_TEMP",
    "ANDROID_HOME",
    "FITCOACH_TEST_ANDROID_PROJECT",
  ])
    if (!env[key] || !path.isAbsolute(env[key]))
      throw new Error(`Missing absolute ${key}`);
  const temp = path.resolve(env.RUNNER_TEMP);
  const project = path.resolve(env.FITCOACH_TEST_ANDROID_PROJECT);
  if (!project.startsWith(`${temp}${path.sep}`))
    throw new Error(
      "Only the generated project inside runner temp can be installed",
    );
  return { temp, project, sdk: path.resolve(env.ANDROID_HOME) };
}

export function assertUnusedDevices(output) {
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines[0] !== "List of devices attached" || lines.length !== 1)
    throw new Error("Existing/unknown ADB devices must not be touched");
}

export function verifyTestReport(xml) {
  if (/<(?:failure|error|skipped)\b/u.test(xml))
    throw new Error("Instrumented tests failed or skipped");
  const cases = [...xml.matchAll(/<testcase\b[^>]*\bname="([^"]+)"/gu)].map(
    (match) => match[1],
  );
  if (
    cases.length !== TESTS.length ||
    TESTS.some((name) => cases.filter((item) => item === name).length !== 1)
  )
    throw new Error("Expected every real runtime test exactly once");
  return { tests: cases.length, failures: 0, skipped: 0, names: cases };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${path.basename(executable)} failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  return result.stdout || "";
}

function reportFiles(directory, depth = 0) {
  if (depth > 3 || !fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error("Linked runtime report");
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? reportFiles(file, depth + 1)
      : /^TEST-.*\.xml$/u.test(entry.name)
        ? [file]
        : [];
  });
}

export async function runRuntimeSmoke() {
  const { temp, project, sdk } = validateRuntimeHost(process.env);
  if (fs.realpathSync(project) !== project || fs.realpathSync(temp) !== temp)
    throw new Error("Linked runtime inputs are not accepted");
  const inputs = JSON.parse(
    fs.readFileSync(path.join(project, "fitcoach-android-inputs.json"), "utf8"),
  );
  if (
    inputs.developmentOnly !== true ||
    inputs.applicationId !== "com.symbio.fitcoach.dev"
  )
    throw new Error("Not a generated development application");
  const adb = path.join(sdk, "platform-tools/adb");
  assertUnusedDevices(command(adb, ["devices"]));
  const evidence = path.join(temp, "fitcoach-runtime-smoke");
  fs.mkdirSync(evidence); // Never overwrite or delete an earlier run.
  const avdHome = path.join(evidence, "avd");
  fs.mkdirSync(avdHome);
  const env = {
    ...process.env,
    ANDROID_AVD_HOME: avdHome,
    ANDROID_SERIAL: SERIAL,
  };
  const sdkmanager = path.join(sdk, "cmdline-tools/latest/bin/sdkmanager");
  const avdmanager = path.join(sdk, "cmdline-tools/latest/bin/avdmanager");
  // Use the runner's existing SDK license grants. Do not send `yes` or accept new terms.
  console.log(
    command(sdkmanager, ["--install", IMAGE], {
      env,
      input: "",
      timeout: 600_000,
    }),
  );
  if (
    !fs.existsSync(
      path.join(sdk, "system-images/android-36/google_apis/x86_64/system.img"),
    )
  )
    throw new Error("The approved emulator image was not installed");
  console.log(
    command(
      avdmanager,
      ["create", "avd", "-n", AVD_NAME, "-k", IMAGE, "--device", "pixel_7"],
      { env, input: "no\n" },
    ),
  );
  const emulatorLog = fs.openSync(path.join(evidence, "emulator.log"), "wx");
  const emulator = spawn(
    path.join(sdk, "emulator/emulator"),
    [
      "-avd",
      AVD_NAME,
      "-port",
      "5554",
      "-no-window",
      "-no-audio",
      "-no-boot-anim",
      "-no-snapshot",
      "-gpu",
      "swiftshader",
      "-cores",
      "2",
      "-memory",
      "2048",
    ],
    { env, stdio: ["ignore", emulatorLog, emulatorLog] },
  );
  fs.closeSync(emulatorLog);
  let processError;
  emulator.on("error", (error) => {
    processError = error;
  });
  const device = (args) =>
    command(adb, ["-s", SERIAL, ...args], { env, timeout: 20_000 });
  try {
    const deadline = Date.now() + 240_000;
    let booted = false;
    while (Date.now() < deadline) {
      if (processError || emulator.exitCode !== null)
        throw new Error(
          `Emulator exited before boot: ${processError?.message || emulator.exitCode}`,
        );
      try {
        booted =
          device(["shell", "getprop", "sys.boot_completed"]).trim() === "1";
      } catch {}
      if (booted) break;
      await sleep(1000);
    }
    if (!booted) throw new Error("Isolated emulator boot timed out");
    if (device(["emu", "avd", "name"]).trim().split(/\r?\n/u)[0] !== AVD_NAME)
      throw new Error("Unexpected emulator identity");
    device(["shell", "input", "keyevent", "82"]);
    device(["shell", "svc", "wifi", "disable"]);
    device(["shell", "svc", "data", "disable"]);
    const android = path.join(project, "android");
    const build = spawnSync(
      path.join(android, "gradlew"),
      [
        "--no-daemon",
        "--max-workers=2",
        "-Dorg.gradle.jvmargs=-Xmx2g",
        "-Pkotlin.compiler.execution.strategy=in-process",
        ":app:connectedDebugAndroidTest",
      ],
      {
        cwd: android,
        env,
        encoding: "utf8",
        timeout: 600_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    console.log(build.stdout || "");
    console.error(build.stderr || "");
    const reports = reportFiles(
      path.join(android, "app/build/outputs/androidTest-results/connected"),
    );
    const xml = reports.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    fs.writeFileSync(path.join(evidence, "instrumentation.xml"), xml, {
      flag: "wx",
    });
    if (build.error || build.status !== 0) {
      console.log(xml.slice(0, 32_000));
      throw new Error(
        `Connected Android tests failed: ${build.error?.message || build.status}`,
      );
    }
    const summary = {
      ...verifyTestReport(xml),
      applicationId: inputs.applicationId,
      avd: AVD_NAME,
      api: device(["shell", "getprop", "ro.build.version.sdk"]).trim(),
      webContentSha256: inputs.webContentSha256,
      physicalDevice: false,
      microphoneGranted: false,
      storeTransactionsTested: false,
    };
    fs.writeFileSync(
      path.join(evidence, "result.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      { flag: "wx" },
    );
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    // This is our spawned process on an ephemeral runner, never a user's device.
    if (emulator.exitCode === null) {
      emulator.kill("SIGTERM");
      for (
        let attempt = 0;
        attempt < 10 && emulator.exitCode === null;
        attempt++
      )
        await sleep(500);
      if (emulator.exitCode === null) emulator.kill("SIGKILL");
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runRuntimeSmoke().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
