import { LearningEngine, MemoryStore, StudySession, type LearningStats } from '@alsavi/engine';
import { describe, expect, it } from 'vitest';
import { buildNoteEntries, EMPTY_FILTER, filterEntries } from '../src/card-list';
import {
  activityDigest,
  activityFor,
  formatDecimal,
  activityLine,
  isStatsEmpty,
  learnedHero,
  percentOf,
  progressSegments,
  queueDetail,
  STAT_DEFINITIONS,
  stagesTotal,
  statsKpis,
  todayLine,
  type Kpi,
  type QueueOverview,
} from '../src/stats-view';

/**
 * The analytics screen (TASK_031): the view model of `StatsScreen` over a
 * real `getLearningStats()` result. Definitions themselves are tested in the
 * Engine (`packages/engine/test/stats.test.ts`); here — what the screen shows.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 12, 15).getTime();

function daysAgo(n: number, h = 12): number {
  return new Date(2026, 9, 12 - n, h).getTime();
}

function makeEngine(clock: { t: number }) {
  let id = 0;
  return new LearningEngine(new MemoryStore(), {
    now: () => clock.t,
    newId: () => `id-${String(id++).padStart(3, '0')}`,
  });
}

function kpi(stats: LearningStats, id: Kpi['id'], queue: QueueOverview | null = null): Kpi {
  return statsKpis(stats, queue).find((k) => k.id === id)!;
}

/** A tiny but complete history: learned, forgotten, new, archived, three study days. */
async function sampleCollection() {
  const clock = { t: daysAgo(9, 9) };
  const engine = makeEngine(clock);
  const hola = await engine.addNote({ front: 'hola', back: 'привет' });
  const casa = await engine.addNote({ front: 'la casa', back: 'дом', directions: ['forward', 'reverse'] });
  const gato = await engine.addNote({ front: 'el gato', back: 'кот' });
  await engine.addNote({ front: 'el perro', back: 'собака' }); // stays new
  const viejo = await engine.addNote({ front: 'viejo', back: 'старый' });

  await engine.review(hola.cards[0]!.id, 'easy'); // → review
  await engine.review(casa.cards[0]!.id, 'easy');
  await engine.review(casa.cards[1]!.id, 'easy');
  await engine.review(gato.cards[0]!.id, 'easy');
  await engine.review(viejo.cards[0]!.id, 'easy');
  clock.t = daysAgo(1, 10);
  await engine.review(gato.cards[0]!.id, 'again'); // forgotten → relearning, one lapse
  clock.t = daysAgo(0, 11);
  await engine.review(gato.cards[0]!.id, 'good');
  await engine.archiveNote(viejo.note.id);
  clock.t = NOW;
  return { engine, clock };
}

describe('empty collection', () => {
  it('is recognised as empty and shows zeros, not invented numbers', async () => {
    const stats = await makeEngine({ t: NOW }).getLearningStats();
    expect(isStatsEmpty(stats)).toBe(true);
    const queue = { newCount: 0, learningCount: 0, reviewCount: 0, total: 0 };
    expect(learnedHero(stats)).toEqual({ learned: 0, percent: null, title: 'Слов пока нет' });
    expect(statsKpis(stats, queue).map((k) => [k.id, k.value, k.detail])).toEqual([
      ['accuracy', '—', 'пока нет ответов'],
      ['streak', '0', 'начнётся с первого ответа'],
      ['queue', '0', 'на сегодня всё'],
    ]);
    expect(progressSegments(stats.cards).map((s) => s.percent)).toEqual([0, 0, 0]);
    expect(activityDigest(stats.activity.last7)).toEqual({ total: 0, activeDays: 0, days: 7, perActiveDay: null });
  });

  it('cards without answers are not "empty": the screen shows their stages', async () => {
    const engine = makeEngine({ t: NOW });
    await engine.addNote({ front: 'uno', back: 'один' });
    const stats = await engine.getLearningStats();
    expect(isStatsEmpty(stats)).toBe(false);
    expect(stagesTotal(stats.cards)).toBe('1 карточка');
  });
});

describe('headline numbers over a real history', () => {
  it('words learned: only active words whose every card is learned', async () => {
    const { engine } = await sampleCollection();
    const stats = await engine.getLearningStats();
    // hola (review) and la casa (both directions in review); el gato was
    // forgotten and is relearning or back in review — check against the card.
    const gato = (await engine.listCardViews()).find((v) => v.front === 'el gato')!.card;
    const learned = 2 + (gato.state === 'review' ? 1 : 0);
    expect(learnedHero(stats)).toEqual({ learned, percent: Math.round((learned / 4) * 100), title: `Изучено ${learned} из 4 слов` });
  });

  it('accuracy: correct answers over every answer, archived history included', async () => {
    const { engine } = await sampleCollection();
    const stats = await engine.getLearningStats();
    // 7 answers, one "again": 6 / 7 = 85.7 % → 86 %.
    expect(kpi(stats, 'accuracy')).toMatchObject({ label: 'Точность', value: '86%', detail: 'верных из 7 ответов' });
    expect((await engine.getStats()).accuracy).toBeCloseTo(6 / 7);
  });

  it('streak: today and yesterday count; the gap before them ends the run', async () => {
    const { engine } = await sampleCollection();
    const k = kpi(await engine.getLearningStats(), 'streak');
    expect(k).toMatchObject({ value: '2', unit: 'дня', detail: 'сегодня засчитан' });
  });

  it('streak: still alive in the morning before the first answer; the record is shown when longer', async () => {
    const clock = { t: daysAgo(3, 9) };
    const engine = makeEngine(clock);
    const { cards } = await engine.addNote({ front: 'uno', back: 'один' });
    for (const n of [3, 2]) {
      clock.t = daysAgo(n, 9);
      await engine.review(cards[0]!.id, 'good');
    }
    clock.t = daysAgo(0, 8);
    await engine.review(cards[0]!.id, 'good'); // today: run of 1 after a gap yesterday
    clock.t = daysAgo(-1, 8); // tomorrow morning, nothing answered yet
    const k = kpi(await engine.getLearningStats(), 'streak');
    expect(k).toMatchObject({ value: '1', unit: 'день', detail: 'сегодня ещё нет ответов · рекорд 2' });
  });

  it('queue: exactly the study session\'s overview — the number on "Главная" (S-1)', async () => {
    const { engine, clock } = await sampleCollection();
    const stats = await engine.getLearningStats();
    for (const limit of [null, 0]) {
      const session = new StudySession(engine, { now: () => clock.t, newCardsPerDay: limit });
      const overview = await session.overview();
      const k = kpi(stats, 'queue', overview);
      expect(k.value).toBe(String(overview.total));
      expect(k.value).toBe(String(await session.dueCount()));
      expect(k.detail).toBe(queueDetail(overview));
    }
    // The daily limit holds back the new card: the queue says so, like "Главная".
    const limited = await new StudySession(engine, { now: () => clock.t, newCardsPerDay: 0 }).overview();
    expect(limited.newCount).toBe(0);
  });

  it('queue: shown as pending until the session\'s daily limit is applied', async () => {
    const { engine } = await sampleCollection();
    expect(kpi(await engine.getLearningStats(), 'queue', null)).toMatchObject({ value: '…', detail: 'считается' });
  });
});

describe('activity: 7 and 30 days', () => {
  it('the toggle picks one of two windows the Engine already computed', async () => {
    const { engine } = await sampleCollection();
    const stats = await engine.getLearningStats();
    expect(activityFor(stats.activity, 7)).toBe(stats.activity.last7);
    expect(activityFor(stats.activity, 30)).toBe(stats.activity.last30);
  });

  it('7 days: the answer nine days ago is outside; days without answers are zeros', async () => {
    const { engine } = await sampleCollection();
    const w = activityFor((await engine.getLearningStats()).activity, 7);
    expect(w.days.map((d) => d.reviews)).toEqual([0, 0, 0, 0, 0, 1, 1]);
    expect(activityDigest(w)).toEqual({ total: 2, activeDays: 2, days: 7, perActiveDay: 1 });
  });

  it('30 days: all three study days, average per study day', async () => {
    const { engine } = await sampleCollection();
    const w = activityFor((await engine.getLearningStats()).activity, 30);
    expect(w.days).toHaveLength(30);
    expect(w.days.filter((d) => d.reviews === 0)).toHaveLength(27);
    const digest = activityDigest(w);
    expect(digest).toEqual({ total: 7, activeDays: 3, days: 30, perActiveDay: 7 / 3 });
    expect(formatDecimal(digest.perActiveDay!)).toBe('2,3');
  });
});

describe('progress by stage', () => {
  it('uses the scheduler states; archived cards are left out', async () => {
    const { engine } = await sampleCollection();
    const stats = await engine.getLearningStats();
    const segments = progressSegments(stats.cards);
    const count = Object.fromEntries(segments.map((s) => [s.key, s.count]));
    expect(count.new).toBe(1);
    expect(count.new! + count.learning! + count.learned!).toBe(5); // viejo is archived
    expect(stats.cards.archived).toBe(1);
    expect(stagesTotal(stats.cards)).toBe('5 карточек · в архиве 1');
  });

  it('percentages always add up to exactly 100', () => {
    const cards = { active: 3, new: 1, learning: 1, dueReview: 0, waiting: 1, archived: 0 };
    expect(progressSegments(cards).map((s) => s.percent)).toEqual([34, 33, 33]);
    const seven = { active: 7, new: 1, learning: 2, dueReview: 1, waiting: 3, archived: 2 };
    const p = progressSegments(seven).map((s) => s.percent);
    expect(p).toEqual([14, 29, 57]);
    expect(p.reduce((a, b) => a + b)).toBe(100);
  });

  it('the total under the stages never says "изучено" (S-2: only words are "изучены")', () => {
    const c = (active: number, archived = 0) => ({ active, new: active, learning: 0, dueReview: 0, waiting: 0, archived });
    expect(stagesTotal(c(1))).toBe('1 карточка');
    expect(stagesTotal(c(5, 2))).toBe('5 карточек · в архиве 2');
    expect(stagesTotal(c(21))).toBe('21 карточка');
  });
});

describe('difficult words → "Карточки"', () => {
  it('the "Трудные" list opened by the button holds exactly the counted words, archived ones excluded', async () => {
    const { engine } = await sampleCollection();
    const stats = await engine.getLearningStats();
    const entries = buildNoteEntries(await engine.listCardViews(), NOW);
    const opened = filterEntries(entries, { ...EMPTY_FILTER, status: 'difficult' }, NOW);
    expect(stats.difficult.total).toBe(1);
    expect(opened.map((e) => e.note.front)).toEqual(stats.difficult.words.map((w) => w.front));
  });
});

describe('formatting', () => {
  it('percentOf never divides by zero', () => {
    expect(percentOf(0, 0)).toBeNull();
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(5, 5)).toBe(100);
  });

  it('formatDecimal keeps at most one decimal with a comma', () => {
    expect(formatDecimal(4)).toBe('4');
    expect(formatDecimal(12.25)).toBe('12,3');
    expect(formatDecimal(1 / 3)).toBe('0,3');
  });

  it('words after "из" agree in number', () => {
    const stats = (active: number) =>
      ({ notes: { active, learned: 0 }, answers: { total: 0, successful: 0 }, streak: { current: 0, longest: 0, reviewedToday: false }, due: { now: 0, later: 0 }, cards: { new: 0 } }) as unknown as LearningStats;
    expect(learnedHero(stats(1)).title).toBe('Изучено 0 из 1 слова');
    expect(learnedHero(stats(3)).title).toBe('Изучено 0 из 3 слов');
    expect(learnedHero(stats(21)).title).toBe('Изучено 0 из 21 слова');
  });
});

describe('TASK_042: lines and definitions', () => {
  it('queue detail names the parts, leaves empty ones out', () => {
    expect(queueDetail({ newCount: 5, learningCount: 4, reviewCount: 3, total: 12 })).toBe('5 новых · 4 изучаются · 3 повторить');
    expect(queueDetail({ newCount: 1, learningCount: 0, reviewCount: 2, total: 3 })).toBe('1 новая · 2 повторить');
    expect(queueDetail({ newCount: 0, learningCount: 0, reviewCount: 0, total: 0 })).toBe('на сегодня всё');
  });

  it('activity line: answers, study days, average per study day', () => {
    expect(activityLine({ total: 40, activeDays: 6, days: 7, perActiveDay: 40 / 6 })).toBe('40 ответов · 6 из 7 дней · 6,7 в день занятий');
    expect(activityLine({ total: 1, activeDays: 1, days: 30, perActiveDay: 1 })).toBe('1 ответ · 1 из 30 дней · 1 в день занятий');
  });

  it('today line only after the first answer of the day', () => {
    expect(todayLine({ reviews: 0, successful: 0, again: 0 })).toBeNull();
    expect(todayLine({ reviews: 23, successful: 20, again: 3 })).toBe('Сегодня 23 ответа · 87% верно');
  });

  it('streak record and today line over the sample history', async () => {
    const { engine } = await sampleCollection();
    const stats = await engine.getLearningStats();
    expect(kpi(stats, 'streak')).toMatchObject({ label: 'Серия' });
    expect(todayLine(stats.today)).toBe('Сегодня 1 ответ · 100% верно');
  });

  it('"Как считается": one definition for every number on the screen, "ты" and no gendered verbs', () => {
    expect(STAT_DEFINITIONS.map((d) => d.term)).toEqual([
      'Изучено слов',
      'Точность',
      'Серия',
      'В очереди',
      'Активность',
      'Карточки по стадиям',
      'Трудные слова',
    ]);
    for (const d of STAT_DEFINITIONS) {
      expect(d.text.length, d.term).toBeGreaterThan(40);
      expect(d.text, d.term).not.toMatch(/(?<!\p{L})(вы|вас|ваш\p{L}*|забыл|забыла|выучил|выучила)(?!\p{L})/iu);
    }
    expect(STAT_DEFINITIONS.find((d) => d.id === 'queue')!.text).toContain('то же число, что на Главной');
    // The check itself catches what it is meant to catch.
    expect('Слова, которые ты забыл').toMatch(/(?<!\p{L})(забыл)(?!\p{L})/iu);
    expect('Слова, которые забылись').not.toMatch(/(?<!\p{L})(забыл)(?!\p{L})/iu);
  });
});
