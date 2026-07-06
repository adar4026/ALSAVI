/**
 * Registers the app-shell service worker (TASK_015).
 *
 * Only in production builds: during `vite dev` the SW would shadow HMR and serve
 * stale modules. For on-device offline/install testing, use a production build
 * (`vite build` + `vite preview`) over HTTPS — see apps/web/README.md.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline start is best-effort; failing to register must not break the app.
    });
  });
}
