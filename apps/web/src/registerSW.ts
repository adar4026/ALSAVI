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
    // BASE_URL is Vite's resolved `base` ('/' in dev, '/ALSAVI/' in production
    // — see vite.config.ts). Registering relative to it, rather than the
    // hardcoded origin root, is required for a GitHub Pages project-site
    // subpath deploy and gives the worker the matching default scope.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline start is best-effort; failing to register must not break the app.
    });
  });
}
