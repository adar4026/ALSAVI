import type { ActivityWindow, LearningStats } from '@alsavi/engine';

/**
 * Presentation helpers for the "Статистика" screen (TASK_026). Every number
 * comes from `engine.getLearningStats()`; nothing here counts or classifies
 * reviews/cards — only wording, plural forms, percentages of already computed
 * totals and bar heights. Pure functions, tested in `stats-view.test.ts`.
 */

/** Russian plural form: `[one, few, many]`, e.g. `['день', 'дня', 'дней']`. */
export function pluralRu(n: number, forms: readonly [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export const DAY_FORMS = ['день', 'дня', 'дней'] as const;
export const REVIEW_FORMS = ['повторение', 'повторения', 'повторений'] as const;
export const TIME_FORMS = ['раз', 'раза', 'раз'] as const;

/** "5 дней", "1 повторение", … */
export function countLabel(n: number, forms: readonly [string, string, string]): string {
  return `${n} ${pluralRu(n, forms)}`;
}

/** Share of successful answers today in whole percent; `null` when there were no answers (no division by zero). */
export function successPercent(today: LearningStats['today']): number | null {
  if (today.reviews === 0) return null;
  return Math.round((today.successful / today.reviews) * 100);
}

/** One sentence about where the current streak stands — facts only. */
export function streakStatus(streak: LearningStats['streak']): string {
  if (streak.reviewedToday) return 'Сегодня уже засчитан.';
  if (streak.current > 0) {
    return 'Сегодня повторений ещё не было: серия продолжится, если до полуночи оценить хотя бы одну карточку.';
  }
  return 'Сейчас серии нет — она начнётся с первого повторения.';
}

/** Short weekday under a 7-day bar: "пн". */
export function weekdayShort(dayStart: number): string {
  return new Date(dayStart).toLocaleDateString('ru-RU', { weekday: 'short' });
}

/** Full day name for screen readers and tooltips: "понедельник, 12 октября". */
export function dayLong(dayStart: number): string {
  return new Date(dayStart).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Compact date: "12 окт." */
export function dayShort(dayStart: number): string {
  return new Date(dayStart).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * Bar height in percent of the busiest day of the window. A day without
 * reviews is 0 (the chart draws a thin baseline for it, so it stays visible);
 * a day with at least one review never rounds down to an invisible bar.
 */
export function barPercent(reviews: number, window: ActivityWindow): number {
  const max = Math.max(0, ...window.days.map((d) => d.reviews));
  if (reviews <= 0 || max === 0) return 0;
  return Math.max(8, Math.round((reviews / max) * 100));
}

/** Text alternative for an activity chart: totals, study days and the busiest day. */
export function activitySummary(window: ActivityWindow): string {
  const days = window.days.length;
  const head = `За ${countLabel(days, DAY_FORMS)}: ${countLabel(window.total, REVIEW_FORMS)}, дней с повторениями — ${window.activeDays} из ${days}.`;
  if (window.total === 0) return head;
  const busiest = window.days.reduce((best, d) => (d.reviews > best.reviews ? d : best));
  return `${head} Больше всего — ${dayLong(busiest.dayStart)}: ${countLabel(busiest.reviews, REVIEW_FORMS)}.`;
}
