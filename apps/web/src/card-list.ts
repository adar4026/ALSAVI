import { normalizeTags, type Card, type CardView, type Note } from '@alsavi/engine';

/**
 * The "Карточки" list model (TASK_023): one entry per note, built from
 * `engine.listCardViews()` — the Engine stays the only data source; this
 * module only groups, searches and filters what it returns. Pure functions,
 * no React, no storage — tested directly in `card-list.test.ts`.
 *
 * Search/filter policy deliberately lives here, in the consumer, not in the
 * Engine: its public API is minimal and not a query layer (ARCHITECTURE.md
 * §3.8, TASK_014).
 */

/** One display label per note, by priority: due > learning > new > review. */
export type NoteStatus = 'due' | 'learning' | 'new' | 'review';

export interface NoteEntry {
  note: Note;
  tags: string[];
  /** All cards of the note (forward and, if created, reverse). */
  cards: Card[];
  status: NoteStatus;
  /** Earliest due among the note's cards (for "повтор через …"). */
  nextDue: number;
  archived: boolean;
}

export type StatusFilter = 'all' | 'new' | 'learning' | 'due' | 'difficult' | 'archived';

export interface ListFilter {
  query: string;
  /** A note must carry every selected tag. */
  tags: readonly string[];
  status: StatusFilter;
}

export const EMPTY_FILTER: ListFilter = { query: '', tags: [], status: 'all' };

/**
 * Text folding for search and duplicate detection: case-insensitive,
 * whitespace-collapsed, and accent-insensitive for Latin letters only
 * (`práctica` ≈ `practica`, `año` ≈ `ano`, `pingüino` ≈ `pinguino`).
 * Combining marks are stripped only after a Latin base letter, so Cyrillic
 * `й`/`ё` stay distinct letters.
 */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/([a-z])[̀-ͯ]+/gi, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tags typed as free text: split on commas/semicolons/new lines, then normalized. */
export function parseTagInput(text: string): string[] {
  return normalizeTags(text.split(/[,;\n]/));
}

function isDue(card: Card, now: number): boolean {
  return card.state !== 'new' && card.due <= now;
}

function isLearning(card: Card): boolean {
  return card.state === 'learning' || card.state === 'relearning';
}

/** Groups card views by note; newest notes first (as the list always was), ties by note id. */
export function buildNoteEntries(views: readonly CardView[], now: number): NoteEntry[] {
  const byNote = new Map<string, { note: Note; cards: Card[] }>();
  for (const view of views) {
    const group = byNote.get(view.note.id);
    if (group) group.cards.push(view.card);
    else byNote.set(view.note.id, { note: view.note, cards: [view.card] });
  }
  const entries: NoteEntry[] = [];
  for (const { note, cards } of byNote.values()) {
    const status: NoteStatus = cards.some((c) => isDue(c, now))
      ? 'due'
      : cards.some(isLearning)
        ? 'learning'
        : cards.some((c) => c.state === 'new')
          ? 'new'
          : 'review';
    entries.push({
      note,
      tags: note.tags ?? [],
      cards,
      status,
      nextDue: Math.min(...cards.map((c) => c.due)),
      archived: note.archivedAt !== undefined,
    });
  }
  const createdAt = (e: NoteEntry) => Math.max(...e.cards.map((c) => c.createdAt));
  return entries.sort((a, b) => createdAt(b) - createdAt(a) || (a.note.id < b.note.id ? -1 : 1));
}

function matchesStatus(entry: NoteEntry, status: StatusFilter, now: number): boolean {
  switch (status) {
    case 'all':
    case 'archived':
      return true;
    case 'new':
      return entry.cards.some((c) => c.state === 'new');
    case 'learning':
      return entry.cards.some(isLearning);
    case 'due':
      return entry.cards.some((c) => isDue(c, now));
    case 'difficult':
      // The scheduler's own lapse counter: times a learned card was
      // forgotten ("Не помню" on review). No new metric is invented.
      return entry.cards.some((c) => c.scheduling.lapses > 0);
  }
}

function matchesQuery(entry: NoteEntry, query: string): boolean {
  const tokens = foldText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const { front, back, example = '', memo = '' } = entry.note;
  const haystack = foldText([front, back, example, memo, ...entry.tags].join('\n'));
  return tokens.every((t) => haystack.includes(t));
}

/** Archived notes appear only under the "archived" filter; every other filter shows active notes. */
export function filterEntries(entries: readonly NoteEntry[], filter: ListFilter, now: number): NoteEntry[] {
  const wantArchived = filter.status === 'archived';
  return entries.filter(
    (e) =>
      e.archived === wantArchived &&
      filter.tags.every((t) => e.tags.includes(t)) &&
      matchesStatus(e, filter.status, now) &&
      matchesQuery(e, filter.query)
  );
}

/** Tags in use with their note counts — most used first, then alphabetical. */
export function collectTags(entries: readonly NoteEntry[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of entries) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
}

/**
 * A likely duplicate: an existing note (active or archived) whose word and
 * translation both match after folding. A soft hint only — the caller lets
 * the user save anyway.
 */
export function findDuplicate(
  entries: readonly NoteEntry[],
  front: string,
  back: string,
  excludeNoteId?: string
): NoteEntry | undefined {
  const f = foldText(front);
  const b = foldText(back);
  if (!f || !b) return undefined;
  return entries.find(
    (e) => e.note.id !== excludeNoteId && foldText(e.note.front) === f && foldText(e.note.back) === b
  );
}
