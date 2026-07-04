import type { EngineStore } from '@alsavi/engine';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupFile } from './format.js';

/**
 * Build a self-contained backup (JSON string) of the whole collection: all
 * notes, all cards (with their scheduling cache), and the FULL Review Log —
 * the source of truth (ADR-002), so the snapshot can be re-verified/rebuilt
 * via `rebuildCardState`. Collected in memory (a few MB even for tens of
 * thousands of entities — see TASK_009 design).
 */
export async function exportBackup(store: EngineStore, now: () => number = Date.now): Promise<string> {
  const [notes, cards, reviews] = await Promise.all([
    store.listNotes(),
    store.listCards(),
    store.listReviews(),
  ]);
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now(),
    data: { notes, cards, reviews },
  };
  return JSON.stringify(file);
}

/** Suggested download filename, e.g. `alsavi-backup-2026-07-03.json`. */
export function backupFilename(date: Date = new Date()): string {
  return `alsavi-backup-${date.toISOString().slice(0, 10)}.json`;
}
