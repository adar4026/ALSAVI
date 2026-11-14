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

// The folded search text of an entry, computed once per entry object (an
// entry is rebuilt only when the list reloads) — folding is the costly part
// of a search over thousands of notes (TASK_041 check).
const haystacks = new WeakMap<NoteEntry, string>();
function haystackOf(entry: NoteEntry): string {
  let text = haystacks.get(entry);
  if (text === undefined) {
    const { front, back, example = '', memo = '' } = entry.note;
    text = foldText([front, back, example, memo, ...entry.tags].join('\n'));
    haystacks.set(entry, text);
  }
  return text;
}

const queryTokens = (query: string): string[] => foldText(query).split(' ').filter(Boolean);

function matchesTokens(entry: NoteEntry, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = haystackOf(entry);
  return tokens.every((t) => haystack.includes(t));
}

/** Archived notes appear only under the "archived" filter; every other filter shows active notes. */
export function filterEntries(entries: readonly NoteEntry[], filter: ListFilter, now: number): NoteEntry[] {
  const wantArchived = filter.status === 'archived';
  const tokens = queryTokens(filter.query);
  return entries.filter(
    (e) =>
      e.archived === wantArchived &&
      filter.tags.every((t) => e.tags.includes(t)) &&
      matchesStatus(e, filter.status, now) &&
      matchesTokens(e, tokens)
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

/**
 * Rows rendered at first and added by "Показать ещё" (TASK_041, C-10): with a
 * few thousand cards, rendering every row made search and filters lag.
 */
export const LIST_PAGE = 100;

/**
 * List orders (TASK_041, Q10): four, chosen per visit — not saved. "Сначала
 * новые" is the order the list always had.
 */
export type SortOrder = 'newest' | 'alpha' | 'due' | 'lapses';

export const SORT_ORDERS: ReadonlyArray<{ value: SortOrder; label: string }> = [
  { value: 'newest', label: 'Сначала новые' },
  { value: 'alpha', label: 'По алфавиту' },
  { value: 'due', label: 'Ближайшие повторения' },
  { value: 'lapses', label: 'Чаще забываю' },
];

/** When the note was added: its first card. */
export function addedAt(entry: NoteEntry): number {
  return Math.min(...entry.cards.map((c) => c.createdAt));
}

/** How many times its cards were forgotten after being learned (FSRS lapses). */
export function lapsesOf(entry: NoteEntry): number {
  return entry.cards.reduce((sum, c) => sum + c.scheduling.lapses, 0);
}

const newestKey = (e: NoteEntry) => Math.max(...e.cards.map((c) => c.createdAt));
const spanish = new Intl.Collator('es', { sensitivity: 'base' });

/**
 * The entries in one of the four orders; a new array, stable (ties keep the
 * order they came in). "Ближайшие повторения" puts notes not yet studied last:
 * a new card is "due" from its creation, but it is not a repetition.
 */
export function sortEntries(entries: readonly NoteEntry[], order: SortOrder): NoteEntry[] {
  // Keys are computed once per entry, not per comparison.
  if (order === 'alpha') {
    return entries
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => spanish.compare(a.entry.note.front, b.entry.note.front) || a.index - b.index)
      .map(({ entry }) => entry);
  }
  const key: (e: NoteEntry) => number = {
    newest: (e: NoteEntry) => -newestKey(e),
    due: (e: NoteEntry) => (e.status === 'new' ? Number.POSITIVE_INFINITY : e.nextDue),
    lapses: (e: NoteEntry) => -lapsesOf(e),
  }[order];
  return entries
    .map((entry, index) => ({ entry, index, key: key(entry) }))
    .sort((a, b) => (a.key === b.key ? a.index - b.index : a.key < b.key ? -1 : 1))
    .map(({ entry }) => entry);
}

const STATUS_FILTER_VALUES: readonly StatusFilter[] = ['all', 'new', 'learning', 'due', 'difficult', 'archived'];

/**
 * The number on each state chip (TASK_041): what that filter would show for
 * the current search. Tags are left out — the active and the archived list
 * have different tags, and the tag filter is reset across that switch.
 */
export function statusCounts(entries: readonly NoteEntry[], query: string, now: number): Record<StatusFilter, number> {
  const counts = Object.fromEntries(STATUS_FILTER_VALUES.map((s) => [s, 0])) as Record<StatusFilter, number>;
  const tokens = queryTokens(query);
  // One pass; the same rules as `filterEntries` (tested against it).
  for (const e of entries) {
    if (!matchesTokens(e, tokens)) continue;
    if (e.archived) {
      counts.archived++;
      continue;
    }
    for (const status of STATUS_FILTER_VALUES) if (status !== 'archived' && matchesStatus(e, status, now)) counts[status]++;
  }
  return counts;
}
