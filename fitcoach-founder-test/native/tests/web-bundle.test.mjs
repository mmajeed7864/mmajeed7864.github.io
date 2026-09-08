import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { collectWebBundle, prepareWebBundle, verifyWebBundle, APP_PREFIX, START_PATH, INVENTORY_NAME } from "../scripts/prepare-web-bundle.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const realRoot = fileURLToPath(new URL("../../", import.meta.url));
function fixture(t) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fitcoach-bundle-test-")));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const appRoot = path.join(temp, "app");
  const outDir = path.join(temp, "built");
  const write = (file, value) => {
    const full = path.join(appRoot, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, value);
  };
  const shell = ["./", "./index.html?v=0100", "./manifest.webmanifest?v=0100", "./v040/app.js?v=0100", "./v040/styles.css?v=0100"];
  const modules = ["./v040/core/store.mjs"];
  const anatomy = ["./v040/assets/anatomy/core-v2.png"];
  write("sw.js", [ ["SHELL_ASSETS", shell], ["MODULE_ASSETS", modules], ["ANATOMY_ASSETS", anatomy] ].map(([name, entries]) => `const ${name} = Object.freeze(${JSON.stringify(entries)});`).join("\n"));
  write("index.html", '<link rel="stylesheet" href="./v040/styles.css?v=0100"><script type="module" src="./v040/app.js?v=0100"></script>');
  write("manifest.webmanifest", JSON.stringify({ version: "0.1.0", start_url: "./?v=0100", icons: [] }));
  write("v040/app.js", 'import { value } from "./core/store.mjs";');
  write("v040/core/store.mjs", 'export const value = 1;');
  write("v040/styles.css", 'body { background-image: url("./assets/anatomy/core-v2.png"); }');
  write("v040/assets/anatomy/core-v2.png", "anatomy-fixture");
  write("v040/assets/fonts/BarlowCondensed-OFL.txt", "test license one");
  write("v040/assets/fonts/Manrope-OFL.txt", "test license two");
  const file = "v040/assets/exercises/generated/example.png";
  const thumb = "v040/assets/exercises/thumbnails/example.webp";
  write(file, "poster");
  write(thumb, "thumb");
  const media = [{ id: "poster", type: "poster", path: `${APP_PREFIX}${file}`, bytes: 6, sha256: sha("poster"), thumbnail: { path: `${APP_PREFIX}${thumb}`, bytes: 5, sha256: sha("thumb") } }];
  return { temp, appRoot, outDir, write, media, options: { appRoot, outDir, media } };
}

test("assembles deterministic nested app paths without rewriting source bytes", t => {
  const f = fixture(t);
  const before = fs.readFileSync(path.join(f.appRoot, "index.html"));
  const first = prepareWebBundle(f.options);
  const second = prepareWebBundle({ ...f.options, outDir: path.join(f.temp, "second") });
  assert.deepEqual(first, second);
  assert.equal(first.appStartPath, START_PATH);
  assert.equal(first.appVersion, "0.1.0");
  assert.deepEqual(fs.readFileSync(path.join(f.outDir, START_PATH.slice(1))), before);
  assert.deepEqual(fs.readFileSync(path.join(f.appRoot, "index.html")), before);
  assert.match(fs.readFileSync(path.join(f.outDir, "index.html"), "utf8"), /Open FitCoach/u);
  assert.deepEqual(verifyWebBundle(f.options), first);
  assert.ok(first.files.some(item => item.path.endsWith("Manrope-OFL.txt")));
  assert.ok(first.files.some(item => item.path.endsWith("thumbnails/example.webp")));
});

test("unlisted legacy, quarantine, native source and secrets are not copied", t => {
  const f = fixture(t);
  for (const file of [".env", "native/private-key.pem", "docs/review.md", "v040/assets/exercises/motion/rejected.mp4"]) f.write(file, "must-not-ship");
  const result = prepareWebBundle(f.options);
  assert.equal(result.files.some(item => /env|private-key|review\.md|rejected/u.test(item.path)), false);
});

test("missing inputs fail before output exists", t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.appRoot, "v040/assets/anatomy/core-v2.png"));
  assert.throws(() => prepareWebBundle(f.options), /ENOENT/u);
  assert.equal(fs.existsSync(f.outDir), false);
});

test("modified poster and thumbnail bytes fail their declared hashes", t => {
  const f = fixture(t);
  f.write("v040/assets/exercises/thumbnails/example.webp", "wrong");
  assert.throws(() => prepareWebBundle(f.options), /Media bytes\/hash mismatch/u);
  f.write("v040/assets/exercises/thumbnails/example.webp", "thumb");
  f.write("v040/assets/exercises/generated/example.png", "change");
  assert.throws(() => prepareWebBundle(f.options), /Media bytes\/hash mismatch/u);
  assert.equal(fs.existsSync(f.outDir), false);
});

test("references outside the app and encoded paths are rejected", t => {
  const f = fixture(t);
  for (const reference of ["../../.env", "https://evil.invalid/video.mp4", "//evil.invalid/video.mp4", `${APP_PREFIX}v040/assets/exercises/%2e%2e/secret.png`]) {
    assert.throws(() => collectWebBundle({ ...f.options, media: [{ ...f.media[0], path: reference }] }), /escapes app|Invalid local reference/u);
  }
});

test("unapproved motion and missing or conflicting integrity metadata are rejected", t => {
  const f = fixture(t);
  assert.throws(() => collectWebBundle({ ...f.options, media: [{ ...f.media[0], type: "mp4", motionReviewStatus: "rejected" }] }), /Unapproved motion/u);
  assert.throws(() => collectWebBundle({ ...f.options, media: [{ ...f.media[0], sha256: "" }] }), /Missing media integrity/u);
  assert.throws(() => collectWebBundle({ ...f.options, media: [...f.media, { ...f.media[0], bytes: 7 }] }), /Conflicting media metadata/u);
});

test("precache lists cannot sneak an unmanifested exercise into the bundle", t => {
  const f = fixture(t);
  const sw = fs.readFileSync(path.join(f.appRoot, "sw.js"), "utf8");
  f.write("sw.js", sw.replace('"./index.html?v=0100"', '"./index.html?v=0100", "./v040/assets/exercises/motion/rejected.mp4"'));
  f.write("v040/assets/exercises/motion/rejected.mp4", "rejected");
  assert.throws(() => prepareWebBundle(f.options), /absent from integrity manifest/u);
  assert.equal(fs.existsSync(f.outDir), false);
});

test("missing static imports and new dynamic imports require packaging review", t => {
  const f = fixture(t);
  f.write("v040/app.js", 'import { value } from "./core/missing.mjs";');
  assert.throws(() => collectWebBundle(f.options), /Unpackaged reference/u);
  f.write("v040/app.js", 'const mod = import("./core/store.mjs");');
  assert.throws(() => collectWebBundle(f.options), /Dynamic imports/u);
});

test("unpackaged CSS, HTML and manifest assets are rejected", t => {
  const f = fixture(t);
  f.write("v040/styles.css", 'body { background: url("./assets/anatomy/new.png"); }');
  assert.throws(() => collectWebBundle(f.options), /Unpackaged reference/u);
  f.write("v040/styles.css", 'body { color: blue; }');
  f.write("index.html", '<img src="./v040/assets/anatomy/new.png">');
  assert.throws(() => collectWebBundle(f.options), /Unpackaged reference/u);
  f.write("index.html", "<title>Fixture</title>");
  f.write("manifest.webmanifest", JSON.stringify({ version: "0.1.0", start_url: "./", icons: [{ src: "./assets/icon-symbio.svg" }] }));
  assert.throws(() => collectWebBundle(f.options), /Unpackaged reference/u);
});

test("service-worker lists cannot execute code or include source secrets", t => {
  const f = fixture(t);
  const sw = fs.readFileSync(path.join(f.appRoot, "sw.js"), "utf8");
  f.write("sw.js", sw.replace('"./index.html?v=0100"', 'process.exit(1)'));
  assert.throws(() => collectWebBundle(f.options), /Unsupported precache expression/u);
  f.write("sw.js", sw.replace('"./index.html?v=0100"', '"./native/secret.txt"'));
  assert.throws(() => collectWebBundle(f.options), /Not an allowed runtime input/u);
});

test("external navigation links do not permit remote script, image or stylesheet dependencies", t => {
  const f = fixture(t);
  f.write("index.html", '<a href="https://example.invalid/support">Support</a><a href="mailto:support@example.invalid">Email</a>');
  assert.doesNotThrow(() => collectWebBundle(f.options));
  for (const html of ['<script src="https://example.invalid/app.js"></script>', '<img src="https://example.invalid/photo.png">', '<link rel="stylesheet" href="https://example.invalid/app.css">']) {
    f.write("index.html", html);
    assert.throws(() => collectWebBundle(f.options), /Reference escapes app/u);
  }
  f.write("index.html", "<title>Fixture</title>");
  f.write("v040/styles.css", 'body { background: url("https://example.invalid/photo.png"); }');
  assert.throws(() => collectWebBundle(f.options), /Reference escapes app/u);
});

test("source symlinks, including symlinked directories, are refused", t => {
  const f = fixture(t);
  const file = path.join(f.appRoot, "v040/core/store.mjs");
  fs.renameSync(file, path.join(f.temp, "store.mjs"));
  fs.symlinkSync(path.join(f.temp, "store.mjs"), file);
  assert.throws(() => collectWebBundle(f.options), /unlinked source file/u);
  fs.unlinkSync(file);
  fs.rmdirSync(path.dirname(file));
  fs.mkdirSync(path.join(f.temp, "linked-core"));
  fs.renameSync(path.join(f.temp, "store.mjs"), path.join(f.temp, "linked-core/store.mjs"));
  fs.symlinkSync(path.join(f.temp, "linked-core"), path.dirname(file));
  assert.throws(() => collectWebBundle(f.options), /unlinked source file/u);
});

test("an existing destination is never overwritten, even if it is empty or a symlink", t => {
  const f = fixture(t);
  fs.mkdirSync(f.outDir);
  assert.throws(() => prepareWebBundle(f.options), /EEXIST/u);
  fs.writeFileSync(path.join(f.outDir, "keep.txt"), "keep");
  assert.throws(() => prepareWebBundle(f.options), /EEXIST/u);
  assert.equal(fs.readFileSync(path.join(f.outDir, "keep.txt"), "utf8"), "keep");
  fs.symlinkSync(f.outDir, path.join(f.temp, "link"));
  assert.throws(() => prepareWebBundle({ ...f.options, outDir: path.join(f.temp, "link") }), /EEXIST/u);
  assert.throws(() => prepareWebBundle({ ...f.options, outDir: path.join(f.temp, "link/child") }), /symlinks/u);
});

test("source overlap and bundle byte budget are enforced", t => {
  const f = fixture(t);
  for (const output of [f.appRoot, f.temp, path.join(f.appRoot, "v040/output")]) assert.throws(() => prepareWebBundle({ ...f.options, outDir: output }), /overlaps/u);
  assert.throws(() => prepareWebBundle({ ...f.options, maxBytes: 1 }), /exceeds byte budget/u);
  assert.equal(fs.existsSync(f.outDir), false);
});

test("assembled verification detects corruption, extra files and stale source", t => {
  const f = fixture(t);
  prepareWebBundle(f.options);
  const assembled = path.join(f.outDir, "fitcoach-founder-test/v040/core/store.mjs");
  const original = fs.readFileSync(assembled);
  fs.writeFileSync(assembled, "changed");
  assert.throws(() => verifyWebBundle(f.options), /Assembled bytes\/hash mismatch/u);
  fs.writeFileSync(assembled, original);
  fs.writeFileSync(path.join(f.outDir, "unexpected.env"), "never ship");
  assert.throws(() => verifyWebBundle(f.options), /missing or unexpected/u);
  fs.unlinkSync(path.join(f.outDir, "unexpected.env"));
  f.write("v040/core/store.mjs", 'export const value = 2;');
  assert.throws(() => verifyWebBundle(f.options), /stale or altered/u);
});

test("assembled inventory tampering and links are rejected", t => {
  const f = fixture(t);
  prepareWebBundle(f.options);
  const file = path.join(f.outDir, INVENTORY_NAME);
  const original = fs.readFileSync(file);
  fs.writeFileSync(file, "{}");
  assert.throws(() => verifyWebBundle(f.options), /stale or altered/u);
  fs.writeFileSync(file, original);
  fs.symlinkSync(path.join(f.outDir, "index.html"), path.join(f.outDir, "extra-link"));
  assert.throws(() => verifyWebBundle(f.options), /Symlink in assembled bundle/u);
});

test("real app inventory retains all declared media, legal pages and the local native launch path", () => {
  const { inventory } = collectWebBundle();
  const paths = new Set(inventory.files.map(item => item.path));
  assert.equal(inventory.files.filter(item => item.path.endsWith(".mp4")).length, 59);
  assert.equal(paths.has("fitcoach-founder-test/v040/assets/exercises/motion/hollow-body-hold-motion-v1.mp4"), false);
  for (const name of ["privacy", "terms", "delete-account", "support"]) assert.ok(paths.has(`fitcoach-founder-test/legal/${name}.html`));
  const config = fs.readFileSync(path.join(realRoot, "native/capacitor.config.ts"), "utf8");
  assert.ok(config.includes(`appStartPath: "${START_PATH}"`));
  assert.ok(config.includes('webDir: "dist"'));
  assert.ok(paths.has(START_PATH.slice(1)));
});
