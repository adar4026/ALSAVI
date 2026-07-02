import { describe, expect, it } from 'vitest';
import { LearningEngine } from '../src/engine.js';
import { MemoryStore } from '../src/memory-store.js';
import { StudySession } from '../src/study-session.js';
import type { Rating } from '../src/types.js';

const T0 = new Date('2026-07-01T10:00:00Z').getTime();
const MIN = 60_000;

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
