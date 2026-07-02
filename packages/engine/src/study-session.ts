import type { LearningEngine } from './engine.js';
import type { Card } from './types.js';

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
 * public API and applies *session policy* (ordering + learn-ahead). It never
 * computes schedules, never mutates cards, and never touches storage directly
 * — recording an answer stays the Engine's responsibility (`engine.review`).
 */
export class StudySession {
  private readonly engine: LearningEngine;
  private readonly learnAheadMs: number;
  private readonly now: () => number;

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
    const now = this.now();
    const cards = await this.engine.listCards();

    const dueNow = cards.filter((c) => c.due <= now).sort(byDueThenId);
    if (dueNow.length > 0) return dueNow[0]!;

    const horizon = now + this.learnAheadMs;
    const learningSoon = cards
      .filter((c) => isLearning(c) && c.due > now && c.due <= horizon)
      .sort(byDueThenId);
    return learningSoon[0] ?? null;
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
