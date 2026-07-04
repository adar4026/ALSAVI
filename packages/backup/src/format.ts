import type { CollectionData } from '@alsavi/engine';

/** Discriminator + schema version so future ALSAVI versions can read/migrate. */
export const BACKUP_FORMAT = 'alsavi-backup';
export const BACKUP_VERSION = 1;

/** Top-level shape of a backup file (JSON). */
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** epoch ms */
  exportedAt: number;
  data: CollectionData;
}
