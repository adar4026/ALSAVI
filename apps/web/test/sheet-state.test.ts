import { describe, expect, it, vi } from 'vitest';
import { SheetController } from '../src/ui/sheet-state';

describe('SheetController', () => {
  it('opens and closes; closing a closed sheet is a no-op', () => {
    const s = new SheetController();
    expect(s.getPhase()).toBe('closed');
    expect(s.requestClose()).toBe('closed');
    s.open();
    expect(s.getPhase()).toBe('open');
    expect(s.requestClose('escape')).toBe('closed');
    expect(s.lastReason).toBe('escape');
  });

  it('nothing unsaved: every way of closing just closes', () => {
    for (const reason of ['cancel', 'escape', 'backdrop', 'done'] as const) {
      const s = new SheetController({ hasUnsavedChanges: () => false, confirmDiscard: true });
      s.open();
      expect(s.requestClose(reason)).toBe('closed');
    }
  });

  it('unsaved edit: cancel/escape/backdrop ask first; discard closes, keep editing returns', () => {
    for (const reason of ['cancel', 'escape', 'backdrop'] as const) {
      const s = new SheetController({ hasUnsavedChanges: () => true, confirmDiscard: true });
      s.open();
      expect(s.requestClose(reason)).toBe('confirming');
      s.keepEditing();
      expect(s.getPhase()).toBe('open');
      expect(s.requestClose(reason)).toBe('confirming');
      s.discard();
      expect(s.getPhase()).toBe('closed');
      expect(s.lastReason).toBe('cancel');
    }
  });

  it('a successful save ("done") never asks', () => {
    const s = new SheetController({ hasUnsavedChanges: () => true, confirmDiscard: true });
    s.open();
    expect(s.requestClose('done')).toBe('closed');
    expect(s.lastReason).toBe('done');
  });

  it('a draft-keeping sheet ("Новое слово", TASK_033) closes without asking', () => {
    const s = new SheetController({ hasUnsavedChanges: () => true, confirmDiscard: false });
    s.open();
    expect(s.requestClose('backdrop')).toBe('closed');
  });

  it('reads unsaved state at close time, not at construction', () => {
    let dirty = false;
    const s = new SheetController({ hasUnsavedChanges: () => dirty, confirmDiscard: true });
    s.open();
    dirty = true;
    expect(s.requestClose()).toBe('confirming');
  });

  it('discard and keepEditing do nothing outside the confirmation', () => {
    const s = new SheetController();
    s.open();
    s.discard();
    expect(s.getPhase()).toBe('open');
    s.requestClose();
    s.keepEditing();
    expect(s.getPhase()).toBe('closed');
  });

  it('notifies on phase changes only', () => {
    const s = new SheetController();
    const l = vi.fn();
    s.subscribe(l);
    s.open();
    s.open();
    s.requestClose();
    expect(l).toHaveBeenCalledTimes(2);
  });
});
