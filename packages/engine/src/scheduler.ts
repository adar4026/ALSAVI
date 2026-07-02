import type { Card, CardState, IntervalPreview, Rating, SchedulingState } from './types.js';

/** Scheduling fields produced by a scheduler; the Engine merges them into the card. */
export interface ScheduleUpdate {
  due: number;
  state: CardState;
  scheduling: SchedulingState;
}

/**
 * The SRS algorithm boundary. The Engine talks to the algorithm only
 * through this interface, so the algorithm (FSRS today) can be replaced
 * without touching storage, the Engine API, or the UI. Implementations
 * must be deterministic: identical inputs produce identical schedules.
 */
export interface Scheduler {
  /** Scheduling state for a brand-new card, due immediately. */
  initialSchedule(now: number): ScheduleUpdate;
  /** Apply a rating to a card at time `now`. */
  applyRating(card: Card, rating: Rating, now: number): ScheduleUpdate;
  /** Due timestamps for each possible rating, for showing intervals on answer buttons. */
  preview(card: Card, now: number): IntervalPreview;
}
