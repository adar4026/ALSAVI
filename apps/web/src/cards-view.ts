import type { BadgeTone } from './ui';
import { addedAt, lapsesOf, type NoteEntry } from './card-list';
import { formatInterval } from './format';
import { CARD_FORMS, WORD_FORMS } from './home-view';
import { countLabel, pluralRu, TIME_FORMS } from './stats-view';

/**
 * Texts of the "Карточки" list and the card view (TASK_041,
 * SCREEN_SPECIFICATIONS §3, §5). Pure: everything comes from `NoteEntry`
 * (`engine.listCardViews()`), no extra requests. Tested in
 * `cards-view.test.ts`.
 */

/** "41 слово · 48 карточек" under the "Карточки" title — the active collection. */
export function collectionSummary(entries: readonly NoteEntry[]): string | null {
  const active = entries.filter((e) => !e.archived);
  if (active.length === 0) return null;
  const cards = active.reduce((n, e) => n + e.cards.length, 0);
  return `${countLabel(active.length, WORD_FORMS)} · ${countLabel(cards, CARD_FORMS)}`;
}

/**
 * The state at the end of a list row. `tone` null: plain secondary text (a
 * word that waits for its next repetition is not a call to action).
 */
export function rowStatus(entry: NoteEntry, now: number): { text: string; tone: BadgeTone | null } {
  if (entry.archived) return { text: 'в архиве', tone: 'neutral' };
  switch (entry.status) {
    case 'due':
      return { text: 'повторить', tone: 'accent' };
    case 'learning':
      return { text: 'изучается', tone: 'warning' };
    case 'new':
      return { text: 'новое', tone: 'neutral' };
    case 'review':
      return { text: `через ${formatInterval(now, entry.nextDue)}`, tone: null };
  }
}

const STATUS_TEXT: Record<NoteEntry['status'], string> = {
  due: 'К повторению',
  learning: 'Изучается',
  new: 'Новое',
  review: 'Выучено',
};

/** "сейчас", "через 5 дн", or — for a card never shown — "среди новых". */
function whenText(card: NoteEntry['cards'][number], now: number): string {
  if (card.state === 'new') return 'среди новых';
  return card.due <= now ? 'сейчас' : `через ${formatInterval(now, card.due)}`;
}

/** "3 ноября", with the year when it is not the current one. */
export function dateLabel(ms: number, now: number): string {
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) }).format(
    new Date(ms)
  );
}

/** "ни разу", "1 раз", "2 раза", "5 раз". */
export function lapsesText(n: number): string {
  return n === 0 ? 'ни разу' : `${n} ${pluralRu(n, TIME_FORMS)}`;
}

export interface DetailRow {
  label: string;
  value: string;
}

/** The "Обучение" group of the card view. */
export function learningRows(entry: NoteEntry, now: number): DetailRow[] {
  const forward = entry.cards.find((c) => c.template === 'forward') ?? entry.cards[0]!;
  const reverse = entry.cards.find((c) => c.template === 'reverse');
  const rows: DetailRow[] = [{ label: 'Статус', value: entry.archived ? 'В архиве' : STATUS_TEXT[entry.status] }];
  if (!entry.archived) rows.push({ label: 'Следующий показ', value: whenText(forward, now) });
  rows.push({ label: 'Забыто', value: lapsesText(lapsesOf(entry)) });
  rows.push({
    label: 'Обратная карточка',
    value: reverse ? (entry.archived ? 'есть' : `есть · ${whenText(reverse, now)}`) : 'нет',
  });
  rows.push({ label: 'Добавлено', value: dateLabel(addedAt(entry), now) });
  return rows;
}
