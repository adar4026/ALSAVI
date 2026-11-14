import { describe, expect, it } from 'vitest';
import {
  dailyGoal,
  difficultTile,
  greeting,
  heroText,
  limitNote,
  queueLegend,
  showsProgress,
  startLabel,
  todayLabel,
  weekDigest,
} from '../src/home-view';

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

describe('todayLabel', () => {
  it('weekday, day and month in Russian', () => {
    expect(todayLabel(new Date(2026, 10, 14, 9, 0))).toBe('суббота, 14 ноября');
    expect(todayLabel(new Date(2026, 0, 1, 23, 59))).toBe('четверг, 1 января');
  });
});

describe('heroText — real counts, never a percentage', () => {
  it('before the first answer: the size of the queue', () => {
    expect(heroText(dailyGoal({ answeredToday: 0, remaining: 12, newWithheld: 0 }))).toEqual({
      kind: 'queue',
      number: 12,
      unit: 'карточек к повторению',
      detail: null,
    });
    expect(heroText(dailyGoal({ answeredToday: 0, remaining: 1, newWithheld: 0 }))).toMatchObject({ unit: 'карточка к повторению' });
    expect(heroText(dailyGoal({ answeredToday: 0, remaining: 3, newWithheld: 0 }))).toMatchObject({ unit: 'карточки к повторению' });
  });

  it('in progress: what is left and the answers so far', () => {
    expect(heroText(dailyGoal({ answeredToday: 23, remaining: 4, newWithheld: 0 }))).toEqual({
      kind: 'queue',
      number: 4,
      unit: 'карточки в очереди',
      detail: 'Сегодня уже 23 ответа',
    });
  });

  it('done and idle are messages', () => {
    expect(heroText(dailyGoal({ answeredToday: 32, remaining: 0, newWithheld: 0 }))).toEqual({
      kind: 'message',
      title: 'Очередь пройдена',
      detail: 'Сегодня 32 ответа',
    });
    expect(heroText(dailyGoal({ answeredToday: 0, remaining: 0, newWithheld: 0 }))).toMatchObject({
      kind: 'message',
      title: 'Сегодня повторять нечего',
    });
  });

  it('no text contains a percent sign', () => {
    const samples = [
      { answeredToday: 0, remaining: 5, newWithheld: 0 },
      { answeredToday: 9, remaining: 5, newWithheld: 1 },
      { answeredToday: 9, remaining: 0, newWithheld: 0 },
      { answeredToday: 0, remaining: 0, newWithheld: 0 },
    ];
    for (const input of samples) expect(JSON.stringify(heroText(dailyGoal(input)))).not.toContain('%');
  });
});

describe('start button and progress bar', () => {
  it('"Начать повторение" before the first answer, then "Продолжить"', () => {
    expect(startLabel(dailyGoal({ answeredToday: 0, remaining: 5, newWithheld: 0 }))).toBe('Начать повторение');
    expect(startLabel(dailyGoal({ answeredToday: 2, remaining: 5, newWithheld: 0 }))).toBe('Продолжить');
  });

  it('the bar appears only once there are answers and cards remain', () => {
    expect(showsProgress(dailyGoal({ answeredToday: 0, remaining: 5, newWithheld: 0 }))).toBe(false);
    expect(showsProgress(dailyGoal({ answeredToday: 1, remaining: 5, newWithheld: 0 }))).toBe(true);
    expect(showsProgress(dailyGoal({ answeredToday: 9, remaining: 0, newWithheld: 0 }))).toBe(false);
    expect(showsProgress(dailyGoal({ answeredToday: 0, remaining: 0, newWithheld: 0 }))).toBe(false);
  });
});

describe('queueLegend', () => {
  it('words each group with its number and leaves empty ones out', () => {
    expect(queueLegend({ newCount: 5, learningCount: 4, reviewCount: 3 }).map((i) => i.label)).toEqual([
      '5 новых',
      '4 в процессе',
      '3 повторить',
    ]);
    expect(queueLegend({ newCount: 1, learningCount: 0, reviewCount: 0 }).map((i) => i.label)).toEqual(['1 новая']);
    expect(queueLegend({ newCount: 2, learningCount: 0, reviewCount: 7 }).map((i) => i.key)).toEqual(['new', 'review']);
    expect(queueLegend({ newCount: 0, learningCount: 0, reviewCount: 0 })).toEqual([]);
  });
});

describe('difficultTile and weekDigest', () => {
  it('the tile starts the practice, or is disabled with "пока нет"', () => {
    expect(difficultTile(7)).toEqual({ detail: '7 слов · тренировка', disabled: false });
    expect(difficultTile(1)).toEqual({ detail: '1 слово · тренировка', disabled: false });
    expect(difficultTile(0)).toEqual({ detail: 'пока нет', disabled: true });
  });

  it('the week in one line', () => {
    expect(weekDigest({ total: 23, activeDays: 6, days: { length: 7 } })).toBe('23 ответа · 6 из 7 дней с занятиями');
    expect(weekDigest({ total: 1, activeDays: 1, days: { length: 7 } })).toBe('1 ответ · 1 из 7 дней с занятиями');
  });
});
