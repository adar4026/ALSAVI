import { describe, expect, it } from 'vitest';
import { createUpdateSignal, watchForUpdates } from '../src/registerSW';

/**
 * Keeping an open app current (TASK_033): an update check whenever the app
 * returns to the foreground, and a signal — not a forced reload — once a new
 * version has taken over the page.
 */

function fakes(controller: unknown) {
  const listeners: Record<string, Array<() => void>> = {};
  const on = (type: string, fn: () => void) => (listeners[type] ??= []).push(fn);
  const fire = (type: string) => listeners[type]?.forEach((fn) => fn());
  const doc = { visibilityState: 'visible', addEventListener: on };
  let updates = 0;
  let failUpdate = false;
  const registration = {
    update: () => {
      updates += 1;
      return failUpdate ? Promise.reject(new Error('offline')) : Promise.resolve();
    },
  };
  return {
    container: { controller, addEventListener: on },
    registration,
    doc,
    fire,
    updates: () => updates,
    setFailUpdate: (v: boolean) => (failUpdate = v),
  };
}

describe('watchForUpdates', () => {
  it('checks for a new version each time the app comes back, not while it is hidden', () => {
    const f = fakes({});
    watchForUpdates(f.container, f.registration, f.doc, () => {});
    f.doc.visibilityState = 'hidden';
    f.fire('visibilitychange');
    expect(f.updates()).toBe(0);
    f.doc.visibilityState = 'visible';
    f.fire('visibilitychange');
    f.fire('visibilitychange');
    expect(f.updates()).toBe(2);
  });

  it('a failed check (offline) is harmless', async () => {
    const f = fakes({});
    watchForUpdates(f.container, f.registration, f.doc, () => {});
    f.setFailUpdate(true);
    f.fire('visibilitychange');
    await new Promise((r) => setTimeout(r, 0)); // an unhandled rejection would fail the run
    expect(f.updates()).toBe(1);
  });

  it('reports an update when a new worker takes over a page that already had one', () => {
    const f = fakes({ scriptURL: 'sw.js' });
    let ready = 0;
    watchForUpdates(f.container, f.registration, f.doc, () => (ready += 1));
    f.fire('controllerchange');
    expect(ready).toBe(1);
  });

  it('the very first install (no controller yet) is not an update', () => {
    const f = fakes(null);
    let ready = 0;
    watchForUpdates(f.container, f.registration, f.doc, () => (ready += 1));
    f.fire('controllerchange');
    expect(ready).toBe(0);
  });
});

describe('createUpdateSignal', () => {
  it('starts not ready and notifies subscribers once', () => {
    const signal = createUpdateSignal();
    let calls = 0;
    signal.subscribe(() => (calls += 1));
    expect(signal.isReady()).toBe(false);
    signal.markReady();
    signal.markReady();
    expect(signal.isReady()).toBe(true);
    expect(calls).toBe(1);
  });

  it('an unsubscribed listener is not called', () => {
    const signal = createUpdateSignal();
    let calls = 0;
    const off = signal.subscribe(() => (calls += 1));
    off();
    signal.markReady();
    expect(calls).toBe(0);
  });
});
