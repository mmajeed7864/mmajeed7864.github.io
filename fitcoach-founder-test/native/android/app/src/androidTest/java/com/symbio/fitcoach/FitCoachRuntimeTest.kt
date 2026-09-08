package com.symbio.fitcoach

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Real WebView/native bridge calls. No mocks, account login, purchases or permission grants. */
@RunWith(AndroidJUnit4::class)
class FitCoachRuntimeTest {
    private lateinit var scenario: ActivityScenario<MainActivity>
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Before fun launchDevelopmentApp() {
        assertEquals("com.symbio.fitcoach.dev", context.packageName)
        assertTrue("Synthetic tests are emulator-only", Build.HARDWARE in setOf("ranchu", "goldfish"))
        scenario = ActivityScenario.launch(MainActivity::class.java)
        awaitReady()
    }

    @After fun closeTestActivity() {
        if (::scenario.isInitialized) scenario.close()
    }

    private fun evaluate(expression: String): JSONObject {
        val latch = CountDownLatch(1)
        val result = AtomicReference<String>()
        scenario.onActivity { activity ->
            activity.bridge.webView.evaluateJavascript("JSON.stringify($expression)") {
                result.set(it)
                latch.countDown()
            }
        }
        assertTrue("WebView evaluation timed out", latch.await(10, TimeUnit.SECONDS))
        val json = JSONTokener(result.get() ?: "null").nextValue()
        assertTrue("WebView did not return JSON", json is String)
        return JSONObject(json as String)
    }

    private fun awaitReady() {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(45)
        while (System.nanoTime() < deadline) {
            val state = evaluate("({ready: !!document.querySelector('[data-field=ageBand]'), native: !!window.Capacitor?.Plugins?.FitCoachNative})")
            if (state.optBoolean("ready") && state.optBoolean("native")) return
            Thread.sleep(200)
        }
        fail("Packaged onboarding/native bridge did not become ready")
    }

    private fun runAsync(body: String): JSONObject {
        evaluate("(() => { window.__fitcoachRuntimeProbe = {state:'pending'}; Promise.resolve().then(async () => { $body }).then(result => {window.__fitcoachRuntimeProbe = {state:'done', result}}, error => {window.__fitcoachRuntimeProbe = {state:'error', message:String(error?.message || error)}}); return {started:true}; })()")
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30)
        while (System.nanoTime() < deadline) {
            val state = evaluate("window.__fitcoachRuntimeProbe")
            if (state.optString("state") == "error") fail(state.optString("message"))
            if (state.optString("state") == "done") return state.getJSONObject("result")
            Thread.sleep(100)
        }
        throw AssertionError("Native/WebView operation timed out")
    }

    @Test fun launchesPackagedOnboardingWithNativeBridge() {
        val result = runAsync("""
            const native = window.Capacitor.Plugins.FitCoachNative;
            const health = await native.healthAvailability();
            return {url:location.href, platform:window.Capacitor.getPlatform(),
                heading:document.querySelector('h1')?.textContent,
                width:innerWidth, overflow:document.documentElement.scrollWidth > innerWidth + 1,
                healthSource:health.source, healthAvailable:typeof health.available === 'boolean'};
        """)
        assertEquals("https://localhost/fitcoach-founder-test/index.html", result.getString("url"))
        assertEquals("android", result.getString("platform"))
        assertEquals("Start with the right safety mode.", result.getString("heading"))
        assertTrue(result.getInt("width") >= 300)
        assertFalse("Initial screen overflows horizontally", result.getBoolean("overflow"))
        assertEquals("health_connect", result.getString("healthSource"))
        assertTrue(result.getBoolean("healthAvailable"))
        assertEquals(PackageManager.PERMISSION_DENIED, context.checkSelfPermission(Manifest.permission.RECORD_AUDIO))
    }

    @Test fun decodesPackagedExerciseArtwork() {
        val result = runAsync("""
            const {EXERCISE_MEDIA_MANIFEST:media} = await import('/fitcoach-founder-test/v040/data/exercise-media-manifest.mjs');
            const posters = media.filter(item => item.type === 'poster');
            const examples = [posters[0], posters[49], posters[99]];
            const widths = [];
            for (const item of examples) {
                const image = new Image(); image.src = item.path;
                await image.decode(); widths.push(image.naturalWidth);
            }
            return {posters:posters.length, videos:media.filter(item => item.type === 'mp4').length, widths};
        """)
        assertEquals(100, result.getInt("posters"))
        assertEquals(59, result.getInt("videos"))
        val widths = result.getJSONArray("widths")
        assertEquals(3, widths.length())
        for (index in 0 until widths.length()) assertTrue("Full-resolution image did not decode", widths.getInt(index) >= 1000)
    }

    @Test fun secureSessionSurvivesRecreationAndClears() {
        val synthetic = "fitcoach-emulator-only-session-not-a-real-token"
        try {
            val stored = runAsync("""
                const {createNativePlatformClient} = await import('/fitcoach-founder-test/v040/services/native-client.mjs');
                const storage = createNativePlatformClient().secureSessionStorage;
                await storage.clear();
                return {available:storage.available, saved:await storage.write('$synthetic'), matches:(await storage.read()) === '$synthetic'};
            """)
            assertTrue(stored.getBoolean("available"))
            assertTrue(stored.getBoolean("saved"))
            assertTrue(stored.getBoolean("matches"))
            val preferences = context.getSharedPreferences("fitcoach_secure_session", Context.MODE_PRIVATE)
            assertTrue(preferences.getString("iv", null)?.isNotBlank() == true)
            val ciphertext = preferences.getString("ciphertext", null).orEmpty()
            assertTrue(ciphertext.isNotBlank())
            assertFalse(ciphertext.contains(synthetic))
            assertEquals(setOf("iv", "ciphertext"), preferences.all.keys)
            assertTrue(KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.containsAlias("fitcoach_session_v1"))
            scenario.recreate()
            awaitReady()
            val recovered = runAsync("""
                const {createNativePlatformClient} = await import('/fitcoach-founder-test/v040/services/native-client.mjs');
                const storage = createNativePlatformClient().secureSessionStorage;
                const matches = (await storage.read()) === '$synthetic';
                const cleared = await storage.clear();
                return {matches, cleared, absent:(await storage.read()) === null};
            """)
            assertTrue(recovered.getBoolean("matches"))
            assertTrue(recovered.getBoolean("cleared"))
            assertTrue(recovered.getBoolean("absent"))
            assertTrue(preferences.all.isEmpty())
        } finally {
            // The test has already asserted deletion through the production bridge.
            // Best-effort fixture cleanup still runs if any earlier assertion failed.
            context.getSharedPreferences("fitcoach_secure_session", Context.MODE_PRIVATE).edit().clear().commit()
        }
    }
}
