// オフラインでも開けるようにするための Service Worker。
// アプリ本体だけをキャッシュする（セーブデータは localStorage にあり、ここでは扱わない）。
// 常にネットワークを優先し、つながらないときだけキャッシュを使うので、更新はすぐ反映される。

const CACHE = "manabi-app-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) {
            if (key !== CACHE) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
    event.respondWith((async () => {
        try {
            const response = await fetch(event.request);
            if (response.ok) {
                const cache = await caches.open(CACHE);
                cache.put(event.request, response.clone());
            }
            return response;
        } catch (error) {
            const cached = await caches.match(event.request, { ignoreSearch: true });
            if (cached) return cached;
            throw error;
        }
    })());
});
