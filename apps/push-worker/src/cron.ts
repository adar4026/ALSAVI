/**
 * One Cron Trigger, once a minute, serves every device.
 *
 *  1. Daily reminders: devices whose `next_daily_at <= now` (partial index).
 *     Atomic claim in one D1 transaction:
 *       INSERT delivery (UNIQUE device + kind + local day)
 *       + move `next_daily_at` to the next local day (DST-aware).
 *     A parallel run hits the UNIQUE constraint and backs off. The count is
 *     computed at send time from the latest synced schedule, so reviews done
 *     before the reminder are already taken into account.
 *  2. Retries of temporary failures (429/5xx/network) with backoff, at most
 *     MAX_ATTEMPTS and only inside RETRY_WINDOW_MS — the count is computed
 *     again before each attempt (studied meanwhile → nothing is sent).
 *  3. Every 15 minutes: the opt-in backlog reminder (policy.ts).
 *  4. Hourly: housekeeping.
 *
 * At most once: a delivery whose Worker died between claim and result stays
 * `claimed` and is NOT retried (later marked `unknown`) — a missed reminder
 * is better than a duplicate.
 */

import { countDue, dayKey, nextDailyAt, normalizeSettings, parseSnapshot, type ReminderSettings, type ReviewSnapshot } from '@alsavi/reminders';
import type { DeviceRow } from './auth.js';
import type { D1Database, Env } from './d1.js';
import { pushToDevice, reviewPayload, type DeliveryOutcome } from './delivery.js';
import { log } from './log.js';
import { decideBacklog, decideDaily } from './policy.js';

export const CRON_BATCH = 50;
export const MAX_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = [60_000, 180_000];
export const RETRY_WINDOW_MS = 30 * 60_000;
export const STUCK_CLAIM_MS = 5 * 60_000;
export const DELIVERY_RETENTION_MS = 60 * 86_400_000;
export const IDLE_DEVICE_RETENTION_MS = 120 * 86_400_000;
/** Push TTL: a phone that is off gets the reminder later the same morning, not the next day. */
export const TTL_S = { daily: 6 * 3600, backlog: 3 * 3600 } as const;
const CONCURRENCY = 6;
/** Statuses of a notification that went out or may have. */
const NOTIFIED = "('sent', 'claimed', 'retry', 'unknown')";

export interface CronStats {
  daily: number;
  sent: number;
  skipped: number;
  duplicate: number;
  retrying: number;
  failed: number;
  expired: number;
  retried: number;
  backlogChecked: number;
}

export function settingsOf(row: DeviceRow): ReminderSettings {
  return normalizeSettings({
    enabled: row.enabled === 1,
    time: row.daily_time,
    backlog: row.backlog === 1,
    backlogThreshold: row.backlog_threshold,
  });
}

export function snapshotOf(row: Pick<DeviceRow, 'snapshot'>): ReviewSnapshot | null {
  if (!row.snapshot) return null;
  try {
    return parseSnapshot(JSON.parse(row.snapshot));
  } catch {
    return null;
  }
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await fn(items[i++]!);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

async function send(env: Env, deviceId: string, kind: 'daily' | 'backlog', count: number, now: number, fetchImpl: typeof fetch): Promise<DeliveryOutcome> {
  try {
    return await pushToDevice(env, deviceId, reviewPayload(kind, count), { now, ttl: TTL_S[kind], fetchImpl });
  } catch (err) {
    return { kind: 'error', status: (err as { code?: string })?.code === 'push_not_configured' ? -1 : -2 };
  }
}

/** Result of one attempt → delivery status. */
async function finish(
  db: D1Database,
  d: { id: number; deviceId: string; kind: string; scheduledAt: number },
  attempts: number,
  res: DeliveryOutcome,
  now: number,
  stats: CronStats
): Promise<void> {
  if (res.kind === 'ok') {
    stats.sent++;
    log('sent', { device: d.deviceId, kind: d.kind, attempt: attempts, status: res.status });
    await db
      .prepare(`UPDATE deliveries SET status = 'sent', attempts = ?, sent_at = ?, next_attempt_at = NULL, error_code = NULL WHERE id = ?`)
      .bind(attempts, now, d.id)
      .run();
    return;
  }
  const code = res.kind === 'no_subscription' ? 'no_subscription' : `${res.kind}:${res.status}`;
  const backoff = RETRY_BACKOFF_MS[attempts - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!;
  if (res.kind === 'retry' && attempts < MAX_ATTEMPTS && now + backoff < d.scheduledAt + RETRY_WINDOW_MS) {
    stats.retrying++;
    log('retry', { device: d.deviceId, kind: d.kind, attempt: attempts, code });
    await db
      .prepare(`UPDATE deliveries SET status = 'retry', attempts = ?, next_attempt_at = ?, error_code = ? WHERE id = ?`)
      .bind(attempts, now + backoff, code, d.id)
      .run();
    return;
  }
  stats.failed++;
  log('failed', { device: d.deviceId, kind: d.kind, attempt: attempts, code });
  await db
    .prepare(`UPDATE deliveries SET status = 'failed', attempts = ?, next_attempt_at = NULL, error_code = ? WHERE id = ?`)
    .bind(attempts, code, d.id)
    .run();
}

async function processDaily(env: Env, row: DeviceRow, now: number, stats: CronStats, fetchImpl: typeof fetch): Promise<void> {
  const db = env.DB;
  const fireAt = row.next_daily_at!;
  const tz = row.timezone!;
  const day = dayKey(fireAt, tz);
  const next = nextDailyAt(Math.max(now, fireAt), row.daily_time, tz);
  const decision = decideDaily({ fireAt, now, settings: settingsOf(row), snapshot: snapshotOf(row) });
  const sending = decision.action === 'send';

  const [ins] = await db.batch([
    db
      .prepare(
        `INSERT INTO deliveries (device_id, kind, local_day, scheduled_at, variant, card_count, status, error_code, created_at)
         SELECT ?, 'daily', ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM devices WHERE id = ? AND next_daily_at = ?)
         ON CONFLICT (device_id, kind, local_day) DO NOTHING`
      )
      .bind(
        row.id,
        day,
        fireAt,
        sending ? decision.variant : null,
        sending ? decision.count : null,
        sending ? 'claimed' : 'skipped',
        sending ? null : decision.reason,
        now,
        row.id,
        fireAt
      ),
    db.prepare('UPDATE devices SET next_daily_at = ?, updated_at = ? WHERE id = ? AND next_daily_at = ?').bind(next, now, row.id, fireAt),
  ]);
  if (ins!.meta.changes !== 1) {
    // Another run took it, the schedule changed, or today's reminder already went out.
    stats.duplicate++;
    log('duplicate', { device: row.id, kind: 'daily', day });
    return;
  }
  if (!sending) {
    stats.skipped++;
    log('skipped', { device: row.id, kind: 'daily', day, reason: decision.reason });
    return;
  }
  const delivery = await db
    .prepare(`SELECT id FROM deliveries WHERE device_id = ? AND kind = 'daily' AND local_day = ?`)
    .bind(row.id, day)
    .first<{ id: number }>();
  const res = await send(env, row.id, decision.variant, decision.count, now, fetchImpl);
  await finish(db, { id: delivery!.id, deviceId: row.id, kind: 'daily', scheduledAt: fireAt }, 1, res, now, stats);
}

interface RetryRow extends DeviceRow {
  delivery_id: number;
  kind: 'daily' | 'backlog';
  scheduled_at: number;
  attempts: number;
}

async function processRetry(env: Env, d: RetryRow, now: number, stats: CronStats, fetchImpl: typeof fetch): Promise<void> {
  const db = env.DB;
  if (now - d.scheduled_at >= RETRY_WINDOW_MS) {
    await db.prepare(`UPDATE deliveries SET status = 'expired', next_attempt_at = NULL WHERE id = ? AND status = 'retry'`).bind(d.delivery_id).run();
    stats.expired++;
    return;
  }
  const claim = await db
    .prepare(`UPDATE deliveries SET status = 'claimed', next_attempt_at = NULL WHERE id = ? AND status = 'retry'`)
    .bind(d.delivery_id)
    .run();
  if (claim.meta.changes !== 1) {
    stats.duplicate++;
    return;
  }
  // The learner may have studied or switched reminders off since the first attempt.
  const settings = settingsOf(d);
  const snapshot = snapshotOf(d);
  let variant: 'daily' | 'backlog' | null = null;
  let count = 0;
  let reason = 'disabled';
  if (settings.enabled && snapshot) {
    if (d.kind === 'daily') {
      const decision = decideDaily({ fireAt: d.scheduled_at, now, settings, snapshot });
      if (decision.action === 'send') ({ variant, count } = decision);
      else reason = decision.reason;
    } else {
      const { overdue } = countDue(snapshot, now);
      if (settings.backlog && overdue >= settings.backlogThreshold) [variant, count] = ['backlog', overdue];
      else reason = 'empty';
    }
  }
  if (variant === null) {
    stats.skipped++;
    await db
      .prepare(`UPDATE deliveries SET status = 'skipped', error_code = ? WHERE id = ?`)
      .bind(reason, d.delivery_id)
      .run();
    return;
  }
  await db.prepare('UPDATE deliveries SET variant = ?, card_count = ? WHERE id = ?').bind(variant, count, d.delivery_id).run();
  const res = await send(env, d.id, variant, count, now, fetchImpl);
  await finish(db, { id: d.delivery_id, deviceId: d.id, kind: d.kind, scheduledAt: d.scheduled_at }, d.attempts + 1, res, now, stats);
}

async function processBacklog(env: Env, row: DeviceRow, now: number, stats: CronStats, fetchImpl: typeof fetch): Promise<void> {
  const db = env.DB;
  const tz = row.timezone!;
  const day = dayKey(now, tz);
  const last = await db
    .prepare(`SELECT MAX(COALESCE(sent_at, created_at)) AS at FROM deliveries WHERE device_id = ? AND status IN ${NOTIFIED}`)
    .bind(row.id)
    .first<{ at: number | null }>();
  const today = await db
    .prepare(`SELECT variant FROM deliveries WHERE device_id = ? AND kind = 'daily' AND local_day = ? AND status IN ${NOTIFIED}`)
    .bind(row.id, day)
    .first<{ variant: string | null }>();
  const decision = decideBacklog({
    now,
    timeZone: tz,
    settings: settingsOf(row),
    snapshot: snapshotOf(row),
    lastNotifiedAt: last?.at ?? null,
    nextDailyAt: row.next_daily_at,
    todayDailyVariant: today?.variant ?? null,
  });
  if (decision.action !== 'send') return;
  const ins = await db
    .prepare(
      `INSERT INTO deliveries (device_id, kind, local_day, scheduled_at, variant, card_count, status, created_at)
       VALUES (?, 'backlog', ?, ?, 'backlog', ?, 'claimed', ?)
       ON CONFLICT (device_id, kind, local_day) DO NOTHING`
    )
    .bind(row.id, day, now, decision.count, now)
    .run();
  if (ins.meta.changes !== 1) return; // already reminded about the backlog today
  const res = await send(env, row.id, 'backlog', decision.count, now, fetchImpl);
  await finish(db, { id: ins.meta.last_row_id!, deviceId: row.id, kind: 'backlog', scheduledAt: now }, 1, res, now, stats);
}

/** Hourly: stuck claims, journal retention, abandoned devices. */
export async function maintenance(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE deliveries SET status = 'unknown' WHERE status = 'claimed' AND created_at < ?`).bind(now - STUCK_CLAIM_MS),
    db
      .prepare(`UPDATE deliveries SET status = 'expired', next_attempt_at = NULL WHERE status = 'retry' AND scheduled_at < ?`)
      .bind(now - RETRY_WINDOW_MS),
    db.prepare('DELETE FROM deliveries WHERE created_at < ?').bind(now - DELIVERY_RETENTION_MS),
    db
      .prepare(
        `DELETE FROM devices WHERE updated_at < ? AND COALESCE(last_seen_at, 0) < ?
         AND NOT EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.device_id = devices.id)`
      )
      .bind(now - IDLE_DEVICE_RETENTION_MS, now - IDLE_DEVICE_RETENTION_MS),
  ]);
}

export async function runCron(env: Env, now = Date.now(), { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}): Promise<CronStats> {
  const db = env.DB;
  const stats: CronStats = { daily: 0, sent: 0, skipped: 0, duplicate: 0, retrying: 0, failed: 0, expired: 0, retried: 0, backlogChecked: 0 };

  const { results: due } = await db
    .prepare(
      `SELECT d.* FROM devices d
       WHERE d.enabled = 1 AND d.next_daily_at IS NOT NULL AND d.next_daily_at <= ? AND d.timezone IS NOT NULL
         AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.device_id = d.id)
       ORDER BY d.next_daily_at LIMIT ?`
    )
    .bind(now, CRON_BATCH)
    .all<DeviceRow>();
  stats.daily = due.length;
  await pool(due, CONCURRENCY, (row) => processDaily(env, row, now, stats, fetchImpl));

  const { results: retries } = await db
    .prepare(
      `SELECT dv.*, x.id AS delivery_id, x.kind, x.scheduled_at, x.attempts
       FROM deliveries x JOIN devices dv ON dv.id = x.device_id
       WHERE x.status = 'retry' AND x.next_attempt_at <= ?
       ORDER BY x.next_attempt_at LIMIT ?`
    )
    .bind(now, CRON_BATCH)
    .all<RetryRow>();
  stats.retried = retries.length;
  await pool(retries, CONCURRENCY, (d) => processRetry(env, d, now, stats, fetchImpl));

  if (new Date(now).getUTCMinutes() % 15 === 0) {
    const { results: candidates } = await db
      .prepare(
        `SELECT d.* FROM devices d
         WHERE d.enabled = 1 AND d.backlog = 1 AND d.snapshot IS NOT NULL AND d.timezone IS NOT NULL
           AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.device_id = d.id)
         LIMIT 500`
      )
      .all<DeviceRow>();
    stats.backlogChecked = candidates.length;
    await pool(candidates, CONCURRENCY, (row) => processBacklog(env, row, now, stats, fetchImpl));
  }

  if (new Date(now).getUTCMinutes() === 0) await maintenance(db, now);
  return stats;
}
