import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { stampPrecacheManifest, stampServiceWorker } from '../build/serviceWorkerVersion';

/**
 * Behaviour of the app-shell service worker (TASK_033): offline start,
 * update and cache pruning — `public/sw.js` itself, stamped exactly as the
 * build stamps it, run in a sandbox with fake `caches` / `fetch`. Complements
 * the source invariants in `sw-version.test.ts`.
 */

const BASE = 'https://example.test/ALSAVI/';
const SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../public/sw.js'), 'utf8');

/** Minimal Cache Storage: caches by name, entries keyed by absolute URL. */
class FakeCacheStorage {
  readonly stores = new Map<string, Map<string, Response>>();

  constructor(private readonly net: FakeNetwork) {}

  async open(name: string) {
    let store = this.stores.get(name);
    if (!store) this.stores.set(name, (store = new Map()));
    const net = this.net;
    return {
      async addAll(requests: Array<string | { url: string; cache?: string }>) {
        // All-or-nothing, like the real addAll.
        const responses = await Promise.all(requests.map((r) => net.fetch(r)));
        if (responses.some((r) => !r.ok)) throw new TypeError('addAll: bad response');
        requests.forEach((r, i) => store!.set(urlOf(r), responses[i]!));
      },
      async match(key: string | { url: string }) {
        return store!.get(urlOf(key))?.clone();
      },
      async put(key: string | { url: string }, response: Response) {
        store!.set(urlOf(key), response);
      },
    };
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name: string) {
    return this.stores.delete(name);
  }
}

function urlOf(r: string | { url: string }): string {
  return new URL(typeof r === 'string' ? r : r.url, BASE).href;
}

/**
 * The network plus the browser's HTTP cache in front of it: a request
 * without `cache: 'reload'` may get `stale` instead of the current file
 * (GitHub Pages serves index.html with max-age=600).
 */
class FakeNetwork {
  online = true;
  files = new Map<string, string>();
  stale = new Map<string, string>();
  requests: Array<{ url: string; cache: string }> = [];

  fetch = async (input: string | { url: string; cache?: string }): Promise<Response> => {
    const url = urlOf(input);
    const cache = typeof input === 'string' ? 'default' : (input.cache ?? 'default');
    this.requests.push({ url, cache });
    if (!this.online) throw new TypeError('Failed to fetch');
    const body = cache !== 'reload' && this.stale.has(url) ? this.stale.get(url)! : this.files.get(url);
    return body === undefined ? new Response('not found', { status: 404 }) : new Response(body, { status: 200 });
  };

  /** Publish a build: index.html and its bundle. */
  deploy(version: string) {
    this.files.clear();
    this.files.set(BASE, `<index ${version}>`);
    this.files.set(new URL(`assets/index-${version}.js`, BASE).href, `bundle ${version}`);
  }
}

type Listener = (event: Record<string, unknown>) => void;

/** One installed service-worker script (one build), with its event listeners. */
function loadWorker(version: string, caches: FakeCacheStorage, net: FakeNetwork) {
  const listeners = new Map<string, Listener>();
  const calls: string[] = [];
  const source = stampPrecacheManifest(stampServiceWorker(SOURCE, version), [`./assets/index-${version}.js`]);
  const self = {
    location: { origin: new URL(BASE).origin },
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: async () => void calls.push('skipWaiting'),
    clients: { claim: async () => void calls.push('claim') },
  };
  // A `Request` that resolves relative URLs against the worker's scope, like a browser does.
  class ScopedRequest {
    readonly url: string;
    readonly cache: string;
    constructor(url: string, init: { cache?: string } = {}) {
      this.url = new URL(url, BASE).href;
      this.cache = init.cache ?? 'default';
    }
  }
  runInNewContext(source, { self, caches, fetch: net.fetch, Request: ScopedRequest, Response, URL });

  const lifecycle = async (type: 'install' | 'activate') => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  };

  const request = async (path: string, mode: 'navigate' | 'no-cors' = 'no-cors') => {
    let response: Promise<Response> | undefined;
    const url = new URL(path, BASE).href;
    listeners.get('fetch')!({
      request: { method: 'GET', url, mode },
      respondWith: (p: Promise<Response>) => (response = p),
    });
    if (!response) return undefined; // not handled: the browser fetches it itself
    const r = await response;
    return r.type === 'error' ? 'network-error' : await r.text();
  };

  return { calls, install: () => lifecycle('install'), activate: () => lifecycle('activate'), request };
}

function setup() {
  const net = new FakeNetwork();
  const caches = new FakeCacheStorage(net);
  return { net, caches };
}

describe('service worker — install and offline start', () => {
  it('precaches the navigation document and every bundle, bypassing the HTTP cache, then takes over', async () => {
    const { net, caches } = setup();
    net.deploy('aaaaaaaaaaaa');
    const sw = loadWorker('aaaaaaaaaaaa', caches, net);
    await sw.install();
    expect(net.requests).toEqual([
      { url: BASE, cache: 'reload' },
      { url: `${BASE}assets/index-aaaaaaaaaaaa.js`, cache: 'reload' },
    ]);
    expect([...caches.stores.keys()]).toEqual(['alsavi-shell-aaaaaaaaaaaa']);
    expect(sw.calls).toEqual(['skipWaiting']);
  });

  it('an offline start opens the cached app shell and its bundle', async () => {
    const { net, caches } = setup();
    net.deploy('aaaaaaaaaaaa');
    const sw = loadWorker('aaaaaaaaaaaa', caches, net);
    await sw.install();
    await sw.activate();
    net.online = false;
    expect(await sw.request('./', 'navigate')).toBe('<index aaaaaaaaaaaa>');
    expect(await sw.request('./#/stats', 'navigate')).toBe('<index aaaaaaaaaaaa>');
    expect(await sw.request('./assets/index-aaaaaaaaaaaa.js')).toBe('bundle aaaaaaaaaaaa');
  });

  it('online, navigation is network-first: a new deploy is served without clearing anything', async () => {
    const { net, caches } = setup();
    net.deploy('aaaaaaaaaaaa');
    const sw = loadWorker('aaaaaaaaaaaa', caches, net);
    await sw.install();
    await sw.activate();
    net.deploy('bbbbbbbbbbbb');
    expect(await sw.request('./', 'navigate')).toBe('<index bbbbbbbbbbbb>');
    // The new bundle is fetched and kept, so the new version also works offline next time.
    expect(await sw.request('./assets/index-bbbbbbbbbbbb.js')).toBe('bundle bbbbbbbbbbbb');
    net.online = false;
    expect(await sw.request('./assets/index-bbbbbbbbbbbb.js')).toBe('bundle bbbbbbbbbbbb');
  });

  it('a file neither cached nor reachable fails as a network error (no fake response)', async () => {
    const { net, caches } = setup();
    net.deploy('aaaaaaaaaaaa');
    const sw = loadWorker('aaaaaaaaaaaa', caches, net);
    await sw.install();
    net.online = false;
    expect(await sw.request('./assets/missing.js')).toBe('network-error');
  });

  it('leaves other origins to the browser', async () => {
    const { net, caches } = setup();
    const sw = loadWorker('aaaaaaaaaaaa', caches, net);
    expect(await sw.request('https://cdn.example.org/x.js')).toBeUndefined();
  });
});

describe('service worker — update to a new deploy', () => {
  it('the new worker caches the NEW index.html even while the HTTP cache still holds the old one', async () => {
    const { net, caches } = setup();
    net.deploy('aaaaaaaaaaaa');
    const v1 = loadWorker('aaaaaaaaaaaa', caches, net);
    await v1.install();
    await v1.activate();

    // Deploy v2 minutes after the user loaded v1: the browser HTTP cache still has v1's index.html.
    net.deploy('bbbbbbbbbbbb');
    net.stale.set(BASE, '<index aaaaaaaaaaaa>');
    const v2 = loadWorker('bbbbbbbbbbbb', caches, net);
    await v2.install();
    await v2.activate();

    // Only the new shell cache is left …
    expect([...caches.stores.keys()]).toEqual(['alsavi-shell-bbbbbbbbbbbb']);
    // … and an offline start gets an index that matches the cached bundle — no blank screen.
    net.online = false;
    expect(await v2.request('./', 'navigate')).toBe('<index bbbbbbbbbbbb>');
    expect(await v2.request('./assets/index-bbbbbbbbbbbb.js')).toBe('bundle bbbbbbbbbbbb');
  });

  it('a failed install keeps the previous version working (old cache untouched, no takeover)', async () => {
    const { net, caches } = setup();
    net.deploy('aaaaaaaaaaaa');
    const v1 = loadWorker('aaaaaaaaaaaa', caches, net);
    await v1.install();
    await v1.activate();

    net.deploy('bbbbbbbbbbbb');
    net.files.delete(`${BASE}assets/index-bbbbbbbbbbbb.js`); // a bundle is missing mid-deploy
    const v2 = loadWorker('bbbbbbbbbbbb', caches, net);
    await expect(v2.install()).rejects.toThrow();
    expect(v2.calls).not.toContain('skipWaiting');

    net.online = false;
    expect(await v1.request('./', 'navigate')).toBe('<index aaaaaaaaaaaa>');
    expect(await v1.request('./assets/index-aaaaaaaaaaaa.js')).toBe('bundle aaaaaaaaaaaa');
  });

  it('activate prunes only older ALSAVI shell caches and claims open pages', async () => {
    const { net, caches } = setup();
    net.deploy('bbbbbbbbbbbb');
    await caches.open('alsavi-shell-aaaaaaaaaaaa');
    await caches.open('some-other-cache');
    const sw = loadWorker('bbbbbbbbbbbb', caches, net);
    await sw.install();
    await sw.activate();
    expect([...caches.stores.keys()].sort()).toEqual(['alsavi-shell-bbbbbbbbbbbb', 'some-other-cache']);
    expect(sw.calls).toEqual(['skipWaiting', 'claim']);
  });
});
