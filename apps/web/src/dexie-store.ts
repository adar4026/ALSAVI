import type { Card, CardId, EngineStore, Review } from '@alsavi/engine';
import Dexie, { type EntityTable } from 'dexie';

class AlsaviDB extends Dexie {
  cards!: EntityTable<Card, 'id'>;
  reviews!: EntityTable<Review, 'id'>;

  constructor() {
    super('alsavi');
    this.version(1).stores({
      cards: 'id, due, deckId',
      reviews: 'id, cardId, reviewedAt',
    });
  }
}

/** IndexedDB adapter for the Engine's storage port. */
export class DexieStore implements EngineStore {
  private db = new AlsaviDB();

  getCard(id: CardId): Promise<Card | undefined> {
    return this.db.cards.get(id);
  }

  async putCard(card: Card): Promise<void> {
    await this.db.cards.put(card);
  }

  async deleteCard(id: CardId): Promise<void> {
    // The review log is intentionally kept: it is the source of truth
    // for history, stats and future algorithm re-fits.
    await this.db.cards.delete(id);
  }

  listCards(): Promise<Card[]> {
    return this.db.cards.toArray();
  }

  async listDueCards(now: number, limit?: number): Promise<Card[]> {
    const due = await this.db.cards.where('due').belowOrEqual(now).sortBy('due');
    return limit === undefined ? due : due.slice(0, limit);
  }

  async appendReview(review: Review): Promise<void> {
    await this.db.reviews.add(review);
  }

  listReviews(cardId?: CardId): Promise<Review[]> {
    if (cardId !== undefined) {
      return this.db.reviews.where('cardId').equals(cardId).sortBy('reviewedAt');
    }
    return this.db.reviews.orderBy('reviewedAt').toArray();
  }
}
