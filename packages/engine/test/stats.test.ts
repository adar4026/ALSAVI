import { describe, expect, it } from 'vitest';
import { LearningEngine } from '../src/engine.js';
import { MemoryStore } from '../src/memory-store.js';
import {
  computeLearningStats,
  computeStreaks,
  DIFFICULT_WORDS_LIMIT,
  isSuccessfulRating,
  startOfLocalDay,
  type DayStartFn,
  type StatsInput,
} from '../src/stats.js';
import type { Card, CardState, Note, Rating, Review } from '../src/types.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Instants are built from LOCAL date components, so "23:59 yesterday" and
 * "00:00 today" are exactly that on whatever time zone runs the suite — the
 * day-boundary assertions hold everywhere (run with e.g. TZ=Europe/Madrid to
 * also exercise the DST cases below).
 */
function at(y: number, m: number, d: number, h = 12, min = 0, s = 0, ms = 0): number {
  return new Date(y, m - 1, d, h, min, s, ms).getTime();
}

const NOW = at(2026, 10, 12, 15);

/** The local calendar day `n` days before NOW's day, at the given hour. */
function daysAgo(n: number, h = 12): number {
  return at(2026, 10, 12 - n, h);
}

let seq = 0;
function review(rating: Rating, reviewedAt: number, cardId = 'c1'): Review {
  seq += 1;
  return {
    id: `r${seq}`,
    cardId,
    rating,
    reviewedAt,
    stateBefore: 'review',
    stateAfter: rating === 'again' ? 'relearning' : 'review',
    dueAfter: reviewedAt + DAY,
    stability: 1,
    difficulty: 5,
    scheduledDays: 1,
  };
}

function note(id: string, front: string, extra: Partial<Note> = {}): Note {
  return { id, front, back: `${front}-ru`, tags: [], ...extra };
}

function card(id: string, noteId: string, state: CardState, extra: { due?: number; lapses?: number } = {}): Card {
  return {
    id,
    noteId,
    template: 'forward',
    deckId: 'default',
    createdAt: at(2026, 9, 1),
    due: extra.due ?? NOW,
    state,
    scheduling: {
      stability: 1,
      difficulty: 5,
      reps: state === 'new' ? 0 : 1,
      lapses: extra.lapses ?? 0,
      scheduledDays: 0,
      learningSteps: 0,
    },
  };
}

function stats(partial: Partial<StatsInput>, startOfDay?: DayStartFn) {
  return computeLearningStats({ cards: [], notes: [], reviews: [], now: NOW, ...partial }, startOfDay);
}

/** A calendar with a fixed UTC offset — pins a time zone regardless of the machine's. */
function fixedOffset(hours: number): DayStartFn {
  const offset = hours * 60 * 60 * 1000;
  return (ms) => Math.floor((ms + offset) / DAY) * DAY - offset;
}

describe('definitions', () => {
  it('only "again" is unsuccessful; hard, good and easy are successful', () => {
    expect(isSuccessfulRating('again')).toBe(false);
    expect(isSuccessfulRating('hard')).toBe(true);
    expect(isSuccessfulRating('good')).toBe(true);
    expect(isSuccessfulRating('easy')).toBe(true);
  });
});

describe('no reviews', () => {
  it('reports zeros everywhere, no streak, and zero-filled activity windows', () => {
    const s = stats({});
    expect(s.today).toEqual({ reviews: 0, successful: 0, again: 0 });
    expect(s.streak).toEqual({ current: 0, longest: 0, reviewedToday: false });
    expect(s.activity.last7.days).toHaveLength(7);
    expect(s.activity.last30.days).toHaveLength(30);
    expect(s.activity.last7.days.every((d) => d.reviews === 0)).toBe(true);
    expect(s.activity.last30.days.every((d) => d.reviews === 0)).toBe(true);
    expect(s.activity.last7.total).toBe(0);
    expect(s.activity.last7.activeDays).toBe(0);
    expect(s.cards).toEqual({ active: 0, new: 0, learning: 0, dueReview: 0, waiting: 0, archived: 0 });
    expect(s.difficult).toEqual({ words: [], total: 0 });
  });

  it('produces no NaN anywhere', () => {
    expect(JSON.stringify(stats({}))).not.toMatch(/NaN|null/);
  });
});

describe('today', () => {
  it('counts today\'s reviews split into successful and "again"', () => {
    const s = stats({
      reviews: [
        review('again', daysAgo(0, 8)),
        review('hard', daysAgo(0, 9)),
        review('good', daysAgo(0, 10)),
        review('easy', daysAgo(0, 11)),
        review('again', daysAgo(0, 14)),
      ],
    });
    expect(s.today).toEqual({ reviews: 5, successful: 3, again: 2 });
  });

  it('ignores reviews from earlier days', () => {
    const s = stats({ reviews: [review('good', daysAgo(1)), review('again', daysAgo(3)), review('good', daysAgo(0))] });
    expect(s.today).toEqual({ reviews: 1, successful: 1, again: 0 });
  });

  it('counts a review of a later archived card (the history happened)', () => {
    const s = stats({
      notes: [note('n1', 'el piso', { archivedAt: daysAgo(0, 13) })],
      cards: [card('c1', 'n1', 'review', { due: NOW + DAY })],
      reviews: [review('good', daysAgo(0, 9), 'c1')],
    });
    expect(s.today.reviews).toBe(1);
    expect(s.streak.current).toBe(1);
    expect(s.cards.active).toBe(0);
  });
});

describe('local day boundary', () => {
  it('23:59:59.999 belongs to yesterday, 00:00:00.000 to today', () => {
    const lastMsYesterday = at(2026, 10, 11, 23, 59, 59, 999);
    const midnight = at(2026, 10, 12, 0, 0, 0, 0);
    const s = stats({ now: at(2026, 10, 12, 0, 0, 30), reviews: [review('good', lastMsYesterday)] });
    expect(s.today.reviews).toBe(0);
    expect(s.streak).toEqual({ current: 1, longest: 1, reviewedToday: false });

    const t = stats({ now: at(2026, 10, 12, 0, 0, 30), reviews: [review('good', midnight)] });
    expect(t.today.reviews).toBe(1);
    expect(t.streak.reviewedToday).toBe(true);
  });

  it('a review just before midnight is "today" until midnight, "yesterday" right after', () => {
    const reviewedAt = at(2026, 10, 12, 23, 58);
    const before = stats({ now: at(2026, 10, 12, 23, 59, 59, 999), reviews: [review('good', reviewedAt)] });
    expect(before.today.reviews).toBe(1);
    expect(before.activity.last7.days.at(-1)!.reviews).toBe(1);

    const after = stats({ now: at(2026, 10, 13, 0, 0, 0, 0), reviews: [review('good', reviewedAt)] });
    expect(after.today.reviews).toBe(0);
    expect(after.activity.last7.days.at(-1)!.reviews).toBe(0);
    expect(after.activity.last7.days.at(-2)!.reviews).toBe(1);
    expect(after.streak).toEqual({ current: 1, longest: 1, reviewedToday: false });
  });

  it('the same instant falls on different days in different time zones', () => {
    const reviewedAt = Date.UTC(2026, 9, 12, 22, 30); // 01:30 on Oct 13 in UTC+3, 17:30 on Oct 12 in UTC-5
    const nowUtc = Date.UTC(2026, 9, 13, 9, 0); // Oct 13 in both zones (12:00 / 04:00 local)
    const plus3 = stats({ now: nowUtc, reviews: [review('good', reviewedAt)] }, fixedOffset(3));
    const minus5 = stats({ now: nowUtc, reviews: [review('good', reviewedAt)] }, fixedOffset(-5));
    expect(plus3.today.reviews).toBe(1);
    expect(plus3.streak.reviewedToday).toBe(true);
    expect(minus5.today.reviews).toBe(0);
    expect(minus5.streak).toEqual({ current: 1, longest: 1, reviewedToday: false });
    // Day buckets start at that zone's midnight.
    expect(plus3.activity.last7.days.at(-1)!.dayStart).toBe(Date.UTC(2026, 9, 12, 21));
    expect(minus5.activity.last7.days.at(-1)!.dayStart).toBe(Date.UTC(2026, 9, 13, 5));
  });

  it('DST changes (23 h and 25 h days) still give one bucket per calendar day', () => {
    // Europe: clocks go back on 2026-10-25 and forward on 2026-03-29.
    for (const [now, dates] of [
      [at(2026, 10, 27, 12), [21, 22, 23, 24, 25, 26, 27].map((d) => at(2026, 10, d, 0))],
      [at(2026, 3, 31, 12), [[3, 25], [3, 26], [3, 27], [3, 28], [3, 29], [3, 30], [3, 31]].map(([m, d]) => at(2026, m!, d!, 0))],
    ] as const) {
      const reviews = dates.map((d) => review('good', d + 23 * 60 * 60 * 1000 - 1)); // last-ish moment of each day
      const s = stats({ now, reviews });
      expect(s.activity.last7.days.map((d) => d.dayStart)).toEqual(dates);
      expect(s.activity.last7.days.every((d) => d.reviews === 1)).toBe(true);
      expect(s.streak).toEqual({ current: 7, longest: 7, reviewedToday: true });
    }
  });
});

describe('streaks', () => {
  it('a missed day breaks the streak; the longest run is kept', () => {
    // Study days: 9..5 days ago (5 in a row), gap at 4 and 3, then 2..0 (3 in a row).
    const reviews = [9, 8, 7, 6, 5, 2, 1, 0].map((n) => review('good', daysAgo(n)));
    expect(stats({ reviews }).streak).toEqual({ current: 3, longest: 5, reviewedToday: true });
  });

  it('several reviews on one day count as one study day', () => {
    const reviews = [review('good', daysAgo(1, 8)), review('again', daysAgo(1, 9)), review('good', daysAgo(1, 20))];
    expect(stats({ reviews }).streak).toEqual({ current: 1, longest: 1, reviewedToday: false });
  });

  it('a streak ending yesterday is still current until today is over', () => {
    const reviews = [3, 2, 1].map((n) => review('good', daysAgo(n)));
    expect(stats({ reviews }).streak).toEqual({ current: 3, longest: 3, reviewedToday: false });
  });

  it('a whole day without reviews ends the current streak', () => {
    const reviews = [4, 3, 2].map((n) => review('good', daysAgo(n)));
    expect(stats({ reviews }).streak).toEqual({ current: 0, longest: 3, reviewedToday: false });
  });

  it('an "again" answer still makes it a study day', () => {
    expect(stats({ reviews: [review('again', daysAgo(0))] }).streak).toEqual({
      current: 1,
      longest: 1,
      reviewedToday: true,
    });
  });

  it('the longest streak can be the current one', () => {
    const reviews = [2, 1, 0].map((n) => review('good', daysAgo(n)));
    expect(stats({ reviews }).streak).toEqual({ current: 3, longest: 3, reviewedToday: true });
  });

  it('computeStreaks accepts duplicate day keys in any order', () => {
    const d = (n: number) => startOfLocalDay(daysAgo(n));
    expect(computeStreaks([d(0), d(2), d(1), d(0), d(5)], NOW)).toEqual({ current: 3, longest: 3, reviewedToday: true });
  });
});

describe('activity windows', () => {
  it('cover today and the previous 6 / 29 days, oldest first, zero days included', () => {
    const s = stats({ reviews: [review('good', daysAgo(0)), review('good', daysAgo(0)), review('again', daysAgo(3))] });
    const last7 = s.activity.last7;
    expect(last7.days.map((d) => d.dayStart)).toEqual([6, 5, 4, 3, 2, 1, 0].map((n) => at(2026, 10, 12 - n, 0)));
    expect(last7.days.map((d) => d.reviews)).toEqual([0, 0, 0, 1, 0, 0, 2]);
    expect(last7.total).toBe(3);
    expect(last7.activeDays).toBe(2);
    expect(s.activity.last30.days[0]!.dayStart).toBe(at(2026, 9, 13, 0));
    expect(s.activity.last30.days.at(-1)!.dayStart).toBe(at(2026, 10, 12, 0));
  });

  it('the 7-day window starts exactly at local midnight 6 days ago', () => {
    const firstMs = at(2026, 10, 6, 0, 0, 0, 0);
    const s = stats({ reviews: [review('good', firstMs), review('good', firstMs - 1)] });
    expect(s.activity.last7.total).toBe(1);
    expect(s.activity.last7.days[0]!.reviews).toBe(1);
    expect(s.activity.last30.total).toBe(2); // the earlier one is still inside 30 days
  });

  it('the 30-day window starts exactly at local midnight 29 days ago', () => {
    const firstMs = at(2026, 9, 13, 0, 0, 0, 0);
    const s = stats({ reviews: [review('good', firstMs), review('good', firstMs - 1)] });
    expect(s.activity.last30.total).toBe(1);
    expect(s.activity.last30.days[0]!.reviews).toBe(1);
    expect(s.activity.last30.activeDays).toBe(1);
  });

  it('includes the last millisecond of today', () => {
    const s = stats({ now: at(2026, 10, 12, 23, 59, 59, 999), reviews: [review('good', at(2026, 10, 12, 23, 59, 59, 999))] });
    expect(s.activity.last7.days.at(-1)!.reviews).toBe(1);
  });
});

describe('cards', () => {
  it('splits active cards into disjoint groups by state; archived cards are only counted apart', () => {
    const notes = [note('n1', 'uno'), note('n2', 'dos'), note('n3', 'tres', { archivedAt: daysAgo(2) })];
    const cards = [
      card('a', 'n1', 'new'),
      card('b', 'n1', 'new'),
      card('c', 'n2', 'learning', { due: NOW + 60_000 }),
      card('d', 'n2', 'relearning', { due: NOW - 60_000 }),
      card('e', 'n2', 'review', { due: NOW }), // due exactly now → ready
      card('f', 'n2', 'review', { due: NOW - DAY }),
      card('g', 'n2', 'review', { due: NOW + 1 }),
      card('h', 'n3', 'review', { due: NOW - DAY }), // archived
      card('i', 'n3', 'new'), // archived
    ];
    const s = stats({ notes, cards });
    expect(s.cards).toEqual({ active: 7, new: 2, learning: 2, dueReview: 2, waiting: 1, archived: 2 });
    const { active, new: n, learning, dueReview, waiting } = s.cards;
    expect(n + learning + dueReview + waiting).toBe(active);
  });
});

describe('difficult words', () => {
  it('none when no active card was ever forgotten', () => {
    const notes = [note('n1', 'uno'), note('n2', 'dos')];
    const cards = [card('a', 'n1', 'review'), card('b', 'n2', 'learning')];
    expect(stats({ notes, cards }).difficult).toEqual({ words: [], total: 0 });
  });

  it('ranks active notes by total lapses (forward + reverse), at most five', () => {
    const notes = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => note(`n-${x}`, `word-${x}`));
    const lapses: Record<string, number> = { a: 1, b: 4, c: 2, d: 2, e: 6, f: 1, g: 0 };
    const cards = notes.map((n) => card(`c-${n.id}`, n.id, 'review', { lapses: lapses[n.id.slice(2)]! }));
    cards.push(card('c-n-a-rev', 'n-a', 'relearning', { lapses: 5 })); // reverse card of "a": 1 + 5 = 6

    const s = stats({ notes, cards });
    expect(s.difficult.total).toBe(6);
    expect(s.difficult.words).toHaveLength(DIFFICULT_WORDS_LIMIT);
    expect(s.difficult.words.map((w) => [w.front, w.lapses])).toEqual([
      ['word-a', 6],
      ['word-e', 6],
      ['word-b', 4],
      ['word-c', 2],
      ['word-d', 2],
    ]);
    expect(s.difficult.words[0]).toEqual({ noteId: 'n-a', front: 'word-a', back: 'word-a-ru', lapses: 6 });
  });

  it('never lists archived words', () => {
    const notes = [note('n1', 'olvidar', { archivedAt: daysAgo(1) }), note('n2', 'recordar')];
    const cards = [card('a', 'n1', 'review', { lapses: 9 }), card('b', 'n2', 'review', { lapses: 1 })];
    const s = stats({ notes, cards });
    expect(s.difficult.words.map((w) => w.front)).toEqual(['recordar']);
    expect(s.difficult.total).toBe(1);
  });
});

describe('learned words, all-time answers, due now (TASK_031)', () => {
  it('a card is learned in state "review"; a word only when all its cards are', () => {
    const notes = [
      note('n1', 'uno'), // forward review → learned
      note('n2', 'dos'), // forward review + reverse new → not yet
      note('n3', 'tres'), // forgotten: relearning → not learned
      note('n4', 'cuatro'), // forward + reverse review, one of them due → learned
      note('n5', 'cinco'), // new
    ];
    const cards = [
      card('a', 'n1', 'review', { due: NOW + DAY }),
      card('b', 'n2', 'review', { due: NOW + DAY }),
      card('c', 'n2', 'new'),
      card('d', 'n3', 'relearning', { lapses: 1 }),
      card('e', 'n4', 'review', { due: NOW - DAY }),
      card('f', 'n4', 'review', { due: NOW + DAY }),
      card('g', 'n5', 'learning'),
    ];
    const s = stats({ notes, cards });
    expect(s.notes).toEqual({ active: 5, learned: 2 });
    // Cards in "review" are exactly the learned cards: 4 of 7.
    expect(s.cards.dueReview + s.cards.waiting).toBe(4);
  });

  it('archived words are neither active nor learned', () => {
    const notes = [note('n1', 'uno', { archivedAt: daysAgo(1) }), note('n2', 'dos')];
    const cards = [card('a', 'n1', 'review'), card('b', 'n2', 'review')];
    expect(stats({ notes, cards }).notes).toEqual({ active: 1, learned: 1 });
  });

  it('a note without cards is never learned', () => {
    expect(stats({ notes: [note('n1', 'uno')], cards: [] }).notes).toEqual({ active: 1, learned: 0 });
  });

  it('counts every answer of the log, archived history included', () => {
    const notes = [note('n1', 'uno', { archivedAt: daysAgo(0) }), note('n2', 'dos')];
    const cards = [card('a', 'n1', 'review'), card('b', 'n2', 'review')];
    const reviews = [
      review('again', daysAgo(40), 'a'),
      review('hard', daysAgo(3), 'a'),
      review('good', daysAgo(1), 'b'),
      review('easy', daysAgo(0), 'b'),
      review('again', daysAgo(0), 'b'),
    ];
    expect(stats({ notes, cards, reviews }).answers).toEqual({ total: 5, successful: 3 });
  });

  it('splits answered cards into due now and later; new cards stay apart', () => {
    const notes = [note('n1', 'uno'), note('n2', 'dos'), note('n3', 'tres', { archivedAt: daysAgo(1) })];
    const cards = [
      card('a', 'n1', 'new', { due: NOW - DAY }), // new: never "due", even with an old due
      card('b', 'n1', 'review', { due: NOW }), // due exactly now
      card('c', 'n2', 'review', { due: NOW + 1 }),
      card('d', 'n2', 'learning', { due: NOW - 60_000 }), // the next step has come
      card('e', 'n2', 'relearning', { due: NOW + 60_000 }),
      card('f', 'n3', 'review', { due: NOW - DAY }), // archived
    ];
    const s = stats({ notes, cards });
    expect(s.due).toEqual({ now: 2, later: 2 });
    expect(s.due.now + s.due.later + s.cards.new).toBe(s.cards.active);
  });

  it('an empty collection: zeros, no NaN', () => {
    const s = stats({});
    expect(s.answers).toEqual({ total: 0, successful: 0 });
    expect(s.notes).toEqual({ active: 0, learned: 0 });
    expect(s.due).toEqual({ now: 0, later: 0 });
  });
});

describe('LearningEngine.getLearningStats', () => {
  function makeEngine(clock: { t: number }) {
    let id = 0;
    const store = new MemoryStore();
    const engine = new LearningEngine(store, { now: () => clock.t, newId: () => `id-${String(id++).padStart(3, '0')}` });
    return { engine, store };
  }

  it('derives the stats from real reviews without writing anything', async () => {
    const clock = { t: daysAgo(2, 9) };
    const { engine, store } = makeEngine(clock);
    const casa = await engine.addNote({ front: 'la casa', back: 'дом', directions: ['forward', 'reverse'] });
    const piso = await engine.addNote({ front: 'el piso', back: 'квартира' });
    const gato = await engine.addNote({ front: 'el gato', back: 'кот' });

    // Two days ago: graduate "la casa" (forward) straight to review.
    await engine.review(casa.cards[0]!.id, 'easy');
    // Today: "la casa" is forgotten on review → one lapse; "el piso" is answered.
    clock.t = daysAgo(0, 10);
    await engine.review(casa.cards[0]!.id, 'again');
    await engine.review(piso.cards[0]!.id, 'hard');
    await engine.archiveNote(gato.note.id);
    clock.t = daysAgo(0, 15);

    const cardsBefore = await store.listCards();
    const reviewsBefore = await store.listReviews();
    const s = await engine.getLearningStats();

    expect(s.today).toEqual({ reviews: 2, successful: 1, again: 1 });
    expect(s.streak).toEqual({ current: 1, longest: 1, reviewedToday: true }); // gap yesterday
    expect(s.activity.last7.days.map((d) => d.reviews)).toEqual([0, 0, 0, 0, 1, 0, 2]);
    expect(s.cards).toEqual({ active: 3, new: 1, learning: 2, dueReview: 0, waiting: 0, archived: 1 });
    expect(s.difficult).toEqual({
      words: [{ noteId: casa.note.id, front: 'la casa', back: 'дом', lapses: 1 }],
      total: 1,
    });

    // Read-only: no card, scheduling or Review Log change.
    expect(await store.listCards()).toEqual(cardsBefore);
    expect(await store.listReviews()).toEqual(reviewsBefore);
    expect(reviewsBefore).toHaveLength(3);
  });

  it('agrees with getStats() on today and the current streak', async () => {
    const clock = { t: daysAgo(1, 9) };
    const { engine } = makeEngine(clock);
    const { cards } = await engine.addNote({ front: 'hola', back: 'привет' });
    await engine.review(cards[0]!.id, 'good');
    clock.t = daysAgo(0, 7); // morning, nothing answered yet today

    const [learning, basic] = await Promise.all([engine.getLearningStats(), engine.getStats()]);
    expect(basic.reviewsToday).toBe(learning.today.reviews);
    expect(basic.streakDays).toBe(learning.streak.current);
    expect(basic.streakDays).toBe(1); // yesterday's day still counts until today is over
  });

  it('all-time accuracy agrees with getStats(); a graduated word counts as learned', async () => {
    const clock = { t: daysAgo(3, 9) };
    const { engine } = makeEngine(clock);
    const hola = await engine.addNote({ front: 'hola', back: 'привет' });
    const adios = await engine.addNote({ front: 'adiós', back: 'пока', directions: ['forward', 'reverse'] });
    await engine.review(hola.cards[0]!.id, 'easy'); // new → review
    await engine.review(adios.cards[0]!.id, 'easy'); // its reverse card is still new
    clock.t = daysAgo(0, 10);
    await engine.review(hola.cards[0]!.id, 'good'); // stays in review
    await engine.review(adios.cards[0]!.id, 'again'); // forgotten → relearning

    const [learning, basic] = await Promise.all([engine.getLearningStats(), engine.getStats()]);
    expect(learning.answers).toEqual({ total: 4, successful: 3 });
    expect(basic.accuracy).toBe(learning.answers.successful / learning.answers.total);
    expect((await engine.getCard(hola.cards[0]!.id))!.state).toBe('review');
    expect(learning.notes).toEqual({ active: 2, learned: 1 }); // "hola" only
    expect(learning.due).toEqual({ now: 0, later: 2 }); // both answered cards wait; the reverse is new
  });

  it('an empty collection gives an empty, finite result', async () => {
    const { engine } = makeEngine({ t: NOW });
    const s = await engine.getLearningStats();
    expect(s.today.reviews).toBe(0);
    expect(s.streak.current).toBe(0);
    expect(s.cards.active).toBe(0);
    expect(s.difficult.words).toEqual([]);
  });
});
