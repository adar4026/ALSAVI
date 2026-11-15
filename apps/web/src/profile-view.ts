import type { ImportReport } from './importApkg';
import type { ThemePreference } from './theme';
import { THEME_OPTIONS } from './theme';

/**
 * Wording and small rules of "Профиль" (TASK_043). Pure, tested in
 * `profile-view.test.ts`. The limit's validation and saving stay in `App`
 * (`assertValidNewCardsPerDay`, TASK_020); backup texts in
 * `backup-messages.ts`; reminder texts in `reminder-view.ts`.
 */

/** "Новых карточек в день": the stepper's range (any integer ≥ 0 is valid; 999 is far beyond use). */
export const LIMIT_BOUNDS = { min: 0, max: 999, step: 1 } as const;

/** The number the stepper starts from when "Без ограничения" is switched off and none was set before. */
export const DEFAULT_LIMIT = 20;

/** Stepper changes are saved once the value settles. */
export const LIMIT_SAVE_DELAY_MS = 600;

/** "Без ограничения" on → `null`; off → the last number the learner had, or 20. */
export function limitAfterUnlimitedToggle(unlimited: boolean, lastNumber: number | null): number | null {
  return unlimited ? null : (lastNumber ?? DEFAULT_LIMIT);
}

/** The line under the limit: what happens to the last change. */
export function limitStatusText(state: { saving: boolean; error: string | null; savedRecently: boolean }): string | null {
  if (state.saving) return 'Сохранение…';
  if (state.error) return state.error;
  if (state.savedRecently) return 'Сохранено';
  return null;
}

/** The theme choice in one row: «Система · Светлая · Тёмная» (`theme.ts` keeps its own labels). */
export const THEME_CHOICES: ReadonlyArray<{ value: ThemePreference; label: string }> = THEME_OPTIONS.map((o) =>
  o.value === 'system' ? { ...o, label: 'Система' } : o
);

const SKIP_LABELS: Record<string, string> = {
  'cloze-note-type': 'cloze',
  'fewer-than-2-fields': 'меньше 2 полей',
  'unsupported-template': 'неподдерживаемый шаблон',
  'empty-after-cleanup': 'пустой текст',
};

/**
 * The result of an Anki import (texts unchanged since TASK_011) and how to
 * show it: an import that stopped on an error is a warning, not a success.
 */
export function describeImport(r: ImportReport): { text: string; tone: 'success' | 'warning' } {
  const skipped = r.skipped.reduce((n, s) => n + s.count, 0);
  let text = `Импортировано ${r.importedNotes} заметок (${r.importedCards} карточек).`;
  if (skipped > 0) {
    const parts = r.skipped.map((s) => `${SKIP_LABELS[s.reason] ?? s.reason} — ${s.count}`);
    text += ` Пропущено ${skipped}: ${parts.join(', ')}.`;
  }
  if (r.error) text += ` Прервано с ошибкой: ${r.error}`;
  return { text, tone: r.error ? 'warning' : 'success' };
}
