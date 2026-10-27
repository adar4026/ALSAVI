import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildSnapshot,
  countDue,
  dayKey,
  DEFAULT_REMINDER_SETTINGS,
  isValidTimeZone,
  minuteOfDay,
  nextDailyAt,
  normalizeSettings,
  parseSettings,
  parseSnapshot,
  pluralRu,
  reminderText,
  wallTimeToUtc,
} from '../src/index.js';

const MADRID = 'Europe/Madrid';
const NY = 'America/New_York';
const iso = (s: string) => Date.parse(s);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('zoned time', () => {
  it('maps a wall-clock time to UTC in winter and summer (Madrid +1 / +2)', () => {
    expect(wallTimeToUtc('2026-01-15', '09:00', MADRID)).toBe(iso('2026-01-15T08:00:00Z'));
    expect(wallTimeToUtc('2026-07-15', '09:00', MADRID)).toBe(iso('2026-07-15T07:00:00Z'));
  });

  it('spring-forward gap: 02:30 on 2026-03-29 does not exist → 03:30 local', () => {
    const at = wallTimeToUtc('2026-03-29', '02:30', MADRID);
    expect(at).toBe(iso('2026-03-29T01:30:00Z'));
    expect(minuteOfDay(at, MADRID)).toBe(3 * 60 + 30);
  });

  it('fall-back: 02:30 on 2026-10-25 happens twice → the first one', () => {
    expect(wallTimeToUtc('2026-10-25', '02:30', MADRID)).toBe(iso('2026-10-25T00:30:00Z'));
  });

  it('daily reminder keeps its wall-clock time across a DST change', () => {
    // 09:00 on Saturday (summer time) → next 09:00 is Sunday after the change to winter time
    const sat = wallTimeToUtc('2026-10-24', '09:00', MADRID);
    const sun = nextDailyAt(sat, '09:00', MADRID);
    expect(sun - sat).toBe(25 * HOUR);
    expect(minuteOfDay(sun, MADRID)).toBe(9 * 60);
    expect(dayKey(sun, MADRID)).toBe('2026-10-25');
  });

  it('next occurrence: later today, or tomorrow once today’s has passed (midnight boundary)', () => {
    const t = iso('2026-10-27T22:59:00Z'); // 23:59 in Madrid
    expect(nextDailyAt(t, '23:59', MADRID)).toBe(iso('2026-10-28T22:59:00Z'));
    expect(nextDailyAt(t, '00:00', MADRID)).toBe(iso('2026-10-27T23:00:00Z'));
    expect(dayKey(iso('2026-10-27T23:00:00Z'), MADRID)).toBe('2026-10-28');
  });

  it('the same moment is a different local day in another zone', () => {
    const t = iso('2026-10-28T02:00:00Z');
    expect(dayKey(t, MADRID)).toBe('2026-10-28');
    expect(dayKey(t, NY)).toBe('2026-10-27');
    expect(nextDailyAt(t, '09:00', NY)).toBe(iso('2026-10-28T13:00:00Z'));
  });

  it('validates zones and adds days over month/year ends', () => {
    expect(isValidTimeZone(MADRID)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('review snapshot', () => {
  const now = iso('2026-10-27T08:00:00Z'); // 09:00 Madrid
  const card = (dueOffsetMs: number, state = 'review') => ({ due: now + dueOffsetMs, state });

  it('counts started cards already due and none early', () => {
    const snap = buildSnapshot({
      cards: [card(-3 * 86_400_000), card(-MIN, 'learning'), card(MIN), card(2 * HOUR + 1), card(30 * 86_400_000)],
      now,
      timeZone: MADRID,
      newLimit: null,
      newUsedToday: 0,
    });
    expect(countDue(snap, now)).toEqual({ queue: 2, overdue: 2 });
    // card due in 1 minute: never counted before its due moment, counted ≤ 5 min after
    expect(countDue(snap, now + MIN - 1).overdue).toBe(2);
    expect(countDue(snap, now + 5 * MIN).overdue).toBe(3);
    expect(countDue(snap, now + 2 * HOUR).overdue).toBe(3);
    expect(countDue(snap, now + 2 * HOUR + 5 * MIN).overdue).toBe(4);
    expect(countDue(snap, now + 31 * 86_400_000).overdue).toBe(5);
  });

  it('applies the daily new-card limit on the snapshot day, and a fresh allowance the next day', () => {
    const snap = buildSnapshot({
      cards: [card(-HOUR), ...Array.from({ length: 30 }, () => card(-86_400_000, 'new'))],
      now,
      timeZone: MADRID,
      newLimit: 10,
      newUsedToday: 4,
    });
    expect(countDue(snap, now)).toEqual({ queue: 1 + 6, overdue: 1 });
    // 2026-10-28 09:00 Madrid — a new local day: the full limit again
    expect(countDue(snap, iso('2026-10-28T08:00:00Z'))).toEqual({ queue: 1 + 10, overdue: 1 });
  });

  it('unlimited new cards all count; limit 0 counts none', () => {
    const cards = [card(-HOUR, 'new'), card(-HOUR, 'new')];
    expect(countDue(buildSnapshot({ cards, now, timeZone: MADRID, newLimit: null, newUsedToday: 0 }), now).queue).toBe(2);
    expect(countDue(buildSnapshot({ cards, now, timeZone: MADRID, newLimit: 0, newUsedToday: 0 }), now).queue).toBe(0);
  });

  it('empty collection → nothing due', () => {
    const snap = buildSnapshot({ cards: [], now, timeZone: MADRID, newLimit: null, newUsedToday: 0 });
    expect(countDue(snap, now + 86_400_000)).toEqual({ queue: 0, overdue: 0 });
  });

  it('stays small for a large collection and round-trips through JSON validation', () => {
    const cards = Array.from({ length: 3600 }, (_, i) => card((i - 200) * 17 * MIN));
    const snap = buildSnapshot({ cards, now, timeZone: MADRID, newLimit: 20, newUsedToday: 3 });
    const json = JSON.stringify(snap);
    expect(json.length).toBeLessThan(60_000);
    expect(parseSnapshot(JSON.parse(json))).toEqual(snap);
  });

  it('rejects malformed snapshots', () => {
    const good = buildSnapshot({ cards: [card(-HOUR)], now, timeZone: MADRID, newLimit: null, newUsedToday: 0 });
    expect(parseSnapshot({ ...good, v: 2 })).toBeNull();
    expect(parseSnapshot({ ...good, timeZone: 'Nowhere/X' })).toBeNull();
    expect(parseSnapshot({ ...good, day: '2026-01-01' })).toBeNull();
    expect(parseSnapshot({ ...good, started: [[10, 1], [5, 1]] })).toBeNull();
    expect(parseSnapshot({ ...good, started: [[10, -1]] })).toBeNull();
    expect(parseSnapshot({ ...good, fresh: 'x' })).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
  });
});

describe('settings', () => {
  it('defaults are quiet: off, one daily reminder at 09:00, backlog opt-in', () => {
    expect(DEFAULT_REMINDER_SETTINGS).toEqual({ enabled: false, time: '09:00', backlog: false, backlogThreshold: 30 });
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_REMINDER_SETTINGS);
    expect(normalizeSettings({ enabled: true, time: '25:00', backlogThreshold: 2 })).toEqual({
      ...DEFAULT_REMINDER_SETTINGS,
      enabled: true,
    });
  });

  it('strict parsing for the server', () => {
    expect(parseSettings({ enabled: true, time: '07:30', backlog: true, backlogThreshold: 40 })).toEqual({
      enabled: true,
      time: '07:30',
      backlog: true,
      backlogThreshold: 40,
    });
    expect(parseSettings({ enabled: true, time: '7:30', backlog: true, backlogThreshold: 40 })).toBeNull();
    expect(parseSettings({ enabled: 'yes', time: '07:30', backlog: true, backlogThreshold: 40 })).toBeNull();
    expect(parseSettings({ enabled: true, time: '07:30', backlog: true, backlogThreshold: 1000 })).toBeNull();
  });
});

describe('notification texts', () => {
  it('uses the live count with correct Russian plurals', () => {
    expect(pluralRu(1, ['a', 'b', 'c'])).toBe('a');
    expect(pluralRu(3, ['a', 'b', 'c'])).toBe('b');
    expect(pluralRu(11, ['a', 'b', 'c'])).toBe('c');
    expect(pluralRu(21, ['a', 'b', 'c'])).toBe('a');
    expect(reminderText('daily', 18)).toEqual({
      title: '🇪🇸 ALSAVI',
      body: 'Пора повторить слова!\nСегодня ждут 18 карточек.\nПродолжить повторение →',
    });
    expect(reminderText('daily', 1).body).toContain('Сегодня ждёт 1 карточка.');
    expect(reminderText('backlog', 35)).toEqual({
      title: '📚 ALSAVI',
      body: 'Накопились слова для повторения.\nУ тебя 35 карточек.\nСамое время продолжить обучение.',
    });
  });
});
