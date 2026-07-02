import type { Card, CardId, Note, NoteId, Review } from './types.js';

/**
 * Storage port of the Engine. The Engine depends only on this interface;
 * concrete adapters (in-memory for tests, IndexedDB in the web app) live
 * outside the scheduling logic. Reviews are append-only.
 */
export interface EngineStore {
  getNote(id: NoteId): Promise<Note | undefined>;
  putNote(note: Note): Promise<void>;
  deleteNote(id: NoteId): Promise<void>;
  getCard(id: CardId): Promise<Card | undefined>;
  putCard(card: Card): Promise<void>;
  deleteCard(id: CardId): Promise<void>;
  listCards(): Promise<Card[]>;
  /** Cards with due <= now, ordered by due ascending. */
  listDueCards(now: number, limit?: number): Promise<Card[]>;
  appendReview(review: Review): Promise<void>;
  /** All reviews (or reviews of one card), ordered by reviewedAt ascending. */
  listReviews(cardId?: CardId): Promise<Review[]>;
}
