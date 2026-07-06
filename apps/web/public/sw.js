/*
 * ALSAVI — minimal app-shell service worker (TASK_015).
 *
 * SCOPE, DELIBERATELY MINIMAL:
 *  - Caches ONLY the static app shell (HTML shell, JS/CSS bundles, icons,
 *    manifest) so the installed PWA can cold-start offline after the first
 *    online load.
 *  - Does NOT cache user data, IndexedDB, or any API/business logic. All
 *    learning data lives in IndexedDB via the Engine's DexieStore and is the
 *    single source of truth; the service worker never becomes a second,
 *    undocumented state store. IndexedDB is not even reachable from here.
 *  - No background sync, no push — out of scope for TASK_015.
 *
 * Bump CACHE_VERSION to invalidate the old shell cache on the next activation.
 */
const CACHE_VERSION = 'alsavi-shell-v1';

self.addEventListener('install', (event) => {
  // Take over as soon as the new worker is ready.
  self.skipWaiting();
  // Warm the navigation fallback (the app shell) if reachable.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.add('/').catch(() => undefined))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only ever handle same-origin GETs. Never touch POST/data or cross-origin.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to the cached shell for offline start.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          return (await cache.match('/')) || (await cache.match(request)) || Response.error();
        }
      })()
    );
    return;
  }

  // Static assets: stale-while-revalidate (serve cache, refresh in background).
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => undefined);
      return cached || (await network) || Response.error();
    })()
  );
});
