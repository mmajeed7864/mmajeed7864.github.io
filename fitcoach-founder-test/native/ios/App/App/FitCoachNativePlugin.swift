import AVFoundation
import Capacitor
import Foundation
import HealthKit
import Security
import Speech
import StoreKit
import UIKit

@objc(FitCoachNativePlugin)
public final class FitCoachNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FitCoachNativePlugin"
    public let jsName = "FitCoachNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configureVoice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endVoiceSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareVoiceOutput", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "completeVoiceOutput", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startSpeechRecognition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSpeechRecognition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "healthAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestHealthAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readDailyHealthSummary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSubscriptionOfferings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchaseSubscription", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "completeVerifiedPurchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openManageSubscriptions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSecureSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeSecureSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSecureSession", returnType: CAPPluginReturnPromise),
    ]

    private let audioSession = AVAudioSession.sharedInstance()
    private let audioEngine = AVAudioEngine()
    private let healthStore = HKHealthStore()
    private var recognitionTask: SFSpeechRecognitionTask?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTapInstalled = false
    private var phase = "idle"
    private var outputInterrupted = false
    // Voice Room ownership and ordinary read-aloud output are deliberately
    // separate. Output outside the room must not keep AVAudioSession active.
    private var voiceSessionActive = false
    private var outputSessionActive = false
    private var transactionUpdates: Task<Void, Never>?

    private static let storeProducts = [
        "premium_monthly": "fitcoach_premium_monthly",
        "premium_yearly": "fitcoach_premium_yearly",
    ]
    private static let secureSessionService = "com.symbio.fitcoach.auth"
    private static let secureSessionAccount = "session-v1"

    public override func load() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(audioInterrupted(_:)), name: AVAudioSession.interruptionNotification, object: audioSession)
        center.addObserver(self, selector: #selector(audioRouteChanged(_:)), name: AVAudioSession.routeChangeNotification, object: audioSession)
        center.addObserver(self, selector: #selector(appBackgrounded), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(appBecameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        transactionUpdates = observeStoreTransactions()
    }

    deinit {
        transactionUpdates?.cancel()
        NotificationCenter.default.removeObserver(self)
    }

    @objc public func configureVoice(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                try self.configureVoiceRoomAudioSession()
                self.voiceSessionActive = true
                self.outputSessionActive = false
                self.outputInterrupted = false
                self.phase = "idle"
                call.resolve(self.voiceRoute())
            } catch {
                self.voiceSessionActive = false
                self.phase = "unavailable"
                call.reject("VOICE_AUDIO_SESSION_UNAVAILABLE", nil, error)
            }
        }
    }

    @objc public func endVoiceSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopRecognition()
            self.voiceSessionActive = false
            self.outputSessionActive = false
            self.outputInterrupted = false
            self.phase = "idle"
            do {
                try self.audioSession.setActive(false, options: [.notifyOthersOnDeactivation])
                call.resolve()
            } catch {
                call.reject("VOICE_AUDIO_SESSION_END_FAILED", nil, error)
            }
        }
    }

    @objc public func prepareVoiceOutput(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopRecognition()
            do {
                // The playback category routes to A2DP by default when available.
                try self.audioSession.setCategory(.playback, mode: .spokenAudio)
                try self.audioSession.setActive(true)
                self.outputSessionActive = true
                self.outputInterrupted = false
                self.phase = "speaking"
                let route = self.voiceRoute()
                self.notifyListeners("voiceRouteChanged", data: route)
                call.resolve(route)
            } catch {
                self.outputSessionActive = false
                if self.voiceSessionActive { try? self.configureVoiceRoomAudioSession() }
                self.phase = self.voiceSessionActive ? "recovery_required" : "unavailable"
                call.reject("VOICE_OUTPUT_ROUTE_UNAVAILABLE", nil, error)
            }
        }
    }

    @objc public func completeVoiceOutput(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.outputSessionActive = false
            self.outputInterrupted = false
            do {
                if self.voiceSessionActive {
                    // Restore the Voice Room route but never silently restart
                    // microphone capture; the controller explicitly starts it.
                    try self.configureVoiceRoomAudioSession()
                    self.phase = "idle"
                } else {
                    try self.audioSession.setActive(false, options: [.notifyOthersOnDeactivation])
                    self.phase = "idle"
                }
                let route = self.voiceRoute()
                self.notifyListeners("voiceRouteChanged", data: route)
                call.resolve(route)
            } catch {
                self.phase = self.voiceSessionActive ? "recovery_required" : "unavailable"
                call.reject("VOICE_OUTPUT_SESSION_CLEANUP_FAILED", nil, error)
            }
        }
    }

    @objc public func startSpeechRecognition(_ call: CAPPluginCall) {
        let locale = Locale(identifier: call.getString("locale") ?? Locale.current.identifier)
        let partialResults = call.getBool("partialResults") ?? true
        SFSpeechRecognizer.requestAuthorization { speechStatus in
            DispatchQueue.main.async {
                guard speechStatus == .authorized else {
                    self.phase = "unavailable"
                    call.reject("SPEECH_PERMISSION_DENIED")
                    return
                }
                self.audioSession.requestRecordPermission { microphoneGranted in
                    DispatchQueue.main.async {
                        guard microphoneGranted else {
                            self.phase = "unavailable"
                            call.reject("MICROPHONE_PERMISSION_DENIED")
                            return
                        }
                        self.beginRecognition(locale: locale, partialResults: partialResults, call: call)
                    }
                }
            }
        }
    }

    @objc public func stopSpeechRecognition(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopRecognition()
            self.phase = "idle"
            call.resolve()
        }
    }

    @objc public func healthAvailability(_ call: CAPPluginCall) {
        call.resolve([
            "available": HKHealthStore.isHealthDataAvailable(),
            "source": "apple_health",
            "reason": HKHealthStore.isHealthDataAvailable() ? "" : "health_data_unavailable",
        ])
    }

    @objc public func requestHealthAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let steps = HKObjectType.quantityType(forIdentifier: .stepCount),
              let activeEnergy = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) else {
            call.reject("APPLE_HEALTH_UNAVAILABLE")
            return
        }
        let read: Set<HKObjectType> = [steps, activeEnergy]
        healthStore.requestAuthorization(toShare: [], read: read) { success, error in
            guard error == nil else {
                call.reject("APPLE_HEALTH_AUTHORIZATION_FAILED", nil, error)
                return
            }
            // HealthKit intentionally does not reveal whether read access was denied.
            call.resolve([
                "requested": success,
                "source": "apple_health",
                "workoutWriteRequested": false,
            ])
        }
    }

    @objc public func readDailyHealthSummary(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let steps = HKObjectType.quantityType(forIdentifier: .stepCount),
              let activeEnergy = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) else {
            call.reject("APPLE_HEALTH_UNAVAILABLE")
            return
        }
        let calendar = Calendar.current
        let requestedDate: Date
        if let requestedDay = call.getString("localDay") {
            guard requestedDay.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil,
                  let parsed = Self.dayFormatter.date(from: requestedDay),
                  Self.dayFormatter.string(from: parsed) == requestedDay else {
                call.reject("INVALID_LOCAL_DAY")
                return
            }
            requestedDate = parsed
        } else {
            requestedDate = Date()
        }
        let start = calendar.startOfDay(for: requestedDate)
        guard let end = calendar.date(byAdding: .day, value: 1, to: start) else {
            call.reject("INVALID_LOCAL_DAY")
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let group = DispatchGroup()
        let lock = NSLock()
        var stepCount = 0.0
        var calories = 0.0
        var firstError: Error?

        func run(_ type: HKQuantityType, unit: HKUnit, assign: @escaping (Double) -> Void) {
            group.enter()
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
                lock.lock()
                if firstError == nil { firstError = error }
                if let value = result?.sumQuantity()?.doubleValue(for: unit) { assign(value) }
                lock.unlock()
                group.leave()
            }
            self.healthStore.execute(query)
        }

        run(steps, unit: .count()) { stepCount = $0 }
        run(activeEnergy, unit: .kilocalorie()) { calories = $0 }
        group.notify(queue: .main) {
            if let error = firstError {
                call.reject("APPLE_HEALTH_READ_FAILED", nil, error)
            } else {
                call.resolve([
                    "bridgeVersion": 1,
                    "source": "apple_health",
                    "localDay": Self.dayFormatter.string(from: start),
                    "steps": Int(stepCount.rounded()),
                    "activeEnergyKcal": (calories * 10).rounded() / 10,
                    "aggregateOnly": true,
                ])
            }
        }
    }

    @objc public func getSubscriptionOfferings(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: Array(Self.storeProducts.values))
                let logicalByProduct = Dictionary(uniqueKeysWithValues: Self.storeProducts.map { ($0.value, $0.key) })
                let offerings: [[String: Any]] = products.compactMap { product in
                    guard let logicalId = logicalByProduct[product.id] else { return nil }
                    return [
                        "logicalId": logicalId,
                        "productId": product.id,
                        "displayName": product.displayName,
                        "localizedPrice": product.displayPrice,
                    ]
                }.sorted { String(describing: $0["logicalId"]) < String(describing: $1["logicalId"]) }
                call.resolve(["available": !offerings.isEmpty, "offerings": offerings])
            } catch {
                call.reject("APP_STORE_PRODUCTS_UNAVAILABLE", nil, error)
            }
        }
    }

    @objc public func purchaseSubscription(_ call: CAPPluginCall) {
        guard let logicalId = call.getString("logicalId"), let productId = Self.storeProducts[logicalId] else {
            call.reject("SUBSCRIPTION_LOGICAL_ID_INVALID")
            return
        }
        guard let rawAccountBinding = call.getString("accountBinding"),
              let accountToken = UUID(uuidString: rawAccountBinding) else {
            call.reject("SUBSCRIPTION_ACCOUNT_BINDING_REQUIRED")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("APP_STORE_PRODUCT_NOT_CONFIGURED")
                    return
                }
                switch try await product.purchase(options: [.appAccountToken(accountToken)]) {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        // Do not finish or unlock here. The backend must verify the signed transaction first.
                        let payload = storeTransactionPayload(transaction: transaction, signedTransaction: verification.jwsRepresentation)
                        notifyStoreTransaction(payload)
                        call.resolve(payload)
                    case .unverified(_, let error):
                        call.reject("APP_STORE_TRANSACTION_UNVERIFIED", nil, error)
                    }
                case .pending:
                    call.resolve(failClosedStoreStatus("pending"))
                case .userCancelled:
                    call.resolve(failClosedStoreStatus("cancelled"))
                @unknown default:
                    call.reject("APP_STORE_PURCHASE_UNKNOWN_RESULT")
                }
            } catch {
                call.reject("APP_STORE_PURCHASE_FAILED", nil, error)
            }
        }
    }

    @objc public func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                var transactions: [[String: Any]] = []
                for await verification in Transaction.currentEntitlements {
                    guard case .verified(let transaction) = verification else { continue }
                    let payload = storeTransactionPayload(transaction: transaction, signedTransaction: verification.jwsRepresentation)
                    transactions.append(payload)
                    notifyStoreTransaction(payload)
                }
                call.resolve(["transactions": transactions])
            } catch {
                call.reject("APP_STORE_RESTORE_FAILED", nil, error)
            }
        }
    }

    @objc public func completeVerifiedPurchase(_ call: CAPPluginCall) {
        guard let verificationId = call.getString("verificationId"),
              verificationId.range(of: "^[A-Za-z0-9_-]{16,128}$", options: .regularExpression) != nil,
              let rawTransactionId = call.getString("transactionId"),
              let transactionId = UInt64(rawTransactionId) else {
            call.reject("SERVER_VERIFICATION_REQUIRED")
            return
        }
        Task {
            // JavaScript and an opaque correlation ID are not trusted proof.
            // The verified backend finishes Apple transactions with App Store
            // Server API; native only reconciles the resulting store state.
            for await verification in Transaction.unfinished {
                guard case .verified(let transaction) = verification, transaction.id == transactionId else { continue }
                call.reject("APP_STORE_SERVER_FINISH_PENDING")
                return
            }
            for await verification in Transaction.currentEntitlements {
                guard case .verified(let transaction) = verification, transaction.id == transactionId else { continue }
                notifyListeners("subscriptionEntitlementChanged", data: [
                    "active": true,
                    "serverVerified": true,
                    "authoritative": false,
                    "productId": transaction.productID,
                ])
                call.resolve(["completed": true])
                return
            }
            call.reject("APP_STORE_TRANSACTION_NOT_FOUND")
        }
    }

    @objc public func openManageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else {
                call.reject("WINDOW_SCENE_UNAVAILABLE")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve(["opened": true])
            } catch {
                call.reject("APP_STORE_MANAGE_SUBSCRIPTIONS_FAILED", nil, error)
            }
        }
    }

    @objc public func readSecureSession(_ call: CAPPluginCall) {
        var result: CFTypeRef?
        let status = SecItemCopyMatching(Self.secureSessionQuery(returnData: true) as CFDictionary, &result)
        if status == errSecItemNotFound {
            call.resolve(["session": NSNull()])
            return
        }
        guard status == errSecSuccess,
              let data = result as? Data,
              let session = String(data: data, encoding: .utf8),
              !session.isEmpty,
              data.count <= 16_000 else {
            call.reject("SECURE_SESSION_READ_FAILED")
            return
        }
        call.resolve(["session": session])
    }

    @objc public func writeSecureSession(_ call: CAPPluginCall) {
        guard let session = call.getString("session"),
              let data = session.data(using: .utf8),
              !data.isEmpty,
              data.count <= 16_000 else {
            call.reject("SECURE_SESSION_INVALID")
            return
        }
        let query = Self.secureSessionQuery(returnData: false)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess {
            call.resolve(["saved": true])
            return
        }
        guard updateStatus == errSecItemNotFound else {
            call.reject("SECURE_SESSION_WRITE_FAILED")
            return
        }
        var item = query
        attributes.forEach { item[$0.key] = $0.value }
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        if addStatus == errSecDuplicateItem,
           SecItemUpdate(query as CFDictionary, attributes as CFDictionary) == errSecSuccess {
            call.resolve(["saved": true])
            return
        }
        guard addStatus == errSecSuccess else {
            call.reject("SECURE_SESSION_WRITE_FAILED")
            return
        }
        call.resolve(["saved": true])
    }

    @objc public func clearSecureSession(_ call: CAPPluginCall) {
        let status = SecItemDelete(Self.secureSessionQuery(returnData: false) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("SECURE_SESSION_CLEAR_FAILED")
            return
        }
        call.resolve(["cleared": true])
    }

    private static func secureSessionQuery(returnData: Bool) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: secureSessionService,
            kSecAttrAccount as String: secureSessionAccount,
            kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
        ]
        if returnData {
            query[kSecReturnData as String] = kCFBooleanTrue
            query[kSecMatchLimit as String] = kSecMatchLimitOne
        }
        return query
    }

    private func beginRecognition(locale: Locale, partialResults: Bool, call: CAPPluginCall) {
        stopRecognition()
        guard voiceSessionActive else {
            call.reject("VOICE_SESSION_NOT_CONFIGURED")
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            phase = "unavailable"
            call.reject("SPEECH_RECOGNIZER_UNAVAILABLE")
            return
        }
        do {
            var options: AVAudioSession.CategoryOptions = [.defaultToSpeaker]
            if #available(iOS 26.0, *) { options.insert(.allowBluetoothHFP) }
            else { options.insert(.allowBluetooth) }
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: options)
            try audioSession.setActive(true)
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = partialResults
            if #available(iOS 13, *) { request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition }
            recognitionRequest = request
            let input = audioEngine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                recognitionRequest = nil
                phase = "unavailable"
                call.reject("MICROPHONE_INPUT_FORMAT_UNAVAILABLE")
                return
            }
            input.installTap(onBus: 0, bufferSize: 1_024, format: format) { buffer, _ in request.append(buffer) }
            recognitionTapInstalled = true
            audioEngine.prepare()
            try audioEngine.start()
            phase = "listening"
            recognitionTask = recognizer.recognitionTask(with: request) { result, error in
                DispatchQueue.main.async {
                    guard self.voiceSessionActive else { return }
                    if let result {
                        let transcript = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !transcript.isEmpty {
                            self.notifyListeners(result.isFinal ? "speechFinal" : "speechPartial", data: ["transcript": transcript])
                        }
                        if result.isFinal {
                            self.stopRecognition()
                            self.phase = "idle"
                            self.notifyListeners("voiceRouteChanged", data: self.voiceRoute())
                        }
                    }
                    if let error, self.recognitionTask != nil {
                        self.notifyListeners("speechError", data: ["code": "recognition_failed", "recoverable": true])
                        self.stopRecognition()
                        self.phase = "recovery_required"
                        self.notifyListeners("voiceRouteChanged", data: self.voiceRoute())
                        NSLog("FitCoach speech recognition ended: %@", error.localizedDescription)
                    }
                }
            }
            call.resolve(["started": true])
        } catch {
            stopRecognition()
            phase = "unavailable"
            call.reject("SPEECH_RECOGNITION_START_FAILED", nil, error)
        }
    }

    private func stopRecognition() {
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        if audioEngine.isRunning { audioEngine.stop() }
        if recognitionTapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            recognitionTapInstalled = false
        }
    }

    private func configureVoiceRoomAudioSession() throws {
        var options: AVAudioSession.CategoryOptions = [.allowBluetoothA2DP, .defaultToSpeaker]
        if #available(iOS 26.0, *) { options.insert(.allowBluetoothHFP) }
        else { options.insert(.allowBluetooth) }
        try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: options)
        try audioSession.setActive(true)
    }

    private func observeStoreTransactions() -> Task<Void, Never> {
        Task { [weak self] in
            // Replay verified unfinished purchases before listening for new
            // updates so a crash or web reload cannot strand verification.
            for await verification in Transaction.unfinished {
                guard let self, case .verified(let transaction) = verification else { continue }
                let payload = self.storeTransactionPayload(transaction: transaction, signedTransaction: verification.jwsRepresentation)
                self.notifyStoreTransaction(payload)
            }
            for await verification in Transaction.updates {
                guard let self, case .verified(let transaction) = verification else { continue }
                let payload = self.storeTransactionPayload(transaction: transaction, signedTransaction: verification.jwsRepresentation)
                self.notifyStoreTransaction(payload)
                // The backend consumes this payload and only then calls completeVerifiedPurchase.
            }
        }
    }

    private func notifyStoreTransaction(_ payload: [String: Any]) {
        DispatchQueue.main.async {
            self.notifyListeners("subscriptionTransactionAvailable", data: payload, retainUntilConsumed: true)
        }
    }

    private func storeTransactionPayload(transaction: Transaction, signedTransaction: String) -> [String: Any] {
        var payload: [String: Any] = [
            "store": "app_store",
            "status": "verification_required",
            "serverVerified": false,
            "entitled": false,
            "productId": transaction.productID,
            "transactionId": String(transaction.id),
            "signedTransaction": signedTransaction,
        ]
        if let expiration = transaction.expirationDate { payload["expirationDate"] = Self.isoFormatter.string(from: expiration) }
        return payload
    }

    private func failClosedStoreStatus(_ status: String) -> [String: Any] {
        [
            "store": "app_store",
            "status": status,
            "serverVerified": false,
            "entitled": false,
        ]
    }

    private func voiceRoute() -> [String: Any] {
        let inputs = audioSession.currentRoute.inputs
        let outputs = audioSession.currentRoute.outputs
        let bluetoothPorts: Set<AVAudioSession.Port> = [.bluetoothHFP, .bluetoothA2DP, .bluetoothLE]
        return [
            "available": true,
            "input": inputs.first?.portType.rawValue as Any,
            "outputs": outputs.map(\.portType.rawValue),
            "bluetooth": (inputs + outputs).contains { bluetoothPorts.contains($0.portType) },
            "phase": phase,
        ]
    }

    @objc private func audioInterrupted(_ notification: Notification) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { self.audioInterrupted(notification) }
            return
        }
        guard voiceSessionActive || outputSessionActive else { return }
        guard let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType) else { return }
        if type == .began {
            outputInterrupted = phase == "speaking"
            stopRecognition()
            phase = "interrupted"
            notifyListeners("voiceInterrupted", data: ["shouldResumeOutput": false])
            return
        }
        let rawOptions = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
        let shouldResume = outputInterrupted && AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume)
        outputInterrupted = false
        phase = "recovery_required"
        notifyListeners("voiceInterrupted", data: ["shouldResumeOutput": shouldResume])
    }

    @objc private func audioRouteChanged(_ notification: Notification) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { self.audioRouteChanged(notification) }
            return
        }
        guard voiceSessionActive || outputSessionActive else { return }
        let rawReason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
        let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason)
        if reason == .oldDeviceUnavailable {
            outputInterrupted = false
            stopRecognition()
            phase = "recovery_required"
        }
        notifyListeners("voiceRouteChanged", data: voiceRoute())
    }

    @objc private func appBackgrounded() {
        guard voiceSessionActive || outputSessionActive else { return }
        outputInterrupted = false
        stopRecognition()
        phase = "interrupted"
        notifyListeners("voiceInterrupted", data: ["shouldResumeOutput": false])
    }

    @objc private func appBecameActive() {
        guard voiceSessionActive || outputSessionActive else { return }
        if phase == "interrupted" { phase = "recovery_required" }
        notifyListeners("voiceRouteChanged", data: voiceRoute())
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = .current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter
    }()

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
