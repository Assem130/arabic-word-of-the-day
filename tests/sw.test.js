const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function loadFetchHandler({ cached, network }) {
    const handlers = {};
    const cache = {
        match: async () => cached,
        put: async () => {}
    };
    const sandbox = {
        URL,
        self: {
            location: { origin: "https://example.test" },
            addEventListener(type, handler) { handlers[type] = handler; },
            skipWaiting: async () => {},
            clients: { claim: async () => {} }
        },
        caches: {
            open: async () => cache,
            match: cache.match,
            keys: async () => [],
            delete: async () => true
        },
        fetch: async () => network
    };
    vm.runInNewContext(fs.readFileSync("sw.js", "utf8"), sandbox);
    return handlers.fetch;
}

function loadServiceWorker({ cacheKeys = [] } = {}) {
    const handlers = {};
    const deleted = [];
    let precached = [];
    let skipWaitingCalls = 0;
    const cache = {
        addAll: async (assets) => { precached = assets; },
        match: async () => undefined,
        put: async () => {}
    };
    const sandbox = {
        URL,
        self: {
            location: { origin: "https://example.test" },
            addEventListener(type, handler) { handlers[type] = handler; },
            skipWaiting: async () => { skipWaitingCalls += 1; },
            clients: { claim: async () => {} }
        },
        caches: {
            open: async () => cache,
            match: cache.match,
            keys: async () => cacheKeys,
            delete: async (key) => { deleted.push(key); return true; }
        },
        fetch: async () => ({ ok: true, clone() { return this; } })
    };
    vm.runInNewContext(fs.readFileSync("sw.js", "utf8"), sandbox);
    return { handlers, deleted, getPrecached: () => precached, getSkipWaitingCalls: () => skipWaitingCalls };
}

test("same-origin app assets use the current network version", async () => {
    const stale = { body: "stale" };
    const fresh = { body: "fresh", ok: true, type: "basic", clone() { return this; } };
    const handleFetch = loadFetchHandler({ cached: stale, network: fresh });
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

test("the offline shell pre-caches every same-origin page script", () => {
    const swSource = fs.readFileSync("sw.js", "utf8");
    const assetsBody = swSource.match(/const STATIC_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1] || "";
    const staticAssets = [...assetsBody.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
    const scriptSources = ["index.html", "word.html"].flatMap((page) => {
        const html = fs.readFileSync(page, "utf8");
        return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
            .map((match) => match[1])
            .filter((src) => !/^(?:[a-z]+:)?\/\//i.test(src))
            .map((src) => `./${src.replace(/^\.\//, "")}`);
    });

    for (const source of new Set(scriptSources)) {
        assert.ok(staticAssets.includes(source), `${source} must be in STATIC_ASSETS`);
    }
    assert.ok(staticAssets.includes("./privacy.html"), "privacy.html must be in STATIC_ASSETS");
});

test("install invokes the complete offline precache and activates the worker", async () => {
    const worker = loadServiceWorker();
    let install;
    worker.handlers.install({ waitUntil(promise) { install = promise; } });
    await install;

    const swSource = fs.readFileSync("sw.js", "utf8");
    const expectedAssets = [...(swSource.match(/const STATIC_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1] || "").matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
    assert.deepEqual(Array.from(worker.getPrecached()), expectedAssets, "install must pass the full STATIC_ASSETS list to cache.addAll");
    assert.equal(worker.getSkipWaitingCalls(), 1, "install must activate the new worker immediately");
});

test("activation removes only obsolete Kalimat caches", async () => {
    const swSource = fs.readFileSync("sw.js", "utf8");
    const activeCache = swSource.match(/const STATIC_CACHE_NAME\s*=\s*["']([^"']+)["']/)?.[1];
    assert.ok(activeCache, "service worker must declare an active static cache");
    const worker = loadServiceWorker({
        cacheKeys: [activeCache, "kalimat-static-old", "kalimat-audio-v1", "other-app-v1"]
    });
    let activation;
    worker.handlers.activate({ waitUntil(promise) { activation = promise; } });
    await activation;

    assert.deepEqual(worker.deleted, ["kalimat-static-old", "kalimat-audio-v1"]);
});
