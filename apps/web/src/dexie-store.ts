import type { Card, CardId, CollectionData, EngineStore, Note, NoteId, Review } from '@alsavi/engine';
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

/** A single app-preference row: `{ key: 'newCardsPerDay', value: number | null }`. */
interface SettingRow {
  key: string;
  value: unknown;
}

/** Key for the daily new-card limit setting (TASK_020). `null` = unlimited. */
const NEW_CARDS_PER_DAY_KEY = 'newCardsPerDay';

class AlsaviDB extends Dexie {
  notes!: EntityTable<Note, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  reviews!: EntityTable<Review, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

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

    // v3: additive `settings` table for local app preferences (TASK_020,
    // e.g. daily new-card limit). Not engine memory-data — deliberately kept
    // out of the EngineStore port and out of `replaceAll`'s table set, so
    // backup restore never touches it. No migration of existing tables.
    this.version(3).stores({
      settings: 'key',
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

  listNotes(): Promise<Note[]> {
    return this.db.notes.toArray();
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
    // Contract order (TASK_014): ascending by card.id. Explicit orderBy on the
    // primary key — not relying on toArray()'s implicit key ordering.
    return this.db.cards.orderBy('id').toArray();
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

  /**
   * Atomically replace the whole collection (backup restore). Runs clear +
   * bulkAdd inside ONE Dexie rw transaction: IndexedDB commits all-or-nothing,
   * so a failure (or crash) mid-restore rolls back and leaves the previous data
   * intact. No `deleteDatabase` — the deadlock from TASK_007 cannot occur here;
   * the live connection reflects the new data after commit. Callers pass only
   * validated data (the store does not validate).
   */
  async replaceAll(data: CollectionData): Promise<void> {
    await this.db.transaction('rw', this.db.notes, this.db.cards, this.db.reviews, async () => {
      await Promise.all([this.db.notes.clear(), this.db.cards.clear(), this.db.reviews.clear()]);
      await this.db.notes.bulkAdd(data.notes);
      await this.db.cards.bulkAdd(data.cards);
      await this.db.reviews.bulkAdd(data.reviews);
    });
  }

  /**
   * Local app preference (TASK_020), not engine memory-data — deliberately
   * outside the `EngineStore` interface above (so `LearningEngine`/
   * `StudySession` have no structural access to it) but sharing this same
   * `AlsaviDB` instance and connection, so there is exactly one storage
   * lifecycle. `undefined` (no row persisted yet) and an explicitly stored
   * `null` both resolve to unlimited — the caller cannot and need not tell
   * them apart.
   */
  async getNewCardsPerDay(): Promise<number | null> {
    const row = await this.db.settings.get(NEW_CARDS_PER_DAY_KEY);
    return (row?.value as number | null | undefined) ?? null;
  }

  /** Persists the daily new-card limit. Never touched by `replaceAll`/restore. */
  async setNewCardsPerDay(value: number | null): Promise<void> {
    await this.db.settings.put({ key: NEW_CARDS_PER_DAY_KEY, value });
  }
}
