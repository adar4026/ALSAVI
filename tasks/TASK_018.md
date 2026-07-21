# TASK_018: GitHub Pages production deployment (permanent offline-first PWA)

**Status: IN PROGRESS.** Protocol Freeze is lifted by explicit owner decision
(`PROGRESS.md`, 2026-07-21 entry) specifically for this task. This is an
implementation task, not research/scoping.

## Основание задачи

Owner-approved delivery decision (2026-07-21, same session as this task's
creation): move ALSAVI from the LAN/local-preview deployment model
(`vite dev`/`vite preview` over mkcert HTTPS on the MacBook's LAN IP) to a
permanent GitHub Pages production deployment — the same delivery model already
proven for the owner's other A-Lex Core ecosystem apps (A-Lex Finance,
Ministry): GitHub repository → production static build → GitHub Pages →
Safari → Add to Home Screen → offline-capable PWA.

This supersedes waiting for the original Day-14 durability checkpoint
(2026-07-25 08:43 +02:00) as a precondition. See `PROGRESS.md`, 2026-07-21
entry, for the full termination-and-freeze-lift decision record, and
`docs/DURABILITY_PROTOCOL.md`'s "Experiment outcome" note.

`TASK_017` (app-shell precache hardening) is folded into this task rather than
implemented in isolation — see `tasks/TASK_017.md`'s superseded status line —
because the production service worker needs a correct precache regardless of
which task number ships it.

## Цель

Deploy ALSAVI as a permanent, HTTPS, installable PWA at
**`https://adar4026.github.io/ALSAVI/`**, independent of the MacBook, any LAN
address, or a running local server, while preserving every existing
architectural invariant (deterministic Engine, no backend/server database,
IndexedDB as the sole client-side data store behind the existing
`EngineStore`/`DexieStore` abstraction, no new consumer of Engine internals).

## Scope

1. **Deployment infrastructure** — `.github/workflows/deploy-pages.yml`
   (GitHub Actions, `actions/deploy-pages`), GitHub Pages enabled with
   `build_type: workflow` on the (now public — owner-confirmed) repo.
2. **Base-path / routing compatibility** — Vite `base` conditioned on
   `command`/`isPreview` (`/ALSAVI/` for build+preview, `/` for local dev);
   `index.html` (`%BASE_URL%`), `manifest.webmanifest` (relative `.`
   start_url/scope/icons — portable per the Web App Manifest spec's
   manifest-relative resolution), `registerSW.ts`
   (`import.meta.env.BASE_URL`).
3. **PWA app-shell precache correctness** (TASK_017 finding) — build-time
   precache manifest (`resolvePrecacheManifest`/`stampPrecacheManifest` in
   `apps/web/build/serviceWorkerVersion.ts`) injected into `dist/sw.js`;
   `install` now precaches the complete shell (`cache.addAll(['./',
   ...PRECACHE_MANIFEST])`) instead of only `/`; the `'/'`-vs-`'./'`
   origin-root bug (would have broken navigation fallback under a subpath)
   fixed alongside it.
4. **IndexedDB origin migration** — no code changes to the Engine/`EngineStore`
   contract; the existing `@alsavi/backup` export/import path
   (`exportBackup`/`parseBackup`/`store.replaceAll`, already wired in
   `CardManager.tsx`) is the migration mechanism between the old LAN origin
   and the new GitHub Pages origin. Documented as a manual owner flow (browser
   storage does not migrate automatically across origins) — see the
   acceptance checklist in the final report.
5. **Production acceptance** — verified against the real
   `https://adar4026.github.io/ALSAVI/` URL after deploy (assets, manifest,
   service-worker registration/scope, offline cold start, no console
   errors/404s), not just a local build.
6. **Post-deployment durability testing** — a new, GitHub-Pages-origin
   durability protocol (not a reuse of the terminated LAN-origin experiment),
   with concrete completion criteria, recorded once the production site is
   verified live.

## Архитектурные границы (Architectural boundaries)

Per `PROJECT_CONSTITUTION.md` CORE ARCHITECTURE: this task is **deployment/app
infrastructure only**. It does not touch `packages/engine`, its public API,
`EngineStore`/`DexieStore`'s contract, `StudySession`, or `packages/ai`. No
backend, VPS, server database, authentication, or cloud sync is introduced —
GitHub Pages is static hosting for the same client-side app; IndexedDB remains
the sole data store, unchanged, behind the existing abstraction. `localStorage`
is not introduced as a replacement for anything.

## Definition of Done

1. `apps/web` builds correctly for the `/ALSAVI/` base path: `npm run build -w
   @alsavi/web` produces `dist/` with all asset URLs, the manifest, and the
   service worker correctly scoped to that subpath; `vite preview` (which now
   also serves under `/ALSAVI/`) is a faithful local check of this.
2. `dist/sw.js` precaches the complete app shell at `install` (navigation
   document + every hashed JS/CSS chunk + manifest + icons), atomically, before
   `skipWaiting()`; existing `CACHE_VERSION` stamping and prefix-scoped
   `activate` prune are unchanged and their guard tests remain green.
3. `.github/workflows/deploy-pages.yml` builds from tracked source on push to
   `main` (or manual dispatch), runs the full test suite before building,
   publishes only `apps/web/dist` (with `.nojekyll`), and does not commit
   build output to `main`.
4. GitHub Pages is live and serving `https://adar4026.github.io/ALSAVI/`:
   HTML/JS/CSS/manifest/icons/service-worker all load with no 404s, no console
   errors; the app is installable; a fully-offline reload after one online
   visit renders the app shell.
5. IndexedDB initializes correctly on the new origin (separate database from
   the old LAN origin, by design — browser storage is origin-scoped); backup
   export/import is verified as the supported migration path, without
   embedding or committing any real backup file.
6. Only `apps/web`, `.github/`, `.gitignore`, and documentation
   (`PROGRESS.md`, `docs/`, `tasks/`) change; `packages/engine`, `packages/ai`,
   `packages/backup`, `packages/anki-import`, `apps/cli`, and all public APIs
   are untouched (verified via `git diff`).
7. `git status --short` after commit+push shows nothing outstanding from this
   task; no personal/backup files from the working directory are staged.
8. A new post-deployment durability protocol exists with explicit (non-`TBD`)
   completion criteria, and PROGRESS.md is updated with the full execution
   report per the project's standard format.

## Сознательно вне scope (Non-Goals)

- Cross-device cloud sync, accounts, authentication, or any server/backend —
  explicitly excluded per `PROJECT_CONSTITUTION.md` and the owner's brief.
- Custom domain — not requested; the default
  `https://adar4026.github.io/ALSAVI/` project-site URL is the target.
- Any Engine/StudySession/AI Layer/public-API change.
- Re-running or resuming the terminated LAN-origin durability experiment — it
  is closed as `TERMINATED EARLY`/`INCONCLUSIVE` (see `PROGRESS.md`,
  2026-07-21 entry); only a *new* protocol for the new origin is in scope.
- Physical iPhone "Add to Home Screen" verification — cannot be automated;
  produced as an exact manual checklist for the owner instead.
