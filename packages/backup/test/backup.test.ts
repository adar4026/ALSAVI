import { LearningEngine, MemoryStore, StudySession, type Rating } from '@alsavi/engine';
import { describe, expect, it } from 'vitest';
import { exportBackup } from '../src/export.js';
import { BackupError, importBackup } from '../src/import.js';
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

function byId<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
