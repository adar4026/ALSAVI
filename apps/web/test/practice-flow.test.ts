import { LearningEngine, MemoryStore, StudySession, type CardView, type EngineStore } from '@alsavi/engine';
import { describe, expect, it } from 'vitest';
import {
  difficultPracticeCards,
  handlePracticeKeydown,
  loadDifficultPractice,
  PracticeController,
  practiceHotkeyAction,
  shuffle,
  summarize,
} from '../src/practice-flow';
import type { HotkeyEvent } from '../src/review-hotkeys';

/**
 * Difficult-words practice (TASK_032). The decisive property: practising
 * changes nothing the scheduler owns — no review, no card state or due date,
 * no daily-limit count, no queue, no statistics.
 */

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 9, 1, 9).getTime();

/** Methods of `EngineStore` that write. Any call during practice is a failure. */
const WRITES = ['putNote', 'deleteNote', 'putCard', 'deleteCard', 'appendReview', 'replaceAll'];

/** A MemoryStore that records every write call by method name. */
function recordingStore(): { store: EngineStore; writes: string[] } {
  const writes: string[] = [];
  const target = new MemoryStore();
  const store = new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        if (WRITES.includes(String(prop))) writes.push(String(prop));
        return (value as (...a: unknown[]) => unknown).apply(obj, args);
      };
    },
  });
  return { store, writes };
}

/**
 * A real collection: three words forgotten after being learned (one also in
 * reverse), one learned and never forgotten, one new, one difficult but archived.
 */
async function collection() {
  const clock = { t: T0 };
  let id = 0;
  const { store, writes } = recordingStore();
  const engine = new LearningEngine(store, { now: () => clock.t, newId: () => `id-${String(id++).padStart(3, '0')}` });
  const casa = await engine.addNote({ front: 'la casa', back: 'дом', directions: ['forward', 'reverse'], example: 'Mi casa es tu casa.' });
  const gato = await engine.addNote({ front: 'el gato', back: 'кот' });
  const agua = await engine.addNote({ front: 'el agua', back: 'вода' });
  const hola = await engine.addNote({ front: 'hola', back: 'привет' });
  await engine.addNote({ front: 'nuevo', back: 'новый' });
  const viejo = await engine.addNote({ front: 'viejo', back: 'старый' });

  const forgotten = [casa.cards[0]!, casa.cards[1]!, gato.cards[0]!, agua.cards[0]!, viejo.cards[0]!];
  for (const c of [...forgotten, hola.cards[0]!]) await engine.review(c.id, 'easy'); // graduate
  clock.t = T0 + 20 * DAY;
  for (const c of forgotten) await engine.review(c.id, 'again'); // lapse → relearning
  await engine.archiveNote(viejo.note.id);
  clock.t = T0 + 20 * DAY + 3_600_000;
  writes.length = 0;
  return { engine, store, writes, clock };
}

/**
 * Everything the scheduler, the queue and the statistics read. The daily
 * new-card limit is the session's `newCardsPerDay` against
 * `countNewCardsAnsweredSince` (TASK_020) — both are covered here.
 */
async function snapshot(engine: LearningEngine, store: EngineStore, session: StudySession) {
  return {
    cards: await store.listCards(),
    reviews: await store.listReviews(),
    notes: await store.listNotes(),
    newToday: await engine.countNewCardsAnsweredSince(T0 + 20 * DAY - 9 * 3_600_000),
    overview: await session.overview(),
    due: (await engine.getDueCards()).map((c) => c.id),
    stats: await engine.getLearningStats(),
  };
}

/** Runs a whole practice, cycling through the three grades. */
async function practiseAll(controller: PracticeController) {
  await controller.start();
  const grades = ['good', 'hard', 'forgot'] as const;
  let i = 0;
  while (controller.getState().status === 'active') {
    controller.reveal();
    controller.grade(grades[i++ % 3]!);
  }
  return i;
}

describe('which cards are practised', () => {
  it('cards with lapses of active notes only; archived and never-forgotten ones are left out', async () => {
    const { engine } = await collection();
    const cards = difficultPracticeCards(await engine.listCardViews());
    expect(cards.map((v) => v.front).sort()).toEqual(['el agua', 'el gato', 'la casa', 'дом']);
    expect(cards.every((v) => v.card.scheduling.lapses > 0 && v.note.archivedAt === undefined)).toBe(true);
  });

  it('only the forgotten direction of a word is practised', async () => {
    const engine = new LearningEngine(new MemoryStore(), { now: () => T0 });
    const word = await engine.addNote({ front: 'el río', back: 'река', directions: ['forward', 'reverse'] });
    await engine.review(word.cards[0]!.id, 'easy');
    await engine.review(word.cards[1]!.id, 'easy');
    const views = await engine.listCardViews();
    const forward = views.find((v) => v.card.id === word.cards[0]!.id)!;
    const marked = views.map((v) =>
      v === forward ? { ...v, card: { ...v.card, scheduling: { ...v.card.scheduling, lapses: 2 } } } : v
    );
    expect(difficultPracticeCards(marked).map((v) => v.front)).toEqual(['el río']);
  });

  it('loadDifficultPractice reads listCardViews and nothing else of the Engine', async () => {
    const { engine } = await collection();
    const touched: string[] = [];
    // Records what the caller reaches for; the Engine's own internals run unproxied.
    const guarded = new Proxy(engine, {
      get(obj, prop) {
        touched.push(String(prop));
        const value = Reflect.get(obj, prop, obj);
        return typeof value === 'function' ? value.bind(obj) : value;
      },
    });
    const cards = await loadDifficultPractice(guarded);
    expect(cards).toHaveLength(4);
    expect(touched.filter((p) => p !== 'then')).toEqual(['listCardViews']);
  });
});

describe('independence from FSRS and the main queue', () => {
  it('a whole practice writes nothing and changes no schedule, queue, limit or statistic', async () => {
    const { engine, store, writes } = await collection();
    const session = new StudySession(engine, { newCardsPerDay: 1 });
    const before = await snapshot(engine, store, session);

    const controller = new PracticeController(() => loadDifficultPractice(engine));
    expect(await practiseAll(controller)).toBe(4);
    expect(controller.getState().status).toBe('finished');
    await controller.start(); // «Повторить ещё раз»
    await practiseAll(controller);

    expect(writes).toEqual([]);
    expect(await snapshot(engine, store, session)).toEqual(before);
  });

  it('the main session afterwards gets exactly the cards and intervals it would have without practice', async () => {
    const run = async (withPractice: boolean) => {
      const { engine } = await collection();
      if (withPractice) await practiseAll(new PracticeController(() => loadDifficultPractice(engine)));
      const session = new StudySession(engine);
      const shown: Array<[string, number]> = [];
      for (let card = await session.nextCard(); card; card = await session.nextCard()) {
        const result = await session.answer(card.id, 'good');
        shown.push([card.id, result.card.due]);
      }
      return shown;
    };
    const plain = await run(false);
    expect(plain.length).toBeGreaterThan(0);
    expect(await run(true)).toEqual(plain);
  });

  it('the controller is never given the Engine or StudySession — only a loader', () => {
    expect(PracticeController.length).toBe(1); // (loadCards, random = Math.random)
  });
});

describe('practice flow', () => {
  function views(n: number): CardView[] {
    return Array.from({ length: n }, (_, i) => ({
      card: { id: `c${i}`, scheduling: { lapses: 1 } },
      front: `w${i}`,
      back: `t${i}`,
      note: { id: `n${i}`, front: `w${i}`, back: `t${i}`, example: i === 0 ? 'ejemplo' : undefined },
    })) as unknown as CardView[];
  }

  it('front → reveal → grade → next; grading before reveal does nothing', async () => {
    const c = new PracticeController(async () => views(2), () => 0.99);
    await c.start();
    let s = c.getState();
    expect(s).toMatchObject({ status: 'active', revealed: false, context: null, progress: { done: 0, total: 2 } });
    c.grade('good');
    expect(c.getState().progress.done).toBe(0);
    c.reveal();
    s = c.getState();
    expect(s.revealed).toBe(true);
    c.grade('good');
    expect(c.getState()).toMatchObject({ status: 'active', revealed: false, progress: { done: 1, total: 2 } });
  });

  it('the example is shown only after reveal', async () => {
    const c = new PracticeController(async () => views(1));
    await c.start();
    expect(c.getState().context).toBeNull();
    c.reveal();
    expect(c.getState().context).toEqual({ example: 'ejemplo', memo: null });
  });

  it('the summary counts good and struggled answers and lists the struggled words', async () => {
    const c = new PracticeController(async () => views(4), () => 0.99); // 0.99 keeps the order
    await c.start();
    for (const g of ['good', 'forgot', 'hard', 'good'] as const) {
      c.reveal();
      c.grade(g);
    }
    const s = c.getState();
    expect(s.status).toBe('finished');
    expect(s.summary).toMatchObject({ practised: 4, good: 2, struggled: 2, forgot: 1, hard: 1 });
    expect(s.summary!.struggledCards.map((v) => v.front)).toEqual(['w1', 'w2']);
  });

  it('can be finished early; with nothing graded there is no summary', async () => {
    const c = new PracticeController(async () => views(5));
    await c.start();
    expect(c.finish()).toBe(false);
    expect(c.getState().status).toBe('active');
    c.reveal();
    c.grade('hard');
    expect(c.finish()).toBe(true);
    expect(c.getState()).toMatchObject({ status: 'finished', progress: { done: 1, total: 5 } });
    expect(c.getState().summary).toMatchObject({ practised: 1, good: 0, struggled: 1 });
  });

  it('no difficult words → empty; a failed load → error, and a retry works', async () => {
    const empty = new PracticeController(async () => []);
    await empty.start();
    expect(empty.getState().status).toBe('empty');

    let fail = true;
    const flaky = new PracticeController(async () => {
      if (fail) throw new Error('IndexedDB недоступна');
      return views(1);
    });
    await flaky.start();
    expect(flaky.getState()).toMatchObject({ status: 'error', error: 'Не удалось загрузить трудные слова: IndexedDB недоступна' });
    fail = false;
    await flaky.start();
    expect(flaky.getState().status).toBe('active');
  });

  it('a restart reloads the cards, forgets the previous results and shuffles anew', async () => {
    const { engine } = await collection();
    const randoms = [0.1, 0.7, 0.3, 0.9, 0.5, 0.2];
    let k = 0;
    const c = new PracticeController(() => loadDifficultPractice(engine), () => randoms[k++ % randoms.length]!);
    await c.start();
    const order = (): string[] => {
      const seen: string[] = [];
      while (c.getState().status === 'active') {
        seen.push(c.getState().current!.card.id);
        c.reveal();
        c.grade('good');
      }
      return seen;
    };
    const first = order();
    const gato = (await engine.listCardViews()).find((v) => v.front === 'el gato')!;
    await engine.archiveNote(gato.note.id); // archived between two rounds
    await c.start();
    expect(c.getState().progress).toEqual({ done: 0, total: 3 });
    const second = order();
    expect(second).not.toContain(gato.card.id);
    expect(second).not.toEqual(first.filter((id) => id !== gato.card.id));
  });

  it('a slow load of a superseded start never replaces the newer one', async () => {
    let release!: (v: CardView[]) => void;
    let calls = 0;
    const c = new PracticeController(() => {
      calls += 1;
      return calls === 1 ? new Promise<CardView[]>((r) => (release = r)) : Promise.resolve(views(1));
    });
    const slow = c.start();
    await c.start();
    release(views(3));
    await slow;
    expect(c.getState().progress.total).toBe(1);
  });
});

describe('shuffle and summarize', () => {
  it('shuffle returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, () => 0);
    expect(out).toEqual([2, 3, 4, 5, 1]);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect([...shuffle(input)].sort()).toEqual(input);
    expect(shuffle(input, () => 0.999)).toEqual(input);
  });

  it('summarize of nothing is all zeros', () => {
    expect(summarize([])).toEqual({ practised: 0, good: 0, struggled: 0, forgot: 0, hard: 0, struggledCards: [] });
  });
});

describe('keyboard', () => {
  const BODY = { tagName: 'BODY', isContentEditable: false, getAttribute: () => null, hasAttribute: () => false };
  const BUTTON = { ...BODY, tagName: 'BUTTON' };
  const INPUT = { ...BODY, tagName: 'INPUT' };
  function key(k: string, extra: Partial<HotkeyEvent> = {}): HotkeyEvent & { prevented: boolean } {
    const e = {
      key: k,
      code: k === ' ' ? 'Space' : `Key${k}`,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      repeat: false,
      target: BODY as unknown as EventTarget,
      prevented: false,
      preventDefault() {
        e.prevented = true;
      },
      ...extra,
    };
    return e;
  }
  const active = { status: 'active' as const, revealed: false };
  const revealed = { status: 'active' as const, revealed: true };

  it('Space/Enter reveal, then mean «Помню»; 1–3 grade only after reveal', () => {
    expect(practiceHotkeyAction(key(' '), active)).toEqual({ type: 'reveal' });
    expect(practiceHotkeyAction(key('Enter'), active)).toEqual({ type: 'reveal' });
    expect(practiceHotkeyAction(key('1'), active)).toBeNull();
    expect(practiceHotkeyAction(key(' '), revealed)).toEqual({ type: 'grade', grade: 'good' });
    expect(practiceHotkeyAction(key('1'), revealed)).toEqual({ type: 'grade', grade: 'forgot' });
    expect(practiceHotkeyAction(key('2'), revealed)).toEqual({ type: 'grade', grade: 'hard' });
    expect(practiceHotkeyAction(key('3'), revealed)).toEqual({ type: 'grade', grade: 'good' });
    expect(practiceHotkeyAction(key('4'), revealed)).toBeNull();
  });

  it('leaves held keys, modifiers, form fields, focused buttons and other screens alone', () => {
    expect(practiceHotkeyAction(key(' ', { repeat: true }), active)).toBeNull();
    expect(practiceHotkeyAction(key('1', { metaKey: true }), revealed)).toBeNull();
    expect(practiceHotkeyAction(key(' ', { target: INPUT as unknown as EventTarget }), active)).toBeNull();
    expect(practiceHotkeyAction(key(' ', { target: BUTTON as unknown as EventTarget }), active)).toBeNull();
    expect(practiceHotkeyAction(key('2', { target: BUTTON as unknown as EventTarget }), revealed)).toEqual({
      type: 'grade',
      grade: 'hard',
    });
    expect(practiceHotkeyAction(key(' '), { status: 'finished', revealed: false })).toBeNull();
  });

  it('the handler claims only keys it acts on', async () => {
    const c = new PracticeController(async () => [
      { card: { id: 'c', scheduling: { lapses: 1 } }, front: 'f', back: 'b', note: { id: 'n', front: 'f', back: 'b' } } as unknown as CardView,
    ]);
    await c.start();
    const other = key('x');
    expect(handlePracticeKeydown(other, c)).toBeNull();
    expect(other.prevented).toBe(false);
    const space = key(' ');
    handlePracticeKeydown(space, c);
    expect(space.prevented).toBe(true);
    expect(c.getState().revealed).toBe(true);
    handlePracticeKeydown(key('1'), c);
    expect(c.getState().status).toBe('finished');
    expect(c.getState().summary).toMatchObject({ forgot: 1 });
  });
});

describe('«Повторить слова с ошибками» (TASK_033)', () => {
  /** Grades the round by front word; any word not listed gets «Помню». */
  async function gradeRound(controller: PracticeController, grades: Record<string, 'good' | 'hard' | 'forgot'>) {
    while (controller.getState().status === 'active') {
      const front = controller.getState().current!.front;
      controller.reveal();
      controller.grade(grades[front] ?? 'good');
    }
  }

  it('a new round of only the cards graded «Не помню» or «С трудом», reshuffled', async () => {
    const { engine } = await collection();
    const controller = new PracticeController(() => loadDifficultPractice(engine));
    await controller.start();
    await gradeRound(controller, { 'el gato': 'forgot', дом: 'hard' });
    expect(controller.getState().summary!.struggled).toBe(2);

    await controller.retryStruggled();
    const fronts: string[] = [];
    while (controller.getState().status === 'active') {
      fronts.push(controller.getState().current!.front);
      controller.reveal();
      controller.grade('good');
    }
    expect(fronts.sort()).toEqual(['el gato', 'дом']);
    expect(controller.getState().summary).toMatchObject({ practised: 2, good: 2, struggled: 0 });
  });

  it('writes nothing and changes no schedule, queue, limit or statistic', async () => {
    const { engine, store, writes } = await collection();
    const session = new StudySession(engine, { newCardsPerDay: 1 });
    const before = await snapshot(engine, store, session);
    const controller = new PracticeController(() => loadDifficultPractice(engine));
    await controller.start();
    await gradeRound(controller, { 'el gato': 'forgot', 'el agua': 'hard' });
    await controller.retryStruggled();
    await gradeRound(controller, { 'el gato': 'forgot' });
    await controller.retryStruggled();
    await gradeRound(controller, {});
    expect(writes).toEqual([]);
    expect(await snapshot(engine, store, session)).toEqual(before);
  });

  it('a word archived since the round drops out of the retry', async () => {
    const { engine } = await collection();
    const controller = new PracticeController(() => loadDifficultPractice(engine));
    await controller.start();
    await gradeRound(controller, { 'el gato': 'forgot', 'el agua': 'forgot' });
    const agua = (await engine.listCardViews()).find((v) => v.front === 'el agua')!;
    await engine.archiveNote(agua.note.id);
    await controller.retryStruggled();
    expect(controller.getState().progress.total).toBe(1);
    expect(controller.getState().current!.front).toBe('el gato');
  });

  it('works after an early finish too; without errors, or before a round ends, it does nothing', async () => {
    const { engine } = await collection();
    const controller = new PracticeController(() => loadDifficultPractice(engine));
    await controller.start();
    await controller.retryStruggled(); // mid-round: ignored
    expect(controller.getState()).toMatchObject({ status: 'active', progress: { done: 0, total: 4 } });

    const first = controller.getState().current!;
    controller.reveal();
    controller.grade('hard');
    controller.finish();
    await controller.retryStruggled();
    expect(controller.getState()).toMatchObject({ status: 'active', progress: { done: 0, total: 1 } });
    expect(controller.getState().current!.card.id).toBe(first.card.id);

    controller.reveal();
    controller.grade('good');
    expect(controller.getState().summary!.struggled).toBe(0);
    await controller.retryStruggled(); // no errors: stays on the summary
    expect(controller.getState().status).toBe('finished');
  });
});
