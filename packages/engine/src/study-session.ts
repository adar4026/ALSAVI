import type { LearningEngine, ReviewResult } from './engine.js';
import type { Card, CardId, NoteId, Rating } from './types.js';

export interface StudySessionOptions {
  /**
   * Learning/relearning cards whose short-term step becomes due within this
   * many minutes are shown early once nothing is actually due yet — Anki's
   * "learn ahead". This is an ergonomic knob (avoid dead-time waiting for a
   * step timer at the tail of a session), NOT a memory-science constant: the
   * pedagogically meaningful spacing lives in the FSRS review intervals.
   * Default 20 (covers the current 1m/10m learning steps with margin).
   */
  learnAheadMinutes?: number;
  /** Injectable clock (epoch ms) for determinism and tests. */
  now?: () => number;
  /**
   * Max unique cards allowed their first ('new'-sourced) answer per local
   * calendar day. `null`/`undefined` = unlimited (default when omitted); `0`
   * blocks all new cards today; a positive value must be a finite integer —
   * see `setNewCardsPerDay` for the shared validation contract (throws
   * `RangeError` on a negative, fractional, `NaN`, or `Infinity` value).
   */
  newCardsPerDay?: number | null;
}

const DEFAULT_LEARN_AHEAD_MINUTES = 20;

/**
 * Mirrors `LearningEngine`'s local-day boundary (local calendar midnight) so
 * the daily new-card limit agrees with `getStats().reviewsToday`/streak.
 * Duplicated (not imported) to avoid growing the engine's public API with a
 * generic day-math export for a single internal consumer.
 */
function startOfLocalDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Validates and normalizes a `newCardsPerDay` value — the single path shared
 * by the constructor and `setNewCardsPerDay`, so both enforce the same
 * contract. `null`/`undefined` mean unlimited. Any other value must be a
 * finite, non-negative integer: a fractional value would silently admit one
 * more card than intended (the withheld-count loop in `selectEligible`
 * decrements the remaining allowance by whole units), and negative/`NaN`/
 * `Infinity` have no defined product meaning — all are rejected with a clear
 * error rather than silently clamped or floored.
 */
function normalizeNewCardsPerDay(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new RangeError(
      `newCardsPerDay must be null (unlimited) or a finite non-negative integer; got ${value}`
    );
  }
  return value;
}

/**
 * Validates a `newCardsPerDay` value against the exact same contract
 * `StudySession`'s constructor/`setNewCardsPerDay` enforce, without applying
 * it to any session. For callers (e.g. a composition root) that need to
 * reject an invalid value *before* persisting it — persisting a value this
 * would reject and only discovering that later, when applying it to a live
 * session, would leave a stored setting that can never be successfully
 * applied. Throws `RangeError` on an invalid value; returns nothing on a
 * valid one (`null`/`undefined` included).
 */
export function assertValidNewCardsPerDay(value: number | null | undefined): void {
  normalizeNewCardsPerDay(value);
}

/**
 * Study-session flow: decides which card to present next.
 *
 * This is the session layer, deliberately separate from `LearningEngine`
 * (memory scheduling). It reads scheduling *facts* through the Engine's
 * public API and applies *session policy* (ordering + learn-ahead + bury
 * siblings). It never computes schedules, never mutates cards, and never
 * touches storage directly — recording an answer stays the Engine's
 * responsibility (`engine.review`).
 *
 * The boundaries of a "study session" are the lifetime of this instance, NOT
 * calendar time: bury-siblings state is ephemeral, in-memory, per-instance
 * (never persisted). Starting a new session = constructing a new StudySession,
 * regardless of how the UI triggers that (page reload, a future "new session"
 * button, etc.).
 */
export class StudySession {
  private readonly engine: LearningEngine;
  private readonly learnAheadMs: number;
  private readonly now: () => number;
  /** Ephemeral, per-instance bury state. Never persisted to storage. */
  private readonly answeredNoteIds = new Set<NoteId>();
  private readonly answeredCardIds = new Set<CardId>();
  /** Current daily new-card limit policy. `null` = unlimited. Mutable via `setNewCardsPerDay`. */
  private newCardsPerDay: number | null;

  constructor(engine: LearningEngine, options: StudySessionOptions = {}) {
    this.engine = engine;
    this.learnAheadMs = (options.learnAheadMinutes ?? DEFAULT_LEARN_AHEAD_MINUTES) * 60_000;
    this.now = options.now ?? Date.now;
    this.newCardsPerDay = normalizeNewCardsPerDay(options.newCardsPerDay);
  }

  /**
   * Update the daily new-card limit. Takes effect on the next
   * `nextCard()`/`dueCount()`/`newCardsWithheldByLimit()` call — does not
   * reconstruct the session and does not reset ephemeral bury state. `null`
   * = unlimited, `0` = no new cards today.
   *
   * @throws {RangeError} if `limit` is not `null` and not a finite,
   * non-negative integer (negative, fractional, `NaN`, or `Infinity`). On
   * throw, the previously active policy is left unchanged — validation runs
   * before any assignment.
   */
  setNewCardsPerDay(limit: number | null): void {
    this.newCardsPerDay = normalizeNewCardsPerDay(limit);
  }

  /**
   * The next card to study, or null if the session is complete for now.
   *
   * Priority:
   *  1. a card that is actually due (`due <= now`), earliest first;
   *  2. otherwise a learning/relearning card whose step falls within the
   *     learn-ahead window — so short steps resurface within the same session
   *     instead of waiting for the next app launch. Not-yet-due review/new
   *     cards are never pulled ahead.
   */
  async nextCard(): Promise<Card | null> {
    const { dueNow, learningSoon } = await this.selectEligible(this.now());
    return dueNow[0] ?? learningSoon[0] ?? null;
  }

  /**
   * New cards withheld by the daily new-card limit right now — cards that
   * would otherwise be part of `dueNow` (and thus reachable via `nextCard()`)
   * but are being held back because `newCardsPerDay` has been reached. Zero
   * when unlimited or when the limit has not been reached. Derived from the
   * exact same selector as `nextCard()`/`dueCount()`, so a UI can distinguish
   * "nothing eligible at all" from "new cards exist but are limited" without
   * the two ever disagreeing.
   */
  async newCardsWithheldByLimit(): Promise<number> {
    const { newWithheld } = await this.selectEligible(this.now());
    return newWithheld;
  }

  /**
   * How many cards the session still has to show: exactly the set that
   * `nextCard()` will present over the session — due cards plus learning/
   * relearning cards inside the learn-ahead window, minus buried siblings.
   * Shares the same selector as `nextCard()`, so the counter can never desync
   * from what is shown (upholds the TASK_002 invariant even with bury).
   */
  async dueCount(): Promise<number> {
    const { dueNow, learningSoon } = await this.selectEligible(this.now());
    return dueNow.length + learningSoon.length;
  }

  /**
   * Record the user's answer to a card in this session.
   *
   * ORCHESTRATOR ONLY: the single write path stays `engine.review()` — it alone
   * touches the Review Log, scheduling and CardState. This method just delegates
   * to it and then updates this session's ephemeral bury state, so siblings of
   * the answered card are not shown again for the rest of this session. Using
   * one entry point makes the review + bury update impossible to desync.
   */
  async answer(cardId: CardId, rating: Rating): Promise<ReviewResult> {
    const result = await this.engine.review(cardId, rating);
    this.answeredCardIds.add(result.card.id);
    this.answeredNoteIds.add(result.card.noteId);
    return result;
  }

  /**
   * Single source of truth for session selection. `dueNow` and `learningSoon`
   * are disjoint (due <= now vs due > now), so `nextCard()` (first by
   * priority), `dueCount()` (their total), and `newCardsWithheldByLimit()`
   * all derive from this one predicate — they can never disagree.
   *
   * The daily new-card limit only ever removes `state === 'new'` cards from
   * `dueNow`, in the same due/id order used everywhere else, leaving
   * `learningSoon` and non-new due cards completely unaffected.
   */
  private async selectEligible(
    now: number
  ): Promise<{ dueNow: Card[]; learningSoon: Card[]; newWithheld: number }> {
    const horizon = now + this.learnAheadMs;
    // Indexed range query (due <= horizon) instead of scanning every card.
    const cards = (await this.engine.getCardsDueBy(horizon)).filter((c) => !this.isBuried(c));
    const dueNowAll = cards.filter((c) => c.due <= now).sort(byDueThenId);
    const learningSoon = cards
      .filter((c) => isLearning(c) && c.due > now)
      .sort(byDueThenId);

    if (this.newCardsPerDay === null) {
      return { dueNow: dueNowAll, learningSoon, newWithheld: 0 };
    }

    const usedToday = await this.engine.countNewCardsAnsweredSince(startOfLocalDay(now));
    let remaining = Math.max(0, this.newCardsPerDay - usedToday);
    const dueNow: Card[] = [];
    let newWithheld = 0;
    for (const card of dueNowAll) {
      if (card.state !== 'new') {
        dueNow.push(card);
        continue;
      }
      if (remaining > 0) {
        dueNow.push(card);
        remaining -= 1;
      } else {
        newWithheld += 1;
      }
    }
    return { dueNow, learningSoon, newWithheld };
  }

  /**
   * A card is buried if a sibling (same note) was answered this session, but
   * the card itself was not — so the answered card can still resurface via its
   * own learning steps, while its siblings stay hidden until a new session.
   */
  private isBuried(card: Card): boolean {
    return this.answeredNoteIds.has(card.noteId) && !this.answeredCardIds.has(card.id);
  }
}

function isLearning(card: Card): boolean {
  return card.state === 'learning' || card.state === 'relearning';
}

/** Deterministic ordering: earliest due first, id as a stable tie-break. */
function byDueThenId(a: Card, b: Card): number {
  if (a.due !== b.due) return a.due - b.due;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
