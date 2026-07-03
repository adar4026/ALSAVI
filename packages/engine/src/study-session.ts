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
}

const DEFAULT_LEARN_AHEAD_MINUTES = 20;

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

  constructor(engine: LearningEngine, options: StudySessionOptions = {}) {
    this.engine = engine;
    this.learnAheadMs = (options.learnAheadMinutes ?? DEFAULT_LEARN_AHEAD_MINUTES) * 60_000;
    this.now = options.now ?? Date.now;
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
   * are disjoint (due <= now vs due > now), so both `nextCard()` (first by
   * priority) and `dueCount()` (their total) derive from one predicate.
   */
  private async selectEligible(now: number): Promise<{ dueNow: Card[]; learningSoon: Card[] }> {
    const horizon = now + this.learnAheadMs;
    // Indexed range query (due <= horizon) instead of scanning every card.
    const cards = (await this.engine.getCardsDueBy(horizon)).filter((c) => !this.isBuried(c));
    const dueNow = cards.filter((c) => c.due <= now).sort(byDueThenId);
    const learningSoon = cards
      .filter((c) => isLearning(c) && c.due > now)
      .sort(byDueThenId);
    return { dueNow, learningSoon };
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
