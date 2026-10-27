/**
 * HTTP API for the PWA (cross-origin: the app stays on GitHub Pages, so its
 * IndexedDB — all the learner's data — never moves). JSON in and out, CORS
 * only for ALLOWED_ORIGINS, no cookies; the device token travels only in
 * the Authorization header.
 *
 *   GET    /api/config        public VAPID key
 *   POST   /api/devices       register a device → token        (rate-limited)
 *   GET    /api/status        subscription, settings, last delivery (auth)
 *   PUT    /api/subscription  save the Web Push subscription    (auth)
 *   DELETE /api/subscription  forget it                          (auth)
 *   PUT    /api/sync          settings + time zone + schedule    (auth)
 *   POST   /api/test          a test notification now            (auth)
 *   DELETE /api/device        delete everything about the device (auth)
 */

import { countDue, isValidTimeZone, nextDailyAt, parseSettings, parseSnapshot, type ReminderSettings } from '@alsavi/reminders';
import { authenticate, newToken, sha256Hex, UUID_RE, type DeviceRow } from './auth.js';
import { settingsOf, snapshotOf } from './cron.js';
import type { Env } from './d1.js';
import { pushToDevice, reviewPayload, subscriptionOf } from './delivery.js';
import { isAllowedEndpoint, validSubscriptionKeys } from './webpush.js';

export const MAX_BODY_BYTES = 128 * 1024;
export const TEST_PUSH_INTERVAL_MS = 30_000;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  if (!origin || !allowedOrigins(env).includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: data === null ? { 'Cache-Control': 'no-store' } : { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'too_large');
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, 'bad_json');
}

async function requireDevice(request: Request, env: Env): Promise<DeviceRow> {
  const device = await authenticate(request, env.DB);
  if (!device) throw new HttpError(401, 'unauthorized');
  return device;
}

/** Next daily reminder for these settings, or `null` when there is none. */
export function scheduleNextDaily(settings: ReminderSettings, timeZone: string | null, now: number): number | null {
  return settings.enabled && timeZone ? nextDailyAt(now, settings.time, timeZone) : null;
}

async function route(request: Request, env: Env, now: number, fetchImpl: typeof fetch): Promise<Response> {
  const url = new URL(request.url);
  const db = env.DB;
  const method = request.method;
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/config' && method === 'GET') {
    return json({ vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null });
  }

  if (path === '/api/devices' && method === 'POST') {
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      if (!(await env.RATE_LIMITER.limit({ key: `register:${ip}` })).success) throw new HttpError(429, 'rate_limited');
    }
    const body = await readJson(request);
    if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) throw new HttpError(400, 'bad_device_id');
    const token = newToken();
    const ins = await db
      .prepare('INSERT INTO devices (id, token_hash, created_at, updated_at, last_seen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING')
      .bind(body.id, await sha256Hex(token), now, now, now)
      .run();
    if (ins.meta.changes !== 1) throw new HttpError(409, 'device_exists');
    return json({ token }, 201);
  }

  const device = await requireDevice(request, env);

  if (path === '/api/status' && method === 'GET') {
    const sub = await subscriptionOf(db, device.id);
    const last = await db
      .prepare(
        `SELECT kind, status, variant, card_count, local_day, sent_at, created_at, error_code FROM deliveries
         WHERE device_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .bind(device.id)
      .first<Record<string, unknown>>();
    await db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(now, device.id).run();
    return json({
      subscribed: Boolean(sub),
      settings: settingsOf(device),
      timeZone: device.timezone,
      syncRev: device.sync_rev,
      snapshotAt: device.snapshot_at,
      nextDailyAt: device.next_daily_at,
      lastDelivery: last
        ? {
            kind: last.kind,
            status: last.status,
            variant: last.variant,
            count: last.card_count,
            day: last.local_day,
            at: last.sent_at ?? last.created_at,
            reason: last.error_code,
          }
        : null,
    });
  }

  if (path === '/api/subscription' && method === 'PUT') {
    const body = await readJson(request);
    const keys = (body.keys ?? {}) as Record<string, unknown>;
    if (!isAllowedEndpoint(body.endpoint)) throw new HttpError(400, 'bad_endpoint');
    if (!validSubscriptionKeys(keys.p256dh, keys.auth)) throw new HttpError(400, 'bad_keys');
    // One subscription per device, one device per endpoint: a phone that
    // re-registered (cleared site data) takes its endpoint over from its old
    // device row, so it can never receive two copies of a reminder.
    await db.batch([
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND device_id <> ?').bind(body.endpoint, device.id),
      db
        .prepare(
          `INSERT INTO push_subscriptions (device_id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (device_id) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth,
             updated_at = excluded.updated_at, failure_count = 0, last_failure_at = NULL`
        )
        .bind(device.id, body.endpoint, keys.p256dh, keys.auth, now, now),
    ]);
    return json(null, 204);
  }

  if (path === '/api/subscription' && method === 'DELETE') {
    await db.prepare('DELETE FROM push_subscriptions WHERE device_id = ?').bind(device.id).run();
    return json(null, 204);
  }

  if (path === '/api/sync' && method === 'PUT') {
    const body = await readJson(request);
    const rev = body.rev;
    if (!Number.isInteger(rev) || (rev as number) < 1) throw new HttpError(400, 'bad_rev');
    // A delayed older request must not overwrite a newer state.
    if ((rev as number) <= device.sync_rev) throw new HttpError(409, 'stale_rev');
    const settings = parseSettings(body.settings);
    if (!settings) throw new HttpError(400, 'bad_settings');
    if (!isValidTimeZone(body.timeZone)) throw new HttpError(400, 'bad_timezone');
    const timeZone = body.timeZone;
    let snapshot = null;
    if (body.snapshot !== null && body.snapshot !== undefined) {
      snapshot = parseSnapshot(body.snapshot);
      if (!snapshot) throw new HttpError(400, 'bad_snapshot');
    }
    // Re-plan the daily reminder only when its schedule changed: a routine
    // schedule sync at 08:59:59 must not push today's 09:00 to tomorrow.
    const old = settingsOf(device);
    const scheduleChanged =
      old.enabled !== settings.enabled || old.time !== settings.time || device.timezone !== timeZone || device.next_daily_at === null;
    const nextDaily = scheduleChanged ? scheduleNextDaily(settings, timeZone, now) : device.next_daily_at;
    // Reminders off → the server forgets the schedule; without a new snapshot the last one stays.
    const keep = settings.enabled ? 1 : 0;
    const upd = await db
      .prepare(
        `UPDATE devices SET timezone = ?, enabled = ?, daily_time = ?, backlog = ?, backlog_threshold = ?,
           snapshot = CASE WHEN ? = 1 THEN COALESCE(?, snapshot) END,
           snapshot_at = CASE WHEN ? = 1 THEN COALESCE(?, snapshot_at) END,
           sync_rev = ?, next_daily_at = ?, updated_at = ?
         WHERE id = ? AND sync_rev < ?`
      )
      .bind(
        timeZone,
        settings.enabled ? 1 : 0,
        settings.time,
        settings.backlog ? 1 : 0,
        settings.backlogThreshold,
        keep,
        snapshot ? JSON.stringify(snapshot) : null,
        keep,
        snapshot ? snapshot.generatedAt : null,
        rev,
        settings.enabled ? nextDaily : null,
        now,
        device.id,
        rev
      )
      .run();
    if (upd.meta.changes !== 1) throw new HttpError(409, 'stale_rev');
    return json({ nextDailyAt: settings.enabled ? nextDaily : null });
  }

  if (path === '/api/test' && method === 'POST') {
    if (device.last_test_at !== null && now - device.last_test_at < TEST_PUSH_INTERVAL_MS) throw new HttpError(429, 'rate_limited');
    await db.prepare('UPDATE devices SET last_test_at = ? WHERE id = ?').bind(now, device.id).run();
    const snapshot = snapshotOf(device);
    const count = snapshot ? countDue(snapshot, now).queue : 0;
    const res = await pushToDevice(env, device.id, reviewPayload('test', count), { now, ttl: 300, fetchImpl });
    if (res.kind === 'no_subscription') throw new HttpError(409, 'no_subscription');
    if (res.kind === 'gone') throw new HttpError(410, 'subscription_gone');
    if (res.kind !== 'ok') throw new HttpError(502, 'push_failed');
    return json({ ok: true, count });
  }

  if (path === '/api/device' && method === 'DELETE') {
    await db.prepare('DELETE FROM devices WHERE id = ?').bind(device.id).run();
    return json(null, 204);
  }

  throw new HttpError(404, 'not_found');
}

export async function handleApi(request: Request, env: Env, { now = Date.now(), fetchImpl = fetch } = {}): Promise<Response> {
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, env);
  // Browsers always send Origin on cross-origin requests: a foreign page is refused outright.
  if (origin && !cors['Access-Control-Allow-Origin']) return json({ error: 'origin_not_allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  let res: Response;
  try {
    res = await route(request, env, now, fetchImpl);
  } catch (err) {
    if (err instanceof HttpError) res = json({ error: err.code }, err.status);
    else if ((err as { code?: string })?.code === 'push_not_configured') res = json({ error: 'push_not_configured' }, 503);
    else {
      console.error(JSON.stringify({ evt: 'api_error', message: String((err as Error)?.message ?? err).slice(0, 200) }));
      res = json({ error: 'internal' }, 500);
    }
  }
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}
