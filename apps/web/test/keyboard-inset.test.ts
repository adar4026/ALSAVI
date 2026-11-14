import { describe, expect, it } from 'vitest';
import { KEYBOARD_MIN_PX, keyboardInset } from '../src/ui/keyboard-inset';

describe('keyboardInset', () => {
  it('no keyboard: the visual viewport fills the layout viewport', () => {
    expect(keyboardInset({ layoutHeight: 844, visualHeight: 844, visualOffsetTop: 0 })).toBe(0);
  });

  it('iPhone keyboard: the covered height at the bottom', () => {
    // 390 × 844 with a 336 px keyboard.
    expect(keyboardInset({ layoutHeight: 844, visualHeight: 508, visualOffsetTop: 0 })).toBe(336);
  });

  it('the page scrolled under the keyboard does not count as keyboard', () => {
    expect(keyboardInset({ layoutHeight: 844, visualHeight: 508, visualOffsetTop: 120 })).toBe(216);
  });

  it('ignores small differences (browser chrome, zoom rounding)', () => {
    expect(keyboardInset({ layoutHeight: 844, visualHeight: 844 - (KEYBOARD_MIN_PX - 1), visualOffsetTop: 0 })).toBe(0);
    expect(keyboardInset({ layoutHeight: 844, visualHeight: 843.4, visualOffsetTop: 0 })).toBe(0);
  });

  it('never negative', () => {
    expect(keyboardInset({ layoutHeight: 600, visualHeight: 700, visualOffsetTop: 0 })).toBe(0);
  });
});
