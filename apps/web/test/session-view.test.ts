import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HOTKEY_RATINGS } from '../src/review-hotkeys';
import {
  cardUnit,
  GRADE_KEYS_HINT,
  GRADE_LABELS,
  GRADE_TONES,
  practiceOffer,
  SESSION_GRADES,
  sessionCounter,
  sessionEndText,
  wordSize,
} from '../src/session-view';
import { PRACTICE_GRADE_LABELS, PRACTICE_GRADES } from '../src/practice-flow';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('grades (ADR-006)', () => {
  it('three grades in key order, «Легко» not offered', () => {
    expect(SESSION_GRADES).toEqual(['again', 'hard', 'good']);
    expect(SESSION_GRADES).not.toContain('easy');
    expect(HOTKEY_RATINGS).toEqual(SESSION_GRADES);
    expect(GRADE_KEYS_HINT).toBe('1 · 2 · 3');
  });

  it('one language with the practice: same three labels in the same order', () => {
    expect(SESSION_GRADES.map((g) => GRADE_LABELS[g])).toEqual(['Не помню', 'С трудом', 'Помню']);
    expect(PRACTICE_GRADES.map((g) => PRACTICE_GRADE_LABELS[g])).toEqual(['Не помню', 'С трудом', 'Помню']);
  });

  it('semantic tones: forgotten → danger, effort → warning, recalled → success', () => {
    expect(GRADE_TONES).toEqual({ again: 'danger', hard: 'warning', good: 'success' });
  });

  it('no session screen can send «easy» to the engine', () => {
    for (const file of ['src/ReviewSession.tsx', 'src/PracticeSession.tsx', 'src/ui/RatingBar.tsx']) {
      expect(readFileSync(resolve(webRoot, file), 'utf8'), file).not.toMatch(/['"]easy['"]/);
    }
  });
});

describe('wordSize', () => {
  it('steps at 18 / 40 / 80 characters', () => {
    expect(wordSize('a'.repeat(18))).toBe('xl');
    expect(wordSize('a'.repeat(19))).toBe('l');
    expect(wordSize('a'.repeat(40))).toBe('l');
    expect(wordSize('a'.repeat(41))).toBe('m');
    expect(wordSize('a'.repeat(80))).toBe('m');
    expect(wordSize('a'.repeat(81))).toBe('s');
  });

  it('counts characters, not UTF-16 units, and ignores surrounding spaces', () => {
    expect(wordSize(`  ${'ñ'.repeat(18)}  `)).toBe('xl');
    expect(wordSize('😀'.repeat(18))).toBe('xl');
  });

  it('real examples', () => {
    expect(wordSize('el resguardo')).toBe('xl');
    expect(wordSize('ponerse de acuerdo')).toBe('xl');
    expect(wordSize('a pesar de que llovía, salimos')).toBe('l');
    expect(wordSize('Lo siento muchísimo, no me di cuenta de que ya habías reservado la mesa para todos nosotros')).toBe('s');
  });
});

describe('texts', () => {
  it('counter never passes the total', () => {
    expect(sessionCounter(0, 12)).toBe('1 / 12');
    expect(sessionCounter(11, 12)).toBe('12 / 12');
    expect(sessionCounter(12, 12)).toBe('12 / 12');
  });

  it('offers the practice only when there are difficult words, with the unit', () => {
    expect(practiceOffer(0)).toBeNull();
    expect(practiceOffer(1)).toBe('Тренировка трудных · 1 слово');
    expect(practiceOffer(7)).toBe('Тренировка трудных · 7 слов');
  });

  it('end screens', () => {
    expect(sessionEndText('finished').title).toBe('Готово!');
    expect(sessionEndText('limit').text).toMatch(/лимит/);
    expect(sessionEndText('empty').title).toBe('Сегодня всё повторено');
  });

  it('card unit agrees with the number', () => {
    expect(cardUnit(1)).toBe('карточка');
    expect(cardUnit(3)).toBe('карточки');
    expect(cardUnit(12)).toBe('карточек');
  });
});
