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
  './index.html',        // на случай если файл переименован
  './manifest.json',
  './icon-192.png',
  './icon-256.png',
  './icon-384.png',
  './icon-512.png'
];

// ============================================================
// INSTALL — кэшируем все статические ресурсы
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Установка service worker');
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        console.log('[SW] Кэширую статические ресурсы');
        // Пытаемся закэшировать всё, игнорируем ошибки для отдельных файлов
        return Promise.all(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => {
              console.warn('[SW] Не удалось закэшировать:', url, err);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Установка завершена');
        return self.skipWaiting(); // активируем сразу
      })
  );
});

// ============================================================
// ACTIVATE — удаляем старые версии кэша
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Активация');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('mine2026-') && name !== CACHE_STATIC && name !== CACHE_RUNTIME)
            .map(name => {
              console.log('[SW] Удаляю старый кэш:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Активация завершена');
        return self.clients.claim(); // берём контроль над всеми вкладками
      })
  );
});

// ============================================================
// FETCH — стратегия кэширования
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Игнорируем не-GET запросы
  if (request.method !== 'GET') return;

  // Игнорируем chrome-extension и другие не HTTP схемы
  if (!url.protocol.startsWith('http')) return;

  // Игнорируем Google Fonts CDN (пусть грузятся из сети, а потом кэшируются)
  // (мы их всё равно кэшируем ниже через runtime)

  // Стратегия: Cache First для HTML и своих ресурсов
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          if (cached) {
            // Есть в кэше — отдаём сразу, параллельно обновляем в фоне
            fetch(request)
              .then(response => {
                if (response && response.status === 200) {
                  caches.open(CACHE_STATIC).then(cache => {
                    cache.put(request, response.clone());
                  });
                }
              })
              .catch(() => {}); // игнорируем ошибки сети
            return cached;
          }

          // Нет в кэше — грузим из сети и кэшируем
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
              // Сеть недоступна и нет в кэше
              if (request.destination === 'document') {
                // Для HTML — отдаём сохранённый index/mine
                return caches.match('./mine.html')
                  .then(r => r || caches.match('./index.html'));
              }
              return new Response('Офлайн', { status: 503 });
            });
        })
    );
    return;
  }

  // Для сторонних ресурсов (Google Fonts и т.п.) — Cache First с runtime-кэшем
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
          .catch(() => {
            // Офлайн и не в кэше — ничего не отдаём
            return new Response('', { status: 503 });
          });
      })
  );
});

// ============================================================
// MESSAGE — обмен с основной страницей
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CACHE_URLS') {
    // Принудительно кэшируем список URL
    const urls = event.data.urls || [];
    event.waitUntil(
      caches.open(CACHE_STATIC).then(cache => {
        return Promise.all(
          urls.map(url => cache.add(url).catch(() => {}))
        );
      })
    );
  }
});

console.log('[SW] Скрипт загружен');
