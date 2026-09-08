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
        awaitReady(onboarding = false)
        // This entire package/AVD is disposable. Reset only its synthetic WebView
        // fixture, not a user's browser, native session, or production account.
        evaluate("(() => { window.__fitcoachResetPending = true; localStorage.clear(); sessionStorage.clear(); setTimeout(() => location.replace('https://localhost/fitcoach-founder-test/index.html'), 0); return {reset:true}; })()")
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

    private fun awaitReady(onboarding: Boolean = true) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(45)
        while (System.nanoTime() < deadline) {
            val selector = if (onboarding) "[data-field=ageBand]" else "[data-action]"
            val state = evaluate("({ready: !window.__fitcoachResetPending && !!document.querySelector('$selector'), native: !!window.Capacitor?.Plugins?.FitCoachNative})")
            if (state.optBoolean("ready") && state.optBoolean("native")) return
            Thread.sleep(200)
        }
        fail("Packaged onboarding/native bridge did not become ready")
    }

    private fun runAsync(body: String, timeoutSeconds: Long = 30): JSONObject {
        evaluate("(() => { window.__fitcoachRuntimeProbe = {state:'pending'}; Promise.resolve().then(async () => { $body }).then(result => {window.__fitcoachRuntimeProbe = {state:'done', result}}, error => {window.__fitcoachRuntimeProbe = {state:'error', message:String(error?.message || error)}}); return {started:true}; })()")
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds)
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
            // evaluateJavascript has an about:blank script base on Android.
            // Resolve against the actual document origin, not that script base.
            const {EXERCISE_MEDIA_MANIFEST:media} = await import(new URL('/fitcoach-founder-test/v040/data/exercise-media-manifest.mjs', location.origin).href);
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
                const {createNativePlatformClient} = await import(new URL('/fitcoach-founder-test/v040/services/native-client.mjs', location.origin).href);
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
                const {createNativePlatformClient} = await import(new URL('/fitcoach-founder-test/v040/services/native-client.mjs', location.origin).href);
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

    @Test fun motionControlsPlayPauseResumeAndLoopOffline() {
        val result = runAsync("""
            const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
            const waitFor = async (predicate, label, timeout = 15000) => {
                const deadline = performance.now() + timeout;
                while (performance.now() < deadline) {
                    if (predicate()) return;
                    await delay(100);
                }
                throw new Error('Timed out: ' + label);
            };
            const click = selector => {
                const button = document.querySelector(selector);
                if (!button || button.disabled) throw new Error('Unavailable control: ' + selector);
                button.click();
            };
            // Exercise the real age gate and consent for this synthetic adult
            // fixture. Never inject an onboarded profile or bypass the UI guards.
            click('[data-field="ageBand"][data-value="adult_18_plus"]');
            for (let step = 0; step < 18; step++) {
                const header = document.querySelector('.onboarding-screen header small')?.textContent;
                if (header !== 'Step ' + (step + 1) + ' of 18') throw new Error('Unexpected onboarding step');
                const voiceOff = document.querySelector('[data-field="speakReplies"][data-value="false"]');
                if (voiceOff) voiceOff.click();
                const consent = document.querySelector('[data-action="onboarding-consent"]');
                if (consent && !consent.checked) consent.click();
                click('[data-action="onboarding-next"]');
                await waitFor(() => document.querySelector('.onboarding-screen header small')?.textContent !== header, 'onboarding step ' + (step + 1));
            }
            document.querySelector('[data-action="skip-tutorial"]')?.click();
            await waitFor(() => !document.querySelector('[data-action="skip-tutorial"]'), 'tutorial dismissal');
            await waitFor(() => !!document.querySelector('[data-action="route"][data-value="train"]'), 'training navigation');
            click('[data-action="route"][data-value="train"]');
            await waitFor(() => !!document.querySelector('#train-tab-exercises'), 'exercise tab');
            click('#train-tab-exercises');
            await waitFor(() => !!document.querySelector('#exercise-search'), 'exercise search');
            const search = document.querySelector('#exercise-search');
            search.value = 'Barbell Back Squat';
            search.dispatchEvent(new Event('input', {bubbles:true}));
            await waitFor(() => !!document.querySelector('[data-action="open-exercise"][data-value="barbell-back-squat"]'), 'squat search result');
            click('[data-action="open-exercise"][data-value="barbell-back-squat"]');
            await waitFor(() => !!document.querySelector('video[data-media-video]'), 'real motion player');
            const video = document.querySelector('video[data-media-video]');
            const figure = video.closest('.exercise-motion');
            const toggle = figure.querySelector('[data-action="toggle-exercise-motion"]');
            const healthy = () => {
                if (!video.isConnected || video.error) throw new Error('Motion player disconnected or failed: ' + video.error?.code);
                return true;
            };
            await waitFor(() => healthy() && video.readyState >= 2, 'local video decoding');
            if (!Number.isFinite(video.duration) || video.duration < 3 || video.duration > 20) throw new Error('Unexpected motion duration');
            const frames = () => new Promise((resolve, reject) => {
                if (!video.requestVideoFrameCallback) return reject(new Error('Decoded-frame observation unavailable'));
                let id, count = 0;
                const timer = setTimeout(() => { video.cancelVideoFrameCallback(id); reject(new Error('Video did not present three frames')); }, 5000);
                const frame = () => {
                    if (++count === 3) { clearTimeout(timer); resolve(count); }
                    else id = video.requestVideoFrameCallback(frame);
                };
                id = video.requestVideoFrameCallback(frame);
            });
            const playing = () => healthy() && !video.paused && figure.dataset.motionStatus === 'playing' && toggle.getAttribute('aria-pressed') === 'true';
            const paused = () => healthy() && video.paused && figure.dataset.motionStatus === 'paused' && toggle.getAttribute('aria-pressed') === 'false';
            // All play/pause changes go through the shipped custom button.
            // Never call play(), pause() or seek directly as a substitute.
            if (video.paused) toggle.click();
            await waitFor(playing, 'initial playback');
            const firstFrames = await frames();
            toggle.click();
            await waitFor(paused, 'pause button');
            const pauseTime = video.currentTime;
            await delay(400);
            if (!paused() || Math.abs(video.currentTime - pauseTime) > 0.08) throw new Error('Paused video kept moving');
            toggle.click();
            await waitFor(playing, 'resume button');
            const resumeFrames = await frames();
            await waitFor(() => healthy() && Math.abs(video.currentTime - pauseTime) > 0.15, 'resumed timeline');
            let previous = video.currentTime;
            await waitFor(() => {
                healthy();
                const looped = video.currentTime + 0.3 < previous;
                previous = video.currentTime;
                return looped && playing();
            }, 'uninterrupted real loop', video.duration * 1000 + 6000);
            const loopFrames = await frames();
            toggle.click();
            await waitFor(paused, 'pause after loop');
            return {firstFrames, resumeFrames, loopFrames, paused:video.paused,
                localSource:new URL(video.currentSrc).origin === 'https://localhost',
                id:video.dataset.motionId, muted:video.muted, inline:video.playsInline,
                width:video.videoWidth, overflow:document.documentElement.scrollWidth > innerWidth + 1};
        """, timeoutSeconds = 90)
        assertEquals("barbell-back-squat-motion", result.getString("id"))
        for (field in listOf("firstFrames", "resumeFrames", "loopFrames")) assertEquals(3, result.getInt(field))
        for (field in listOf("paused", "localSource", "muted", "inline")) assertTrue(field, result.getBoolean(field))
        assertTrue(result.getInt("width") >= 720)
        assertFalse("Exercise detail overflows horizontally", result.getBoolean("overflow"))
    }
}
