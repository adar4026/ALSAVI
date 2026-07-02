import type { Scheduler } from './scheduler.js';
import type { Card, Review } from './types.js';

/**
 * Rebuild a card's scheduling state purely from its review log.
 *
 * IMPLEMENTATION INVARIANT (do not weaken): only the card's *identity* fields
 * (`id`, `noteId`, `template`, `deckId`, `createdAt`) are read from `card`.
 * Its scheduling cache (`due`, `state`, `scheduling`) is NEVER used as input —
 * it is discarded and recomputed from scratch:
 *   1. seed = `scheduler.initialSchedule(createdAt)` (a fresh "new" card);
 *   2. thread every review through `scheduler.applyRating(card, rating,
 *      reviewedAt)` in chronological order.
 *
 * Because the Scheduler is deterministic, this reproduces exactly the same
 * transitions that produced the cached state — making "Review Log is the
 * source of truth; scheduling is a cache" a verifiable fact, not a claim.
 * Pure: it neither mutates the log nor persists anything.
 */
export function replayCardState(card: Card, reviews: Review[], scheduler: Scheduler): Card {
  // Seed from identity ONLY. Any scheduling field on `card` is intentionally
  // ignored here — that is the whole point of the reconstruction.
  let acc: Card = {
    id: card.id,
    noteId: card.noteId,
    template: card.template,
    deckId: card.deckId,
    createdAt: card.createdAt,
    ...scheduler.initialSchedule(card.createdAt),
  };
  const ordered = [...reviews].sort((a, b) => a.reviewedAt - b.reviewedAt);
  for (const review of ordered) {
    acc = { ...acc, ...scheduler.applyRating(acc, review.rating, review.reviewedAt) };
  }
  return acc;
}
