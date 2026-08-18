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
