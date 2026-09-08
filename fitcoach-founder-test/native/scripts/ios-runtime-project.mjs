import { createHash } from "node:crypto";

export const IOS_RUNTIME_TESTS = Object.freeze([
  "testLaunchesPackagedOnboardingWithNativeBridge",
  "testDecodesPackagedExerciseArtwork",
  "testSecureSessionSurvivesReloadAndClears",
  "testMotionControlsPlayPauseResumeAndLoop",
]);
export const IOS_RUNTIME_FILES = Object.freeze([
  "FitCoachRuntimeTests.swift",
  "ios-probes.js",
]);
const id = (name) =>
  createHash("sha256")
    .update(`fitcoach-runtime:${name}`)
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();
export const IOS_RUNTIME_TARGET = id("target");
const APP_TARGET = "504EC3031FED79650016851F";
const PROJECT = "504EC2FC1FED79650016851F";

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2)
    throw new Error(`Unreviewed runtime target marker: ${before}`);
  return source.replace(before, after);
}

// Only the optional development test target changes. The application target,
// resources, launch code, permissions and native plugin remain untouched.
export function patchIOSRuntimeProject(source) {
  if (
    !source.includes("CODE_SIGNING_ALLOWED = NO;") ||
    !source.includes("SUPPORTED_PLATFORMS = iphonesimulator;") ||
    source.includes("FitCoachRuntimeTests") ||
    source.includes(IOS_RUNTIME_TARGET)
  )
    throw new Error(
      "Runtime tests require a fresh simulator-only development project",
    );
  const entries = {
    PBXBuildFile: `${id("swift-build")} = {isa = PBXBuildFile; fileRef = ${id("swift")}; };
      ${id("js-build")} = {isa = PBXBuildFile; fileRef = ${id("js")}; };`,
    PBXFileReference: `${id("swift")} = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = FitCoachRuntimeTests.swift; sourceTree = "<group>"; };
      ${id("js")} = {isa = PBXFileReference; lastKnownFileType = sourcecode.javascript; path = "ios-probes.js"; sourceTree = "<group>"; };
      ${id("product")} = {isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = FitCoachRuntimeTests.xctest; sourceTree = BUILT_PRODUCTS_DIR; };`,
    PBXGroup: `${id("group")} = {isa = PBXGroup; children = (${id("swift")}, ${id("js")},); path = FitCoachRuntimeTests; sourceTree = "<group>"; };`,
    PBXSourcesBuildPhase: `${id("sources")} = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (${id("swift-build")},); runOnlyForDeploymentPostprocessing = 0; };`,
    PBXResourcesBuildPhase: `${id("resources")} = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (${id("js-build")},); runOnlyForDeploymentPostprocessing = 0; };`,
    PBXFrameworksBuildPhase: `${id("frameworks")} = {isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };`,
    PBXNativeTarget: `${IOS_RUNTIME_TARGET} = {isa = PBXNativeTarget; buildConfigurationList = ${id("config-list")}; buildPhases = (${id("sources")}, ${id("frameworks")}, ${id("resources")},); buildRules = (); dependencies = (${id("dependency")},); name = FitCoachRuntimeTests; productName = FitCoachRuntimeTests; productReference = ${id("product")}; productType = "com.apple.product-type.bundle.unit-test"; };`,
    XCBuildConfiguration: ["Debug", "Release"]
      .map(
        (name) => `${id(name)} = {isa = XCBuildConfiguration; buildSettings = {
      BUNDLE_LOADER = "$(TEST_HOST)";
      CODE_SIGNING_ALLOWED = NO;
      CODE_SIGN_IDENTITY = "";
      CODE_SIGN_STYLE = Manual;
      GENERATE_INFOPLIST_FILE = YES;
      IPHONEOS_DEPLOYMENT_TARGET = 17.0;
      LD_RUNPATH_SEARCH_PATHS = ("$(inherited)", "@executable_path/Frameworks", "@loader_path/Frameworks",);
      PRODUCT_BUNDLE_IDENTIFIER = com.symbio.fitcoach.dev.runtime-tests;
      PRODUCT_NAME = "$(TARGET_NAME)";
      SDKROOT = iphonesimulator;
      SUPPORTED_PLATFORMS = iphonesimulator;
      SWIFT_VERSION = 5.0;
      SWIFT_OPTIMIZATION_LEVEL = "-Onone";
      TARGETED_DEVICE_FAMILY = "1,2";
      TEST_HOST = "$(BUILT_PRODUCTS_DIR)/App.app/App";
    }; name = ${name}; };`,
      )
      .join("\n"),
    XCConfigurationList: `${id("config-list")} = {isa = XCConfigurationList; buildConfigurations = (${id("Debug")}, ${id("Release")},); defaultConfigurationIsVisible = 0; defaultConfigurationName = Debug; };`,
  };
  for (const [section, content] of Object.entries(entries)) {
    const marker = `/* End ${section} section */`;
    source = replaceOnce(source, marker, `${content}\n${marker}`);
  }
  source = replaceOnce(
    source,
    "/* Begin PBXProject section */",
    `/* Begin PBXContainerItemProxy section */
    ${id("proxy")} = {isa = PBXContainerItemProxy; containerPortal = ${PROJECT}; proxyType = 1; remoteGlobalIDString = ${APP_TARGET}; remoteInfo = App; };
/* End PBXContainerItemProxy section */
/* Begin PBXTargetDependency section */
    ${id("dependency")} = {isa = PBXTargetDependency; target = ${APP_TARGET}; targetProxy = ${id("proxy")}; };
/* End PBXTargetDependency section */
/* Begin PBXProject section */`,
  );
  source = replaceOnce(
    source,
    "\t\t\t\t504EC3051FED79650016851F /* Products */,",
    `\t\t\t\t${id("group")} /* FitCoachRuntimeTests */,\n\t\t\t\t504EC3051FED79650016851F /* Products */,`,
  );
  source = replaceOnce(
    source,
    "\t\t\t\t504EC3041FED79650016851F /* App.app */,",
    `\t\t\t\t${id("product")} /* FitCoachRuntimeTests.xctest */,\n\t\t\t\t504EC3041FED79650016851F /* App.app */,`,
  );
  source = replaceOnce(
    source,
    "\t\t\ttargets = (\n",
    `\t\t\ttargets = (\n\t\t\t\t${IOS_RUNTIME_TARGET} /* FitCoachRuntimeTests */,\n`,
  );
  return source;
}

export function iosRuntimeScheme() {
  const reference = (target, name, product) =>
    `<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${target}" BuildableName="${product}" BlueprintName="${name}" ReferencedContainer="container:App.xcodeproj"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2630" version="1.3">
  <BuildAction parallelizeBuildables="NO" buildImplicitDependencies="YES"><BuildActionEntries>
    <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="NO">${reference(APP_TARGET, "App", "App.app")}</BuildActionEntry>
    <BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="NO">${reference(IOS_RUNTIME_TARGET, "FitCoachRuntimeTests", "FitCoachRuntimeTests.xctest")}</BuildActionEntry>
  </BuildActionEntries></BuildAction>
  <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="NO">
    <EnvironmentVariables><EnvironmentVariable key="FITCOACH_RUNTIME_TEST" value="isolated-simulator-v1" isEnabled="YES"/></EnvironmentVariables>
    <Testables><TestableReference skipped="NO" parallelizable="NO">${reference(IOS_RUNTIME_TARGET, "FitCoachRuntimeTests", "FitCoachRuntimeTests.xctest")}</TestableReference></Testables>
  </TestAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="NO"><BuildableProductRunnable runnableDebuggingMode="0">${reference(APP_TARGET, "App", "App.app")}</BuildableProductRunnable></LaunchAction>
</Scheme>\n`;
}
