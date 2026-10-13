import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createBackup, parseBackup, restoreBackup, type RestoreMeta } from '@alsavi/backup';
import { LearningEngine, StudySession } from '@alsavi/engine';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { exportedStatus, restoreConfirmText, restoredStatus } from '../src/backup-messages.js';
import { DexieStore } from '../src/dexie-store.js';

/**
 * TASK_027: backups of a collection where cards with history were deleted the
 * pre-TASK_023 way (`engine.deleteCard`), through the real IndexedDB adapter,
 * and the notices the backup panel shows.
 */

// Dexie resolves `indexedDB` from `Dexie.dependencies` at construction — reset
// both so every test starts with an empty 'alsavi' database.
afterEach(() => {
  const fresh = new IDBFactory();
  globalThis.indexedDB = fresh;
  Dexie.dependencies.indexedDB = fresh;
});

const T0 = new Date(2026, 9, 12, 10, 0).getTime();
const DAY = 86_400_000;

const meta = (extra: Partial<RestoreMeta> = {}): RestoreMeta => ({
  exportedAt: T0,
  notes: 2,
  cards: 3,
  reviews: 7,
  ...extra,
});

describe('backup notices — shown only when there is history of deleted cards', () => {
  it('export: plain message without history', () => {
    expect(exportedStatus(undefined)).toBe('Резервная копия сохранена.');
  });

  it('export: calm note with the number of answers when history is included', () => {
    const text = exportedStatus({ cards: 2, reviews: 3 });
    expect(text).toMatch(/^Резервная копия сохранена\. /);
    expect(text).toContain('история удалённых ранее карточек (3 ответа)');
    expect(text).toContain('не влияет на обучение');
    expect(exportedStatus({ cards: 1, reviews: 1 })).toContain('(1 ответ)');
    expect(exportedStatus({ cards: 4, reviews: 11 })).toContain('(11 ответов)');
  });

  it('restore confirmation: unchanged text without history', () => {
    const text = restoreConfirmText(meta());
    expect(text).toContain('(2 заметок, 3 карточек, 7 повторений).\n\nЭто действие необратимо. Продолжить?');
    expect(text).not.toMatch(/истори|удалённ/);
  });

  it('restore confirmation: declared history (version 2) — informational line', () => {
    const text = restoreConfirmText(meta({ retired: { cards: 1, reviews: 2, legacy: false } }));
    expect(text).toContain('история удалённых ранее карточек (2 ответа)');
    expect(text).toContain('не влияет на обучение');
    expect(text).not.toContain('повреждён');
    expect(text).toMatch(/Продолжить\?$/);
  });

  it('restore confirmation: legacy file (version 1) — asks the user to decide, mentions possible damage', () => {
    const text = restoreConfirmText(meta({ retired: { cards: 2, reviews: 5, legacy: true } }));
    expect(text).toContain('5 ответов по карточкам, которых в ней нет');
    expect(text).toContain('удалённых до появления архива');
    expect(text).toContain('файл может быть повреждён — тогда нажмите «Отмена»');
    expect(text).toMatch(/Продолжить\?$/);
  });

  it('restore confirmation names what is on the device now (TASK_033)', () => {
    const text = restoreConfirmText(meta(), { notes: 4, cards: 5, reviews: 6 });
    expect(text).toContain('Сейчас на устройстве: 4 заметок, 5 карточек, 6 повторений — они будут удалены.');
    expect(text).toContain('сначала сохраните «Экспорт»');
    expect(text).not.toContain('меньше ответов');
    expect(text).toMatch(/Продолжить\?$/);
  });

  it('restore confirmation warns when the copy has fewer answers than the device (TASK_033)', () => {
    const text = restoreConfirmText(meta(), { notes: 2, cards: 3, reviews: 40 });
    expect(text).toContain('В копии меньше ответов, чем сейчас на устройстве');
    // History of deleted cards counts as answers of the copy.
    const withHistory = restoreConfirmText(meta({ retired: { cards: 1, reviews: 33, legacy: false } }), {
      notes: 2,
      cards: 3,
      reviews: 40,
    });
    expect(withHistory).not.toContain('меньше ответов');
  });

  it('restore confirmation on an empty device says nothing about current data (TASK_033)', () => {
    expect(restoreConfirmText(meta(), { notes: 0, cards: 0, reviews: 0 })).toBe(restoreConfirmText(meta()));
  });

  it('after restore: note only when history was restored', () => {
    expect(restoredStatus(meta())).toBe('Восстановлено: 2 заметок, 3 карточек, 7 повторений.');
    expect(restoredStatus(meta({ retired: { cards: 1, reviews: 3, legacy: true } }))).toBe(
      'Восстановлено: 2 заметок, 3 карточек, 7 повторений. ' +
        'Сохранена и история удалённых ранее карточек (3 ответа) — она не влияет на обучение.'
    );
  });
});

describe('DexieStore — backup with history of deleted cards', () => {
  async function legacyIndexedDb() {
    const clock = { t: T0 };
    const engine = new LearningEngine(new DexieStore(), { now: () => clock.t });
    const { cards } = await engine.addNote({ front: 'el perro', back: 'собака', directions: ['forward', 'reverse'] });
    const doomed = await engine.addCard({ front: 'el gato', back: 'кошка' });
    for (const id of [cards[0]!.id, doomed.id, cards[1]!.id, doomed.id]) {
      clock.t += 60_000;
      await engine.review(id, 'good');
    }
    await engine.deleteCard(doomed.id); // the pre-TASK_023 `×`
    return { doomedId: doomed.id, keptIds: cards.map((c) => c.id) };
  }

  async function dump(store: DexieStore) {
    return { notes: await store.listNotes(), cards: await store.listCards(), reviews: await store.listReviews() };
  }

  it('export → clear → restore → reload: data identical, history kept, never studied, next backup valid', async () => {
    const { doomedId, keptIds } = await legacyIndexedDb();
    const source = new DexieStore();
    const before = await dump(source);
    const { json, retired } = await createBackup(source);
    expect(retired).toEqual({ cards: 1, reviews: 2 });

    await source.replaceAll({ notes: [], cards: [], reviews: [] }); // "clear the device"
    expect((await dump(new DexieStore())).reviews).toHaveLength(0);

    const shown: RestoreMeta[] = [];
    const outcome = await restoreBackup(new DexieStore(), json, (m) => {
      shown.push(m);
      return true;
    });
    expect(outcome.status).toBe('restored');
    expect(shown[0]!.retired).toEqual({ cards: 1, reviews: 2, legacy: false });

    const reloaded = new DexieStore(); // a fresh adapter = page reload
    expect(await dump(reloaded)).toEqual(before);

    const later = T0 + 10 * DAY;
    const engine = new LearningEngine(reloaded, { now: () => later });
    const session = new StudySession(engine, { now: () => later });
    expect(await session.dueCount()).toBe(2);
    const queue = (await engine.getCardsDueBy(Number.MAX_SAFE_INTEGER)).map((c) => c.id);
    expect(queue.sort()).toEqual([...keptIds].sort());
    expect(queue).not.toContain(doomedId);
    const next = await session.nextCard();
    await session.answer(next!.id, 'good');
    expect(await reloaded.listReviews(next!.id)).toHaveLength(2);

    const again = await createBackup(reloaded);
    expect(again.retired).toEqual({ cards: 1, reviews: 2 });
    expect(parseBackup(again.json)).toMatchObject({ ok: true, retired: { legacy: false } });
  });
});
