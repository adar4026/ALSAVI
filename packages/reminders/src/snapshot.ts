import { dayKey, isValidTimeZone } from './zoned.js';

/**
 * Review-schedule snapshot: everything the push server needs to know "how
 * many cards are waiting at moment T", and nothing else — no words, no
 * card ids, no history. The FSRS schedule stays the only source: the app
 * reads each active card's `due` and `state` through `LearningEngine` and
 * the snapshot only buckets those due dates.
 *
 * Why this is exact without the app being open: a card's `due` changes only
 * when it is answered, added, archived, deleted or restored — all of which
 * happen in the app, which then sends a new snapshot. Between those moments
 * the count at any future T follows from the due dates alone.
 *
 * Buckets round each due date UP (a card is never counted before it is
 * due): 5 minutes for the next week, 1 hour up to 60 days, 1 day beyond.
 * Cards already due collapse into one bucket at the snapshot moment.
 *
 * The daily new-card limit (TASK_020) is mirrored like `StudySession` does:
 * new cards count only up to the allowance left on T's local day.
 */

export const SNAPSHOT_VERSION = 1;
/** Server-side caps: far above any real collection's bucket count. */
export const MAX_BUCKETS = 6000;
export const MAX_BUCKET_COUNT = 1_000_000;

/** `[bucketEndMinute, cardCount]` — minutes since the Unix epoch. */
export type Bucket = [number, number];

export interface ReviewSnapshot {
  v: typeof SNAPSHOT_VERSION;
  /** epoch ms the snapshot was taken */
  generatedAt: number;
  /** IANA zone of the device — the zone of the daily limit's local day */
  timeZone: string;
  /** local date of `generatedAt` in `timeZone` (`YYYY-MM-DD`) */
  day: string;
  /** daily new-card limit, `null` = unlimited */
  newLimit: number | null;
  /** new cards already started on `day` (`countNewCardsAnsweredSince`) */
  newUsedToday: number;
  /** due dates of started cards (learning, review, relearning) */
  started: Bucket[];
  /** due dates of new cards */
  fresh: Bucket[];
}

export interface ScheduledCard {
  due: number;
  state: string;
}

export interface SnapshotInput {
  /** Active (non-archived) cards — `LearningEngine.getCardsDueBy(Infinity)`. */
  cards: readonly ScheduledCard[];
  now: number;
  timeZone: string;
  newLimit: number | null;
  newUsedToday: number;
}

const MINUTE = 60_000;
const DAY_MIN = 1440;

function bucketEnd(due: number, nowMin: number): number {
  const dueMin = Math.ceil(due / MINUTE);
  if (dueMin <= nowMin) return nowMin;
  const ahead = dueMin - nowMin;
  const step = ahead <= 7 * DAY_MIN ? 5 : ahead <= 60 * DAY_MIN ? 60 : DAY_MIN;
  return Math.ceil(dueMin / step) * step;
}

function toBuckets(dues: number[], nowMin: number): Bucket[] {
  const counts = new Map<number, number>();
  for (const due of dues) {
    const key = bucketEnd(due, nowMin);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]);
}

export function buildSnapshot({ cards, now, timeZone, newLimit, newUsedToday }: SnapshotInput): ReviewSnapshot {
  const nowMin = Math.ceil(now / MINUTE);
  const started: number[] = [];
  const fresh: number[] = [];
  for (const c of cards) (c.state === 'new' ? fresh : started).push(c.due);
  return {
    v: SNAPSHOT_VERSION,
    generatedAt: now,
    timeZone,
    day: dayKey(now, timeZone),
    newLimit,
    newUsedToday,
    started: toBuckets(started, nowMin),
    fresh: toBuckets(fresh, nowMin),
  };
}

function sumUpTo(buckets: readonly Bucket[], at: number): number {
  const atMin = at / MINUTE;
  let n = 0;
  for (const [end, count] of buckets) {
    if (end > atMin) break;
    n += count;
  }
  return n;
}

export interface DueCounts {
  /** Today's queue at `at`: started cards due + new cards within the daily allowance. */
  queue: number;
  /** Started cards whose review is due at `at` — the backlog ("просроченные"). */
  overdue: number;
}

/**
 * Cards waiting at moment `at`, the way a fresh study session would see them
 * (without the 20-minute learn-ahead, which only matters inside a session).
 */
export function countDue(snapshot: ReviewSnapshot, at: number): DueCounts {
  const overdue = sumUpTo(snapshot.started, at);
  const freshDue = sumUpTo(snapshot.fresh, at);
  let allowed = freshDue;
  if (snapshot.newLimit !== null) {
    const used = dayKey(at, snapshot.timeZone) === snapshot.day ? snapshot.newUsedToday : 0;
    allowed = Math.min(freshDue, Math.max(0, snapshot.newLimit - used));
  }
  return { queue: overdue + allowed, overdue };
}

const isCount = (n: unknown, max: number): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max;

function validBuckets(list: unknown): list is Bucket[] {
  if (!Array.isArray(list) || list.length > MAX_BUCKETS) return false;
  let prev = -Infinity;
  for (const b of list) {
    if (!Array.isArray(b) || b.length !== 2) return false;
    const [end, count] = b as unknown[];
    if (!isCount(end, 1e9) || !isCount(count, MAX_BUCKET_COUNT) || count === 0 || end <= prev) return false;
    prev = end;
  }
  return true;
}

/** Strict shape check for a snapshot received over the network; `null` if invalid. */
export function parseSnapshot(value: unknown): ReviewSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  if (s.v !== SNAPSHOT_VERSION) return null;
  if (!isCount(s.generatedAt, 1e14) || !isValidTimeZone(s.timeZone)) return null;
  if (typeof s.day !== 'string' || s.day !== dayKey(s.generatedAt, s.timeZone)) return null;
  if (s.newLimit !== null && !isCount(s.newLimit, MAX_BUCKET_COUNT)) return null;
  if (!isCount(s.newUsedToday, MAX_BUCKET_COUNT)) return null;
  if (!validBuckets(s.started) || !validBuckets(s.fresh)) return null;
  return {
    v: SNAPSHOT_VERSION,
    generatedAt: s.generatedAt,
    timeZone: s.timeZone,
    day: s.day,
    newLimit: s.newLimit as number | null,
    newUsedToday: s.newUsedToday,
    started: s.started,
    fresh: s.fresh,
  };
}
