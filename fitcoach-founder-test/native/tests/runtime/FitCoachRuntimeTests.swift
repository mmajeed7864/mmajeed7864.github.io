import XCTest
import UIKit
import WebKit
import AVFAudio
import Security

// Hosted in the actual development app. No replacement bridge or WebView.
final class FitCoachRuntimeTests: XCTestCase {
    private let synthetic = "fitcoach-simulator-only-session-not-a-real-token"

    @MainActor private func findWebView(_ view: UIView) -> WKWebView? {
        if let web = view as? WKWebView { return web }
        for child in view.subviews {
            if let web = findWebView(child) { return web }
        }
        return nil
    }

    @MainActor private func prepare() async throws -> WKWebView {
        #if !targetEnvironment(simulator)
        throw NSError(domain: "FitCoachTests", code: 1, userInfo: [NSLocalizedDescriptionKey: "Simulator-only tests must not run on a phone"])
        #else
        guard Bundle.main.bundleIdentifier == "com.symbio.fitcoach.dev",
              ProcessInfo.processInfo.environment["FITCOACH_RUNTIME_TEST"] == "isolated-simulator-v1" else {
            throw NSError(domain: "FitCoachTests", code: 2, userInfo: [NSLocalizedDescriptionKey: "Not the isolated development test host"])
        }
        let deadline = Date().addingTimeInterval(45)
        var found: WKWebView?
        while found == nil && Date() < deadline {
            for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
                for window in scene.windows {
                    if let web = findWebView(window) { found = web; break }
                }
            }
            if found == nil { try await Task.sleep(nanoseconds: 200_000_000) }
        }
        let web = try XCTUnwrap(found, "The actual app never created its WebView")
        try await ready(web, ageGate: false)
        _ = try await web.evaluateJavaScript("localStorage.clear(); sessionStorage.clear(); window.__fitcoachReloadPending = true;")
        web.load(URLRequest(url: URL(string: "capacitor://localhost/fitcoach-founder-test/index.html")!))
        try await ready(web)
        XCTAssertNotEqual(AVAudioApplication.shared.recordPermission, .granted)
        return web
        #endif
    }

    @MainActor private func ready(_ web: WKWebView, ageGate: Bool = true) async throws {
        let selector = ageGate ? "[data-field=ageBand]" : "[data-action]"
        let deadline = Date().addingTimeInterval(45)
        while Date() < deadline {
            let result = try? await web.evaluateJavaScript("!window.__fitcoachReloadPending && !!document.querySelector('\(selector)') && !!window.Capacitor?.Plugins?.FitCoachNative")
            if result as? Bool == true { return }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        throw NSError(domain: "FitCoachTests", code: 3, userInfo: [NSLocalizedDescriptionKey: "Packaged UI/native bridge did not become ready"])
    }

    @MainActor private func probe(_ web: WKWebView, _ kind: String) async throws -> [String: Any] {
        let resource = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "ios-probes", withExtension: "js"))
        let script = try String(contentsOf: resource, encoding: .utf8)
        let result = try await web.callAsyncJavaScript(
            script + "\nreturn await fitcoachRuntimeProbe(kind, value);",
            arguments: ["kind": kind, "value": synthetic], in: nil, contentWorld: .page
        )
        let object = try XCTUnwrap(result as? [String: Any], "Real WebView probe must return an object")
        let bytes = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        print("FITCOACH_RUNTIME_PROBE \(kind) \(String(decoding: bytes, as: UTF8.self))")
        return object
    }

    @MainActor func testLaunchesPackagedOnboardingWithNativeBridge() async throws {
        let web = try await prepare()
        let result = try await probe(web, "launch")
        XCTAssertEqual(result["url"] as? String, "capacitor://localhost/fitcoach-founder-test/index.html")
        XCTAssertEqual(result["platform"] as? String, "ios")
        XCTAssertEqual(result["heading"] as? String, "Start with the right safety mode.")
        XCTAssertEqual(result["healthSource"] as? String, "apple_health")
        XCTAssertEqual(result["healthAvailableBoolean"] as? Bool, true)
        XCTAssertGreaterThanOrEqual(result["width"] as? Int ?? 0, 300)
        XCTAssertEqual(result["overflow"] as? Bool, false)
        XCTAssertNotEqual(AVAudioApplication.shared.recordPermission, .granted)
    }

    @MainActor func testDecodesPackagedExerciseArtwork() async throws {
        let result = try await probe(prepare(), "artwork")
        XCTAssertEqual(result["posters"] as? Int, 100)
        XCTAssertEqual(result["videos"] as? Int, 59)
        let widths = try XCTUnwrap(result["widths"] as? [Int])
        XCTAssertEqual(widths.count, 3)
        for width in widths { XCTAssertGreaterThanOrEqual(width, 1000) }
    }

    private func keychainQuery() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.symbio.fitcoach.auth",
         kSecAttrAccount as String: "session-v1",
         kSecAttrSynchronizable as String: false]
    }

    @MainActor func testSecureSessionSurvivesReloadAndClears() async throws {
        let web = try await prepare()
        // Cleanup is limited to this exact synthetic key in the new simulator.
        defer { SecItemDelete(keychainQuery() as CFDictionary) }
        var initialQuery = keychainQuery()
        initialQuery[kSecReturnAttributes as String] = true
        let initialStatus = SecItemCopyMatching(initialQuery as CFDictionary, nil)
        // No session value or other Keychain data is printed. A clean isolated
        // simulator must distinguish an absent item from denied Keychain access.
        print("FITCOACH_KEYCHAIN_INITIAL_STATUS \(initialStatus)")
        guard initialStatus == errSecItemNotFound else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(initialStatus), userInfo: [NSLocalizedDescriptionKey: "Fresh simulator Keychain access did not report an absent session"])
        }
        let stored = try await probe(web, "session-write")
        for field in ["available", "saved", "matches", "webStorageClean"] { XCTAssertEqual(stored[field] as? Bool, true, field) }
        var query = keychainQuery()
        query[kSecReturnAttributes as String] = true
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        XCTAssertEqual(SecItemCopyMatching(query as CFDictionary, &item), errSecSuccess)
        let attributes = try XCTUnwrap(item as? [String: Any])
        XCTAssertEqual(attributes[kSecAttrAccessible as String] as? String, kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String)
        XCTAssertEqual(attributes[kSecAttrSynchronizable as String] as? Bool, false)
        XCTAssertEqual(attributes[kSecValueData as String] as? Data, synthetic.data(using: .utf8))
        _ = try await web.evaluateJavaScript("window.__fitcoachReloadPending = true;")
        web.reload()
        try await ready(web)
        let recovered = try await probe(web, "session-recover-clear")
        for field in ["matches", "cleared", "absent", "webStorageClean"] { XCTAssertEqual(recovered[field] as? Bool, true, field) }
        XCTAssertEqual(SecItemCopyMatching(query as CFDictionary, &item), errSecItemNotFound)
    }

    @MainActor func testMotionControlsPlayPauseResumeAndLoop() async throws {
        let result = try await probe(prepare(), "motion")
        XCTAssertEqual(result["id"] as? String, "barbell-back-squat-motion")
        for field in ["firstFrames", "resumeFrames", "loopFrames"] { XCTAssertEqual(result[field] as? Int, 3, field) }
        for field in ["paused", "localSource", "muted", "inline"] { XCTAssertEqual(result[field] as? Bool, true, field) }
        XCTAssertGreaterThanOrEqual(result["width"] as? Int ?? 0, 720)
        XCTAssertEqual(result["overflow"] as? Bool, false)
        XCTAssertNotEqual(AVAudioApplication.shared.recordPermission, .granted)
    }
}
