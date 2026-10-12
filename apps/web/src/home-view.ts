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

/** "осталась 1 карточка" / "осталось 5 карточек" — the verb agrees with the number. */
export function remainingLabel(n: number): string {
  const verb = pluralRu(n, ['осталась', 'осталось', 'осталось']);
  return `${verb} ${countLabel(n, CARD_FORMS)}`;
}

export interface GoalText {
  title: string;
  detail: string;
}

export function goalText(goal: DailyGoal): GoalText {
  switch (goal.kind) {
    case 'active':
      return goal.answered === 0
        ? { title: `Сегодня в очереди ${countLabel(goal.remaining, CARD_FORMS)}`, detail: 'Цель дня — пройти очередь' }
        : {
            title: remainingLabel(goal.remaining).replace(/^./, (c) => c.toUpperCase()),
            detail: `Сегодня ${countLabel(goal.answered, ANSWER_FORMS)}`,
          };
    case 'done':
      return { title: 'Очередь на сегодня пройдена', detail: `Сегодня ${countLabel(goal.answered, ANSWER_FORMS)}` };
    case 'idle':
      return {
        title: 'Сегодня повторять нечего',
        detail: 'Возвращайся, когда подойдёт срок следующего повторения.',
      };
  }
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

/** Subtitle of a quick action with a count, e.g. "12 карточек" / "пока нет". */
export function quickCount(n: number, forms: readonly [string, string, string]): string {
  return n === 0 ? 'пока нет' : countLabel(n, forms);
}
