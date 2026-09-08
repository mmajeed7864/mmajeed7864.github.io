import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  bootOwnedSimulator,
  IOS_BOOT_BUDGET,
  IOS_DEVICE_TYPE,
  IOS_RUNTIME,
} from "../scripts/ios-runtime-smoke.mjs";

const env = {
  CI: "true",
  GITHUB_ACTIONS: "true",
  RUNNER_ENVIRONMENT: "github-hosted",
  RUNNER_TEMP: "/tmp/runner",
  FITCOACH_TEST_IOS_PROJECT: "/tmp/runner/project",
  FITCOACH_IOS_DERIVED: "/tmp/runner/derived",
  DEVELOPER_DIR: "/Applications/Xcode_26.3.app/Contents/Developer",
};
const udid = "12345678-1234-1234-1234-123456789ABC";
const name = "fitcoach-ci-12345678-1234-1234-1234-123456789abc";
function fixture() {
  const device = {
    udid,
    name,
    state: "Shutdown",
    deviceTypeIdentifier: IOS_DEVICE_TYPE,
  };
  const calls = [],
    events = [];
  let time = 0;
  const options = {
    udid,
    name,
    env,
    platform: "darwin",
    clock: () => time,
    readInventory: () => ({
      runtimes: [{ identifier: IOS_RUNTIME, isAvailable: true }],
      devicetypes: [{ identifier: IOS_DEVICE_TYPE }],
      devices: { [IOS_RUNTIME]: [{ ...device }] },
    }),
    execute(tool, args, config) {
      calls.push({ tool, args, config });
      time += 250;
      if (args[1] === "boot") device.state = "Booting";
      if (args[1] === "bootstatus") device.state = "Booted";
    },
    record: (event) => events.push(event),
  };
  return { device, calls, events, options };
}

test("first boot prepares only the reviewed runtime and waits for actual readiness", () => {
  const f = fixture();
  bootOwnedSimulator(f.options);
  assert.deepEqual(
    f.calls.map((c) => c.args),
    [
      ["simctl", "runtime", "dyld_shared_cache", "update", IOS_RUNTIME],
      ["simctl", "boot", udid],
      ["simctl", "bootstatus", udid, "-b"],
    ],
  );
  assert.deepEqual(
    f.calls.map((c) => c.config.timeout),
    [180_000, 60_000, 480_000],
  );
  for (const call of f.calls) {
    assert.equal(call.tool, "/usr/bin/xcrun");
    assert.equal(call.config.killSignal, "SIGKILL");
    assert.equal(call.config.stdio, "inherit");
  }
  assert.deepEqual(
    f.events.filter((e) => e.status === "started").map((e) => e.phase),
    ["shared-cache", "boot-request", "boot-readiness"],
  );
  assert.equal(f.events.at(-1).phase, "boot-verified");
  assert.equal(f.events.at(-1).appTestsExecuted, false);
  assert.ok(
    f.events
      .filter((e) => e.elapsedMs !== undefined)
      .every((e) => e.elapsedMs === 250),
  );
});

test("boot helper refuses personal hosts and active or unowned simulators before effects", () => {
  for (const patch of [
    { platform: "linux" },
    { env: { ...env, CI: "false" } },
    { udid: "booted" },
    { name: "personal" },
  ]) {
    const f = fixture();
    assert.throws(() => bootOwnedSimulator({ ...f.options, ...patch }));
    assert.equal(f.calls.length, 0);
  }
  for (const patch of [
    { state: "Booted" },
    { name: "somebody-else" },
    { deviceTypeIdentifier: "other" },
  ]) {
    const f = fixture();
    Object.assign(f.device, patch);
    assert.throws(() => bootOwnedSimulator(f.options));
    assert.equal(f.calls.length, 0);
  }
});

test("cache preparation failure is not skipped or treated as successful app testing", () => {
  const f = fixture();
  f.options.execute = () => {
    throw Error("dyld cache preparation failed");
  };
  assert.throws(
    () => bootOwnedSimulator(f.options),
    /shared-cache failed before app testing/,
  );
  assert.deepEqual(
    f.events.map((e) => e.status),
    ["started", "failed"],
  );
  assert.equal(
    f.events.some((e) => e.phase === "boot-verified"),
    false,
  );
});

test("boot request and readiness failures stop without retrying or launching tests", () => {
  for (const phase of ["boot", "bootstatus"]) {
    const f = fixture(),
      execute = f.options.execute;
    const failure = Object.assign(
      Error("ETIMEDOUT: first boot migration still pending"),
      { code: "ETIMEDOUT" },
    );
    f.options.execute = (tool, args, options) => {
      execute(tool, args, options);
      if (args[1] === phase) throw failure;
    };
    assert.throws(
      () => bootOwnedSimulator(f.options),
      (error) => error.cause === failure,
    );
    assert.equal(f.calls.filter((c) => c.args[1] === phase).length, 1);
    assert.equal(f.events.at(-1).status, "failed");
    assert.match(f.events.at(-1).message, /migration still pending/);
    assert.equal(
      f.events.some((e) => e.phase === "boot-verified"),
      false,
    );
    assert.ok(f.calls.every((c) => c.tool === "/usr/bin/xcrun"));
  }
});

test("a changed identity is rechecked between preparation, boot request and readiness", () => {
  for (const changeAfter of ["runtime", "boot", "bootstatus"]) {
    const f = fixture(),
      execute = f.options.execute;
    f.options.execute = (tool, args, options) => {
      execute(tool, args, options);
      if (args[1] === changeAfter) f.device.name = "not-owned";
    };
    assert.throws(() => bootOwnedSimulator(f.options), /identity changed/);
    assert.equal(
      f.events.some((e) => e.phase === "boot-verified"),
      false,
    );
    assert.equal(f.calls.at(-1).args[1], changeAfter);
  }
});

test("bootstatus exit alone cannot pass if inventory still reports migration or shutdown", () => {
  for (const state of ["Shutdown", "Booting", "Shutting Down"]) {
    const f = fixture(),
      execute = f.options.execute;
    f.options.execute = (tool, args, options) => {
      execute(tool, args, options);
      if (args[1] === "bootstatus") f.device.state = state;
    };
    assert.throws(() => bootOwnedSimulator(f.options), /did not boot/);
    assert.equal(
      f.events.some((e) => e.phase === "boot-verified"),
      false,
    );
  }
});

test("another simulator becoming active during preparation prevents boot effects", () => {
  const f = fixture(),
    inventory = f.options.readInventory;
  f.options.readInventory = () => {
    const value = inventory();
    if (f.calls.length)
      value.devices[IOS_RUNTIME].push({
        ...f.device,
        udid: "other",
        state: "Booted",
      });
    return value;
  };
  assert.throws(() => bootOwnedSimulator(f.options), /active/);
  assert.equal(f.calls.length, 1);
});

test("startup budget fits the workflow without retries, uploads or a paid runner", () => {
  const workflow = fs.readFileSync(
    new URL(
      "../../../.github/workflows/fitcoach-ios-build.yml",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(Object.isFrozen(IOS_BOOT_BUDGET), true);
  assert.match(workflow, /timeout-minutes: 45/);
  assert.match(workflow, /runs-on: macos-15-intel/);
  assert.doesNotMatch(
    workflow,
    /upload-artifact|continue-on-error|nick-fields\/retry/,
  );
  const runner = fs.readFileSync(
    new URL("../scripts/ios-runtime-smoke.mjs", import.meta.url),
    "utf8",
  );
  assert.match(runner, /boot-events\.jsonl/);
  assert.match(runner, /Additional owned-simulator cleanup failure/);
  assert.match(runner, /verifyIOSRuntimeResults\(summary, tree\)/);
  assert.match(runner, /verifyRuntimeSigning\(/);
});
