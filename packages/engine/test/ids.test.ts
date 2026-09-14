import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningEngine } from '../src/engine.js';
import { generateId, uuidFromBytes } from '../src/ids.js';
import { MemoryStore } from '../src/memory-store.js';

/**
 * Default id generator regression.
 *
 * `crypto.randomUUID()` is undefined in non-secure browser contexts (plain-HTTP
 * LAN dev server) and older Safari/iOS. Before this fix the engine's default
 * `newId` called it unconditionally, so `addNote()` threw *before* touching the
 * store and the UI swallowed the rejection. These tests pin: native path when
 * available, `getRandomValues` fallback otherwise, never `Math.random`.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A browser-shaped `crypto` with ONLY `getRandomValues` (real Node CSPRNG). */
const getRandomValuesOnly = {
  getRandomValues: <T extends ArrayBufferView | null>(array: T): T =>
    webcrypto.getRandomValues(array as unknown as Uint8Array<ArrayBuffer>) as unknown as T,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateId', () => {
  it('uses native crypto.randomUUID when it exists', () => {
    const randomUUID = vi.fn(() => 'native-uuid');
    const getRandomValues = vi.fn();
    vi.stubGlobal('crypto', { randomUUID, getRandomValues });

    expect(generateId()).toBe('native-uuid');
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it('falls back to crypto.getRandomValues when randomUUID is absent', () => {
    const getRandomValues = vi.fn(getRandomValuesOnly.getRandomValues);
    vi.stubGlobal('crypto', { getRandomValues });

    const id = generateId();
    expect(id).toMatch(UUID_V4);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it('fallback ids are unique across many generations', () => {
    vi.stubGlobal('crypto', getRandomValuesOnly);
    const ids = new Set<string>();
    for (let i = 0; i < 2000; i++) ids.add(generateId());
    expect(ids.size).toBe(2000);
  });

  it('fallback sets the RFC 4122 version and variant bits deterministically', () => {
    // All-zero bytes: only the version/variant nibbles may be non-zero.
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(0) });
    expect(generateId()).toBe('00000000-0000-4000-8000-000000000000');
    // All-0xff bytes: version/variant bits are masked down, everything else kept.
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(0xff) });
    expect(generateId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('throws when no cryptographic source exists instead of using Math.random', () => {
    vi.stubGlobal('crypto', undefined);
    const mathRandom = vi.spyOn(Math, 'random');
    expect(() => generateId()).toThrow(/random source/);
    expect(mathRandom).not.toHaveBeenCalled();
    mathRandom.mockRestore();
  });

  it('uuidFromBytes rejects a wrong-length input', () => {
    expect(() => uuidFromBytes(new Uint8Array(15))).toThrow();
  });
});

describe('LearningEngine default id generator', () => {
  it('addNote succeeds and persists without crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', getRandomValuesOnly);
    const store = new MemoryStore();
    const engine = new LearningEngine(store); // no newId injected → default generator

    const { note, cards } = await engine.addNote({
      front: 'der Hund',
      back: 'собака',
      directions: ['forward', 'reverse'],
    });

    expect(note.id).toMatch(UUID_V4);
    expect(cards).toHaveLength(2);
    for (const c of cards) expect(c.id).toMatch(UUID_V4);
    expect(new Set([note.id, ...cards.map((c) => c.id)]).size).toBe(3);
    expect(await store.getNote(note.id)).toEqual(note);
    expect(await store.listCards()).toHaveLength(2);
  });

  it('review also gets a fallback id (same generator) without crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', getRandomValuesOnly);
    const store = new MemoryStore();
    const engine = new LearningEngine(store);
    const card = await engine.addCard({ front: 'a', back: 'b' });

    const { review } = await engine.review(card.id, 'good');
    expect(review.id).toMatch(UUID_V4);
    expect(await store.listReviews()).toHaveLength(1);
  });

  it('addNote uses native crypto.randomUUID when present', async () => {
    let seq = 0;
    const randomUUID = vi.fn(() => `native-${seq++}`);
    vi.stubGlobal('crypto', { randomUUID, ...getRandomValuesOnly });
    const engine = new LearningEngine(new MemoryStore());

    const card = await engine.addCard({ front: 'a', back: 'b' });

    expect(card.noteId).toBe('native-0');
    expect(card.id).toBe('native-1');
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });
});
