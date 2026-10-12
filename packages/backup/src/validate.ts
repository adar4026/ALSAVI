import type { Card, CardState, CardTemplate, CollectionData, Note, Rating, Review } from '@alsavi/engine';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BACKUP_VERSION_BASE,
  BACKUP_VERSION_RETIRED,
  summarizeRetired,
  type BackupData,
  type RetiredHistory,
} from './format.js';

/**
 * History of deleted cards found in a valid backup (TASK_027). `legacy` —
 * found in a version 1 file, which cannot declare such history: those reviews
 * are indistinguishable from a damaged reference, so the caller must ask the
 * user before restoring (the restore confirmation shows this).
 */
export interface RetiredHistoryReport extends RetiredHistory {
  legacy: boolean;
}

export type ValidationResult =
  | { ok: true; data: CollectionData; exportedAt: number; retired?: RetiredHistoryReport }
  | { ok: false; error: string };

const TEMPLATES: CardTemplate[] = ['forward', 'reverse'];
const STATES: CardState[] = ['new', 'learning', 'review', 'relearning'];
const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

/**
 * Parse and FULLY validate a backup file BEFORE any destructive action.
 * Two levels: structural (format/version/JSON/field types) and referential
 * (every card→note, every review→card, no duplicate ids). On any failure
 * returns `{ ok: false }` with a clear message and touches nothing.
 *
 * Reviews of deleted cards (TASK_027): a version 2 file declares them in
 * `data.retiredReviews`; each must be a valid review whose card is NOT in the
 * file (otherwise the file is damaged), and a review in `data.reviews` without
 * its card is still rejected. A version 1 file cannot declare them, so there
 * reviews without a card are accepted as legacy history and reported with
 * `retired.legacy` for the caller to confirm. Either way they are returned in
 * `data.reviews` — one append-only Review Log; they reference no card, so no
 * study queue or scheduling ever reads them.
 */
export function parseBackup(text: string): ValidationResult {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return fail('Файл не является корректным JSON.');
  }
  if (!isObject(root)) return fail('Файл не является объектом резервной копии.');

  if (root.format !== BACKUP_FORMAT) {
    return fail('Это не файл резервной копии ALSAVI.');
  }
  const version = root.version;
  if (typeof version !== 'number') return fail('Отсутствует или некорректна версия формата.');
  if (version > BACKUP_VERSION) {
    return fail(`Копия сделана более новой версией ALSAVI (версия формата ${version}). Обновите приложение.`);
  }
  if (version !== BACKUP_VERSION_BASE && version !== BACKUP_VERSION_RETIRED) {
    return fail(`Неподдерживаемая версия формата резервной копии: ${version}.`);
  }

  const data = root.data as Partial<Record<keyof BackupData, unknown>> | undefined;
  if (!isObject(data) || !Array.isArray(data.notes) || !Array.isArray(data.cards) || !Array.isArray(data.reviews)) {
    return fail('Повреждённая структура: ожидались data.notes / data.cards / data.reviews.');
  }
  if (version === BACKUP_VERSION_RETIRED ? !Array.isArray(data.retiredReviews) : data.retiredReviews !== undefined) {
    return fail('Повреждённая структура: data.retiredReviews не соответствует версии формата.');
  }

  const noteIds = new Set<string>();
  for (const [i, n] of data.notes.entries()) {
    const err = validateNote(n, i);
    if (err) return fail(err);
    if (noteIds.has((n as Note).id)) return fail(`Дублирующийся id заметки: ${(n as Note).id}.`);
    noteIds.add((n as Note).id);
  }

  const cardIds = new Set<string>();
  for (const [i, c] of data.cards.entries()) {
    const err = validateCard(c, i);
    if (err) return fail(err);
    const card = c as Card;
    if (cardIds.has(card.id)) return fail(`Дублирующийся id карточки: ${card.id}.`);
    cardIds.add(card.id);
    if (!noteIds.has(card.noteId)) {
      return fail(`Карточка ${card.id} ссылается на несуществующую заметку ${card.noteId}.`);
    }
  }

  const reviewIds = new Set<string>();
  const retired: Review[] = [];
  for (const [i, r] of data.reviews.entries()) {
    const err = validateReview(r, i);
    if (err) return fail(err);
    const review = r as Review;
    if (reviewIds.has(review.id)) return fail(`Дублирующийся id повторения: ${review.id}.`);
    reviewIds.add(review.id);
    if (cardIds.has(review.cardId)) continue;
    if (version !== BACKUP_VERSION_BASE) {
      return fail(`Повторение ${review.id} ссылается на несуществующую карточку ${review.cardId}.`);
    }
    retired.push(review); // version 1: undeclared history of a deleted card
  }

  const declared = (data.retiredReviews ?? []) as unknown[];
  for (const [i, r] of declared.entries()) {
    const err = validateReview(r, i);
    if (err) return fail(`История удалённых карточек: ${err}`);
    const review = r as Review;
    if (reviewIds.has(review.id)) return fail(`Дублирующийся id повторения: ${review.id}.`);
    reviewIds.add(review.id);
    if (cardIds.has(review.cardId)) {
      return fail(`Запись истории ${review.id} относится к существующей карточке ${review.cardId}.`);
    }
    retired.push(review);
  }

  // One Review Log again, in time order (the sort is stable: file order on ties).
  const reviews =
    declared.length === 0
      ? (data.reviews as Review[])
      : [...(data.reviews as Review[]), ...(declared as Review[])].sort((a, b) => a.reviewedAt - b.reviewedAt);
  const summary = summarizeRetired(retired);
  return {
    ok: true,
    data: { notes: data.notes as Note[], cards: data.cards as Card[], reviews },
    exportedAt: typeof root.exportedAt === 'number' ? root.exportedAt : 0,
    ...(summary ? { retired: { ...summary, legacy: version === BACKUP_VERSION_BASE } } : {}),
  };
}

function validateNote(n: unknown, i: number): string | null {
  if (!isObject(n)) return `Заметка #${i}: не объект.`;
  if (!isNonEmptyString(n.id)) return `Заметка #${i}: некорректный id.`;
  if (typeof n.front !== 'string' || typeof n.back !== 'string') return `Заметка ${n.id}: front/back должны быть строками.`;
  // Optional fields (TASK_023): absent in older backups — still valid as-is.
  for (const key of ['example', 'memo'] as const) {
    if (n[key] !== undefined && typeof n[key] !== 'string') return `Заметка ${n.id}: ${key} должно быть строкой.`;
  }
  if (n.tags !== undefined && (!Array.isArray(n.tags) || !n.tags.every((t) => typeof t === 'string'))) {
    return `Заметка ${n.id}: tags должно быть списком строк.`;
  }
  if (n.archivedAt !== undefined && !isFiniteNumber(n.archivedAt)) return `Заметка ${n.id}: некорректный archivedAt.`;
  return null;
}

function validateCard(c: unknown, i: number): string | null {
  if (!isObject(c)) return `Карточка #${i}: не объект.`;
  if (!isNonEmptyString(c.id)) return `Карточка #${i}: некорректный id.`;
  if (!isNonEmptyString(c.noteId)) return `Карточка ${c.id}: некорректный noteId.`;
  if (!TEMPLATES.includes(c.template as CardTemplate)) return `Карточка ${c.id}: недопустимый template.`;
  if (typeof c.deckId !== 'string') return `Карточка ${c.id}: некорректный deckId.`;
  if (!isFiniteNumber(c.createdAt) || !isFiniteNumber(c.due)) return `Карточка ${c.id}: createdAt/due должны быть числами.`;
  if (!STATES.includes(c.state as CardState)) return `Карточка ${c.id}: недопустимый state.`;
  const s = c.scheduling;
  if (!isObject(s)) return `Карточка ${c.id}: отсутствует scheduling.`;
  for (const key of ['stability', 'difficulty', 'reps', 'lapses', 'scheduledDays', 'learningSteps'] as const) {
    if (!isFiniteNumber(s[key])) return `Карточка ${c.id}: scheduling.${key} должно быть числом.`;
  }
  if (s.lastReview !== undefined && !isFiniteNumber(s.lastReview)) return `Карточка ${c.id}: некорректный lastReview.`;
  return null;
}

function validateReview(r: unknown, i: number): string | null {
  if (!isObject(r)) return `Повторение #${i}: не объект.`;
  if (!isNonEmptyString(r.id)) return `Повторение #${i}: некорректный id.`;
  if (!isNonEmptyString(r.cardId)) return `Повторение ${r.id}: некорректный cardId.`;
  if (!RATINGS.includes(r.rating as Rating)) return `Повторение ${r.id}: недопустимый rating.`;
  if (!isFiniteNumber(r.reviewedAt)) return `Повторение ${r.id}: некорректный reviewedAt.`;
  if (!STATES.includes(r.stateBefore as CardState) || !STATES.includes(r.stateAfter as CardState)) {
    return `Повторение ${r.id}: недопустимый stateBefore/stateAfter.`;
  }
  for (const key of ['dueAfter', 'stability', 'difficulty', 'scheduledDays'] as const) {
    if (!isFiniteNumber(r[key])) return `Повторение ${r.id}: ${key} должно быть числом.`;
  }
  return null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function fail(error: string): ValidationResult {
  return { ok: false, error };
}
