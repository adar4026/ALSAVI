import type { CollectionData, Review } from '@alsavi/engine';

/** Discriminator + schema version so future ALSAVI versions can read/migrate. */
export const BACKUP_FORMAT = 'alsavi-backup';

/** Plain snapshot: every review in `data.reviews` references a card in the file. */
export const BACKUP_VERSION_BASE = 1;
/**
 * Adds `data.retiredReviews` (TASK_027): the history of cards deleted before
 * TASK_023 replaced deletion with archive. Written only when the collection
 * has such history, so ordinary backups stay exactly version 1.
 */
export const BACKUP_VERSION_RETIRED = 2;
/** Newest format version this build reads. */
export const BACKUP_VERSION = BACKUP_VERSION_RETIRED;

/**
 * Backup payload. `reviews` reference cards in the file; `retiredReviews`
 * (version 2 only) are reviews of cards that no longer exist — kept because
 * the Review Log is append-only (INV-4). They never schedule anything.
 */
export interface BackupData extends CollectionData {
  retiredReviews?: Review[];
}

/** Top-level shape of a backup file (JSON). */
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** epoch ms */
  exportedAt: number;
  data: BackupData;
}

/** How much history of deleted cards a backup carries — for user-facing notices. */
export interface RetiredHistory {
  /** Distinct deleted cards the history belongs to. */
  cards: number;
  /** Review records of those cards. */
  reviews: number;
}

/** `undefined` when there is no such history (no notice should be shown). */
export function summarizeRetired(retired: readonly Review[]): RetiredHistory | undefined {
  if (retired.length === 0) return undefined;
  return { cards: new Set(retired.map((r) => r.cardId)).size, reviews: retired.length };
}
