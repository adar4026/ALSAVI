import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { LearningEngine, MemoryStore, StudySession, type Card, type Rating, type Review } from '@alsavi/engine';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DexieStore } from '../src/dexie-store.js';
import { ReviewFlowController } from '../src/review-flow.js';

/**
 * `ReviewFlowController` — the "Учиться сегодня" session state machine
 * (TASK_022). Plain TypeScript, driven directly with real `LearningEngine`/
 * `StudySession` instances (no React rendering needed) — same testing
 * approach the project already uses for `DexieStore` (see
 * `add-note-dexie.test.ts`), and the reason this class is not a React hook.
 */

const T0 = new Date('2026-09-14T10:00:00Z').getTime();

function setup(newCardsPerDay: number | null = null) {
  let seq = 0;
  const store = new MemoryStore();
  const engine = new LearningEngine(store, { now: () => T0, newId: () => `id-${seq++}` });
  const session = new StudySession(engine, { now: () => T0, newCardsPerDay });
  const controller = new ReviewFlowController(engine, session);
  return { store, engine, session, controller };
}

/** A store whose `putCard` can be armed to reject once — simulates a save failure. */
class ThrowingStore extends MemoryStore {
  armed = false;
  override async putCard(card: Card): Promise<void> {
    if (this.armed) {
      this.armed = false;
      throw new Error('simulated IndexedDB write failure');
    }
    return super.putCard(card);
  }
}

/** A store whose `appendReview` can be held open until `resolveDelay()` is called. */
class DelayedStore extends MemoryStore {
  private pending: (() => void) | null = null;
  private waiter: Promise<void> | null = null;

  override async appendReview(review: Review): Promise<void> {
    if (this.waiter) await this.waiter;
    return super.appendReview(review);
  }

  /** Makes the next (and only the next) appendReview() call wait until resolveDelay(). */
  armDelay(): void {
    this.waiter = new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  resolveDelay(): void {
    this.pending?.();
    this.waiter = null;
    this.pending = null;
  }
}

describe('ReviewFlowController — card lifecycle', () => {
  it('shows only the front until reveal(), then the back and all four rating previews', async () => {
    const { engine, controller } = setup();
    await engine.addCard({ front: 'der Hund', back: 'собака' });

    await controller.start();
    let state = controller.getState();
    expect(state.status).toBe('active');
    expect(state.revealed).toBe(false);
    expect(state.current?.front).toBe('der Hund');
    expect(state.current?.back).toBe('собака');
    expect(state.progress).toEqual({ done: 0, total: 1 });

    controller.reveal();
    state = controller.getState();
    expect(state.revealed).toBe(true);
    expect(Object.keys(state.preview ?? {}).sort()).toEqual(['again', 'easy', 'good', 'hard']);
  });

  it('reveal() before any card is loaded is a no-op', () => {
    const { controller } = setup();
    controller.reveal();
    expect(controller.getState().status).toBe('loading');
  });
});

describe('ReviewFlowController — grading', () => {
  const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

  it.each(RATINGS)('answer(%s) is recorded in the Review Log with that exact rating and reschedules the card', async (rating) => {
    const { store, engine, controller } = setup();
    const card = await engine.addCard({ front: 'a', back: '1' });
    const expectedDue = (await engine.previewIntervals(card.id))[rating];

    await controller.start();
    controller.reveal();
    await controller.answer(rating);

    const reviews = await store.listReviews(card.id);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.rating).toBe(rating);
    const updated = await store.getCard(card.id);
    expect(updated?.due).toBe(expectedDue);
  });

  it('shows the next card only after the save resolves, not before', async () => {
    const store = new DelayedStore();
    let seq = 0;
    const engine = new LearningEngine(store, { now: () => T0, newId: () => `id-${seq++}` });
    const session = new StudySession(engine, { now: () => T0 });
    const controller = new ReviewFlowController(engine, session);
    await engine.addCard({ front: 'a', back: '1' });
    await engine.addCard({ front: 'b', back: '2' });

    await controller.start();
    controller.reveal();
    store.armDelay();
    // 'easy' graduates a new card straight to 'review' with a multi-day due
    // date, so it will NOT resurface via learn-ahead — keeps the remaining
    // count in this assertion exactly the other, still-unanswered card.
    const pending = controller.answer('easy');
    // Still mid-save: the answered card must not have been replaced yet.
    expect(controller.getState().status).toBe('saving');

    store.resolveDelay();
    await pending;

    const state = controller.getState();
    expect(state.status).toBe('active');
    expect(state.progress).toEqual({ done: 1, total: 2 });
  });

  it('blocks a second click while a save is in flight — exactly one review is recorded', async () => {
    const store = new DelayedStore();
    let seq = 0;
    const engine = new LearningEngine(store, { now: () => T0, newId: () => `id-${seq++}` });
    const session = new StudySession(engine, { now: () => T0 });
    const controller = new ReviewFlowController(engine, session);
    const card = await engine.addCard({ front: 'a', back: '1' });

    await controller.start();
    controller.reveal();
    store.armDelay();
    const first = controller.answer('good');
    const second = controller.answer('good'); // fired while the first is still saving
    expect(controller.getState().status).toBe('saving');

    store.resolveDelay();
    await Promise.all([first, second]);

    expect(await store.listReviews(card.id)).toHaveLength(1);
  });

  it('a save failure leaves the same card current, records nothing, and surfaces a retryable error', async () => {
    const store = new ThrowingStore();
    let seq = 0;
    const engine = new LearningEngine(store, { now: () => T0, newId: () => `id-${seq++}` });
    const session = new StudySession(engine, { now: () => T0 });
    const controller = new ReviewFlowController(engine, session);
    const card = await engine.addCard({ front: 'a', back: '1' });

    await controller.start();
    controller.reveal();
    store.armed = true;
    await controller.answer('good');

    let state = controller.getState();
    expect(state.status).toBe('active');
    expect(state.revealed).toBe(true);
    expect(state.current?.card.id).toBe(card.id);
    expect(state.error).toBeTruthy();
    expect(state.progress.done).toBe(0);
    expect(await store.listReviews(card.id)).toHaveLength(0);

    // Retry (store no longer armed): succeeds, error clears, tally advances.
    await controller.answer('good');
    state = controller.getState();
    expect(state.error).toBeNull();
    expect(await store.listReviews(card.id)).toHaveLength(1);
  });
});

describe('ReviewFlowController — session completion', () => {
  it('finishes with an accurate summary: total reviewed vs. first-time-new', async () => {
    const { store, engine, controller } = setup();
    // Two brand-new cards: 'easy' graduates a new card straight to 'review'
    // in one answer (no learning-step resurfacing), keeping this test
    // single-pass and deterministic — see the "learning steps" table in
    // packages/engine/test/engine.test.ts.
    await engine.addCard({ front: 'new-1', back: '1' });
    await engine.addCard({ front: 'new-2', back: '2' });
    // A card that is already past 'new' (inserted directly as an overdue
    // 'review' card, like the fixtures in study-session.test.ts) — its
    // review must count toward `reviewed` but NOT `newReviewed`.
    await store.putCard({
      id: 'seasoned',
      noteId: 'note-seasoned',
      template: 'forward',
      deckId: 'default',
      createdAt: T0 - 30 * 24 * 60 * 60 * 1000,
      due: T0 - 60_000,
      state: 'review',
      scheduling: { stability: 5, difficulty: 5, reps: 3, lapses: 0, scheduledDays: 5, learningSteps: 0 },
    });
    await store.putNote({ id: 'note-seasoned', front: 'seasoned', back: '3' });

    await controller.start();
    for (let i = 0; i < 3; i++) {
      expect(controller.getState().status).toBe('active');
      controller.reveal();
      await controller.answer('easy');
    }

    const state = controller.getState();
    expect(state.status).toBe('finished');
    expect(state.summary).toEqual({ reviewed: 3, newReviewed: 2 });
    // Regression: `progress.done` must catch up to the final answer count —
    // a subscriber (e.g. App.tsx refreshing its stats bar) watches this
    // field to notice "an answer was just recorded", and previously it
    // stayed one answer behind on the very last card of a session, so the
    // app-level stats never refreshed after finishing.
    expect(state.progress).toEqual({ done: 3, total: 3 });
  });

  it('an empty collection shows the empty state, not finished, with limitReached false', async () => {
    const { controller } = setup();
    await controller.start();
    const state = controller.getState();
    expect(state.status).toBe('empty');
    expect(state.limitReached).toBe(false);
    expect(state.summary).toBeNull();
  });

  it('a daily-limit-withheld new card surfaces limitReached=true in the empty state', async () => {
    const { engine, controller } = setup(0);
    await engine.addCard({ front: 'a', back: '1' });
    await controller.start();
    const state = controller.getState();
    expect(state.status).toBe('empty');
    expect(state.limitReached).toBe(true);
  });
});

describe('ReviewFlowController — reload persists through IndexedDB', () => {
  afterEach(() => {
    const fresh = new IDBFactory();
    globalThis.indexedDB = fresh;
    Dexie.dependencies.indexedDB = fresh;
  });

  it('a second controller over a fresh DexieStore continues correctly after a reload', async () => {
    const engine1 = new LearningEngine(new DexieStore());
    const session1 = new StudySession(engine1);
    const controller1 = new ReviewFlowController(engine1, session1);
    const a = await engine1.addCard({ front: 'a', back: '1' });
    const b = await engine1.addCard({ front: 'b', back: '2' });

    await controller1.start();
    const firstCardId = controller1.getState().current?.card.id;
    controller1.reveal();
    // 'easy' graduates the answered card straight to 'review' with a
    // multi-day due, so it will not resurface via learn-ahead in controller2.
    await controller1.answer('easy');

    const expectedRemainingId = [a.id, b.id].find((id) => id !== firstCardId);

    // Simulate a reload: fresh adapter + engine + session + controller over the same IndexedDB.
    const engine2 = new LearningEngine(new DexieStore());
    const session2 = new StudySession(engine2);
    const controller2 = new ReviewFlowController(engine2, session2);
    await controller2.start();

    const state2 = controller2.getState();
    expect(state2.status).toBe('active');
    // The reloaded session shows exactly the one still-unanswered card, not
    // the one already graded (and not re-asking a card already recorded).
    expect(state2.current?.card.id).toBe(expectedRemainingId);
    expect(state2.progress).toEqual({ done: 0, total: 1 });

    // The already-recorded review survived the "reload" in IndexedDB: the
    // answered card is no longer 'new' and was not re-presented above.
    expect(await engine2.getCard(firstCardId!)).toMatchObject({ state: 'review' });
  });
});
