import { LearningEngine, MemoryStore, StudySession, type Rating } from '@alsavi/engine';
import { describe, expect, it, vi } from 'vitest';
import { exportBackup } from '../src/export.js';
import { BackupError, importBackup, restoreBackup } from '../src/import.js';
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

  it('review referencing a missing card is rejected', async () => {
    const bad = {
      format: 'alsavi-backup',
      version: 1,
      data: {
        notes: [],
        cards: [],
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
