// ============================================================
// Service Worker для игры "Шахта 2026"
// Версия v3 — с поддержкой картинок руды
// ============================================================

const CACHE_VERSION = 'mine2026-v3';
const CACHE_STATIC = CACHE_VERSION + '-static';
const CACHE_RUNTIME = CACHE_VERSION + '-runtime';

const STATIC_ASSETS = [
  './',
  './mine.html',
  './manifest.json',
  './icon-192.png',
  './icon-256.png',
  './icon-512.png',
  './ores/copper.png',
  './ores/silver.png',
  './ores/gold.png',
  './ores/diamond.png',
  './ores/mithril.png',
  './ores/plasma.png'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Установка v3');
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return Promise.all(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(() => console.warn('[SW] Не закэшировано:', url))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Активация v3');
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames
        .filter(name => name.startsWith('mine2026-') && name !== CACHE_STATIC && name !== CACHE_RUNTIME)
        .map(name => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) {
          fetch(request).then(response => {
            if (response && response.status === 200) {
              caches.open(CACHE_STATIC).then(cache => cache.put(request, response.clone()));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(request).then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') return response;
          caches.open(CACHE_STATIC).then(cache => cache.put(request, response.clone()));
          return response;
        }).catch(() => {
          if (request.destination === 'document') return caches.match('./mine.html');
          return new Response('Офлайн', { status: 503 });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200) return response;
        caches.open(CACHE_RUNTIME).then(cache => cache.put(request, response.clone()));
        return response;
      }).catch(() => new Response('', { status: 503 }));
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

console.log('[SW] Готов, версия v3');
