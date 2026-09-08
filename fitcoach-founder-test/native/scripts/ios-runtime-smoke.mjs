import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  IOS_RUNTIME_TESTS,
  iosRuntimeScheme,
  iosAppScheme,
} from "./ios-runtime-project.mjs";

export const IOS_RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-2";
export const IOS_DEVICE_TYPE =
  "com.apple.CoreSimulator.SimDeviceType.iPhone-16";
export const IOS_BOOT_BUDGET = Object.freeze({
  cacheMs: 180_000,
  requestMs: 60_000,
  readyMs: 480_000,
});
// Account-free simulator signing. Never inherit a developer identity or profile.
// The generated project and independent compile gate remain unsigned by default.
export const IOS_RUNTIME_SIGNING = Object.freeze([
  "CODE_SIGNING_ALLOWED=YES",
  "CODE_SIGNING_REQUIRED=YES",
  "CODE_SIGN_IDENTITY=-",
  "CODE_SIGN_STYLE=Manual",
  "DEVELOPMENT_TEAM=",
  "PROVISIONING_PROFILE_SPECIFIER=",
  "PROVISIONING_PROFILE=",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (object) => `${JSON.stringify(object, null, 2)}\n`;

export function verifyRuntimeSigning(details, entitlements) {
  if (
    !/^Signature=adhoc$/mu.test(details) ||
    !/^Identifier=com\.symbio\.fitcoach\.dev$/mu.test(details) ||
    !/^TeamIdentifier=not set$/mu.test(details) ||
    /^Authority=/mu.test(details)
  )
    throw new Error(
      "Runtime host must use account-free ad-hoc simulator signing",
    );
  if (
    !entitlements ||
    typeof entitlements !== "object" ||
    Array.isArray(entitlements) ||
    entitlements["application-identifier"] !== "com.symbio.fitcoach.dev" ||
    entitlements["com.apple.developer.team-identifier"] ||
    entitlements["com.apple.security.application-groups"] !== undefined ||
    (entitlements["keychain-access-groups"] !== undefined &&
      (!Array.isArray(entitlements["keychain-access-groups"]) ||
        entitlements["keychain-access-groups"].some(
          (group) => group !== "com.symbio.fitcoach.dev",
        )))
  )
    throw new Error(
      "Unexpected simulator app identity or Keychain access groups",
    );
  return {
    mode: "ad-hoc-simulator-only",
    applicationIdentifier: entitlements["application-identifier"],
    developerAccountUsed: false,
  };
}

export function validateIOSRuntimeHost(env, platform = process.platform) {
  if (
    platform !== "darwin" ||
    env.GITHUB_ACTIONS !== "true" ||
    env.CI !== "true" ||
    env.RUNNER_ENVIRONMENT !== "github-hosted"
  )
    throw new Error(
      "iOS runtime tests are restricted to an isolated GitHub-hosted Mac",
    );
  if (env.DEVELOPER_DIR !== "/Applications/Xcode_26.3.app/Contents/Developer")
    throw new Error("Unreviewed Xcode runtime");
  for (const key of [
    "RUNNER_TEMP",
    "FITCOACH_TEST_IOS_PROJECT",
    "FITCOACH_IOS_DERIVED",
  ])
    if (!env[key] || !path.isAbsolute(env[key]))
      throw new Error(`Missing absolute ${key}`);
  const temp = path.resolve(env.RUNNER_TEMP),
    project = path.resolve(env.FITCOACH_TEST_IOS_PROJECT),
    derived = path.resolve(env.FITCOACH_IOS_DERIVED);
  for (const child of [project, derived])
    if (!child.startsWith(`${temp}${path.sep}`))
      throw new Error("Only temporary generated inputs can be installed");
  if (
    project === derived ||
    project.startsWith(`${derived}${path.sep}`) ||
    derived.startsWith(`${project}${path.sep}`)
  )
    throw new Error("Runtime project and compiler output overlap");
  return { temp, project, derived };
}

export function validateSimulatorInventory(inventory) {
  if (
    !Array.isArray(inventory.runtimes) ||
    !Array.isArray(inventory.devicetypes) ||
    !inventory.devices ||
    typeof inventory.devices !== "object" ||
    Array.isArray(inventory.devices)
  )
    throw new Error("Unknown simulator inventory");
  for (const devices of Object.values(inventory.devices)) {
    if (
      !Array.isArray(devices) ||
      devices.some((device) => device.state !== "Shutdown")
    )
      throw new Error(
        "An existing/unknown simulator is active; leave it untouched",
      );
  }
  if (
    !inventory.runtimes.some(
      (runtime) =>
        runtime.identifier === IOS_RUNTIME && runtime.isAvailable === true,
    ) ||
    !inventory.devicetypes.some(
      (device) => device.identifier === IOS_DEVICE_TYPE,
    )
  )
    throw new Error(
      "The reviewed iOS runtime/device must already be installed",
    );
}

export function ownedSimulator(inventory, udid, name) {
  if (!UUID.test(udid) || !/^fitcoach-ci-[0-9a-f-]{36}$/u.test(name))
    throw new Error("Invalid owned simulator identity");
  const matches = Object.entries(inventory.devices ?? {}).flatMap(
    ([runtime, devices]) => {
      if (!Array.isArray(devices)) throw new Error("Unknown device inventory");
      return devices
        .filter((device) => device.udid === udid)
        .map((device) => ({ ...device, runtime }));
    },
  );
  if (
    matches.length !== 1 ||
    matches[0].name !== name ||
    matches[0].runtime !== IOS_RUNTIME ||
    matches[0].deviceTypeIdentifier !== IOS_DEVICE_TYPE
  )
    throw new Error("Simulator identity changed; refuse to modify it");
  return matches[0];
}

// Modern xcresulttool test tree, not log regexes or a successful build exit alone.
export function verifyIOSRuntimeResults(summary, tree) {
  for (const [key, count] of Object.entries({
    totalTestCount: 4,
    passedTests: 4,
    failedTests: 0,
    skippedTests: 0,
    expectedFailures: 0,
  }))
    if (summary[key] !== count)
      throw new Error(`Unexpected XCTest summary: ${key}`);
  if (summary.result !== "Passed" || !Array.isArray(tree.testNodes))
    throw new Error("XCTest did not report a complete pass");
  const cases = [];
  function visit(nodes, depth = 0) {
    if (!Array.isArray(nodes) || depth > 12 || nodes.length > 100)
      throw new Error("Unbounded/unknown XCTest tree");
    for (const node of nodes) {
      if (!node || typeof node !== "object")
        throw new Error("Invalid XCTest node");
      if (node.nodeType === "Test Case") cases.push(node);
      else if (node.children !== undefined) visit(node.children, depth + 1);
    }
  }
  visit(tree.testNodes);
  const expected = IOS_RUNTIME_TESTS.map(
    (name) => `FitCoachRuntimeTests/${name}()`,
  );
  if (
    cases.length !== expected.length ||
    cases.some((item) => item.result !== "Passed") ||
    expected.some(
      (name) =>
        cases.filter((item) => item.nodeIdentifier === name).length !== 1,
    )
  )
    throw new Error(
      "Every exact installed-app test must pass once without skips or retries",
    );
  return {
    tests: cases.length,
    failures: 0,
    skipped: 0,
    names: cases.map((item) => item.nodeIdentifier),
  };
}

function command(tool, args, options = {}) {
  const result = spawnSync(tool, args, {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${path.basename(tool)} failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  return result.stdout || "";
}
const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const simctl = (args) => command("/usr/bin/xcrun", ["simctl", ...args]);
const inventory = () => JSON.parse(simctl(["list", "--json"]));

// First boot includes migration and shared-cache generation, not just a Booted
// inventory label. All effects remain on the reviewed hosted runner/runtime.
export function bootOwnedSimulator({
  udid,
  name,
  env = process.env,
  platform = process.platform,
  readInventory = inventory,
  execute = command,
  clock = () => performance.now(),
  record = (event) => console.log(json(event)),
}) {
  validateIOSRuntimeHost(env, platform);
  const initial = readInventory();
  validateSimulatorInventory(initial);
  ownedSimulator(initial, udid, name);
  function stage(phase, args, timeout) {
    const started = clock();
    record({ phase, status: "started", timeoutMs: timeout });
    try {
      execute("/usr/bin/xcrun", ["simctl", ...args], {
        timeout,
        killSignal: "SIGKILL",
        stdio: "inherit",
      });
      record({
        phase,
        status: "passed",
        elapsedMs: Math.round(clock() - started),
      });
    } catch (error) {
      record({
        phase,
        status: "failed",
        elapsedMs: Math.round(clock() - started),
        message: error.message.slice(-2_000),
      });
      throw new Error(
        `Simulator ${phase} failed before app testing: ${error.message}`,
        { cause: error },
      );
    }
  }
  // Apple's Xcode 26.1 known-issue workaround; scope to our reviewed runtime,
  // as Chromium's simulator infrastructure does, rather than updating --all.
  stage(
    "shared-cache",
    ["runtime", "dyld_shared_cache", "update", IOS_RUNTIME],
    IOS_BOOT_BUDGET.cacheMs,
  );
  const prepared = readInventory();
  validateSimulatorInventory(prepared);
  ownedSimulator(prepared, udid, name);
  stage("boot-request", ["boot", udid], IOS_BOOT_BUDGET.requestMs);
  ownedSimulator(readInventory(), udid, name);
  stage("boot-readiness", ["bootstatus", udid, "-b"], IOS_BOOT_BUDGET.readyMs);
  if (ownedSimulator(readInventory(), udid, name).state !== "Booted")
    throw new Error("Owned simulator did not boot after bootstatus completed");
  record({
    phase: "boot-verified",
    status: "passed",
    runtime: IOS_RUNTIME,
    simulator: udid,
    appTestsExecuted: false,
  });
}

export async function runIOSRuntimeSmoke() {
  const { temp, project, derived } = validateIOSRuntimeHost(process.env);
  for (const directory of [temp, project, derived])
    if (fs.realpathSync(directory) !== directory)
      throw new Error("Linked runtime input");
  const inputs = readJSON(path.join(project, "fitcoach-ios-inputs.json"));
  if (
    inputs.developmentOnly !== true ||
    inputs.simulatorOnly !== true ||
    inputs.signingAllowed !== false ||
    inputs.runtimeTests !== true ||
    inputs.applicationId !== "com.symbio.fitcoach.dev"
  )
    throw new Error("Not a generated runtime-test development application");
  const projectFile = path.join(
    project,
    "ios/App/App.xcodeproj/project.pbxproj",
  );
  if (
    hash(fs.readFileSync(projectFile)) !== inputs.projectSha256 ||
    fs.readFileSync(
      path.join(
        project,
        "ios/App/App.xcodeproj/xcshareddata/xcschemes/FitCoachRuntime.xcscheme",
      ),
      "utf8",
    ) !== iosRuntimeScheme() ||
    fs.readFileSync(
      path.join(
        project,
        "ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme",
      ),
      "utf8",
    ) !== iosAppScheme()
  )
    throw new Error("Generated project or runtime scheme changed");
  for (const item of inputs.runtimeFiles ?? []) {
    if (!/^(FitCoachRuntimeTests\.swift|ios-probes\.js)$/u.test(item.file))
      throw new Error("Unknown runtime source");
    if (
      hash(
        fs.readFileSync(
          path.join(project, "ios/App/FitCoachRuntimeTests", item.file),
        ),
      ) !== item.sha256 ||
      hash(
        fs.readFileSync(
          new URL(`../tests/runtime/${item.file}`, import.meta.url),
        ),
      ) !== item.sha256
    )
      throw new Error("Runtime test source changed");
  }
  if (
    inputs.runtimeFiles?.length !== 2 ||
    new Set(inputs.runtimeFiles.map((item) => item.file)).size !== 2
  )
    throw new Error("Incomplete runtime sources");
  validateSimulatorInventory(inventory());
  const evidence = fs.mkdtempSync(path.join(temp, "fitcoach-ios-runtime-"));
  const name = `fitcoach-ci-${randomUUID()}`;
  const udid = simctl(["create", name, IOS_DEVICE_TYPE, IOS_RUNTIME]).trim();
  if (!UUID.test(udid))
    throw new Error(
      "Simulator creation did not return an exact device identifier",
    );
  fs.writeFileSync(
    path.join(evidence, "owner.json"),
    json({ udid, name, runtime: IOS_RUNTIME, deviceType: IOS_DEVICE_TYPE }),
    { flag: "wx" },
  );
  let runtimeFailure;
  try {
    const bootLog = fs.openSync(path.join(evidence, "boot-events.jsonl"), "wx");
    try {
      bootOwnedSimulator({
        udid,
        name,
        record: (event) => {
          fs.writeSync(bootLog, `${JSON.stringify(event)}\n`);
          console.log(json(event));
        },
      });
    } finally {
      fs.closeSync(bootLog);
    }
    const resultBundle = path.join(evidence, "FitCoach.xcresult");
    const log = fs.openSync(path.join(evidence, "xcode-test.log"), "wx");
    let result;
    try {
      result = spawnSync(
        "/usr/bin/xcodebuild",
        [
          "test",
          "-project",
          path.join(project, "ios/App/App.xcodeproj"),
          "-scheme",
          "FitCoachRuntime",
          "-configuration",
          "Debug",
          "-sdk",
          "iphonesimulator",
          "-destination",
          `platform=iOS Simulator,id=${udid}`,
          "-destination-timeout",
          "60",
          "-derivedDataPath",
          derived,
          "-resultBundlePath",
          resultBundle,
          "-parallel-testing-enabled",
          "NO",
          "-maximum-concurrent-test-simulator-destinations",
          "1",
          "-test-timeouts-enabled",
          "YES",
          "-default-test-execution-time-allowance",
          "180",
          "-maximum-test-execution-time-allowance",
          "240",
          "-jobs",
          "2",
          ...IOS_RUNTIME_SIGNING,
        ],
        {
          timeout: 900_000,
          stdio: ["ignore", log, log],
          env: {
            ...process.env,
            SIMCTL_CHILD_FITCOACH_RUNTIME_TEST: "isolated-simulator-v1",
          },
        },
      );
    } finally {
      fs.closeSync(log);
    }
    const output = fs.readFileSync(
      path.join(evidence, "xcode-test.log"),
      "utf8",
    );
    console.log(output.slice(-160_000));
    // Inspect what Xcode actually produced even when a test fails, so Keychain
    // errors can be distinguished from absent/incorrect simulator entitlements.
    const app = path.join(
      derived,
      "Build/Products/Debug-iphonesimulator/App.app",
    );
    command("/usr/bin/codesign", ["--verify", "--strict", app]);
    const display = spawnSync(
      "/usr/bin/codesign",
      ["--display", "--verbose=4", app],
      { encoding: "utf8", timeout: 30_000 },
    );
    if (display.error || display.status !== 0)
      throw new Error("Cannot inspect simulator signature");
    const entitlementXML = command("/usr/bin/codesign", [
      "--display",
      "--entitlements",
      "-",
      "--xml",
      app,
    ]);
    const entitlements = JSON.parse(
      command("/usr/bin/plutil", ["-convert", "json", "-o", "-", "-"], {
        input: entitlementXML,
      }),
    );
    if (fs.existsSync(path.join(app, "embedded.mobileprovision")))
      throw new Error("Simulator must not use a provisioning profile");
    console.log(
      json({
        simulatorSignatureDetails: `${display.stdout}\n${display.stderr}`
          .split("\n")
          .filter((line) =>
            /^(Identifier|Signature|TeamIdentifier|Authority)=/u.test(line),
          ),
        entitlements,
      }),
    );
    const signing = verifyRuntimeSigning(
      `${display.stdout}\n${display.stderr}`,
      entitlements,
    );
    console.log(json({ simulatorSigning: signing, entitlements }));
    if (result.error || result.status !== 0)
      throw new Error(
        `Actual iOS tests failed: ${result.error?.message || result.status}`,
      );
    const summary = JSON.parse(
      command("/usr/bin/xcrun", [
        "xcresulttool",
        "get",
        "test-results",
        "summary",
        "--path",
        resultBundle,
      ]),
    );
    const tree = JSON.parse(
      command("/usr/bin/xcrun", [
        "xcresulttool",
        "get",
        "test-results",
        "tests",
        "--path",
        resultBundle,
      ]),
    );
    fs.writeFileSync(path.join(evidence, "summary.json"), json(summary), {
      flag: "wx",
    });
    fs.writeFileSync(path.join(evidence, "tests.json"), json(tree), {
      flag: "wx",
    });
    console.log(json({ xcresultSummary: summary, xcresultTests: tree }));
    const proof = {
      ...verifyIOSRuntimeResults(summary, tree),
      applicationId: inputs.applicationId,
      simulator: udid,
      runtime: IOS_RUNTIME,
      webContentSha256: inputs.webContentSha256,
      signing,
      physicalDeviceTested: false,
      processDeathTested: false,
      microphoneGranted: false,
      networkDisabled: false,
      storeTransactionsTested: false,
      storeSubmitted: false,
    };
    fs.writeFileSync(path.join(evidence, "result.json"), json(proof), {
      flag: "wx",
    });
    console.log(json(proof));
    return proof;
  } catch (error) {
    runtimeFailure = error;
    throw error;
  } finally {
    // Exact ownership check again. No personal simulator, erase-all, keychain
    // reset, installed SDK or pre-existing device is ever removed.
    try {
      const device = ownedSimulator(inventory(), udid, name);
      if (device.state === "Booted") simctl(["shutdown", udid]);
      const deadline = Date.now() + 30_000;
      while (
        ownedSimulator(inventory(), udid, name).state !== "Shutdown" &&
        Date.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 500));
      if (ownedSimulator(inventory(), udid, name).state !== "Shutdown")
        throw new Error(
          "Owned simulator shutdown incomplete; preserved for runner cleanup",
        );
      simctl(["delete", udid]);
      console.log(
        "Removed only the newly created disposable test simulator; evidence remains in runner temp.",
      );
    } catch (cleanupError) {
      // Keep the actual boot/test failure visible if cleanup also fails.
      if (!runtimeFailure) throw cleanupError;
      console.error(
        `Additional owned-simulator cleanup failure: ${cleanupError.message}`,
      );
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runIOSRuntimeSmoke();
  } catch (error) {
    console.error(`iOS runtime verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
