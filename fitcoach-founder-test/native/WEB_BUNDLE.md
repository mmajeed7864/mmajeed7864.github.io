# Reproducible native web bundle

The native kit previously required a manual copy into `dist/`. A flat copy loses
the `/fitcoach-founder-test/` URL prefix used by exercise images, anatomy and the
home cover. Both builders preserve that directory structure. The default release
builder now packages full-resolution lossless WebP copies of all 100 production
posters; the original PNG artwork stays unchanged in the source repository.
Capacitor loads `/fitcoach-founder-test/index.html` through its local
[`server.appStartPath`](https://capacitorjs.com/docs/config) setting. `server.url`
remains unset. No HTML base rewrite, hosted redirect or network asset fallback is
introduced. A minimal root index exists for Capacitor's web-directory check and
provides a manual link if opened directly; it is not the normal launch screen.

## Build and check

From this native directory, with Node 22 or newer and build-only `cwebp`, `ffmpeg`
and `ffprobe` available (or `CWEBP_BIN`, `FFMPEG_BIN`, `FFPROBE_BIN` explicitly set):

```sh
npm run web:build
npm run web:verify
node --test tests/integration/lossless-codec.test.mjs
```

These commands do not install packages, contact a provider, compile native code,
upload artifacts, sign a binary or enable any production capability. The script
also runs directly without `npm ci`:

```sh
node scripts/lossless-web-bundle.mjs --out /absolute/new/output-directory
node scripts/lossless-web-bundle.mjs --check --out /absolute/new/output-directory
```

The destination must not exist. Existing files, empty directories and symlinks
are not overwritten. Preserve or move the old output aside explicitly. A copy
failure may leave a partial directory; never pass it to Capacitor unless the
verification command succeeds. `native/dist/` is ignored by Git. No source files
are removed or changed by building.

For diagnostics, `web:build:source` / `web:verify:source` retain the byte-for-byte
PNG assembler. They use the same default destination, so do not mix builders in
one directory. Existing source-format output does not become optimized merely
because the scripts changed; rebuild into a new, explicit directory.

## Lossless artwork delivery

- All 100 current full-resolution posters are encoded sequentially, not in a
  worker pool. No resize, crop, lossy quantization, replacement art or video
  re-encoding occurs. Existing thumbnails, anatomy, fonts and 59 active video
  files are copied unchanged. The rejected motion clip stays excluded.
- The [official lossless encoder](https://developers.google.com/speed/webp/docs/cwebp)
  uses `-lossless -exact -m 4 -metadata icc`. Invisible RGB samples in transparent
  areas and embedded ICC profiles are preserved. Unsupported explicit PNG color
  spaces without portable ICC fail for review.
- Every source/delivery pair is independently decoded by FFmpeg to RGBA; width,
  height, full pixel-buffer SHA-256 and ICC hash must match. Each output must also
  be smaller than its original. Verification re-derives these facts from real
  source/output bytes, not assertions in the generated report.
- Only the packaged media manifest is derived: poster URLs and integrity fields
  refer to the delivered WebP, while exercise IDs, alt text, thumbnails, motion
  metadata and grouping stay intact. PNG provenance remains explicit. The source
  web application and its public PNG URLs are unchanged by this native build.
- `fitcoach-lossless-media.json` records source and delivery byte/pixel hashes;
  the normal bundle inventory covers it and every shipped file. No timestamp,
  machine path or account data is stored. Encoder versions can change compressed
  bytes; verification is source-bound and pixel-exact across those versions.
- Never edit generated output to repair a failed gate. Preserve failed output
  as evidence, fix the source/toolchain and build a new directory. The build does
  not regenerate faulty movement demonstrations or confer movement/rights approval.

The integration test uses `native/dist/` by default; set
`FITCOACH_TEST_BUNDLE_DIR` to test an explicit alternative output. It exercises
real codecs, rejects a different but valid image, and imports the packaged
library to verify 100 posters/thumbnails, all 59 motion records and unchanged
exercise metadata. Missing tools/artifacts fail, not skip. Current Mac evidence
with cwebp 1.6.0 / FFmpeg 8.0.1: 194,272,443 poster bytes became 143,322,124;
total bundle 277,402,934 became 226,727,133 bytes (48.3 MiB / 18.3% smaller).
These are unpacked web-asset sizes, not signed-store download measurements.

## Inputs and evidence

- Literal shell, module and anatomy lists from the current service worker.
- Current exercise-media manifest, including thumbnails and active motion only.
  Every media file must match its recorded bytes and SHA-256. A rejected motion
  clip cannot enter the active inventory.
- The app manifest, service worker, legal pages and both bundled font licenses.
- A restricted runtime-path allowlist; not recursive repository copying.

Static module imports, concrete template asset paths, HTML references, CSS URLs
and manifest icons are checked against the inventory. Unsupported dynamic imports
or nonliteral precache lists fail for review rather than being evaluated. This is
a check for this application's current source conventions, not a general-purpose
JavaScript/CSS/HTML bundler or proof that every future computed URL is covered.

`fitcoach-web-bundle.json` records the app version, launch path, file sizes and
SHA-256 values with a deterministic content digest. It contains no timestamp,
machine path, account identifiers or credentials. Its digest is a reproducible
input snapshot, not a signature, store approval or evidence that a reviewer
approved movement technique. Verify compares the assembled bytes and exact file
set with the current source; stale source, extra files and symlinks fail.

The original 0.7.3 source inventory is about 265 MiB uncompressed. The 350 MiB engineering
guardrail detects unexpected growth; it is **not** an App Store/Play size limit or
a download-size target. The lossless delivery report measures the actual reduction;
further performance work and qualified visual/movement review remain release work.
Existing active media is preserved, not newly approved.

## Remaining native proof

The web bundle is not an Xcode project, Gradle build, app archive or installable
package. Generate/integrate the reference native projects, verify bridge
registration, sign builds, and test actual supported iOS/Android devices. Exercise
playback/Range requests, native-origin API CORS, auth links, storage/recovery,
voice, health and store transactions still require native/device evidence.
