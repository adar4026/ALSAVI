import { buildSnapshot, type ReminderSettings, type ReviewSnapshot } from '@alsavi/reminders';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../src/api.js';
import { runCron } from '../src/cron.js';
import type { Env } from '../src/d1.js';
import { REVIEW_TOPIC } from '../src/delivery.js';
import { createPushServer, decrypt, makeEnv, makeUserAgent, verifyVapid, type TestD1, type UserAgent } from './helpers.js';
import type { Bytes } from '../src/webpush.js';

const ORIGIN = 'https://adar4026.github.io';
const MADRID = 'Europe/Madrid';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (s: string) => Date.parse(s);
const ENDPOINT = 'https://web.push.apple.com/QGx1c2VyLWFnZW50LXRva2Vu';

const ON: ReminderSettings = { enabled: true, time: '09:00', backlog: false, backlogThreshold: 30 };

type TestEnv = Env & { DB: TestD1 };

async function call(env: TestEnv, method: string, path: string, { body, auth, now, origin = ORIGIN, fetchImpl }: {
  body?: unknown;
  auth?: string;
  now: number;
  origin?: string | null;
  fetchImpl?: typeof fetch;
}) {
  const headers: Record<string, string> = {};
  if (origin) headers.Origin = origin;
  if (auth) headers.Authorization = auth;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await handleApi(
    new Request(`https://alsavi-push.example.workers.dev${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    { now, ...(fetchImpl ? { fetchImpl } : {}) }
  );
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null, headers: res.headers };
}

/** A phone with the PWA: device registered, push subscription saved. */
async function setupDevice(env: TestEnv, now: number, endpoint = ENDPOINT) {
  const id = crypto.randomUUID();
  const reg = await call(env, 'POST', '/api/devices', { body: { id }, now });
  expect(reg.status).toBe(201);
  const auth = `Bearer ${id}.${reg.data.token}`;
  const ua = await makeUserAgent();
  const sub = await call(env, 'PUT', '/api/subscription', {
    body: { endpoint, keys: { p256dh: ua.p256dh, auth: ua.auth } },
    auth,
    now,
  });
  expect(sub.status).toBe(204);
  let rev = 0;
  const sync = (settings: ReminderSettings, snapshot: ReviewSnapshot | null, at: number, timeZone = MADRID) =>
    call(env, 'PUT', '/api/sync', { body: { rev: ++rev, settings, timeZone, snapshot }, auth, now: at });
  return { id, auth, ua, sync };
}

/** Cards due at the given moments (review state unless given). */
function snapshotAt(now: number, dues: Array<number | [number, string]>, extra: { newLimit?: number | null; newUsedToday?: number; timeZone?: string } = {}) {
  return buildSnapshot({
    cards: dues.map((d) => (Array.isArray(d) ? { due: d[0], state: d[1] } : { due: d, state: 'review' })),
    now,
    timeZone: extra.timeZone ?? MADRID,
    newLimit: extra.newLimit ?? null,
    newUsedToday: extra.newUsedToday ?? 0,
  });
}

async function payloads(ua: UserAgent, log: { body: Bytes }[]) {
  return Promise.all(log.map((e) => decrypt(ua, e.body)));
}

// 2026-10-27 is a Tuesday; Madrid is UTC+1 (winter time since 2026-10-25).
const T0 = iso('2026-10-27T07:00:00Z'); // 08:00 Madrid
const NINE = iso('2026-10-27T08:00:00Z'); // 09:00 Madrid

let env: TestEnv;
beforeEach(async () => {
  env = await makeEnv();
  vi.spyOn(console, 'log').mockImplementation(() => {}); // structured delivery logs
});

describe('daily reminder', () => {
  it('is sent at the chosen local time with the live card count — not before', async () => {
    const dev = await setupDevice(env, T0);
    const r = await dev.sync(ON, snapshotAt(T0, [T0 - DAY, T0 - HOUR, NINE - MIN, NINE + HOUR]), T0);
    expect(r.data.nextDailyAt).toBe(NINE);
    const push = createPushServer();

    await runCron(env, NINE - MIN, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(0);

    const stats = await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    expect(stats.sent).toBe(1);
    expect(push.log).toHaveLength(1);
    const [p] = await payloads(dev.ua, push.log);
    expect(p).toMatchObject({
      kind: 'daily',
      title: '🇪🇸 ALSAVI',
      body: 'Пора повторить слова!\nСегодня ждут 3 карточки.\nПродолжить повторение →',
      url: './#/review',
      tag: 'alsavi-review',
      count: 3,
    });
    expect(await verifyVapid(push.log[0]!.headers.Authorization!, env.VAPID_PUBLIC_KEY!, ENDPOINT)).toBeTruthy();
    expect(push.log[0]!.headers.TTL).toBe(String(6 * 3600));
    expect(env.DB.q('SELECT next_daily_at FROM devices')[0]).toEqual({ next_daily_at: NINE + DAY });
    expect(env.DB.q('SELECT kind, local_day, status, card_count, variant FROM deliveries')).toEqual([
      { kind: 'daily', local_day: '2026-10-27', status: 'sent', card_count: 3, variant: 'daily' },
    ]);
  });

  it('is not sent when nothing is due — and tomorrow is still planned', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [NINE + HOUR, NINE + 2 * DAY]), T0);
    const push = createPushServer();
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(0);
    expect(env.DB.q('SELECT status, error_code FROM deliveries')).toEqual([{ status: 'skipped', error_code: 'empty' }]);
    expect(env.DB.q('SELECT next_daily_at FROM devices')[0]).toEqual({ next_daily_at: NINE + DAY });
  });

  it('is not sent when there are no cards at all', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, []), T0);
    const push = createPushServer();
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(0);
  });

  it('uses the latest schedule: reviewing before the reminder time cancels it', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR, T0 - 2 * HOUR]), T0);
    // the learner studies at 08:30 — both cards move days ahead
    const studied = T0 + 30 * MIN;
    await dev.sync(ON, snapshotAt(studied, [studied + 3 * DAY, studied + 5 * DAY]), studied);
    const push = createPushServer();
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(0);
  });

  it('works while the app stays closed: cards that fall due later are counted from the synced schedule', async () => {
    const dev = await setupDevice(env, T0);
    // last app use on day 0; the cards fall due on day 2 at 07:30 local
    await dev.sync(ON, snapshotAt(T0, [T0 + 2 * DAY - 30 * MIN, T0 + 2 * DAY - 20 * MIN, T0 + 9 * DAY]), T0);
    const push = createPushServer();
    for (let day = 0; day <= 2; day++) await runCron(env, NINE + day * DAY, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(1);
    const [p] = await payloads(dev.ua, push.log);
    expect(p!.count).toBe(2);
    expect(env.DB.q('SELECT local_day, status FROM deliveries ORDER BY id')).toEqual([
      { local_day: '2026-10-27', status: 'skipped' },
      { local_day: '2026-10-28', status: 'skipped' },
      { local_day: '2026-10-29', status: 'sent' },
    ]);
  });

  it('counts new cards only within the daily new-card limit', async () => {
    const dev = await setupDevice(env, T0);
    const fresh = Array.from({ length: 50 }, () => [T0 - DAY, 'new'] as [number, string]);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR, ...fresh], { newLimit: 10, newUsedToday: 0 }), T0);
    const push = createPushServer();
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    expect((await payloads(dev.ua, push.log))[0]!.count).toBe(11);
  });

  it('skips a reminder the cron reaches hours late instead of sending it at the wrong time', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const push = createPushServer();
    await runCron(env, NINE + 3 * HOUR, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(0);
    expect(env.DB.q('SELECT error_code FROM deliveries')).toEqual([{ error_code: 'late' }]);
    expect(env.DB.q('SELECT next_daily_at FROM devices')[0]).toEqual({ next_daily_at: NINE + DAY });
  });
});

describe('no duplicates', () => {
  it('parallel cron runs and a re-run of the same minute send exactly one notification', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const push = createPushServer();
    await Promise.all([1, 2, 3].map(() => runCron(env, NINE, { fetchImpl: push.fetchImpl })));
    await runCron(env, NINE + 30_000, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(1);
    expect(env.DB.q('SELECT COUNT(*) AS n FROM deliveries')[0]).toEqual({ n: 1 });
  });

  it('moving the time later on the same day does not repeat today’s reminder', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const push = createPushServer();
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    const r = await dev.sync({ ...ON, time: '18:00' }, null, NINE + HOUR);
    expect(r.data.nextDailyAt).toBe(iso('2026-10-27T17:00:00Z'));
    await runCron(env, iso('2026-10-27T17:00:00Z'), { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(1);
    expect(env.DB.q('SELECT next_daily_at FROM devices')[0]).toEqual({ next_daily_at: iso('2026-10-28T17:00:00Z') });
  });

  it('a routine schedule sync just before the reminder does not postpone it', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    await dev.sync(ON, snapshotAt(NINE - 1000, [T0 - HOUR]), NINE - 1000);
    const push = createPushServer();
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(1);
  });

  it('a delayed older sync request is refused (409) and cannot overwrite newer settings', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const stale = await call(env, 'PUT', '/api/sync', {
      body: { rev: 1, settings: { ...ON, enabled: false }, timeZone: MADRID, snapshot: null },
      auth: dev.auth,
      now: T0 + MIN,
    });
    expect(stale.status).toBe(409);
    expect(env.DB.q('SELECT enabled FROM devices')[0]).toEqual({ enabled: 1 });
  });

  it('a phone that re-registered takes its endpoint over: one device receives, not two', async () => {
    const a = await setupDevice(env, T0);
    await a.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const b = await setupDevice(env, T0 + MIN); // same ENDPOINT
    await b.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0 + MIN);
    expect(env.DB.q('SELECT device_id FROM push_subscriptions')).toEqual([{ device_id: b.id }]);
    const push = createPushServer();
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(1);
  });
});

describe('time zones and calendar boundaries', () => {
  it('a time-zone change re-plans the reminder in the new zone, without a second one on the same local day', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const push = createPushServer();
    await runCron(env, NINE, { fetchImpl: push.fetchImpl }); // 09:00 Madrid, 2026-10-27
    // flies to New York the same day: 09:00 NY on 2026-10-27 has not happened yet (= 13:00Z)
    const r = await dev.sync(ON, snapshotAt(NINE + HOUR, [T0 - HOUR], { timeZone: 'America/New_York' }), NINE + HOUR, 'America/New_York');
    expect(r.data.nextDailyAt).toBe(iso('2026-10-27T13:00:00Z'));
    await runCron(env, iso('2026-10-27T13:00:00Z'), { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(1); // already reminded on 2026-10-27
    await runCron(env, iso('2026-10-28T13:00:00Z'), { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(2);
    // the duplicate of 2026-10-27 never got a row: the UNIQUE claim refused it
    expect(env.DB.q('SELECT local_day FROM deliveries ORDER BY id')).toEqual([{ local_day: '2026-10-27' }, { local_day: '2026-10-28' }]);
  });

  it('keeps 09:00 local across the DST change (summer → winter)', async () => {
    const sat = iso('2026-10-24T05:00:00Z'); // 07:00 Madrid, UTC+2
    const dev = await setupDevice(env, sat);
    const r = await dev.sync(ON, snapshotAt(sat, [sat - HOUR]), sat);
    expect(r.data.nextDailyAt).toBe(iso('2026-10-24T07:00:00Z'));
    const push = createPushServer();
    await runCron(env, iso('2026-10-24T07:00:00Z'), { fetchImpl: push.fetchImpl });
    expect(env.DB.q('SELECT next_daily_at FROM devices')[0]).toEqual({ next_daily_at: iso('2026-10-25T08:00:00Z') });
    await runCron(env, iso('2026-10-25T08:00:00Z'), { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(2);
  });

  it('a reminder at 00:00 belongs to the new local day; 23:59 to the old one', async () => {
    const dev = await setupDevice(env, T0);
    const r = await dev.sync({ ...ON, time: '00:00' }, snapshotAt(T0, [T0 - HOUR]), T0);
    expect(r.data.nextDailyAt).toBe(iso('2026-10-27T23:00:00Z'));
    const push = createPushServer();
    await runCron(env, iso('2026-10-27T23:00:00Z'), { fetchImpl: push.fetchImpl });
    await dev.sync({ ...ON, time: '23:59' }, null, iso('2026-10-27T23:01:00Z'));
    await runCron(env, iso('2026-10-28T22:59:00Z'), { fetchImpl: push.fetchImpl });
    // both fall on local 2026-10-28: the second is a duplicate of the day
    expect(env.DB.q('SELECT local_day, status FROM deliveries ORDER BY id')).toEqual([{ local_day: '2026-10-28', status: 'sent' }]);
    expect(push.log).toHaveLength(1);
    await runCron(env, iso('2026-10-29T22:59:00Z'), { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(2);
  });

  it('the new-card allowance resets at local midnight of the device zone', async () => {
    const dev = await setupDevice(env, T0);
    const fresh = Array.from({ length: 20 }, () => [T0 - DAY, 'new'] as [number, string]);
    // 10 of 10 new cards already started today → nothing new left today
    await dev.sync(ON, snapshotAt(T0, fresh, { newLimit: 10, newUsedToday: 10 }), T0);
    const push = createPushServer();
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(0);
    await runCron(env, NINE + DAY, { fetchImpl: push.fetchImpl });
    expect((await payloads(dev.ua, push.log))[0]!.count).toBe(10);
  });
});

describe('turning reminders off', () => {
  it('sends nothing while disabled, and plans again when re-enabled', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const off = await dev.sync({ ...ON, enabled: false }, null, T0 + MIN);
    expect(off.data.nextDailyAt).toBeNull();
    const push = createPushServer();
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    await runCron(env, NINE + DAY, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(0);
    const on = await dev.sync(ON, null, NINE + DAY + MIN);
    expect(on.data.nextDailyAt).toBe(NINE + 2 * DAY);
  });

  it('deleting the device removes everything about it on the server', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    expect((await call(env, 'DELETE', '/api/device', { auth: dev.auth, now: T0 })).status).toBe(204);
    expect(env.DB.q('SELECT COUNT(*) AS n FROM devices')[0]).toEqual({ n: 0 });
    expect(env.DB.q('SELECT COUNT(*) AS n FROM push_subscriptions')[0]).toEqual({ n: 0 });
  });
});

describe('delivery failures', () => {
  it('an invalid subscription (410) is removed and no longer used; status reports it', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const push = createPushServer(() => 410);
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    expect(env.DB.q('SELECT COUNT(*) AS n FROM push_subscriptions')[0]).toEqual({ n: 0 });
    expect(env.DB.q('SELECT status, error_code FROM deliveries')).toEqual([{ status: 'failed', error_code: 'gone:410' }]);
    await runCron(env, NINE + DAY, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(1);
    const status = await call(env, 'GET', '/api/status', { auth: dev.auth, now: NINE + DAY });
    expect(status.data).toMatchObject({ subscribed: false, settings: ON });
  });

  it('other client errors (403) are counted but keep the subscription', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const push = createPushServer(() => 403);
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    expect(env.DB.q('SELECT failure_count FROM push_subscriptions')).toEqual([{ failure_count: 1 }]);
  });

  it('logs the push service’s reason for a refusal — without the endpoint', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const fetchImpl = (async () => new Response('{"reason":"BadJwtToken"}', { status: 403 })) as typeof fetch;
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runCron(env, NINE, { fetchImpl });
      const lines = spy.mock.calls.map((c) => String(c[0]));
      const refused = lines.map((l) => JSON.parse(l)).find((e) => e.evt === 'push_refused');
      expect(refused).toMatchObject({ outcome: 'error', status: 403, reason: 'BadJwtToken', host: 'web.push.apple.com' });
      expect(lines.join('\n')).not.toContain(ENDPOINT);
    } finally {
      spy.mockRestore();
    }
  });

  it('sends a Topic Apple accepts: SHA-256-derived, 32 base64url characters', async () => {
    const expected = createHash('sha256').update('alsavi-review').digest().subarray(0, 24).toString('base64url');
    expect(REVIEW_TOPIC).toBe(expected);
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const topics: (string | null)[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      topics.push(new Headers(init.headers).get('Topic'));
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    await runCron(env, NINE, { fetchImpl });
    expect(topics).toEqual([expected]);
    expect(expected).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('a temporary failure is retried with backoff and delivered once', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const push = createPushServer((_u, n) => (n === 0 ? 503 : 201));
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    expect(env.DB.q('SELECT status, attempts FROM deliveries')).toEqual([{ status: 'retry', attempts: 1 }]);
    await runCron(env, NINE + 30_000, { fetchImpl: push.fetchImpl }); // backoff not over yet
    expect(push.log).toHaveLength(1);
    await runCron(env, NINE + MIN, { fetchImpl: push.fetchImpl });
    await runCron(env, NINE + 2 * MIN, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(2);
    expect(env.DB.q('SELECT status, attempts FROM deliveries')).toEqual([{ status: 'sent', attempts: 2 }]);
  });

  it('a retry is dropped if the learner studied in the meantime', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const push = createPushServer(() => 'network');
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    const studied = NINE + 30_000;
    await dev.sync(ON, snapshotAt(studied, [studied + 2 * DAY]), studied);
    push.set(() => 201);
    await runCron(env, NINE + MIN, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(1); // only the failed first attempt
    expect(env.DB.q('SELECT status, error_code FROM deliveries')).toEqual([{ status: 'skipped', error_code: 'empty' }]);
  });

  it('gives up after the attempts or the retry window run out', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR]), T0);
    const push = createPushServer(() => 500);
    for (let m = 0; m <= 10; m++) await runCron(env, NINE + m * MIN, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(3);
    expect(env.DB.q('SELECT status, attempts FROM deliveries')).toEqual([{ status: 'failed', attempts: 3 }]);
  });
});

describe('backlog reminder', () => {
  const BACKLOG: ReminderSettings = { ...ON, backlog: true, backlogThreshold: 10 };

  it('a large backlog at reminder time changes the daily wording — one notification, not two', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(BACKLOG, snapshotAt(T0, Array.from({ length: 35 }, () => T0 - DAY)), T0);
    const push = createPushServer();
    for (let m = 0; m <= 12 * 60; m += 15) await runCron(env, NINE + m * MIN, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(1);
    expect((await payloads(dev.ua, push.log))[0]).toMatchObject({
      kind: 'backlog',
      title: '📚 ALSAVI',
      body: 'Накопились слова для повторения.\nУ тебя 35 карточек.\nСамое время продолжить обучение.',
    });
  });

  it('is sent once later in the day when the backlog grows past the threshold after the daily reminder', async () => {
    const dev = await setupDevice(env, T0);
    // 5 due now, 10 more fall due during the morning
    const dues = [...Array.from({ length: 5 }, () => T0 - DAY), ...Array.from({ length: 10 }, (_, i) => NINE + (i + 1) * 20 * MIN)];
    await dev.sync(BACKLOG, snapshotAt(T0, dues), T0);
    const push = createPushServer();
    for (let m = 0; m <= 12 * 60; m += 15) await runCron(env, NINE + m * MIN, { fetchImpl: push.fetchImpl });
    const sent = await payloads(dev.ua, push.log);
    expect(sent.map((p) => p.kind)).toEqual(['daily', 'backlog']);
    expect(sent[1]!.count).toBe(15);
    // not before 8 hours after the daily one: 17:00 Madrid at the earliest
    expect(env.DB.q(`SELECT scheduled_at FROM deliveries WHERE kind = 'backlog'`)).toEqual([{ scheduled_at: NINE + 8 * HOUR }]);
  });

  it('never at night, and not when it is off', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync({ ...BACKLOG, time: '23:00' }, snapshotAt(T0, Array.from({ length: 40 }, () => T0 - DAY)), T0);
    const push = createPushServer();
    await runCron(env, iso('2026-10-27T21:00:00Z'), { fetchImpl: push.fetchImpl }); // 22:00 Madrid
    expect(push.log).toHaveLength(0);
    await dev.sync({ ...ON, time: '23:00' }, null, iso('2026-10-28T09:00:00Z'));
    await runCron(env, iso('2026-10-28T11:00:00Z'), { fetchImpl: push.fetchImpl }); // 12:00 Madrid, backlog off
    expect(push.log).toHaveLength(0);
  });
});

describe('API', () => {
  it('refuses foreign origins and answers the PWA’s preflight', async () => {
    const foreign = await call(env, 'GET', '/api/config', { now: T0, origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
    const pre = await call(env, 'OPTIONS', '/api/sync', { now: T0 });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(pre.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('requires the device token; a wrong token looks the same as no device', async () => {
    const dev = await setupDevice(env, T0);
    const wrong = dev.auth.replace(/\.(.)/, (_m, c) => `.${c === 'A' ? 'B' : 'A'}`);
    expect((await call(env, 'GET', '/api/status', { now: T0 })).status).toBe(401);
    expect((await call(env, 'GET', '/api/status', { auth: wrong, now: T0 })).status).toBe(401);
  });

  it('validates input: endpoint allowlist, keys, settings, zone, schedule', async () => {
    const dev = await setupDevice(env, T0);
    const sub = (endpoint: string) =>
      call(env, 'PUT', '/api/subscription', { body: { endpoint, keys: { p256dh: dev.ua.p256dh, auth: dev.ua.auth } }, auth: dev.auth, now: T0 });
    expect((await sub('https://attacker.example/push')).status).toBe(400);
    expect((await sub('http://web.push.apple.com/x')).status).toBe(400);
    const bad = (body: Record<string, unknown>) => call(env, 'PUT', '/api/sync', { body: { rev: 5, settings: ON, timeZone: MADRID, snapshot: null, ...body }, auth: dev.auth, now: T0 });
    expect((await bad({ settings: { ...ON, time: '9:00' } })).status).toBe(400);
    expect((await bad({ timeZone: 'Mars/Base' })).status).toBe(400);
    expect((await bad({ snapshot: { v: 1, started: 'x' } })).status).toBe(400);
    expect((await bad({ rev: 0 })).status).toBe(400);
  });

  it('a test notification goes out now with the live count, rate-limited', async () => {
    const dev = await setupDevice(env, T0);
    await dev.sync(ON, snapshotAt(T0, [T0 - HOUR, T0 - DAY]), T0);
    const push = createPushServer();
    const r = await call(env, 'POST', '/api/test', { auth: dev.auth, now: T0, fetchImpl: push.fetchImpl });
    expect(r).toMatchObject({ status: 200, data: { ok: true, count: 2 } });
    expect((await payloads(dev.ua, push.log))[0]).toMatchObject({ kind: 'test', url: './#/review' });
    expect((await call(env, 'POST', '/api/test', { auth: dev.auth, now: T0 + 1000, fetchImpl: push.fetchImpl })).status).toBe(429);
    // a test push never counts as the day's reminder
    await runCron(env, NINE, { fetchImpl: push.fetchImpl });
    expect(push.log).toHaveLength(2);
  });

  it('push not configured on the server → 503, not a crash', async () => {
    const dev = await setupDevice(env, T0);
    delete env.VAPID_PRIVATE_KEY;
    expect((await call(env, 'POST', '/api/test', { auth: dev.auth, now: T0 })).status).toBe(503);
  });
});
