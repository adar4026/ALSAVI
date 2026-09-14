import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { LearningEngine } from '@alsavi/engine';
import Dexie from 'dexie';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DexieStore } from '../src/dexie-store.js';

/**
 * UI → `LearningEngine.addNote()` → IndexedDB, with the engine's DEFAULT id
 * generator (exactly how `App.tsx` constructs the engine — no `newId`
 * injected). Regression for the `crypto.randomUUID is not a function` failure
 * in non-secure contexts / older Safari: the note must be persisted and
 * readable through a fresh adapter instance (a "reload") on both id paths.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A browser-shaped `crypto` with ONLY `getRandomValues` (real Node CSPRNG). */
const getRandomValuesOnly = {
  getRandomValues: <T extends ArrayBufferView | null>(array: T): T =>
    webcrypto.getRandomValues(array as unknown as Uint8Array<ArrayBuffer>) as unknown as T,
};

// Dexie resolves `indexedDB` from `Dexie.dependencies` when a DB instance is
// constructed, not from `globalThis` — reset both so every test gets a truly
// empty 'alsavi' database.
afterEach(() => {
  vi.unstubAllGlobals();
  const fresh = new IDBFactory();
  globalThis.indexedDB = fresh;
  Dexie.dependencies.indexedDB = fresh;
});

async function addAndReload() {
  const engine = new LearningEngine(new DexieStore());
  const { note, cards } = await engine.addNote({
    front: 'der Hund',
    back: 'собака',
    directions: ['forward', 'reverse'],
  });

  // Fresh adapter + engine over the same IndexedDB = what a page reload sees.
  const reloaded = new LearningEngine(new DexieStore());
  return { note, cards, reloaded };
}

describe('addNote persists to IndexedDB with the default id generator', () => {
  it('with native crypto.randomUUID available', async () => {
    expect(typeof crypto.randomUUID).toBe('function');
    const { note, cards, reloaded } = await addAndReload();

    expect(note.id).toMatch(UUID_V4);
    expect(await reloaded.getNote(note.id)).toEqual(note);
    const views = await reloaded.listCardViews();
    expect(views.map((v) => v.card.id).sort()).toEqual(cards.map((c) => c.id).sort());
    expect(views.every((v) => v.card.noteId === note.id)).toBe(true);
  });

  it('without crypto.randomUUID (getRandomValues fallback)', async () => {
    vi.stubGlobal('crypto', getRandomValuesOnly);
    expect(typeof crypto.randomUUID).toBe('undefined');
    const { note, cards, reloaded } = await addAndReload();

    expect(note.id).toMatch(UUID_V4);
    expect(cards.map((c) => c.id)).toSatisfy((ids: string[]) => ids.every((id) => UUID_V4.test(id)));
    expect(await reloaded.getNote(note.id)).toEqual(note);
    expect((await reloaded.listCards()).map((c) => c.id).sort()).toEqual(cards.map((c) => c.id).sort());
    expect((await reloaded.getStats()).totalCards).toBe(2);
  });

  it('a note added before randomUUID vanished keeps its id and coexists with fallback ids', async () => {
    const first = new LearningEngine(new DexieStore());
    const a = await first.addCard({ front: 'a', back: '1' });

    vi.stubGlobal('crypto', getRandomValuesOnly);
    const second = new LearningEngine(new DexieStore());
    const b = await second.addCard({ front: 'b', back: '2' });

    expect(a.id).not.toBe(b.id);
    expect(await second.getCard(a.id)).toEqual(a);
    expect(await second.getCard(b.id)).toEqual(b);
    expect(await second.listCards()).toHaveLength(2);
  });
});
