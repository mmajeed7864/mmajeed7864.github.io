// FitCoach founder PWA cache. Bump this identifier whenever the active asset graph changes.
const CACHE = "fitcoach-symbio-v0340";
const ASSETS = [
  "./",
  "./index.html?v=0340",
  "./v031-style-01.css?v=0310",
  "./v031-style-02.css?v=0310",
  "./v031-style-03.css?v=0310",
  "./v031-style-04.css?v=0310",
  "./v031-style-05.css?v=0310",
  "./v033-pages.css?v=0330",
  "./v031-part-01.js?v=0310",
  "./v031-part-02.js?v=0310",
  "./v031-part-03.js?v=0310",
  "./v031-part-04.js?v=0310",
  "./v031-part-05.js?v=0310",
  "./v031-part-07.js?v=0310",
  "./v031-part-08.js?v=0310",
  "./v031-part-09.js?v=0310",
  "./v031-part-10.js?v=0310",
  "./v031-part-11.js?v=0310",
  "./v031-part-12.js?v=0310",
  "./v031-part-13.js?v=0310",
  "./v034-pwa-refresh.js?v=0340",
  "./v032-ai-voice.js?v=0320",
  "./v033-global-contract.js?v=0331",
  "./v033-pages.js?v=0330",
  "./manifest.webmanifest?v=0340",
  "./assets/icon-symbio.svg?v=0340"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("fitcoach-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(async response => {
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("./");
        return Response.error();
      })
  );
});
