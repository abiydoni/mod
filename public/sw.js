// Service Worker for Jadwal MOD PWA
const CACHE_NAME = 'jadwal-mod-v1';

// Hanya cache icon, logo, dan manifest agar tidak ada cache kode/jadwal yang tertinggal
const STATIC_ASSETS = [
  '/logo.png',
  '/favicon.ico',
  '/favicon.svg',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip API requests from caching
  if (url.pathname.startsWith('/api/')) return;

  // Khusus logo & icons: layani dari cache jika ada
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // Semua halaman, CSS, JS, dan data: SELALU ambil live dari network
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
