# TASK_017: App-shell precache hardening (offline cold-start guarantee)

**Status: SUPERSEDED — folded into `TASK_018` (GitHub Pages production
deployment), 2026-07-21.** The Protocol Freeze that blocked this task is lifted
by explicit owner decision (see `PROGRESS.md`, 2026-07-21 entry) as part of
moving to a permanent GitHub Pages deployment, ahead of the originally planned
Day-14 durability check. Rather than implement this finding in isolation
against the now-retired LAN/local-preview deployment model, the owner directed
that it be implemented as part of the GitHub Pages deployment work, since the
production service worker needs a correct app-shell precache regardless. This
document's research/scoping content below (root cause, DoD, boundaries) remains
the accurate technical analysis of the gap and is the basis for `TASK_018`'s
implementation; this file is no longer the active task — see `TASK_018.md`.

<details>
<summary>Original (pre-2026-07-21) status line — historical, superseded above</summary>

Status: BLOCKED — Protocol Freeze is active. Implementation may begin only
after the Protocol Freeze is formally lifted following completion of the
durability experiment. The earliest possible time is 2026-07-25 08:43 +02:00,
contingent on the experiment's outcome (docs/DURABILITY_PROTOCOL.md §13, still
TBD).

</details>

## Основание задачи

Источник — открытый follow-up в `PROGRESS.md` (2026-07-07, «неполный precache
app-shell»: *«открыто, ожидает решения основателя»*), и его плановое
размещение в `docs/ROADMAP_ALSAVI_BETA.md` §6 (независимый инженерный пункт,
после снятия Protocol Freeze и до публичного релиза). Предшественник —
TASK_016 (версионирование кэша SW), который сознательно оставил precache-манифест
хэшированных бандлов как Non-Goal.

Конкретный разрыв в текущей реализации `apps/web/public/sw.js`:

- `apps/web/public/sw.js:36-42` — обработчик `install` кладёт в кэш **только
  навигационный документ**: `await cache.add('/')` (строка 39). Больше ничего
  при установке в кэш не помещается.
- `apps/web/public/sw.js:83-96` — контент-хэшированные JS/CSS-бандлы,
  `manifest.webmanifest` и иконки кэшируются **лениво** через
  stale-while-revalidate: `cache.put(request, response.clone())` (строка 90)
  срабатывает **только** при успешном *сетевом* запросе, т.е. лишь когда ассет
  реально запрошен при online-загрузке.
- Это в точности задокументированная находка `PROGRESS.md` (2026-07-07):
  *«на `install` precache-ится только `/` … JS/CSS/`manifest.webmanifest`/иконки
  кэшируются **лениво** … offline-старт по-прежнему зависит от ранее
  закэшированных ассетов. Полностью offline холодный старт гарантированно отдаёт
  лишь `/`; если хэшированные JS/CSS ещё не были закэшированы предыдущей
  online-сессией, их запрос упирается в сеть … всё ещё может дать **белый
  экран** … из-за отсутствия shell-ассетов в кэше»*.

## Перед началом работы обязательно перечитать
- CLAUDE.md
- PROJECT_CONSTITUTION.md
- ARCHITECTURE.md
- ENGINE.md
- PROGRESS.md (app-shell precache follow-up 2026-07-07; Protocol Freeze /
  Deployment Event 2026-07-10; Day 0 declaration 2026-07-11)
- docs/DURABILITY_PROTOCOL.md (§9 forbidden actions, §13 completion criteria,
  §14 relationship to Protocol Freeze)
- docs/ROADMAP_ALSAVI_BETA.md §6
- tasks/TASK_015.md
- tasks/TASK_016.md
- apps/web/public/sw.js, apps/web/build/serviceWorkerVersion.ts,
  apps/web/src/registerSW.ts

## Статус

**SUPERSEDED (2026-07-21) — см. статус-строку в начале файла.** Protocol Freeze
снят решением основателя; реализация этой находки выполнена в рамках
`TASK_018` (GitHub Pages deployment), не отдельно. Раздел «Гейтинг Protocol
Freeze» ниже остаётся как исторический контекст того, почему реализация была
заблокирована до 2026-07-21.

<details>
<summary>Исходный статус (до 2026-07-21) — историческая версия</summary>

BLOCKED — Protocol Freeze активен (см. статус-строку в начале файла и раздел
«Гейтинг Protocol Freeze (Protocol-Freeze gating)» ниже). Это research/scoping-
документ: реализация **не** начата, код/сборка/деплой **не** тронуты.

</details>

## Цель

Гарантировать **полностью offline холодный старт после первой установки**:
установленная PWA должна рендериться, даже если ни одна предыдущая online-сессия
не наполнила SWR-кэш и origin недоступен. Для этого обработчик `install` должен
precache-ить **полный** app-shell (навигационный документ `/` **плюс**
контент-хэшированные JS/CSS-бандлы, которые он грузит, `manifest.webmanifest` и
иконки), а не только `/`.

## Scope

**The concrete gap, cited from the current implementation:**

- `apps/web/public/sw.js:36-42` — the `install` handler precaches **only the
  navigation document**: `await cache.add('/')` (line 39). Nothing else is
  placed in the cache at install time.
- `apps/web/public/sw.js:83-96` — the content-hashed JS/CSS bundles,
  `manifest.webmanifest`, and icons are cached **lazily** via
  stale-while-revalidate: `cache.put(request, response.clone())` (line 90) fires
  **only** on a successful *network* fetch, i.e. only when the asset is actually
  requested during an online load.
- This is exactly the documented finding in `PROGRESS.md` (2026-07-07,
  "неполный precache app-shell").

**Scope of the task:** guarantee a **fully-offline cold start after the first
install** — the installed PWA must render even if no prior online session ever
populated the SWR cache and the origin is unreachable. That requires the
`install` handler to precache the **complete** app shell (the navigation
document `/` **plus** the content-hashed JS/CSS bundles it loads,
`manifest.webmanifest`, and the icons), not just `/`.

**Why this is non-trivial and why TASK_016 deferred it:** the shell asset
filenames are **content-hashed by Vite** (e.g. `index-<hash>.js`,
`index-<hash>.css`), unknown at the time `public/sw.js` is authored. Precaching
them therefore requires a **build-time-generated precache manifest** injected
into `dist/sw.js` — precisely the item TASK_016 listed as a Non-Goal
(`tasks/TASK_016.md`, "Сознательно вне scope": *"Precache-манифест хэшированных
бандлов"*). The natural shape is to extend the existing build-time stamping
mechanism (`apps/web/build/serviceWorkerVersion.ts` —
`resolveCacheVersion`/`stampServiceWorker`/`serviceWorkerVersionPlugin`,
`closeBundle` writing `dist/sw.js`), which already demonstrates deterministic
build-time injection into the copied `sw.js`. (Concrete mechanism is the
implementation task's design decision, not fixed here.)

## Архитектурные границы (Architectural boundaries)

Per `PROJECT_CONSTITUTION.md` CORE ARCHITECTURE (Learning Engine → StudySession
→ AI Layer → app/consumers): **this task is app/SW-layer only, entirely within
`apps/web`.** It touches the PWA service-worker shell and its build tooling
(`apps/web/public/sw.js`, `apps/web/build/serviceWorkerVersion.ts` or an
analogous build step, `apps/web/vite.config.ts` if wiring is needed, and
`apps/web/test/*`). It does **not** cross into the deterministic core or any
consumer boundary: Engine, StudySession, AI Layer, `EngineStore`, and all public
APIs are untouched. The SW never becomes a second source of truth (single source
of truth remains Engine/DexieStore per `sw.js:9-12`). **Confirmed: app/SW-layer
only.**

## Definition of Done

1. On `install`, the SW precaches the **complete** app shell atomically
   **before** `skipWaiting()`: the navigation document `/` **plus** every
   content-hashed JS/CSS bundle the shell loads, `manifest.webmanifest`, and the
   icons. If any precache asset fails, `install` rejects and the previous worker
   stays in control (consistent with `sw.js:31-42`).
2. The set of hashed shell assets is determined **at build time** and injected
   into `dist/sw.js`; the build **fails fast** if the precache manifest cannot be
   generated — no fallback to a partial/placeholder list (analogous to TASK_016's
   git-context fail-fast).
3. A **fully-offline cold start with no prior online SWR fetch** renders the app
   (not just `/`), verified in a production preview under offline conditions.
4. `CACHE_VERSION` stamping and the prefix-scoped `activate` prune are unchanged;
   their existing guard/unit tests still pass unmodified.
5. The SW remains app-shell-only — no user data / IndexedDB / API cached
   (`sw.js:9-12` contract verified intact).
6. Only `apps/web` files change; `git diff` empty outside `apps/web`
   (Engine/AI/Backup/CLI/public APIs/Dexie schema untouched).
7. No new npm package or build framework; minimal, deterministic implementation.
8. New unit test(s) cover the precache-manifest generation (pure/deterministic)
   and a guard that `sw.js` contains the manifest-injection token; existing
   `sw-version` tests remain green without edits.
9. `npm run build -w @alsavi/web` passes; `dist/sw.js` contains the resolved
   precache list and resolved `CACHE_VERSION`, with **no** placeholder tokens
   remaining.
10. Runtime lifecycle (install → populate → `skipWaiting`; activate → prune →
    `clients.claim`) and the offline cold-start guarantee verified via preview,
    and — as the final human step — on real device.

## Сознательно вне scope (Non-Goals)

- **`CACHE_VERSION` stamping (TASK_016) is NOT modified.** The precache manifest
  is *additive*; the git-HEAD version contract (`sw.js:28-29`,
  `serviceWorkerVersion.ts`) stays exactly as-is.
- **`registerSW.ts`'s silent-failure `.catch` is NOT touched**
  (`apps/web/src/registerSW.ts:12-14`). That swallowed registration error was
  flagged separately as an open *observation* in `PROGRESS.md` (2026-07-10,
  «Открытые наблюдения»); it is a diagnostic-signal concern, a distinct
  decision/task — explicitly out of scope unless the owner folds it in.
- **The prefix-scoped `activate` prune is NOT changed** (`sw.js:45-59`):
  `key.startsWith(SHELL_CACHE_PREFIX) && key !== CACHE_VERSION` remains as-is.
- **The immediate-update lifecycle model is preserved** (`skipWaiting()` after
  populate → `activate` prune → `clients.claim()`), consistent with TASK_016
  directive 3.
- **The fetch-strategy semantics are not redesigned** (navigate =
  network-first→offline-fallback; static = SWR). Precaching only *populates* the
  cache at install so offline serving is reliable; it does not introduce a new
  offline/routing strategy.
- **The SW's minimal-app-shell contract is preserved** (`sw.js:9-12`): still
  **no** user data / IndexedDB / API / business logic cached. Precaching
  JS/CSS/icons is static build output, not a second state store (TASK_016
  directive 2 intact).
- No background sync / push; no new npm package or build framework (TASK_016
  directive 4 minimalism); no `prompt-to-reload` UX.
- **No** changes to Engine, StudySession, AI Layer, `EngineStore`/DexieStore,
  Backup, CLI, any public API, or the Dexie schema.

## Гейтинг Protocol Freeze (Protocol-Freeze gating)

**This task requires a rebuild/redeploy to both implement AND verify, and
therefore CANNOT begin implementation while Protocol Freeze is active.**
Specifically:

- Implementing it means editing `sw.js` + build tooling, then running
  `vite build` to stamp the precache manifest, then `vite preview` + an
  **offline** test + an **on-device** install to verify DoD 3/10.
- Any such build **changes `CACHE_VERSION`** (new HEAD sha →
  `alsavi-shell-<new-sha>`) → a new Service Worker → which would disturb the
  frozen baseline `ad3f1af` and the **currently running** durability experiment.
  This is squarely forbidden by `docs/DURABILITY_PROTOCOL.md` §9 (*"Rebuild/
  redeploy of the frozen build is forbidden for the duration"*) and §14 / the
  Protocol Freeze invariant.
- **Earliest start: after Protocol Freeze lifts — 2026-07-25 08:43 +02:00** —
  and only **contingent on the durability experiment's outcome/completion**,
  whose completion criteria (`docs/DURABILITY_PROTOCOL.md` §13) are still
  **TBD**; a failed or INCONCLUSIVE result (§11/§12) could extend or reset the
  window rather than lift the freeze. Per ROADMAP §6, TASK_017 is scheduled
  **after Protocol Freeze is lifted and before public release**, independent of
  the Beta milestones.
- **Only research/scoping (this document) is permitted now.** No code, no build,
  no deploy, no device interaction.
