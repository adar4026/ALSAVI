/**
 * Registers the app-shell service worker (TASK_015) and reports when a newer
 * version has taken over the open page (TASK_033).
 *
 * Only in production builds: during `vite dev` the SW would shadow HMR and serve
 * stale modules. For on-device offline/install testing, use a production build
 * (`vite build` + `vite preview`) over HTTPS — see apps/web/README.md.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    // BASE_URL is Vite's resolved `base` ('/' in dev, '/ALSAVI/' in production
    // — see vite.config.ts). Registering relative to it, rather than the
    // hardcoded origin root, is required for a GitHub Pages project-site
    // subpath deploy and gives the worker the matching default scope.
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => watchForUpdates(navigator.serviceWorker, registration, document, appUpdate.markReady))
      .catch(() => {
        // Offline start is best-effort; failing to register must not break the app.
      });
  });
}

/** The parts of the browser APIs `watchForUpdates` uses — injectable for tests. */
export interface UpdateContainer {
  readonly controller: unknown;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}
export interface UpdateRegistration {
  update(): Promise<unknown>;
}
export interface UpdateDocument {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * Keeps an open app current (TASK_033).
 *
 * - **Check on return.** The browser looks for a new `sw.js` only on a
 *   navigation, but an installed iPhone app is usually resumed, not
 *   reloaded — it could sit on an old version for days. So every time the
 *   app comes back to the foreground, ask for an update check.
 * - **Report, don't reload.** The new worker installs and takes control on
 *   its own (`skipWaiting` + `clients.claim` in `sw.js`); the open page keeps
 *   running its already-loaded code, which stays fully functional. Reloading
 *   by itself could throw away a half-typed card or an unfinished practice,
 *   so `onUpdateReady` only tells the UI, which offers «Обновить».
 *   A first install (no controller when the page loaded) is not an update.
 */
export function watchForUpdates(
  container: UpdateContainer,
  registration: UpdateRegistration,
  doc: UpdateDocument,
  onUpdateReady: () => void
): void {
  const hadController = Boolean(container.controller);
  container.addEventListener('controllerchange', () => {
    if (hadController) onUpdateReady();
  });
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState !== 'visible') return;
    registration.update().catch(() => {
      // Offline or the server is unreachable: try again on the next return.
    });
  });
}

/**
 * "A newer version is running the page" flag, readable from React with
 * `useSyncExternalStore(appUpdate.subscribe, appUpdate.isReady)`.
 */
export function createUpdateSignal() {
  let ready = false;
  const listeners = new Set<() => void>();
  return {
    isReady: (): boolean => ready,
    markReady: (): void => {
      if (ready) return;
      ready = true;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const appUpdate = createUpdateSignal();
