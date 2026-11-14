/**
 * Open/close logic of a sheet (TASK_036): a sheet that holds unsaved input
 * asks before closing, one that holds nothing (or keeps a draft by design,
 * like "Новое слово", TASK_033) just closes. Escape, the backdrop, the swipe
 * and "Отмена" all go through `requestClose`. Pure, tested in
 * `sheet-state.test.ts`; `Sheet.tsx` renders it on a native `<dialog>`.
 */

export type SheetPhase = 'closed' | 'open' | 'confirming';
export type CloseReason = 'cancel' | 'escape' | 'backdrop' | 'done';

export interface SheetOptions {
  /** Does the sheet hold input that closing would lose? Asked at close time. */
  hasUnsavedChanges?: () => boolean;
  /**
   * Ask before discarding unsaved input (edit sheets). `false` for sheets
   * whose draft survives closing ("Новое слово").
   */
  confirmDiscard?: boolean;
}

export class SheetController {
  private phase: SheetPhase = 'closed';
  private readonly listeners = new Set<() => void>();
  /** The last close reason (for callers that treat "done" differently). */
  lastReason: CloseReason | null = null;

  constructor(private readonly options: SheetOptions = {}) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getPhase = (): SheetPhase => this.phase;

  open(): void {
    this.lastReason = null;
    this.set('open');
  }

  /**
   * Closing was asked for. Returns the new phase: 'closed', or 'confirming'
   * when unsaved input needs the learner's decision first. "done" (a
   * successful save) never asks.
   */
  requestClose(reason: CloseReason = 'cancel'): SheetPhase {
    if (this.phase === 'closed') return this.phase;
    const unsaved = this.options.hasUnsavedChanges?.() ?? false;
    if (reason !== 'done' && unsaved && this.options.confirmDiscard) {
      this.set('confirming');
      return this.phase;
    }
    this.lastReason = reason;
    this.set('closed');
    return this.phase;
  }

  /** "Отменить изменения": close without saving. */
  discard(): void {
    if (this.phase !== 'confirming') return;
    this.lastReason = 'cancel';
    this.set('closed');
  }

  /** "Продолжить редактирование": back to the open sheet. */
  keepEditing(): void {
    if (this.phase === 'confirming') this.set('open');
  }

  private set(phase: SheetPhase): void {
    if (phase === this.phase) return;
    this.phase = phase;
    for (const l of this.listeners) l();
  }
}
