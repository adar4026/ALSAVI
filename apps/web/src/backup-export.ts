import { backupFilename, createBackup } from '@alsavi/backup';
import type { EngineStore, LearningEngine } from '@alsavi/engine';
import { collectionFingerprint, markFromRestore, type BackupMarkStore } from './backup-reminder';

/**
 * Backup export as one action (TASK_048), shared by «Профиль» and the home
 * screen suggestion: build the copy (`@alsavi/backup`, unchanged), hand the
 * file to the browser, then remember when — for the reminder.
 */

export type BackupStore = EngineStore & BackupMarkStore;

/** Hands a file to the browser (download; on iOS — the share sheet). */
export type SaveFile = (json: string, filename: string) => void;

export const saveFileInBrowser: SaveFile = (json, filename) => {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Exports a copy. Throws only if the copy itself could not be built: a failed
 * mark write is ignored — the file is already saved, at worst the reminder
 * shows up again.
 */
export async function exportBackup(
  store: BackupStore,
  engine: LearningEngine,
  save: SaveFile = saveFileInBrowser,
  now: () => number = Date.now
): Promise<{ retired: Awaited<ReturnType<typeof createBackup>>['retired'] }> {
  const { json, retired } = await createBackup(store);
  save(json, backupFilename());
  try {
    const stats = await engine.getLearningStats();
    await store.setBackupMark({ at: now(), fingerprint: collectionFingerprint(stats) });
  } catch {
    // see above
  }
  return { retired };
}

/** After a successful restore: the restored collection is exactly that copy. */
export async function recordRestore(
  store: BackupMarkStore,
  engine: LearningEngine,
  exportedAt: number,
  now: () => number = Date.now
): Promise<void> {
  try {
    const stats = await engine.getLearningStats();
    await store.setBackupMark(markFromRestore(exportedAt, stats, now()));
  } catch {
    // not critical: the reminder may appear earlier than needed
  }
}

type StorageManagerLike = Pick<StorageManager, 'persisted' | 'persist'>;

/**
 * Asks the browser to keep this site's data under storage pressure
 * (`navigator.storage.persist()`). Safari and Chrome decide silently;
 * Firefox would show a permission prompt, so `App` calls this only when
 * ALSAVI runs as an installed app (home screen / standalone), where no
 * browser asks. Resolves to whether storage is persistent; never throws.
 */
export async function requestPersistentStorage(
  storage: StorageManagerLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.storage
): Promise<boolean> {
  try {
    if (!storage?.persist) return false;
    if (storage.persisted && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
