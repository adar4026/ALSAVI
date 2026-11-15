import { describe, expect, it } from 'vitest';
import type { ImportReport } from '../src/importApkg';
import {
  DEFAULT_LIMIT,
  describeImport,
  LIMIT_BOUNDS,
  limitAfterUnlimitedToggle,
  limitStatusText,
  THEME_CHOICES,
} from '../src/profile-view';
import { canStep, stepValue } from '../src/ui/stepper-math';

describe('daily new-card limit (TASK_043)', () => {
  it('"Без ограничения" on → null; off → the last number, or 20', () => {
    expect(limitAfterUnlimitedToggle(true, 15)).toBeNull();
    expect(limitAfterUnlimitedToggle(false, 15)).toBe(15);
    expect(limitAfterUnlimitedToggle(false, 0)).toBe(0);
    expect(limitAfterUnlimitedToggle(false, null)).toBe(DEFAULT_LIMIT);
  });

  it('the stepper stays in the range the session accepts: whole numbers from 0', () => {
    expect(stepValue(0, -1, LIMIT_BOUNDS)).toBe(0);
    expect(canStep(0, -1, LIMIT_BOUNDS)).toBe(false);
    expect(stepValue(20, 1, LIMIT_BOUNDS)).toBe(21);
    expect(stepValue(2.4, 1, LIMIT_BOUNDS)).toBe(3);
    expect(canStep(LIMIT_BOUNDS.max, 1, LIMIT_BOUNDS)).toBe(false);
  });

  it('status line: saving, then the error or "Сохранено", otherwise nothing', () => {
    expect(limitStatusText({ saving: true, error: null, savedRecently: false })).toBe('Сохранение…');
    expect(limitStatusText({ saving: false, error: 'Не удалось сохранить дневной лимит.', savedRecently: false })).toBe(
      'Не удалось сохранить дневной лимит.'
    );
    expect(limitStatusText({ saving: false, error: null, savedRecently: true })).toBe('Сохранено');
    expect(limitStatusText({ saving: false, error: null, savedRecently: false })).toBeNull();
  });
});

describe('theme choices', () => {
  it('«Система · Светлая · Тёмная», the values of theme.ts', () => {
    expect(THEME_CHOICES.map((o) => o.label)).toEqual(['Система', 'Светлая', 'Тёмная']);
    expect(THEME_CHOICES.map((o) => o.value)).toEqual(['system', 'light', 'dark']);
  });
});

describe('Anki import result', () => {
  const report = (patch: Partial<ImportReport>): ImportReport =>
    ({ importedNotes: 12, importedCards: 20, skipped: [], skippedSamples: [], ...patch }) as ImportReport;

  it('the texts of TASK_011, unchanged', () => {
    expect(describeImport(report({}))).toEqual({ text: 'Импортировано 12 заметок (20 карточек).', tone: 'success' });
    expect(
      describeImport(report({ skipped: [{ reason: 'cloze-note-type', count: 2 }, { reason: 'empty-after-cleanup', count: 1 }] })).text
    ).toBe('Импортировано 12 заметок (20 карточек). Пропущено 3: cloze — 2, пустой текст — 1.');
  });

  it('an import stopped by an error is a warning', () => {
    expect(describeImport(report({ error: 'QuotaExceededError' }))).toEqual({
      text: 'Импортировано 12 заметок (20 карточек). Прервано с ошибкой: QuotaExceededError',
      tone: 'warning',
    });
  });
});
