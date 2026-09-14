// ============================================================
// Service Worker для игры "Шахта 2026"
// Обеспечивает полный офлайн-режим после первого запуска
// ============================================================

const CACHE_VERSION = 'mine2026-v2';
const CACHE_STATIC = CACHE_VERSION + '-static';
const CACHE_RUNTIME = CACHE_VERSION + '-runtime';

// Файлы, которые кэшируются при первой установке
const STATIC_ASSETS = [
  './',
  './mine.html',
  './manifest.json',
  './icon-192.png',
  './icon-256.png',
  './icon-512.png'
];

// ============================================================
// INSTALL — кэшируем все статические ресурсы
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Установка');
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        return Promise.all(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => {
              console.warn('[SW] Не удалось закэшировать:', url);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE — удаляем старые версии кэша
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Активация');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(name => name.startsWith('mine2026-') && name !== CACHE_STATIC && name !== CACHE_RUNTIME)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — стратегия кэширования
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Свои ресурсы — Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          if (cached) {
            fetch(request).then(response => {
              if (response && response.status === 200) {
                caches.open(CACHE_STATIC).then(cache => {
                  cache.put(request, response.clone());
                });
              }
            }).catch(() => {});
            return cached;
          }

          return fetch(request)
            .then(response => {
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              const responseClone = response.clone();
              caches.open(CACHE_STATIC).then(cache => {
                cache.put(request, responseClone);
              });
              return response;
            })
            .catch(() => {
              if (request.destination === 'document') {
                return caches.match('./mine.html');
              }
              return new Response('Офлайн', { status: 503 });
            });
        })
    );
    return;
  }

  // Внешние ресурсы (шрифты Google) — Cache First с runtime
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;
        return fetch(request)
          .then(response => {
            if (!response || response.status !== 200) return response;
            const responseClone = response.clone();
            caches.open(CACHE_RUNTIME).then(cache => {
              cache.put(request, responseClone);
            });
            return response;
          })
          .catch(() => new Response('', { status: 503 }));
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Скрипт загружен');
