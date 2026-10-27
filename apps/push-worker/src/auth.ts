/**
 * Device authentication without accounts (as in LexLife). `device_id` is a
 * random UUID made on the device and is not a secret; the secret is a
 * random 32-byte token issued at registration. D1 keeps only its SHA-256.
 * Requests carry `Authorization: Bearer <device_id>.<token>`.
 */
import type { D1Database } from './d1.js';
import { b64uEncode } from './webpush.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export async function sha256Hex(text: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const newToken = (): string => b64uEncode(crypto.getRandomValues(new Uint8Array(32)));

/** Comparison without an early exit (hash lengths are equal). */
export function timingSafeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseAuthorization(header: string | null): { deviceId: string; token: string } | null {
  const m = /^Bearer ([0-9a-f-]{36})\.([A-Za-z0-9_-]+)$/.exec(header ?? '');
  if (!m || !UUID_RE.test(m[1]!) || !TOKEN_RE.test(m[2]!)) return null;
  return { deviceId: m[1]!, token: m[2]! };
}

export interface DeviceRow {
  id: string;
  token_hash: string;
  timezone: string | null;
  enabled: number;
  daily_time: string;
  backlog: number;
  backlog_threshold: number;
  snapshot: string | null;
  snapshot_at: number | null;
  sync_rev: number;
  next_daily_at: number | null;
  last_seen_at: number | null;
  last_test_at: number | null;
  created_at: number;
  updated_at: number;
}

/** The device row, or `null` — the same answer for "no such device" and "wrong token". */
export async function authenticate(request: Request, db: D1Database): Promise<DeviceRow | null> {
  const creds = parseAuthorization(request.headers.get('Authorization'));
  if (!creds) return null;
  const row = await db.prepare('SELECT * FROM devices WHERE id = ?').bind(creds.deviceId).first<DeviceRow>();
  const hash = await sha256Hex(creds.token);
  if (!row || !timingSafeEqual(row.token_hash, hash)) return null;
  return row;
}
