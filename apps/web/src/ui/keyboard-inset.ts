/**
 * How much of the layout viewport the on-screen keyboard covers (TASK_040).
 *
 * iOS Safari keeps fixed elements and modal dialogs in the *layout* viewport
 * when the keyboard opens; only the *visual* viewport shrinks. Anything pinned
 * to the bottom (the sheet's "Добавить" button) would end up behind the
 * keyboard. The covered height is what the layout viewport has below the
 * visible area: innerHeight − (visualViewport.offsetTop + visualViewport.height).
 * Small differences (browser chrome, rounding) are ignored so the sheet does
 * not jitter. Pure; tested in `keyboard-inset.test.ts`, applied by `Sheet`.
 */
export interface ViewportMetrics {
  /** `window.innerHeight` — the layout viewport. */
  layoutHeight: number;
  /** `visualViewport.height`. */
  visualHeight: number;
  /** `visualViewport.offsetTop` (the page scrolled under the keyboard). */
  visualOffsetTop: number;
}

/** Below this, a difference is browser chrome or rounding, not a keyboard. */
export const KEYBOARD_MIN_PX = 80;

export function keyboardInset({ layoutHeight, visualHeight, visualOffsetTop }: ViewportMetrics): number {
  const covered = Math.round(layoutHeight - (visualOffsetTop + visualHeight));
  return covered >= KEYBOARD_MIN_PX ? covered : 0;
}
