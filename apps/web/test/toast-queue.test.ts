import { describe, expect, it, vi } from 'vitest';
import {
  durationOf,
  TOAST_DURATION,
  TOAST_DURATION_WITH_ACTION,
  TOAST_MAX_PENDING,
  ToastQueue,
  type ToastTimers,
} from '../src/ui/toast-queue';

/** Manual clock: `advance(ms)` fires due timers in order. */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: ToastTimers = {
    set: (fn, ms) => {
      const id = ++seq;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (h) => void pending.delete(h as number),
    now: () => now,
  };
  return {
    timers,
    pendingCount: () => pending.size,
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        pending.delete(due[0]);
        due[1].fn();
      }
      now = target;
    },
  };
}

describe('ToastQueue', () => {
  it('shows one toast at a time, the rest in order', () => {
    const t = fakeTimers();
    const q = new ToastQueue(t.timers);
    q.show({ message: 'a' });
    q.show({ message: 'b' });
    q.show({ message: 'c' });
    expect(q.getState().current?.message).toBe('a');
    expect(q.getState().pending).toBe(2);
    t.advance(TOAST_DURATION);
    expect(q.getState().current?.message).toBe('b');
    t.advance(TOAST_DURATION);
    expect(q.getState().current?.message).toBe('c');
    t.advance(TOAST_DURATION);
    expect(q.getState().current).toBeNull();
    expect(t.pendingCount()).toBe(0);
  });

  it('a toast with an action stays longer; an explicit duration wins', () => {
    expect(durationOf({ message: 'x' })).toBe(TOAST_DURATION);
    expect(durationOf({ message: 'x', action: { label: 'Вернуть', onAction: () => {} } })).toBe(TOAST_DURATION_WITH_ACTION);
    expect(durationOf({ message: 'x', duration: 1000 })).toBe(1000);

    const t = fakeTimers();
    const q = new ToastQueue(t.timers);
    q.show({ message: 'archived', action: { label: 'Вернуть', onAction: () => {} } });
    t.advance(TOAST_DURATION);
    expect(q.getState().current?.message).toBe('archived');
    t.advance(TOAST_DURATION_WITH_ACTION - TOAST_DURATION);
    expect(q.getState().current).toBeNull();
  });

  it('pause keeps the time left; resume continues from it', () => {
    const t = fakeTimers();
    const q = new ToastQueue(t.timers);
    q.show({ message: 'a' });
    t.advance(3000);
    q.pause();
    expect(q.getState().paused).toBe(true);
    t.advance(60_000); // hovered for a minute: still there
    expect(q.getState().current?.message).toBe('a');
    q.resume();
    t.advance(999);
    expect(q.getState().current?.message).toBe('a');
    t.advance(1);
    expect(q.getState().current).toBeNull();
  });

  it('pause and resume are idempotent and ignored without a toast', () => {
    const t = fakeTimers();
    const q = new ToastQueue(t.timers);
    q.pause();
    q.resume();
    expect(q.getState().current).toBeNull();
    q.show({ message: 'a' });
    q.pause();
    t.advance(1000);
    q.pause();
    q.resume();
    q.resume();
    t.advance(TOAST_DURATION - 1);
    expect(q.getState().current?.message).toBe('a');
    t.advance(1);
    expect(q.getState().current).toBeNull();
  });

  it('act runs the action once and shows the next toast', () => {
    const t = fakeTimers();
    const q = new ToastQueue(t.timers);
    const onAction = vi.fn();
    q.show({ message: 'archived', action: { label: 'Вернуть', onAction } });
    q.show({ message: 'next' });
    q.act();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(q.getState().current?.message).toBe('next');
    q.act(); // "next" has no action: nothing happens
    expect(q.getState().current?.message).toBe('next');
  });

  it('dismiss by id removes a waiting toast without touching the current one', () => {
    const t = fakeTimers();
    const q = new ToastQueue(t.timers);
    q.show({ message: 'a' });
    const b = q.show({ message: 'b' });
    q.show({ message: 'c' });
    q.dismiss(b);
    expect(q.getState().current?.message).toBe('a');
    expect(q.getState().pending).toBe(1);
    q.dismiss();
    expect(q.getState().current?.message).toBe('c');
  });

  it('keeps at most a few waiting toasts — the oldest waiting ones are dropped', () => {
    const t = fakeTimers();
    const q = new ToastQueue(t.timers);
    for (let i = 0; i < TOAST_MAX_PENDING + 3; i++) q.show({ message: String(i) });
    expect(q.getState().current?.message).toBe('0');
    expect(q.getState().pending).toBe(TOAST_MAX_PENDING);
    q.dismiss();
    // Waiting were 1…5, trimmed to the newest three (3, 4, 5).
    expect(q.getState().current?.message).toBe(String(TOAST_MAX_PENDING));
  });

  it('notifies subscribers and clear empties everything', () => {
    const t = fakeTimers();
    const q = new ToastQueue(t.timers);
    const listener = vi.fn();
    const off = q.subscribe(listener);
    q.show({ message: 'a' });
    q.show({ message: 'b' });
    expect(listener).toHaveBeenCalled();
    q.clear();
    expect(q.getState()).toEqual({ current: null, pending: 0, paused: false });
    expect(t.pendingCount()).toBe(0);
    off();
    listener.mockClear();
    q.show({ message: 'c' });
    expect(listener).not.toHaveBeenCalled();
  });
});
