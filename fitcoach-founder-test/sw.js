// FitCoach founder PWA cache. v0.4 owns only the versioned shell/module graph.
const CACHE = "fitcoach-symbio-v0418";

const SHELL_ASSETS = Object.freeze([
  "./",
  "./index.html?v=0418",
  "./manifest.webmanifest?v=0418",
  "./assets/icon-symbio.svg?v=0418",
  "./v040/styles.css?v=0418",
  "./v040/premium-redesign.css?v=0418",
  "./v040/app.js?v=0418",
]);

const MODULE_ASSETS = Object.freeze([
  "./v040/core/constants.mjs",
  "./v040/core/store.mjs",
  "./v040/core/utils.mjs",
  "./v040/data/exercise-library.mjs",
  "./v040/data/exercise-expansion-targets.mjs",
  "./v040/data/exercise-media-manifest.mjs",
  "./v040/data/generated-style-posters.mjs",
  "./v040/data/motion-guide-coverage.mjs",
  "./v040/data/exercise-schema.mjs",
  "./v040/data/generated-motion-definitions.mjs",
  "./v040/domain/decisions.mjs",
  "./v040/domain/nutrition-estimator.mjs",
  "./v040/domain/nutrition.mjs",
  "./v040/domain/trainer-actions.mjs",
  "./v040/domain/workouts.mjs",
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
  "./v040/ui/today-screen.mjs",
  "./v040/ui/train-screen.mjs",
  "./v040/voice/voice-room-controller.mjs",
  "./v040/voice/voice-room-state.mjs",
]);

const EXERCISE_ASSETS = Object.freeze([
  "./v040/assets/exercises/air-squat-premium-v1.png",
  "./v040/assets/exercises/band-lat-pulldown-premium-v1.png",
  "./v040/assets/exercises/band-row-premium-v1.png",
  "./v040/assets/exercises/barbell-bench-press-premium-v1.png",
  "./v040/assets/exercises/generated/conventional-deadlift-premium-v1.png",
  "./v040/assets/exercises/generated/barbell-back-squat-premium-v2.png",
  "./v040/assets/exercises/generated/front-squat-premium-v2.png",
  "./v040/assets/exercises/generated/dumbbell-bench-press-premium-v2.png",
  "./v040/assets/exercises/generated/leg-press-premium-v2.png",
  "./v040/assets/exercises/generated/lat-pulldown-premium-v2.png",
  "./v040/assets/exercises/generated/hip-thrust-premium-v2.png",
  "./v040/assets/exercises/generated/standing-overhead-press-premium-v2.png",
  "./v040/assets/exercises/generated/seated-cable-row-premium-v2.png",
  "./v040/assets/exercises/generated/romanian-deadlift-premium-v2.png",
  "./v040/assets/exercises/generated/assisted-pull-up-premium-v2.png",
  "./v040/assets/exercises/generated/air-squat-premium-v2.png",
  "./v040/assets/exercises/generated/goblet-squat-premium-v2.png",
  "./v040/assets/exercises/generated/hip-hinge-premium-v2.png",
  "./v040/assets/exercises/generated/glute-bridge-premium-v2.png",
  "./v040/assets/exercises/generated/incline-push-up-premium-v2.png",
  "./v040/assets/exercises/generated/dumbbell-floor-press-premium-v2.png",
  "./v040/assets/exercises/generated/band-row-premium-v2.png",
  "./v040/assets/exercises/generated/one-arm-dumbbell-row-premium-v2.png",
  "./v040/assets/exercises/generated/half-kneeling-press-premium-v2.png",
  "./v040/assets/exercises/generated/band-lat-pulldown-premium-v2.png",
  "./v040/assets/exercises/generated/reverse-lunge-premium-v2.png",
  "./v040/assets/exercises/generated/dumbbell-curl-premium-v2.png",
  "./v040/assets/exercises/generated/overhead-triceps-extension-premium-v2.png",
  "./v040/assets/exercises/generated/lateral-raise-premium-v2.png",
  "./v040/assets/exercises/generated/dead-bug-premium-v2.png",
  "./v040/assets/exercises/generated/marching-jacks-premium-v2.png",
  "./v040/assets/exercises/generated/barbell-bench-press-premium-v2.png",
  "./v040/assets/exercises/generated/box-squat-premium-v2.png",
  "./v040/assets/exercises/generated/hack-squat-premium-v2.png",
  "./v040/assets/exercises/generated/heel-elevated-squat-premium-v2.png",
  "./v040/assets/exercises/generated/step-up-premium-v2.png",
  "./v040/assets/exercises/generated/trap-bar-deadlift-premium-v2.png",
  "./v040/assets/exercises/generated/single-leg-romanian-deadlift-premium-v2.png",
  "./v040/assets/exercises/generated/sumo-deadlift-premium-v2.png",
  "./v040/assets/exercises/generated/kettlebell-swing-premium-v2.png",
  "./v040/assets/exercises/generated/good-morning-premium-v2.png",
  "./v040/assets/exercises/generated/back-extension-premium-v2.png",
  "./v040/assets/exercises/generated/incline-dumbbell-press-premium-v2.png",
  "./v040/assets/exercises/generated/push-up-premium-v2.png",
  "./v040/assets/exercises/generated/machine-chest-press-premium-v2.png",
  "./v040/assets/exercises/generated/cable-chest-fly-premium-v2.png",
  "./v040/assets/exercises/generated/pec-deck-premium-v2.png",
  "./v040/assets/exercises/generated/close-grip-bench-press-premium-v2.png",
  "./v040/assets/exercises/generated/parallel-bar-dip-premium-v2.png",
  "./v040/assets/exercises/generated/chest-supported-row-premium-v2.png",
  "./v040/assets/exercises/generated/bent-over-row-premium-v2.png",
  "./v040/assets/exercises/generated/dumbbell-shoulder-press-premium-v2.png",
  "./v040/assets/exercises/generated/landmine-press-premium-v2.png",
  "./v040/assets/exercises/generated/arnold-press-premium-v2.png",
  "./v040/assets/exercises/generated/push-press-premium-v2.png",
  "./v040/assets/exercises/generated/pull-up-premium-v2.png",
  "./v040/assets/exercises/generated/chin-up-premium-v2.png",
  "./v040/assets/exercises/generated/neutral-grip-pulldown-premium-v2.png",
  "./v040/assets/exercises/generated/straight-arm-pulldown-premium-v2.png",
  "./v040/assets/exercises/generated/cable-pullover-premium-v2.png",
  "./v040/assets/exercises/generated/machine-pulldown-premium-v2.png",
  "./v040/assets/exercises/generated/scapular-pull-up-premium-v2.png",
  "./v040/assets/exercises/generated/walking-lunge-premium-v2.png",
  "./v040/assets/exercises/generated/lateral-lunge-premium-v2.png",
  "./v040/assets/exercises/generated/bulgarian-split-squat-premium-v2.png",
  "./v040/assets/exercises/generated/front-foot-elevated-split-squat-premium-v2.png",
  "./v040/assets/exercises/generated/sled-push-premium-v2.png",
  "./v040/assets/exercises/generated/sled-pull-premium-v2.png",
  "./v040/assets/exercises/generated/bird-dog-premium-v2.png",
  "./v040/assets/exercises/generated/cable-pull-through-premium-v2.png",
  "./v040/assets/exercises/generated/deficit-push-up-premium-v2.png",
  "./v040/assets/exercises/generated/t-bar-row-premium-v2.png",
  "./v040/assets/exercises/generated/inverted-row-premium-v2.png",
  "./v040/assets/exercises/generated/machine-row-premium-v2.png",
  "./v040/assets/exercises/generated/cable-face-pull-premium-v2.png",
  "./v040/assets/exercises/generated/rear-delt-fly-premium-v2.png",
  "./v040/assets/exercises/generated/single-arm-cable-row-premium-v2.png",
  "./v040/assets/exercises/generated/seal-row-premium-v2.png",
  "./v040/assets/exercises/generated/cable-lateral-raise-premium-v2.png",
  "./v040/assets/exercises/generated/upright-row-premium-v2.png",
  "./v040/assets/exercises/generated/hanging-knee-raise-premium-v2.png",
  "./v040/assets/exercises/generated/step-down-premium-v2.png",
  "./v040/assets/exercises/generated/pallof-press-premium-v2.png",
  "./v040/assets/exercises/generated/cable-crunch-premium-v2.png",
  "./v040/assets/exercises/generated/ab-wheel-rollout-premium-v2.png",
  "./v040/assets/exercises/generated/hollow-body-hold-premium-v2.png",
  "./v040/assets/exercises/generated/hammer-curl-premium-v2.png",
  "./v040/assets/exercises/generated/preacher-curl-premium-v2.png",
  "./v040/assets/exercises/generated/cable-curl-premium-v2.png",
  "./v040/assets/exercises/generated/skull-crusher-premium-v2.png",
  "./v040/assets/exercises/generated/dumbbell-lateral-raise-premium-v2.png",
  "./v040/assets/exercises/generated/front-raise-premium-v2.png",
  "./v040/assets/exercises/generated/farmer-carry-premium-v2.png",
  "./v040/assets/exercises/generated/jump-rope-premium-v2.png",
  "./v040/assets/exercises/generated/easy-rower-premium-v2.png",
  "./v040/assets/exercises/generated/easy-bike-premium-v2.png",
  "./v040/assets/exercises/generated/incline-walk-premium-v2.png",
  "./v040/assets/exercises/generated/battle-ropes-premium-v2.png",
  "./v040/assets/exercises/generated/bear-crawl-premium-v2.png",
  "./v040/assets/exercises/generated/medicine-ball-slam-premium-v2.png",
  "./v040/assets/exercises/generated/hip-flexor-mobilization-premium-v2.png",
  "./v040/assets/exercises/generated/thoracic-rotation-premium-v2.png",
  "./v040/assets/exercises/generated/machine-shoulder-press-premium-v2.png",
  "./v040/assets/exercises/generated/triceps-pushdown-premium-v2.png",
  "./v040/assets/exercises/dead-bug-premium-v1.png",
  "./v040/assets/exercises/dumbbell-curl-premium-v1.png",
  "./v040/assets/exercises/dumbbell-floor-press-premium-v1.png",
  "./v040/assets/exercises/glute-bridge-premium-v1.png",
  "./v040/assets/exercises/goblet-squat-premium-v1.png",
  "./v040/assets/exercises/half-kneeling-press-premium-v1.png",
  "./v040/assets/exercises/hip-hinge-premium-v1.png",
  "./v040/assets/exercises/incline-push-up-premium-v1.png",
  "./v040/assets/exercises/lateral-raise-premium-v1.png",
  "./v040/assets/exercises/marching-jacks-premium-v1.png",
  "./v040/assets/exercises/one-arm-dumbbell-row-premium-v1.png",
  "./v040/assets/exercises/overhead-triceps-extension-premium-v1.png",
  "./v040/assets/exercises/reverse-lunge-premium-v1.png",
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
  // Safari requests MP4 chunks with Range. Cache Storage does not reliably
  // accept those 206 responses, and a rejected put must never break playback.
  if (response.ok && response.status === 200 && !request.headers.has("range")) {
    caches.open(CACHE)
      .then(cache => cache.put(request, response.clone()))
      .catch(() => {});
  }
  return response;
}

async function networkOrCached(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request);
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
        .catch(() => caches.match("./").then(response => response || caches.match("./index.html?v=0418")))
    );
    return;
  }

  const versioned = url.searchParams.get("v") === "0418";
  const moduleAsset = url.pathname.includes("/v040/") && url.pathname.endsWith(".mjs");
  const exerciseAsset = url.pathname.includes("/v040/assets/exercises/");
  const rangeRequest = event.request.headers.has("range");
  const motionVideo = exerciseAsset && url.pathname.endsWith(".mp4");
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
  if (exerciseAsset) {
    event.respondWith(cachedOrFetch(event.request));
  }
});
