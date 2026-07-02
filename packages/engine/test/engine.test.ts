import { describe, expect, it } from 'vitest';
import { LearningEngine } from '../src/engine.js';
import { MemoryStore } from '../src/memory-store.js';
import type { Rating } from '../src/types.js';

const T0 = new Date('2026-07-01T10:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function makeEngine(clock: { t: number } = { t: T0 }) {
  let seq = 0;
  const engine = new LearningEngine(new MemoryStore(), {
    now: () => clock.t,
    newId: () => `id-${seq++}`,
  });
  return { engine, clock };
}

describe('card lifecycle', () => {
  it('a new card is due immediately', async () => {
    const { engine } = makeEngine();
    const card = await engine.addCard({ front: 'der Hund', back: 'собака' });
    expect(card.state).toBe('new');
    expect(card.due).toBeLessThanOrEqual(T0);
    expect(await engine.getDueCards()).toHaveLength(1);
  });

  it('rejects empty content', async () => {
    const { engine } = makeEngine();
    await expect(engine.addCard({ front: '  ', back: 'x' })).rejects.toThrow();
  });

  it('reviewing "good" schedules the card into the future and logs the review', async () => {
    const { engine } = makeEngine();
    const card = await engine.addCard({ front: 'die Katze', back: 'кошка' });
    const { card: updated, review } = await engine.review(card.id, 'good');
    expect(updated.due).toBeGreaterThan(T0);
    expect(updated.state).not.toBe('new');
    expect(review.rating).toBe('good');
    expect(review.stateBefore).toBe('new');
    expect(await engine.getDueCards()).toHaveLength(0);
  });

  it('"again" after graduation sends the card to relearning', async () => {
    const { engine, clock } = makeEngine();
    const card = await engine.addCard({ front: 'a', back: 'b' });
    // graduate: easy puts a new card straight into review state
    const first = await engine.review(card.id, 'easy');
    expect(first.card.state).toBe('review');
    clock.t = first.card.due + DAY;
    const lapsed = await engine.review(card.id, 'again');
    expect(lapsed.card.state).toBe('relearning');
    expect(lapsed.card.scheduling.lapses).toBe(1);
  });

  it('editing content never touches scheduling', async () => {
    const { engine } = makeEngine();
    const card = await engine.addCard({ front: 'a', back: 'b' });
    const reviewed = (await engine.review(card.id, 'good')).card;
    const edited = await engine.updateCardContent(card.id, { front: 'a2', back: 'b2' });
    expect(edited.front).toBe('a2');
    expect(edited.due).toBe(reviewed.due);
    expect(edited.scheduling).toEqual(reviewed.scheduling);
  });
});

describe('determinism (memory-regression guard)', () => {
  it('the same review history always produces the identical schedule', async () => {
    const ratings: Rating[] = ['good', 'good', 'again', 'hard', 'good', 'easy', 'good'];

    async function run(): Promise<number[]> {
      const clock = { t: T0 };
      const { engine } = makeEngine(clock);
      const card = await engine.addCard({ front: 'q', back: 'a' });
      const dues: number[] = [];
      for (const rating of ratings) {
        const { card: updated } = await engine.review(card.id, rating);
        dues.push(updated.due);
        clock.t = Math.max(clock.t + 60_000, updated.due); // answer when due
      }
      return dues;
    }

    expect(await run()).toEqual(await run());
  });

  it('preview intervals are ordered: again <= hard <= good <= easy', async () => {
    const { engine, clock } = makeEngine();
    const card = await engine.addCard({ front: 'q', back: 'a' });
    // check both a new card and a mature one
    for (let i = 0; i < 3; i++) {
      const p = await engine.previewIntervals(card.id);
      expect(p.again).toBeLessThanOrEqual(p.hard);
      expect(p.hard).toBeLessThanOrEqual(p.good);
      expect(p.good).toBeLessThanOrEqual(p.easy);
      const { card: updated } = await engine.review(card.id, 'good');
      clock.t = Math.max(clock.t + 60_000, updated.due);
    }
  });

  it('preview does not mutate the card or the log', async () => {
    const { engine } = makeEngine();
    const card = await engine.addCard({ front: 'q', back: 'a' });
    await engine.previewIntervals(card.id);
    const after = await engine.getCard(card.id);
    expect(after).toEqual(card);
    expect((await engine.getStats()).reviewsToday).toBe(0);
  });
});

describe('stats', () => {
  it('counts cards, due, accuracy and streak', async () => {
    const clock = { t: T0 };
    const { engine } = makeEngine(clock);
    const a = await engine.addCard({ front: 'a', back: '1' });
    await engine.addCard({ front: 'b', back: '2' });

    await engine.review(a.id, 'good');
    clock.t = T0 + DAY;
    await engine.review(a.id, 'again');

    const stats = await engine.getStats();
    expect(stats.totalCards).toBe(2);
    expect(stats.newCards).toBe(1);
    expect(stats.dueNow).toBeGreaterThanOrEqual(1); // card b + relearning card a
    expect(stats.reviewsToday).toBe(1); // only the review on day 2
    expect(stats.accuracy).toBeCloseTo(0.5);
    expect(stats.streakDays).toBe(2); // reviewed yesterday and today
  });

  it('empty engine has null accuracy and zero streak', async () => {
    const { engine } = makeEngine();
    const stats = await engine.getStats();
    expect(stats.accuracy).toBeNull();
    expect(stats.streakDays).toBe(0);
    expect(stats.totalCards).toBe(0);
  });
});

describe('layer boundary', () => {
  it('engine sources contain no network or AI imports', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const srcDir = join(import.meta.dirname, '..', 'src');
    for (const file of await readdir(srcDir)) {
      const text = await readFile(join(srcDir, file), 'utf8');
      expect(text, `${file} must not touch network/AI`).not.toMatch(
        /\bfetch\(|XMLHttpRequest|WebSocket|anthropic|openai/i
      );
    }
  });
});
