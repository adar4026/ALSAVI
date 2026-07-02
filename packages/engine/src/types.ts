/**
 * Core domain types of the ALSAVI Learning Engine.
 *
 * The Engine layer is deterministic and self-contained: no AI, no network.
 * The review log is the source of truth — card scheduling state is a cache
 * that any scheduler implementation must be able to rebuild by replaying
 * reviews in order.
 */

export type CardId = string;
export type ReviewId = string;

/** User's answer to "how well did you recall this card?" */
export type Rating = 'again' | 'hard' | 'good' | 'easy';

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

/**
 * Scheduler-owned state cached on the card. Serializable plain data.
 * UI code must treat this as opaque; only Scheduler implementations
 * read or write it.
 */
export interface SchedulingState {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  scheduledDays: number;
  learningSteps: number;
  /** epoch ms of the last review, absent for new cards */
  lastReview?: number;
}

export interface Card {
  id: CardId;
  deckId: string;
  front: string;
  back: string;
  /** epoch ms */
  createdAt: number;
  /** epoch ms — the card is due when due <= now */
  due: number;
  state: CardState;
  scheduling: SchedulingState;
}

/**
 * Immutable record of a single review. Append-only.
 * Carries enough scheduler state to replay the full history losslessly
 * (and to export to Anki-compatible formats later).
 */
export interface Review {
  id: ReviewId;
  cardId: CardId;
  rating: Rating;
  /** epoch ms when the review happened */
  reviewedAt: number;
  stateBefore: CardState;
  stateAfter: CardState;
  /** epoch ms the card became due after this review */
  dueAfter: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
}

/** Due timestamps (epoch ms) the card would get for each possible rating. */
export type IntervalPreview = Record<Rating, number>;

export interface EngineStats {
  totalCards: number;
  newCards: number;
  dueNow: number;
  reviewsToday: number;
  /** share of reviews that were not 'again', over the whole log; null if no reviews */
  accuracy: number | null;
  /** consecutive calendar days with at least one review, counting back from today */
  streakDays: number;
}

export const DEFAULT_DECK_ID = 'default';
