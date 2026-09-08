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
    architectures: ["x86_64"],
  });
  for (const [offset, value] of [
    [0, 0],
    [4, 0],
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
    [52, 1],
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

const universalFixture = (wide = false) => {
  const bytes = Buffer.alloc(256);
  bytes.writeUInt32BE(wide ? 0xcafebabf : 0xcafebabe, 0);
  bytes.writeUInt32BE(2, 4);
  for (const [index, cpu] of [0x01000007, 0x0100000c].entries()) {
    const entry = 8 + index * (wide ? 32 : 20),
      start = 128 + index * 64;
    const slice = fixture();
    slice.writeUInt32LE(cpu, 4);
    bytes.writeUInt32BE(cpu, entry);
    if (wide) {
      bytes.writeBigUInt64BE(BigInt(start), entry + 8);
      bytes.writeBigUInt64BE(BigInt(slice.length), entry + 16);
    } else {
      bytes.writeUInt32BE(start, entry + 8);
      bytes.writeUInt32BE(slice.length, entry + 12);
    }
    bytes.writeUInt32BE(6, entry + (wide ? 24 : 16));
    slice.copy(bytes, start);
  }
  return bytes;
};

test("both universal header formats inspect every simulator architecture", () => {
  for (const wide of [false, true]) {
    assert.deepEqual(inspectSimulatorExecutable(universalFixture(wide)), {
      platform: 7,
      minimumMajor: 17,
      sdkMajor: 26,
      architectures: ["x86_64", "arm64"],
    });
    for (const [offset, value] of [
      [40, 2],
      [44, 16 << 16],
      [48, 25 << 16],
      [48, 27 << 16],
    ]) {
      const bytes = universalFixture(wide);
      bytes.writeUInt32LE(value, 192 + offset);
      assert.throws(() => inspectSimulatorExecutable(bytes));
    }
  }
});

test("universal metadata cannot hide truncated, overlapping or mismatched executable members", () => {
  for (const [offset, value] of [
    [4, 0],
    [4, 3],
    [4, 0xffffffff],
    [8, 0x0100000c],
    [12, 1],
    [16, 32],
    [16, 0xffffffff],
    [20, 0xffffffff],
    [24, 32],
    [24, 8],
    [28, 0x01000007],
    [36, 128],
    [40, 1],
  ]) {
    const bytes = universalFixture();
    bytes.writeUInt32BE(value, offset);
    assert.throws(() => inspectSimulatorExecutable(bytes));
  }
  const reserved = universalFixture(true);
  reserved.writeUInt32BE(1, 36);
  assert.throws(() => inspectSimulatorExecutable(reserved));
  const imprecise = universalFixture(true);
  imprecise.writeBigUInt64BE(2n ** 63n, 16);
  assert.throws(() => inspectSimulatorExecutable(imprecise));
  for (const length of [6, 47, 80, 240])
    assert.throws(() =>
      inspectSimulatorExecutable(universalFixture().subarray(0, length)),
    );
});
