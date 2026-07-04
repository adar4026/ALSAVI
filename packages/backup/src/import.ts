import type { EngineStore } from '@alsavi/engine';
import { parseBackup } from './validate.js';

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export interface RestoreReport {
  notes: number;
  cards: number;
  reviews: number;
}

/**
 * Validate a backup and, only if it is fully valid, REPLACE the store's data
 * with it. Validation runs first and completely; if it fails, `replaceAll` is
 * never reached, so the destructive phase cannot start on a bad file — current
 * data stays intact. Throws `BackupError` on invalid input.
 *
 * Note: the explicit user confirmation of the destructive replace lives in the
 * UI (between validation and this call); `parseBackup` is exported so the UI
 * can validate first, then confirm, then restore.
 */
export async function importBackup(store: EngineStore, text: string): Promise<RestoreReport> {
  const result = parseBackup(text);
  if (!result.ok) throw new BackupError(result.error);
  await store.replaceAll(result.data); // only validated data reaches the store
  return {
    notes: result.data.notes.length,
    cards: result.data.cards.length,
    reviews: result.data.reviews.length,
  };
}
