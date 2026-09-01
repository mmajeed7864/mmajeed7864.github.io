import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const sharpModule = process.env.FITCOACH_SHARP_MODULE
  ? await import(pathToFileURL(process.env.FITCOACH_SHARP_MODULE).href)
  : await import("sharp");
const sharp = sharpModule.default || sharpModule;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "brand/app-icon.svg");
const foreground = path.join(root, "brand/app-icon-foreground.svg");

async function png(input, output, size, options = {}) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  let pipeline = sharp(input, { density: 384 }).resize(size, size, { fit: "contain" });
  if (options.flatten) pipeline = pipeline.flatten({ background: options.flatten });
  await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(output);
}

const iosDir = path.join(root, "assets/ios/AppIcon.appiconset");
const iosSlots = [
  ["iphone", "20x20", "2x", 40], ["iphone", "20x20", "3x", 60],
  ["iphone", "29x29", "2x", 58], ["iphone", "29x29", "3x", 87],
  ["iphone", "40x40", "2x", 80], ["iphone", "40x40", "3x", 120],
  ["iphone", "60x60", "2x", 120], ["iphone", "60x60", "3x", 180],
  ["ipad", "20x20", "1x", 20], ["ipad", "20x20", "2x", 40],
  ["ipad", "29x29", "1x", 29], ["ipad", "29x29", "2x", 58],
  ["ipad", "40x40", "1x", 40], ["ipad", "40x40", "2x", 80],
  ["ipad", "76x76", "1x", 76], ["ipad", "76x76", "2x", 152],
  ["ipad", "83.5x83.5", "2x", 167], ["ios-marketing", "1024x1024", "1x", 1024],
];
const images = [];
for (const [idiom, size, scale, pixels] of iosSlots) {
  const filename = `fitcoach-${idiom}-${size.replaceAll(".", "_")}-${scale}.png`;
  await png(source, path.join(iosDir, filename), pixels, { flatten: "#07152f" });
  images.push({ idiom, size, scale, filename });
}
await fs.writeFile(path.join(iosDir, "Contents.json"), `${JSON.stringify({ images, info: { author: "fitcoach", version: 1 } }, null, 2)}\n`);

const androidSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [density, pixels] of Object.entries(androidSizes)) {
  const dir = path.join(root, `assets/android/res/mipmap-${density}`);
  await png(source, path.join(dir, "ic_launcher.png"), Math.round(pixels * 4 / 9), { flatten: "#07152f" });
  await png(source, path.join(dir, "ic_launcher_round.png"), Math.round(pixels * 4 / 9), { flatten: "#07152f" });
  await png(foreground, path.join(dir, "ic_launcher_foreground.png"), pixels);
}

const anyDpi = path.join(root, "assets/android/res/mipmap-anydpi-v26");
await fs.mkdir(anyDpi, { recursive: true });
const adaptive = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background" />\n  <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n`;
await fs.writeFile(path.join(anyDpi, "ic_launcher.xml"), adaptive);
await fs.writeFile(path.join(anyDpi, "ic_launcher_round.xml"), adaptive);
const values = path.join(root, "assets/android/res/values");
await fs.mkdir(values, { recursive: true });
await fs.writeFile(path.join(values, "ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">#07152F</color></resources>\n`);

await png(source, path.join(root, "assets/store/app-store-1024.png"), 1024, { flatten: "#07152f" });
await png(source, path.join(root, "assets/store/google-play-512.png"), 512, { flatten: "#07152f" });
console.log("Generated FitCoach native and store icons.");
