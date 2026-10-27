/**
 * Test doubles: D1 on node:sqlite with the real migrations (each call yields
 * to the event loop like the network D1, so parallel cron runs really
 * interleave; batch is one transaction), and a browser + push service that
 * decrypts payloads exactly like a browser and checks the VAPID JWT.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Result, Env } from '../src/d1.js';
import { b64uDecode, b64uEncode, generateVapidKeys, type Bytes } from '../src/webpush.js';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const tick = () => new Promise((r) => setImmediate(r));

export interface TestD1 extends D1Database {
  q<T = Record<string, unknown>>(sql: string, ...args: unknown[]): T[];
}

export function createD1(): TestD1 {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
  }
  type Arg = string | number | null;
  class Stmt implements D1PreparedStatement {
    constructor(
      readonly sql: string,
      readonly args: Arg[] = []
    ) {}
    bind(...args: unknown[]): Stmt {
      if (args.some((a) => a === undefined)) throw new Error('D1_TYPE_ERROR: undefined bind');
      return new Stmt(this.sql, args as Arg[]);
    }
    exec(): D1Result {
      const s = db.prepare(this.sql);
      if (/^\s*(SELECT|WITH)\b/i.test(this.sql)) {
        return { success: true, results: s.all(...this.args).map((r) => ({ ...r })), meta: {} };
      }
      const r = s.run(...this.args);
      return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    }
    async first<T>(): Promise<T | null> {
      await tick();
      const row = db.prepare(this.sql).get(...this.args);
      return row ? ({ ...row } as T) : null;
    }
    async all<T>(): Promise<D1Result<T>> {
      await tick();
      return this.exec() as D1Result<T>;
    }
    async run(): Promise<D1Result> {
      await tick();
      return this.exec();
    }
  }
  return {
    prepare: (sql: string) => new Stmt(sql),
    async batch(stmts: D1PreparedStatement[]) {
      await tick();
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => (s as Stmt).exec());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    q: <T>(sql: string, ...args: unknown[]) => db.prepare(sql).all(...(args as Arg[])).map((r) => ({ ...r }) as T),
  };
}

const enc = new TextEncoder();
const concat = (...p: Bytes[]) => {
  const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) {
    o.set(x, i);
    i += x.length;
  }
  return o;
};
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, n: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, n * 8));
}

export interface UserAgent {
  privateKey: CryptoKey;
  pub: Bytes;
  authBytes: Bytes;
  p256dh: string;
  auth: string;
}

export async function makeUserAgent(): Promise<UserAgent> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  const authBytes = crypto.getRandomValues(new Uint8Array(16));
  return { privateKey: kp.privateKey, pub, authBytes, p256dh: b64uEncode(pub), auth: b64uEncode(authBytes) };
}

/** Browser-side aes128gcm decryption (RFC 8291). */
export async function decrypt(ua: UserAgent, body: Bytes): Promise<Record<string, unknown>> {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPub = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey } as EcdhKeyDeriveParams, ua.privateKey, 256)
  );
  const ikm = await hkdf(ua.authBytes, secret, concat(enc.encode('WebPush: info\0'), ua.pub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error('bad padding delimiter');
  return JSON.parse(new TextDecoder().decode(plain.slice(0, end)));
}

export async function verifyVapid(authorization: string, publicKey: string, endpoint: string) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(authorization || '');
  if (!m || m[2] !== publicKey) return null;
  const [h, p, s] = m[1]!.split('.') as [string, string, string];
  const key = await crypto.subtle.importKey('raw', b64uDecode(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64uDecode(s), enc.encode(`${h}.${p}`));
  const claims = JSON.parse(new TextDecoder().decode(b64uDecode(p)));
  return ok && claims.aud === new URL(endpoint).origin ? claims : null;
}

export interface PushLogEntry {
  url: string;
  headers: Record<string, string>;
  body: Bytes;
  status: number;
}

/** responder(endpoint, n-th call) → HTTP status or 'network'. */
export function createPushServer(responder: (url: string, n: number) => number | 'network' = () => 201) {
  const log: PushLogEntry[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const n = log.filter((x) => x.url === url).length;
    const entry: PushLogEntry = { url, headers: init.headers as Record<string, string>, body: init.body as Bytes, status: 0 };
    log.push(entry);
    const r = responder(url, n);
    if (r === 'network') throw new TypeError('fetch failed');
    entry.status = r;
    return new Response(null, { status: r });
  }) as unknown as typeof fetch;
  return {
    log,
    fetchImpl,
    set(fn: typeof responder) {
      responder = fn;
    },
  };
}

export async function makeEnv(): Promise<Env & { DB: TestD1 }> {
  const vapid = await generateVapidKeys();
  return {
    DB: createD1(),
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: 'mailto:test@example.com',
    ALLOWED_ORIGINS: 'https://adar4026.github.io,http://localhost:5173',
  };
}
