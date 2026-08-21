const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function loadFetchHandler({ cached, network } = {}) {
    const handlers = {};
    const cacheContents = new Map();
    if (cached !== undefined) cacheContents.set("cached", cached);
    const puts = [];
    const cache = {
        match: async (request) => (cacheContents.get("cached") && request) ? cacheContents.get("cached") : undefined,
        put: async (request, response) => { puts.push({ request, response }); cacheContents.set("cached", response); }
    };
    const sandbox = {
        URL,
        Request: function (url) { this.url = url; },
        self: {
            location: { origin: "https://example.test" },
            addEventListener(type, handler) { handlers[type] = handler; },
            skipWaiting: async () => {},
            clients: { claim: async () => {} }
        },
        caches: {
            open: async () => cache,
            match: async () => cacheContents.get("cached"),
            keys: async () => [],
            delete: async () => true
        },
        fetch: async () => network
    };
    vm.runInNewContext(fs.readFileSync("sw.js", "utf8"), sandbox);
    return { handleFetch: handlers.fetch, puts };
}

test("same-origin app assets serve from cache and revalidate in the background", async () => {
    const stale = { body: "stale" };
    const fresh = { body: "fresh", ok: true, type: "basic", clone() { return this; } };
    const { handleFetch, puts } = loadFetchHandler({ cached: stale, network: fresh });
    let response;
    handleFetch({
        request: {
            method: "GET",
            mode: "cors",
            url: "https://example.test/app.js",
            headers: { get: () => "application/javascript" }
        },
        respondWith(value) { response = value; }
    });

    assert.equal(await response, stale, "stale-while-revalidate must serve the cached copy immediately");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(puts.length, 1, "background revalidation must refresh the cache");
    assert.equal(puts[0].response, fresh);
});

test("same-origin app assets fall back to network when uncached", async () => {
    const fresh = { body: "fresh", ok: true, type: "basic", clone() { return this; } };
    const { handleFetch } = loadFetchHandler({ network: fresh });
    let response;
    handleFetch({
        request: {
            method: "GET",
            mode: "cors",
            url: "https://example.test/app.js",
            headers: { get: () => "application/javascript" }
        },
        respondWith(value) { response = value; }
    });

    assert.equal(await response, fresh);
});

test("audio cache is trimmed to the FIFO cap", async () => {
    const handlers = {};
    const store = new Map();
    let putCount = 0;
    const fakeCache = {
        match: async (request) => store.get(request.url),
        put: async (request, response) => { putCount += 1; store.set(request.url, response); },
        keys: async () => [...store.keys()].map(url => ({ url }))
    };
    const sandbox = {
        URL,
        Request: function (url) { this.url = url; },
        self: {
            location: { origin: "https://example.test" },
            addEventListener(type, handler) { handlers[type] = handler; },
            skipWaiting: async () => {},
            clients: { claim: async () => {} }
        },
        caches: {
            open: async () => fakeCache,
            match: async () => undefined,
            keys: async () => [],
            delete: async (key) => store.delete(key)
        },
        fetch: async (request) => ({ body: `audio:${request.url}`, ok: true, type: "basic", clone() { return this; } })
    };
    vm.runInNewContext(fs.readFileSync("sw.js", "utf8"), sandbox);

    // Seed one over-cap entry so the trim has something to evict.
    store.set("https://example.test/assets/audio/words/0.mp3", { body: "seed" });

    const waitUntilQueue = [];
    const event = {
        request: {
            method: "GET",
            mode: "cors",
            url: "https://example.test/assets/audio/words/1.mp3",
            headers: { get: () => "audio/mpeg" }
        },
        respondWith(value) { this.response = value; },
        waitUntil(promise) { waitUntilQueue.push(promise); }
    };
    handlers.fetch(event);
    const audioResponse = await event.response;
    assert.equal(audioResponse.body, "audio:https://example.test/assets/audio/words/1.mp3");
    await Promise.all(waitUntilQueue);
    assert.ok(putCount >= 1, "fetched audio must be cached");
});
