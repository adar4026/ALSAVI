import { LearningEngine, MemoryStore, StudySession, type Card, type Rating, type Review } from '@alsavi/engine';
import { describe, expect, it, vi } from 'vitest';
import { createBackup, exportBackup } from '../src/export.js';
import { BackupError, importBackup, restoreBackup, type RestoreMeta } from '../src/import.js';
import { parseBackup } from '../src/validate.js';

const T0 = new Date('2026-07-01T10:00:00Z').getTime();

/** Seed a store with notes, cards and a non-empty Review Log. */
async function seed(): Promise<MemoryStore> {
  const store = new MemoryStore();
  const clock = { t: T0 };
  let seq = 0;
  const engine = new LearningEngine(store, { now: () => clock.t, newId: () => `id-${seq++}` });
  const { cards } = await engine.addNote({ front: 'der Hund', back: 'собака', directions: ['forward', 'reverse'] });
  const solo = await engine.addCard({ front: 'die Katze', back: 'кошка' });
  const ratings: Rating[] = ['good', 'again', 'good'];
  for (const r of ratings) {
    const { card } = await engine.review(cards[0]!.id, r);
    clock.t = Math.max(clock.t + 60_000, card.due);
  }
  await engine.review(solo.id, 'easy');
  return store;
}

async function snapshot(store: MemoryStore) {
  return {
    notes: await store.listNotes(),
    cards: await store.listCards(),
    reviews: await store.listReviews(),
  };
}

describe('backup — round-trip', () => {
  it('export → import into a fresh store reproduces notes, cards and the Review Log', async () => {
    const src = await seed();
    const before = await snapshot(src);
    const json = await exportBackup(src, () => T0);

    const dst = new MemoryStore();
    await importBackup(dst, json);
    const after = await snapshot(dst);

    expect(byId(after.notes)).toEqual(byId(before.notes));
    expect(byId(after.cards)).toEqual(byId(before.cards));
    expect(byId(after.reviews)).toEqual(byId(before.reviews));
    expect(before.reviews.length).toBeGreaterThan(0); // Review Log was non-empty
  });

  it('self-sufficiency: rebuildCardState after restore equals the restored scheduling (ADR-002 / TASK_005)', async () => {
    const src = await seed();
    const json = await exportBackup(src);
    const dst = new MemoryStore();
    await importBackup(dst, json);

    const engine = new LearningEngine(dst);
    for (const card of await dst.listCards()) {
      const rebuilt = await engine.rebuildCardState(card.id);
      expect(rebuilt!.state).toBe(card.state);
      expect(rebuilt!.due).toBe(card.due);
      expect(rebuilt!.scheduling).toEqual(card.scheduling);
    }
  });

  it('restored cards work in a StudySession', async () => {
    const src = await seed();
    const json = await exportBackup(src);
    const dst = new MemoryStore();
    await importBackup(dst, json);
    const engine = new LearningEngine(dst, { now: () => T0 + 1000 * 24 * 3600 * 1000 });
    const session = new StudySession(engine, { now: () => T0 + 1000 * 24 * 3600 * 1000 });
    expect(await session.dueCount()).toBeGreaterThan(0);
  });
});

describe('backup — replace semantics', () => {
  it('restore fully replaces existing data (old gone, new present)', async () => {
    const src = await seed();
    const json = await exportBackup(src);

    const dst = new MemoryStore();
    const engine = new LearningEngine(dst, { now: () => T0, newId: () => 'pre-existing' });
    await engine.addCard({ front: 'STALE', back: 'OLD' });
    expect((await dst.listCards()).some((c) => c.id === 'pre-existing')).toBe(true);

    await importBackup(dst, json);
    expect((await dst.listCards()).some((c) => c.id === 'pre-existing')).toBe(false); // old gone
    expect((await dst.listNotes()).length).toBe((await src.listNotes()).length); // new present
  });
});

describe('backup — validation rejects before touching data', () => {
  async function currentDataUntouched(badJson: string, expectMsg?: RegExp) {
    const store = await seed();
    const before = await snapshot(store);
    await expect(importBackup(store, badJson)).rejects.toBeInstanceOf(BackupError);
    if (expectMsg) {
      const res = parseBackup(badJson);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(expectMsg);
    }
    const after = await snapshot(store);
    expect(after).toEqual(before); // destructive phase never started
  }

  it('malformed JSON', async () => {
    await currentDataUntouched('{ not json', /JSON/);
  });

  it('wrong format discriminator', async () => {
    await currentDataUntouched(JSON.stringify({ format: 'other', version: 1, data: {} }), /не файл резервной/i);
  });

  it('newer format version is refused', async () => {
    await currentDataUntouched(
      JSON.stringify({ format: 'alsavi-backup', version: 999, data: { notes: [], cards: [], reviews: [] } }),
      /более новой версией/
    );
  });

  it('card referencing a missing note (orphan) is rejected', async () => {
    const bad = {
      format: 'alsavi-backup',
      version: 1,
      exportedAt: T0,
      data: {
        notes: [],
        cards: [
          {
            id: 'c1',
            noteId: 'MISSING',
            template: 'forward',
            deckId: 'default',
            createdAt: T0,
            due: T0,
            state: 'new',
            scheduling: { stability: 0, difficulty: 0, reps: 0, lapses: 0, scheduledDays: 0, learningSteps: 0 },
          },
        ],
        reviews: [],
      },
    };
    await currentDataUntouched(JSON.stringify(bad), /несуществующую заметку/);
  });

  // Contract change (TASK_027, owner decision 3b): a version 1 file cannot
  // declare the history of deleted cards, so there such a review is accepted
  // as legacy history behind an explicit confirmation — see the TASK_027
  // block below. A version 2 file declares that history in `retiredReviews`,
  // so a review in `data.reviews` without its card is still damage.
  it('review referencing a missing card is rejected', async () => {
    const bad = {
      format: 'alsavi-backup',
      version: 2,
      data: {
        notes: [],
        cards: [],
        retiredReviews: [],
        reviews: [
          {
            id: 'r1',
            cardId: 'MISSING',
            rating: 'good',
            reviewedAt: T0,
            stateBefore: 'new',
            stateAfter: 'learning',
            dueAfter: T0,
            stability: 1,
            difficulty: 1,
            scheduledDays: 0,
          },
        ],
      },
    };
    await currentDataUntouched(JSON.stringify(bad), /несуществующую карточку/);
  });

  it('duplicate ids are rejected', async () => {
    const note = { id: 'dup', front: 'a', back: 'b' };
    const bad = { format: 'alsavi-backup', version: 1, data: { notes: [note, note], cards: [], reviews: [] } };
    await currentDataUntouched(JSON.stringify(bad), /Дублирующийся id заметки/);
  });
});

describe('restoreBackup — shared confirm-gated orchestration (TASK_019)', () => {
  it('invalid backup: rejected, confirm never called, store untouched', async () => {
    const store = await seed();
    const before = await snapshot(store);
    const confirm = vi.fn(() => true);

    const outcome = await restoreBackup(store, '{ not json', confirm);

    expect(outcome.status).toBe('rejected');
    expect(confirm).not.toHaveBeenCalled();
    expect(await snapshot(store)).toEqual(before);
  });

  it('valid backup + confirm → false: cancelled, no replace, data intact', async () => {
    const src = await seed();
    const json = await exportBackup(src);
    const dst = await seed(); // dst has its own pre-existing data to protect
    const before = await snapshot(dst);

    const outcome = await restoreBackup(dst, json, () => false);

    expect(outcome.status).toBe('cancelled');
    expect(await snapshot(dst)).toEqual(before);
  });

  it('valid backup + synchronous confirm → true: restored, correct counts', async () => {
    const src = await seed();
    const json = await exportBackup(src);
    const dst = new MemoryStore();

    const outcome = await restoreBackup(dst, json, () => true);

    expect(outcome).toMatchObject({
      status: 'restored',
      notes: (await src.listNotes()).length,
      cards: (await src.listCards()).length,
      reviews: (await src.listReviews()).length,
    });
    expect((await dst.listCards()).length).toBeGreaterThan(0);
  });

  it('valid backup + asynchronous confirm resolving true: restored via the same path', async () => {
    const src = await seed();
    const json = await exportBackup(src);
    const dst = new MemoryStore();

    const outcome = await restoreBackup(dst, json, async () => {
      await Promise.resolve();
      return true;
    });

    expect(outcome.status).toBe('restored');
    expect((await dst.listCards()).length).toBeGreaterThan(0);
  });

  it('confirm receives the parsed metadata (no re-parsing needed by the caller)', async () => {
    const src = await seed();
    const json = await exportBackup(src, () => T0);
    const dst = new MemoryStore();
    const confirm = vi.fn(() => true);

    await restoreBackup(dst, json, confirm);

    expect(confirm).toHaveBeenCalledWith({
      exportedAt: T0,
      notes: (await src.listNotes()).length,
      cards: (await src.listCards()).length,
      reviews: (await src.listReviews()).length,
    });
  });

  it('importBackup remains a thin auto-approving wrapper with unchanged behavior', async () => {
    const src = await seed();
    const json = await exportBackup(src);
    const dst = new MemoryStore();

    const report = await importBackup(dst, json);

    expect(report).toEqual({
      notes: (await src.listNotes()).length,
      cards: (await src.listCards()).length,
      reviews: (await src.listReviews()).length,
    });
  });
});

function byId<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

describe('backup — TASK_023 note fields and archive', () => {
  it('example/memo/tags/archivedAt round-trip; archived note stays archived and out of study', async () => {
    const src = new MemoryStore();
    const engine = new LearningEngine(src, { now: () => T0 });
    const { note, cards } = await engine.addNote({
      front: 'la escritura',
      back: 'купчая',
      example: 'Firmamos la escritura ante notario.',
      memo: 'у нотариуса',
      tags: ['недвижимость', 'документы'],
    });
    await engine.review(cards[0]!.id, 'again');
    await engine.archiveNote(note.id);
    // A note without the new fields (pre-TASK_023 shape) in the same file.
    await src.putNote({ id: 'legacy', front: 'viejo', back: 'старый' });

    const dst = new MemoryStore();
    await importBackup(dst, await exportBackup(src));
    expect(byId(await dst.listNotes())).toEqual(byId(await src.listNotes()));
    expect(await dst.listReviews()).toEqual(await src.listReviews());

    const restored = new LearningEngine(dst, { now: () => T0 + 86_400_000 });
    expect(await restored.getDueCards()).toHaveLength(0);
    expect((await restored.getNote('legacy'))!.tags).toEqual([]);
  });

  it('an archived note with review history keeps the backup restorable (no orphan reviews)', async () => {
    const src = new MemoryStore();
    const engine = new LearningEngine(src, { now: () => T0 });
    const { note, cards } = await engine.addNote({ front: 'a', back: 'b' });
    await engine.review(cards[0]!.id, 'good');
    await engine.archiveNote(note.id);
    expect(parseBackup(await exportBackup(src)).ok).toBe(true);
  });

  it.each([
    ['tags not an array', { tags: 'недвижимость' }],
    ['tags with a non-string', { tags: ['ok', 3] }],
    ['example not a string', { example: 5 }],
    ['memo not a string', { memo: null }],
    ['archivedAt not a number', { archivedAt: 'yesterday' }],
  ])('rejects a note with %s', (_label, extra) => {
    const file = {
      format: 'alsavi-backup',
      version: 1,
      exportedAt: T0,
      data: { notes: [{ id: 'n', front: 'a', back: 'b', ...extra }], cards: [], reviews: [] },
    };
    expect(parseBackup(JSON.stringify(file)).ok).toBe(false);
  });
});


describe('backup — TASK_027 reviews of deleted cards (legacy orphan reviews)', () => {
  const MINUTE = 60_000;
  const DAY = 86_400_000;

  /**
   * Before TASK_023 the card list's `×` called `engine.deleteCard()`. On a card
   * with history that removed the card but — by design (INV-4, append-only) —
   * kept its Review Log entries. `exportBackup` exports the whole log, so the
   * file held reviews whose `cardId` matches no card, and `parseBackup`
   * rejected it. Here: a two-card note loses its reverse card (the note
   * survives) and a single-card note is deleted outright; their reviews are
   * interleaved in time with the reviews of the cards that stay.
   */
  async function legacyCollection() {
    const store = new MemoryStore();
    const clock = { t: T0 };
    let seq = 0;
    const engine = new LearningEngine(store, { now: () => clock.t, newId: () => `id-${seq++}` });
    const pair = await engine.addNote({ front: 'el perro', back: 'собака', directions: ['forward', 'reverse'] });
    const [kept, doomedSibling] = pair.cards as [Card, Card];
    const doomed = await engine.addCard({ front: 'el gato', back: 'кошка' });
    const untouched = await engine.addCard({ front: 'la casa', back: 'дом' });
    const answers: [Card, Rating][] = [
      [kept, 'good'],
      [doomed, 'again'],
      [doomedSibling, 'good'],
      [kept, 'good'],
      [doomed, 'good'],
    ];
    for (const [card, rating] of answers) {
      clock.t += MINUTE;
      await engine.review(card.id, rating);
    }
    await engine.deleteCard(doomed.id); // the pre-TASK_023 `×` button
    await engine.deleteCard(doomedSibling.id);
    return { store, engine, clock, kept, untouched, deletedIds: [doomed.id, doomedSibling.id] };
  }

  function file(version: number, data: Record<string, unknown>) {
    return JSON.stringify({ format: 'alsavi-backup', version, exportedAt: T0, data });
  }

  /** A version 1 file as exported before TASK_027: the deleted cards' reviews sit in `data.reviews`. */
  async function legacyV1File(store: MemoryStore) {
    return file(1, { notes: await store.listNotes(), cards: await store.listCards(), reviews: await store.listReviews() });
  }

  async function rejectedAndUntouched(text: string, expectMsg: RegExp) {
    const store = await seed();
    const before = await snapshot(store);
    const confirm = vi.fn(() => true);
    const outcome = await restoreBackup(store, text, confirm);
    expect(outcome.status).toBe('rejected');
    if (outcome.status === 'rejected') expect(outcome.error).toMatch(expectMsg);
    expect(confirm).not.toHaveBeenCalled();
    expect(await snapshot(store)).toEqual(before);
  }

  it('reproduction: a backup exported after the old deleteCard() of a reviewed card can be restored', async () => {
    const { store, deletedIds } = await legacyCollection();
    // The log still holds the deleted cards' reviews — history, not garbage.
    expect((await store.listReviews()).some((r) => deletedIds.includes(r.cardId))).toBe(true);

    const json = await exportBackup(store, () => T0);
    // Before TASK_027: { ok: false, error: 'Повторение … ссылается на несуществующую карточку …' }
    expect(parseBackup(json)).toMatchObject({ ok: true });

    const dst = new MemoryStore();
    await expect(importBackup(dst, json)).resolves.toBeDefined();
  });

  it('export puts the history of deleted cards into retiredReviews of a version 2 file and reports it', async () => {
    const { store, deletedIds } = await legacyCollection();
    const { json, retired } = await createBackup(store, () => T0);
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe(2);
    expect(retired).toEqual({ cards: 2, reviews: 3 });
    expect(parsed.data.retiredReviews.map((r: Review) => r.cardId).sort()).toEqual(
      [deletedIds[0], deletedIds[0], deletedIds[1]].sort()
    );
    const cardIds = new Set(parsed.data.cards.map((c: Card) => c.id));
    expect(parsed.data.reviews.every((r: Review) => cardIds.has(r.cardId))).toBe(true);
    expect(parsed.data.reviews.length + parsed.data.retiredReviews.length).toBe((await store.listReviews()).length);
  });

  it('an ordinary collection exports exactly as before: version 1, no retiredReviews, nothing to report', async () => {
    const store = await seed();
    const { json, retired } = await createBackup(store, () => T0);
    expect(retired).toBeUndefined();
    expect(json).toBe(
      JSON.stringify({
        format: 'alsavi-backup',
        version: 1,
        exportedAt: T0,
        data: { notes: await store.listNotes(), cards: await store.listCards(), reviews: await store.listReviews() },
      })
    );
    expect(json).toBe(await exportBackup(store, () => T0));

    const confirm = vi.fn((meta: RestoreMeta) => !('retired' in meta));
    expect((await restoreBackup(new MemoryStore(), json, confirm)).status).toBe('restored');
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('restore keeps the whole Review Log and active cards exactly: ids, state, due, scheduling, history', async () => {
    const { store } = await legacyCollection();
    const before = await snapshot(store);
    const dst = new MemoryStore();
    const outcome = await restoreBackup(dst, await exportBackup(store), () => true);

    expect(outcome).toMatchObject({
      status: 'restored',
      reviews: before.reviews.length,
      retired: { cards: 2, reviews: 3, legacy: false },
    });
    const after = await snapshot(dst);
    expect(byId(after.notes)).toEqual(byId(before.notes));
    expect(after.cards).toEqual(before.cards);
    expect(after.reviews).toEqual(before.reviews); // same records, same time order — nothing dropped or added

    const engine = new LearningEngine(dst);
    for (const card of after.cards) {
      const rebuilt = await engine.rebuildCardState(card.id);
      expect({ state: rebuilt!.state, due: rebuilt!.due, scheduling: rebuilt!.scheduling }).toEqual({
        state: card.state,
        due: card.due,
        scheduling: card.scheduling,
      });
      expect(await dst.listReviews(card.id)).toEqual(await store.listReviews(card.id));
    }
  });

  it('history of deleted cards never becomes a card in a study queue; restored cards keep learning', async () => {
    const { store, kept, untouched, deletedIds } = await legacyCollection();
    const dst = new MemoryStore();
    await importBackup(dst, await exportBackup(store));

    const later = T0 + 30 * DAY;
    const engine = new LearningEngine(dst, { now: () => later });
    const session = new StudySession(engine, { now: () => later });
    const queue = (await engine.getCardsDueBy(Number.MAX_SAFE_INTEGER)).map((c) => c.id).sort();
    expect(queue).toEqual([kept.id, untouched.id].sort());
    expect((await dst.listCards()).some((c) => deletedIds.includes(c.id))).toBe(false);
    expect(await session.dueCount()).toBe(2);

    const next = await session.nextCard();
    expect(deletedIds).not.toContain(next!.id);
    const { card } = await session.answer(next!.id, 'good');
    expect(card.due).toBeGreaterThan(later);
    // Same answer on the original collection schedules identically.
    const original = new LearningEngine(store, { now: () => later });
    expect((await original.review(next!.id, 'good')).card).toEqual(card);
  });

  it('activity statistics still count the history (as before export); card counts do not', async () => {
    const { store, clock } = await legacyCollection();
    const dst = new MemoryStore();
    await importBackup(dst, await exportBackup(store));

    const beforeStats = await new LearningEngine(store, { now: () => clock.t }).getLearningStats();
    const afterStats = await new LearningEngine(dst, { now: () => clock.t }).getLearningStats();
    expect(afterStats).toEqual(beforeStats);
    expect(afterStats.today.reviews).toBe(5); // 3 of them belong to deleted cards
    expect(afterStats.cards.active).toBe(2);
  });

  it('a backup made after restoring is valid again and carries the same history', async () => {
    const { store } = await legacyCollection();
    const first = await exportBackup(store, () => T0);
    const dst = new MemoryStore();
    await importBackup(dst, first);

    const second = await createBackup(dst, () => T0);
    expect(second.retired).toEqual({ cards: 2, reviews: 3 });
    const a = JSON.parse(first);
    const b = JSON.parse(second.json);
    expect(b.version).toBe(2);
    expect(byId(b.data.reviews)).toEqual(byId(a.data.reviews));
    expect(byId(b.data.retiredReviews)).toEqual(byId(a.data.retiredReviews));
    const third = new MemoryStore();
    await importBackup(third, second.json);
    expect(await snapshot(third)).toEqual(await snapshot(dst));
  });

  describe('a version 1 file exported before TASK_027 (3b: legacy history needs explicit approval)', () => {
    it('is valid, and the confirmation is told how much undeclared history it holds', async () => {
      const { store } = await legacyCollection();
      const legacy = await legacyV1File(store);
      expect(parseBackup(legacy)).toMatchObject({ ok: true, retired: { cards: 2, reviews: 3, legacy: true } });

      const confirm = vi.fn(() => true);
      const dst = new MemoryStore();
      const outcome = await restoreBackup(dst, legacy, confirm);
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ reviews: 5, retired: { cards: 2, reviews: 3, legacy: true } })
      );
      expect(outcome.status).toBe('restored');
      expect(await snapshot(dst)).toEqual(await snapshot(store));
    });

    it('declining the confirmation changes nothing', async () => {
      const { store } = await legacyCollection();
      const dst = await seed();
      const before = await snapshot(dst);
      expect((await restoreBackup(dst, await legacyV1File(store), () => false)).status).toBe('cancelled');
      expect(await snapshot(dst)).toEqual(before);
    });

    it('once restored, the next backup declares the history (version 2, not legacy)', async () => {
      const { store } = await legacyCollection();
      const dst = new MemoryStore();
      await importBackup(dst, await legacyV1File(store));
      expect(parseBackup(await exportBackup(dst))).toMatchObject({
        ok: true,
        retired: { cards: 2, reviews: 3, legacy: false },
      });
    });
  });

  describe('damaged files are still rejected before touching data', () => {
    const card = {
      id: 'c1',
      noteId: 'n1',
      template: 'forward',
      deckId: 'default',
      createdAt: T0,
      due: T0,
      state: 'learning',
      scheduling: { stability: 1, difficulty: 5, reps: 1, lapses: 0, scheduledDays: 0, learningSteps: 1 },
    };
    const note = { id: 'n1', front: 'a', back: 'b' };
    const review = (id: string, cardId: string, extra: Record<string, unknown> = {}) => ({
      id,
      cardId,
      rating: 'good',
      reviewedAt: T0,
      stateBefore: 'new',
      stateAfter: 'learning',
      dueAfter: T0 + MINUTE,
      stability: 1,
      difficulty: 5,
      scheduledDays: 0,
      ...extra,
    });
    const v2 = (reviews: unknown[], retiredReviews: unknown) =>
      file(2, { notes: [note], cards: [card], reviews, retiredReviews });

    it('version 2: a review in data.reviews without its card', async () => {
      await rejectedAndUntouched(v2([review('r1', 'MISSING')], []), /несуществующую карточку MISSING/);
    });

    it('version 2: a history record that points at a card present in the file', async () => {
      await rejectedAndUntouched(v2([], [review('r1', 'c1')]), /относится к существующей карточке c1/);
    });

    it.each([
      ['an invalid rating', { rating: 'perfect' }, /rating/],
      ['a missing date', { reviewedAt: undefined }, /reviewedAt/],
      ['a non-numeric date', { reviewedAt: '2026-01-01' }, /reviewedAt/],
      ['an invalid state', { stateAfter: 'gone' }, /stateBefore\/stateAfter/],
      ['a non-numeric field', { stability: 'high' }, /stability/],
      ['an empty card id', { cardId: '' }, /cardId/],
    ])('version 2: a history record with %s', async (_label, extra, msg) => {
      await rejectedAndUntouched(v2([], [review('r1', 'gone', extra)]), msg);
    });

    it('version 2: a history record that is not an object', async () => {
      await rejectedAndUntouched(v2([], ['oops']), /не объект/);
    });

    it('duplicate review id across data.reviews and retiredReviews', async () => {
      await rejectedAndUntouched(v2([review('r1', 'c1')], [review('r1', 'gone')]), /Дублирующийся id повторения: r1/);
    });

    it('version 2 without a retiredReviews array', async () => {
      await rejectedAndUntouched(v2([], undefined), /retiredReviews/);
      await rejectedAndUntouched(v2([], 'none'), /retiredReviews/);
    });

    it('version 1 carrying retiredReviews (only version 2 may)', async () => {
      await rejectedAndUntouched(
        file(1, { notes: [note], cards: [card], reviews: [], retiredReviews: [review('r1', 'gone')] }),
        /retiredReviews/
      );
    });

    it('version 1: an undeclared review of a deleted card must still be a valid review', async () => {
      await rejectedAndUntouched(
        file(1, { notes: [note], cards: [card], reviews: [review('r1', 'gone', { rating: 5 })] }),
        /rating/
      );
    });
  });
});
