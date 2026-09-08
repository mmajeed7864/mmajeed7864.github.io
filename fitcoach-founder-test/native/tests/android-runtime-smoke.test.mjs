import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  validateRuntimeHost,
  assertUnusedDevices,
  verifyTestReport,
  TESTS,
} from "../scripts/android-runtime-smoke.mjs";

const env = {
  CI: "true",
  GITHUB_ACTIONS: "true",
  RUNNER_TEMP: "/tmp/runner",
  ANDROID_HOME: "/opt/android",
  FITCOACH_TEST_ANDROID_PROJECT: "/tmp/runner/generated",
};

test("runtime harness refuses personal hosts and projects outside the isolated runner", () => {
  assert.equal(
    validateRuntimeHost(env, "linux").project,
    "/tmp/runner/generated",
  );
  for (const patch of [
    { CI: "false" },
    { GITHUB_ACTIONS: "" },
    { RUNNER_TEMP: "" },
    { ANDROID_HOME: "relative" },
    { FITCOACH_TEST_ANDROID_PROJECT: "/tmp/runner" },
    { FITCOACH_TEST_ANDROID_PROJECT: "/tmp/runner-other/project" },
  ])
    assert.throws(() => validateRuntimeHost({ ...env, ...patch }, "linux"));
  assert.throws(() => validateRuntimeHost(env, "darwin"));
});

test("no connected device, including an existing emulator, may be reused or reset", () => {
  assert.doesNotThrow(() =>
    assertUnusedDevices("List of devices attached\n\n"),
  );
  for (const output of [
    "",
    "device\tdevice",
    "List of devices attached\nphone\tdevice",
    "List of devices attached\nemulator-5554\tdevice",
    "List of devices attached\nphone\tunauthorized",
  ])
    assert.throws(() => assertUnusedDevices(output));
});

test("successful Gradle exit or zero tests cannot substitute for every real runtime assertion", () => {
  const cases = TESTS.map(
    (name) =>
      `<testcase name="${name}" classname="com.symbio.fitcoach.FitCoachRuntimeTest"/>`,
  ).join("");
  assert.equal(verifyTestReport(`<testsuite>${cases}</testsuite>`).tests, 4);
  for (const xml of [
    "",
    '<testsuite tests="0"/>',
    cases + "<skipped/>",
    cases + "<failure/>",
    cases + "<error/>",
    cases + cases,
    cases.replace(TESTS[0], "unrelated"),
  ])
    assert.throws(() => verifyTestReport(xml));
});

test("instrumentation stays outside the production source set and uses the actual native bridge", () => {
  const source = fs.readFileSync(
    new URL(
      "../android/app/src/androidTest/java/com/symbio/fitcoach/FitCoachRuntimeTest.kt",
      import.meta.url,
    ),
    "utf8",
  );
  for (const name of TESTS) assert.ok(source.includes(`fun ${name}()`));
  assert.match(source, /activity\.bridge\.webView\.evaluateJavascript/u);
  assert.match(source, /scenario\.recreate\(\)/u);
  assert.match(source, /AndroidKeyStore/u);
  assert.doesNotMatch(source, /import\(['"]\//u);
  assert.match(source, /location\.origin\)\.href/u);
  assert.match(source, /video\.requestVideoFrameCallback/u);
  assert.match(source, /toggle\.click\(\)/u);
  assert.match(source, /Math\.abs\(video\.currentTime - pauseTime\)/u);
  assert.doesNotMatch(source, /video\.(?:play|pause)\(|video\.currentTime\s*=/u);
  assert.doesNotMatch(
    source,
    /grantPermission|purchaseSubscription\(|requestHealthAuthorization\(|startSpeechRecognition\(/u,
  );
});
