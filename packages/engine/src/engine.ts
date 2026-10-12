import { FsrsScheduler } from './fsrs-scheduler.js';
import { generateId } from './ids.js';
import { renderCard } from './render.js';
import { replayCardState } from './replay.js';
import {
  computeLearningStats,
  computeStreaks,
  countReviewsToday,
  isSuccessfulRating,
  startOfLocalDay,
  type LearningStats,
} from './stats.js';
import { normalizeTags } from './tags.js';
import type { Scheduler } from './scheduler.js';
import type { EngineStore } from './store.js';
import {
  DEFAULT_DECK_ID,
  type Card,
  type CardId,
  type CardTemplate,
  type CardView,
  type EngineStats,
  type IntervalPreview,
  type Note,
  type NoteId,
  type Rating,
  type Review,
} from './types.js';

/**
 * Editable content of a note. `front`/`back` are required; the optional
 * fields (TASK_023) are trimmed (an empty string removes the field) and tags
 * are normalized with `normalizeTags`.
 */
export interface NoteContent {
  front: string;
  back: string;
  example?: string;
  memo?: string;
  tags?: readonly string[];
}

export interface AddNoteInput extends NoteContent {
  deckId?: string;
  /** Which cards to generate. Defaults to a single forward card. */
  directions?: CardTemplate[];
}

export interface AddCardInput {
  front: string;
  back: string;
  deckId?: string;
}

export interface NoteResult {
  note: Note;
  cards: Card[];
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
    this.newId = options.newId ?? generateId;
  }

  /**
   * Create a note and its card(s). A note owns the content; each requested
   * direction produces one card with its own independent scheduling.
   */
  async addNote(input: AddNoteInput): Promise<NoteResult> {
    const directions = dedupe(input.directions ?? DEFAULT_DIRECTIONS);
    if (directions.length === 0) {
      throw new Error('Note must produce at least one card');
    }
    const content = applyContent({ id: '', front: '', back: '', tags: [] }, input);
    const now = this.now();
    const note: Note = { ...content, id: this.newId() };
    await this.store.putNote(note);
    const cards: Card[] = [];
    for (const template of directions) {
      const card: Card = {
        id: this.newId(),
        noteId: note.id,
        template,
        deckId: input.deckId ?? DEFAULT_DECK_ID,
        createdAt: now,
        ...this.scheduler.initialSchedule(now),
      };
      await this.store.putCard(card);
      cards.push(card);
    }
    return { note, cards };
  }

  /** Convenience: a single forward card from inline content (one 1:1 note). */
  async addCard(input: AddCardInput): Promise<Card> {
    const { cards } = await this.addNote({
      front: input.front,
      back: input.back,
      ...(input.deckId !== undefined ? { deckId: input.deckId } : {}),
      directions: ['forward'],
    });
    return cards[0]!;
  }

  /**
   * Edit a note's content — the primary content-editing API. Content is the
   * note's single source of truth, so this updates every sibling card at once;
   * scheduling is never touched (only the note row is written — same id, no
   * card or Review Log write). Optional fields left `undefined` keep their
   * current value; archive status is not content and is never changed here.
   */
  async updateNoteContent(noteId: NoteId, content: NoteContent): Promise<Note> {
    const note = await this.store.getNote(noteId);
    if (!note) throw new Error(`Note not found: ${noteId}`);
    const updated = applyContent(withNoteDefaults(note), content);
    await this.store.putNote(updated);
    return updated;
  }

  /**
   * Archive a note (TASK_023) — the safe way to take a word out of the active
   * collection. Nothing is deleted: the note, its cards (with scheduling) and
   * the Review Log stay intact, so history, backups (which require every
   * review to reference an existing card) and `rebuildCardState` keep working.
   * Archived notes' cards are left out of `getDueCards`/`getCardsDueBy` (hence
   * out of every StudySession queue) and out of the active counts in
   * `getStats`. Idempotent; reversible with {@link unarchiveNote}.
   */
  async archiveNote(noteId: NoteId): Promise<Note> {
    const note = withNoteDefaults(await this.mustGetNote(noteId));
    if (note.archivedAt !== undefined) return note;
    const archived: Note = { ...note, archivedAt: this.now() };
    await this.store.putNote(archived);
    return archived;
  }

  /** Return an archived note to the active collection, scheduling unchanged. Idempotent. */
  async unarchiveNote(noteId: NoteId): Promise<Note> {
    const note = withNoteDefaults(await this.mustGetNote(noteId));
    if (note.archivedAt === undefined) return note;
    const { archivedAt: _archivedAt, ...active } = note;
    await this.store.putNote(active);
    return active;
  }

  /**
   * @deprecated Compatibility bridge only — use {@link updateNoteContent}.
   * Restricted to a forward card that has no siblings (a 1:1 note); throws
   * otherwise. Not used by any UI path; kept for legacy call sites/tests.
   */
  async updateCardContent(id: CardId, content: { front: string; back: string }): Promise<Note> {
    const card = await this.mustGetCard(id);
    if (card.template !== 'forward') {
      throw new Error('updateCardContent supports only forward cards; use updateNoteContent');
    }
    const siblings = (await this.store.listCards()).filter((c) => c.noteId === card.noteId);
    if (siblings.length > 1) {
      throw new Error('updateCardContent supports only single-card notes; use updateNoteContent');
    }
    return this.updateNoteContent(card.noteId, content);
  }

  /** Deletes a card; if it was the last card of its note, removes the note too. */
  async deleteCard(id: CardId): Promise<void> {
    const card = await this.store.getCard(id);
    await this.store.deleteCard(id);
    if (card) {
      const remaining = (await this.store.listCards()).filter((c) => c.noteId === card.noteId);
      if (remaining.length === 0) await this.store.deleteNote(card.noteId);
    }
  }

  /** Deletes a note and all its cards. The review log is kept. */
  async deleteNote(noteId: NoteId): Promise<void> {
    const cards = (await this.store.listCards()).filter((c) => c.noteId === noteId);
    for (const c of cards) await this.store.deleteCard(c.id);
    await this.store.deleteNote(noteId);
  }

  async getCard(id: CardId): Promise<Card | undefined> {
    return this.store.getCard(id);
  }

  async getNote(id: NoteId): Promise<Note | undefined> {
    const note = await this.store.getNote(id);
    return note && withNoteDefaults(note);
  }

  async listCards(): Promise<Card[]> {
    return this.store.listCards();
  }

  /** A card with its content rendered from its note. */
  async getCardView(id: CardId): Promise<CardView | undefined> {
    const card = await this.store.getCard(id);
    if (!card) return undefined;
    const note = await this.store.getNote(card.noteId);
    if (!note) return undefined;
    return { card, ...renderCard(card, note), note: withNoteDefaults(note) };
  }

  /**
   * All cards with their content rendered from their notes. Notes are loaded in
   * one batch and deduplicated, so sibling cards of the same note never trigger
   * a repeated read (no N+1).
   *
   * Order is inherited from `store.listCards()` — the deterministic id-order
   * contract (TASK_014); this method adds no sorting of its own.
   */
  async listCardViews(): Promise<CardView[]> {
    const cards = await this.store.listCards();
    const noteIds = [...new Set(cards.map((c) => c.noteId))];
    const notes = await this.store.getNotesByIds(noteIds);
    const byId = new Map(notes.map((n) => [n.id, withNoteDefaults(n)]));
    const views: CardView[] = [];
    for (const card of cards) {
      const note = byId.get(card.noteId);
      if (note) views.push({ card, ...renderCard(card, note), note });
    }
    return views;
  }

  /** Due cards of active (non-archived) notes, by `due` ascending. */
  async getDueCards(limit?: number): Promise<Card[]> {
    const due = await this.withoutArchived(await this.store.listDueCards(this.now()));
    return limit === undefined ? due : due.slice(0, limit);
  }

  /**
   * Cards with `due <= threshold`, ordered by `due` ascending. A thin,
   * indexed scheduling-fact query (backed by `EngineStore.listDueCards`) that
   * StudySession uses for its learn-ahead horizon — avoiding a full `listCards`
   * scan. Session policy (windowing, ordering, partitioning) stays in the caller.
   */
  async getCardsDueBy(threshold: number): Promise<Card[]> {
    return this.withoutArchived(await this.store.listDueCards(threshold));
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

  /**
   * Reconstruct a card's scheduling state from its review log alone, ignoring
   * the stored scheduling cache. Proves (and can repair) the invariant that the
   * Review Log is the source of truth. A pure read/compute operation: it does
   * not mutate the log or persist the result. Returns `undefined` if the card
   * does not exist. See {@link replayCardState}.
   */
  async rebuildCardState(cardId: CardId): Promise<Card | undefined> {
    const card = await this.store.getCard(cardId);
    if (!card) return undefined;
    const reviews = await this.store.listReviews(cardId);
    return replayCardState(card, reviews, this.scheduler);
  }

  /** Due dates the card would get for each answer — for interval labels on buttons. */
  async previewIntervals(cardId: CardId): Promise<IntervalPreview> {
    const card = await this.mustGetCard(cardId);
    return this.scheduler.preview(card, this.now());
  }

  async getStats(): Promise<EngineStats> {
    const now = this.now();
    const [allCards, notes, reviews] = await Promise.all([
      this.store.listCards(),
      this.store.listNotes(),
      this.store.listReviews(),
    ]);
    // Card counts describe the active collection; the log-based numbers below
    // (today, accuracy, streak) keep archived notes' history — it happened.
    const archived = new Set(notes.filter((n) => n.archivedAt !== undefined).map((n) => n.id));
    const cards = allCards.filter((c) => !archived.has(c.noteId));
    // Definitions (successful answer, local day, streak) live in stats.ts and
    // are shared with getLearningStats, so the stats bar and the "Статистика"
    // screen can never disagree.
    const successful = reviews.filter((r) => isSuccessfulRating(r.rating)).length;
    return {
      totalCards: cards.length,
      newCards: cards.filter((c) => c.state === 'new').length,
      dueNow: cards.filter((c) => c.due <= now).length,
      reviewsToday: countReviewsToday(reviews, now),
      accuracy: reviews.length === 0 ? null : successful / reviews.length,
      streakDays: computeStreaks(reviews.map((r) => startOfLocalDay(r.reviewedAt)), now).current,
    };
  }

  /**
   * Learning statistics for the "Статистика" screen (TASK_026): today's
   * answers, current/longest streak, review activity over the last 7 and 30
   * days, active cards by state, and the most-forgotten words. Read-only — a
   * pure derivation from cards, notes and the Review Log (`computeLearningStats`,
   * where every definition is documented); nothing is written or cached.
   */
  async getLearningStats(): Promise<LearningStats> {
    const [cards, notes, reviews] = await Promise.all([
      this.store.listCards(),
      this.store.listNotes(),
      this.store.listReviews(),
    ]);
    return computeLearningStats({ cards, notes, reviews, now: this.now() });
  }

  /**
   * Unique cards whose first review (`stateBefore === 'new'`) was recorded at
   * or after `dayStart`. Derived from the Review Log, not persisted — backs
   * StudySession's daily new-card limit. Counts unique `cardId`, not review
   * records: under normal operation a card gets at most one `'new'`-sourced
   * review (FSRS never returns a card to `'new'`), but unique-card counting
   * also protects against double-charging the allowance if inconsistent or
   * imported history ever contains more than one for the same card.
   */
  async countNewCardsAnsweredSince(dayStart: number): Promise<number> {
    const reviews = await this.store.listReviews();
    const ids = new Set<CardId>();
    for (const r of reviews) {
      if (r.reviewedAt >= dayStart && r.stateBefore === 'new') ids.add(r.cardId);
    }
    return ids.size;
  }

  /**
   * Drops cards whose note is archived; order is preserved, so with no
   * archived notes the result is exactly the input. One batched note read.
   */
  private async withoutArchived(cards: Card[]): Promise<Card[]> {
    if (cards.length === 0) return cards;
    const notes = await this.store.getNotesByIds([...new Set(cards.map((c) => c.noteId))]);
    const archived = new Set(notes.filter((n) => n.archivedAt !== undefined).map((n) => n.id));
    return archived.size === 0 ? cards : cards.filter((c) => !archived.has(c.noteId));
  }

  private async mustGetNote(id: NoteId): Promise<Note> {
    const note = await this.store.getNote(id);
    if (!note) throw new Error(`Note not found: ${id}`);
    return note;
  }

  private async mustGetCard(id: CardId): Promise<Card> {
    const card = await this.store.getCard(id);
    if (!card) throw new Error(`Card not found: ${id}`);
    return card;
  }
}

const DEFAULT_DIRECTIONS: CardTemplate[] = ['forward'];

/** Notes stored before TASK_023 have no `tags`; reads expose them as `[]`. */
function withNoteDefaults(note: Note): Note {
  return note.tags ? note : { ...note, tags: [] };
}

/**
 * Applies validated content to a note. Required fields are trimmed and must be
 * non-empty; optional text fields are trimmed and removed when empty;
 * `undefined` leaves the current value untouched. Non-content fields (`id`,
 * `archivedAt`) pass through unchanged.
 */
function applyContent(note: Note, content: NoteContent): Note {
  const front = content.front.trim();
  const back = content.back.trim();
  if (!front || !back) {
    throw new Error('Note must have non-empty front and back');
  }
  const next: Note = { ...note, front, back };
  for (const key of ['example', 'memo'] as const) {
    const value = content[key];
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (trimmed) next[key] = trimmed;
    else delete next[key];
  }
  if (content.tags !== undefined) next.tags = normalizeTags(content.tags);
  return next;
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}
