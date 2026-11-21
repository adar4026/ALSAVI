import type { LearningStats } from '@alsavi/engine';
import { countLabel, DAY_FORMS } from './stats-view';

/**
 * Backup reminder (TASK_048): when the last backup copy was made and whether
 * the home screen should suggest a new one. Pure — no storage, no clock.
 *
 * Everything lives only on this device (IndexedDB), and a browser may clear
 * site data, so the app nudges the learner to export a copy now and then.
 * The app cannot tell whether the file really reached "Files" (iOS share
 * sheet), so "a copy was made" means "the export ran successfully".
 */

/** Days since the last copy before the home screen suggests a new one. */
export const REMIND_AFTER_DAYS = 7;
/** «Позже» hides the suggestion for this many days. */
export const SNOOZE_DAYS = 3;
/** A collection with fewer words gets no suggestion before the first copy. */
export const MIN_WORDS = 10;

const DAY_MS = 86_400_000;

/** The last successful export (or the copy a restore came from). */
export interface BackupMark {
  /** epoch ms */
  at: number;
  /** {@link collectionFingerprint} of the collection at that moment. */
  fingerprint: string;
}

export interface BackupReminderState {
  mark: BackupMark | null;
  /** epoch ms; the suggestion stays hidden until then. */
  snoozedUntil: number | null;
}

/** Where the reminder state is kept (`DexieStore`, the `settings` table). */
export interface BackupMarkStore {
  getBackupReminder(): Promise<BackupReminderState>;
  setBackupMark(mark: BackupMark): Promise<void>;
  setBackupSnooze(until: number | null): Promise<void>;
}

type FingerprintStats = Pick<LearningStats, 'answers' | 'cards'>;

/**
 * A cheap "has anything changed?" key: every answer adds to the log, adding a
 * word adds cards, archiving moves cards between active and archived. Edits
 * of a word's text are not seen — a known simplification (TASK_048).
 */
export function collectionFingerprint(stats: FingerprintStats): string {
  return `${stats.answers.total}:${stats.cards.active}:${stats.cards.archived}`;
}

/** Calendar days between two moments in local time (`to` later → positive). */
export function calendarDaysBetween(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  // Rounding absorbs the 23/25-hour days around a DST change.
  return Math.round((startB - startA) / DAY_MS);
}

/** «сегодня» / «вчера» / «3 дня назад» (a mark in the future reads «сегодня»). */
export function backupAgeText(at: number, now: number): string {
  const days = calendarDaysBetween(at, now);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${countLabel(days, DAY_FORMS)} назад`;
}

/** The line under «Экспорт резервной копии» in «Профиль». */
export function lastBackupLine(mark: BackupMark | null, now: number): string {
  return mark ? `Последняя копия: ${backupAgeText(mark.at, now)}` : 'Копий ещё не было';
}

export type BackupSuggestion =
  | { show: false }
  | {
      show: true;
      /** The banner text on the home screen. */
      text: string;
    };

type SuggestionStats = FingerprintStats & Pick<LearningStats, 'notes'>;

/**
 * Should the home screen suggest a copy?
 * - never while snoozed («Позже»);
 * - no copy yet: once the collection has {@link MIN_WORDS} words;
 * - otherwise: {@link REMIND_AFTER_DAYS} calendar days after the last copy,
 *   and only if the collection changed since then (an unchanged collection
 *   is fully in that copy).
 */
export function backupSuggestion(state: BackupReminderState, stats: SuggestionStats, now: number): BackupSuggestion {
  if (state.snoozedUntil !== null && now < state.snoozedUntil) return { show: false };
  const { mark } = state;
  if (!mark) {
    if (stats.notes.active < MIN_WORDS) return { show: false };
    return { show: true, text: 'Резервной копии ещё нет — слова хранятся только на этом устройстве.' };
  }
  const days = calendarDaysBetween(mark.at, now);
  if (days < REMIND_AFTER_DAYS) return { show: false };
  if (collectionFingerprint(stats) === mark.fingerprint) return { show: false };
  return {
    show: true,
    text: `Последняя копия — ${countLabel(days, DAY_FORMS)} назад, с тех пор есть изменения.`,
  };
}

/** When «Позже» ends. */
export function snoozeUntil(now: number): number {
  return now + SNOOZE_DAYS * DAY_MS;
}

/** A mark for a restore: the copy's own date (never in the future), today's fingerprint. */
export function markFromRestore(exportedAt: number, stats: FingerprintStats, now: number): BackupMark {
  const at = Number.isFinite(exportedAt) ? Math.min(exportedAt, now) : now;
  return { at, fingerprint: collectionFingerprint(stats) };
}
