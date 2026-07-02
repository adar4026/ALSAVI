import type { Card, CardId, EngineStore, Note, NoteId, Review } from '@alsavi/engine';
import Dexie, { type EntityTable } from 'dexie';

/** Shape of a v1 card, before content moved to notes. Used only by migration. */
interface CardV1 {
  id: string;
  deckId: string;
  front: string;
  back: string;
  createdAt: number;
  due: number;
  state: string;
  scheduling: unknown;
}

class AlsaviDB extends Dexie {
  notes!: EntityTable<Note, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  reviews!: EntityTable<Review, 'id'>;

  constructor() {
    super('alsavi');

    // v1: flat cards carried their own front/back content.
    this.version(1).stores({
      cards: 'id, due, deckId',
      reviews: 'id, cardId, reviewedAt',
    });

    // v2: content moves to `notes`; each card references a note + template.
    // Non-breaking migration: every existing card gets a synthetic 1:1 note
    // (forward), preserving content, scheduling and the review log.
    this.version(2)
      .stores({
        notes: 'id',
        cards: 'id, due, deckId, noteId',
        reviews: 'id, cardId, reviewedAt',
      })
      .upgrade(async (tx) => {
        const cards = await tx.table('cards').toArray();
        for (const raw of cards as CardV1[]) {
          const noteId = crypto.randomUUID();
          await tx.table('notes').add({ id: noteId, front: raw.front, back: raw.back });
          const { front: _front, back: _back, ...rest } = raw;
          await tx.table('cards').put({ ...rest, noteId, template: 'forward' });
        }
      });
  }
}

/** IndexedDB adapter for the Engine's storage port. */
export class DexieStore implements EngineStore {
  private db = new AlsaviDB();

  getNote(id: NoteId): Promise<Note | undefined> {
    return this.db.notes.get(id);
  }

  async getNotesByIds(ids: NoteId[]): Promise<Note[]> {
    const found = await this.db.notes.bulkGet(ids);
    return found.filter((n): n is Note => n !== undefined);
  }

  async putNote(note: Note): Promise<void> {
    await this.db.notes.put(note);
  }

  async deleteNote(id: NoteId): Promise<void> {
    await this.db.notes.delete(id);
  }

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
