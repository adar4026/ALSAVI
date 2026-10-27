import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { stampPrecacheManifest, stampServiceWorker } from '../build/serviceWorkerVersion';

/**
 * Review-reminder handlers of the real `public/sw.js` (TASK_034), run in a
 * sandbox: a push is always shown with the server's text, and a tap opens
 * the study session — focusing an open window (no second tab, no reload)
 * or starting the app at `#/review`.
 */

const SCOPE = 'https://adar4026.github.io/ALSAVI/';
const SOURCE = stampPrecacheManifest(
  stampServiceWorker(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../public/sw.js'), 'utf8'), 'aaaaaaaaaaaa'),
  []
);

type Listener = (event: Record<string, unknown>) => void;

function loadWorker(windows: Array<{ url: string }> = []) {
  const listeners = new Map<string, Listener>();
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const log: string[] = [];
  const clients = windows.map((w) => ({
    url: w.url,
    postMessage: (m: unknown) => void log.push(`message ${w.url} ${JSON.stringify(m)}`),
    focus: async () => void log.push(`focus ${w.url}`),
  }));
  const self = {
    location: { origin: new URL(SCOPE).origin },
    registration: {
      scope: SCOPE,
      showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }),
    },
    clients: {
      claim: async () => {},
      matchAll: async () => clients,
      openWindow: async (url: string) => void log.push(`open ${url}`),
    },
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: async () => {},
  };
  runInNewContext(SOURCE, { self, caches: {}, fetch: async () => new Response(''), Request, Response, URL });

  const dispatch = async (type: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  };
  const push = (payload: unknown) =>
    dispatch('push', { data: payload === undefined ? null : { json: () => (typeof payload === 'string' ? JSON.parse(payload) : payload) } });
  const click = (data: unknown) => {
    const notification = { data, closed: false, close() { this.closed = true; } };
    return dispatch('notificationclick', { notification }).then(() => notification);
  };
  return { shown, log, push, click };
}

describe('service worker — review reminder push', () => {
  it('shows the server-composed text with the shared review tag and the study-session address', async () => {
    const sw = loadWorker();
    await sw.push({
      v: 1,
      kind: 'daily',
      title: '🇪🇸 ALSAVI',
      body: 'Пора повторить слова!\nСегодня ждут 18 карточек.\nПродолжить повторение →',
      url: './#/review',
      tag: 'alsavi-review',
      count: 18,
    });
    expect(sw.shown).toEqual([
      {
        title: '🇪🇸 ALSAVI',
        options: {
          body: 'Пора повторить слова!\nСегодня ждут 18 карточек.\nПродолжить повторение →',
          tag: 'alsavi-review',
          icon: './icons/icon-192.png',
          lang: 'ru',
          data: { url: `${SCOPE}#/review` },
        },
      },
    ]);
  });

  it('always shows something, even for an empty or broken payload (iOS requires it)', async () => {
    const sw = loadWorker();
    await sw.push(undefined);
    await sw.push('not json');
    expect(sw.shown.map((n) => n.title)).toEqual(['ALSAVI', 'ALSAVI']);
    expect(sw.shown[0]!.options.tag).toBe('alsavi-review');
  });

  it('never opens an address outside the app from a notification', async () => {
    const sw = loadWorker();
    await sw.push({ title: 'x', body: 'y', url: 'https://evil.example/phish' });
    expect(sw.shown[0]!.options.data).toEqual({ url: `${SCOPE}#/review` });
  });
});

describe('service worker — tap on a reminder', () => {
  it('app already open: focuses that window and asks it to start the session — no new window', async () => {
    const sw = loadWorker([{ url: `${SCOPE}#/stats` }]);
    const n = await sw.click({ url: `${SCOPE}#/review` });
    expect(n.closed).toBe(true);
    expect(sw.log).toEqual([`message ${SCOPE}#/stats {"type":"alsavi:open-review"}`, `focus ${SCOPE}#/stats`]);
  });

  it('app not running: starts it on the study session', async () => {
    const sw = loadWorker([{ url: 'https://adar4026.github.io/OtherApp/' }]);
    await sw.click({ url: `${SCOPE}#/review` });
    expect(sw.log).toEqual([`open ${SCOPE}#/review`]);
  });

  it('a notification without data still leads to the study session', async () => {
    const sw = loadWorker();
    await sw.click(undefined);
    expect(sw.log).toEqual([`open ${SCOPE}#/review`]);
  });
});
