/**
 * Sending a push to a device and keeping its subscription honest.
 *
 * A subscription is removed ONLY when the push service confirms it is gone
 * (404/410), on explicit unsubscribe, or when the device subscribes again.
 * Other failures (400/403/429/5xx/network) are only counted: a passing
 * outage must not silently switch reminders off.
 */

import { REVIEW_TAG, REVIEW_URL, reminderText, type ReminderKind } from '@alsavi/reminders';
import type { D1Database, Env } from './d1.js';
import { log } from './log.js';
import { sendWebPush, type PushOutcome, type Vapid } from './webpush.js';

export class ConfigError extends Error {
  readonly code = 'push_not_configured';
}

export function vapidFromEnv(env: Env): Vapid {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) throw new ConfigError('VAPID is not configured');
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
}

export interface SubscriptionRow {
  id: number;
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export const subscriptionOf = (db: D1Database, deviceId: string) =>
  db.prepare('SELECT * FROM push_subscriptions WHERE device_id = ?').bind(deviceId).first<SubscriptionRow>();

export interface ReviewPayload {
  v: 1;
  kind: ReminderKind;
  title: string;
  body: string;
  url: string;
  tag: string;
  count: number;
}

export function reviewPayload(kind: ReminderKind, count: number): ReviewPayload {
  return { v: 1, kind, ...reminderText(kind, count), url: REVIEW_URL, tag: REVIEW_TAG, count };
}

/**
 * Web Push `Topic` shared by all review reminders: an undelivered older one is
 * replaced, not stacked. Apple refuses short readable topics such as
 * 'alsavi-review' (400 BadWebPushTopic, seen in production 2026-10-27); this is
 * the LexLife-proven form — base64url of the first 24 bytes of
 * SHA-256('alsavi-review'), exactly 32 characters.
 */
export const REVIEW_TOPIC = 'p0qVtlGQLnzQYnTNVNrNzC7agQ5EUT4A';

export type DeliveryOutcome = { kind: PushOutcome | 'no_subscription'; status: number; reason?: string };

export async function pushToDevice(
  env: Env,
  deviceId: string,
  payload: ReviewPayload,
  { now, ttl, fetchImpl = fetch }: { now: number; ttl: number; fetchImpl?: typeof fetch }
): Promise<DeliveryOutcome> {
  const vapid = vapidFromEnv(env);
  const db = env.DB;
  const sub = await subscriptionOf(db, deviceId);
  if (!sub) return { kind: 'no_subscription', status: 0 };
  const r = await sendWebPush(sub, payload, vapid, { ttl, topic: REVIEW_TOPIC, fetchImpl, nowMs: now });
  if (r.kind !== 'ok') {
    const host = new URL(sub.endpoint).hostname;
    log('push_refused', { device: deviceId, kind: payload.kind, outcome: r.kind, status: r.status, reason: r.reason, host });
  }
  if (r.kind === 'ok') {
    await db
      .prepare('UPDATE push_subscriptions SET last_success_at = ?, failure_count = 0, updated_at = ? WHERE id = ?')
      .bind(now, now, sub.id)
      .run();
  } else if (r.kind === 'gone') {
    await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
  } else {
    await db
      .prepare('UPDATE push_subscriptions SET failure_count = failure_count + 1, last_failure_at = ?, updated_at = ? WHERE id = ?')
      .bind(now, now, sub.id)
      .run();
  }
  return r;
}
