// FitCoach founder PWA cache. v0.4 owns only the versioned shell/module graph.
const CACHE = "fitcoach-symbio-v0600";
const MEDIA_CACHE = "fitcoach-exercise-images-v0600";
const MAX_MEDIA_ENTRIES = 12;
const CURRENT_CACHES = new Set([CACHE, MEDIA_CACHE]);
let mediaWriteQueue = Promise.resolve();

const SHELL_ASSETS = Object.freeze([
  "./",
  "./index.html?v=0600",
  "./manifest.webmanifest?v=0600",
  "./assets/icon-symbio.svg?v=0600",
  "./v040/boot.js?v=0600",
  "./legal/legal.css",
  "./legal/privacy.html",
  "./legal/terms.html",
  "./legal/delete-account.html",
  "./legal/support.html",
  "./v040/styles.css?v=0600",
  "./v040/premium-redesign.css?v=0600",
  "./v040/design-system-v060.css?v=0600",
  "./v040/ui/nutrition-v060.css?v=0600",
  "./v040/ui/train-v060.css?v=0600",
  "./v040/ui/progress-v060.css?v=0600",
  "./v040/ui/coach-v060.css?v=0600",
  "./v040/ui/profile-v060.css?v=0600",
  "./v040/assets/brand/training-day-v060.webp",
  "./v040/assets/brand/training-day-v060-small.webp",
  "./v040/app.js?v=0600",
]);

const MODULE_ASSETS = Object.freeze([
  "./v040/core/constants.mjs",
  "./v040/core/store.mjs",
  "./v040/core/utils.mjs",
  "./v040/data/exercise-library.mjs",
  "./v040/data/exercise-expansion-targets.mjs",
  "./v040/data/exercise-media-manifest.mjs",
  "./v040/data/generated-style-posters.mjs",
  "./v040/data/generated-thumbnail-definitions.mjs",
  "./v040/data/motion-guide-coverage.mjs",
  "./v040/data/exercise-schema.mjs",
  "./v040/data/generated-motion-definitions.mjs",
  "./v040/domain/decisions.mjs",
  "./v040/domain/coach-tools.mjs",
  "./v040/domain/daily-board.mjs",
  "./v040/domain/hydration.mjs",
  "./v040/domain/evidence.mjs",
  "./v040/domain/exercise-discovery.mjs",
  "./v040/domain/nutrition-estimator.mjs",
  "./v040/domain/nutrition.mjs",
  "./v040/domain/strength-tools.mjs",
  "./v040/domain/sync-projection.mjs",
  "./v040/domain/trainer-actions.mjs",
  "./v040/domain/workouts.mjs",
  "./v040/policy/nutrition-providers.mjs",
  "./v040/policy/youth-safety.mjs",
  "./v040/services/account-client.mjs",
  "./v040/services/native-lifecycle.mjs",
  "./v040/services/native-client.mjs",
  "./v040/services/nutrition-client.mjs",
  "./v040/services/trainer-client.mjs",
  "./v040/services/voice-client.mjs",
  "./v040/ui/coach-screen.mjs",
  "./v040/ui/components.mjs",
  "./v040/ui/modal.mjs",
  "./v040/ui/nutrition-screen.mjs",
  "./v040/ui/onboarding.mjs",
  "./v040/ui/profile-screen.mjs",
  "./v040/ui/progress-screen.mjs",
  "./v040/ui/home-screen.mjs",
  "./v040/ui/train-screen.mjs",
  "./v040/voice/voice-room-controller.mjs",
  "./v040/voice/voice-room-state.mjs",
]);
// The anatomy set is small and used in onboarding as well as every exercise
// detail view. Keep it available on a true first offline launch while the much
// larger poster/video library remains on-demand.
const ANATOMY_ASSETS = Object.freeze([
  "./v040/assets/anatomy/lower-body-v2.png",
  "./v040/assets/anatomy/push-v2.png",
  "./v040/assets/anatomy/pull-v2.png",
  "./v040/assets/anatomy/hinge-v2.png",
  "./v040/assets/anatomy/core-v2.png",
  "./v040/assets/anatomy/body-focus-neutral-v1.png",
]);

const PRECACHE_ASSETS = Object.freeze([
  ...SHELL_ASSETS,
  ...MODULE_ASSETS,
  ...ANATOMY_ASSETS,
]);

async function trimCache(cache, maximumEntries) {
  const keys = await cache.keys();
  const overflow = Math.max(0, keys.length - maximumEntries);
  await Promise.all(keys.slice(0, overflow).map(key => cache.delete(key)));
}

async function cachedOrFetch(request, event, {
  cacheName = CACHE,
  maximumEntries = 0,
  ignoreSearch = false,
} = {}) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch });
  if (cached) return cached;
  const response = await fetch(request);
  // Safari requests MP4 chunks with Range. Cache Storage does not reliably
  // accept those 206 responses, and a rejected put must never break playback.
  if (response.ok && response.status === 200 && !request.headers.has("range")) {
    // Clone before returning the original response. Runtime writes are
    // serialized, so cloning inside the queue can happen after the browser has
    // already locked or consumed the original body.
    const cacheResponse = response.clone();
    let cacheWrite;
    if (maximumEntries > 0) {
      mediaWriteQueue = mediaWriteQueue
        .catch(() => {})
        .then(async () => {
          const runtimeCache = await caches.open(cacheName);
          const existing = await runtimeCache.match(request, { ignoreSearch });
          if (!existing) await runtimeCache.put(request, cacheResponse);
          await trimCache(runtimeCache, maximumEntries);
        });
      cacheWrite = mediaWriteQueue.catch(() => {});
    } else {
      cacheWrite = cache.put(request, cacheResponse).catch(() => {});
    }
    // Keep the worker alive until the first runtime image is actually stored.
    // Await as a fallback for direct/unit invocation without a FetchEvent.
    if (typeof event?.waitUntil === "function") event.waitUntil(cacheWrite);
    else await cacheWrite;
  }
  return response;
}

async function networkOrCached(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cache.match(request);
  }
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith("fitcoach-") && !CURRENT_CACHES.has(key))
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/api/")) return;

  if (event.request.mode === "navigate") {
    const isShellNavigation = /\/(?:index\.html)?$/u.test(url.pathname);
    const navigationCacheKey = isShellNavigation ? "./" : event.request;
    event.respondWith(
      fetch(event.request)
        .then(async response => {
          if (response.ok && response.status === 200) {
            const copy = response.clone();
            await caches.open(CACHE).then(cache => cache.put(navigationCacheKey, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.open(CACHE).then(cache => (
          cache.match(navigationCacheKey).then(response => response || cache.match("./index.html?v=0600"))
        )))
    );
    return;
  }

  const versioned = url.searchParams.get("v") === "0600";
  const moduleAsset = url.pathname.includes("/v040/") && url.pathname.endsWith(".mjs");
  const exerciseAsset = url.pathname.includes("/v040/assets/exercises/");
  const anatomyAsset = url.pathname.includes("/v040/assets/anatomy/");
  const brandAsset = url.pathname.includes("/v040/assets/brand/");
  const legalAsset = url.pathname.endsWith("/legal/legal.css");
  const rangeRequest = event.request.headers.has("range");
  const motionVideo = exerciseAsset && url.pathname.endsWith(".mp4");
  const exerciseImage = exerciseAsset && /\.(?:png|webp|avif)$/iu.test(url.pathname);
  // Stream video directly. This avoids trying to put partial responses into
  // Cache Storage, which is the iOS/Safari failure path behind the retry card.
  if (rangeRequest || motionVideo) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  if (versioned || moduleAsset) {
    event.respondWith(networkOrCached(event.request));
    return;
  }
  if (exerciseImage) {
    event.respondWith(cachedOrFetch(event.request, event, {
      cacheName: MEDIA_CACHE,
      maximumEntries: MAX_MEDIA_ENTRIES,
      ignoreSearch: true,
    }));
    return;
  }
  if (anatomyAsset || brandAsset || legalAsset) {
    event.respondWith(cachedOrFetch(event.request, event));
  }
});
