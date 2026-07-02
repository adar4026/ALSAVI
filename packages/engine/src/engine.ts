import { FsrsScheduler } from './fsrs-scheduler.js';
import type { Scheduler } from './scheduler.js';
import type { EngineStore } from './store.js';
import {
  DEFAULT_DECK_ID,
  type Card,
  type CardId,
  type EngineStats,
  type IntervalPreview,
  type Rating,
  type Review,
} from './types.js';

export interface AddCardInput {
  front: string;
  back: string;
  deckId?: string;
}

export interface ReviewResult {
  card: Card;
  review: Review;
}

export interface EngineOptions {
  scheduler?: Scheduler;
  /** Injectable clock (epoch ms) for tests and determinism. */
  now?: () => number;
  /** Injectable id generator for tests. */
  newId?: () => string;
}

/**
 * Public interface of the ALSAVI Learning Engine.
 *
 * Everything outside this package — UI today, AI Layer later — interacts
 * with cards and scheduling exclusively through this class. It works fully
 * offline and has no knowledge of any AI layer.
 */
export class LearningEngine {
  private readonly store: EngineStore;
  private readonly scheduler: Scheduler;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(store: EngineStore, options: EngineOptions = {}) {
    this.store = store;
    this.scheduler = options.scheduler ?? new FsrsScheduler();
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  async addCard(input: AddCardInput): Promise<Card> {
    const front = input.front.trim();
    const back = input.back.trim();
    if (!front || !back) {
      throw new Error('Card must have non-empty front and back');
    }
    const now = this.now();
    const card: Card = {
      id: this.newId(),
      deckId: input.deckId ?? DEFAULT_DECK_ID,
      front,
      back,
      createdAt: now,
      ...this.scheduler.initialSchedule(now),
    };
    await this.store.putCard(card);
    return card;
  }

  /** Edits content only — scheduling state is never touched by an edit. */
  async updateCardContent(id: CardId, content: { front: string; back: string }): Promise<Card> {
    const card = await this.mustGetCard(id);
    const updated: Card = { ...card, front: content.front.trim(), back: content.back.trim() };
    if (!updated.front || !updated.back) {
      throw new Error('Card must have non-empty front and back');
    }
    await this.store.putCard(updated);
    return updated;
  }

  async deleteCard(id: CardId): Promise<void> {
    await this.store.deleteCard(id);
  }

  async getCard(id: CardId): Promise<Card | undefined> {
    return this.store.getCard(id);
  }

  async listCards(): Promise<Card[]> {
    return this.store.listCards();
  }

  async getDueCards(limit?: number): Promise<Card[]> {
    return this.store.listDueCards(this.now(), limit);
  }

  /** Records the user's answer: reschedules the card and appends to the review log. */
  async review(cardId: CardId, rating: Rating): Promise<ReviewResult> {
    const card = await this.mustGetCard(cardId);
    const now = this.now();
    const update = this.scheduler.applyRating(card, rating, now);
    const updatedCard: Card = { ...card, ...update };
    const review: Review = {
      id: this.newId(),
      cardId,
      rating,
      reviewedAt: now,
      stateBefore: card.state,
      stateAfter: update.state,
      dueAfter: update.due,
      stability: update.scheduling.stability,
      difficulty: update.scheduling.difficulty,
      scheduledDays: update.scheduling.scheduledDays,
    };
    await this.store.putCard(updatedCard);
    await this.store.appendReview(review);
    return { card: updatedCard, review };
  }

  /** Due dates the card would get for each answer — for interval labels on buttons. */
  async previewIntervals(cardId: CardId): Promise<IntervalPreview> {
    const card = await this.mustGetCard(cardId);
    return this.scheduler.preview(card, this.now());
  }

  async getStats(): Promise<EngineStats> {
    const now = this.now();
    const [cards, reviews] = await Promise.all([this.store.listCards(), this.store.listReviews()]);
    const todayStart = startOfLocalDay(now);
    const reviewsToday = reviews.filter((r) => r.reviewedAt >= todayStart).length;
    const successful = reviews.filter((r) => r.rating !== 'again').length;
    return {
      totalCards: cards.length,
      newCards: cards.filter((c) => c.state === 'new').length,
      dueNow: cards.filter((c) => c.due <= now).length,
      reviewsToday,
      accuracy: reviews.length === 0 ? null : successful / reviews.length,
      streakDays: computeStreak(reviews, now),
    };
  }

  private async mustGetCard(id: CardId): Promise<Card> {
    const card = await this.store.getCard(id);
    if (!card) throw new Error(`Card not found: ${id}`);
    return card;
  }
}

function startOfLocalDay(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Consecutive local-calendar days with >= 1 review, counting back from today. */
function computeStreak(reviews: Review[], now: number): number {
  const days = new Set(reviews.map((r) => startOfLocalDay(r.reviewedAt)));
  let streak = 0;
  let cursor = startOfLocalDay(now);
  while (days.has(cursor)) {
    streak += 1;
    cursor = startOfLocalDay(cursor - 1);
  }
  return streak;
}
