/**
 * Web Push without external libraries — WebCrypto only (Cloudflare Workers
 * and Node both have it). Ported from LexLife's proven worker/webpush.js.
 *  - VAPID (RFC 8292): ES256 JWT, `Authorization: vapid t=…, k=…`
 *  - payload encryption (RFC 8291 + RFC 8188, aes128gcm)
 * Secrets (VAPID private key, subscription keys) are never logged.
 */

const enc = new TextEncoder();

/** Bytes backed by a plain ArrayBuffer — what WebCrypto and fetch accept. */
export type Bytes = Uint8Array<ArrayBuffer>;

export function b64uEncode(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(str: string): Bytes {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_\-=\s]*$/.test(str)) throw new Error('bad base64url');
  const s = str.replace(/\s+/g, '').replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const concat = (...parts: Bytes[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** p256dh — uncompressed P-256 point (65 bytes, 0x04…), auth — 16 bytes. */
export function validSubscriptionKeys(p256dh: unknown, auth: unknown): boolean {
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return false;
  try {
    const p = b64uDecode(p256dh);
    const a = b64uDecode(auth);
    return p.length === 65 && p[0] === 4 && a.length === 16;
  } catch {
    return false;
  }
}

/** RFC 8291 §3.4: payload → aes128gcm request body. */
export async function encryptPayload(plaintext: string, p256dhB64u: string, authB64u: string): Promise<Bytes> {
  const uaPublic = b64uDecode(p256dhB64u);
  const authSecret = b64uDecode(authB64u);
  const asKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', asKeys.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as EcdhKeyDeriveParams, asKeys.privateKey, 256)
  );

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const data = enc.encode(plaintext);
  if (data.length > 3800) throw new Error('payload too large');
  const padded = concat(data, new Uint8Array([2])); // single record: delimiter 0x02
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, padded));

  const rs = 4096;
  const header = concat(
    salt,
    new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255, asPublic.length]),
    asPublic
  );
  return concat(header, cipher);
}

export interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** VAPID private key — base64url 32 bytes (d), public — base64url 65 bytes. */
export async function importVapidKey(publicB64u: string, privateB64u: string): Promise<CryptoKey> {
  const pub = b64uDecode(publicB64u);
  const d = b64uDecode(privateB64u);
  if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) throw new Error('VAPID keys have wrong format');
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: b64uEncode(pub.slice(1, 33)),
    y: b64uEncode(pub.slice(33, 65)),
    d: b64uEncode(d),
    ext: false,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** ES256 JWT for the push service origin (aud). Cached for the isolate's lifetime. */
const jwtCache = new Map<string, { exp: number; header: string }>();
export async function vapidAuthorization(endpoint: string, vapid: Vapid, nowMs = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const cacheKey = `${aud}|${vapid.publicKey}|${vapid.subject}`;
  const hit = jwtCache.get(cacheKey);
  if (hit && hit.exp - 3600 > nowMs / 1000) return hit.header;
  const exp = Math.floor(nowMs / 1000) + 12 * 3600; // ≤ 24 h (RFC 8292)
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64uEncode(enc.encode(JSON.stringify({ aud, exp, sub: vapid.subject })));
  const key = await importVapidKey(vapid.publicKey, vapid.privateKey);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)));
  const header = `vapid t=${head}.${body}.${b64uEncode(sig)}, k=${vapid.publicKey}`;
  jwtCache.set(cacheKey, { exp, header });
  return header;
}

/** Browser push-service hosts. Requests to arbitrary URLs are refused (SSRF). */
const PUSH_HOSTS = [
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isAllowedEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname));
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushOutcome = 'ok' | 'gone' | 'retry' | 'error';

export interface SendOptions {
  ttl: number;
  topic?: string;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  fetchImpl?: typeof fetch;
  nowMs?: number;
}

/** Send one push. Network failure → `retry` with status 0. Nothing secret is returned. */
export async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: unknown,
  vapid: Vapid,
  { ttl, topic, urgency = 'high', fetchImpl = fetch, nowMs }: SendOptions
): Promise<{ kind: PushOutcome; status: number }> {
  const body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
  const headers: Record<string, string> = {
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(ttl),
    Urgency: urgency,
    Authorization: await vapidAuthorization(sub.endpoint, vapid, nowMs),
  };
  // ≤ 32 base64url chars: the push service replaces an undelivered message with the same topic.
  if (topic) headers.Topic = topic;
  let res: Response;
  try {
    res = await fetchImpl(sub.endpoint, { method: 'POST', headers, body });
  } catch {
    return { kind: 'retry', status: 0 };
  }
  const status = res.status;
  try {
    await res.body?.cancel();
  } catch {
    /* the response body is not needed */
  }
  if (status >= 200 && status < 300) return { kind: 'ok', status };
  if (status === 404 || status === 410) return { kind: 'gone', status };
  if (status === 429 || status >= 500) return { kind: 'retry', status };
  return { kind: 'error', status };
}

/** A VAPID key pair (scripts/gen-vapid.mjs, tests). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', kp.privateKey)) as JsonWebKey;
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  return { publicKey: b64uEncode(pub), privateKey: jwk.d! };
}
