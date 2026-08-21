// Service Worker for Kalimat (Offline PWA)
const STATIC_CACHE_NAME = "kalimat-static-v1.7";
const AUDIO_CACHE_NAME = "kalimat-audio-v1";
const STATIC_ASSETS = [
    "./",
    "./index.html",
    "./word.html",
    "./privacy.html",
    "./style.css",
    "./app-core.js",
    "./web-ui.js",
    "./revamp.js",
    "./words.js",
    "./app.js",
    "./extension/shared/review-policy.js",
    "./extension/shared/speech.js",
    "./manifest.webmanifest",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png"
];
const AUDIO_CACHE_MAX_ENTRIES = 60;
const CANONICAL_PAGES = new Set(["/", "/index.html", "/word.html"]);

function isAudioRequest(request, url) {
    const pathname = url.pathname || "";
    const href = request.url || "";
    const accept = (request.headers && typeof request.headers.get === "function") ? (request.headers.get("accept") || "") : "";
    return (
        /\.(mp3|ogg|aac|wav|m4a)($|\?)/i.test(pathname) ||
        /\.(mp3|ogg|aac|wav|m4a)($|\?)/i.test(href) ||
        pathname.includes("/assets/audio/") ||
        href.includes("/assets/audio/") ||
        accept.includes("audio/")
    );
}

async function trimAudioCache(cache) {
    const keys = await cache.keys();
    while (keys.length > AUDIO_CACHE_MAX_ENTRIES) {
        const oldest = keys.shift();
        await cache.delete(oldest);
    }
}

// Cache key without query string, so deep links map onto canonical pages.
function canonicalUrlFor(url) {
    return url.origin + url.pathname;
}


self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key.startsWith("kalimat-") && key !== STATIC_CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Audio Assets: Immutable Cache-First strategy (on-demand caching, NO background revalidation)
    if (isAudioRequest(request, url)) {
        event.respondWith(
            caches.open(AUDIO_CACHE_NAME).then(cache => {
                return cache.match(request).then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(request).then(networkResponse => {
                        if (networkResponse && (networkResponse.ok || networkResponse.type === "opaque")) {
                            const clone = networkResponse.clone();
                            cache.put(request, clone);
                            event.waitUntil(trimAudioCache(cache));
                        }
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // HTML Navigation: Network-first with fallback to cache.
    // Only canonical pages are cached so ?id/?date deep links don't pile up entries.
    if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
        const isCanonical = CANONICAL_PAGES.has(url.pathname);
        event.respondWith(
            fetch(request).then(networkResponse => {
                if (networkResponse && networkResponse.ok && isCanonical) {
                    const clone = networkResponse.clone();
                    caches.open(STATIC_CACHE_NAME).then(cache => cache.put(new Request(canonicalUrlFor(url)), clone));
                }
                return networkResponse;
            }).catch(() => {
                return caches.match(request)
                    .then(cached => cached || caches.match(canonicalUrlFor(url)))
                    .then(cached => cached || caches.match("./word.html"))
                    .then(cached => cached || caches.match("./index.html"));
            })
        );
        return;
    }

    // App shell: Stale-While-Revalidate. Cache serves instantly; the network
    // response refreshes it in the background. Cache versioning (bumped with
    // every deploy) keeps HTML/CSS/JS from drifting apart.
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.open(STATIC_CACHE_NAME).then(cache => {
                return cache.match(request).then(cachedResponse => {
                    const networkFetch = fetch(request).then(networkResponse => {
                        if (networkResponse && networkResponse.ok) {
                            cache.put(request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => cachedResponse);
                    return cachedResponse || networkFetch;
                });
            })
        );
        return;
    }

    // External fonts: Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            if (cachedResponse) {
                // Background revalidation
                fetch(request).then(networkResponse => {
                    if (networkResponse && (networkResponse.ok || networkResponse.type === "opaque")) {
                        caches.open(STATIC_CACHE_NAME).then(cache => cache.put(request, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(request).then(networkResponse => {
                if (networkResponse && (networkResponse.ok || networkResponse.type === "opaque")) {
                    const clone = networkResponse.clone();
                    caches.open(STATIC_CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return networkResponse;
            });
        })
    );
});
