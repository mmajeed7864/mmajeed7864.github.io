const CACHE = "fitcoach-symbio-v0310";
const ASSETS = [
  "./",
  "./index.html?v=0310",
  "./v031-style-01.css?v=0310",
  "./v031-style-02.css?v=0310",
  "./v031-style-03.css?v=0310",
  "./v031-style-04.css?v=0310",
  "./v031-style-05.css?v=0310",
  "./v031-part-01.js?v=0310",
  "./v031-part-02.js?v=0310",
  "./v031-part-03.js?v=0310",
  "./v031-part-04.js?v=0310",
  "./v031-part-05.js?v=0310",
  "./v031-part-06.js?v=0310",
  "./v031-part-07.js?v=0310",
  "./v031-part-08.js?v=0310",
  "./v031-part-09.js?v=0310",
  "./v031-part-10.js?v=0310",
  "./v031-part-11.js?v=0310",
  "./v031-part-12.js?v=0310",
  "./v031-part-13.js?v=0310",
  "./manifest.webmanifest?v=0310",
  "./assets/icon-symbio.svg?v=0310"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then(hit => hit || caches.match("./")))
  );
});
