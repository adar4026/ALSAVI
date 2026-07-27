import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import type { CollectionData } from '@alsavi/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { DexieStore } from '../src/dexie-store.js';

/**
 * `settings` table / daily new-card limit persistence (TASK_020).
 *
 * The setting lives in the SAME `AlsaviDB` instance/connection as engine data
 * (additive `version(3)`), deliberately outside the `EngineStore` port and
 * outside `replaceAll`'s table set — these tests pin exactly that contract.
 */

// Reset the IndexedDB world between tests so each test starts clean.
afterEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('DexieStore daily new-card limit setting', () => {
  it('an absent setting reads back as unlimited (null)', async () => {
    const store = new DexieStore();
    expect(await store.getNewCardsPerDay()).toBeNull();
  });

  it('null, 0, and a positive integer all round-trip correctly', async () => {
    const store = new DexieStore();

    await store.setNewCardsPerDay(0);
    expect(await store.getNewCardsPerDay()).toBe(0);

    await store.setNewCardsPerDay(20);
    expect(await store.getNewCardsPerDay()).toBe(20);

    await store.setNewCardsPerDay(null);
    expect(await store.getNewCardsPerDay()).toBeNull();
  });

  it('the setting survives adapter reconstruction (simulated app reload)', async () => {
    const first = new DexieStore();
    await first.setNewCardsPerDay(5);

    // A brand-new DexieStore instance, same underlying (fake) IndexedDB —
    // simulates the app being reloaded.
    const second = new DexieStore();
    expect(await second.getNewCardsPerDay()).toBe(5);
  });

  it('replaceAll (backup restore) does not reset the setting', async () => {
    const store = new DexieStore();
    await store.setNewCardsPerDay(3);

    const data: CollectionData = { notes: [], cards: [], reviews: [] };
    await store.replaceAll(data);

    expect(await store.getNewCardsPerDay()).toBe(3);
  });
});
