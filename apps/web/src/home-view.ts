import { countLabel, pluralRu } from './stats-view';

/**
 * Presentation logic of the home screen (TASK_029). Every number comes from
 * existing sources — `StudySession.overview()` (today's queue, the same
 * selector the session itself uses) and `engine.getLearningStats()` (answers
 * today, cards, difficult words, the week). Nothing here counts reviews or
 * cards; it only classifies the day and words it. Pure, tested in
 * `home-view.test.ts`.
 */

export const CARD_FORMS = ['карточка', 'карточки', 'карточек'] as const;
export const ANSWER_FORMS = ['ответ', 'ответа', 'ответов'] as const;
export const WORD_FORMS = ['слово', 'слова', 'слов'] as const;

/** Greeting by the device's local hour (0–23). */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 18) return 'Добрый день';
  if (hour >= 18 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

export interface DailyGoalInput {
  /** Answers recorded today (`getLearningStats().today.reviews`). */
  answeredToday: number;
  /** Cards still in today's queue (`overview().total`). */
  remaining: number;
  /** New cards held back by the daily limit (`overview().newWithheld`). */
  newWithheld: number;
}

/**
 * The daily goal is to finish today's spaced-repetition queue (owner's
 * decision, TASK_029). There is no separate "goal" number in the data:
 *  - `active` — cards are waiting; `fraction` = answers / (answers + cards
 *    left): 0 before the first answer, 1 exactly when the queue is empty.
 *    It is a visual cue only — the screen always shows the real counts, never
 *    a percentage, because one card can take several answers.
 *  - `done` — the queue is empty and there were answers today.
 *  - `idle` — nothing is due and nothing was answered today.
 */
export type DailyGoal =
  | { kind: 'active'; answered: number; remaining: number; fraction: number; withheld: number }
  | { kind: 'done'; answered: number; withheld: number }
  | { kind: 'idle'; withheld: number };

export function dailyGoal({ answeredToday, remaining, newWithheld }: DailyGoalInput): DailyGoal {
  const withheld = newWithheld;
  if (remaining > 0) {
    return {
      kind: 'active',
      answered: answeredToday,
      remaining,
      fraction: answeredToday / (answeredToday + remaining),
      withheld,
    };
  }
  if (answeredToday > 0) return { kind: 'done', answered: answeredToday, withheld };
  return { kind: 'idle', withheld };
}

const NEW_CARD_FORMS = ['новая карточка', 'новые карточки', 'новых карточек'] as const;

/**
 * A note under the goal when the daily new-card limit holds new cards back
 * (`null` otherwise). While today's queue still has cards, the limit is not
 * "reached" yet — it only decides how many new cards are in today's queue —
 * so the note says how many wait for later days; once the queue is empty it
 * is the TASK_022 home-screen wording.
 */
export function limitNote(goal: DailyGoal): string | null {
  if (goal.withheld === 0) return null;
  if (goal.kind === 'active') {
    const verb = pluralRu(goal.withheld, ['появится', 'появятся', 'появятся']);
    return `Дневной лимит новых карточек: ещё ${countLabel(goal.withheld, NEW_CARD_FORMS)} ${verb} в следующие дни.`;
  }
  return 'Дневной лимит новых карточек достигнут — новые вернутся завтра.';
}

/* --- TASK_039: the redesigned home screen ----------------------------------- */

/** "суббота, 14 ноября" — the overline above the greeting (device locale calendar, Russian words). */
export function todayLabel(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

/**
 * The "Сегодня" card (SCREEN_SPECIFICATIONS §1): one large number while cards
 * wait, a title once there is nothing to do. Real counts only — never a
 * percentage (one card may take several answers).
 */
export type HeroText =
  | { kind: 'queue'; number: number; unit: string; detail: string | null }
  | { kind: 'message'; title: string; detail: string };

export function heroText(goal: DailyGoal): HeroText {
  switch (goal.kind) {
    case 'active': {
      const noun = pluralRu(goal.remaining, CARD_FORMS);
      return goal.answered === 0
        ? { kind: 'queue', number: goal.remaining, unit: `${noun} к повторению`, detail: null }
        : {
            kind: 'queue',
            number: goal.remaining,
            unit: `${noun} в очереди`,
            detail: `Сегодня уже ${countLabel(goal.answered, ANSWER_FORMS)}`,
          };
    }
    case 'done':
      return { kind: 'message', title: 'Очередь пройдена', detail: `Сегодня ${countLabel(goal.answered, ANSWER_FORMS)}` };
    case 'idle':
      return {
        kind: 'message',
        title: 'Сегодня повторять нечего',
        detail: 'Возвращайся, когда подойдёт срок следующего повторения.',
      };
  }
}

/** "Начать повторение" before the first answer of the day, then "Продолжить". */
export function startLabel(goal: DailyGoal): string {
  return goal.kind === 'active' && goal.answered > 0 ? 'Продолжить' : 'Начать повторение';
}

/** The progress bar appears only after the first answer (H-4: an empty bar in the morning looks broken). */
export function showsProgress(goal: DailyGoal): boolean {
  return goal.kind === 'active' && goal.answered > 0;
}

export interface LegendItem {
  key: 'new' | 'learning' | 'review';
  label: string;
}

const NEW_FORMS = ['новая', 'новые', 'новых'] as const;

/**
 * The queue split under the number: "5 новых · 4 в процессе · 3 повторить",
 * from `StudySession.overview()`; empty groups are left out.
 */
export function queueLegend(o: { newCount: number; learningCount: number; reviewCount: number }): LegendItem[] {
  const items: LegendItem[] = [];
  if (o.newCount > 0) items.push({ key: 'new', label: countLabel(o.newCount, NEW_FORMS) });
  if (o.learningCount > 0) items.push({ key: 'learning', label: `${o.learningCount} в процессе` });
  if (o.reviewCount > 0) items.push({ key: 'review', label: `${o.reviewCount} повторить` });
  return items;
}

/**
 * The "Трудные слова" tile: starts the practice (Q7) — or says "пока нет"
 * and is disabled when no word has been forgotten yet.
 */
export function difficultTile(words: number): { detail: string; disabled: boolean } {
  return words > 0
    ? { detail: `${countLabel(words, WORD_FORMS)} · тренировка`, disabled: false }
    : { detail: 'пока нет', disabled: true };
}

/** One line under the compact week: "23 ответа · 6 из 7 дней с занятиями". */
export function weekDigest(w: { total: number; activeDays: number; days: { length: number } }): string {
  const days = w.days.length;
  return `${countLabel(w.total, ANSWER_FORMS)} · ${w.activeDays} из ${days} ${pluralRu(days, ['дня', 'дней', 'дней'])} с занятиями`;
}
