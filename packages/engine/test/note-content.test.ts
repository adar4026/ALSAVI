import { describe, expect, it } from 'vitest';
import { LearningEngine } from '../src/engine.js';
import { MemoryStore } from '../src/memory-store.js';
import { StudySession } from '../src/study-session.js';
import { normalizeTags } from '../src/tags.js';

/**
 * TASK_023: optional note fields (example, memo, tags), editing without
 * touching scheduling/history, and archiving as the safe "remove from the
 * active collection" action.
 */

const T0 = new Date('2026-07-01T10:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function makeEngine(clock: { t: number } = { t: T0 }) {
  let seq = 0;
  const store = new MemoryStore();
  const engine = new LearningEngine(store, {
    now: () => clock.t,
    newId: () => `id-${String(seq++).padStart(3, '0')}`,
  });
  return { engine, store, clock };
}

describe('normalizeTags', () => {
  it('trims, collapses whitespace, lower-cases, drops empties and duplicates', () => {
    expect(normalizeTags(['  Недвижимость ', 'разговорный', '', '   ', 'НЕДВИЖИМОСТЬ', 'путешествия  по  испании']))
      .toEqual(['недвижимость', 'разговорный', 'путешествия по испании']);
  });

  it('drops a leading # and keeps first-occurrence order', () => {
    expect(normalizeTags(['#глаголы', 'документы', 'глаголы', '# церковь'])).toEqual(['глаголы', 'документы', 'церковь']);
  });

  it('treats NFC/NFD spellings of the same tag as one', () => {
    expect(normalizeTags(['español', 'español'])).toEqual(['español']);
  });
});

describe('note content fields', () => {
  it('a note stored before TASK_023 (no tags/example/memo) reads with tags = []', async () => {
    const { engine, store } = makeEngine();
    // Exactly the shape of a pre-TASK_023 row: no optional fields at all.
    await store.putNote({ id: 'old-note', front: 'la casa', back: 'дом' });
    await store.putCard({
      id: 'old-card',
      noteId: 'old-note',
      template: 'forward',
      deckId: 'default',
      createdAt: T0,
      due: T0,
      state: 'new',
      scheduling: { stability: 0, difficulty: 0, reps: 0, lapses: 0, scheduledDays: 0, learningSteps: 0 },
    });

    const note = await engine.getNote('old-note');
    expect(note).toEqual({ id: 'old-note', front: 'la casa', back: 'дом', tags: [] });
    const [view] = await engine.listCardViews();
    expect(view!.note.tags).toEqual([]);
    expect(view!.note.example).toBeUndefined();
    expect((await engine.getCardView('old-card'))!.note.tags).toEqual([]);
    // The stored row itself is not rewritten by reading it.
    expect(await store.getNote('old-note')).toEqual({ id: 'old-note', front: 'la casa', back: 'дом' });
  });

  it('addNote stores example, memo and normalized tags; empty optional text is omitted', async () => {
    const { engine } = makeEngine();
    const { note } = await engine.addNote({
      front: ' la práctica ',
      back: 'практика',
      example: '  La práctica hace al maestro. ',
      memo: '   ',
      tags: ['Разговорный', ' разговорный', '#Глаголы', ''],
    });
    expect(note).toEqual({
      id: note.id,
      front: 'la práctica',
      back: 'практика',
      example: 'La práctica hace al maestro.',
      tags: ['разговорный', 'глаголы'],
    });
    expect(await engine.getNote(note.id)).toEqual(note);
    const [view] = await engine.listCardViews();
    expect(view!.note).toEqual(note);
    // Card content rendering is unchanged by the new fields.
    expect(view!.front).toBe('la práctica');
    expect(view!.back).toBe('практика');
  });

  it('addNote without new fields still works and gets tags = []', async () => {
    const { engine } = makeEngine();
    const card = await engine.addCard({ front: 'el perro', back: 'собака' });
    expect(await engine.getNote(card.noteId)).toEqual({ id: card.noteId, front: 'el perro', back: 'собака', tags: [] });
  });
});

describe('updateNoteContent keeps identity, schedule and history', () => {
  it('updates the same note id; cards, scheduling and Review Log are untouched', async () => {
    const { engine, store, clock } = makeEngine();
    const { note, cards } = await engine.addNote({
      front: 'alquilar',
      back: 'арендовать',
      tags: ['недвижимость'],
      directions: ['forward', 'reverse'],
    });
    await engine.review(cards[0]!.id, 'good');
    clock.t += 15 * 60 * 1000;
    await engine.review(cards[0]!.id, 'good');
    await engine.review(cards[1]!.id, 'again');

    const cardsBefore = await store.listCards();
    const reviewsBefore = await store.listReviews();
    const notesBefore = await store.listNotes();

    clock.t += DAY;
    const updated = await engine.updateNoteContent(note.id, {
      front: 'alquilar (un piso)',
      back: 'снимать (квартиру)',
      example: 'Quiero alquilar un piso en Madrid.',
      memo: 'не путать с comprar',
      tags: ['недвижимость', 'Глаголы'],
    });

    expect(updated.id).toBe(note.id);
    expect(await store.listNotes()).toHaveLength(notesBefore.length);
    expect(await store.listCards()).toEqual(cardsBefore); // due, state, scheduling identical
    expect(await store.listReviews()).toEqual(reviewsBefore); // append-only log not rewritten
    expect(await engine.getNote(note.id)).toEqual({
      id: note.id,
      front: 'alquilar (un piso)',
      back: 'снимать (квартиру)',
      example: 'Quiero alquilar un piso en Madrid.',
      memo: 'не путать с comprar',
      tags: ['недвижимость', 'глаголы'],
    });
    // Both sibling cards render the new content.
    const views = await engine.listCardViews();
    expect(views.map((v) => v.front).sort()).toEqual(['alquilar (un piso)', 'снимать (квартиру)']);
    // Replay from the log still reproduces the cached state.
    for (const c of cardsBefore) {
      expect(await engine.rebuildCardState(c.id)).toEqual(c);
    }
  });

  it('omitted optional fields keep their value; an empty string clears it', async () => {
    const { engine } = makeEngine();
    const { note } = await engine.addNote({ front: 'a', back: 'b', example: 'ej', memo: 'm', tags: ['x'] });
    const kept = await engine.updateNoteContent(note.id, { front: 'a2', back: 'b2' });
    expect(kept).toMatchObject({ front: 'a2', back: 'b2', example: 'ej', memo: 'm', tags: ['x'] });
    const cleared = await engine.updateNoteContent(note.id, { front: 'a2', back: 'b2', example: ' ', memo: '', tags: [] });
    expect(cleared).toEqual({ id: note.id, front: 'a2', back: 'b2', tags: [] });
  });

  it('editing an old note without tags works and does not touch its card', async () => {
    const { engine, store } = makeEngine();
    await store.putNote({ id: 'old', front: 'viejo', back: 'старый' });
    const card = {
      id: 'old-c',
      noteId: 'old',
      template: 'forward' as const,
      deckId: 'default',
      createdAt: T0,
      due: T0 + 3 * DAY,
      state: 'review' as const,
      scheduling: { stability: 3, difficulty: 5, reps: 2, lapses: 0, scheduledDays: 3, learningSteps: 0, lastReview: T0 },
    };
    await store.putCard(card);
    await engine.updateNoteContent('old', { front: 'viejo', back: 'старый', tags: ['прилагательные'] });
    expect(await store.getCard('old-c')).toEqual(card);
    expect((await engine.getNote('old'))!.tags).toEqual(['прилагательные']);
  });

  it('invalid content is rejected and nothing is written', async () => {
    const { engine, store } = makeEngine();
    const { note } = await engine.addNote({ front: 'a', back: 'b', tags: ['t'] });
    await expect(engine.updateNoteContent(note.id, { front: '  ', back: 'b' })).rejects.toThrow();
    expect(await store.getNote(note.id)).toEqual(note);
  });

  it('editing does not change archive status', async () => {
    const { engine } = makeEngine();
    const { note } = await engine.addNote({ front: 'a', back: 'b' });
    const archived = await engine.archiveNote(note.id);
    const edited = await engine.updateNoteContent(note.id, { front: 'a2', back: 'b' });
    expect(edited.archivedAt).toBe(archived.archivedAt);
  });
});

describe('archiveNote / unarchiveNote', () => {
  async function seed() {
    const ctx = makeEngine();
    const keep = await ctx.engine.addNote({ front: 'keep', back: 'оставить' });
    const gone = await ctx.engine.addNote({ front: 'gone', back: 'убрать', directions: ['forward', 'reverse'] });
    await ctx.engine.review(gone.cards[0]!.id, 'again');
    return { ...ctx, keep, gone };
  }

  it('archived cards leave every study query, but nothing is deleted', async () => {
    const { engine, store, keep, gone, clock } = await seed();
    const cardsBefore = await store.listCards();
    const reviewsBefore = await store.listReviews();

    clock.t += 60 * 1000;
    const archived = await engine.archiveNote(gone.note.id);
    expect(archived.archivedAt).toBe(clock.t);

    // Storage: nothing removed, scheduling and the append-only log intact.
    expect(await store.listCards()).toEqual(cardsBefore);
    expect(await store.listReviews()).toEqual(reviewsBefore);
    expect((await store.getNote(gone.note.id))!.archivedAt).toBe(clock.t);

    // Study queries: only the active note's card remains.
    clock.t += DAY;
    expect((await engine.getDueCards()).map((c) => c.id)).toEqual([keep.cards[0]!.id]);
    expect((await engine.getCardsDueBy(clock.t + DAY)).map((c) => c.id)).toEqual([keep.cards[0]!.id]);
    const session = new StudySession(engine, { now: () => clock.t });
    expect(await session.dueCount()).toBe(1);
    expect((await session.nextCard())!.id).toBe(keep.cards[0]!.id);

    // Active counts exclude it; the log-based numbers keep its history.
    const stats = await engine.getStats();
    expect(stats.totalCards).toBe(1);
    expect(stats.newCards).toBe(1);
    expect(stats.dueNow).toBe(1);
    expect(stats.accuracy).toBe(0);

    // Still listed (for the archive view) and replayable from its log.
    const views = await engine.listCardViews();
    expect(views.filter((v) => v.note.archivedAt !== undefined)).toHaveLength(2);
    expect(await engine.rebuildCardState(gone.cards[0]!.id)).toEqual(cardsBefore.find((c) => c.id === gone.cards[0]!.id));
  });

  it('unarchive returns the cards to study with their schedule unchanged', async () => {
    const { engine, store, gone, clock } = await seed();
    const before = await store.listCards();
    await engine.archiveNote(gone.note.id);
    const restored = await engine.unarchiveNote(gone.note.id);
    expect(restored.archivedAt).toBeUndefined();
    expect('archivedAt' in (await store.getNote(gone.note.id))!).toBe(false);
    expect(await store.listCards()).toEqual(before);
    clock.t += DAY;
    expect(await engine.getDueCards()).toHaveLength(3);
  });

  it('is idempotent and fails clearly for a missing note', async () => {
    const { engine, gone, clock } = await seed();
    const first = await engine.archiveNote(gone.note.id);
    clock.t += 1000;
    expect((await engine.archiveNote(gone.note.id)).archivedAt).toBe(first.archivedAt);
    await engine.unarchiveNote(gone.note.id);
    expect((await engine.unarchiveNote(gone.note.id)).archivedAt).toBeUndefined();
    await expect(engine.archiveNote('nope')).rejects.toThrow('Note not found');
    await expect(engine.unarchiveNote('nope')).rejects.toThrow('Note not found');
  });

  it('getDueCards(limit) counts only active cards', async () => {
    const { engine, gone, keep, clock } = await seed();
    await engine.archiveNote(gone.note.id);
    clock.t += DAY;
    expect((await engine.getDueCards(1)).map((c) => c.id)).toEqual([keep.cards[0]!.id]);
  });
});
