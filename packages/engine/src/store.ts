import type { Card, CardId, CollectionData, Note, NoteId, Review } from './types.js';

/**
 * Storage port of the Engine. The Engine depends only on this interface;
 * concrete adapters (in-memory for tests, IndexedDB in the web app) live
 * outside the scheduling logic. Reviews are append-only.
 */
export interface EngineStore {
  getNote(id: NoteId): Promise<Note | undefined>;
  /** Batch primitive: fetch many notes by id at once. Missing ids are skipped;
   *  order and duplicates are not guaranteed — callers key by `note.id`. */
  getNotesByIds(ids: NoteId[]): Promise<Note[]>;
  /** All notes. For full-collection export (backup). */
  listNotes(): Promise<Note[]>;
  putNote(note: Note): Promise<void>;
  deleteNote(id: NoteId): Promise<void>;
  getCard(id: CardId): Promise<Card | undefined>;
  putCard(card: Card): Promise<void>;
  deleteCard(id: CardId): Promise<void>;
  /**
   * All cards, in a deterministic, stable, total order: ascending by `card.id`
   * (lexicographic, matching IndexedDB string-key order). Every `EngineStore`
   * implementation MUST return this same order for identical data — the order is
   * part of the public contract, not an adapter implementation detail (TASK_014).
   * Changing this normative order is a breaking architectural change and requires
   * a separate ADR + task. Scope is `listCards`/`listCardViews` only; it does not
   * govern `listDueCards` (which orders by `due`).
   */
  listCards(): Promise<Card[]>;
  /** Cards with due <= now, ordered by due ascending. */
  listDueCards(now: number, limit?: number): Promise<Card[]>;
  appendReview(review: Review): Promise<void>;
  /** All reviews (or reviews of one card), ordered by reviewedAt ascending. */
  listReviews(cardId?: CardId): Promise<Review[]>;

  /**
   * Atomically replace ALL stored data with `data` (backup restore). The
   * destructive whole-collection swap: previous notes/cards/reviews are
   * discarded and the given ones written. The caller MUST pass fully validated,
   * referentially consistent data — the store does not validate (TASK_009,
   * invariant 3). Implementations should make this all-or-nothing so a failure
   * leaves the previous data intact.
   */
  replaceAll(data: CollectionData): Promise<void>;
}
