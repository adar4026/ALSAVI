import { describe, expect, it } from 'vitest';
import type { NoteEntry } from '../src/card-list';
import { collectionSummary, dateLabel, lapsesText, learningRows, rowStatus } from '../src/cards-view';

const NOW = new Date('2026-11-14T12:00:00').getTime();
const DAY = 24 * 60 * 60 * 1000;

type CardSpec = { template?: 'forward' | 'reverse'; state?: string; due?: number; lapses?: number; createdAt?: number };
function entry(o: { status?: NoteEntry['status']; archived?: boolean; cards?: CardSpec[] } = {}): NoteEntry {
  const cards = (o.cards ?? [{}]).map((c, i) => ({
    id: `c${i}`,
    template: c.template ?? 'forward',
    state: c.state ?? 'review',
    due: c.due ?? NOW + 5 * DAY,
    createdAt: c.createdAt ?? new Date('2026-11-03T09:00:00').getTime(),
    scheduling: { lapses: c.lapses ?? 0 },
  }));
  return {
    note: { id: 'n', front: 'la ventanilla', back: 'окошко' },
    tags: [],
    cards,
    status: o.status ?? 'review',
    nextDue: Math.min(...cards.map((c) => c.due)),
    archived: o.archived ?? false,
  } as unknown as NoteEntry;
}

describe('collectionSummary', () => {
  it('words and cards of the active collection, with Russian plurals', () => {
    const list = [entry({ cards: [{}, { template: 'reverse' }] }), entry(), entry({ archived: true })];
    expect(collectionSummary(list)).toBe('2 слова · 3 карточки');
    expect(collectionSummary([entry()])).toBe('1 слово · 1 карточка');
  });

  it('nothing to say for an empty or archive-only collection', () => {
    expect(collectionSummary([])).toBeNull();
    expect(collectionSummary([entry({ archived: true })])).toBeNull();
  });
});

describe('rowStatus', () => {
  it('a word to act on is a badge; a scheduled one is plain text with the interval', () => {
    expect(rowStatus(entry({ status: 'due' }), NOW)).toEqual({ text: 'повторить', tone: 'accent' });
    expect(rowStatus(entry({ status: 'learning' }), NOW)).toEqual({ text: 'изучается', tone: 'warning' });
    expect(rowStatus(entry({ status: 'new' }), NOW)).toEqual({ text: 'новое', tone: 'neutral' });
    expect(rowStatus(entry({ status: 'review' }), NOW)).toEqual({ text: 'через 5 дн', tone: null });
    expect(rowStatus(entry({ status: 'due', archived: true }), NOW)).toEqual({ text: 'в архиве', tone: 'neutral' });
  });
});

describe('learningRows', () => {
  it('status, next show, lapses summed, the reverse card and the date added', () => {
    const rows = learningRows(
      entry({
        status: 'due',
        cards: [
          { due: NOW - DAY, lapses: 1 },
          { template: 'reverse', due: NOW + 12 * DAY, lapses: 1 },
        ],
      }),
      NOW
    );
    expect(rows).toEqual([
      { label: 'Статус', value: 'К повторению' },
      { label: 'Следующий показ', value: 'сейчас' },
      { label: 'Забыто', value: '2 раза' },
      { label: 'Обратная карточка', value: 'есть · через 12 дн' },
      { label: 'Добавлено', value: '3 ноября' },
    ]);
  });

  it('a new word: shown among new cards, never forgotten, no reverse', () => {
    const rows = learningRows(entry({ status: 'new', cards: [{ state: 'new', due: NOW - DAY }] }), NOW);
    expect(rows.map((r) => r.value)).toEqual(['Новое', 'среди новых', 'ни разу', 'нет', '3 ноября']);
  });

  it('archived: no next show', () => {
    const rows = learningRows(entry({ archived: true, cards: [{}, { template: 'reverse' }] }), NOW);
    expect(rows).toEqual([
      { label: 'Статус', value: 'В архиве' },
      { label: 'Забыто', value: 'ни разу' },
      { label: 'Обратная карточка', value: 'есть' },
      { label: 'Добавлено', value: '3 ноября' },
    ]);
  });
});

describe('small texts', () => {
  it('lapses', () => {
    expect([0, 1, 2, 5, 11, 21].map(lapsesText)).toEqual(['ни разу', '1 раз', '2 раза', '5 раз', '11 раз', '21 раз']);
  });

  it('date: the year only when it is not this one', () => {
    expect(dateLabel(new Date('2026-03-08T10:00:00').getTime(), NOW)).toBe('8 марта');
    expect(dateLabel(new Date('2025-12-31T10:00:00').getTime(), NOW)).toBe('31 декабря 2025 г.');
  });
});
