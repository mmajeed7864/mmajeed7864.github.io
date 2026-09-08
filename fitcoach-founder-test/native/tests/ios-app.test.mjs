import assert from "node:assert/strict";
import test from "node:test";
import { inspectSimulatorExecutable } from "../scripts/verify-ios-app.mjs";
const fixture = () => {
  const bytes = Buffer.alloc(56);
  for (const [offset, value] of [
    [0, 0xfeedfacf],
    [4, 0x01000007],
    [12, 2],
    [16, 1],
    [20, 24],
    [32, 0x32],
    [36, 24],
    [40, 7],
    [44, 17 << 16],
    [48, 26 << 16],
  ])
    bytes.writeUInt32LE(value, offset);
  return bytes;
};
test("compiled executable inspection distinguishes simulator platform and deployment SDK", () => {
  assert.deepEqual(inspectSimulatorExecutable(fixture()), {
    platform: 7,
    minimumMajor: 17,
    sdkMajor: 26,
  });
  for (const [offset, value] of [
    [0, 0],
    [12, 6],
    [16, 0],
    [16, 20000],
    [20, 2000],
    [32, 0x25],
    [36, 0],
    [36, 7],
    [40, 1],
    [40, 2],
    [44, 15 << 16],
    [48, 25 << 16],
  ]) {
    const bytes = fixture();
    bytes.writeUInt32LE(value, offset);
    assert.throws(() => inspectSimulatorExecutable(bytes));
  }
  assert.throws(() =>
    inspectSimulatorExecutable(Buffer.from("source is not an executable")),
  );
  assert.throws(() => inspectSimulatorExecutable(fixture().subarray(0, 50)));
});
