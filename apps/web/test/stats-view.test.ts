import type { ActivityWindow } from '@alsavi/engine';
import { describe, expect, it } from 'vitest';
import {
  activitySummary,
  barPercent,
  countLabel,
  DAY_FORMS,
  dayLong,
  pluralRu,
  REVIEW_FORMS,
  weekdayShort,
} from '../src/stats-view';

function window(counts: number[], firstDay = new Date(2026, 9, 6).getTime()): ActivityWindow {
  const days = counts.map((reviews, i) => ({
    dayStart: new Date(new Date(firstDay).setDate(new Date(firstDay).getDate() + i)).getTime(),
    reviews,
  }));
  return {
    days,
    total: counts.reduce((a, b) => a + b, 0),
    activeDays: counts.filter((c) => c > 0).length,
  };
}

describe('pluralRu / countLabel', () => {
  it('picks the Russian plural form', () => {
    const cases: Array<[number, string]> = [
      [0, 'дней'],
      [1, 'день'],
      [2, 'дня'],
      [4, 'дня'],
      [5, 'дней'],
      [11, 'дней'],
      [12, 'дней'],
      [14, 'дней'],
      [21, 'день'],
      [22, 'дня'],
      [25, 'дней'],
      [101, 'день'],
      [111, 'дней'],
    ];
    for (const [n, form] of cases) expect(pluralRu(n, DAY_FORMS), String(n)).toBe(form);
  });

  it('formats a count with its noun', () => {
    expect(countLabel(1, REVIEW_FORMS)).toBe('1 повторение');
    expect(countLabel(3, REVIEW_FORMS)).toBe('3 повторения');
    expect(countLabel(0, REVIEW_FORMS)).toBe('0 повторений');
  });
});

describe('day labels', () => {
  it('uses Russian weekday and month names', () => {
    const monday = new Date(2026, 9, 12).getTime();
    expect(weekdayShort(monday)).toBe('пн');
    expect(dayLong(monday)).toBe('понедельник, 12 октября');
  });
});

describe('barPercent', () => {
  it('is 0 for a day without reviews and for an all-zero window', () => {
    expect(barPercent(0, window([0, 0, 0]))).toBe(0);
    expect(barPercent(0, window([0, 4, 0]))).toBe(0);
  });

  it('scales to the busiest day and keeps small non-zero days visible', () => {
    const w = window([1, 50, 25]);
    expect(barPercent(50, w)).toBe(100);
    expect(barPercent(25, w)).toBe(50);
    expect(barPercent(1, w)).toBe(8);
  });
});

describe('activitySummary', () => {
  it('states totals and study days, zeros included', () => {
    expect(activitySummary(window([0, 0, 0, 0, 0, 0, 0]))).toBe(
      'За 7 дней: 0 повторений, дней с повторениями — 0 из 7.'
    );
  });

  it('names the busiest day', () => {
    const w = window([0, 2, 0, 5, 0, 1, 0]); // Oct 6 … Oct 12, 2026
    expect(activitySummary(w)).toBe(
      'За 7 дней: 8 повторений, дней с повторениями — 3 из 7. Больше всего — пятница, 9 октября: 5 повторений.'
    );
  });
});
