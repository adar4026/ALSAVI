import type { Card, Note, NoteId, Rating, Review } from './types.js';

/**
 * Learning statistics (TASK_026): pure, read-only derivations from the data
 * the Engine already owns — cards (scheduling cache), notes (content,
 * archive flag) and the append-only Review Log. Nothing here writes, caches
 * or schedules; the same input always gives the same output.
 *
 * Definitions (normative — the UI only displays them):
 *  - **successful answer** — rating `hard`, `good` or `easy`;
 *    **unsuccessful** — `again` ("Не помню"). See {@link isSuccessfulRating}.
 *  - **day** — a local calendar day: from local midnight to the next local
 *    midnight (`startOfLocalDay`). DST days (23 h / 25 h) are still one day.
 *  - **study day** — a day with at least one recorded review. Opening the app
 *    without answering a card does not count: only the Review Log is read.
 *  - **current streak** — consecutive study days ending today; if today has
 *    no review yet, the run ending yesterday (today is not over, the streak is
 *    not broken until a whole day passes without a review). `reviewedToday`
 *    tells the two cases apart.
 *  - **longest streak** — the longest run of consecutive study days in the log.
 *  - Log-based numbers (today, streaks, activity) count every review in the
 *    log, including cards that were later archived: that history happened.
 *    Card counts and difficult words describe the active collection only.
 *  - **difficult word** — an active note whose cards have `scheduling.lapses
 *    > 0` (times a learned card was forgotten), ranked by total lapses. The
 *    same signal the "Трудные" card-list filter uses; no new metric.
 */

/** Maps an instant (epoch ms) to the start of its calendar day (epoch ms). */
export type DayStartFn = (epochMs: number) => number;

/** Start of the local calendar day (local midnight) containing `epochMs`. */
export function startOfLocalDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** `hard`/`good`/`easy` are successful recalls; only `again` is not. */
export function isSuccessfulRating(rating: Rating): boolean {
  return rating !== 'again';
}

export interface DayActivity {
  /** Start of the calendar day (epoch ms). */
  dayStart: number;
  /** Reviews recorded on that day; 0 for a day without reviews. */
  reviews: number;
}

export interface ActivityWindow {
  /** Exactly N consecutive days, oldest first, the last one is today. */
  days: DayActivity[];
  /** Sum of `reviews` over the window. */
  total: number;
  /** Days in the window with at least one review. */
  activeDays: number;
}

export interface DifficultWord {
  noteId: NoteId;
  front: string;
  back: string;
  /** Total lapses over the note's cards. */
  lapses: number;
}

export interface LearningStats {
  today: {
    reviews: number;
    /** `hard` + `good` + `easy`. */
    successful: number;
    /** `again`. */
    again: number;
  };
  streak: {
    current: number;
    longest: number;
    /** Today already has a review (the current streak includes today). */
    reviewedToday: boolean;
  };
  activity: {
    last7: ActivityWindow;
    last30: ActivityWindow;
  };
  /**
   * Cards of active (non-archived) notes, split by state into disjoint
   * groups: `new + learning + dueReview + waiting === active`. Forward and
   * reverse cards of one note count separately. Archived cards are only in
   * `archived`.
   */
  cards: {
    active: number;
    /** `state === 'new'` — never answered. */
    new: number;
    /** `learning` or `relearning` — going through short learning steps. */
    learning: number;
    /** `review` cards whose due time has come (`due <= now`). */
    dueReview: number;
    /** `review` cards not yet due. */
    waiting: number;
    archived: number;
  };
  difficult: {
    /** Up to {@link DIFFICULT_WORDS_LIMIT}, most lapses first. */
    words: DifficultWord[];
    /** All active notes with at least one lapse. */
    total: number;
  };
}

export interface StatsInput {
  cards: readonly Card[];
  notes: readonly Note[];
  reviews: readonly Review[];
  /** epoch ms */
  now: number;
}

export const DIFFICULT_WORDS_LIMIT = 5;

const SHORT_WINDOW_DAYS = 7;
const LONG_WINDOW_DAYS = 30;

/**
 * Computes {@link LearningStats}. `startOfDay` defines the calendar; it
 * defaults to the device's local calendar and is injectable only so tests can
 * pin a time zone independently of the machine running them.
 */
export function computeLearningStats(
  input: StatsInput,
  startOfDay: DayStartFn = startOfLocalDay
): LearningStats {
  const { cards, notes, reviews, now } = input;
  const today = startOfDay(now);

  const todays = reviews.filter((r) => startOfDay(r.reviewedAt) === today);
  const successful = todays.filter((r) => isSuccessfulRating(r.rating)).length;

  const reviewsPerDay = new Map<number, number>();
  for (const r of reviews) {
    const day = startOfDay(r.reviewedAt);
    reviewsPerDay.set(day, (reviewsPerDay.get(day) ?? 0) + 1);
  }

  const archivedNoteIds = new Set(notes.filter((n) => n.archivedAt !== undefined).map((n) => n.id));
  const activeCards = cards.filter((c) => !archivedNoteIds.has(c.noteId));

  return {
    today: { reviews: todays.length, successful, again: todays.length - successful },
    streak: computeStreaks(reviewsPerDay.keys(), now, startOfDay),
    activity: {
      last7: activityWindow(reviewsPerDay, today, SHORT_WINDOW_DAYS, startOfDay),
      last30: activityWindow(reviewsPerDay, today, LONG_WINDOW_DAYS, startOfDay),
    },
    cards: countCards(activeCards, cards.length - activeCards.length, now),
    difficult: difficultWords(activeCards, notes),
  };
}

/** Number of reviews recorded on the calendar day containing `now`. */
export function countReviewsToday(
  reviews: readonly Review[],
  now: number,
  startOfDay: DayStartFn = startOfLocalDay
): number {
  const today = startOfDay(now);
  return reviews.filter((r) => startOfDay(r.reviewedAt) === today).length;
}

/**
 * Current and longest streak of consecutive study days. `dayStarts` are the
 * start-of-day keys of days with at least one review (duplicates allowed).
 * See the module comment for the definitions.
 */
export function computeStreaks(
  dayStarts: Iterable<number>,
  now: number,
  startOfDay: DayStartFn = startOfLocalDay
): LearningStats['streak'] {
  const days = new Set(dayStarts);
  const previousDay = (dayStart: number) => startOfDay(dayStart - 1);
  const today = startOfDay(now);
  const reviewedToday = days.has(today);

  let current = 0;
  let cursor = reviewedToday ? today : previousDay(today);
  while (days.has(cursor)) {
    current += 1;
    cursor = previousDay(cursor);
  }

  let longest = 0;
  let run = 0;
  let next: number | undefined;
  for (const day of [...days].sort((a, b) => b - a)) {
    run = next !== undefined && day === previousDay(next) ? run + 1 : 1;
    longest = Math.max(longest, run);
    next = day;
  }

  return { current, longest, reviewedToday };
}

function activityWindow(
  reviewsPerDay: ReadonlyMap<number, number>,
  today: number,
  length: number,
  startOfDay: DayStartFn
): ActivityWindow {
  const starts = [today];
  while (starts.length < length) starts.push(startOfDay(starts[starts.length - 1]! - 1));
  const days = starts.reverse().map((dayStart) => ({ dayStart, reviews: reviewsPerDay.get(dayStart) ?? 0 }));
  return {
    days,
    total: days.reduce((sum, d) => sum + d.reviews, 0),
    activeDays: days.filter((d) => d.reviews > 0).length,
  };
}

function countCards(active: readonly Card[], archived: number, now: number): LearningStats['cards'] {
  const counts = { active: active.length, new: 0, learning: 0, dueReview: 0, waiting: 0, archived };
  for (const card of active) {
    if (card.state === 'new') counts.new += 1;
    else if (card.state === 'learning' || card.state === 'relearning') counts.learning += 1;
    else if (card.due <= now) counts.dueReview += 1;
    else counts.waiting += 1;
  }
  return counts;
}

function difficultWords(activeCards: readonly Card[], notes: readonly Note[]): LearningStats['difficult'] {
  const lapsesByNote = new Map<NoteId, number>();
  for (const card of activeCards) {
    if (card.scheduling.lapses > 0) {
      lapsesByNote.set(card.noteId, (lapsesByNote.get(card.noteId) ?? 0) + card.scheduling.lapses);
    }
  }
  const notesById = new Map(notes.map((n) => [n.id, n]));
  const words: DifficultWord[] = [];
  for (const [noteId, lapses] of lapsesByNote) {
    const note = notesById.get(noteId);
    if (note) words.push({ noteId, front: note.front, back: note.back, lapses });
  }
  words.sort(
    (a, b) =>
      b.lapses - a.lapses ||
      a.front.localeCompare(b.front) ||
      (a.noteId < b.noteId ? -1 : a.noteId > b.noteId ? 1 : 0)
  );
  return { words: words.slice(0, DIFFICULT_WORDS_LIMIT), total: words.length };
}
