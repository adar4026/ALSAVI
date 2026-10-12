import type { Rating } from '@alsavi/engine';
import type { ReviewFlowController, ReviewFlowState } from './review-flow';

/**
 * Keyboard shortcuts of the study session screen (TASK_022), extracted in
 * TASK_025 so the decision is testable without a DOM. Plain functions, no
 * React; `ReviewSession` binds `handleReviewKeydown` as its one keydown
 * listener.
 */

/** 1..4 → «Не помню / Трудно / Хорошо / Легко». */
export const HOTKEY_RATINGS: readonly Rating[] = ['again', 'hard', 'good', 'easy'];

/** The parts of a `KeyboardEvent` the handler reads — a real event satisfies it; tests pass a plain object. */
export interface HotkeyEvent {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  repeat: boolean;
  target: EventTarget | null;
  preventDefault(): void;
}

export type HotkeyAction = { type: 'reveal' } | { type: 'rate'; rating: Rating };

/**
 * What has keyboard focus, from the shortcuts' point of view:
 * - `field` — a form field: every key belongs to it (typing, choosing an option);
 * - `control` — a button/link-like element: Enter/Space are its native activation;
 * - `none` — the page itself: the screen's shortcuts apply.
 */
export type FocusKind = 'none' | 'control' | 'field';

const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const CONTROL_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option']);

export function focusKind(target: EventTarget | null): FocusKind {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return 'none';
  if (el.isContentEditable || FIELD_TAGS.has(el.tagName)) return 'field';
  if (el.tagName === 'BUTTON' || el.tagName === 'SUMMARY' || (el.tagName === 'A' && el.hasAttribute('href'))) {
    return 'control';
  }
  const role = el.getAttribute('role');
  return role && CONTROL_ROLES.has(role) ? 'control' : 'none';
}

/** Decide what a keydown means on the session screen; `null` = not ours, leave it to the browser. */
export function reviewHotkeyAction(
  e: HotkeyEvent,
  state: Pick<ReviewFlowState, 'status' | 'revealed'>
): HotkeyAction | null {
  // `repeat`: a held key must not reveal and grade the cards that follow.
  if (state.status !== 'active' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return null;
  const focus = focusKind(e.target);
  if (focus === 'field') return null;
  if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
    // On a focused button Enter/Space already activate it natively (a rating
    // button records its own rating, «Показать ответ» reveals). Claiming the
    // key here would cancel that and record «Хорошо» instead.
    if (focus === 'control') return null;
    return state.revealed ? { type: 'rate', rating: 'good' } : { type: 'reveal' };
  }
  if (!state.revealed) return null;
  const idx = ['1', '2', '3', '4'].indexOf(e.key);
  return idx === -1 ? null : { type: 'rate', rating: HOTKEY_RATINGS[idx]! };
}

/**
 * The session screen's single keydown handler (bound on `window` by
 * `ReviewSession`). Claims the key (`preventDefault`) only when it maps to an
 * action, then forwards it to the controller; any other key — including
 * Enter/Space on a focused button — keeps its native browser behavior. One
 * physical press therefore causes at most one action: either this one or the
 * focused control's own, never both, and never the wrong one.
 */
export function handleReviewKeydown(e: HotkeyEvent, controller: ReviewFlowController): HotkeyAction | null {
  const action = reviewHotkeyAction(e, controller.getState());
  if (!action) return null;
  e.preventDefault();
  if (action.type === 'reveal') controller.reveal();
  else void controller.answer(action.rating);
  return action;
}
