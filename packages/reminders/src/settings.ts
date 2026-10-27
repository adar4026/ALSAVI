import { isValidTime } from './zoned.js';

/**
 * The learner's review-reminder settings. Kept on the device (the screen
 * shows them instantly, offline too) and mirrored to the push server, which
 * acts on them. Defaults are deliberately quiet: off until the learner turns
 * reminders on, then one reminder a day; the large-backlog reminder is
 * opt-in.
 */
export interface ReminderSettings {
  /** Master switch: no review notifications at all when false. */
  enabled: boolean;
  /** Local wall-clock time of the daily reminder, `HH:MM`. */
  time: string;
  /** Extra reminder when many reviews pile up (never more than one a day). */
  backlog: boolean;
  /** Overdue cards at which the backlog reminder becomes relevant. */
  backlogThreshold: number;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  time: '09:00',
  backlog: false,
  backlogThreshold: 30,
};

export const BACKLOG_THRESHOLD_MIN = 5;
export const BACKLOG_THRESHOLD_MAX = 999;

export function isValidThreshold(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= BACKLOG_THRESHOLD_MIN && (n as number) <= BACKLOG_THRESHOLD_MAX;
}

/** Lenient: anything missing or malformed falls back to its default (stored data may be old). */
export function normalizeSettings(value: unknown): ReminderSettings {
  const s = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_REMINDER_SETTINGS.enabled,
    time: isValidTime(s.time) ? s.time : DEFAULT_REMINDER_SETTINGS.time,
    backlog: typeof s.backlog === 'boolean' ? s.backlog : DEFAULT_REMINDER_SETTINGS.backlog,
    backlogThreshold: isValidThreshold(s.backlogThreshold) ? s.backlogThreshold : DEFAULT_REMINDER_SETTINGS.backlogThreshold,
  };
}

/** Strict: for input from the network — `null` unless every field is valid. */
export function parseSettings(value: unknown): ReminderSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  if (typeof s.enabled !== 'boolean' || !isValidTime(s.time) || typeof s.backlog !== 'boolean') return null;
  if (!isValidThreshold(s.backlogThreshold)) return null;
  return { enabled: s.enabled, time: s.time, backlog: s.backlog, backlogThreshold: s.backlogThreshold };
}
