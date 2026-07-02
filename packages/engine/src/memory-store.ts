import type { EngineStore } from './store.js';
import type { Card, CardId, Review } from './types.js';

/** Reference EngineStore implementation. Used in tests and as adapter spec. */
export class MemoryStore implements EngineStore {
  private cards = new Map<CardId, Card>();
  private reviews: Review[] = [];

  async getCard(id: CardId): Promise<Card | undefined> {
    return this.cards.get(id);
  }

  async putCard(card: Card): Promise<void> {
    this.cards.set(card.id, structuredClone(card));
  }

  async deleteCard(id: CardId): Promise<void> {
    this.cards.delete(id);
  }

  async listCards(): Promise<Card[]> {
    return [...this.cards.values()];
  }

  async listDueCards(now: number, limit = Infinity): Promise<Card[]> {
    return [...this.cards.values()]
      .filter((c) => c.due <= now)
      .sort((a, b) => a.due - b.due)
      .slice(0, limit === Infinity ? undefined : limit);
  }

  async appendReview(review: Review): Promise<void> {
    this.reviews.push(structuredClone(review));
  }

  async listReviews(cardId?: CardId): Promise<Review[]> {
    const all = cardId ? this.reviews.filter((r) => r.cardId === cardId) : this.reviews;
    return [...all].sort((a, b) => a.reviewedAt - b.reviewedAt);
  }
}
