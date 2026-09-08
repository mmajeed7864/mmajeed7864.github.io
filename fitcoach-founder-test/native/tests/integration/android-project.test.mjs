import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  GRADLE_SHA256,
  SOURCE_FILES,
} from "../../scripts/prepare-android-project.mjs";

if (!process.env.FITCOACH_TEST_ANDROID_PROJECT)
  throw new Error(
    "FITCOACH_TEST_ANDROID_PROJECT must identify an actually prepared project",
  );
const root = path.resolve(process.env.FITCOACH_TEST_ANDROID_PROJECT),
  android = path.join(root, "android");
const read = (file) => fs.readFileSync(path.join(android, file), "utf8");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const report = JSON.parse(
  fs.readFileSync(path.join(root, "fitcoach-android-inputs.json"), "utf8"),
);

test("actual generated Gradle project contains the local Kotlin bridge and correct launcher", () => {
  assert.equal(report.developmentOnly, true);
  assert.equal(report.applicationId, "com.symbio.fitcoach.dev");
  assert.equal(report.jdk, 21);
  assert.match(read("app/build.gradle"), /namespace = "com.symbio.fitcoach"/u);
  assert.match(
    read("app/build.gradle"),
    /applicationId "com.symbio.fitcoach.dev"/u,
  );
  assert.match(read("app/build.gradle"), /jvmTarget = '21'/u);
  assert.match(read("app/capacitor.build.gradle"), /JavaVersion.VERSION_21/u);
  assert.ok(
    read("gradle/wrapper/gradle-wrapper.properties").includes(GRADLE_SHA256),
  );
  assert.match(read("variables.gradle"), /minSdkVersion = 26/u);
  assert.match(read("capacitor.settings.gradle"), /capacitor-android/u);
  assert.equal(
    fs.existsSync(
      path.join(
        android,
        "app/src/main/java/com/symbio/fitcoach/dev/MainActivity.java",
      ),
    ),
    false,
  );
  const main = read("app/src/main/java/com/symbio/fitcoach/MainActivity.kt");
  assert.ok(
    main.indexOf("registerPlugin(FitCoachNativePlugin::class.java)") <
      main.indexOf("super.onCreate(savedInstanceState)"),
  );
  assert.deepEqual(
    report.sourceFiles.map((f) => f.file),
    SOURCE_FILES,
  );
  for (const item of report.sourceFiles) {
    let bytes = fs.readFileSync(path.join(android, "app/src/main", item.file));
    if (item.file === "res/values/strings.xml")
      bytes = Buffer.from(
        bytes
          .toString()
          .replace(
            '<string name="app_name">FitCoach Dev</string>',
            '<string name="app_name">FitCoach</string>',
          ),
      );
    assert.equal(
      hash(bytes),
      item.sha256,
      `source content survives preparation: ${item.file}`,
    );
  }
});

test("actual Android asset bundle retains local launch and all 100 full-resolution posters", async () => {
  const config = JSON.parse(read("app/src/main/assets/capacitor.config.json"));
  assert.equal(config.server.url, undefined);
  assert.equal(config.server.appStartPath, "/fitcoach-founder-test/index.html");
  assert.equal(config.server.cleartext, false);
  assert.equal(config.android.allowMixedContent, false);
  const publicDir = path.join(android, "app/src/main/assets/public");
  const { EXERCISE_MEDIA_MANIFEST: media } = await import(
    pathToFileURL(
      path.join(
        publicDir,
        "fitcoach-founder-test/v040/data/exercise-media-manifest.mjs",
      ),
    )
  );
  assert.equal(media.filter((m) => m.type === "poster").length, 100);
  assert.equal(media.filter((m) => m.type === "mp4").length, 59);
  const inventory = JSON.parse(
    fs.readFileSync(path.join(root, "dist/fitcoach-web-bundle.json"), "utf8"),
  );
  assert.equal(inventory.contentSha256, report.webContentSha256);
  for (const entry of inventory.files)
    assert.equal(
      hash(fs.readFileSync(path.join(publicDir, entry.path))),
      entry.sha256,
    );
  const manifest = read("app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:allowBackup="false"/u);
  assert.match(manifest, /android:usesCleartextTraffic="false"/u);
  assert.match(
    read("app/src/main/res/xml/file_paths.xml"),
    /path="Pictures\/"/u,
  );
});
