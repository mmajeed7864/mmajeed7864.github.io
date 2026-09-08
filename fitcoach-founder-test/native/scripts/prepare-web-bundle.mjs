import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { EXERCISE_MEDIA_MANIFEST } from "../../v040/data/exercise-media-manifest.mjs";

export const APP_PREFIX = "/fitcoach-founder-test/";
export const START_PATH = `${APP_PREFIX}index.html`;
export const INVENTORY_NAME = "fitcoach-web-bundle.json";
const DEFAULT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FONT_LICENSES = ["v040/assets/fonts/BarlowCondensed-OFL.txt", "v040/assets/fonts/Manrope-OFL.txt"];
export const FALLBACK_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; object-src 'none'; base-uri 'none'">
<title>FitCoach</title></head><body><a href="${START_PATH}">Open FitCoach</a></body></html>
`;
const digest = value => createHash("sha256").update(value).digest("hex");
const sorted = values => [...values].sort();
const inside = (parent, child) => child.startsWith(`${parent}${path.sep}`);

function requireRuntimePath(file) {
  const allowed = /^(?:index\.html|manifest\.webmanifest|sw\.js|assets\/icon-symbio\.svg|legal\/(?:privacy\.html|terms\.html|delete-account\.html|support\.html|legal\.css)|v040\/(?:app\.js|boot\.js|[a-z0-9-]+\.css|(?:core|data|domain|policy|services|ui|voice)\/[a-z0-9-]+\.(?:mjs|css)|assets\/(?:anatomy|brand|fonts|exercises)(?:\/[a-zA-Z0-9_-]+)+\.(?:png|jpg|webp|svg|mp4|ttf|txt)))$/u;
  if (!allowed.test(file)) throw new Error(`Not an allowed runtime input: ${file}`);
  return file;
}

function localFile(reference, from = "index.html") {
  if (typeof reference !== "string" || /[%\\\x00-\x20]/u.test(reference)) throw new Error(`Invalid local reference: ${reference}`);
  const base = new URL(`${APP_PREFIX}${from}`, "https://bundle.invalid");
  const url = new URL(reference, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(APP_PREFIX)) throw new Error(`Reference escapes app: ${reference}`);
  return requireRuntimePath(url.pathname.slice(APP_PREFIX.length) || "index.html");
}

function regularFile(root, file) {
  const absolute = path.join(root, requireRuntimePath(file));
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(absolute) !== absolute) throw new Error(`Not a regular, unlinked source file: ${file}`);
  return absolute;
}

function precacheFiles(source) {
  return ["SHELL_ASSETS", "MODULE_ASSETS", "ANATOMY_ASSETS"].flatMap(name => {
    const block = source.match(new RegExp(`const ${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`))?.[1];
    if (!block) throw new Error(`Missing literal precache list: ${name}`);
    // Do not evaluate the service worker, expressions or arbitrary JavaScript.
    const literals = [...block.matchAll(/"([^"\\]*)"|'([^'\\]*)'/gu)];
    if (!literals.length || block.replace(/"[^"\\]*"|'[^'\\]*'/gu, "").replace(/[\s,]/gu, "")) throw new Error(`Unsupported precache expression: ${name}`);
    return literals.map(match => localFile(match[1] ?? match[2]));
  });
}

function validateReferences(files, read) {
  const included = new Set(files);
  const requireIncluded = (reference, from, allowExternalNavigation = false) => {
    if (/^(?:#|data:)/u.test(reference)) return;
    if (allowExternalNavigation && /^(?:mailto:|https?:)/u.test(reference)) return;
    const file = localFile(reference, from);
    if (!included.has(file)) throw new Error(`Unpackaged reference in ${from}: ${reference}`);
  };
  for (const file of files) {
    if (!/\.(?:mjs|js|css|html|webmanifest)$/u.test(file)) continue;
    const source = read(file);
    if (/\.(?:mjs|js)$/u.test(file)) {
      if (/\bimport\s*\(/u.test(source)) throw new Error(`Dynamic imports require an explicit packaging review: ${file}`);
      for (const match of source.matchAll(/(?:import\s+(?:[^"'()]+?\s+from\s+)?|export\s+[^"'()]+?\s+from\s+)["']([^"']+)["']/gu)) {
        if (!match[1].startsWith(".")) throw new Error(`Nonlocal module import in ${file}`);
        requireIncluded(match[1], file);
      }
      // Concrete absolute runtime assets used by templates (brand/anatomy).
      for (const match of source.matchAll(/\/fitcoach-founder-test\/v040\/assets\/[a-zA-Z0-9_./-]+\.(?:png|webp|svg|mp4|ttf)/gu)) requireIncluded(match[0], file);
    }
    if (file.endsWith(".html")) {
      for (const tag of source.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*>/giu)) {
        for (const match of tag[0].matchAll(/\b(src|href)=["']([^"']+)["']/gu)) requireIncluded(match[2], file, tag[1].toLowerCase() === "a" && match[1] === "href");
      }
    }
    if (file.endsWith(".css")) {
      for (const match of source.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gu)) requireIncluded(match[1], file);
      for (const match of source.matchAll(/@import\s+["']([^"']+)["']/gu)) requireIncluded(match[1], file);
    }
  }
  const manifest = JSON.parse(read("manifest.webmanifest"));
  requireIncluded(manifest.start_url, "manifest.webmanifest");
  for (const icon of manifest.icons || []) requireIncluded(icon.src, "manifest.webmanifest");
}

export function collectWebBundle({ appRoot = DEFAULT_ROOT, media = EXERCISE_MEDIA_MANIFEST, maxBytes = 350 * 1024 * 1024 } = {}) {
  const root = fs.realpathSync(appRoot);
  const read = file => fs.readFileSync(regularFile(root, file), "utf8");
  const files = new Set(["index.html", "manifest.webmanifest", "sw.js", ...FONT_LICENSES, ...precacheFiles(read("sw.js"))]);
  const expected = new Map();
  for (const item of media) {
    if (item.type === "mp4" && item.motionReviewStatus !== "approved") throw new Error(`Unapproved motion in active inventory: ${item.id}`);
    for (const asset of [item, item.thumbnail].filter(Boolean)) {
      const file = localFile(asset.path);
      if (!file.startsWith("v040/assets/exercises/")) throw new Error(`Exercise media outside exercise directory: ${file}`);
      if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || !/^[a-f0-9]{64}$/u.test(asset.sha256)) throw new Error(`Missing media integrity metadata: ${file}`);
      if (expected.has(file) && JSON.stringify(expected.get(file)) !== JSON.stringify({ bytes: asset.bytes, sha256: asset.sha256 })) throw new Error(`Conflicting media metadata: ${file}`);
      files.add(file);
      expected.set(file, { bytes: asset.bytes, sha256: asset.sha256 });
    }
  }
  const ordered = sorted(files);
  for (const file of ordered) {
    if (file.startsWith("v040/assets/exercises/") && !expected.has(file)) throw new Error(`Exercise asset absent from integrity manifest: ${file}`);
  }
  validateReferences(ordered, read);
  const version = JSON.parse(read("manifest.webmanifest")).version;
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error("App version must be explicit");
  let totalBytes = Buffer.byteLength(FALLBACK_HTML);
  const entries = ordered.map(file => {
    const data = fs.readFileSync(regularFile(root, file));
    const hash = digest(data);
    const declared = expected.get(file);
    if (declared && (declared.bytes !== data.length || declared.sha256 !== hash)) throw new Error(`Media bytes/hash mismatch: ${file}`);
    totalBytes += data.length;
    return { path: `${APP_PREFIX.slice(1)}${file}`, bytes: data.length, sha256: hash };
  });
  entries.unshift({ path: "index.html", bytes: Buffer.byteLength(FALLBACK_HTML), sha256: digest(FALLBACK_HTML) });
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || totalBytes > maxBytes) throw new Error(`Bundle exceeds byte budget: ${totalBytes} / ${maxBytes}`);
  const inventory = { schema: 1, appVersion: version, appStartPath: START_PATH, totalBytes, files: entries };
  inventory.contentSha256 = digest(JSON.stringify(inventory));
  return { root, inventory };
}

function walkFiles(root, directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink in assembled bundle: ${entry.name}`);
    if (entry.isDirectory()) return walkFiles(root, absolute);
    if (!entry.isFile()) throw new Error(`Non-file in assembled bundle: ${entry.name}`);
    return path.relative(root, absolute).split(path.sep).join("/");
  });
}

export function verifyWebBundle({ appRoot = DEFAULT_ROOT, outDir = path.join(DEFAULT_ROOT, "native/dist"), ...options } = {}) {
  const { inventory } = collectWebBundle({ appRoot, ...options });
  return verifyInventory(outDir, inventory);
}

export function verifyInventory(outDir, inventory) {
  const output = fs.realpathSync(outDir);
  if (fs.lstatSync(outDir).isSymbolicLink()) throw new Error("Output cannot be a symlink");
  const actualFiles = sorted(walkFiles(output));
  const wantedFiles = sorted([...inventory.files.map(file => file.path), INVENTORY_NAME]);
  if (JSON.stringify(actualFiles) !== JSON.stringify(wantedFiles)) throw new Error("Assembled bundle contains missing or unexpected files");
  if (fs.readFileSync(path.join(output, INVENTORY_NAME), "utf8") !== `${JSON.stringify(inventory, null, 2)}\n`) throw new Error("Assembled inventory is stale or altered");
  for (const entry of inventory.files) {
    const data = fs.readFileSync(path.join(output, entry.path));
    if (data.length !== entry.bytes || digest(data) !== entry.sha256) throw new Error(`Assembled bytes/hash mismatch: ${entry.path}`);
  }
  return inventory;
}

export function prepareWebBundle({ appRoot = DEFAULT_ROOT, outDir = path.join(DEFAULT_ROOT, "native/dist"), ...options } = {}) {
  const { root, inventory } = collectWebBundle({ appRoot, ...options });
  const output = path.resolve(outDir);
  // Only the designated generated directory may be inside the source tree.
  if (output === root || inside(output, root) || (inside(root, output) && output !== path.join(root, "native/dist"))) throw new Error("Output overlaps the source tree");
  const parent = path.dirname(output);
  fs.mkdirSync(parent, { recursive: true });
  if (fs.realpathSync(parent) !== parent) throw new Error("Output parent cannot contain symlinks");
  // Atomic reservation: never erase, follow or overwrite an existing destination.
  fs.mkdirSync(output);
  for (const entry of inventory.files) {
    const sourceFile = entry.path.slice(APP_PREFIX.length - 1);
    const data = entry.path === "index.html" ? Buffer.from(FALLBACK_HTML) : fs.readFileSync(regularFile(root, sourceFile));
    if (data.length !== entry.bytes || digest(data) !== entry.sha256) throw new Error(`Source changed during assembly: ${entry.path}`);
    const destination = path.join(output, entry.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, data, { flag: "wx" });
  }
  // Only a fully copied bundle gets a completion inventory. Revalidation also
  // catches source changes during copying. A failure leaves evidence, not a deletion.
  fs.writeFileSync(path.join(output, INVENTORY_NAME), `${JSON.stringify(inventory, null, 2)}\n`, { flag: "wx" });
  return verifyWebBundle({ appRoot, outDir: output, ...options });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const check = args[0] === "--check";
    if (check) args.shift();
    if (args.length && (args.length !== 2 || args[0] !== "--out" || !args[1])) throw new Error("Usage: node scripts/prepare-web-bundle.mjs [--check] [--out NEW_DIRECTORY]");
    const options = args.length ? { outDir: path.resolve(args[1]) } : {};
    const result = check ? verifyWebBundle(options) : prepareWebBundle(options);
    console.log(JSON.stringify({ action: check ? "verified" : "assembled", appVersion: result.appVersion, files: result.files.length, bytes: result.totalBytes, contentSha256: result.contentSha256, appStartPath: result.appStartPath }, null, 2));
  } catch (error) {
    console.error(`Native web bundle failed: ${error.message}. Existing output is never replaced; preserve or move it aside before rebuilding.`);
    process.exitCode = 1;
  }
}
