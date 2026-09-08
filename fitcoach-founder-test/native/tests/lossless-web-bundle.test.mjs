import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  deliveryPath,
  reserveOutput,
  transformedDefinitions,
  colorProfile,
  deliveryServiceWorker,
} from "../scripts/lossless-web-bundle.mjs";

test("delivery cache identities are deterministic, manifest-bound and isolated from PNG", () => {
  const source = fs.readFileSync(
    new URL("../../sw.js", import.meta.url),
    "utf8",
  );
  const digest = createHash("sha256").update("manifest-a").digest("hex");
  const worker = deliveryServiceWorker(source, digest);
  assert.deepEqual(deliveryServiceWorker(source, digest), worker);
  assert.notDeepEqual(deliveryServiceWorker(source, "b".repeat(64)), worker);
  const suffix = `-lossless-${digest.slice(0, 20)}`;
  assert.equal(worker.toString().split(suffix).length, 3);
  assert.equal(worker.toString().replaceAll(suffix, ""), source);
  assert.equal(
    fs.readFileSync(new URL("../../sw.js", import.meta.url), "utf8"),
    source,
  );
  for (const changed of [
    source.replace('const CACHE = "', 'let CACHE = "'),
    source.replace("fitcoach-exercise-images-v", "unreviewed-images-v"),
    `${source}\nconst CACHE = "fitcoach-symbio-v9999";`,
    source.replace(/^const MEDIA_CACHE = .+;$/mu, ""),
  ])
    assert.throws(() => deliveryServiceWorker(changed, digest), /Unreviewed/u);
  assert.throws(
    () => deliveryServiceWorker(source, "not-a-digest"),
    /Invalid/u,
  );
});

test("delivery paths cannot escape the approved full-resolution poster directory", () => {
  assert.equal(
    deliveryPath("generated/air-squat-premium-v2.png"),
    "generated/lossless/air-squat-premium-v2.webp",
  );
  for (const file of [
    "../secret.png",
    "generated/../secret.png",
    "/generated/air-squat-premium-v2.png",
    "https://evil.test/a.png",
    "generated/a%2fpremium-v2.png",
    "generated/thumbs/air-squat-premium-v2.png",
    "generated/air-squat-premium-v2.webp",
  ])
    assert.throws(() => deliveryPath(file), /Invalid/u);
});

test("derived definitions preserve identity, art direction, source and thumbnail lookup", () => {
  const source = {
    id: "a",
    exerciseId: "air-squat",
    file: "generated/air-squat-premium-v2.png",
    bytes: 100,
    sha256: "original",
    alt: "Original image",
    width: 1254,
    height: 1254,
    view: "side",
  };
  const record = {
    id: "a",
    sourceBytes: 100,
    sourceSha256: "original",
    bytes: 80,
    sha256: "encoded",
  };
  const [output] = transformedDefinitions([source], [record]);
  assert.equal(
    output.path,
    "/fitcoach-founder-test/v040/assets/exercises/generated/lossless/air-squat-premium-v2.webp",
  );
  assert.equal(output.bytes, 80);
  assert.equal(output.sha256, "encoded");
  for (const key of ["id", "exerciseId", "alt", "width", "height", "view"])
    assert.equal(output[key], source[key]);
  assert.match(output.licenseSource, /generated\/air-squat-premium-v2\.png/u);
  assert.equal(source.file.endsWith(".png"), true);
  for (const records of [
    [],
    [record, record],
    [{ ...record, id: "wrong" }],
    [{ ...record, sourceBytes: 99 }],
    [{ ...record, sourceSha256: "wrong" }],
  ])
    assert.throws(
      () => transformedDefinitions([source], records),
      /Incomplete|provenance/u,
    );
});

test("output reservation refuses sources, existing output and symlink parents without erasure", (t) => {
  const temp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "fitcoach-lossless-test-")),
  );
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const source = path.join(temp, "source");
  fs.mkdirSync(source);
  const destination = path.join(temp, "built");
  assert.equal(reserveOutput(destination, source), destination);
  fs.writeFileSync(path.join(destination, "keep"), "keep");
  assert.throws(() => reserveOutput(destination, source), /EEXIST/u);
  assert.equal(fs.readFileSync(path.join(destination, "keep"), "utf8"), "keep");
  for (const overlap of [source, temp, path.join(source, "v040/assets")])
    assert.throws(() => reserveOutput(overlap, source), /overlaps/u);
  const link = path.join(temp, "linked");
  fs.symlinkSync(destination, link);
  assert.throws(
    () => reserveOutput(path.join(link, "child"), source),
    /symlinks/u,
  );
});

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4);
  data.copy(chunk, 8);
  return chunk; // Parser tests do not decode images or claim CRC validity.
}
function webpChunk(type, data) {
  const chunk = Buffer.alloc(8 + data.length + (data.length % 2));
  chunk.write(type);
  chunk.writeUInt32LE(data.length, 4);
  data.copy(chunk, 8);
  return chunk;
}

test("embedded ICC profiles match across PNG and WebP containers", () => {
  const profile = Buffer.from("synthetic color profile");
  const png = Buffer.concat([
    Buffer.alloc(8),
    pngChunk(
      "iCCP",
      Buffer.concat([Buffer.from("profile\0\0"), deflateSync(profile)]),
    ),
  ]);
  const webp = Buffer.concat([Buffer.alloc(12), webpChunk("ICCP", profile)]);
  const expected = createHash("sha256").update(profile).digest("hex");
  assert.equal(colorProfile(png, "png"), expected);
  assert.equal(colorProfile(webp, "webp"), expected);
  assert.equal(colorProfile(Buffer.alloc(8), "png"), null);
});

test("ambiguous color spaces, malformed profiles and truncated chunks fail closed", () => {
  const gamma = pngChunk("gAMA", Buffer.alloc(4));
  assert.throws(
    () => colorProfile(Buffer.concat([Buffer.alloc(8), gamma]), "png"),
    /reviewed ICC/u,
  );
  assert.equal(
    colorProfile(
      Buffer.concat([
        Buffer.alloc(8),
        gamma,
        pngChunk("sRGB", Buffer.from([0])),
      ]),
      "png",
    ),
    null,
  );
  assert.throws(
    () =>
      colorProfile(
        Buffer.concat([Buffer.alloc(8), pngChunk("iCCP", Buffer.from("bad"))]),
        "png",
      ),
    /Invalid PNG/u,
  );
  assert.throws(() => colorProfile(Buffer.alloc(10), "png"), /Truncated/u);
  const malformed = Buffer.alloc(16);
  malformed.writeUInt32BE(100, 8);
  assert.throws(() => colorProfile(malformed, "png"), /chunk length/u);
});
