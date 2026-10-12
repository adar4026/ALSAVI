import { LearningEngine, MemoryStore, StudySession, type Rating } from '@alsavi/engine';
import { describe, expect, it } from 'vitest';
import { ReviewFlowController } from '../src/review-flow.js';
import { handleReviewKeydown, reviewHotkeyAction, type HotkeyEvent } from '../src/review-hotkeys.js';

/**
 * Keyboard handling of the session screen (TASK_025). Tests run in Node (no
 * DOM, no React Testing Library — see TASK_020/TASK_022), so a key press is
 * modelled the way a browser dispatches it: the keydown reaches the focused
 * element and bubbles to the window-level handler; afterwards, unless the
 * handler cancelled it, the browser runs the focused control's native
 * activation (Enter/Space on a button = its click). A rating button's
 * activation is exactly what `ReviewSession` wires to its onClick:
 * `controller.answer(rating)`.
 */

const T0 = new Date('2026-10-12T10:00:00Z').getTime();
const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

interface FakeElement {
  tagName: string;
  isContentEditable: boolean;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  /** The control's native activation (click), if it has one. */
  activate?: () => void;
}

function el(tagName: string, attrs: Record<string, string> = {}, extra: Partial<FakeElement> = {}): FakeElement {
  return {
    tagName,
    isContentEditable: false,
    getAttribute: (name) => attrs[name] ?? null,
    hasAttribute: (name) => name in attrs,
    ...extra,
  };
}

const BODY = el('BODY');

async function setup(words = 3) {
  let seq = 0;
  const store = new MemoryStore();
  const engine = new LearningEngine(store, { now: () => T0, newId: () => `id-${String(seq++).padStart(3, '0')}` });
  for (let i = 0; i < words; i++) await engine.addCard({ front: `w${i}`, back: `t${i}` });
  const controller = new ReviewFlowController(engine, new StudySession(engine, { now: () => T0 }));
  await controller.start();
  const allReviews = async () => (await store.listReviews()).map((r) => `${r.cardId}:${r.rating}`);
  return { store, engine, controller, allReviews };
}

/** A rating button as `ReviewSession` renders it. */
function ratingButton(controller: ReviewFlowController, rating: Rating): FakeElement {
  return el('BUTTON', {}, { activate: () => void controller.answer(rating) });
}

/** Let the in-flight save (all MemoryStore promises) finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const CODES: Record<string, string> = { ' ': 'Space', Enter: 'Enter' };

/** One physical key press: keydown → window handler → (if not cancelled) native activation of the focused control. */
async function press(
  controller: ReviewFlowController,
  key: string,
  focused: FakeElement = BODY,
  extra: Partial<HotkeyEvent> = {}
): Promise<{ prevented: boolean }> {
  let prevented = false;
  const event: HotkeyEvent = {
    key,
    code: CODES[key] ?? `Digit${key}`,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
    target: focused as unknown as EventTarget,
    preventDefault: () => {
      prevented = true;
    },
    ...extra,
  };
  handleReviewKeydown(event, controller);
  if (!prevented && focused.activate && (key === 'Enter' || key === ' ')) focused.activate();
  await settle();
  return { prevented };
}

describe('review hotkeys — Enter/Space on a focused rating button (TASK_025)', () => {
  it.each(RATINGS.flatMap((rating) => [['Enter', rating] as const, [' ', rating] as const]))(
    '%j on the focused «%s» button records exactly that rating, once',
    async (key, rating) => {
      const { controller, allReviews } = await setup();
      const cardId = controller.getState().current!.card.id;
      controller.reveal();

      const { prevented } = await press(controller, key, ratingButton(controller, rating));

      expect(prevented).toBe(false); // the browser's own activation goes through
      expect(await allReviews()).toEqual([`${cardId}:${rating}`]);
      expect(controller.getState().revealed).toBe(false); // moved on to the next card, unrevealed
    }
  );

  it('Enter/Space on the focused «Показать ответ» button just reveals — no rating', async () => {
    for (const key of ['Enter', ' ']) {
      const { controller, allReviews } = await setup();
      const showAnswer = el('BUTTON', {}, { activate: () => controller.reveal() });

      const { prevented } = await press(controller, key, showAnswer);

      expect(prevented).toBe(false);
      expect(controller.getState().revealed).toBe(true);
      expect(await allReviews()).toEqual([]);
    }
  });

  it('Enter/Space on any other focused control (nav tab, link, summary, role=button) is left to the browser', async () => {
    const { controller, allReviews } = await setup();
    const controls = [el('BUTTON'), el('A', { href: '#' }), el('SUMMARY'), el('DIV', { role: 'button' })];
    for (const revealed of [false, true]) {
      if (revealed) controller.reveal();
      for (const control of controls) {
        for (const key of ['Enter', ' ']) {
          expect((await press(controller, key, control)).prevented).toBe(false);
        }
      }
      expect(controller.getState().revealed).toBe(revealed);
    }
    expect(await allReviews()).toEqual([]);
  });

  it('a digit while a rating button is focused is an explicit choice and wins (no native conflict)', async () => {
    const { controller, allReviews } = await setup();
    const cardId = controller.getState().current!.card.id;
    controller.reveal();

    const { prevented } = await press(controller, '4', ratingButton(controller, 'hard'));

    expect(prevented).toBe(true);
    expect(await allReviews()).toEqual([`${cardId}:easy`]);
  });
});

describe('review hotkeys — global shortcuts with no control focused (unchanged)', () => {
  it.each(['Enter', ' '])('%j reveals the answer, then grades «Хорошо»', async (key) => {
    const { controller, allReviews } = await setup();
    const cardId = controller.getState().current!.card.id;

    expect((await press(controller, key)).prevented).toBe(true);
    expect(controller.getState().revealed).toBe(true);
    expect(await allReviews()).toEqual([]);

    expect((await press(controller, key)).prevented).toBe(true);
    expect(await allReviews()).toEqual([`${cardId}:good`]);
  });

  it.each(RATINGS.map((rating, i) => [String(i + 1), rating] as const))(
    'key %s grades «%s» after reveal',
    async (key, rating) => {
      const { controller, allReviews } = await setup();
      const cardId = controller.getState().current!.card.id;
      controller.reveal();

      expect((await press(controller, key)).prevented).toBe(true);
      expect(await allReviews()).toEqual([`${cardId}:${rating}`]);
    }
  );

  it('digits do nothing before the answer is revealed', async () => {
    const { controller, allReviews } = await setup();
    for (const key of ['1', '2', '3', '4']) {
      expect((await press(controller, key)).prevented).toBe(false);
    }
    expect(controller.getState().revealed).toBe(false);
    expect(await allReviews()).toEqual([]);
  });

  it('shortcuts with Cmd/Ctrl/Alt are left alone', async () => {
    const { controller, allReviews } = await setup();
    controller.reveal();
    for (const mod of ['metaKey', 'ctrlKey', 'altKey'] as const) {
      for (const key of ['Enter', ' ', '1']) {
        expect((await press(controller, key, BODY, { [mod]: true })).prevented).toBe(false);
      }
    }
    expect(await allReviews()).toEqual([]);
  });

  it('nothing happens outside an active card (loading, finished)', async () => {
    const { controller } = await setup(0);
    expect(controller.getState().status).toBe('empty');
    const fresh = { key: 'Enter', code: 'Enter', metaKey: false, ctrlKey: false, altKey: false, repeat: false };
    const target = BODY as unknown as EventTarget;
    const noop = () => {};
    for (const status of ['loading', 'saving', 'empty', 'finished'] as const) {
      expect(reviewHotkeyAction({ ...fresh, target, preventDefault: noop }, { status, revealed: true })).toBeNull();
    }
  });
});

describe('review hotkeys — typing in a form field never studies (TASK_025)', () => {
  const fields = [
    ['input', el('INPUT', { type: 'text' })],
    ['textarea', el('TEXTAREA')],
    ['select', el('SELECT')],
    ['contenteditable', el('DIV', { contenteditable: 'true' }, { isContentEditable: true })],
  ] as const;

  it.each(fields)('%s: Space, Enter and 1..4 are ignored', async (_label, field) => {
    const { controller, allReviews } = await setup();
    for (const revealed of [false, true]) {
      if (revealed) controller.reveal();
      for (const key of [' ', 'Enter', '1', '2', '3', '4']) {
        expect((await press(controller, key, field)).prevented).toBe(false);
      }
      expect(controller.getState().revealed).toBe(revealed);
    }
    expect(await allReviews()).toEqual([]);
  });
});

describe('review hotkeys — one key press, at most one review (TASK_025)', () => {
  it('a held key (auto-repeat) does not reveal and grade the following cards', async () => {
    const { controller, allReviews } = await setup();
    const first = controller.getState().current!.card.id;

    await press(controller, 'Enter'); // reveal
    await press(controller, 'Enter'); // «Хорошо» → next card
    for (let i = 0; i < 5; i++) {
      expect((await press(controller, 'Enter', BODY, { repeat: true })).prevented).toBe(false);
    }

    expect(await allReviews()).toEqual([`${first}:good`]);
    expect(controller.getState().current!.card.id).not.toBe(first);
    expect(controller.getState().revealed).toBe(false);
  });

  it('pressing Enter twice on a focused button while the first save is in flight records one review', async () => {
    const { controller, allReviews } = await setup();
    const cardId = controller.getState().current!.card.id;
    controller.reveal();
    const hard = ratingButton(controller, 'hard');

    // Both presses land before the save resolves (no settle in between).
    for (let i = 0; i < 2; i++) {
      const event: HotkeyEvent = {
        key: 'Enter', code: 'Enter', metaKey: false, ctrlKey: false, altKey: false, repeat: false,
        target: hard as unknown as EventTarget,
        preventDefault: () => {
          throw new Error('must not cancel the native activation');
        },
      };
      handleReviewKeydown(event, controller);
      hard.activate!();
    }
    await settle();

    expect(await allReviews()).toEqual([`${cardId}:hard`]);
  });

  it('a full session by keyboard on focused buttons records exactly one review per press', async () => {
    const { controller, allReviews } = await setup(4);
    const expected: string[] = [];
    for (const rating of ['hard', 'again', 'easy', 'good'] as const) {
      const cardId = controller.getState().current!.card.id;
      await press(controller, ' '); // reveal from the page
      await press(controller, 'Enter', ratingButton(controller, rating));
      expected.push(`${cardId}:${rating}`);
      expect(await allReviews()).toEqual(expected);
    }
  });
});
