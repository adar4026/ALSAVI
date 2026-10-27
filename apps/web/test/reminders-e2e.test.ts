process.env.TZ = 'Europe/Madrid'; // the device zone: local days of the engine and the snapshot agree

import { LearningEngine, MemoryStore, StudySession } from '@alsavi/engine';
import type { ReminderSettings } from '@alsavi/reminders';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../../push-worker/src/api.js';
import { runCron } from '../../push-worker/src/cron.js';
import { createPushServer, decrypt, makeEnv, makeUserAgent, type UserAgent } from '../../push-worker/test/helpers.js';
import { createReminderClient, REMINDER_KEYS, type KeyValue, type PermissionState, type PushPort } from '../src/reminder-client.js';
import { snapshotFromEngine } from '../src/reminder-snapshot.js';

/**
 * End to end, without a browser or Cloudflare: the real reminder client on
 * the "phone" (real LearningEngine + StudySession), the real push Worker API
 * and cron on node:sqlite D1, and a push service that decrypts every payload
 * like a browser. The app is then closed for days — reminders keep coming,
 * and every number in them equals what the study session would show.
 */

const TZ = 'Europe/Madrid';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.parse('2026-10-27T07:00:00Z'); // Tue 08:00 Madrid
const NINE = T0 + HOUR;
const ENDPOINT = 'https://web.push.apple.com/QGRldmljZS10b2tlbi1hbHNhdmk';
const ON: ReminderSettings = { enabled: true, time: '09:00', backlog: false, backlogThreshold: 30 };

function memoryKv(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}

function fakePush(ua: UserAgent) {
  let permission: PermissionState = 'default';
  let endpoint = ENDPOINT;
  let current: { endpoint: string; keys: { p256dh: string; auth: string } } | null = null;
  const port: PushPort = {
    permission: () => permission,
    requestPermission: async () => (permission = 'granted'),
    getSubscription: async () => current,
    subscribe: async (_key, { renew = false } = {}) => {
      if (renew) endpoint = `${ENDPOINT}-renewed`;
      current = { endpoint, keys: { p256dh: ua.p256dh, auth: ua.auth } };
      return current;
    },
  };
  return { port, deny: () => (permission = 'denied') };
}

let now = T0;
let env: Awaited<ReturnType<typeof makeEnv>>;
let ua: UserAgent;

async function setupPhone() {
  const store = new MemoryStore();
  const engine = new LearningEngine(store, { now: () => now });
  const kv = memoryKv();
  const push = fakePush(ua);
  const calls: string[] = [];
  const client = createReminderClient({
    kv,
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      calls.push(`${req.method} ${new URL(req.url).pathname}`);
      return handleApi(new Request(req, { headers: { ...Object.fromEntries(req.headers), Origin: 'https://adar4026.github.io' } }), env, { now });
    }) as typeof fetch,
    apiBase: 'https://alsavi-push.example.workers.dev/api/',
    push: push.port,
    getSnapshot: () => snapshotFromEngine(engine, { getNewCardsPerDay: async () => null }, now, TZ),
    timeZone: () => TZ,
    syncDelayMs: 0,
  });
  return { store, engine, client, kv, push, calls };
}

async function addWords(engine: LearningEngine, n: number) {
  for (let i = 0; i < n; i++) await engine.addNote({ front: `palabra ${i}`, back: `слово ${i}` });
}

/** What a fresh study session would show right now (no learn-ahead). */
async function sessionTotal(engine: LearningEngine) {
  return (await new StudySession(engine, { now: () => now, learnAheadMinutes: 0 }).overview()).total;
}

beforeEach(async () => {
  now = T0;
  env = await makeEnv();
  ua = await makeUserAgent();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('review reminders end to end', () => {
  it('enable → reminder at 09:00 with the live count → study → the app stays closed for days, numbers keep matching FSRS', async () => {
    const phone = await setupPhone();
    await addWords(phone.engine, 4);
    expect(await phone.client.enable(ON)).toEqual({ ok: true });
    expect(phone.client.permission()).toBe('granted');
    const push = createPushServer();

    now = NINE;
    await runCron(env, now, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(1);
    const first = await decrypt(ua, push.log[0]!.body);
    expect(first).toMatchObject({ kind: 'daily', count: 4, url: './#/review' });
    expect(first.body).toBe('Пора повторить слова!\nСегодня ждут 4 карточки.\nПродолжить повторение →');

    // 09:20 — tap, study everything until the session is empty, close the app
    now = NINE + 20 * MIN;
    const session = new StudySession(phone.engine, { now: () => now });
    for (let card = await session.nextCard(); card; card = await session.nextCard()) {
      await session.answer(card.id, 'good');
      now += 11 * MIN; // learning steps come back within the session
    }
    expect(await phone.client.syncNow({ keepalive: true })).toBe('synced');

    // the app is not opened again: the server alone decides, day after day
    const sent: number[] = [];
    for (let day = 1; day <= 12; day++) {
      now = NINE + day * DAY;
      const before = push.log.length;
      await runCron(env, now, { fetchImpl: push.fetchImpl });
      const expected = await sessionTotal(phone.engine);
      if (expected === 0) {
        expect(push.log.length).toBe(before);
      } else {
        expect(push.log.length).toBe(before + 1);
        const p = await decrypt(ua, push.log.at(-1)!.body);
        expect(p.count).toBe(expected);
        sent.push(expected);
      }
    }
    expect(sent.length).toBeGreaterThan(0); // the words did come due again
    expect(sent.length).toBeLessThan(12); // …but not every day: no reminder on empty days
  });

  it('a sync with nothing new sends nothing; a real change sends one request', async () => {
    const phone = await setupPhone();
    await addWords(phone.engine, 2);
    await phone.client.enable(ON);
    const syncs = () => phone.calls.filter((c) => c === 'PUT /api/sync').length;
    expect(syncs()).toBe(1);
    now += 5 * MIN; // time passes, nothing changed
    expect(await phone.client.syncNow()).toBe('unchanged');
    expect(syncs()).toBe(1);
    await addWords(phone.engine, 1);
    expect(await phone.client.syncNow()).toBe('synced');
    expect(syncs()).toBe(2);
  });

  it('turning reminders off stops them and removes the schedule from the server', async () => {
    const phone = await setupPhone();
    await addWords(phone.engine, 3);
    await phone.client.enable(ON);
    expect(await phone.client.disable()).toBe('synced');
    expect(env.DB.q('SELECT enabled, snapshot, next_daily_at FROM devices')).toEqual([{ enabled: 0, snapshot: null, next_daily_at: null }]);
    const push = createPushServer();
    now = NINE;
    await runCron(env, now, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(0);
    expect(JSON.parse(phone.kv.data.get(REMINDER_KEYS.settings)!)).toMatchObject({ enabled: false, time: '09:00' });
  });

  it('a subscription the push service reports invalid is renewed on the next app start', async () => {
    const phone = await setupPhone();
    await addWords(phone.engine, 2);
    await phone.client.enable(ON);
    const push = createPushServer(() => 410);
    now = NINE;
    await runCron(env, now, { fetchImpl: push.fetchImpl });
    expect(env.DB.q('SELECT COUNT(*) AS n FROM push_subscriptions')[0]).toEqual({ n: 0 });

    now = NINE + 2 * HOUR; // the learner opens the app
    await phone.client.repair();
    await vi.waitFor(async () => expect((await phone.client.status() as { subscribed: boolean }).subscribed).toBe(true));
    expect(env.DB.q('SELECT endpoint FROM push_subscriptions')).toEqual([{ endpoint: `${ENDPOINT}-renewed` }]);
    push.set(() => 201);
    now = NINE + DAY;
    await runCron(env, now, { fetchImpl: push.fetchImpl });
    expect(push.log.at(-1)!.url).toBe(`${ENDPOINT}-renewed`);
  });

  it('a denied permission leaves reminders off and says so', async () => {
    const phone = await setupPhone();
    phone.push.deny();
    expect(await phone.client.enable(ON)).toEqual({ ok: false, reason: 'denied' });
    expect(phone.client.settings().enabled).toBe(false);
    expect(env.DB.q('SELECT COUNT(*) AS n FROM devices')[0]).toEqual({ n: 0 });
  });

  it('offline: settings stay on the device and reach the server on the next sync', async () => {
    const phone = await setupPhone();
    await addWords(phone.engine, 1);
    await phone.client.enable(ON);
    // go offline: the API is unreachable
    const offline = createReminderClient({
      kv: phone.kv,
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof fetch,
      apiBase: 'https://alsavi-push.example.workers.dev/api/',
      push: null,
      getSnapshot: () => snapshotFromEngine(phone.engine, { getNewCardsPerDay: async () => null }, now, TZ),
      timeZone: () => TZ,
      syncDelayMs: 0,
    });
    expect(await offline.update({ ...ON, time: '07:30' })).toBe('offline');
    expect(phone.client.settings().time).toBe('07:30');
    expect(await phone.client.syncNow()).toBe('synced'); // back online
    expect(env.DB.q('SELECT daily_time FROM devices')).toEqual([{ daily_time: '07:30' }]);
  });
});
