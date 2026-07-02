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

  it('learning steps: each rating on a new card lands in the expected state', async () => {
    const cases: Array<{ rating: Rating; state: string }> = [
      { rating: 'again', state: 'learning' },
      { rating: 'hard', state: 'learning' },
      { rating: 'good', state: 'learning' },
      { rating: 'easy', state: 'review' },
    ];
    for (const { rating, state } of cases) {
      const { engine } = makeEngine();
      const card = await engine.addCard({ front: 'a', back: 'b' });
      const { card: after } = await engine.review(card.id, rating);
      expect(after.state, `new + ${rating}`).toBe(state);
      expect(after.due, `new + ${rating} schedules ahead`).toBeGreaterThan(T0);
    }
  });

  it('learning steps: "again" keeps the card in a short intraday step', async () => {
    const { engine } = makeEngine();
    const card = await engine.addCard({ front: 'a', back: 'b' });
    const { card: after } = await engine.review(card.id, 'again');
    // sub-day step, not a multi-day review interval
    expect(after.due - T0).toBeLessThan(DAY);
    expect(after.scheduling.scheduledDays).toBe(0);
  });

  it('learning steps: card graduates Learning → Review after enough "good"s', async () => {
    const { engine, clock } = makeEngine();
    const card = await engine.addCard({ front: 'a', back: 'b' });
    let state = (await engine.review(card.id, 'good')).card;
    expect(state.state).toBe('learning'); // still stepping
    // answer again at its due moment until it graduates
    for (let i = 0; i < 5 && state.state === 'learning'; i++) {
      clock.t = state.due;
      state = (await engine.review(card.id, 'good')).card;
    }
    expect(state.state).toBe('review');
    expect(state.due - clock.t).toBeGreaterThan(DAY); // real multi-day interval
  });

  it('editing note content never touches scheduling', async () => {
    const { engine } = makeEngine();
    const card = await engine.addCard({ front: 'a', back: 'b' });
    const reviewed = (await engine.review(card.id, 'good')).card;
    await engine.updateNoteContent(card.noteId, { front: 'a2', back: 'b2' });
    const view = await engine.getCardView(card.id);
    expect(view?.front).toBe('a2');
    expect(view?.card.due).toBe(reviewed.due);
    expect(view?.card.scheduling).toEqual(reviewed.scheduling);
  });
});

describe('notes and multi-card', () => {
  it('addNote with forward+reverse yields two cards sharing one note', async () => {
    const { engine } = makeEngine();
    const { note, cards } = await engine.addNote({
      front: 'der Hund',
      back: 'собака',
      directions: ['forward', 'reverse'],
    });
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.noteId === note.id)).toBe(true);
    const [fwd, rev] = await Promise.all([
      engine.getCardView(cards[0]!.id),
      engine.getCardView(cards[1]!.id),
    ]);
    // forward: front→back as authored; reverse: sides swapped
    expect(fwd).toMatchObject({ front: 'der Hund', back: 'собака' });
    expect(rev).toMatchObject({ front: 'собака', back: 'der Hund' });
  });

  it('editing the note updates every sibling card at once (single source of truth)', async () => {
    const { engine } = makeEngine();
    const { note, cards } = await engine.addNote({
      front: 'q',
      back: 'a',
      directions: ['forward', 'reverse'],
    });
    await engine.updateNoteContent(note.id, { front: 'Q', back: 'A' });
    const views = await engine.listCardViews();
    const fwd = views.find((v) => v.card.template === 'forward');
    const rev = views.find((v) => v.card.template === 'reverse');
    expect(fwd).toMatchObject({ front: 'Q', back: 'A' });
    expect(rev).toMatchObject({ front: 'A', back: 'Q' });
    expect(cards).toHaveLength(2);
  });

  it('sibling cards schedule independently', async () => {
    const { engine, clock } = makeEngine();
    const { cards } = await engine.addNote({ front: 'q', back: 'a', directions: ['forward', 'reverse'] });
    const [c1, c2] = cards;
    await engine.review(c1!.id, 'easy'); // graduate one
    clock.t += 60_000;
    const s1 = await engine.getCard(c1!.id);
    const s2 = await engine.getCard(c2!.id);
    expect(s1!.state).toBe('review');
    expect(s2!.state).toBe('new'); // untouched
    expect(s1!.due).not.toBe(s2!.due);
  });

  it('addNote defaults to a single forward card; addCard is 1:1 sugar', async () => {
    const { engine } = makeEngine();
    const { cards } = await engine.addNote({ front: 'x', back: 'y' });
    expect(cards).toHaveLength(1);
    expect(cards[0]!.template).toBe('forward');
    const card = await engine.addCard({ front: 'p', back: 'q' });
    const view = await engine.getCardView(card.id);
    expect(view).toMatchObject({ front: 'p', back: 'q' });
  });

  it('deleting the last card of a note removes the orphan note; deleteNote cascades', async () => {
    const { engine } = makeEngine();
    const single = await engine.addCard({ front: 'a', back: 'b' });
    const noteId = single.noteId;
    await engine.deleteCard(single.id);
    expect(await engine.getNote(noteId)).toBeUndefined();

    const { note, cards } = await engine.addNote({ front: 'q', back: 'a', directions: ['forward', 'reverse'] });
    await engine.deleteNote(note.id);
    expect(await engine.getNote(note.id)).toBeUndefined();
    for (const c of cards) expect(await engine.getCard(c.id)).toBeUndefined();
  });

  it('updateCardContent (deprecated) only allows a forward card with no siblings', async () => {
    const { engine } = makeEngine();
    // forward 1:1 → allowed
    const solo = await engine.addCard({ front: 'a', back: 'b' });
    await engine.updateCardContent(solo.id, { front: 'a2', back: 'b2' });
    expect((await engine.getCardView(solo.id))?.front).toBe('a2');

    // has a sibling → rejected
    const { cards } = await engine.addNote({ front: 'q', back: 'a', directions: ['forward', 'reverse'] });
    const fwd = cards.find((c) => c.template === 'forward')!;
    const rev = cards.find((c) => c.template === 'reverse')!;
    await expect(engine.updateCardContent(fwd.id, { front: 'x', back: 'y' })).rejects.toThrow();
    // reverse card → rejected
    await expect(engine.updateCardContent(rev.id, { front: 'x', back: 'y' })).rejects.toThrow();
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

describe('listCardViews batching (TASK_006)', () => {
  it('batches note loads (no N+1) and matches per-card getCardView', async () => {
    class CountingStore extends MemoryStore {
      counts = { getNote: 0, getNotesByIds: 0 };
      lastIds: string[] = [];
      override async getNote(id: string) {
        this.counts.getNote++;
        return super.getNote(id);
      }
      override async getNotesByIds(ids: string[]) {
        this.counts.getNotesByIds++;
        this.lastIds = ids;
        return super.getNotesByIds(ids);
      }
    }
    const store = new CountingStore();
    let seq = 0;
    const engine = new LearningEngine(store, { now: () => T0, newId: () => `id-${seq++}` });
    // note X → 2 sibling cards; note Y → 1 card. 3 cards, 2 notes.
    await engine.addNote({ front: 'a', back: '1', directions: ['forward', 'reverse'] });
    await engine.addCard({ front: 'b', back: '2' });

    // Reference via per-card getCardView (which reads notes one by one).
    const cards = await engine.listCards();
    const reference = [];
    for (const c of cards) reference.push(await engine.getCardView(c.id));

    store.counts = { getNote: 0, getNotesByIds: 0 };
    const views = await engine.listCardViews();

    expect(views).toEqual(reference); // identical output, incl. sibling cards
    expect(store.counts.getNote).toBe(0); // no per-card note reads
    expect(store.counts.getNotesByIds).toBe(1); // single batch call
    expect(store.lastIds.length).toBe(2); // deduped: 2 notes for 3 cards
  });
});

describe('review log replay (CardState reconstruction)', () => {
  const histories: Rating[][] = [
    ['again', 'again', 'good', 'good', 'easy'],
    ['good', 'good', 'again', 'hard', 'good'],
    ['easy'],
    ['again', 'again', 'again'],
    ['hard', 'good', 'again', 'good', 'good', 'easy'],
  ];

  it('rebuildCardState reproduces the cached state for varied histories', async () => {
    for (const ratings of histories) {
      const clock = { t: T0 };
      const { engine } = makeEngine(clock);
      const card = await engine.addCard({ front: 'q', back: 'a' });
      for (const rating of ratings) {
        const { card: u } = await engine.review(card.id, rating);
        clock.t = Math.max(clock.t + 60_000, u.due); // answer when due
      }
      const stored = await engine.getCard(card.id);
      const rebuilt = await engine.rebuildCardState(card.id);
      expect(rebuilt!.state, ratings.join(',')).toBe(stored!.state);
      expect(rebuilt!.due, ratings.join(',')).toBe(stored!.due);
      expect(rebuilt!.scheduling, ratings.join(',')).toEqual(stored!.scheduling);
    }
  });

  it('a never-reviewed card rebuilds to its initial (new) state', async () => {
    const { engine } = makeEngine();
    const card = await engine.addCard({ front: 'a', back: 'b' });
    const stored = await engine.getCard(card.id);
    const rebuilt = await engine.rebuildCardState(card.id);
    expect(rebuilt!.state).toBe('new');
    expect(rebuilt!.due).toBe(stored!.due);
    expect(rebuilt!.scheduling).toEqual(stored!.scheduling);
  });

  it('rebuilds purely from the log even when the cached scheduling is corrupted', async () => {
    const clock = { t: T0 };
    let seq = 0;
    const store = new MemoryStore();
    const engine = new LearningEngine(store, { now: () => clock.t, newId: () => `id-${seq++}` });

    const card = await engine.addCard({ front: 'q', back: 'a' });
    for (const rating of ['again', 'good', 'good', 'easy'] as Rating[]) {
      const { card: u } = await engine.review(card.id, rating);
      clock.t = Math.max(clock.t + 60_000, u.due);
    }
    const truth = await engine.rebuildCardState(card.id);

    // Deliberately trash the stored scheduling cache (but not identity/log).
    const good = (await engine.getCard(card.id))!;
    await store.putCard({
      ...good,
      due: 0,
      state: 'new',
      scheduling: {
        stability: -999,
        difficulty: -999,
        reps: -1,
        lapses: -1,
        scheduledDays: -1,
        learningSteps: -1,
        lastReview: 0,
      },
    });

    const rebuilt = await engine.rebuildCardState(card.id);
    // Reconstruction ignores the corrupted cache and matches the log-derived truth.
    expect(rebuilt).toEqual(truth);
    expect(rebuilt!.state).not.toBe('new');
    expect(rebuilt!.scheduling.stability).toBeGreaterThan(0);
  });

  it('rebuildCardState returns undefined for a missing card', async () => {
    const { engine } = makeEngine();
    expect(await engine.rebuildCardState('nope')).toBeUndefined();
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
