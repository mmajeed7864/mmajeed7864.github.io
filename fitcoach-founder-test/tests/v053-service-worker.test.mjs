import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const ORIGIN = "https://fitcoach.test";
const SHELL_CACHE = "fitcoach-symbio-v0701";
const MEDIA_CACHE = "fitcoach-exercise-images-v0701";

function requestKey(value) {
  if (value instanceof Request) return value.url;
  return new URL(String(value), `${ORIGIN}/fitcoach-founder-test/`).href;
}

function keyWithoutSearch(value) {
  const url = new URL(requestKey(value));
  url.search = "";
  return url.href;
}

class FakeCache {
  constructor() {
    this.entries = new Map();
    this.failPut = false;
    this.blockedPuts = 0;
    this.putGate = null;
  }

  async match(request, options = {}) {
    const key = requestKey(request);
    if (!options.ignoreSearch) return this.entries.get(key)?.clone();
    const comparable = keyWithoutSearch(request);
    for (const [candidate, response] of this.entries) {
      if (keyWithoutSearch(candidate) === comparable) return response.clone();
    }
    return undefined;
  }

  async put(request, response) {
    if (this.failPut) throw new Error("simulated quota failure");
    if (this.blockedPuts > 0) {
      this.blockedPuts -= 1;
      await this.putGate;
    }
    this.entries.set(requestKey(request), response.clone());
  }

  async delete(request) {
    return this.entries.delete(requestKey(request));
  }

  async keys() {
    return [...this.entries.keys()].map(key => new Request(key));
  }

  async addAll(requests) {
    for (const request of requests) {
      await this.put(request, new Response("precache", { status: 200 }));
    }
  }
}

class FakeCacheStorage {
  constructor() {
    this.values = new Map();
  }

  async open(name) {
    if (!this.values.has(name)) this.values.set(name, new FakeCache());
    return this.values.get(name);
  }

  async keys() {
    return [...this.values.keys()];
  }

  async delete(name) {
    return this.values.delete(name);
  }
}

function createHarness({ fetchImpl } = {}) {
  const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const handlers = new Map();
  const caches = new FakeCacheStorage();
  const fetchCalls = [];
  const self = {
    location: { origin: ORIGIN },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
  };
  const fetch = async (request, options = {}) => {
    fetchCalls.push({ request, options });
    if (fetchImpl) return fetchImpl(request, options);
    return new Response("online", { status: 200 });
  };
  vm.runInNewContext(source, {
    URL,
    Request,
    Response,
    Promise,
    Set,
    console,
    caches,
    fetch,
    self,
  }, { filename: "sw.js" });

  function beginFetch(request) {
    const waits = [];
    let responsePromise;
    handlers.get("fetch")({
      request,
      respondWith(value) {
        responsePromise = Promise.resolve(value);
      },
      waitUntil(value) {
        waits.push(Promise.resolve(value));
      },
    });
    return {
      waits,
      response() {
        return responsePromise;
      },
      async waitForCache() {
        await Promise.all(waits);
      },
      async complete() {
        const response = await responsePromise;
        await Promise.all(waits);
        return response;
      },
    };
  }

  async function dispatchLifecycle(type) {
    const waits = [];
    handlers.get(type)({ waitUntil(value) { waits.push(Promise.resolve(value)); } });
    await Promise.all(waits);
  }

  return { beginFetch, caches, dispatchLifecycle, fetchCalls };
}

function posterRequest(index, search = "") {
  return new Request(`${ORIGIN}/fitcoach-founder-test/v040/assets/exercises/generated/poster-${index}.png${search}`);
}

test("self-hosted editorial fonts and cover images remain usable offline after install", async () => {
  const harness = createHarness({ fetchImpl: async () => { throw new Error("offline"); } });
  await harness.dispatchLifecycle("install");
  for (const asset of ["fonts/BarlowCondensed-Bold.ttf", "fonts/Manrope-Variable.ttf", "brand/club-day-v070-640.webp", "brand/club-day-v070-1200.webp"]) {
    const request = new Request(`${ORIGIN}/fitcoach-founder-test/v040/assets/${asset}`);
    const response = await harness.beginFetch(request).complete();
    assert.ok(response, `${asset} must be routed through the shell cache`);
    assert.equal(await response.text(), "precache");
  }
  assert.equal(harness.fetchCalls.length, 0);
});

test("runtime poster cache evicts the oldest image and never exceeds twelve entries", async () => {
  const harness = createHarness();
  for (let index = 0; index < 13; index += 1) {
    await harness.beginFetch(posterRequest(index)).complete();
  }

  const cache = await harness.caches.open(MEDIA_CACHE);
  const keys = (await cache.keys()).map(request => request.url);
  assert.equal(keys.length, 12);
  assert.ok(!keys.some(key => key.endsWith("poster-0.png")));
  assert.ok(keys.some(key => key.endsWith("poster-12.png")));
  assert.equal((await harness.caches.open(SHELL_CACHE)).entries.size, 0);
});

test("concurrent poster misses and query variants stay bounded without duplicates", async () => {
  const harness = createHarness();
  const pending = Array.from({ length: 20 }, (_, index) => harness.beginFetch(posterRequest(index)));
  await Promise.all(pending.map(event => event.complete()));

  const cache = await harness.caches.open(MEDIA_CACHE);
  assert.equal((await cache.keys()).length, 12);

  const variants = createHarness();
  await variants.beginFetch(posterRequest(1, "?v=one")).complete();
  await variants.beginFetch(posterRequest(1, "?v=two")).complete();
  assert.equal((await (await variants.caches.open(MEDIA_CACHE)).keys()).length, 1);
});

test("queued cache writes clone responses before the browser consumes their bodies", async () => {
  const harness = createHarness();
  const cache = await harness.caches.open(MEDIA_CACHE);
  let releaseFirstPut;
  cache.blockedPuts = 1;
  cache.putGate = new Promise(resolve => { releaseFirstPut = resolve; });

  const first = harness.beginFetch(posterRequest(1));
  const second = harness.beginFetch(posterRequest(2));
  await first.response();
  const secondResponse = await second.response();
  assert.equal(await secondResponse.text(), "online");
  releaseFirstPut();
  await Promise.all([first.waitForCache(), second.waitForCache()]);

  const keys = (await cache.keys()).map(request => request.url);
  assert.equal(keys.length, 2);
  assert.ok(keys.some(key => key.endsWith("poster-1.png")));
  assert.ok(keys.some(key => key.endsWith("poster-2.png")));
});

test("install and activation preserve shell media separation and unrelated origin caches", async () => {
  const harness = createHarness();
  await harness.dispatchLifecycle("install");
  const shell = await harness.caches.open(SHELL_CACHE);
  assert.ok(shell.entries.size > 30);
  assert.ok([...shell.entries.keys()].every(key => !key.includes("/assets/exercises/")));

  await harness.caches.open(MEDIA_CACHE);
  await harness.caches.open("fitcoach-old-v0499");
  await harness.caches.open("another-product-cache");
  await harness.dispatchLifecycle("activate");
  const names = await harness.caches.keys();
  assert.ok(names.includes(SHELL_CACHE));
  assert.ok(names.includes(MEDIA_CACHE));
  assert.ok(names.includes("another-product-cache"));
  assert.ok(!names.includes("fitcoach-old-v0499"));
});

test("legal navigation cannot replace the offline app shell", async () => {
  const harness = createHarness();
  await harness.dispatchLifecycle("install");
  const shell = await harness.caches.open(SHELL_CACHE);
  const originalShell = await (await shell.match("./")).text();
  const privacyRequest = {
    method: "GET",
    mode: "navigate",
    url: `${ORIGIN}/fitcoach-founder-test/legal/privacy.html`,
    headers: new Headers(),
    toString() { return this.url; },
  };
  await harness.beginFetch(privacyRequest).complete();
  assert.equal(await (await shell.match("./")).text(), originalShell);
  assert.equal(await (await shell.match(privacyRequest)).text(), "online");
});

test("failed navigation responses never replace the known-good offline shell", async () => {
  const harness = createHarness({ fetchImpl: async () => new Response("temporary failure", { status: 503 }) });
  await harness.dispatchLifecycle("install");
  const shell = await harness.caches.open(SHELL_CACHE);
  const originalShell = await (await shell.match("./")).text();
  const rootRequest = {
    method: "GET",
    mode: "navigate",
    url: `${ORIGIN}/fitcoach-founder-test/`,
    headers: new Headers(),
    toString() { return this.url; },
  };
  const response = await harness.beginFetch(rootRequest).complete();
  assert.equal(response.status, 503);
  assert.equal(await (await shell.match("./")).text(), originalShell);
});

test("the precached legal stylesheet remains available offline", async () => {
  const harness = createHarness({ fetchImpl: async () => { throw new Error("offline"); } });
  await harness.dispatchLifecycle("install");
  const request = new Request(`${ORIGIN}/fitcoach-founder-test/legal/legal.css`);
  const response = await harness.beginFetch(request).complete();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "precache");
});

test("motion, Range, and cache-write failures never break a successful network response", async () => {
  const harness = createHarness();
  const media = await harness.caches.open(MEDIA_CACHE);
  media.failPut = true;
  const online = await harness.beginFetch(posterRequest(1)).complete();
  assert.equal(online.status, 200);
  assert.equal((await media.keys()).length, 0);

  const motion = new Request(`${ORIGIN}/fitcoach-founder-test/v040/assets/exercises/motion/squat-motion-v1.mp4`);
  const range = new Request(`${ORIGIN}/fitcoach-founder-test/v040/assets/exercises/generated/range.png`, {
    headers: { range: "bytes=0-100" },
  });
  assert.equal((await harness.beginFetch(motion).complete()).status, 200);
  assert.equal((await harness.beginFetch(range).complete()).status, 200);
  assert.equal(harness.fetchCalls.at(-1).options.cache, "no-store");
  assert.equal(harness.fetchCalls.at(-2).options.cache, "no-store");
  assert.equal((await media.keys()).length, 0);
});
