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

/* --- TASK_031: the analytics screen ---------------------------------------
   Every number below is read from `getLearningStats()` (definitions in
   `packages/engine/src/stats.ts`); these helpers only pick, word and round. */

/** After "из": "из 1 слова", "из 5 слов", "из 21 слова". */
const OF_WORD_FORMS = ['слова', 'слов', 'слов'] as const;
const OF_ANSWER_FORMS = ['ответа', 'ответов', 'ответов'] as const;
const OF_CARD_FORMS = ['карточки', 'карточек', 'карточек'] as const;
const CARD_FORMS = ['карточка', 'карточки', 'карточек'] as const;

/** Share in whole percent; `null` when the whole is 0 (no division by zero). */
export function percentOf(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/** "12,5" — one decimal at most, Russian decimal comma. */
export function formatDecimal(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

/**
 * Nothing to analyse yet: no card (active or archived) and no answer. Then
 * the screen shows zeros and an invitation instead of empty charts.
 */
export function isStatsEmpty(stats: LearningStats): boolean {
  return stats.cards.active === 0 && stats.cards.archived === 0 && stats.answers.total === 0;
}

export interface Kpi {
  id: 'learned' | 'accuracy' | 'streak' | 'due';
  label: string;
  /** The headline, already formatted ("84%", "—", "7"). */
  value: string;
  /** Unit after the value ("дней", "карточек"), if any. */
  unit?: string;
  /** One short line under the value. */
  detail: string;
}

/** The four headline numbers at the top of "Статистика". */
export function statsKpis(stats: LearningStats): Kpi[] {
  const { notes, answers, streak, due, cards } = stats;
  const accuracy = percentOf(answers.successful, answers.total);

  const streakDetail = streak.reviewedToday
    ? 'сегодня засчитан'
    : streak.current > 0
      ? 'сегодня ещё нет ответов'
      : 'начнётся с первого ответа';
  const record = streak.longest > streak.current ? ` · рекорд ${streak.longest}` : '';

  return [
    {
      id: 'learned',
      label: 'Изучено слов',
      value: String(notes.learned),
      detail: `из ${notes.active} ${pluralRu(notes.active, OF_WORD_FORMS)}`,
    },
    {
      id: 'accuracy',
      label: 'Точность ответов',
      value: accuracy === null ? '—' : `${accuracy}%`,
      detail:
        accuracy === null
          ? 'пока нет ответов'
          : `правильных из ${answers.total} ${pluralRu(answers.total, OF_ANSWER_FORMS)}`,
    },
    {
      id: 'streak',
      label: 'Серия занятий',
      value: String(streak.current),
      unit: pluralRu(streak.current, DAY_FORMS),
      detail: streakDetail + record,
    },
    {
      id: 'due',
      label: 'К повторению',
      value: String(due.now),
      unit: pluralRu(due.now, CARD_FORMS),
      detail: `новых ${cards.new} · позже ${due.later}`,
    },
  ];
}

export type ActivityPeriod = 7 | 30;

export const ACTIVITY_PERIODS: readonly ActivityPeriod[] = [7, 30];

/** The window the period toggle shows; both are computed by the Engine in one pass. */
export function activityFor(activity: LearningStats['activity'], period: ActivityPeriod): ActivityWindow {
  return period === 7 ? activity.last7 : activity.last30;
}

export interface ActivityDigest {
  total: number;
  activeDays: number;
  days: number;
  /** Answers per day with at least one answer; `null` without such days. */
  perActiveDay: number | null;
}

/** The three numbers under the activity chart. */
export function activityDigest(window: ActivityWindow): ActivityDigest {
  return {
    total: window.total,
    activeDays: window.activeDays,
    days: window.days.length,
    perActiveDay: window.activeDays === 0 ? null : window.total / window.activeDays,
  };
}

export type ProgressKey = 'new' | 'learning' | 'learned';

export interface ProgressSegment {
  key: ProgressKey;
  label: string;
  hint: string;
  count: number;
  /** Whole percent of active cards; the segments always add up to 100 (or all 0). */
  percent: number;
}

/**
 * Active cards by stage — the scheduler's own states: `new`; `learning` +
 * `relearning`; `review` (= learned, due or not). Percentages use the
 * largest-remainder method so the visible numbers add up to exactly 100.
 */
export function progressSegments(cards: LearningStats['cards']): ProgressSegment[] {
  const raw: Array<Omit<ProgressSegment, 'percent'>> = [
    { key: 'new', label: 'Новые', hint: 'ещё не показывались', count: cards.new },
    { key: 'learning', label: 'Изучаются', hint: 'первые шаги или после ошибки', count: cards.learning },
    { key: 'learned', label: 'Изучены', hint: 'на длинных интервалах', count: cards.dueReview + cards.waiting },
  ];
  const total = cards.active;
  if (total === 0) return raw.map((s) => ({ ...s, percent: 0 }));
  const exact = raw.map((s) => (s.count / total) * 100);
  const percents = exact.map(Math.floor);
  let rest = 100 - percents.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (rest <= 0) break;
    percents[i] = percents[i]! + 1;
    rest -= 1;
  }
  return raw.map((s, i) => ({ ...s, percent: percents[i]! }));
}

/** "Изучено 45 из 120 карточек". */
export function progressHeadline(cards: LearningStats['cards']): string {
  const learned = cards.dueReview + cards.waiting;
  return `Изучено ${learned} из ${cards.active} ${pluralRu(cards.active, OF_CARD_FORMS)}`;
}
