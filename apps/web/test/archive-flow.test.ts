import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { LearningEngine, MemoryStore, StudySession } from '@alsavi/engine';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArchiveFlow } from '../src/archive-flow.js';
import { buildNoteEntries } from '../src/card-list.js';
import { DexieStore } from '../src/dexie-store.js';

afterEach(() => {
  vi.restoreAllMocks();
  const fresh = new IDBFactory();
  globalThis.indexedDB = fresh;
  Dexie.dependencies.indexedDB = fresh;
});

async function seed() {
  const store = new MemoryStore();
  const engine = new LearningEngine(store);
  const word = await engine.addNote({ front: 'la iglesia', back: 'церковь', directions: ['forward', 'reverse'] });
  await engine.review(word.cards[0]!.id, 'again');
  const other = await engine.addNote({ front: 'el piso', back: 'квартира' });
  return { store, engine, word, other };
}

async function snapshot(store: MemoryStore) {
  return { notes: await store.listNotes(), cards: await store.listCards(), reviews: await store.listReviews() };
}

describe('ArchiveFlow', () => {
  it('cancel: the dialog closes and nothing changes', async () => {
    const { store, engine, word } = await seed();
    const before = await snapshot(store);
    const flow = new ArchiveFlow(engine);
    flow.request({ noteId: word.note.id, label: 'la iglesia' });
    expect(flow.getState().pending).toEqual({ noteId: word.note.id, label: 'la iglesia' });
    flow.cancel();
    expect(flow.getState()).toMatchObject({ pending: null, lastArchived: null });
    expect(await snapshot(store)).toEqual(before);
    expect(await flow.confirm()).toBe(false); // nothing pending any more
    expect(await snapshot(store)).toEqual(before);
  });

  it('confirm: archived without deleting anything; out of the study queue; engine invariants hold', async () => {
    const { store, engine, word, other } = await seed();
    const before = await snapshot(store);
    const flow = new ArchiveFlow(engine);
    flow.request({ noteId: word.note.id, label: 'la iglesia' });
    expect(await flow.confirm()).toBe(true);
    expect(flow.getState()).toMatchObject({ pending: null, lastArchived: { noteId: word.note.id } });

    const after = await snapshot(store);
    expect(after.cards).toEqual(before.cards); // no orphan / no deleted card
    expect(after.reviews).toEqual(before.reviews); // Review Log untouched
    expect(after.notes).toHaveLength(before.notes.length);
    // Every card still references an existing note; every review an existing card.
    const noteIds = new Set(after.notes.map((n) => n.id));
    const cardIds = new Set(after.cards.map((c) => c.id));
    expect(after.cards.every((c) => noteIds.has(c.noteId))).toBe(true);
    expect(after.reviews.every((r) => cardIds.has(r.cardId))).toBe(true);

    const session = new StudySession(engine, { now: () => Date.now() + 86_400_000 });
    expect(await session.dueCount()).toBe(1);
    expect((await session.nextCard())!.noteId).toBe(other.note.id);
    const entries = buildNoteEntries(await engine.listCardViews(), Date.now());
    expect(entries.find((e) => e.note.id === word.note.id)!.archived).toBe(true);
  });

  it('"Вернуть" restores the note with its schedule unchanged', async () => {
    const { store, engine, word } = await seed();
    const before = await snapshot(store);
    const flow = new ArchiveFlow(engine);
    flow.request({ noteId: word.note.id, label: 'la iglesia' });
    await flow.confirm();
    expect(await flow.unarchive({ noteId: word.note.id, label: 'la iglesia' })).toBe(true);
    expect(flow.getState().lastArchived).toBeNull();
    expect(await snapshot(store)).toEqual(before);
  });

  it('a failed write keeps the dialog open with an error and changes nothing', async () => {
    const store = new DexieStore();
    const engine = new LearningEngine(store);
    const { note } = await engine.addNote({ front: 'a', back: 'b' });
    vi.spyOn(store, 'putNote').mockRejectedValueOnce(new Error('disk error'));
    const flow = new ArchiveFlow(engine);
    flow.request({ noteId: note.id, label: 'a' });
    expect(await flow.confirm()).toBe(false);
    expect(flow.getState()).toMatchObject({ pending: { noteId: note.id }, busy: false });
    expect(flow.getState().error).toContain('disk error');
    expect((await new LearningEngine(new DexieStore()).getNote(note.id))!.archivedAt).toBeUndefined();
    expect(await flow.confirm()).toBe(true);
  });

  it('archive survives a page reload (fresh DexieStore over the same IndexedDB)', async () => {
    const engine = new LearningEngine(new DexieStore());
    const { note } = await engine.addNote({ front: 'a', back: 'b' });
    const flow = new ArchiveFlow(engine);
    flow.request({ noteId: note.id, label: 'a' });
    await flow.confirm();
    const reloaded = new LearningEngine(new DexieStore());
    expect((await reloaded.getNote(note.id))!.archivedAt).toBeTypeOf('number');
    expect(await reloaded.getDueCards()).toHaveLength(0);
    expect((await reloaded.getStats()).totalCards).toBe(0);
  });
});

describe('pre-TASK_023 rows in IndexedDB', () => {
  it('old notes (no tags/example/memo) open with tags = [], are editable, and keep their card', async () => {
    // Rows written exactly as before TASK_023 — the schema did not change, so
    // existing databases are opened as-is (no Dexie version bump, no reset).
    const old = new DexieStore();
    await old.putNote({ id: 'n1', front: 'la casa', back: 'дом' });
    const card = {
      id: 'c1', noteId: 'n1', template: 'forward' as const, deckId: 'default', createdAt: 1, due: 2, state: 'review' as const,
      scheduling: { stability: 4, difficulty: 5, reps: 3, lapses: 1, scheduledDays: 4, learningSteps: 0, lastReview: 1 },
    };
    await old.putCard(card);

    const engine = new LearningEngine(new DexieStore());
    const [entry] = buildNoteEntries(await engine.listCardViews(), 10);
    expect(entry!.tags).toEqual([]);
    expect(entry!.note).toEqual({ id: 'n1', front: 'la casa', back: 'дом', tags: [] });

    await engine.updateNoteContent('n1', { front: 'la casa', back: 'дом', tags: ['быт'] });
    const reloaded = new DexieStore();
    expect(await reloaded.getNote('n1')).toEqual({ id: 'n1', front: 'la casa', back: 'дом', tags: ['быт'] });
    expect(await reloaded.getCard('c1')).toEqual(card);
  });
});
