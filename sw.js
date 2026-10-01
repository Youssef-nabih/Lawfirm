// Only the public offline screen and branding are cached, never office records,
// attachments, authenticated responses, API requests, or application scripts.
const OFFLINE_CACHE = 'lawfirm-offline-v1';
const offlineURL = new URL('./offline.html', self.location.href).href;
const appScope = new URL('./', self.location.href).href;
self.addEventListener('install', event => {
    event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.addAll([
        offlineURL, new URL('./icons/icon-192.png', self.location.href).href
    ])));
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) {
            if (key.startsWith('lawfirm-offline-') && key !== OFFLINE_CACHE) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});
self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || request.mode !== 'navigate' || !request.url.startsWith(appScope)) return;
    event.respondWith(fetch(request).catch(async () => {
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match(offlineURL)) || Response.error();
    }));
});
