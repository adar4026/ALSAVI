import type { Rating } from '@alsavi/engine';
import { CARD_FORMS, WORD_FORMS } from './home-view';
import { countLabel } from './stats-view';

/**
 * Presentation logic of the study session and the difficult-words practice
 * (TASK_038). Pure, tested in `session-view.test.ts`; `ReviewSession.tsx`
 * and `PracticeSession.tsx` only render it.
 */

/**
 * The grades the review interface offers (ADR-006): three — `easy` is not
 * offered. Order = keys 1, 2, 3. The single source for the buttons and the
 * keyboard (`review-hotkeys.ts`).
 */
export const SESSION_GRADES = ['again', 'hard', 'good'] as const satisfies readonly Rating[];
export type SessionGrade = (typeof SESSION_GRADES)[number];

/** One language of self-assessment for the session and the practice (D-06). */
export const GRADE_LABELS: Record<SessionGrade, string> = {
  again: 'Не помню',
  hard: 'С трудом',
  good: 'Помню',
};

/** Colour tone of each grade (COMPONENT_LIBRARY: again → danger, hard → warning, good → success). */
export type GradeTone = 'danger' | 'warning' | 'success';
export const GRADE_TONES: Record<SessionGrade, GradeTone> = { again: 'danger', hard: 'warning', good: 'success' };

/** Keyboard hint under the buttons (shown only with a fine pointer). */
export const GRADE_KEYS_HINT = SESSION_GRADES.map((_, i) => String(i + 1)).join(' · ');

/**
 * Size step of the word on the card (DESIGN_SYSTEM §2, `--type-word-*`):
 * a short word large, a long phrase smaller — always readable without
 * scrolling the card. Counted in characters (code points), trimmed.
 */
export type WordSize = 'xl' | 'l' | 'm' | 's';

export const WORD_SIZE_LIMITS: ReadonlyArray<[WordSize, number]> = [
  ['xl', 18],
  ['l', 40],
  ['m', 80],
];

export function wordSize(text: string): WordSize {
  const length = [...text.trim()].length;
  for (const [size, max] of WORD_SIZE_LIMITS) if (length <= max) return size;
  return 's';
}

/** "3 / 12": the card on screen of the session's cards (never past the total). */
export function sessionCounter(done: number, total: number): string {
  return `${Math.min(done + 1, Math.max(total, 1))} / ${total}`;
}

/** Secondary action after a session: "Тренировка трудных · 7 слов" (null when there are none). */
export function practiceOffer(difficultWords: number): string | null {
  return difficultWords > 0 ? `Тренировка трудных · ${countLabel(difficultWords, WORD_FORMS)}` : null;
}

export interface SessionEndText {
  title: string;
  text: string;
}

/**
 * The end screens of the study session: finished with answers, or nothing to
 * study (opened from a reminder after the queue was done, or the daily limit
 * holds new cards back).
 */
export function sessionEndText(kind: 'finished' | 'empty' | 'limit'): SessionEndText {
  switch (kind) {
    case 'finished':
      return { title: 'Готово!', text: 'Очередь на сегодня пройдена.' };
    case 'limit':
      return { title: 'На сегодня всё', text: 'Дневной лимит новых карточек достигнут — новые вернутся завтра.' };
    case 'empty':
      return { title: 'Сегодня всё повторено', text: 'Возвращайся, когда подойдёт срок следующего повторения.' };
  }
}

/** Unit for the "Повторено" number of the summary: "карточка / карточки / карточек". */
export function cardUnit(n: number): string {
  return countLabel(n, CARD_FORMS).replace(/^\d+\s/, '');
}
