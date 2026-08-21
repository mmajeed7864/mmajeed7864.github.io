// FitCoach founder PWA cache. v0.4 owns only the versioned shell/module graph.
const CACHE = "fitcoach-symbio-v0406";

const SHELL_ASSETS = Object.freeze([
  "./",
  "./index.html?v=0406",
  "./manifest.webmanifest?v=0406",
  "./assets/icon-symbio.svg?v=0406",
  "./v040/styles.css?v=0406",
  "./v040/app.js?v=0406",
]);

const MODULE_ASSETS = Object.freeze([
  "./v040/core/constants.mjs",
  "./v040/core/store.mjs",
  "./v040/core/utils.mjs",
  "./v040/data/exercise-library.mjs",
  "./v040/data/exercise-expansion-targets.mjs",
  "./v040/data/exercise-media-manifest.mjs",
  "./v040/data/exercise-schema.mjs",
  "./v040/domain/decisions.mjs",
  "./v040/domain/nutrition-estimator.mjs",
  "./v040/domain/nutrition.mjs",
  "./v040/domain/trainer-actions.mjs",
  "./v040/domain/workouts.mjs",
  "./v040/services/trainer-client.mjs",
  "./v040/services/voice-client.mjs",
  "./v040/ui/coach-screen.mjs",
  "./v040/ui/components.mjs",
  "./v040/ui/modal.mjs",
  "./v040/ui/nutrition-screen.mjs",
  "./v040/ui/onboarding.mjs",
  "./v040/ui/profile-screen.mjs",
  "./v040/ui/progress-screen.mjs",
  "./v040/ui/today-screen.mjs",
  "./v040/ui/train-screen.mjs",
  "./v040/voice/voice-room-controller.mjs",
  "./v040/voice/voice-room-state.mjs",
]);

const EXERCISE_ASSETS = Object.freeze([
  "./v040/assets/exercises/air-squat-premium-v1.png?v=0406",
  "./v040/assets/exercises/band-lat-pulldown-premium-v1.png?v=0406",
  "./v040/assets/exercises/band-row-premium-v1.png?v=0406",
  "./v040/assets/exercises/dead-bug-premium-v1.png?v=0406",
  "./v040/assets/exercises/dumbbell-curl-premium-v1.png?v=0406",
  "./v040/assets/exercises/dumbbell-floor-press-premium-v1.png?v=0406",
  "./v040/assets/exercises/glute-bridge-premium-v1.png?v=0406",
  "./v040/assets/exercises/goblet-squat-premium-v1.png?v=0406",
  "./v040/assets/exercises/half-kneeling-press-premium-v1.png?v=0406",
  "./v040/assets/exercises/hip-hinge-premium-v1.png?v=0406",
  "./v040/assets/exercises/incline-push-up-premium-v1.png?v=0406",
  "./v040/assets/exercises/lateral-raise-premium-v1.png?v=0406",
  "./v040/assets/exercises/marching-jacks-premium-v1.png?v=0406",
  "./v040/assets/exercises/one-arm-dumbbell-row-premium-v1.png?v=0406",
  "./v040/assets/exercises/overhead-triceps-extension-premium-v1.png?v=0406",
  "./v040/assets/exercises/reverse-lunge-premium-v1.png?v=0406",
]);

const PRECACHE_ASSETS = Object.freeze([
  ...SHELL_ASSETS,
  ...MODULE_ASSETS,
  ...EXERCISE_ASSETS,
]);

async function cachedOrFetch(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
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
        .filter(key => key.startsWith("fitcoach-") && key !== CACHE)
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
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put("./", copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match("./").then(response => response || caches.match("./index.html?v=0406")))
    );
    return;
  }

  const versioned = url.searchParams.get("v") === "0406";
  const moduleAsset = url.pathname.includes("/v040/") && url.pathname.endsWith(".mjs");
  const exerciseAsset = url.pathname.includes("/v040/assets/exercises/");
  if (versioned || moduleAsset || exerciseAsset) {
    event.respondWith(cachedOrFetch(event.request));
  }
});
