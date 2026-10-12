import { LearningEngine, MemoryStore } from '@alsavi/engine';
import { describe, expect, it } from 'vitest';
import {
  buildNoteEntries,
  collectTags,
  EMPTY_FILTER,
  filterEntries,
  findDuplicate,
  foldText,
  parseTagInput,
  type ListFilter,
} from '../src/card-list.js';

const T0 = new Date('2026-09-01T10:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

async function seed() {
  const clock = { t: T0 };
  let seq = 0;
  const store = new MemoryStore();
  const engine = new LearningEngine(store, { now: () => clock.t, newId: () => `id-${String(seq++).padStart(3, '0')}` });
  const add = async (front: string, back: string, extra: Record<string, unknown> = {}) => {
    const r = await engine.addNote({ front, back, ...extra });
    clock.t += 1000; // distinct createdAt → deterministic newest-first order
    return r;
  };
  const practica = await add('la práctica', 'практика', {
    example: 'La práctica hace al maestro.',
    tags: ['разговорный'],
  });
  const piso = await add('el piso', 'квартира', { memo: 'в Испании так говорят про квартиру', tags: ['недвижимость'] });
  const alquilar = await add('alquilar', 'снимать жильё', { tags: ['недвижимость', 'глаголы'], directions: ['forward', 'reverse'] });
  const iglesia = await add('la iglesia', 'церковь', { tags: ['церковь'] });
  return { engine, store, clock, practica, piso, alquilar, iglesia };
}

async function entriesOf(engine: LearningEngine, now: number) {
  return buildNoteEntries(await engine.listCardViews(), now);
}

const fronts = (entries: { note: { front: string } }[]) => entries.map((e) => e.note.front);
const f = (patch: Partial<ListFilter>): ListFilter => ({ ...EMPTY_FILTER, ...patch });

describe('foldText', () => {
  it('ignores case, extra whitespace and Spanish accents', () => {
    expect(foldText('  La   PRÁCTICA ')).toBe('la practica');
    expect(foldText('año pingüino ÉL')).toBe('ano pinguino el');
  });

  it('keeps Cyrillic й and ё as distinct letters', () => {
    expect(foldText('Мой ёж')).toBe('мой ёж');
  });
});

describe('buildNoteEntries', () => {
  it('one entry per note (siblings grouped), newest first, tags always an array', async () => {
    const { engine, store, clock } = await seed();
    await store.putNote({ id: 'zz-legacy', front: 'viejo', back: 'старый' });
    await store.putCard({
      id: 'zz-legacy-c', noteId: 'zz-legacy', template: 'forward', deckId: 'default', createdAt: T0 - DAY, due: T0, state: 'new',
      scheduling: { stability: 0, difficulty: 0, reps: 0, lapses: 0, scheduledDays: 0, learningSteps: 0 },
    });
    const entries = await entriesOf(engine, clock.t);
    expect(fronts(entries)).toEqual(['la iglesia', 'alquilar', 'el piso', 'la práctica', 'viejo']);
    expect(entries.find((e) => e.note.front === 'alquilar')!.cards).toHaveLength(2);
    expect(entries.find((e) => e.note.id === 'zz-legacy')!.tags).toEqual([]);
  });

  it('status: new → learning → review / due as the cards progress', async () => {
    const { engine, clock, practica } = await seed();
    const id = practica.cards[0]!.id;
    const statusOf = async () => (await entriesOf(engine, clock.t)).find((e) => e.note.id === practica.note.id)!.status;
    expect(await statusOf()).toBe('new');
    await engine.review(id, 'good');
    expect(await statusOf()).toBe('learning');
    clock.t += DAY;
    await engine.review(id, 'good');
    expect(await statusOf()).toBe('review');
    clock.t += 365 * DAY;
    expect(await statusOf()).toBe('due');
  });
});

describe('search', () => {
  it.each([
    ['word', 'piso', ['el piso']],
    ['translation', 'церковь', ['la iglesia']],
    ['example', 'maestro', ['la práctica']],
    ['personal note', 'испании', ['el piso']],
    ['upper case + spaces', '  LA   IGLESIA ', ['la iglesia']],
    ['without accents', 'practica', ['la práctica']],
    ['with accents typed', 'PRÁCTICA', ['la práctica']],
    ['several words, any order', 'maestro práctica', ['la práctica']],
    ['tag text', 'глаголы', ['alquilar']],
  ])('by %s', async (_label, query, expected) => {
    const { engine, clock } = await seed();
    expect(fronts(filterEntries(await entriesOf(engine, clock.t), f({ query }), clock.t))).toEqual(expected);
  });

  it('no match → empty result (the UI shows an explicit empty state)', async () => {
    const { engine, clock } = await seed();
    expect(filterEntries(await entriesOf(engine, clock.t), f({ query: 'xyz' }), clock.t)).toEqual([]);
  });
});

describe('filters', () => {
  it('by one tag and by several tags (all must match)', async () => {
    const { engine, clock } = await seed();
    const entries = await entriesOf(engine, clock.t);
    expect(fronts(filterEntries(entries, f({ tags: ['недвижимость'] }), clock.t))).toEqual(['alquilar', 'el piso']);
    expect(fronts(filterEntries(entries, f({ tags: ['недвижимость', 'глаголы'] }), clock.t))).toEqual(['alquilar']);
    expect(filterEntries(entries, f({ tags: ['церковь', 'глаголы'] }), clock.t)).toEqual([]);
  });

  it('by state: new / learning / due / difficult, combined with search and tags', async () => {
    const { engine, clock, practica, piso, alquilar } = await seed();
    await engine.review(practica.cards[0]!.id, 'good'); // learning
    await engine.review(piso.cards[0]!.id, 'easy'); // review, due in days
    await engine.review(alquilar.cards[0]!.id, 'easy'); // review; reverse sibling still new
    clock.t += 30 * DAY; // piso + alquilar-forward become due
    await engine.review(piso.cards[0]!.id, 'again'); // lapse → relearning
    const entries = await entriesOf(engine, clock.t);
    const by = (status: ListFilter['status'], extra: Partial<ListFilter> = {}) =>
      fronts(filterEntries(entries, f({ status, ...extra }), clock.t));

    expect(by('all')).toEqual(['la iglesia', 'alquilar', 'el piso', 'la práctica']);
    expect(by('new')).toEqual(['la iglesia', 'alquilar']);
    expect(by('learning')).toEqual(['el piso', 'la práctica']);
    expect(by('due')).toEqual(['alquilar', 'la práctica']);
    expect(by('difficult')).toEqual(['el piso']);
    expect(by('new', { tags: ['недвижимость'] })).toEqual(['alquilar']);
    expect(by('learning', { query: 'piso' })).toEqual(['el piso']);
  });

  it('archived notes are hidden everywhere except the archive filter', async () => {
    const { engine, clock, piso } = await seed();
    await engine.archiveNote(piso.note.id);
    const entries = await entriesOf(engine, clock.t);
    expect(by(entries, 'all')).not.toContain('el piso');
    expect(by(entries, 'new')).not.toContain('el piso');
    expect(fronts(filterEntries(entries, f({ query: 'piso' }), clock.t))).toEqual([]);
    expect(by(entries, 'archived')).toEqual(['el piso']);
    expect(fronts(filterEntries(entries, f({ status: 'archived', query: 'piso' }), clock.t))).toEqual(['el piso']);

    function by(list: typeof entries, status: ListFilter['status']) {
      return fronts(filterEntries(list, f({ status }), clock.t));
    }
  });

  it('collectTags counts notes per tag, most used first', async () => {
    const { engine, clock } = await seed();
    expect(collectTags(await entriesOf(engine, clock.t))).toEqual([
      { tag: 'недвижимость', count: 2 },
      { tag: 'глаголы', count: 1 },
      { tag: 'разговорный', count: 1 },
      { tag: 'церковь', count: 1 },
    ]);
  });
});

describe('parseTagInput', () => {
  it('splits on commas/semicolons/new lines and normalizes', () => {
    expect(parseTagInput(' Недвижимость,  разговорный ;; #Глаголы\nнедвижимость, ')).toEqual([
      'недвижимость',
      'разговорный',
      'глаголы',
    ]);
    expect(parseTagInput('   ')).toEqual([]);
  });
});

describe('findDuplicate', () => {
  it('matches the same word + translation regardless of case, spaces and accents', async () => {
    const { engine, clock, practica } = await seed();
    const entries = await entriesOf(engine, clock.t);
    expect(findDuplicate(entries, '  LA PRACTICA ', 'Практика')!.note.id).toBe(practica.note.id);
  });

  it('same word with a different translation is not a duplicate', async () => {
    const { engine, clock } = await seed();
    expect(findDuplicate(await entriesOf(engine, clock.t), 'el piso', 'этаж')).toBeUndefined();
  });

  it('also finds archived notes, and can exclude the note being edited', async () => {
    const { engine, clock, piso } = await seed();
    await engine.archiveNote(piso.note.id);
    const entries = await entriesOf(engine, clock.t);
    expect(findDuplicate(entries, 'el piso', 'квартира')!.archived).toBe(true);
    expect(findDuplicate(entries, 'el piso', 'квартира', piso.note.id)).toBeUndefined();
  });
});
