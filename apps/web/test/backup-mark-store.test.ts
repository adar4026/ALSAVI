import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { parseBackup } from '@alsavi/backup';
import { LearningEngine } from '@alsavi/engine';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportBackup, recordRestore, requestPersistentStorage } from '../src/backup-export.js';
import { backupSuggestion, collectionFingerprint } from '../src/backup-reminder.js';
import { DexieStore } from '../src/dexie-store.js';

/**
 * Backup reminder storage and the shared export (TASK_048): the marks live in
 * the `settings` table next to the daily limit, outside backups and restore.
 */

afterEach(() => {
  const fresh = new IDBFactory();
  globalThis.indexedDB = fresh;
  Dexie.dependencies.indexedDB = fresh;
});

const T0 = new Date(2026, 10, 1, 12).getTime();
const DAY = 86_400_000;

describe('DexieStore backup marks', () => {
  it('empty by default; mark and snooze round-trip and survive a reload', async () => {
    const store = new DexieStore();
    expect(await store.getBackupReminder()).toEqual({ mark: null, snoozedUntil: null });

    await store.setBackupSnooze(T0 + 3 * DAY);
    await store.setBackupMark({ at: T0, fingerprint: '5:3:0' });
    await store.setBackupSnooze(T0 + 3 * DAY);
    expect(await new DexieStore().getBackupReminder()).toEqual({
      mark: { at: T0, fingerprint: '5:3:0' },
      snoozedUntil: T0 + 3 * DAY,
    });

    await store.setBackupSnooze(null);
    expect((await store.getBackupReminder()).snoozedUntil).toBeNull();
  });

  it('a new copy ends «Позже»', async () => {
    const store = new DexieStore();
    await store.setBackupSnooze(T0 + 3 * DAY);
    await store.setBackupMark({ at: T0, fingerprint: 'x' });
    expect((await store.getBackupReminder()).snoozedUntil).toBeNull();
  });

  it('restore (replaceAll) keeps the marks and the daily limit', async () => {
    const store = new DexieStore();
    await store.setNewCardsPerDay(7);
    await store.setBackupMark({ at: T0, fingerprint: 'x' });
    await store.replaceAll({ notes: [], cards: [], reviews: [] });
    expect((await store.getBackupReminder()).mark).toEqual({ at: T0, fingerprint: 'x' });
    expect(await store.getNewCardsPerDay()).toBe(7);
  });
});

describe('exportBackup', () => {
  it('saves the same file as before and records the moment and the collection', async () => {
    const store = new DexieStore();
    const engine = new LearningEngine(store);
    await engine.addNote({ front: 'la casa', back: 'дом', directions: ['forward', 'reverse'] });
    const save = vi.fn();

    await exportBackup(store, engine, save, () => T0);

    expect(save).toHaveBeenCalledTimes(1);
    const [json, filename] = save.mock.calls[0] as [string, string];
    expect(filename).toMatch(/^alsavi-backup-.*\.json$/);
    const parsed = parseBackup(json);
    expect(parsed.ok && parsed.data.cards.length).toBe(2);

    const stats = await engine.getLearningStats();
    const state = await store.getBackupReminder();
    expect(state.mark).toEqual({ at: T0, fingerprint: collectionFingerprint(stats) });
    // An unchanged collection a month later — nothing to suggest.
    expect(backupSuggestion(state, stats, T0 + 30 * DAY)).toEqual({ show: false });
  });

  it('a failed copy records nothing', async () => {
    const store = new DexieStore();
    const engine = new LearningEngine(store);
    vi.spyOn(store, 'listNotes').mockRejectedValueOnce(new Error('disk'));
    await expect(exportBackup(store, engine, vi.fn(), () => T0)).rejects.toThrow('disk');
    expect((await store.getBackupReminder()).mark).toBeNull();
  });

  it('a failed mark write does not fail the export (the file is already saved)', async () => {
    const store = new DexieStore();
    const engine = new LearningEngine(store);
    vi.spyOn(store, 'setBackupMark').mockRejectedValueOnce(new Error('quota'));
    const save = vi.fn();
    await expect(exportBackup(store, engine, save, () => T0)).resolves.toBeDefined();
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('recordRestore', () => {
  it("marks the restored copy's date with the current collection", async () => {
    const store = new DexieStore();
    const engine = new LearningEngine(store);
    await engine.addNote({ front: 'el perro', back: 'собака' });
    await recordRestore(store, engine, T0 - 5 * DAY, () => T0);
    const stats = await engine.getLearningStats();
    expect((await store.getBackupReminder()).mark).toEqual({ at: T0 - 5 * DAY, fingerprint: collectionFingerprint(stats) });
  });
});

describe('requestPersistentStorage', () => {
  it('no Storage API → false', async () => {
    expect(await requestPersistentStorage(undefined)).toBe(false);
  });

  it('already persistent → does not ask again', async () => {
    const persist = vi.fn();
    expect(await requestPersistentStorage({ persisted: async () => true, persist })).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("asks once and returns the browser's answer; never throws", async () => {
    expect(await requestPersistentStorage({ persisted: async () => false, persist: async () => true })).toBe(true);
    expect(await requestPersistentStorage({ persisted: async () => false, persist: async () => false })).toBe(false);
    expect(
      await requestPersistentStorage({
        persisted: async () => false,
        persist: async () => {
          throw new Error('denied');
        },
      })
    ).toBe(false);
  });
});
