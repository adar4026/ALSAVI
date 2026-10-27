/**
 * When to remind — pure decisions, separate from D1 and the network so each
 * rule is tested on its own (test/policy.test.ts).
 *
 * Daily reminder (the main one): at the learner's local time, once per local
 * day, only if something is waiting. With the backlog option on and the
 * backlog over the threshold, the daily reminder itself uses the backlog
 * wording — one notification, not two.
 *
 * Backlog reminder (opt-in, the extra one): at most once per local day, and
 * only when it would not repeat the daily one:
 *  - the backlog is at or over the threshold;
 *  - it is daytime (10:00–20:00 local) — never a night-time nudge;
 *  - no review notification in the last 8 hours;
 *  - the daily reminder is not due within the next 3 hours;
 *  - today's daily reminder did not already speak about the backlog.
 */

import { countDue, minuteOfDay, type ReminderSettings, type ReviewSnapshot } from '@alsavi/reminders';

/** Daily reminder later than this after its time → skipped, not sent hours late. */
export const DAILY_GRACE_MS = 2 * 3600_000;
export const BACKLOG_WINDOW = { from: 10 * 60, to: 20 * 60 } as const;
export const BACKLOG_MIN_GAP_MS = 8 * 3600_000;
export const BACKLOG_DAILY_LEAD_MS = 3 * 3600_000;

export type DailyDecision =
  | { action: 'send'; variant: 'daily' | 'backlog'; count: number }
  | { action: 'skip'; reason: 'late' | 'empty' | 'no_schedule' };

export function decideDaily(input: {
  fireAt: number;
  now: number;
  settings: ReminderSettings;
  snapshot: ReviewSnapshot | null;
}): DailyDecision {
  const { fireAt, now, settings, snapshot } = input;
  if (now - fireAt >= DAILY_GRACE_MS) return { action: 'skip', reason: 'late' };
  if (!snapshot) return { action: 'skip', reason: 'no_schedule' };
  const { queue, overdue } = countDue(snapshot, now);
  if (settings.backlog && overdue >= settings.backlogThreshold) return { action: 'send', variant: 'backlog', count: overdue };
  if (queue === 0) return { action: 'skip', reason: 'empty' };
  return { action: 'send', variant: 'daily', count: queue };
}

export type BacklogDecision =
  | { action: 'send'; count: number }
  | {
      action: 'skip';
      reason: 'off' | 'no_schedule' | 'night' | 'below_threshold' | 'recent' | 'daily_soon' | 'daily_covered';
    };

export function decideBacklog(input: {
  now: number;
  timeZone: string;
  settings: ReminderSettings;
  snapshot: ReviewSnapshot | null;
  /** Moment of the last review notification sent (or in flight) to this device. */
  lastNotifiedAt: number | null;
  nextDailyAt: number | null;
  /** Wording of today's daily reminder, if it went out. */
  todayDailyVariant: string | null;
}): BacklogDecision {
  const { now, timeZone, settings, snapshot, lastNotifiedAt, nextDailyAt, todayDailyVariant } = input;
  if (!settings.enabled || !settings.backlog) return { action: 'skip', reason: 'off' };
  if (!snapshot) return { action: 'skip', reason: 'no_schedule' };
  const minute = minuteOfDay(now, timeZone);
  if (minute < BACKLOG_WINDOW.from || minute >= BACKLOG_WINDOW.to) return { action: 'skip', reason: 'night' };
  const { overdue } = countDue(snapshot, now);
  if (overdue < settings.backlogThreshold) return { action: 'skip', reason: 'below_threshold' };
  if (todayDailyVariant === 'backlog') return { action: 'skip', reason: 'daily_covered' };
  if (lastNotifiedAt !== null && now - lastNotifiedAt < BACKLOG_MIN_GAP_MS) return { action: 'skip', reason: 'recent' };
  if (nextDailyAt !== null && nextDailyAt - now < BACKLOG_DAILY_LEAD_MS) return { action: 'skip', reason: 'daily_soon' };
  return { action: 'send', count: overdue };
}
