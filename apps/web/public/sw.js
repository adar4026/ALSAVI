/*
 * ALSAVI — minimal app-shell service worker (TASK_015; cache versioning
 * hardened in TASK_016).
 *
 * SCOPE, DELIBERATELY MINIMAL:
 *  - Caches ONLY the static app shell (the navigation document '/', and — lazily
 *    via stale-while-revalidate — the JS/CSS bundles, icons, manifest) so the
 *    installed PWA can cold-start offline after the first online load.
 *  - Does NOT cache user data, IndexedDB, or any API/business logic. All
 *    learning data lives in IndexedDB via the Engine's DexieStore and is the
 *    single source of truth; the service worker never becomes a second,
 *    undocumented state store. IndexedDB is not even reachable from here.
 *  - No background sync, no push.
 *
 * CACHE VERSIONING (TASK_016):
 *  - SHELL_CACHE_PREFIX is the SINGLE SOURCE OF TRUTH for the cache namespace
 *    this worker owns. It is reused BOTH to compose CACHE_VERSION and to filter
 *    caches on activate, so the worker only ever deletes its own shell caches
 *    and never touches caches outside the 'alsavi-shell-' namespace.
 *  - CACHE_VERSION is stamped at build time: a placeholder token (see the
 *    composition below) is replaced with the 12-char HEAD commit sha by
 *    `vite build` (see
 *    apps/web/build/serviceWorkerVersion.ts). Each build on a new commit gets a
 *    fresh cache; activate then prunes every older 'alsavi-shell-' cache. In dev
 *    the token is left as-is, but registerSW.ts registers this worker only in a
 *    production build, so it never runs there.
 */
const SHELL_CACHE_PREFIX = 'alsavi-shell-';
const CACHE_VERSION = SHELL_CACHE_PREFIX + '__ALSAVI_SW_CACHE_VERSION__';

self.addEventListener('install', (event) => {
  // Fully populate the new versioned cache BEFORE taking over: skipWaiting() is
  // called only after the app shell is cached, so a half-populated cache is
  // never activated. If the shell precache fails, install rejects and the old
  // worker stays in control.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.add('/');
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Prefix-scoped prune: delete ONLY our own shell caches from previous
      // builds. Caches outside the 'alsavi-shell-' namespace are never touched.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(SHELL_CACHE_PREFIX) && k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      );
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
