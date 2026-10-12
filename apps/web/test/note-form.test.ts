import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { LearningEngine, MemoryStore, StudySession, type Card } from '@alsavi/engine';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DexieStore } from '../src/dexie-store.js';
import { draftFromNote, EMPTY_DRAFT, NoteFormController } from '../src/note-form.js';

/**
 * TASK_023 add/edit flow, headless: `NoteFormController` over a real
 * `LearningEngine` (MemoryStore, or DexieStore on fake-indexeddb for the
 * IndexedDB failure and reload cases).
 */

afterEach(() => {
  vi.restoreAllMocks();
  const fresh = new IDBFactory();
  globalThis.indexedDB = fresh;
  Dexie.dependencies.indexedDB = fresh;
});

function memoryEngine() {
  const store = new MemoryStore();
  return { store, engine: new LearningEngine(store) };
}

describe('create', () => {
  it('saves all fields, clears the text afterwards but keeps tags and the reverse toggle', async () => {
    const { engine } = memoryEngine();
    const form = new NoteFormController(engine, { kind: 'create' });
    form.update({
      front: 'la escritura',
      back: 'купчая',
      example: 'Firmamos la escritura.',
      memo: 'у нотариуса',
      tags: 'Недвижимость, документы, недвижимость',
      alsoReverse: true,
    });
    expect(await form.submit()).toBe('saved');

    const [view] = await engine.listCardViews();
    expect(view!.note).toMatchObject({
      front: 'la escritura',
      back: 'купчая',
      example: 'Firmamos la escritura.',
      memo: 'у нотариуса',
      tags: ['недвижимость', 'документы'],
    });
    expect(await engine.listCards()).toHaveLength(2);
    expect(form.getState().draft).toEqual({ ...EMPTY_DRAFT, tags: 'недвижимость, документы', alsoReverse: true });
    expect(form.getState().lastSaved!.id).toBe(view!.note.id);
  });

  it('required fields: clear per-field messages, nothing saved, text kept', async () => {
    const { engine } = memoryEngine();
    const form = new NoteFormController(engine, { kind: 'create' });
    form.update({ front: '  ', back: '', example: 'ejemplo' });
    expect(await form.submit()).toBe('invalid');
    expect(form.getState().fieldErrors).toEqual({ front: 'Введите слово или фразу.', back: 'Введите перевод.' });
    expect(form.getState().draft.example).toBe('ejemplo');
    expect(await engine.listCards()).toHaveLength(0);
    form.update({ front: 'x' });
    expect(form.getState().fieldErrors).toEqual({ back: 'Введите перевод.' });
  });

  it('duplicate warning keeps the text; the user can still add it', async () => {
    const { engine } = memoryEngine();
    const existing = await engine.addNote({ front: 'la práctica', back: 'практика' });
    const form = new NoteFormController(engine, { kind: 'create' });
    form.update({ front: ' La Practica ', back: 'ПРАКТИКА', example: 'otra frase', tags: 'разговорный' });

    expect(await form.submit()).toBe('duplicate');
    const s = form.getState();
    expect(s.status).toBe('duplicate');
    expect(s.duplicate!.note.id).toBe(existing.note.id);
    expect(s.draft.front).toBe(' La Practica ');
    expect(s.draft.example).toBe('otra frase');
    expect(await engine.listCards()).toHaveLength(1); // nothing written yet

    expect(await form.saveAnyway()).toBe('saved');
    expect(await engine.listCards()).toHaveLength(2);
  });

  it('dismissing the warning or changing the word keeps the text and writes nothing', async () => {
    const { engine } = memoryEngine();
    await engine.addNote({ front: 'el piso', back: 'квартира' });
    const form = new NoteFormController(engine, { kind: 'create' });
    form.update({ front: 'el piso', back: 'квартира' });
    expect(await form.submit()).toBe('duplicate');
    form.dismissDuplicate();
    expect(form.getState()).toMatchObject({ status: 'editing', duplicate: null, draft: { front: 'el piso' } });

    expect(await form.submit()).toBe('duplicate');
    form.update({ back: 'этаж' }); // now a different meaning
    expect(form.getState().status).toBe('editing');
    expect(await form.submit()).toBe('saved');
    expect(await engine.listCards()).toHaveLength(2);
  });

  it('a second submit while saving is ignored (one note, not two)', async () => {
    const { engine } = memoryEngine();
    const form = new NoteFormController(engine, { kind: 'create' });
    form.update({ front: 'a', back: 'b' });
    const [first, second] = await Promise.all([form.submit(), form.submit()]);
    expect([first, second]).toEqual(['saved', 'busy']);
    expect(await engine.listCards()).toHaveLength(1);
  });
});

describe('IndexedDB write failure', () => {
  it('create: error shown, form and data kept, retry succeeds', async () => {
    const store = new DexieStore();
    const engine = new LearningEngine(store);
    vi.spyOn(store, 'putNote').mockRejectedValueOnce(new Error('QuotaExceededError'));
    const form = new NoteFormController(engine, { kind: 'create' });
    form.update({ front: 'el contrato', back: 'договор', tags: 'документы' });

    expect(await form.submit()).toBe('error');
    expect(form.getState().error).toContain('QuotaExceededError');
    expect(form.getState().status).toBe('editing');
    expect(form.getState().draft).toMatchObject({ front: 'el contrato', back: 'договор', tags: 'документы' });
    expect(await new LearningEngine(new DexieStore()).listCards()).toHaveLength(0);

    expect(await form.submit()).toBe('saved');
    expect(form.getState().error).toBeNull();
    const reloaded = new LearningEngine(new DexieStore());
    expect((await reloaded.listCardViews())[0]!.note.tags).toEqual(['документы']);
  });

  it('edit: error shown, typed changes kept, stored note unchanged', async () => {
    const store = new DexieStore();
    const engine = new LearningEngine(store);
    const { note } = await engine.addNote({ front: 'el piso', back: 'квартира' });
    vi.spyOn(store, 'putNote').mockRejectedValueOnce(new Error('disk error'));
    const form = new NoteFormController(engine, { kind: 'edit', noteId: note.id }, draftFromNote(note));
    form.update({ back: 'квартира, этаж' });

    expect(await form.submit()).toBe('error');
    expect(form.getState().draft.back).toBe('квартира, этаж');
    expect((await new LearningEngine(new DexieStore()).getNote(note.id))!.back).toBe('квартира');
    expect(await form.submit()).toBe('saved');
  });
});

describe('edit keeps identity, schedule and history — and survives a reload', () => {
  it('same id, no new note/card, scheduling and Review Log intact after reload; learning continues identically', async () => {
    let t = new Date('2026-09-01T10:00:00Z').getTime();
    const engine = new LearningEngine(new DexieStore(), { now: () => t });
    const { note, cards } = await engine.addNote({ front: 'alquilar', back: 'снимать', tags: ['глаголы'] });
    const cardId = cards[0]!.id;
    await engine.review(cardId, 'good');
    t += 10 * 60 * 1000;
    await engine.review(cardId, 'good');

    const before = await engine.getCard(cardId);
    const reviewsBefore = await new DexieStore().listReviews();

    // Edit (no duplicate check against itself, no write outside the note).
    const form = new NoteFormController(engine, { kind: 'edit', noteId: note.id }, draftFromNote((await engine.getNote(note.id))!));
    expect(form.getState().draft.tags).toBe('глаголы');
    form.update({ front: 'alquilar un piso', example: 'Quiero alquilar un piso.', tags: 'глаголы, недвижимость' });
    expect(await form.submit()).toBe('saved');

    // "Page reload": fresh adapter + engine over the same IndexedDB.
    const reloadedStore = new DexieStore();
    const reloaded = new LearningEngine(reloadedStore, { now: () => t });
    expect(await reloadedStore.listNotes()).toHaveLength(1);
    expect(await reloadedStore.listCards()).toHaveLength(1);
    expect(await reloaded.getNote(note.id)).toMatchObject({
      id: note.id,
      front: 'alquilar un piso',
      example: 'Quiero alquilar un piso.',
      tags: ['глаголы', 'недвижимость'],
    });
    expect(await reloaded.getCard(cardId)).toEqual(before);
    expect(await reloadedStore.listReviews()).toEqual(reviewsBefore);
    expect(await reloaded.rebuildCardState(cardId)).toEqual(before);

    // Keeps learning exactly as an unedited twin with the same history would.
    const twin = new LearningEngine(new MemoryStore(), { now: () => t });
    const twinCard = await replay(twin, reviewsBefore.map((r) => [r.rating, r.reviewedAt] as const), (v) => (t = v));
    t = before!.due + 60 * 1000;
    const session = new StudySession(reloaded, { now: () => t });
    expect((await session.nextCard())!.id).toBe(cardId);
    const after = await session.answer(cardId, 'good');
    const twinAfter = await twin.review(twinCard.id, 'good');
    expect(after.card.due).toBe(twinAfter.card.due);
    expect(after.card.scheduling).toEqual(twinAfter.card.scheduling);
  });
});

async function replay(
  engine: LearningEngine,
  history: ReadonlyArray<readonly ['again' | 'hard' | 'good' | 'easy', number]>,
  setTime: (t: number) => void
): Promise<Card> {
  setTime(history[0]![1]);
  const card = await engine.addCard({ front: 'twin', back: 'twin' });
  for (const [rating, at] of history) {
    setTime(at);
    await engine.review(card.id, rating);
  }
  return card;
}
