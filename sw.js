// Service Worker for Kalimat (Offline PWA)
const STATIC_CACHE_NAME = "kalimat-static-v1.4";
const AUDIO_CACHE_NAME = "kalimat-audio-v1";
const STATIC_ASSETS = [
    "./",
    "./index.html",
    "./word.html",
    "./style.css",
    "./revamp.css",
    "./app-core.js",
    "./revamp.js",
    "./words.js",
    "./app.js",
    "./manifest.webmanifest",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png"
];

function isAudioRequest(request, url) {
    const pathname = url.pathname || "";
    const href = request.url || "";
    const accept = (request.headers && typeof request.headers.get === "function") ? (request.headers.get("accept") || "") : "";
    return (
        /\.(mp3|ogg|aac|wav|m4a)($|\?)/i.test(pathname) ||
        /\.(mp3|ogg|aac|wav|m4a)($|\?)/i.test(href) ||
        pathname.includes("/assets/audio/") ||
        href.includes("/assets/audio/") ||
        href.includes("upload.wikimedia.org") ||
        accept.includes("audio/")
    );
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
                    .filter(key => key !== STATIC_CACHE_NAME && key !== AUDIO_CACHE_NAME)
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
                        }
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // HTML Navigation: Network-first with fallback to cache
    if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
        event.respondWith(
            fetch(request).then(networkResponse => {
                if (networkResponse && networkResponse.ok) {
                    const clone = networkResponse.clone();
                    caches.open(STATIC_CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return networkResponse;
            }).catch(() => {
                return caches.match(request).then(cached => {
                    return cached || caches.match("./word.html") || caches.match("./index.html");
                });
            })
        );
        return;
    }

    // App shell: prefer the deployed version so HTML, CSS, and JS cannot drift apart.
    if (url.origin === self.location.origin) {
        event.respondWith(
            fetch(request).then(networkResponse => {
                if (networkResponse && networkResponse.ok) {
                    const clone = networkResponse.clone();
                    caches.open(STATIC_CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return networkResponse;
            }).catch(() => caches.match(request))
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
