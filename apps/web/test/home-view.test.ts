import { describe, expect, it } from 'vitest';
import { dailyGoal, goalText, greeting, limitNote, quickCount, remainingLabel, WORD_FORMS } from '../src/home-view';

describe('greeting', () => {
  it('follows the local hour', () => {
    expect(greeting(5)).toBe('Доброе утро');
    expect(greeting(11)).toBe('Доброе утро');
    expect(greeting(12)).toBe('Добрый день');
    expect(greeting(17)).toBe('Добрый день');
    expect(greeting(18)).toBe('Добрый вечер');
    expect(greeting(22)).toBe('Добрый вечер');
    expect(greeting(23)).toBe('Доброй ночи');
    expect(greeting(0)).toBe('Доброй ночи');
    expect(greeting(4)).toBe('Доброй ночи');
  });
});

describe('dailyGoal — the goal is to finish today\'s queue', () => {
  it('starts at 0 before the first answer', () => {
    expect(dailyGoal({ answeredToday: 0, remaining: 12, newWithheld: 0 })).toEqual({
      kind: 'active',
      answered: 0,
      remaining: 12,
      fraction: 0,
      withheld: 0,
    });
  });

  it('grows with answers and never reaches 1 while cards remain', () => {
    const goal = dailyGoal({ answeredToday: 30, remaining: 1, newWithheld: 0 });
    expect(goal.kind).toBe('active');
    if (goal.kind !== 'active') return;
    expect(goal.fraction).toBeCloseTo(30 / 31);
    expect(goal.fraction).toBeLessThan(1);
  });

  it('is done exactly when the queue is empty after answers', () => {
    expect(dailyGoal({ answeredToday: 7, remaining: 0, newWithheld: 0 })).toEqual({
      kind: 'done',
      answered: 7,
      withheld: 0,
    });
  });

  it('is idle — not "done" — when nothing was due and nothing answered', () => {
    expect(dailyGoal({ answeredToday: 0, remaining: 0, newWithheld: 0 })).toEqual({
      kind: 'idle',
      withheld: 0,
    });
  });

  it('carries the cards held back by the daily new-card limit in every state', () => {
    expect(dailyGoal({ answeredToday: 0, remaining: 3, newWithheld: 5 }).withheld).toBe(5);
    expect(dailyGoal({ answeredToday: 4, remaining: 0, newWithheld: 5 }).withheld).toBe(5);
    expect(dailyGoal({ answeredToday: 0, remaining: 0, newWithheld: 2 }).withheld).toBe(2);
  });
});

describe('limitNote', () => {
  it('no note when the limit holds nothing back', () => {
    expect(limitNote(dailyGoal({ answeredToday: 0, remaining: 3, newWithheld: 0 }))).toBeNull();
    expect(limitNote(dailyGoal({ answeredToday: 3, remaining: 0, newWithheld: 0 }))).toBeNull();
  });

  it('while cards remain: how many new cards wait — the limit is not "reached" yet', () => {
    expect(limitNote(dailyGoal({ answeredToday: 0, remaining: 2, newWithheld: 1 }))).toBe(
      'Дневной лимит новых карточек: ещё 1 новая карточка появится в следующие дни.'
    );
    expect(limitNote(dailyGoal({ answeredToday: 0, remaining: 2, newWithheld: 3 }))).toBe(
      'Дневной лимит новых карточек: ещё 3 новые карточки появятся в следующие дни.'
    );
    expect(limitNote(dailyGoal({ answeredToday: 0, remaining: 2, newWithheld: 25 }))).toBe(
      'Дневной лимит новых карточек: ещё 25 новых карточек появятся в следующие дни.'
    );
  });

  it('with an empty queue: the limit is reached', () => {
    const text = 'Дневной лимит новых карточек достигнут — новые вернутся завтра.';
    expect(limitNote(dailyGoal({ answeredToday: 4, remaining: 0, newWithheld: 5 }))).toBe(text);
    expect(limitNote(dailyGoal({ answeredToday: 0, remaining: 0, newWithheld: 2 }))).toBe(text);
  });
});

describe('remainingLabel', () => {
  it('agrees the verb and the noun with the number', () => {
    expect(remainingLabel(1)).toBe('осталась 1 карточка');
    expect(remainingLabel(2)).toBe('осталось 2 карточки');
    expect(remainingLabel(5)).toBe('осталось 5 карточек');
    expect(remainingLabel(11)).toBe('осталось 11 карточек');
    expect(remainingLabel(21)).toBe('осталась 21 карточка');
  });
});

describe('goalText — real counts, never a percentage', () => {
  it('before the first answer: the size of the queue', () => {
    expect(goalText(dailyGoal({ answeredToday: 0, remaining: 12, newWithheld: 0 }))).toEqual({
      title: 'Сегодня в очереди 12 карточек',
      detail: 'Цель дня — пройти очередь',
    });
  });

  it('in progress: what is left and how many answers today', () => {
    expect(goalText(dailyGoal({ answeredToday: 23, remaining: 1, newWithheld: 0 }))).toEqual({
      title: 'Осталась 1 карточка',
      detail: 'Сегодня 23 ответа',
    });
  });

  it('done and idle', () => {
    expect(goalText(dailyGoal({ answeredToday: 1, remaining: 0, newWithheld: 0 }))).toEqual({
      title: 'Очередь на сегодня пройдена',
      detail: 'Сегодня 1 ответ',
    });
    expect(goalText(dailyGoal({ answeredToday: 0, remaining: 0, newWithheld: 0 })).title).toBe(
      'Сегодня повторять нечего'
    );
  });

  it('no text contains a percent sign', () => {
    const samples = [
      { answeredToday: 0, remaining: 5, newWithheld: 0 },
      { answeredToday: 9, remaining: 5, newWithheld: 1 },
      { answeredToday: 9, remaining: 0, newWithheld: 0 },
      { answeredToday: 0, remaining: 0, newWithheld: 0 },
    ];
    for (const input of samples) {
      const { title, detail } = goalText(dailyGoal(input));
      expect(`${title} ${detail}`).not.toContain('%');
    }
  });
});

describe('quickCount', () => {
  it('says "пока нет" for zero instead of a bare 0', () => {
    expect(quickCount(0, WORD_FORMS)).toBe('пока нет');
    expect(quickCount(3, WORD_FORMS)).toBe('3 слова');
  });
});
