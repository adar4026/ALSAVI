/**
 * Notification wording. Numbers are always the live count the server just
 * computed from the learner's schedule — never a fixed example number.
 */

export type ReminderKind = 'daily' | 'backlog' | 'test';

/** Russian plural form for `n`: 1 карточка, 2 карточки, 5 карточек. */
export function pluralRu(n: number, forms: readonly [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

const CARDS = ['карточка', 'карточки', 'карточек'] as const;

export const APP_NAME = 'ALSAVI';
/** Where a tap on a review notification leads — the study session (scope-relative). */
export const REVIEW_URL = './#/review';
/** One tag for every review notification: a newer one replaces the older one on screen. */
export const REVIEW_TAG = 'alsavi-review';

export interface NotificationText {
  title: string;
  body: string;
}

export function reminderText(kind: ReminderKind, count: number): NotificationText {
  const cards = `${count} ${pluralRu(count, CARDS)}`;
  switch (kind) {
    case 'daily':
      return {
        title: `🇪🇸 ${APP_NAME}`,
        body: `Пора повторить слова!\nСегодня ${pluralRu(count, ['ждёт', 'ждут', 'ждут'])} ${cards}.\nПродолжить повторение →`,
      };
    case 'backlog':
      return {
        title: `📚 ${APP_NAME}`,
        body: `Накопились слова для повторения.\nУ тебя ${cards}.\nСамое время продолжить обучение.`,
      };
    case 'test':
      return {
        title: `🇪🇸 ${APP_NAME}`,
        body: `Проверка напоминаний: уведомления работают.\nСейчас к повторению — ${cards}.`,
      };
  }
}
