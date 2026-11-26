// Service Worker for Jadwal MOD PWA (Always Live / No Stale Cache)
const CACHE_NAME = 'jadwal-mod-v1';
const STATIC_ASSETS = [];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Always fetch live from network directly
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
