import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { patchIOSProject } from "../scripts/prepare-ios-project.mjs";
import {
  IOS_RUNTIME_TESTS,
  IOS_RUNTIME_TARGET,
  patchIOSRuntimeProject,
  iosRuntimeScheme,
  iosAppScheme,
} from "../scripts/ios-runtime-project.mjs";
import {
  IOS_RUNTIME,
  IOS_DEVICE_TYPE,
  validateIOSRuntimeHost,
  validateSimulatorInventory,
  ownedSimulator,
  verifyIOSRuntimeResults,
} from "../scripts/ios-runtime-smoke.mjs";

const host = {
  GITHUB_ACTIONS: "true",
  CI: "true",
  RUNNER_ENVIRONMENT: "github-hosted",
  RUNNER_TEMP: "/tmp/runner",
  FITCOACH_TEST_IOS_PROJECT: "/tmp/runner/project",
  FITCOACH_IOS_DERIVED: "/tmp/runner/derived",
  DEVELOPER_DIR: "/Applications/Xcode_26.3.app/Contents/Developer",
};
const udid = "12345678-1234-1234-1234-123456789ABC",
  name = "fitcoach-ci-12345678-1234-1234-1234-123456789abc";
const device = {
  udid,
  name,
  deviceTypeIdentifier: IOS_DEVICE_TYPE,
  state: "Shutdown",
};
const inventory = () => ({
  runtimes: [{ identifier: IOS_RUNTIME, isAvailable: true }],
  devicetypes: [{ identifier: IOS_DEVICE_TYPE }],
  devices: { [IOS_RUNTIME]: [device] },
});
const summary = () => ({
  result: "Passed",
  totalTestCount: 4,
  passedTests: 4,
  failedTests: 0,
  skippedTests: 0,
  expectedFailures: 0,
});
const tree = () => ({
  testNodes: [
    {
      nodeType: "Test Suite",
      children: IOS_RUNTIME_TESTS.map((name) => ({
        nodeType: "Test Case",
        nodeIdentifier: `FitCoachRuntimeTests/${name}()`,
        result: "Passed",
      })),
    },
  ],
});

test("iOS execution refuses personal hosts, non-temporary projects and unreviewed Xcode", () => {
  assert.deepEqual(validateIOSRuntimeHost(host, "darwin"), {
    temp: "/tmp/runner",
    project: "/tmp/runner/project",
    derived: "/tmp/runner/derived",
  });
  for (const platform of ["linux", "win32"])
    assert.throws(() => validateIOSRuntimeHost(host, platform));
  for (const patch of [
    { CI: "false" },
    { GITHUB_ACTIONS: "false" },
    { RUNNER_ENVIRONMENT: "self-hosted" },
    { DEVELOPER_DIR: "/Applications/Xcode.app" },
    { RUNNER_TEMP: "relative" },
    { FITCOACH_TEST_IOS_PROJECT: "/tmp/personal" },
    { FITCOACH_TEST_IOS_PROJECT: "/tmp/runner" },
    { FITCOACH_IOS_DERIVED: "/tmp/runner/project/output" },
  ])
    assert.throws(() =>
      validateIOSRuntimeHost({ ...host, ...patch }, "darwin"),
    );
});

test("iOS simulation cannot use active devices or silently install another SDK", () => {
  assert.doesNotThrow(() => validateSimulatorInventory(inventory()));
  for (const state of ["Booted", "Booting", "Shutting Down", undefined]) {
    const value = inventory();
    value.devices[IOS_RUNTIME][0] = { ...device, state };
    assert.throws(() => validateSimulatorInventory(value));
  }
  for (const patch of [
    { runtimes: [] },
    { devicetypes: [] },
    { devices: [] },
    { runtimes: [{ identifier: IOS_RUNTIME, isAvailable: false }] },
  ])
    assert.throws(() =>
      validateSimulatorInventory({ ...inventory(), ...patch }),
    );
  assert.equal(ownedSimulator(inventory(), udid, name).state, "Shutdown");
  for (const patch of [
    { name: "personal" },
    { deviceTypeIdentifier: "other" },
    { udid: "other" },
  ]) {
    const value = inventory();
    value.devices[IOS_RUNTIME][0] = { ...device, ...patch };
    assert.throws(() => ownedSimulator(value, udid, name));
  }
  assert.throws(() => ownedSimulator(inventory(), "booted", name));
  assert.throws(() => ownedSimulator(inventory(), udid, "personal"));
  const duplicate = inventory();
  duplicate.devices[IOS_RUNTIME].push(device);
  assert.throws(() => ownedSimulator(duplicate, udid, name));
});

test("XCTest proof requires all four exact installed-app tests, not build success or retries", () => {
  assert.equal(verifyIOSRuntimeResults(summary(), tree()).tests, 4);
  for (const key of [
    "totalTestCount",
    "passedTests",
    "failedTests",
    "skippedTests",
    "expectedFailures",
    "result",
  ])
    assert.throws(() =>
      verifyIOSRuntimeResults({ ...summary(), [key]: undefined }, tree()),
    );
  for (const result of ["Skipped", "Failed", "Expected Failure", undefined]) {
    const value = tree();
    value.testNodes[0].children[0].result = result;
    assert.throws(() => verifyIOSRuntimeResults(summary(), value));
  }
  for (const identifier of [
    "OtherClass/testLaunchesPackagedOnboardingWithNativeBridge()",
    "unknown",
    IOS_RUNTIME_TESTS[0],
  ]) {
    const value = tree();
    value.testNodes[0].children[0].nodeIdentifier = identifier;
    assert.throws(() => verifyIOSRuntimeResults(summary(), value));
  }
  const duplicate = tree();
  duplicate.testNodes[0].children.push(duplicate.testNodes[0].children[0]);
  assert.throws(() => verifyIOSRuntimeResults(summary(), duplicate));
  assert.throws(() => verifyIOSRuntimeResults(summary(), { testNodes: [] }));
  const missing = tree();
  missing.testNodes[0].children.pop();
  assert.throws(() => verifyIOSRuntimeResults(summary(), missing));
});

test("optional runtime target patches the pinned real template without adding probes to App", () => {
  const template = execFileSync(
    "tar",
    [
      "-xzOf",
      fileURLToPath(
        new URL(
          "../node_modules/@capacitor/cli/assets/ios-spm-template.tar.gz",
          import.meta.url,
        ),
      ),
      "App/App.xcodeproj/project.pbxproj",
    ],
    { encoding: "utf8" },
  ).replaceAll("com.getcapacitor.App", "com.symbio.fitcoach.dev");
  const source = patchIOSProject(template, "0.7.3"),
    runtime = patchIOSRuntimeProject(source);
  assert.match(runtime, /com\.apple\.product-type\.bundle\.unit-test/u);
  assert.ok(runtime.includes(IOS_RUNTIME_TARGET));
  assert.ok(
    runtime.includes('TEST_HOST = "$(BUILT_PRODUCTS_DIR)/App.app/App"'),
  );
  assert.throws(() => patchIOSRuntimeProject(runtime));
  assert.throws(() =>
    patchIOSRuntimeProject(source.replaceAll("CODE_SIGNING_ALLOWED = NO;", "")),
  );
  const appSources = (text) =>
    text.match(
      /504EC3001FED79650016851F \/\* Sources \*\/ = \{[\s\S]*?\n\t\t\};/u,
    )[0];
  assert.equal(appSources(runtime), appSources(source));
  const scheme = iosRuntimeScheme();
  assert.match(scheme, /skipped="NO" parallelizable="NO"/u);
  assert.match(scheme, /buildForArchiving="NO"/u);
  assert.match(scheme, /FITCOACH_RUNTIME_TEST/u);
  assert.doesNotMatch(scheme, /skipped="YES"|parallelizable="YES"/u);
});

test("runtime projects retain an explicit app-only compile scheme", () => {
  const scheme = iosAppScheme();
  assert.equal([...scheme.matchAll(/<BuildActionEntry /gu)].length, 1);
  assert.match(scheme, /BlueprintName="App"/u);
  assert.match(scheme, /BuildableName="App.app"/u);
  assert.match(scheme, /buildForRunning="YES"/u);
  assert.match(scheme, /buildForTesting="NO"/u);
  assert.match(scheme, /buildForArchiving="NO"/u);
  assert.doesNotMatch(
    scheme,
    /FitCoachRuntimeTests|FITCOACH_RUNTIME_TEST|<TestAction/u,
  );
});

test("real iOS test sources use the shipped bridge and controls and keep fixture access bounded", () => {
  const swift = fs.readFileSync(
    new URL("runtime/FitCoachRuntimeTests.swift", import.meta.url),
    "utf8",
  );
  const js = fs.readFileSync(
    new URL("runtime/ios-probes.js", import.meta.url),
    "utf8",
  );
  for (const name of IOS_RUNTIME_TESTS)
    assert.ok(swift.includes(`func ${name}()`));
  assert.match(swift, /targetEnvironment\(simulator\)/u);
  assert.match(
    swift,
    /Bundle\.main\.bundleIdentifier == "com.symbio.fitcoach.dev"/u,
  );
  assert.match(swift, /callAsyncJavaScript/u);
  assert.match(swift, /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/u);
  assert.match(swift, /web\.reload\(\)/u);
  assert.match(js, /createNativePlatformClient\(\)\.secureSessionStorage/u);
  assert.match(js, /await image\.decode\(\)/u);
  assert.match(js, /requestVideoFrameCallback/u);
  assert.match(js, /toggle\.click\(\)/u);
  assert.doesNotMatch(js, /video\.(play|pause)\(|video\.currentTime\s*=(?!=)/u);
  assert.doesNotMatch(
    swift,
    /requestRecordPermission|requestHealthAuthorization|XCTSkip/u,
  );
});
