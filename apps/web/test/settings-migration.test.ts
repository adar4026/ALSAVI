import 'fake-indexeddb/auto';
import type { Card, Note } from '@alsavi/engine';
import Dexie, { type EntityTable } from 'dexie';
import { describe, expect, it } from 'vitest';
import { DexieStore } from '../src/dexie-store.js';

/**
 * TASK_020: the additive `version(3)` `settings` table must not disturb an
 * existing user's data. Kept in its own file (rather than alongside
 * settings-store.test.ts) because Dexie caches its `indexedDB` dependency at
 * module-load time — reassigning `globalThis.indexedDB` between tests in the
 * SAME file does not actually isolate them, so this scenario (which needs a
 * database that starts out with no `settings` table at all) must run as the
 * first and only use of the 'alsavi' database name in its file.
 */
describe('AlsaviDB additive version(3) upgrade', () => {
  it('preserves existing notes/cards/reviews from a pre-TASK_020 (version 2) database', async () => {
    // Mirrors the pre-TASK_020 schema exactly (versions 1 and 2 only, same DB
    // name) to simulate an existing user's database before this upgrade.
    class LegacyDB extends Dexie {
      notes!: EntityTable<Note, 'id'>;
      cards!: EntityTable<Card, 'id'>;
      constructor() {
        super('alsavi');
        this.version(1).stores({ cards: 'id, due, deckId', reviews: 'id, cardId, reviewedAt' });
        this.version(2).stores({
          notes: 'id',
          cards: 'id, due, deckId, noteId',
          reviews: 'id, cardId, reviewedAt',
        });
      }
    }

    const legacy = new LegacyDB();
    await legacy.notes.add({ id: 'n1', front: 'A', back: 'a' });
    await legacy.cards.add({
      id: 'c1',
      noteId: 'n1',
      template: 'forward',
      deckId: 'default',
      createdAt: 1000,
      due: 1000,
      state: 'new',
      scheduling: { stability: 0, difficulty: 0, reps: 0, lapses: 0, scheduledDays: 0, learningSteps: 0 },
    });
    legacy.close();

    // Opening the current (version 3) DexieStore against the same fake
    // IndexedDB world must upgrade in place without losing existing rows,
    // and must expose a working, empty settings accessor.
    const store = new DexieStore();
    expect(await store.listNotes()).toEqual([{ id: 'n1', front: 'A', back: 'a' }]);
    expect((await store.listCards()).map((c) => c.id)).toEqual(['c1']);
    expect(await store.getNewCardsPerDay()).toBeNull(); // no row yet -> unlimited
  });
});
