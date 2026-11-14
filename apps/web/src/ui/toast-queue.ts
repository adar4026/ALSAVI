/**
 * Toast queue (TASK_036, COMPONENT_LIBRARY §5): one toast on screen at a time,
 * the rest wait in order. A toast hides itself after 4 s (6 s with an action);
 * the timer pauses while the toast is hovered or focused and resumes with the
 * time that was left. Pure TypeScript with injectable timers — tested in
 * `toast-queue.test.ts`; `Toast.tsx` only renders the state.
 */

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastInput {
  message: string;
  action?: ToastAction;
  /** ms; default 4000, or 6000 with an action. */
  duration?: number;
}

export interface ToastItem extends ToastInput {
  id: number;
}

export interface ToastState {
  current: ToastItem | null;
  /** Toasts waiting for their turn. */
  pending: number;
  paused: boolean;
}

export interface ToastTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
  now(): number;
}

export const TOAST_DURATION = 4000;
export const TOAST_DURATION_WITH_ACTION = 6000;
/** Older waiting toasts are dropped beyond this many — the screen never lags behind. */
export const TOAST_MAX_PENDING = 3;

const browserTimers: ToastTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export function durationOf(input: ToastInput): number {
  return input.duration ?? (input.action ? TOAST_DURATION_WITH_ACTION : TOAST_DURATION);
}

export class ToastQueue {
  private state: ToastState = { current: null, pending: 0, paused: false };
  private readonly waiting: ToastItem[] = [];
  private readonly listeners = new Set<() => void>();
  private nextId = 1;
  private handle: unknown = null;
  /** When the running timer started, and how much time the current toast has left. */
  private startedAt = 0;
  private remaining = 0;

  constructor(private readonly timers: ToastTimers = browserTimers) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): ToastState => this.state;

  /** Queue a toast; returns its id. */
  show(input: ToastInput): number {
    const item: ToastItem = { ...input, id: this.nextId++ };
    if (!this.state.current) {
      this.display(item);
    } else {
      this.waiting.push(item);
      while (this.waiting.length > TOAST_MAX_PENDING) this.waiting.shift();
      this.set({ pending: this.waiting.length });
    }
    return item.id;
  }

  /** Hide the current toast (or the given one) and show the next. */
  dismiss(id?: number): void {
    const current = this.state.current;
    if (!current) return;
    if (id !== undefined && id !== current.id) {
      const i = this.waiting.findIndex((t) => t.id === id);
      if (i >= 0) {
        this.waiting.splice(i, 1);
        this.set({ pending: this.waiting.length });
      }
      return;
    }
    this.stopTimer();
    const next = this.waiting.shift();
    if (next) this.display(next);
    else this.set({ current: null, pending: 0, paused: false });
  }

  /** Run the current toast's action, then hide it. */
  act(): void {
    const current = this.state.current;
    if (!current?.action) return;
    current.action.onAction();
    this.dismiss(current.id);
  }

  /** Hover/focus: stop the countdown, keeping the time left. */
  pause(): void {
    if (!this.state.current || this.state.paused) return;
    this.remaining = Math.max(0, this.remaining - (this.timers.now() - this.startedAt));
    this.stopTimer();
    this.set({ paused: true });
  }

  resume(): void {
    if (!this.state.current || !this.state.paused) return;
    this.set({ paused: false });
    this.startTimer();
  }

  /** Drop everything (e.g. leaving the screen the toasts were about). */
  clear(): void {
    this.stopTimer();
    this.waiting.length = 0;
    this.set({ current: null, pending: 0, paused: false });
  }

  private display(item: ToastItem): void {
    this.remaining = durationOf(item);
    this.set({ current: item, pending: this.waiting.length, paused: false });
    this.startTimer();
  }

  private startTimer(): void {
    this.stopTimer();
    const id = this.state.current?.id;
    this.startedAt = this.timers.now();
    this.handle = this.timers.set(() => {
      this.handle = null;
      this.dismiss(id);
    }, this.remaining);
  }

  private stopTimer(): void {
    if (this.handle !== null) this.timers.clear(this.handle);
    this.handle = null;
  }

  private set(patch: Partial<ToastState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}

/** The app's single queue. */
export const toasts = new ToastQueue();
