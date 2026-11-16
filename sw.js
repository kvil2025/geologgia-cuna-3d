const CACHE_NAME = 'geologgia-cuna-v1.4.0';
const ASSETS = [
  './',
  './index.html',
  './manual',
  './manual.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './css/fonts.css',
  './css/app.css?v=1.4.0',
  './js/vendor/three.min.js',
  './js/wedge-engine.js',
  './js/viewer3d.js?v=1.4.0',
  './js/stereonet.js',
  './js/app.js?v=1.4.0'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
