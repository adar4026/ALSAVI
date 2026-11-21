import { describe, expect, it } from 'vitest';
import {
  backupAgeText,
  backupSuggestion,
  calendarDaysBetween,
  collectionFingerprint,
  lastBackupLine,
  markFromRestore,
  MIN_WORDS,
  REMIND_AFTER_DAYS,
  SNOOZE_DAYS,
  snoozeUntil,
  type BackupReminderState,
} from '../src/backup-reminder.js';

/** Backup reminder (TASK_048): pure rules and texts. */

const at = (day: number, hour = 12) => new Date(2026, 10, day, hour, 0).getTime();

const stats = (over: { answers?: number; active?: number; archived?: number; words?: number } = {}) => ({
  answers: { total: over.answers ?? 120, successful: 100 },
  cards: { active: over.active ?? 30, new: 5, learning: 2, dueReview: 3, waiting: 20, archived: over.archived ?? 1 },
  notes: { active: over.words ?? 25, learned: 10 },
});

const state = (s: Partial<BackupReminderState> = {}): BackupReminderState => ({ mark: null, snoozedUntil: null, ...s });

describe('calendar days and age text', () => {
  it('counts calendar days in local time, not 24-hour blocks', () => {
    expect(calendarDaysBetween(at(10, 23), at(11, 1))).toBe(1);
    expect(calendarDaysBetween(at(10, 1), at(10, 23))).toBe(0);
    expect(calendarDaysBetween(at(1), at(9))).toBe(8);
  });

  it('survives a DST change (29 March 2026 in Europe has 23 hours)', () => {
    const before = new Date(2026, 2, 28, 12).getTime();
    const after = new Date(2026, 2, 30, 12).getTime();
    expect(calendarDaysBetween(before, after)).toBe(2);
  });

  it('сегодня / вчера / N дней назад, plural forms', () => {
    expect(backupAgeText(at(10, 8), at(10, 20))).toBe('сегодня');
    expect(backupAgeText(at(9), at(10))).toBe('вчера');
    expect(backupAgeText(at(8), at(10))).toBe('2 дня назад');
    expect(backupAgeText(at(1), at(6))).toBe('5 дней назад');
    expect(backupAgeText(at(1), at(22))).toBe('21 день назад');
  });

  it('a mark in the future (clock moved back) reads «сегодня»', () => {
    expect(backupAgeText(at(12), at(10))).toBe('сегодня');
  });

  it('the line in «Профиль»', () => {
    expect(lastBackupLine(null, at(10))).toBe('Копий ещё не было');
    expect(lastBackupLine({ at: at(7), fingerprint: 'x' }, at(10))).toBe('Последняя копия: 3 дня назад');
  });
});

describe('fingerprint', () => {
  it('changes with an answer, a new word and an archived word', () => {
    const base = collectionFingerprint(stats());
    expect(collectionFingerprint(stats({ answers: 121 }))).not.toBe(base);
    expect(collectionFingerprint(stats({ active: 32 }))).not.toBe(base);
    expect(collectionFingerprint(stats({ active: 29, archived: 2 }))).not.toBe(base);
    expect(collectionFingerprint(stats())).toBe(base);
  });
});

describe('when the home screen suggests a copy', () => {
  it('no copy yet: only once the collection has MIN_WORDS words', () => {
    expect(backupSuggestion(state(), stats({ words: MIN_WORDS - 1 }), at(10))).toEqual({ show: false });
    const s = backupSuggestion(state(), stats({ words: MIN_WORDS }), at(10));
    expect(s).toEqual({ show: true, text: 'Резервной копии ещё нет — слова хранятся только на этом устройстве.' });
  });

  it(`after ${REMIND_AFTER_DAYS} days and only if something changed`, () => {
    const mark = { at: at(1), fingerprint: collectionFingerprint(stats()) };
    const changed = stats({ answers: 150 });
    expect(backupSuggestion(state({ mark }), changed, at(1 + REMIND_AFTER_DAYS - 1))).toEqual({ show: false });
    expect(backupSuggestion(state({ mark }), stats(), at(1 + REMIND_AFTER_DAYS + 5))).toEqual({ show: false });
    expect(backupSuggestion(state({ mark }), changed, at(1 + REMIND_AFTER_DAYS))).toEqual({
      show: true,
      text: 'Последняя копия — 7 дней назад, с тех пор есть изменения.',
    });
    expect(backupSuggestion(state({ mark }), changed, at(23))).toMatchObject({ text: expect.stringContaining('22 дня назад') });
  });

  it(`«Позже» hides it for ${SNOOZE_DAYS} days, then it returns`, () => {
    const now = at(10, 9);
    const until = snoozeUntil(now);
    expect(until - now).toBe(SNOOZE_DAYS * 86_400_000);
    const snoozed = state({ snoozedUntil: until });
    expect(backupSuggestion(snoozed, stats(), at(12, 9))).toEqual({ show: false });
    expect(backupSuggestion(snoozed, stats(), at(13, 9))).toMatchObject({ show: true });
  });
});

describe('a restore counts as a copy', () => {
  it("uses the copy's own date and today's collection", () => {
    const s = stats({ answers: 80 });
    expect(markFromRestore(at(3), s, at(10))).toEqual({ at: at(3), fingerprint: collectionFingerprint(s) });
  });

  it('never in the future, and falls back to now for a broken date', () => {
    expect(markFromRestore(at(12), stats(), at(10)).at).toBe(at(10));
    expect(markFromRestore(Number.NaN, stats(), at(10)).at).toBe(at(10));
  });
});
