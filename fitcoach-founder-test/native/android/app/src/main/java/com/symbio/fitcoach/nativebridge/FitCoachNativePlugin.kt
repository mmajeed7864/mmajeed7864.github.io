package com.symbio.fitcoach.nativebridge

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Base64
import androidx.activity.result.ActivityResult
import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregationResult
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.security.MessageDigest
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@CapacitorPlugin(
    name = "FitCoachNative",
    permissions = [Permission(alias = "microphone", strings = [Manifest.permission.RECORD_AUDIO])],
)
class FitCoachNativePlugin : Plugin(), RecognitionListener, PurchasesUpdatedListener {
    private data class PendingBillingAction(val call: PluginCall, val run: () -> Unit)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val healthProviderPackage = "com.google.android.apps.healthdata"
    private val readHealthPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
    )
    private val healthPermissionContract: ActivityResultContract<Set<String>, Set<String>> =
        PermissionController.createRequestPermissionResultContract()

    private lateinit var audioManager: AudioManager
    private lateinit var billingClient: BillingClient
    // Stored as Any so the guarded API-26 branch remains explicit at runtime.
    private var audioFocusRequest: Any? = null
    private var speechRecognizer: SpeechRecognizer? = null
    private var pendingSpeechCall: PluginCall? = null
    private var pendingHealthPermissions: Set<String>? = null
    private var phase = "idle"
    private var outputInterrupted = false
    private var voiceInputSessionActive = false
    private var selectedCommunicationDeviceId: Int? = null
    private var billingConnectionInProgress = false
    private val pendingBillingActions = mutableListOf<PendingBillingAction>()
    private val cachedOffers = mutableMapOf<String, Pair<ProductDetails, ProductDetails.SubscriptionOfferDetails>>()
    private val securePreferences by lazy { context.getSharedPreferences("fitcoach_secure_session", Context.MODE_PRIVATE) }

    private val deviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
            if (!voiceInputSessionActive) return
            if (phase != "speaking") selectBluetoothCommunicationDevice()
            emitRoute()
        }
        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
            if (!voiceInputSessionActive) return
            val selectedRemoved = selectedCommunicationDeviceId?.let { selected -> removedDevices.any { it.id == selected } } == true
            if (!selectedRemoved) return
            outputInterrupted = false
            phase = "recovery_required"
            stopSpeechInternal()
            notifyListeners("voiceInterrupted", JSObject().put("shouldResumeOutput", false))
            emitRoute()
        }
    }

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_GAIN -> {
                val shouldResumeOutput = outputInterrupted
                outputInterrupted = false
                if (phase == "interrupted") phase = "recovery_required"
                if (voiceInputSessionActive && phase != "speaking") selectBluetoothCommunicationDevice()
                notifyListeners("voiceInterrupted", JSObject().put("shouldResumeOutput", shouldResumeOutput))
                emitRoute()
            }
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                outputInterrupted = phase == "speaking"
                stopSpeechInternal()
                phase = "interrupted"
                notifyListeners("voiceInterrupted", JSObject().put("shouldResumeOutput", false))
            }
        }
    }

    override fun load() {
        audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.registerAudioDeviceCallback(deviceCallback, null)
        billingClient = BillingClient.newBuilder(context)
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().enablePrepaidPlans().build(),
            )
            .enableAutoServiceReconnection()
            .build()
        bridge.executeOnMainThread { connectBillingOnMainThread() }
    }

    override fun handleOnDestroy() {
        stopSpeechInternal()
        releaseBluetoothCommunicationDevice()
        audioManager.mode = AudioManager.MODE_NORMAL
        abandonVoiceAudioFocus()
        audioManager.unregisterAudioDeviceCallback(deviceCallback)
        pendingBillingActions.forEach { it.call.reject("PLAY_BILLING_CLIENT_DESTROYED") }
        pendingBillingActions.clear()
        billingConnectionInProgress = false
        if (::billingClient.isInitialized) billingClient.endConnection()
        scope.cancel()
        super.handleOnDestroy()
    }

    override fun handleOnPause() {
        if (!voiceInputSessionActive) {
            super.handleOnPause()
            return
        }
        outputInterrupted = false
        stopSpeechInternal()
        releaseBluetoothCommunicationDevice()
        phase = "interrupted"
        notifyListeners("voiceInterrupted", JSObject().put("shouldResumeOutput", false))
        emitRoute()
        super.handleOnPause()
    }

    override fun handleOnResume() {
        bridge.executeOnMainThread {
            if (phase == "interrupted") phase = "recovery_required"
            if (voiceInputSessionActive) emitRoute()
            if (::billingClient.isInitialized) connectBillingOnMainThread()
        }
        super.handleOnResume()
    }

    @PluginMethod
    fun configureVoice(call: PluginCall) {
        bridge.executeOnMainThread {
            when (requestVoiceAudioFocus()) {
                AudioManager.AUDIOFOCUS_REQUEST_GRANTED -> {
                    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                    voiceInputSessionActive = true
                    selectBluetoothCommunicationDevice()
                    outputInterrupted = false
                    phase = "idle"
                    call.resolve(routePayload())
                }
                else -> {
                    voiceInputSessionActive = false
                    abandonVoiceAudioFocus()
                    phase = "unavailable"
                    call.reject("VOICE_AUDIO_FOCUS_UNAVAILABLE")
                }
            }
        }
    }

    @PluginMethod
    fun endVoiceSession(call: PluginCall) {
        bridge.executeOnMainThread {
            stopSpeechInternal()
            voiceInputSessionActive = false
            releaseBluetoothCommunicationDevice()
            audioManager.mode = AudioManager.MODE_NORMAL
            abandonVoiceAudioFocus()
            outputInterrupted = false
            phase = "idle"
            call.resolve()
        }
    }

    @PluginMethod
    fun prepareVoiceOutput(call: PluginCall) {
        bridge.executeOnMainThread {
            stopSpeechInternal()
            releaseBluetoothCommunicationDevice()
            audioManager.mode = AudioManager.MODE_NORMAL
            outputInterrupted = false
            phase = "speaking"
            emitRoute()
            call.resolve(routePayload())
        }
    }

    @PluginMethod
    fun completeVoiceOutput(call: PluginCall) {
        bridge.executeOnMainThread {
            outputInterrupted = false
            phase = "idle"
            emitRoute()
            call.resolve(routePayload())
        }
    }

    @PluginMethod
    fun startSpeechRecognition(call: PluginCall) {
        bridge.executeOnMainThread {
            if (getPermissionState("microphone") != PermissionState.GRANTED) {
                pendingSpeechCall = call
                requestPermissionForAlias("microphone", call, "microphonePermissionResult")
                return@executeOnMainThread
            }
            startSpeechInternal(call)
        }
    }

    @PermissionCallback
    private fun microphonePermissionResult(call: PluginCall) {
        pendingSpeechCall = null
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            phase = "unavailable"
            call.reject("MICROPHONE_PERMISSION_DENIED")
            return
        }
        bridge.executeOnMainThread { startSpeechInternal(call) }
    }

    @PluginMethod
    fun stopSpeechRecognition(call: PluginCall) {
        bridge.executeOnMainThread {
            stopSpeechInternal()
            phase = "idle"
            call.resolve()
        }
    }

    @PluginMethod
    fun healthAvailability(call: PluginCall) {
        val status = HealthConnectClient.getSdkStatus(context, healthProviderPackage)
        val payload = JSObject().put("available", status == HealthConnectClient.SDK_AVAILABLE).put("source", "health_connect")
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            payload.put("reason", if (status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) "provider_update_required" else "health_connect_unavailable")
        }
        call.resolve(payload)
    }

    @PluginMethod
    fun requestHealthAuthorization(call: PluginCall) {
        if (HealthConnectClient.getSdkStatus(context, healthProviderPackage) != HealthConnectClient.SDK_AVAILABLE) {
            call.reject("HEALTH_CONNECT_UNAVAILABLE")
            return
        }
        if (pendingHealthPermissions != null) {
            call.reject("HEALTH_PERMISSION_REQUEST_IN_PROGRESS")
            return
        }
        val requestedPermissions = readHealthPermissions
        pendingHealthPermissions = requestedPermissions
        scope.launch {
            try {
                val granted = healthClient().permissionController.getGrantedPermissions()
                if (granted.containsAll(requestedPermissions)) {
                    pendingHealthPermissions = null
                    call.resolve(
                        JSObject()
                            .put("requested", true)
                            .put("source", "health_connect")
                            .put("workoutWriteRequested", false),
                    )
                    return@launch
                }
                val intent = healthPermissionContract.createIntent(context, requestedPermissions)
                startActivityForResult(call, intent, "healthPermissionResult")
            } catch (error: Exception) {
                pendingHealthPermissions = null
                call.reject("HEALTH_CONNECT_AUTHORIZATION_FAILED", null, error)
            }
        }
    }

    @ActivityCallback
    private fun healthPermissionResult(call: PluginCall, result: ActivityResult) {
        val granted = healthPermissionContract.parseResult(result.resultCode, result.data)
        val requestedPermissions = pendingHealthPermissions ?: readHealthPermissions
        pendingHealthPermissions = null
        call.resolve(
            JSObject()
                .put("requested", granted.containsAll(requestedPermissions))
                .put("source", "health_connect")
                .put("workoutWriteRequested", false),
        )
    }

    @PluginMethod
    fun readDailyHealthSummary(call: PluginCall) {
        if (HealthConnectClient.getSdkStatus(context, healthProviderPackage) != HealthConnectClient.SDK_AVAILABLE) {
            call.reject("HEALTH_CONNECT_UNAVAILABLE")
            return
        }
        val day = try { call.getString("localDay")?.let(LocalDate::parse) ?: LocalDate.now() } catch (_: Exception) {
            call.reject("INVALID_LOCAL_DAY")
            return
        }
        val today = LocalDate.now()
        if (day.isAfter(today)) {
            call.reject("INVALID_LOCAL_DAY")
            return
        }
        // The initial release intentionally omits READ_HEALTH_DATA_HISTORY.
        // Bound optional backfill to the ordinary recent-history window.
        if (day.isBefore(today.minusDays(29))) {
            call.reject("HEALTH_CONNECT_HISTORY_PERMISSION_REQUIRED")
            return
        }
        scope.launch {
            try {
                val client = healthClient()
                val granted = client.permissionController.getGrantedPermissions()
                if (!granted.containsAll(readHealthPermissions)) {
                    call.reject("HEALTH_CONNECT_PERMISSION_REQUIRED")
                    return@launch
                }
                val zone = ZoneId.systemDefault()
                val start = day.atStartOfDay(zone).toInstant()
                val end = day.plusDays(1).atStartOfDay(zone).toInstant()
                val result: AggregationResult = client.aggregate(
                    AggregateRequest(
                        metrics = setOf(StepsRecord.COUNT_TOTAL, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL),
                        timeRangeFilter = TimeRangeFilter.between(start, end),
                    ),
                )
                call.resolve(
                    JSObject()
                        .put("bridgeVersion", 1)
                        .put("source", "health_connect")
                        .put("localDay", day.toString())
                        .put("steps", result[StepsRecord.COUNT_TOTAL] ?: 0L)
                        .put("activeEnergyKcal", result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0)
                        .put("aggregateOnly", true),
                )
            } catch (error: Exception) {
                call.reject("HEALTH_CONNECT_READ_FAILED", null, error)
            }
        }
    }

    @PluginMethod
    fun getSubscriptionOfferings(call: PluginCall) {
        withBillingReady(call) {
            loadOfferings(
                onSuccess = { offerings -> call.resolve(JSObject().put("available", offerings.length() > 0).put("offerings", offerings)) },
                onError = { code -> call.reject(code) },
            )
        }
    }

    @PluginMethod
    fun purchaseSubscription(call: PluginCall) {
        val logicalId = call.getString("logicalId")
        if (logicalId !in setOf("premium_monthly", "premium_yearly")) {
            call.reject("SUBSCRIPTION_LOGICAL_ID_INVALID")
            return
        }
        val accountBinding = call.getString("accountBinding")
        if (accountBinding == null || !ACCOUNT_BINDING_PATTERN.matches(accountBinding)) {
            call.reject("SUBSCRIPTION_ACCOUNT_BINDING_REQUIRED")
            return
        }
        withBillingReady(call) {
            loadOfferings(
                onSuccess = {
                    val selected = cachedOffers[logicalId]
                    if (selected == null) {
                        call.reject("PLAY_STORE_OFFER_NOT_CONFIGURED")
                        return@loadOfferings
                    }
                    val (product, offer) = selected
                    val params = BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(
                            listOf(
                                BillingFlowParams.ProductDetailsParams.newBuilder()
                                    .setProductDetails(product)
                                    .setOfferToken(offer.offerToken)
                                    .build(),
                            ),
                        )
                        .setObfuscatedAccountId(accountBindingHash(accountBinding))
                        .build()
                    bridge.executeOnMainThread {
                        val result = billingClient.launchBillingFlow(activity, params)
                        if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                            call.resolve(JSObject().put("launched", true))
                        } else {
                            call.reject("PLAY_BILLING_LAUNCH_${result.responseCode}")
                        }
                    }
                },
                onError = { code -> call.reject(code) },
            )
        }
    }

    @PluginMethod
    fun restorePurchases(call: PluginCall) {
        withBillingReady(call) {
            val params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .includeSuspendedSubscriptions(true)
                .build()
            billingClient.queryPurchasesAsync(params) { result, purchases ->
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    call.reject("PLAY_BILLING_RESTORE_${result.responseCode}")
                    return@queryPurchasesAsync
                }
                val transactions = JSArray()
                purchases.forEach { purchase ->
                    val payload = purchasePayload(purchase) ?: return@forEach
                    transactions.put(payload)
                    notifyStoreTransaction(payload)
                }
                call.resolve(JSObject().put("transactions", transactions))
            }
        }
    }

    @PluginMethod
    fun completeVerifiedPurchase(call: PluginCall) {
        val purchaseToken = call.getString("purchaseToken")
        val verificationId = call.getString("verificationId") ?: ""
        if (call.getBoolean("serverVerified") != true || purchaseToken.isNullOrBlank() || !verificationId.matches(Regex("^[A-Za-z0-9_-]{16,128}$"))) {
            call.reject("SERVER_VERIFICATION_REQUIRED")
            return
        }
        withBillingReady(call) {
            val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
            billingClient.queryPurchasesAsync(params) { result, purchases ->
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    call.reject("PLAY_BILLING_QUERY_${result.responseCode}")
                    return@queryPurchasesAsync
                }
                val purchase = purchases.firstOrNull { it.purchaseToken == purchaseToken && it.purchaseState == Purchase.PurchaseState.PURCHASED }
                if (purchase == null) {
                    call.reject("PLAY_PURCHASE_NOT_FOUND")
                    return@queryPurchasesAsync
                }
                fun resolveVerified() {
                    notifyListeners(
                        "subscriptionEntitlementChanged",
                        JSObject()
                            .put("active", true)
                            .put("serverVerified", true)
                            .put("authoritative", false)
                            .put("productId", purchase.products.firstOrNull()),
                    )
                    call.resolve(JSObject().put("completed", true))
                }
                if (purchase.isAcknowledged) {
                    resolveVerified()
                    return@queryPurchasesAsync
                }
                // Google acknowledgement belongs in the verified backend transaction.
                // The client waits for that authoritative state instead of trusting a local flag.
                call.reject("PLAY_PURCHASE_NOT_ACKNOWLEDGED_BY_BACKEND")
            }
        }
    }

    @PluginMethod
    fun openManageSubscriptions(call: PluginCall) {
        bridge.executeOnMainThread {
            val intent = Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://play.google.com/store/account/subscriptions?sku=fitcoach_premium&package=${context.packageName}"),
            )
            try {
                activity.startActivity(intent)
                call.resolve(JSObject().put("opened", true))
            } catch (error: Exception) {
                call.reject("PLAY_MANAGE_SUBSCRIPTIONS_UNAVAILABLE", null, error)
            }
        }
    }

    @PluginMethod
    fun readSecureSession(call: PluginCall) {
        try {
            val encodedIv = securePreferences.getString("iv", null)
            val encodedCiphertext = securePreferences.getString("ciphertext", null)
            if (encodedIv.isNullOrBlank() || encodedCiphertext.isNullOrBlank()) {
                call.resolve(JSObject().put("session", null))
                return
            }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                secureSessionKey(),
                GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP)),
            )
            val plaintext = cipher.doFinal(Base64.decode(encodedCiphertext, Base64.NO_WRAP))
            if (plaintext.isEmpty() || plaintext.size > 16_000) {
                call.reject("SECURE_SESSION_INVALID")
                return
            }
            call.resolve(JSObject().put("session", plaintext.toString(Charsets.UTF_8)))
        } catch (error: Exception) {
            securePreferences.edit().clear().apply()
            call.reject("SECURE_SESSION_READ_FAILED", null, error)
        }
    }

    @PluginMethod
    fun writeSecureSession(call: PluginCall) {
        val session = call.getString("session")
        val plaintext = session?.toByteArray(Charsets.UTF_8)
        if (plaintext == null || plaintext.isEmpty() || plaintext.size > 16_000) {
            call.reject("SECURE_SESSION_INVALID")
            return
        }
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secureSessionKey())
            val ciphertext = cipher.doFinal(plaintext)
            val saved = securePreferences.edit()
                .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                .putString("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .commit()
            if (!saved) {
                call.reject("SECURE_SESSION_WRITE_FAILED")
                return
            }
            call.resolve(JSObject().put("saved", true))
        } catch (error: Exception) {
            call.reject("SECURE_SESSION_WRITE_FAILED", null, error)
        }
    }

    @PluginMethod
    fun clearSecureSession(call: PluginCall) {
        if (!securePreferences.edit().clear().commit()) {
            call.reject("SECURE_SESSION_CLEAR_FAILED")
            return
        }
        call.resolve(JSObject().put("cleared", true))
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        if (result.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
            notifyListeners(
                "subscriptionTransactionAvailable",
                JSObject().put("store", "google_play").put("status", "cancelled").put("serverVerified", false).put("entitled", false),
                true,
            )
            return
        }
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            notifyListeners(
                "subscriptionTransactionAvailable",
                JSObject()
                    .put("store", "google_play")
                    .put("status", "failed")
                    .put("serverVerified", false)
                    .put("entitled", false)
                    .put("errorCode", "play_billing_${result.responseCode}"),
                true,
            )
            return
        }
        purchases.orEmpty().forEach { purchase -> purchasePayload(purchase)?.let(::notifyStoreTransaction) }
    }

    private fun healthClient(): HealthConnectClient = HealthConnectClient.getOrCreate(context, healthProviderPackage)

    private fun withBillingReady(call: PluginCall, action: () -> Unit) {
        bridge.executeOnMainThread {
            if (billingClient.isReady) {
                action()
                return@executeOnMainThread
            }
            pendingBillingActions.add(PendingBillingAction(call, action))
            connectBillingOnMainThread()
        }
    }

    private fun connectBillingOnMainThread() {
        if (billingClient.isReady) {
            reconcilePlayPurchases()
            val actions = pendingBillingActions.toList()
            pendingBillingActions.clear()
            actions.forEach { it.run() }
            return
        }
        if (billingConnectionInProgress) return
        billingConnectionInProgress = true
        try {
            billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                bridge.executeOnMainThread {
                    billingConnectionInProgress = false
                    val actions = pendingBillingActions.toList()
                    pendingBillingActions.clear()
                    if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                        reconcilePlayPurchases()
                        actions.forEach { it.run() }
                    } else {
                        actions.forEach { it.call.reject("PLAY_BILLING_UNAVAILABLE_${result.responseCode}") }
                    }
                }
            }

            override fun onBillingServiceDisconnected() {
                bridge.executeOnMainThread {
                    billingConnectionInProgress = false
                    val actions = pendingBillingActions.toList()
                    pendingBillingActions.clear()
                    actions.forEach { it.call.reject("PLAY_BILLING_DISCONNECTED") }
                }
            }
            })
        } catch (error: Exception) {
            billingConnectionInProgress = false
            val actions = pendingBillingActions.toList()
            pendingBillingActions.clear()
            actions.forEach { it.call.reject("PLAY_BILLING_CONNECTION_FAILED", null, error) }
        }
    }

    private fun loadOfferings(onSuccess: (JSArray) -> Unit, onError: (String) -> Unit) {
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                listOf(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId("fitcoach_premium")
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build(),
                ),
            )
            .build()
        billingClient.queryProductDetailsAsync(params) { result, queryResult ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                onError("PLAY_BILLING_PRODUCTS_${result.responseCode}")
                return@queryProductDetailsAsync
            }
            cachedOffers.clear()
            val offerings = JSArray()
            queryResult.productDetailsList.forEach { product ->
                // Purchase and render exactly the canonical base-plan offer.
                // Promotions/trials require a separate reviewed offer selector.
                product.subscriptionOfferDetails.orEmpty().filter { it.offerId == null }.forEach { offer ->
                    val logicalId = when (offer.basePlanId) {
                        "monthly" -> "premium_monthly"
                        "yearly" -> "premium_yearly"
                        else -> null
                    } ?: return@forEach
                    val price = offer.pricingPhases.pricingPhaseList.lastOrNull()?.formattedPrice ?: return@forEach
                    cachedOffers.putIfAbsent(logicalId, product to offer)
                    offerings.put(
                        JSObject()
                            .put("logicalId", logicalId)
                            .put("productId", product.productId)
                            .put("displayName", product.name)
                            .put("localizedPrice", price)
                            .put("offerToken", offer.offerToken),
                    )
                }
            }
            onSuccess(offerings)
        }
    }

    private fun reconcilePlayPurchases() {
        if (!billingClient.isReady) return
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        billingClient.queryPurchasesAsync(params) { result, purchases ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) return@queryPurchasesAsync
            purchases.forEach { purchase -> purchasePayload(purchase)?.let(::notifyStoreTransaction) }
        }
    }

    private fun purchasePayload(purchase: Purchase): JSObject? {
        val status = when (purchase.purchaseState) {
            Purchase.PurchaseState.PURCHASED -> "verification_required"
            Purchase.PurchaseState.PENDING -> "pending"
            else -> return null
        }
        return JSObject()
            .put("store", "google_play")
            .put("status", status)
            .put("serverVerified", false)
            .put("entitled", false)
            .put("productId", purchase.products.firstOrNull())
            .put("purchaseToken", purchase.purchaseToken)
    }

    private fun notifyStoreTransaction(payload: JSObject) {
        notifyListeners("subscriptionTransactionAvailable", payload, true)
    }

    private fun startSpeechInternal(call: PluginCall) {
        if (!voiceInputSessionActive) {
            call.reject("VOICE_SESSION_NOT_CONFIGURED")
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            phase = "unavailable"
            call.reject("SPEECH_RECOGNIZER_UNAVAILABLE")
            return
        }
        stopSpeechInternal()
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        selectBluetoothCommunicationDevice()
        speechRecognizer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
            SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        } else {
            SpeechRecognizer.createSpeechRecognizer(context)
        }.also { it.setRecognitionListener(this) }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("locale") ?: Locale.getDefault().toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, call.getBoolean("partialResults") ?: true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        phase = "listening"
        speechRecognizer?.startListening(intent)
        call.resolve(JSObject().put("started", true))
    }

    private fun stopSpeechInternal() {
        val recognizer = speechRecognizer
        speechRecognizer = null
        recognizer?.setRecognitionListener(null)
        recognizer?.stopListening()
        recognizer?.cancel()
        recognizer?.destroy()
    }

    private fun emitRoute() = notifyListeners("voiceRouteChanged", routePayload())

    private fun requestVoiceAudioFocus(): Int {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attributes)
                .setAcceptsDelayedFocusGain(false)
                .setWillPauseWhenDucked(true)
                .setOnAudioFocusChangeListener(focusListener)
                .build()
            audioFocusRequest = request
            return audioManager.requestAudioFocus(request)
        }
        audioFocusRequest = null
        @Suppress("DEPRECATION")
        return audioManager.requestAudioFocus(
            focusListener,
            AudioManager.STREAM_VOICE_CALL,
            AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
        )
    }

    private fun abandonVoiceAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            (audioFocusRequest as? AudioFocusRequest)?.let(audioManager::abandonAudioFocusRequest)
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(focusListener)
        }
        audioFocusRequest = null
    }

    private fun secureSessionKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey("fitcoach_session_v1", null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                "fitcoach_session_v1",
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private fun selectBluetoothCommunicationDevice() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val preferred = audioManager.availableCommunicationDevices.firstOrNull {
                    it.type == AudioDeviceInfo.TYPE_BLE_HEADSET || it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                } ?: return
                if (audioManager.communicationDevice?.id == preferred.id || audioManager.setCommunicationDevice(preferred)) {
                    selectedCommunicationDeviceId = preferred.id
                }
                return
            }
            @Suppress("DEPRECATION")
            val preferred = audioManager.getDevices(AudioManager.GET_DEVICES_ALL).firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
            if (preferred != null) {
                @Suppress("DEPRECATION")
                audioManager.startBluetoothSco()
                @Suppress("DEPRECATION")
                audioManager.isBluetoothScoOn = true
            }
        } catch (_: SecurityException) {
            // Keep the system-selected route and expose it through routePayload.
        } catch (_: IllegalArgumentException) {
            // A device may disappear between enumeration and selection.
        }
    }

    private fun releaseBluetoothCommunicationDevice() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice()
                return
            }
            @Suppress("DEPRECATION")
            audioManager.stopBluetoothSco()
            @Suppress("DEPRECATION")
            audioManager.isBluetoothScoOn = false
        } catch (_: SecurityException) {
            // The OS remains authoritative for routing when access is restricted.
        } finally {
            selectedCommunicationDeviceId = null
        }
    }

    private fun isBluetoothCommunicationDevice(device: AudioDeviceInfo): Boolean =
        device.type == AudioDeviceInfo.TYPE_BLE_HEADSET || device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO

    private fun routePayload(): JSObject {
        val activeDevice = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && voiceInputSessionActive) {
            audioManager.communicationDevice
        } else null
        return JSObject()
            .put("available", true)
            .put("input", activeDevice?.type?.toString())
            .put("outputs", JSArray(activeDevice?.let { listOf(it.type.toString()) } ?: emptyList<String>()))
            .put("bluetooth", activeDevice?.let(::isBluetoothCommunicationDevice) == true)
            .put("routeConfirmed", activeDevice != null)
            .put("phase", phase)
    }

    private fun transcript(results: Bundle?): String =
        results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()

    override fun onPartialResults(partialResults: Bundle?) {
        transcript(partialResults).takeIf(String::isNotEmpty)?.let { notifyListeners("speechPartial", JSObject().put("transcript", it)) }
    }

    override fun onResults(results: Bundle?) {
        transcript(results).takeIf(String::isNotEmpty)?.let { notifyListeners("speechFinal", JSObject().put("transcript", it)) }
        stopSpeechInternal()
        phase = "idle"
        emitRoute()
    }

    override fun onError(error: Int) {
        val recoverable = error in setOf(SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT, SpeechRecognizer.ERROR_NETWORK_TIMEOUT)
        notifyListeners("speechError", JSObject().put("code", "android_speech_$error").put("recoverable", recoverable))
        stopSpeechInternal()
        phase = if (recoverable) "recovery_required" else "unavailable"
        emitRoute()
    }

    override fun onReadyForSpeech(params: Bundle?) = Unit
    override fun onBeginningOfSpeech() = Unit
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() = Unit
    override fun onEvent(eventType: Int, params: Bundle?) = Unit

    private fun accountBindingHash(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.lowercase(Locale.ROOT).toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }

    private companion object {
        val ACCOUNT_BINDING_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    }
}
