# Reproducible native web bundle

The native kit previously required a manual copy into `dist/`. A flat copy loses
the `/fitcoach-founder-test/` URL prefix used by exercise images, anatomy and the
home cover. The new builder preserves source bytes and that directory structure.
Capacitor loads `/fitcoach-founder-test/index.html` through its local
[`server.appStartPath`](https://capacitorjs.com/docs/config) setting. `server.url`
remains unset. No HTML base rewrite, hosted redirect or network asset fallback is
introduced. A minimal root index exists for Capacitor's web-directory check and
provides a manual link if opened directly; it is not the normal launch screen.

## Build and check

From this native directory, with Node 22 or newer:

```sh
npm run web:build
npm run web:verify
```

These commands do not install packages, contact a provider, compile native code,
upload artifacts, sign a binary or enable any production capability. The script
also runs directly without `npm ci`:

```sh
node scripts/prepare-web-bundle.mjs --out /absolute/new/output-directory
node scripts/prepare-web-bundle.mjs --check --out /absolute/new/output-directory
```

The destination must not exist. Existing files, empty directories and symlinks
are not overwritten. Preserve or move the old output aside explicitly. A copy
failure may leave a partial directory; never pass it to Capacitor unless the
verification command succeeds. `native/dist/` is ignored by Git. No source files
are removed or changed by building.

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

The current 0.7.3 inventory is about 265 MiB uncompressed. The 350 MiB engineering
guardrail detects unexpected growth; it is **not** an App Store/Play size limit or
a download-size target. Media compression and qualified visual/movement review
remain release work. Existing active media is preserved, not newly approved.

## Remaining native proof

The web bundle is not an Xcode project, Gradle build, app archive or installable
package. Generate/integrate the reference native projects, verify bridge
registration, sign builds, and test actual supported iOS/Android devices. Exercise
playback/Range requests, native-origin API CORS, auth links, storage/recovery,
voice, health and store transactions still require native/device evidence.
