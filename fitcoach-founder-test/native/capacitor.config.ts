import type { CapacitorConfig } from "@capacitor/cli";

const release = process.env.FITCOACH_NATIVE_RELEASE === "1";
const appId = process.env.FITCOACH_NATIVE_APP_ID || "com.symbio.fitcoach.dev";

if (release && appId.endsWith(".dev")) {
  throw new Error("FITCOACH_NATIVE_APP_ID must be the registered production bundle/package ID.");
}

const config: CapacitorConfig = {
  appId,
  appName: release ? "FitCoach" : "FitCoach Dev",
  webDir: "dist",
  bundledWebRuntime: false,
  backgroundColor: "#07152f",
  ios: {
    contentInset: "always",
    scheme: release ? "FitCoach" : "FitCoachDev",
    preferredContentMode: "mobile",
  },
  android: {
    backgroundColor: "#07152f",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: !release,
  },
  server: {
    androidScheme: "https",
    cleartext: false,
  },
};

export default config;
