import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { EXERCISE_MEDIA_MANIFEST as sourceMedia } from "../../../v040/data/exercise-media-manifest.mjs";
import { verifyPixels } from "../../scripts/lossless-web-bundle.mjs";

const app = fileURLToPath(new URL("../../../", import.meta.url));
const bundle = path.resolve(
  process.env.FITCOACH_TEST_BUNDLE_DIR || path.join(app, "native/dist"),
);
const packaged = path.join(bundle, "fitcoach-founder-test");
// Missing artifacts/tools fail: these checks must never pass through skipping.
const { EXERCISE_MEDIA_MANIFEST: delivered, getExerciseMedia } = await import(
  pathToFileURL(path.join(packaged, "v040/data/exercise-media-manifest.mjs"))
);
const localSource = (item) =>
  path.join(app, item.path.replace("/fitcoach-founder-test/", ""));
const localDelivery = (item) => path.join(bundle, item.path.slice(1));
const source = sourceMedia.find((item) => item.type === "poster");
const correct = delivered.find((item) => item.id === source.id);

test("real codecs accept identical full-resolution pixels and reject a different valid image", () => {
  assert.doesNotThrow(() =>
    verifyPixels(localSource(source), localDelivery(correct), source),
  );
  const different = delivered.find(
    (item) => item.type === "poster" && item.id !== source.id,
  );
  assert.throws(
    () => verifyPixels(localSource(source), localDelivery(different), source),
    /pixel verification failed/u,
  );
});

test("packaged runtime manifest preserves all exercise, thumbnail and motion contracts", async () => {
  assert.equal(delivered.length, sourceMedia.length);
  for (const original of sourceMedia) {
    const item = delivered.find((value) => value.id === original.id);
    assert.ok(item);
    assert.ok(Object.isFrozen(item));
    assert.ok(Object.isFrozen(getExerciseMedia(item.exerciseId)));
    if (item.type === "poster") {
      const {
        path: originalPath,
        bytes,
        sha256,
        licenseSource,
        ...preserved
      } = original;
      const {
        path: newPath,
        bytes: newBytes,
        sha256: newHash,
        licenseSource: provenance,
        ...actual
      } = item;
      assert.deepEqual(actual, preserved);
      assert.match(newPath, /\/generated\/lossless\/.+\.webp$/u);
      assert.ok(newBytes < bytes);
      assert.notEqual(newHash, sha256);
      assert.match(provenance, /Original PNG artwork in source repository/u);
      assert.equal(
        fs.existsSync(path.join(bundle, originalPath.slice(1))),
        false,
        "duplicate production PNG must not ship",
      );
      assert.ok(Object.isFrozen(item.thumbnail));
    } else assert.deepEqual(item, original);
    assert.equal(fs.statSync(localDelivery(item)).size, item.bytes);
  }
  assert.equal(delivered.filter((item) => item.type === "poster").length, 100);
  assert.equal(delivered.filter((item) => item.type === "mp4").length, 59);
  const { EXERCISES } = await import(
    pathToFileURL(path.join(packaged, "v040/data/exercise-library.mjs"))
  );
  const { validateExerciseLibrary } = await import(
    pathToFileURL(path.join(packaged, "v040/data/exercise-schema.mjs"))
  );
  assert.deepEqual(validateExerciseLibrary(EXERCISES, delivered), {
    valid: true,
    errors: [],
  });
  assert.equal(EXERCISES.length, 100);
});
