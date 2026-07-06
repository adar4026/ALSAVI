import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  LearningEngine,
  MemoryStore,
  type Card,
  type CollectionData,
  type Note,
} from '@alsavi/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { DexieStore } from '../src/dexie-store.js';

/**
 * Cross-adapter ordering regression (TASK_014).
 *
 * The public contract requires every EngineStore to enumerate cards in the same
 * deterministic total order: ascending by `card.id`. Before TASK_014 the order
 * was unspecified — MemoryStore returned Map insertion order and DexieStore
 * returned primary-key order, so identical data enumerated differently and the
 * length-only MockProvider tests never caught it. These tests pin the contract.
 *
 * The fixture is fully deterministic: fixed ids whose insertion/array order
 * deliberately does NOT match their id order, so a regression back to insertion
 * order would fail here.
 */

const NOTES: Note[] = [
  { id: 'n-1', front: 'A', back: 'a' },
  { id: 'n-2', front: 'B', back: 'b' },
  { id: 'n-3', front: 'C', back: 'c' },
];

function card(id: string, noteId: string): Card {
  return {
    id,
    noteId,
    template: 'forward',
    deckId: 'default',
    createdAt: 1000,
    due: 1000,
    state: 'new',
    scheduling: {
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      scheduledDays: 0,
      learningSteps: 0,
    },
  };
}

// Array order (c-3, c-1, c-2) is intentionally NOT the id order (c-1, c-2, c-3).
const FIXTURE: CollectionData = {
  notes: NOTES,
  cards: [card('c-3', 'n-3'), card('c-1', 'n-1'), card('c-2', 'n-2')],
  reviews: [],
};

const EXPECTED_ID_ORDER = ['c-1', 'c-2', 'c-3'];
const EXPECTED_FRONT_ORDER = ['A', 'B', 'C'];

// Reset the IndexedDB world between tests so each DexieStore starts clean.
afterEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('EngineStore ordering contract (TASK_014)', () => {
  it('the fixture is meaningful: array order differs from id order', () => {
    const arrayOrder = FIXTURE.cards.map((c) => c.id);
    expect(arrayOrder).not.toEqual([...arrayOrder].sort());
  });

  it('MemoryStore and DexieStore return the SAME card order for identical data', async () => {
    const mem = new MemoryStore();
    await mem.replaceAll(FIXTURE);
    const dex = new DexieStore();
    await dex.replaceAll(FIXTURE);

    const memIds = (await mem.listCards()).map((c) => c.id);
    const dexIds = (await dex.listCards()).map((c) => c.id);

    expect(memIds).toEqual(dexIds);
    expect(memIds).toEqual(EXPECTED_ID_ORDER);
  });

  it('listCardViews inherits the same id-order across adapters', async () => {
    const mem = new MemoryStore();
    await mem.replaceAll(FIXTURE);
    const dex = new DexieStore();
    await dex.replaceAll(FIXTURE);

    const memFronts = (await new LearningEngine(mem).listCardViews()).map((v) => v.front);
    const dexFronts = (await new LearningEngine(dex).listCardViews()).map((v) => v.front);

    expect(memFronts).toEqual(dexFronts);
    expect(memFronts).toEqual(EXPECTED_FRONT_ORDER);
  });
});
