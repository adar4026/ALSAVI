/*
 * ALSAVI — app-shell service worker (TASK_015; cache versioning hardened in
 * TASK_016; full app-shell precache in TASK_017/GitHub Pages deployment).
 *
 * SCOPE, DELIBERATELY MINIMAL:
 *  - Caches ONLY the static app shell: the navigation document, every
 *    content-hashed JS/CSS bundle, manifest.webmanifest, and the icons —
 *    precached eagerly at install (TASK_017) — plus stale-while-revalidate
 *    as a runtime safety net for anything not in that list. This gives a
 *    fully-offline cold start after the very first install, not just after a
 *    prior online session has happened to populate the cache.
 *  - Does NOT cache user data, IndexedDB, or any API/business logic. All
 *    learning data lives in IndexedDB via the Engine's DexieStore and is the
 *    single source of truth; the service worker never becomes a second,
 *    undocumented state store. IndexedDB is not even reachable from here.
 *  - No background sync, no push.
 *
 * PATHS ARE SCOPE-RELATIVE, NOT ORIGIN-ROOT: this worker may be registered
 * under a subpath (e.g. GitHub Pages project site '/ALSAVI/'), so the
 * navigation-document key uses './' (resolves against this script's own URL,
 * i.e. the registration scope) rather than a hardcoded '/' (which would
 * resolve to the origin root and silently miss the actual app shell).
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
 *
 * PRECACHE MANIFEST (TASK_017):
 *  - PRECACHE_MANIFEST is a JSON array of scope-relative asset URLs, stamped at
 *    build time the same way as CACHE_VERSION (see serviceWorkerVersion.ts,
 *    resolvePrecacheManifest/stampPrecacheManifest): the literal array below is
 *    the placeholder Vite replaces with the real, build-discovered list. In dev
 *    it stays as-is (a harmless single nonsense entry) since this worker never
 *    registers outside a production build.
 */
const SHELL_CACHE_PREFIX = 'alsavi-shell-';
const CACHE_VERSION = SHELL_CACHE_PREFIX + '__ALSAVI_SW_CACHE_VERSION__';
const PRECACHE_MANIFEST = ['__ALSAVI_SW_PRECACHE_MANIFEST__'];

self.addEventListener('install', (event) => {
  // Fully populate the new versioned cache BEFORE taking over: skipWaiting() is
  // called only after the app shell is cached, so a half-populated cache is
  // never activated. If any precache asset fails, addAll rejects install and
  // the old worker stays in control.
  //
  // `cache: 'reload'` (TASK_033): fetch straight from the network, bypassing
  // the browser's HTTP cache. GitHub Pages serves index.html with a 10-minute
  // max-age, so within minutes of a deploy a plain request could precache the
  // PREVIOUS index.html next to the NEW bundles — and once activate prunes the
  // old cache, an offline start would load an index pointing at bundles that
  // are no longer cached: a blank screen.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const shell = ['./', ...PRECACHE_MANIFEST];
      await cache.addAll(shell.map((url) => new Request(url, { cache: 'reload' })));
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
          return (await cache.match('./')) || (await cache.match(request)) || Response.error();
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
