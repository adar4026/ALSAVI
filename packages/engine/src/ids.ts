/**
 * Default id generator for notes, cards and reviews.
 *
 * `crypto.randomUUID()` is the preferred source, but browsers expose it only
 * in secure contexts (HTTPS / localhost) and only since Safari 15.4 / Chrome
 * 92 / Firefox 95. On a plain-HTTP LAN dev server or an older iOS Safari it is
 * simply `undefined`, and the engine would throw before writing anything.
 *
 * `crypto.getRandomValues()` is available everywhere (secure or not, far
 * older browsers, Node), so it backs an RFC 4122 v4 UUID built by hand in the
 * exact same canonical format — ids from either path are indistinguishable and
 * carry the same 122 bits of randomness. `Math.random()` is never used: ids are
 * permanent keys and must not depend on a non-cryptographic source.
 */

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
};

function cryptoSource(): CryptoLike | undefined {
  return (globalThis as { crypto?: CryptoLike }).crypto;
}

/** Format 16 random bytes as a canonical, lowercase RFC 4122 v4 UUID. */
export function uuidFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error('uuidFromBytes expects exactly 16 bytes');
  }
  const b = Uint8Array.from(bytes);
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10xx
  const h = (i: number) => HEX[b[i]!]!;
  return (
    h(0) + h(1) + h(2) + h(3) + '-' +
    h(4) + h(5) + '-' +
    h(6) + h(7) + '-' +
    h(8) + h(9) + '-' +
    h(10) + h(11) + h(12) + h(13) + h(14) + h(15)
  );
}

/**
 * Generate a fresh UUID: native `crypto.randomUUID()` when present, otherwise
 * a v4 UUID from `crypto.getRandomValues()`. Throws when neither exists —
 * refusing to save is safer than minting an id from a weak source.
 */
export function generateId(): string {
  const c = cryptoSource();
  if (typeof c?.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (typeof c?.getRandomValues === 'function') {
    return uuidFromBytes(c.getRandomValues(new Uint8Array(16)));
  }
  throw new Error('No cryptographic random source available to generate an id');
}
