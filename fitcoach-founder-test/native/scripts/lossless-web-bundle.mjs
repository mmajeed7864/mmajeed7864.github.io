import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import {
  collectWebBundle,
  verifyInventory,
  INVENTORY_NAME,
  FALLBACK_HTML,
} from "./prepare-web-bundle.mjs";
import {
  EXERCISE_MEDIA_MANIFEST,
  GENERATED_ILLUSTRATION_POLICY,
  GENERATED_MOTION_POLICY,
} from "../../v040/data/exercise-media-manifest.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PREFIX = "fitcoach-founder-test/";
const DEFINITIONS = `${PREFIX}v040/data/exercise-media-manifest.mjs`;
const SERVICE_WORKER = `${PREFIX}sw.js`;
const POSTERS = EXERCISE_MEDIA_MANIFEST.filter(
  (item) => item.type === "poster",
).map((item) => ({
  ...item,
  file: item.path.replace(`/${PREFIX}v040/assets/exercises/`, ""),
}));
export const REPORT = "fitcoach-lossless-media.json";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const within = (parent, child) =>
  child === parent || child.startsWith(`${parent}${path.sep}`);
const sourcePath = (file) => path.join(ROOT, file.slice(PREFIX.length));
const tools = () => ({
  cwebp: process.env.CWEBP_BIN || "cwebp",
  ffmpeg: process.env.FFMPEG_BIN || "ffmpeg",
  ffprobe: process.env.FFPROBE_BIN || "ffprobe",
});

function run(binary, args) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 512 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${path.basename(binary)} failed: ${result.error?.message || result.stderr?.slice(0, 500) || result.status}`,
    );
  return result.stdout.trim();
}

export function deliveryPath(file) {
  if (!/^generated\/[a-z0-9-]+-premium-v\d+\.png$/u.test(file))
    throw new Error("Invalid production poster path");
  return `generated/lossless/${path.basename(file, ".png")}.webp`;
}

function regular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file)
    throw new Error(`Not a regular unlinked file: ${file}`);
  return file;
}

export function reserveOutput(outDir, root = ROOT) {
  const output = path.resolve(outDir);
  const source = fs.realpathSync(root);
  if (
    within(output, source) ||
    (within(source, output) && output !== path.join(source, "native/dist"))
  )
    throw new Error("Output overlaps source");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  if (fs.realpathSync(path.dirname(output)) !== path.dirname(output))
    throw new Error("Output parent contains symlinks");
  fs.mkdirSync(output); // Never replace any existing directory, link or artifact.
  return output;
}

function frame(file, codec) {
  regular(file);
  const info = JSON.parse(
    run(codec.ffprobe, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      file,
    ]),
  ).streams;
  if (info?.length !== 1) throw new Error("Expected one still image stream");
  const digest = run(codec.ffmpeg, [
    "-v",
    "error",
    "-threads",
    "1",
    "-i",
    file,
    "-filter_threads",
    "1",
    "-pix_fmt",
    "rgba",
    "-f",
    "hash",
    "-hash",
    "sha256",
    "-",
  ]);
  if (!/^SHA256=[a-f0-9]{64}$/u.test(digest))
    throw new Error("Invalid decoded pixel digest");
  return {
    width: info[0].width,
    height: info[0].height,
    rgbaSha256: digest.slice(7),
  };
}

export function colorProfile(bytes, format) {
  let offset = format === "png" ? 8 : 12;
  let profile = null;
  let explicitColor = false;
  let srgb = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error("Truncated image chunk");
    const length =
      format === "png"
        ? bytes.readUInt32BE(offset)
        : bytes.readUInt32LE(offset + 4);
    const type = bytes.toString(
      "ascii",
      offset + (format === "png" ? 4 : 0),
      offset + (format === "png" ? 8 : 4),
    );
    const start = offset + 8;
    if (start + length > bytes.length)
      throw new Error("Invalid image chunk length");
    const data = bytes.subarray(start, start + length);
    if (type === "ICCP") profile = data;
    if (type === "iCCP") {
      const zero = data.indexOf(0);
      if (zero < 1 || data[zero + 1] !== 0)
        throw new Error("Invalid PNG color profile");
      profile = inflateSync(data.subarray(zero + 2), {
        maxOutputLength: 4 * 1024 * 1024,
      });
    }
    if (type === "gAMA" || type === "cHRM") explicitColor = true;
    if (type === "sRGB") srgb = true;
    offset = start + length + (format === "png" ? 4 : length % 2);
  }
  if (explicitColor && !profile && !srgb)
    throw new Error("Explicit PNG color space requires a reviewed ICC profile");
  return profile ? hash(profile) : null;
}

// Preserve embedded ICC and decoded sample values. Non-sRGB PNG color metadata
// without a portable ICC profile fails closed instead of silently changing color.
export function verifyPixels(source, delivered, definition, codec = tools()) {
  const original = frame(source, codec);
  const encoded = frame(delivered, codec);
  if (
    original.width !== (definition.width || 1254) ||
    original.height !== (definition.height || 1254)
  )
    throw new Error("Source dimensions disagree with poster definition");
  if (JSON.stringify(original) !== JSON.stringify(encoded))
    throw new Error(`Lossless pixel verification failed: ${definition.id}`);
  const iccSha256 = colorProfile(fs.readFileSync(source), "png");
  if (iccSha256 !== colorProfile(fs.readFileSync(delivered), "webp"))
    throw new Error("Color profile changed");
  return { ...original, iccSha256 };
}

function sourceInventory() {
  const { inventory } = collectWebBundle();
  if (
    POSTERS.length !== 100 ||
    new Set(POSTERS.map((item) => item.file)).size !== 100
  )
    throw new Error("Expected 100 unique production posters");
  return inventory;
}

function recordFor(definition, output, codec) {
  const inputFile = `${PREFIX}v040/assets/exercises/${definition.file}`;
  const file = `${PREFIX}v040/assets/exercises/${deliveryPath(definition.file)}`;
  const source = sourcePath(inputFile);
  const delivered = regular(path.join(output, file));
  const sourceBytes = fs.readFileSync(regular(source));
  if (
    sourceBytes.length !== definition.bytes ||
    hash(sourceBytes) !== definition.sha256
  )
    throw new Error("Source poster hash changed");
  const bytes = fs.readFileSync(delivered);
  if (
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  )
    throw new Error("Delivery file is not WebP");
  if (bytes.length >= sourceBytes.length)
    throw new Error("Lossless delivery is not smaller");
  return {
    id: definition.id,
    sourcePath: inputFile,
    sourceBytes: sourceBytes.length,
    sourceSha256: definition.sha256,
    path: file,
    bytes: bytes.length,
    sha256: hash(bytes),
    ...verifyPixels(source, delivered, definition, codec),
  };
}

export function transformedDefinitions(definitions, records) {
  if (
    definitions.length !== records.length ||
    new Set(records.map((item) => item.id)).size !== records.length
  )
    throw new Error("Incomplete or duplicate delivery records");
  const byId = new Map(records.map((item) => [item.id, item]));
  return definitions.map((definition) => {
    const item = byId.get(definition.id);
    if (
      !item ||
      item.sourceSha256 !== definition.sha256 ||
      item.sourceBytes !== definition.bytes
    )
      throw new Error("Delivery provenance mismatch");
    const { file, ...original } = definition;
    return {
      ...original,
      path: `/${PREFIX}v040/assets/exercises/${deliveryPath(file)}`,
      bytes: item.bytes,
      sha256: item.sha256,
      licenseSource: `Original PNG artwork in source repository: ${file}. Lossless WebP delivery preserves full-resolution pixels and embedded ICC.`,
    };
  });
}

// The PNG and native WebP builds must never share offline manifests or media
// caches. Change only the reviewed literal names; retain all worker safeguards.
export function deliveryServiceWorker(source, manifestHash) {
  if (!/^[a-f0-9]{64}$/u.test(manifestHash))
    throw new Error("Invalid delivery manifest hash");
  const suffix = `-lossless-${manifestHash.slice(0, 20)}`;
  let worker = source;
  for (const [name, prefix] of [
    ["CACHE", "fitcoach-symbio-v"],
    ["MEDIA_CACHE", "fitcoach-exercise-images-v"],
  ]) {
    const declaration = new RegExp(`^const ${name}\\b`, "gmu");
    const literal = new RegExp(`^const ${name} = "(${prefix}[0-9]+)";$`, "gmu");
    if (
      [...source.matchAll(declaration)].length !== 1 ||
      [...source.matchAll(literal)].length !== 1
    )
      throw new Error(`Unreviewed service-worker cache declaration: ${name}`);
    worker = worker.replace(literal, `const ${name} = "$1${suffix}";`);
  }
  return Buffer.from(worker);
}

function derived(base, records) {
  const posters = new Map(
    transformedDefinitions(POSTERS, records).map((item) => [item.id, item]),
  );
  const definitions = EXERCISE_MEDIA_MANIFEST.map(
    (item) => posters.get(item.id) || item,
  );
  const module = Buffer.from(
    `/** Build-derived lossless delivery. Original artwork remains in the source repository. */\nexport const GENERATED_ILLUSTRATION_POLICY = Object.freeze(${JSON.stringify(GENERATED_ILLUSTRATION_POLICY)});\nexport const GENERATED_MOTION_POLICY = Object.freeze(${JSON.stringify(GENERATED_MOTION_POLICY)});\nexport const EXERCISE_MEDIA_MANIFEST = Object.freeze(${JSON.stringify(definitions, null, 2)}.map(item => Object.freeze({...item, ...(item.thumbnail ? {thumbnail: Object.freeze(item.thumbnail)} : {})})));\nconst grouped = new Map();\nfor (const item of EXERCISE_MEDIA_MANIFEST) { const entries = grouped.get(item.exerciseId) || []; entries.push(item); grouped.set(item.exerciseId, entries); }\nfor (const [id, entries] of grouped) grouped.set(id, Object.freeze(entries));\nconst EMPTY = Object.freeze([]);\nexport function getExerciseMedia(id) { return grouped.get(id) || EMPTY; }\n`,
  );
  const worker = deliveryServiceWorker(
    fs.readFileSync(regular(sourcePath(SERVICE_WORKER)), "utf8"),
    hash(module),
  );
  const report = {
    schema: 1,
    sourceContentSha256: base.contentSha256,
    encoding: "webp-lossless-exact-icc",
    records,
  };
  const reportBytes = json(report);
  const replacements = new Map(
    records.map((record) => [
      record.sourcePath,
      { path: record.path, bytes: record.bytes, sha256: record.sha256 },
    ]),
  );
  const files = base.files.map(
    (entry) =>
      replacements.get(entry.path) ||
      (entry.path === DEFINITIONS
        ? { path: DEFINITIONS, bytes: module.length, sha256: hash(module) }
        : entry.path === SERVICE_WORKER
          ? { path: SERVICE_WORKER, bytes: worker.length, sha256: hash(worker) }
          : entry),
  );
  files.push({
    path: REPORT,
    bytes: reportBytes.length,
    sha256: hash(reportBytes),
  });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const inventory = {
    schema: 1,
    appVersion: base.appVersion,
    appStartPath: base.appStartPath,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
    sourceContentSha256: base.contentSha256,
  };
  inventory.contentSha256 = hash(JSON.stringify(inventory));
  return { inventory, module, worker, reportBytes };
}

export function verifyLosslessBundle(outDir, codec = tools()) {
  const output = path.resolve(outDir);
  if (
    fs.lstatSync(output).isSymbolicLink() ||
    fs.realpathSync(output) !== output
  )
    throw new Error("Output contains symlinks");
  const base = sourceInventory();
  // Re-derive every record from original source bytes and delivered decoded
  // pixels. A self-consistent edited report or inventory cannot bless altered art.
  const records = POSTERS.map((definition) =>
    recordFor(definition, output, codec),
  );
  const { inventory, module, worker, reportBytes } = derived(base, records);
  if (!fs.readFileSync(regular(path.join(output, DEFINITIONS))).equals(module))
    throw new Error("Delivered poster definitions changed");
  if (!fs.readFileSync(regular(path.join(output, REPORT))).equals(reportBytes))
    throw new Error("Delivery report is stale or altered");
  if (
    !fs.readFileSync(regular(path.join(output, SERVICE_WORKER))).equals(worker)
  )
    throw new Error("Delivered service-worker cache identity changed");
  verifyInventory(output, inventory);
  return inventory;
}

export function buildLosslessBundle(
  outDir,
  codec = tools(),
  onProgress = () => {},
) {
  const base = sourceInventory();
  for (const [binary, arg] of [
    [codec.cwebp, "-version"],
    [codec.ffmpeg, "-version"],
    [codec.ffprobe, "-version"],
  ])
    run(binary, [arg]);
  const output = reserveOutput(outDir);
  const records = [];
  for (const definition of POSTERS) {
    const destination = path.join(
      output,
      PREFIX,
      "v040/assets/exercises",
      deliveryPath(definition.file),
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    run(codec.cwebp, [
      "-quiet",
      "-lossless",
      "-exact",
      "-m",
      "4",
      "-metadata",
      "icc",
      sourcePath(`${PREFIX}v040/assets/exercises/${definition.file}`),
      "-o",
      destination,
    ]);
    records.push(recordFor(definition, output, codec));
    onProgress(records.length);
  }
  const { inventory, module, worker, reportBytes } = derived(base, records);
  const encoded = new Set(records.map((record) => record.path));
  for (const entry of inventory.files) {
    if (encoded.has(entry.path)) continue;
    const destination = path.join(output, entry.path);
    const contents =
      entry.path === DEFINITIONS
        ? module
        : entry.path === SERVICE_WORKER
          ? worker
          : entry.path === REPORT
            ? reportBytes
            : entry.path === "index.html"
              ? Buffer.from(FALLBACK_HTML)
              : fs.readFileSync(regular(sourcePath(entry.path)));
    // The source assembler owns the root launcher. Derive it from its public
    // implementation instead of duplicating launch/CSP markup here.
    const data = contents;
    if (data.length !== entry.bytes || hash(data) !== entry.sha256)
      throw new Error(`Source changed during packaging: ${entry.path}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, data, { flag: "wx" });
  }
  fs.writeFileSync(path.join(output, INVENTORY_NAME), json(inventory), {
    flag: "wx",
  });
  return verifyLosslessBundle(output, codec);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    const check = args[0] === "--check";
    if (check) args.shift();
    if (args.length && (args.length !== 2 || args[0] !== "--out"))
      throw new Error(
        "Usage: lossless-web-bundle.mjs [--check] [--out NEW_DIRECTORY]",
      );
    const output = args[1]
      ? path.resolve(args[1])
      : path.join(ROOT, "native/dist");
    const result = check
      ? verifyLosslessBundle(output)
      : buildLosslessBundle(output, tools(), (count) => {
          if (count % 10 === 0)
            console.log(`Pixel-verified ${count}/100 lossless posters`);
        });
    console.log(
      JSON.stringify(
        {
          action: check ? "verified" : "assembled",
          appVersion: result.appVersion,
          files: result.files.length,
          bytes: result.totalBytes,
          contentSha256: result.contentSha256,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      `Lossless bundle failed: ${error.message}. Existing artifacts are never overwritten or removed.`,
    );
    process.exitCode = 1;
  }
}
