import { describe, expect, it } from 'vitest';
import { LearningEngine } from '../src/engine.js';
import { MemoryStore } from '../src/memory-store.js';
import { assertValidNewCardsPerDay, StudySession } from '../src/study-session.js';
import type { Card, CardState, Rating } from '../src/types.js';

const T0 = new Date('2026-07-01T10:00:00Z').getTime();
const MIN = 60_000;
const DAY = 24 * 60 * 60 * 1000;

/** Fixture card with a precise due offset and state, for boundary tests. */
function cardFixture(id: string, dueOffsetMin: number, state: CardState = 'learning'): Card {
  return {
    id,
    noteId: `note-${id}`,
    template: 'forward',
    deckId: 'default',
    createdAt: T0,
    due: T0 + dueOffsetMin * MIN,
    state,
    scheduling: { stability: 1, difficulty: 5, reps: 1, lapses: 0, scheduledDays: 0, learningSteps: 0 },
  };
}

/** Engine + session sharing one injectable clock, deterministic ids. */
function setup(clock: { t: number } = { t: T0 }, learnAheadMinutes = 20) {
  let seq = 0;
  const engine = new LearningEngine(new MemoryStore(), {
    now: () => clock.t,
    newId: () => `id-${seq++}`,
  });
  const session = new StudySession(engine, { now: () => clock.t, learnAheadMinutes });
  return { engine, session, clock };
}

/** MemoryStore that counts how selection reads the store. */
class CountingStore extends MemoryStore {
  calls = { listCards: 0, listDueCards: 0 };
  override async listCards(): Promise<Card[]> {
    this.calls.listCards++;
    return super.listCards();
  }
  override async listDueCards(now: number, limit?: number): Promise<Card[]> {
    this.calls.listDueCards++;
    return super.listDueCards(now, limit);
  }
}

const byDueThenId = (a: Card, b: Card): number =>
  a.due - b.due || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

describe('StudySession — indexed due-horizon (TASK_006)', () => {
  it('nextCard/dueCount use the indexed due query, not a full listCards scan', async () => {
    const store = new CountingStore();
    const clock = { t: T0 };
    let seq = 0;
    const engine = new LearningEngine(store, { now: () => clock.t, newId: () => `id-${seq++}` });
    const session = new StudySession(engine, { now: () => clock.t, learnAheadMinutes: 20 });
    await store.putCard(cardFixture('a', -1, 'review')); // due now
    await store.putCard(cardFixture('b', 5, 'learning')); // learn-ahead
    await store.putCard(cardFixture('c', 45, 'learning')); // beyond horizon

    store.calls = { listCards: 0, listDueCards: 0 };
    await session.nextCard();
    await session.dueCount();

    expect(store.calls.listCards).toBe(0); // no full scan
    expect(store.calls.listDueCards).toBeGreaterThan(0); // indexed range query used
  });

  it('getCardsDueBy returns exactly what a listCards(due<=threshold) filter would', async () => {
    const store = new MemoryStore();
    const engine = new LearningEngine(store, { now: () => T0 });
    for (const off of [-10, 0, 5, 19, 20, 21, 60]) {
      await store.putCard(cardFixture(`c${off}`, off, 'learning'));
    }
    const threshold = T0 + 20 * MIN;
    const reference = (await store.listCards())
      .filter((c) => c.due <= threshold)
      .map((c) => c.id)
      .sort();
    const indexed = (await engine.getCardsDueBy(threshold)).map((c) => c.id).sort();
    expect(indexed).toEqual(reference);
  });

  it('session results match the previous full-scan filtering (behavior unchanged)', async () => {
    const store = new MemoryStore();
    const clock = { t: T0 };
    let seq = 0;
    const engine = new LearningEngine(store, { now: () => clock.t, newId: () => `id-${seq++}` });
    const session = new StudySession(engine, { now: () => clock.t, learnAheadMinutes: 20 });
    const specs: Array<[number, CardState]> = [
      [-5, 'review'],
      [-1, 'learning'],
      [3, 'learning'],
      [10, 'relearning'],
      [19, 'review'],
      [25, 'learning'],
    ];
    for (let i = 0; i < specs.length; i++) {
      const [off, st] = specs[i]!;
      await store.putCard(cardFixture(`k${i}`, off, st));
    }

    const now = clock.t;
    const horizon = now + 20 * MIN;
    const all = await store.listCards();
    const refDue = all.filter((c) => c.due <= now).sort(byDueThenId);
    const refLearn = all
      .filter((c) => (c.state === 'learning' || c.state === 'relearning') && c.due > now && c.due <= horizon)
      .sort(byDueThenId);
    const refNext = refDue[0] ?? refLearn[0] ?? null;

    expect(await session.dueCount()).toBe(refDue.length + refLearn.length);
    expect((await session.nextCard())?.id ?? null).toBe(refNext?.id ?? null);
  });
});

describe('StudySession — bury siblings (TASK_007)', () => {
  it('answering a card buries its sibling but shows an independent card', async () => {
    // learnAhead 0 isolates bury from learn-ahead resurfacing.
    const { engine, session } = setup({ t: T0 }, 0);
    const { cards: a } = await engine.addNote({ front: 'A', back: 'a', directions: ['forward', 'reverse'] });
    const { cards: b } = await engine.addNote({ front: 'B', back: 'b', directions: ['forward'] });
    const aFwd = a.find((c) => c.template === 'forward')!;
    const aRev = a.find((c) => c.template === 'reverse')!;
    const bFwd = b[0]!;

    await session.answer(aFwd.id, 'good');

    const next = await session.nextCard();
    expect(next?.id).toBe(bFwd.id); // independent card shown
    expect(next?.id).not.toBe(aRev.id); // sibling not shown
  });

  it('the buried sibling stays hidden until the session ends (single-remaining case)', async () => {
    const { engine, session } = setup({ t: T0 }, 0);
    const { cards: a } = await engine.addNote({ front: 'A', back: 'a', directions: ['forward', 'reverse'] });
    const { cards: b } = await engine.addNote({ front: 'B', back: 'b', directions: ['forward'] });
    const aFwd = a.find((c) => c.template === 'forward')!;
    const bFwd = b[0]!;

    await session.answer(aFwd.id, 'good');
    await session.answer(bFwd.id, 'good');
    // Only A-reverse remains due, but it is buried → session ends, not shown.
    expect(await session.nextCard()).toBeNull();
    expect(await session.dueCount()).toBe(0);
  });

  it('dueCount excludes buried siblings (stays in sync with nextCard)', async () => {
    const { engine, session } = setup({ t: T0 }, 0);
    const { cards } = await engine.addNote({ front: 'A', back: 'a', directions: ['forward', 'reverse'] });
    const aFwd = cards.find((c) => c.template === 'forward')!;
    expect(await session.dueCount()).toBe(2); // both siblings due

    await session.answer(aFwd.id, 'good'); // aFwd rescheduled away, aRev buried
    expect(await session.dueCount()).toBe(0); // buried sibling not counted
    expect(await session.nextCard()).toBeNull(); // matches the count
  });

  it('a new StudySession instance shows a sibling the previous one buried', async () => {
    const clock = { t: T0 };
    let seq = 0;
    const engine = new LearningEngine(new MemoryStore(), {
      now: () => clock.t,
      newId: () => `id-${seq++}`,
    });
    const { cards } = await engine.addNote({ front: 'A', back: 'a', directions: ['forward', 'reverse'] });
    const aFwd = cards.find((c) => c.template === 'forward')!;
    const aRev = cards.find((c) => c.template === 'reverse')!;

    const s1 = new StudySession(engine, { now: () => clock.t, learnAheadMinutes: 0 });
    await s1.answer(aFwd.id, 'good');
    expect(await s1.nextCard()).toBeNull(); // aRev buried in s1

    const s2 = new StudySession(engine, { now: () => clock.t, learnAheadMinutes: 0 });
    expect((await s2.nextCard())?.id).toBe(aRev.id); // fresh session shows it again
  });

  it('the answered card itself can still resurface via learn-ahead; the sibling cannot', async () => {
    const { engine, session } = setup({ t: T0 }, 20);
    const { cards } = await engine.addNote({ front: 'A', back: 'a', directions: ['forward', 'reverse'] });
    const aFwd = cards.find((c) => c.template === 'forward')!;
    const aRev = cards.find((c) => c.template === 'reverse')!;

    await session.answer(aFwd.id, 'again'); // aFwd → learning, due ~+1m (within learn-ahead)

    const next = await session.nextCard();
    expect(next?.id).toBe(aFwd.id); // answered card resurfaces
    expect(next?.id).not.toBe(aRev.id); // sibling stays buried even though it is due now
    expect(await session.dueCount()).toBe(1); // only the answered card, not the buried sibling
  });
});

describe('StudySession — in-session flow', () => {
  it('returns a due (new) card, null when nothing is due or learning-soon', async () => {
    const { engine, session } = setup();
    expect(await session.nextCard()).toBeNull();
    const card = await engine.addCard({ front: 'a', back: 'b' });
    const next = await session.nextCard();
    expect(next?.id).toBe(card.id);
  });

  it('after "Again" the card resurfaces in the SAME session via learn-ahead', async () => {
    const { engine, session } = setup();
    const card = await engine.addCard({ front: 'der Hund', back: 'собака' });

    const { card: lapsed } = await engine.review(card.id, 'again');
    expect(lapsed.state).toBe('learning');
    expect(lapsed.due).toBeGreaterThan(T0); // scheduled a short step into the future

    // Without advancing the clock at all, the learning card comes back
    // (its ~1m step is inside the 20m learn-ahead window).
    const again = await session.nextCard();
    expect(again?.id).toBe(card.id);
  });

  it('with learnAhead=0 a not-yet-due learning card is NOT pulled ahead', async () => {
    const { engine, session } = setup({ t: T0 }, 0);
    const card = await engine.addCard({ front: 'a', back: 'b' });
    await engine.review(card.id, 'again'); // due ~+1m, not due at T0
    expect(await session.nextCard()).toBeNull();
  });

  it('a learning card becomes selectable once its step actually matures', async () => {
    const { engine, session, clock } = setup({ t: T0 }, 0); // strict: no learn-ahead
    const card = await engine.addCard({ front: 'a', back: 'b' });
    const { card: lapsed } = await engine.review(card.id, 'again');
    expect(await session.nextCard()).toBeNull();
    clock.t = lapsed.due; // time passes to the step's due moment
    expect((await session.nextCard())?.id).toBe(card.id);
  });

  it('graduated (Review) cards do not resurface within the session', async () => {
    const { engine, session } = setup();
    const card = await engine.addCard({ front: 'a', back: 'b' });
    const { card: graduated } = await engine.review(card.id, 'easy');
    expect(graduated.state).toBe('review');
    expect(await session.nextCard()).toBeNull(); // due in days, not learning-soon
  });

  it('orders by due (earliest first) with a deterministic id tie-break', async () => {
    const { engine, session } = setup();
    // Two brand-new cards share due == createdAt == T0; tie-break by id.
    const first = await engine.addCard({ front: 'a', back: '1' });
    await engine.addCard({ front: 'b', back: '2' });
    expect((await session.nextCard())?.id).toBe(first.id);
  });

  it('nextCard never mutates cards or the review log', async () => {
    const { engine, session } = setup();
    await engine.addCard({ front: 'a', back: 'b' });
    await session.nextCard();
    await session.nextCard();
    expect((await engine.getStats()).reviewsToday).toBe(0);
  });
});

describe('StudySession — dueCount (learn-ahead aware)', () => {
  it('counts a learning card 5m out but not one 30m out (learnAhead=20)', async () => {
    const store = new MemoryStore();
    const engine = new LearningEngine(store, { now: () => T0 });
    const session = new StudySession(engine, { now: () => T0, learnAheadMinutes: 20 });
    await store.putCard(cardFixture('in', 5, 'learning')); // within window → counts
    await store.putCard(cardFixture('out', 30, 'learning')); // beyond window → excluded
    expect(await session.dueCount()).toBe(1);
    expect((await session.nextCard())?.id).toBe('in');
  });

  it('a not-yet-due review card in the window is NOT counted (only learning is pulled ahead)', async () => {
    const store = new MemoryStore();
    const engine = new LearningEngine(store, { now: () => T0 });
    const session = new StudySession(engine, { now: () => T0, learnAheadMinutes: 20 });
    await store.putCard(cardFixture('rev', 5, 'review')); // future review → not pulled ahead
    expect(await session.dueCount()).toBe(0);
    expect(await session.nextCard()).toBeNull();
  });

  it('counts due-now cards plus learn-ahead learning cards together', async () => {
    const store = new MemoryStore();
    const engine = new LearningEngine(store, { now: () => T0 });
    const session = new StudySession(engine, { now: () => T0, learnAheadMinutes: 20 });
    await store.putCard(cardFixture('due', -1, 'review')); // due already
    await store.putCard(cardFixture('soon', 10, 'learning')); // learn-ahead
    await store.putCard(cardFixture('later', 45, 'learning')); // beyond window
    expect(await session.dueCount()).toBe(2);
  });

  it('dueCount stays in sync with nextCard: 0 exactly when nextCard is null', async () => {
    const { engine, session } = setup();
    expect(await session.dueCount()).toBe(0);
    expect(await session.nextCard()).toBeNull();

    const card = await engine.addCard({ front: 'a', back: 'b' });
    expect(await session.dueCount()).toBe(1);

    // "Again" keeps the card in the session (learning within learn-ahead)
    await engine.review(card.id, 'again');
    expect(await session.dueCount()).toBe(1);
    expect(await session.nextCard()).not.toBeNull();
  });
});

describe('StudySession — determinism', () => {
  it('the same interaction history yields the same selection order', async () => {
    const ratings: Rating[] = ['again', 'good', 'again', 'hard', 'good'];

    async function run(): Promise<Array<string | null>> {
      const clock = { t: T0 };
      const { engine, session } = setup(clock);
      const card = await engine.addCard({ front: 'q', back: 'a' });
      const seen: Array<string | null> = [];
      for (const rating of ratings) {
        const next = await session.nextCard();
        seen.push(next?.id ?? null);
        if (next) await engine.review(next.id, rating);
        clock.t += 30 * MIN; // advance a fixed amount each turn
      }
      return seen;
    }

    expect(await run()).toEqual(await run());
  });
});

describe('StudySession — daily new-card limit (TASK_020)', () => {
  it('unlimited (default/omitted) preserves existing behavior: all new cards stay reachable', async () => {
    const { engine, session } = setup(); // newCardsPerDay omitted -> unlimited
    await engine.addCard({ front: 'a', back: '1' });
    await engine.addCard({ front: 'b', back: '2' });
    expect(await session.dueCount()).toBe(2);
    expect(await session.newCardsWithheldByLimit()).toBe(0);
  });

  it('explicit null is unlimited, same as omitting the option', async () => {
    const clock = { t: T0 };
    let seq = 0;
    const engine = new LearningEngine(new MemoryStore(), { now: () => clock.t, newId: () => `id-${seq++}` });
    const session = new StudySession(engine, { now: () => clock.t, newCardsPerDay: null });
    await engine.addCard({ front: 'a', back: '1' });
    await engine.addCard({ front: 'b', back: '2' });
    expect(await session.dueCount()).toBe(2);
  });

  it('"0" blocks all new cards but leaves a due non-new card untouched', async () => {
    const store = new MemoryStore();
    const clock = { t: T0 };
    let seq = 0;
    const engine = new LearningEngine(store, { now: () => clock.t, newId: () => `id-${seq++}` });
    const session = new StudySession(engine, { now: () => clock.t, newCardsPerDay: 0 });

    await engine.addCard({ front: 'new1', back: '1' }); // state 'new', due now
    await store.putCard(cardFixture('rev1', -1, 'review')); // due now, not new

    expect(await session.dueCount()).toBe(1); // only the non-new card
    expect((await session.nextCard())?.id).toBe('rev1');
    expect(await session.newCardsWithheldByLimit()).toBe(1);
  });

  it('a positive limit allows only the remaining allowance', async () => {
    const clock = { t: T0 };
    let seq = 0;
    const engine = new LearningEngine(new MemoryStore(), { now: () => clock.t, newId: () => `id-${seq++}` });
    // learnAheadMinutes: 0 isolates the daily limit from learn-ahead resurfacing
    // (a 'good' answer on a new card lands in 'learning', not straight to
    // 'review' — see engine.test.ts "learning steps" — and would otherwise
    // come back via learn-ahead, which is a separate, already-tested concern).
    const session = new StudySession(engine, { now: () => clock.t, newCardsPerDay: 1, learnAheadMinutes: 0 });

    const a = await engine.addCard({ front: 'a', back: '1' });
    await engine.addCard({ front: 'b', back: '2' });

    expect(await session.dueCount()).toBe(1); // only 1 of the 2 new cards allowed
    expect(await session.newCardsWithheldByLimit()).toBe(1);

    const shown = await session.nextCard();
    expect(shown?.id).toBe(a.id); // earliest by due/id tie-break

    await session.answer(shown!.id, 'good'); // consumes today's one allowance

    expect(await session.dueCount()).toBe(0); // b still withheld, no more allowance today
    expect(await session.newCardsWithheldByLimit()).toBe(1);
  });

  it('multiple review records for one card consume the allowance once, not per-record (defensive against inconsistent/imported history)', async () => {
    const store = new MemoryStore();
    const clock = { t: T0 };
    const engine = new LearningEngine(store, { now: () => clock.t });
    const session = new StudySession(engine, { now: () => clock.t, newCardsPerDay: 2 });

    // c1: already past 'new' (now learning), but its log carries TWO
    // 'new'-sourced review records for it — simulating inconsistent/imported
    // history (not reachable via normal engine.review(), which never returns
    // a card to 'new'). c2: a genuinely untouched new card, still due.
    await store.putCard(cardFixture('c1', 0, 'learning'));
    await store.putCard(cardFixture('c2', 0, 'new'));
    await store.appendReview({
      id: 'r1',
      cardId: 'c1',
      rating: 'good',
      reviewedAt: T0,
      stateBefore: 'new',
      stateAfter: 'learning',
      dueAfter: T0 + MIN,
      stability: 1,
      difficulty: 5,
      scheduledDays: 0,
    });
    await store.appendReview({
      id: 'r2',
      cardId: 'c1',
      rating: 'again',
      reviewedAt: T0 + 1000,
      stateBefore: 'new',
      stateAfter: 'learning',
      dueAfter: T0 + MIN,
      stability: 1,
      difficulty: 5,
      scheduledDays: 0,
    });

    // Unique-card counting: c1 counts once (usedToday=1). With limit=2, one
    // more new card (c2) must still get through — a record-count bug would
    // instead compute usedToday=2 and withhold c2. (c1 and c2 share the same
    // `due`, so nextCard()'s id tie-break is not what's under test here —
    // dueCount()/newCardsWithheldByLimit() directly confirm c2 got through.)
    expect(await session.newCardsWithheldByLimit()).toBe(0);
    expect(await session.dueCount()).toBe(2); // c1 (non-new) + c2 (allowed new)
  });

  it("a new-card answer from a previous local day does not count against today's allowance", async () => {
    const store = new MemoryStore();
    const clock = { t: T0 };
    const engine = new LearningEngine(store, { now: () => clock.t });
    const session = new StudySession(engine, { now: () => clock.t, newCardsPerDay: 1 });

    await store.appendReview({
      id: 'y1',
      cardId: 'yesterday-card',
      rating: 'good',
      reviewedAt: T0 - DAY,
      stateBefore: 'new',
      stateAfter: 'learning',
      dueAfter: T0 - DAY + MIN,
      stability: 1,
      difficulty: 5,
      scheduledDays: 0,
    });
    await store.putCard(cardFixture('today-new', 0, 'new'));

    expect(await session.newCardsWithheldByLimit()).toBe(0);
    expect((await session.nextCard())?.id).toBe('today-new');
  });

  it('learning/relearning cards remain eligible after the new-card limit is reached', async () => {
    const store = new MemoryStore();
    const clock = { t: T0 };
    const engine = new LearningEngine(store, { now: () => clock.t });
    const session = new StudySession(engine, { now: () => clock.t, newCardsPerDay: 0 });

    await store.putCard(cardFixture('learning1', -1, 'learning'));
    await store.putCard(cardFixture('relearning1', -1, 'relearning'));
    await store.putCard(cardFixture('new1', -1, 'new'));

    expect(await session.dueCount()).toBe(2); // learning + relearning; new withheld
    expect(await session.newCardsWithheldByLimit()).toBe(1);
  });

  it('newCardsWithheldByLimit is 0 when there simply are no new cards (not a false limit-reached signal)', async () => {
    const { session } = setup({ t: T0 }, 20); // no cards added at all
    expect(await session.dueCount()).toBe(0);
    expect(await session.newCardsWithheldByLimit()).toBe(0);
  });

  it('newCardsWithheldByLimit is 0 when unlimited, even with many new cards', async () => {
    const { engine, session } = setup();
    await engine.addCard({ front: 'a', back: '1' });
    await engine.addCard({ front: 'b', back: '2' });
    expect(await session.newCardsWithheldByLimit()).toBe(0);
  });

  it('showing a new card without answering it does not consume the daily allowance', async () => {
    const clock = { t: T0 };
    let seq = 0;
    const engine = new LearningEngine(new MemoryStore(), { now: () => clock.t, newId: () => `id-${seq++}` });
    const session = new StudySession(engine, { now: () => clock.t, newCardsPerDay: 1 });
    await engine.addCard({ front: 'a', back: '1' });

    await session.nextCard();
    await session.nextCard();
    await session.nextCard(); // repeated "shows", never answered

    expect(await session.dueCount()).toBe(1); // allowance still available
    expect(await session.newCardsWithheldByLimit()).toBe(0);
  });

  it('setNewCardsPerDay changes policy starting with the next selection, without reconstruction', async () => {
    const clock = { t: T0 };
    let seq = 0;
    const engine = new LearningEngine(new MemoryStore(), { now: () => clock.t, newId: () => `id-${seq++}` });
    const session = new StudySession(engine, { now: () => clock.t }); // unlimited
    await engine.addCard({ front: 'a', back: '1' });
    await engine.addCard({ front: 'b', back: '2' });

    expect(await session.dueCount()).toBe(2);

    session.setNewCardsPerDay(1);
    expect(await session.dueCount()).toBe(1);
    expect(await session.newCardsWithheldByLimit()).toBe(1);

    session.setNewCardsPerDay(0);
    expect(await session.dueCount()).toBe(0);
    expect(await session.newCardsWithheldByLimit()).toBe(2);

    session.setNewCardsPerDay(null);
    expect(await session.dueCount()).toBe(2);
    expect(await session.newCardsWithheldByLimit()).toBe(0);
  });

  it('setNewCardsPerDay does not reset ephemeral bury state', async () => {
    const { engine, session } = setup({ t: T0 }, 0); // learnAhead 0 isolates bury
    const { cards } = await engine.addNote({ front: 'A', back: 'a', directions: ['forward', 'reverse'] });
    const aFwd = cards.find((c) => c.template === 'forward')!;

    await session.answer(aFwd.id, 'good'); // buries the reverse sibling

    session.setNewCardsPerDay(5);
    session.setNewCardsPerDay(null);

    // Only the buried sibling would otherwise be due — still hidden.
    expect(await session.nextCard()).toBeNull();
  });

  it('a new StudySession instance recovers the correct allowance from the persisted Review Log', async () => {
    const clock = { t: T0 };
    let seq = 0;
    const store = new MemoryStore();
    const engine = new LearningEngine(store, { now: () => clock.t, newId: () => `id-${seq++}` });

    // learnAheadMinutes: 0 isolates the daily limit from learn-ahead
    // resurfacing of the just-answered card `a` (see the previous test).
    const s1 = new StudySession(engine, { now: () => clock.t, newCardsPerDay: 1, learnAheadMinutes: 0 });
    const a = await engine.addCard({ front: 'a', back: '1' });
    await engine.addCard({ front: 'b', back: '2' });
    await s1.answer(a.id, 'good'); // consumes the day's one allowance

    // Simulate an app restart: a brand-new StudySession instance, same engine/store.
    const s2 = new StudySession(engine, { now: () => clock.t, newCardsPerDay: 1, learnAheadMinutes: 0 });
    expect(await s2.dueCount()).toBe(0); // allowance already spent today, recovered from the log
    expect(await s2.newCardsWithheldByLimit()).toBe(1); // b still withheld
  });
});

describe('StudySession — newCardsPerDay validation (pre-commit audit fix)', () => {
  function freshEngine() {
    return new LearningEngine(new MemoryStore(), { now: () => T0 });
  }

  it('a fractional constructor option throws (would otherwise over-admit new cards)', () => {
    const engine = freshEngine();
    expect(() => new StudySession(engine, { newCardsPerDay: 1.5 })).toThrow(RangeError);
  });

  it('a negative constructor option throws', () => {
    const engine = freshEngine();
    expect(() => new StudySession(engine, { newCardsPerDay: -1 })).toThrow(RangeError);
  });

  it('NaN and Infinity constructor options throw', () => {
    const engine = freshEngine();
    expect(() => new StudySession(engine, { newCardsPerDay: Number.NaN })).toThrow(RangeError);
    expect(() => new StudySession(engine, { newCardsPerDay: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => new StudySession(engine, { newCardsPerDay: Number.NEGATIVE_INFINITY })).toThrow(RangeError);
  });

  it('an omitted constructor option normalizes to unlimited, not an error', () => {
    const engine = freshEngine();
    expect(() => new StudySession(engine, {})).not.toThrow();
  });

  it('setNewCardsPerDay throws on fractional/negative/NaN/Infinity', () => {
    const engine = freshEngine();
    const session = new StudySession(engine, { now: () => T0 });
    expect(() => session.setNewCardsPerDay(2.5)).toThrow(RangeError);
    expect(() => session.setNewCardsPerDay(-3)).toThrow(RangeError);
    expect(() => session.setNewCardsPerDay(Number.NaN)).toThrow(RangeError);
    expect(() => session.setNewCardsPerDay(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('an invalid setNewCardsPerDay call leaves the previously active valid limit unchanged', async () => {
    const engine = freshEngine();
    const session = new StudySession(engine, { now: () => T0, newCardsPerDay: 1, learnAheadMinutes: 0 });
    await engine.addCard({ front: 'a', back: '1' });
    await engine.addCard({ front: 'b', back: '2' });

    expect(await session.dueCount()).toBe(1); // limit=1 active

    expect(() => session.setNewCardsPerDay(1.5)).toThrow(RangeError);

    // Still governed by the original limit=1, not by the rejected 1.5 and not
    // reset to unlimited.
    expect(await session.dueCount()).toBe(1);
    expect(await session.newCardsWithheldByLimit()).toBe(1);
  });

  it('valid null, 0, and a positive integer all continue to work via the setter', async () => {
    const engine = freshEngine();
    const session = new StudySession(engine, { now: () => T0 });
    await engine.addCard({ front: 'a', back: '1' });
    await engine.addCard({ front: 'b', back: '2' });

    expect(() => session.setNewCardsPerDay(0)).not.toThrow();
    expect(await session.dueCount()).toBe(0);

    expect(() => session.setNewCardsPerDay(1)).not.toThrow();
    expect(await session.dueCount()).toBe(1);

    expect(() => session.setNewCardsPerDay(null)).not.toThrow();
    expect(await session.dueCount()).toBe(2);
  });

  it('bury state is unaffected by a valid setNewCardsPerDay call, and by a rejected invalid one', async () => {
    const engine = freshEngine();
    const session = new StudySession(engine, { now: () => T0, learnAheadMinutes: 0 });
    const { cards } = await engine.addNote({ front: 'A', back: 'a', directions: ['forward', 'reverse'] });
    const aFwd = cards.find((c) => c.template === 'forward')!;

    await session.answer(aFwd.id, 'good'); // buries the reverse sibling

    session.setNewCardsPerDay(3); // valid change
    expect(() => session.setNewCardsPerDay(-1)).toThrow(RangeError); // rejected

    // Sibling still buried through both the valid change and the rejected one.
    expect(await session.nextCard()).toBeNull();
  });
});

describe('assertValidNewCardsPerDay (standalone, no session/engine needed)', () => {
  it('accepts null, undefined, 0, and positive integers without throwing', () => {
    expect(() => assertValidNewCardsPerDay(null)).not.toThrow();
    expect(() => assertValidNewCardsPerDay(undefined)).not.toThrow();
    expect(() => assertValidNewCardsPerDay(0)).not.toThrow();
    expect(() => assertValidNewCardsPerDay(20)).not.toThrow();
  });

  it('rejects negative, fractional, NaN, and Infinity values with RangeError', () => {
    expect(() => assertValidNewCardsPerDay(-1)).toThrow(RangeError);
    expect(() => assertValidNewCardsPerDay(1.5)).toThrow(RangeError);
    expect(() => assertValidNewCardsPerDay(Number.NaN)).toThrow(RangeError);
    expect(() => assertValidNewCardsPerDay(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => assertValidNewCardsPerDay(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it('does not mutate or require any session/engine — a pure precondition check', () => {
    // No StudySession/LearningEngine instantiated in this test at all: proves
    // a composition root can validate a value before persisting it, without
    // yet touching a live session (the exact use case this was added for).
    expect(assertValidNewCardsPerDay(5)).toBeUndefined();
  });
});
