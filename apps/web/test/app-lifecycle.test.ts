import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { LearningEngine, MemoryStore, StudySession } from '@alsavi/engine';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { localDayStart, shouldStartNewSession } from '../src/app-lifecycle.js';
import { DexieStore } from '../src/dexie-store.js';
import { ReviewFlowController } from '../src/review-flow.js';

/**
 * An installed app that is closed, reopened and kept open overnight
 * (TASK_033): the queue and the daily limit continue from IndexedDB instead
 * of starting over, and a new day begins a new study session.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = new Date(2026, 9, 13, 9).getTime(); // a local 09:00

afterEach(() => {
  const fresh = new IDBFactory();
  globalThis.indexedDB = fresh;
  Dexie.dependencies.indexedDB = fresh;
});

describe('localDayStart / shouldStartNewSession', () => {
  it('the local day of a moment', () => {
    expect(localDayStart(T0)).toBe(new Date(2026, 9, 13).getTime());
    expect(localDayStart(new Date(2026, 9, 13, 23, 59).getTime())).toBe(localDayStart(T0));
    expect(localDayStart(new Date(2026, 9, 14, 0, 1).getTime())).toBe(new Date(2026, 9, 14).getTime());
  });

  it('a new session only on a new day and never mid-session', () => {
    const today = localDayStart(T0);
    expect(shouldStartNewSession(today, T0 + 2 * HOUR, false)).toBe(false);
    expect(shouldStartNewSession(today, T0 + DAY, false)).toBe(true);
    expect(shouldStartNewSession(today, T0 + DAY, true)).toBe(false);
  });
});

/** What the app builds on launch: store, engine, and a session with the stored daily limit. */
async function launch(now: () => number) {
  const store = new DexieStore();
  const engine = new LearningEngine(store, { now });
  const session = new StudySession(engine, { now, newCardsPerDay: await store.getNewCardsPerDay() });
  return { store, engine, session };
}

describe('reopening the app continues the same queue', () => {
  it('the daily limit and the remaining queue survive a restart — no fresh, independent queue', async () => {
    let t = T0;
    const now = () => t;
    const first = await launch(now);
    await first.store.setNewCardsPerDay(2);
    first.session.setNewCardsPerDay(2);
    for (let i = 0; i < 5; i++) await first.engine.addNote({ front: `palabra ${i}`, back: `слово ${i}` });

    const flow = new ReviewFlowController(first.engine, first.session);
    await flow.start();
    expect(flow.getState().progress.total).toBe(2);
    flow.reveal();
    await flow.answer('easy');
    const before = await first.session.overview();

    // Closed and reopened an hour later.
    t += HOUR;
    const second = await launch(now);
    expect(await second.session.overview()).toEqual(before);
    const flow2 = new ReviewFlowController(second.engine, second.session);
    await flow2.start();
    expect(flow2.getState().progress.total).toBe(1);
    flow2.reveal();
    await flow2.answer('easy');
    // The limit of 2 is used up across both launches: nothing new is left today.
    expect(flow2.getState()).toMatchObject({ status: 'finished' });
    expect(await second.session.newCardsWithheldByLimit()).toBe(3);

    // And once more: still nothing new today, the same three cards wait.
    const third = await launch(now);
    expect(await third.session.nextCard()).toBeNull();
    expect(await third.session.newCardsWithheldByLimit()).toBe(3);

    // The next day the limit opens again.
    t += DAY;
    const nextDay = await launch(now);
    expect(await nextDay.session.dueCount()).toBe(2);
  });
});

describe('an app kept open overnight', () => {
  it('a new day’s session shows the sibling that yesterday’s session had buried', async () => {
    let t = T0;
    const now = () => t;
    const engine = new LearningEngine(new MemoryStore(), { now });
    const word = await engine.addNote({ front: 'la casa', back: 'дом', directions: ['forward', 'reverse'] });
    const yesterday = new StudySession(engine, { now });
    const first = await yesterday.nextCard();
    await yesterday.answer(first!.id, 'easy');
    const sibling = word.cards.find((c) => c.id !== first!.id)!;

    t += DAY;
    // The old instance still buries the sibling — its bury lasts as long as the instance.
    expect((await yesterday.nextCard())?.id).not.toBe(sibling.id);
    // What App does on the first return on a new day: a new session.
    expect(shouldStartNewSession(localDayStart(T0), t, false)).toBe(true);
    const today = new StudySession(engine, { now });
    expect((await today.nextCard())?.id).toBe(sibling.id);
  });
});
