import type { EngineStore } from '@alsavi/engine';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION_BASE,
  BACKUP_VERSION_RETIRED,
  summarizeRetired,
  type BackupFile,
  type RetiredHistory,
} from './format.js';

export interface CreatedBackup {
  /** The backup file contents (JSON). */
  json: string;
  /** History of deleted cards included in the file; `undefined` if there is none. */
  retired?: RetiredHistory;
}

/**
 * Build a self-contained backup of the whole collection: all notes, all cards
 * (with their scheduling cache), and the FULL Review Log — the source of truth
 * (ADR-002), so the snapshot can be re-verified/rebuilt via `rebuildCardState`.
 * Collected in memory (a few MB even for tens of thousands of entities — see
 * TASK_009 design).
 *
 * Reviews of cards that no longer exist (left by `deleteCard` before TASK_023)
 * are history, not garbage: they go to `data.retiredReviews` in a version 2
 * file, so `data.reviews` keeps its strict "every review has its card" rule
 * and a mismatch there still means a damaged file (TASK_027). Without such
 * history the file is version 1, exactly as before.
 */
export async function createBackup(store: EngineStore, now: () => number = Date.now): Promise<CreatedBackup> {
  const [notes, cards, reviews] = await Promise.all([
    store.listNotes(),
    store.listCards(),
    store.listReviews(),
  ]);
  const cardIds = new Set(cards.map((c) => c.id));
  const retiredReviews = reviews.filter((r) => !cardIds.has(r.cardId));
  const retired = summarizeRetired(retiredReviews);

  const file: BackupFile = retired
    ? {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION_RETIRED,
        exportedAt: now(),
        data: { notes, cards, reviews: reviews.filter((r) => cardIds.has(r.cardId)), retiredReviews },
      }
    : { format: BACKUP_FORMAT, version: BACKUP_VERSION_BASE, exportedAt: now(), data: { notes, cards, reviews } };
  return { json: JSON.stringify(file), ...(retired ? { retired } : {}) };
}

/** {@link createBackup} returning only the file contents. */
export async function exportBackup(store: EngineStore, now: () => number = Date.now): Promise<string> {
  return (await createBackup(store, now)).json;
}

/** Suggested download filename, e.g. `alsavi-backup-2026-07-03.json`. */
export function backupFilename(date: Date = new Date()): string {
  return `alsavi-backup-${date.toISOString().slice(0, 10)}.json`;
}
