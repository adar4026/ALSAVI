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

/** Snapshot metadata surfaced to the confirmation callback — no UI strings. */
export interface RestoreMeta {
  exportedAt: number;
  notes: number;
  cards: number;
  reviews: number;
}

/**
 * Approve or reject a validated, pending restore given its metadata. Sync or
 * async — callers gate on `window.confirm` (web), a fixed policy (CLI), or a
 * future prompt (any other shell) without this module knowing which.
 */
export type ConfirmRestore = (meta: RestoreMeta) => boolean | Promise<boolean>;

export type RestoreOutcome =
  | { status: 'rejected'; error: string }
  | { status: 'cancelled' }
  | ({ status: 'restored' } & RestoreMeta);

/**
 * The one safe-restore orchestration path, shared by every consumer (web, CLI,
 * and `importBackup` below): validate fully → let the caller confirm the
 * destructive replace against the parsed metadata → replace atomically only on
 * approval. `parseBackup` runs to completion before `confirm` is ever invoked,
 * and `store.replaceAll` runs only after a positive confirmation — the
 * destructive phase cannot start on a bad file or an unconfirmed one, so
 * current data stays intact in both cases (INV-9).
 *
 * `confirm` is the sole caller-supplied policy: web passes an adapter over
 * `window.confirm`, CLI passes an auto-approving policy (no prior data to
 * protect there), and neither has to duplicate the validate→replace sequence.
 */
export async function restoreBackup(
  store: EngineStore,
  text: string,
  confirm: ConfirmRestore
): Promise<RestoreOutcome> {
  const result = parseBackup(text);
  if (!result.ok) return { status: 'rejected', error: result.error };

  const meta: RestoreMeta = {
    exportedAt: result.exportedAt,
    notes: result.data.notes.length,
    cards: result.data.cards.length,
    reviews: result.data.reviews.length,
  };
  const approved = await confirm(meta);
  if (!approved) return { status: 'cancelled' };

  await store.replaceAll(result.data); // only validated, confirmed data reaches the store
  return { status: 'restored', ...meta };
}

/**
 * Thin, auto-approving wrapper over `restoreBackup` for callers with no prior
 * data to protect (a fresh store) that want the original throw-on-invalid
 * contract. Preserved for backward compatibility (`apps/cli`, existing
 * tests); contains no orchestration logic of its own.
 */
export async function importBackup(store: EngineStore, text: string): Promise<RestoreReport> {
  const outcome = await restoreBackup(store, text, () => true);
  switch (outcome.status) {
    case 'rejected':
      throw new BackupError(outcome.error);
    case 'cancelled':
      // Unreachable: the confirm policy above always approves. Kept only so
      // the switch is exhaustive without an `as` cast.
      throw new BackupError('Restore was unexpectedly cancelled.');
    case 'restored':
      return { notes: outcome.notes, cards: outcome.cards, reviews: outcome.reviews };
  }
}
