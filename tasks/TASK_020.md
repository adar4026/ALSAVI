# TASK_020: Enforce configurable daily new-card introduction limit

**Status: IMPLEMENTATION COMPLETE, including three pre-commit audit
corrections (see "Pre-commit audit corrections" below). Code-level
verification passed (168/168 tests, clean typecheck, clean diff-check).
Manual smoke verification done on isolated local dev-server data, including
the failure/retry paths added by the corrections. One recorded deviation: no
automated component-level test for the initialization gate / three UI states
(this repo has no React component-testing infrastructure) — substituted with
manual verification; see `PROGRESS.md` 2026-07-22 entries for full detail.
Not committed — awaiting a separate, explicit owner instruction for
commit/push/deploy.**

## Pre-commit audit corrections

An independent pre-commit audit (before any commit) found three real gaps in
the initial implementation. All three were authorized and fixed within this
same task's scope — they bring the already-approved contracts to a safe
state, not new features:

1. **`StudySession` policy validation.** `StudySessionOptions.newCardsPerDay`
   and `setNewCardsPerDay(limit)` previously accepted any `number`, including
   negative and fractional values. A fractional limit (e.g. `1.5`) is a real
   correctness bug, not just an edge case: the withheld-count loop in
   `selectEligible` decrements the remaining allowance by whole `1` each
   time, so a fractional remaining value lets **one extra card through**
   before going negative. Fixed with a single shared, private
   `normalizeNewCardsPerDay` path used by both the constructor and the
   setter: `null`/`undefined` → unlimited; any other value must be a finite,
   non-negative integer or a `RangeError` is thrown. An invalid `setNewCardsPerDay`
   call throws *before* any assignment, so the previously active valid limit
   is left untouched. A new exported `assertValidNewCardsPerDay(value)`
   reuses the same check for callers (the web composition root) that need to
   validate *before* persisting, without yet applying the value to a live
   session.
2. **Bootstrap settings-load failure.** The initialization gate's
   `useEffect` had no `.catch()` on `store.getNewCardsPerDay()` — a rejection
   left the app in an unlabeled, permanent loading state with no error and no
   way out. Fixed by replacing the boolean gate with a three-value
   `BootstrapState` (`'loading' | 'ready' | 'error'`) in `App.tsx`. On
   failure, the review view shows a blocking message ("Не удалось загрузить
   настройки обучения.") with a "Повторить" button that calls the exact same
   `loadSettings` function used on mount. The gate only reaches `'ready'`
   after `session.setNewCardsPerDay(resolvedValue)` has actually been called;
   it never falls back to unlimited on error, and `ReviewSession` is not
   rendered in the `'error'` state, so `nextCard()`/answering stay unreachable.
3. **Transactional runtime setting update.** `onLimitChange` previously
   applied the new value to `StudySession` and the UI *before* the Dexie
   write had even started — a persistence failure would leave the in-memory
   session and the displayed value pointing at a value that was never
   actually saved, with no error shown. Fixed by reordering to: validate
   (`assertValidNewCardsPerDay`, before touching storage) → persist
   (`store.setNewCardsPerDay`) → only on success, apply `session.setNewCardsPerDay`
   + update the displayed value + refresh stats. On failure, nothing above is
   touched — the previous persisted/in-memory/displayed value stays fully
   active — and a local error ("Не удалось сохранить дневной лимит.") is
   shown next to the control, which is `disabled` while a save is in flight
   (preventing overlapping saves). `StudySession` is never reconstructed and
   bury state is never touched by any part of this path.

All three were verified both by new headless tests
(`packages/engine/test/study-session.test.ts`'s new
`newCardsPerDay validation` describe block, plus direct
`assertValidNewCardsPerDay` unit tests) and by manual browser verification of
the load-failure/retry and save-failure/retry paths (temporarily forcing
`DexieStore.getNewCardsPerDay`/`setNewCardsPerDay` to throw via a
`localStorage`-gated hook, fully reverted afterward — confirmed by
`git diff --stat` matching the pre-hook baseline exactly).

## Основание задачи

Owner-approved first slice of `M1: Daily Study Controls`
(`docs/ROADMAP_ALSAVI_BETA.md`, M1), scoped down from the roadmap's literal
task breakdown after a dedicated analysis-only session. That analysis found:

- Full `M0: Services layer + Module Seam` is not a prerequisite for this
  slice. Most of its seven services either already exist as independent
  packages or have no feature currently driving them (see `TASK_019.md`'s own
  M0 evaluation, reused here).
- Daily-limit policy is **session presentation policy**, and
  `docs/adr/ADR-003-studysession-separation.md` (**Accepted**) already assigns
  exactly this class of concern to `StudySession`:
  > "Поток сессии меняется по причинам подачи: порядок, learn-ahead,
  > **будущие дневные лимиты**, interleaving, режимы, влияние AI на порядок."
  > "Границы: будущие режимы/**лимиты**/мультиколоды — как опции/стратегии
  > `StudySession` ... а не ветки внутри `LearningEngine`."
- A `StudyService` that only delegates `nextCard`/`answer`/`dueCount` to
  `StudySession` would be a pure pass-through wrapper — exactly what
  `docs/adr/ADR-005-application-services-layer.md` (**Proposed**, not
  binding) itself warns against ("сервис заводится, когда его фича входит в
  scope, и оправдывается реальной оркестрацией, а не проксированием"), and
  what the `TASK_019.md` M0 evaluation already concluded for `StudySession`.

**This task is an owner-approved deviation from the roadmap's literal
`M1 → StudyService + SettingsService` breakdown**, not a rejection of the
roadmap. It implements the same product objective (`new cards/day`) via the
architecture that the binding, Accepted ADR-003 already authorizes:
`StudySession` policy + a narrow persistence accessor. It is **not** an
implementation of `max-reviews/day` or `undo` (both remain separate future
work per roadmap M1).

## Product semantics (owner-approved)

### `new cards/day`

**Definition:** the maximum number of unique cards that may have their first
review recorded today with `stateBefore === 'new'`. In plain terms: *the
number of new cards first answered today* — **not** the number of new cards
first *shown*.

- **Counting unit:** unique `cardId`. Under normal engine operation a card
  can accumulate at most one review with `stateBefore === 'new'` (FSRS never
  transitions a card's state back to `'new'` — see `fsrs-scheduler.ts`), but
  unique-card counting is used regardless, so that inconsistent or imported
  history (arriving via backup restore, which is not semantically validated)
  cannot double-charge the same card against the day's allowance.
  Consequence: several matching review records for the same card consume the
  allowance **once**.
- **What does not consume allowance:** showing a new card without recording
  an answer. This is a known, accepted limitation of deriving usage from the
  Review Log rather than from a separate "shown" counter — see Definition of
  Done note below.
- Reviews with `stateBefore !== 'new'` never consume allowance.

### Limit values

- `null` → unlimited.
- `0` → introduce zero new cards today (blocks all `state==='new'` cards;
  does not affect already-learning/relearning/review cards).
- positive integer → that many unique first-new-answers allowed today.
- Persisted setting absent (confirmed, not just "not yet loaded") → unlimited.
- Existing users after this upgrade keep today's unlimited behavior by
  default.
- **Technical note:** `0` is a meaningful value, not an absence. Nullish
  coalescing (`??`) is safe and preserves `0`
  (`0 ?? fallback` evaluates to `0`); only `null`/`undefined` trigger the
  fallback. Falsy-style checks (`limit || fallback`, `if (!limit)`) are
  **forbidden** anywhere they would conflate `0` with "unset"/"unlimited".
  `undefined` (option not passed at construction) normalizes to unlimited via
  `options.newCardsPerDay ?? null`.

### Learning / relearning cards

Never restricted by `new cards/day`. A card that received its first answer
today already consumed its one allowance unit; its subsequent short learning
steps continue to surface regardless of the new-card limit being reached.

### Day boundary

Local calendar midnight — the same day semantics already used by
`LearningEngine.getStats().reviewsToday` and the streak calculation
(`startOfLocalDay`, `packages/engine/src/engine.ts`). No configurable
rollover hour, no timezone/DST redesign — both explicitly out of scope.

## Approved architecture

### Service/module boundary

**Use `StudySession` directly.** No `StudyService`, `SettingsService`,
`AppDataRepository`, `packages/services`, Domain Events, or `AlsaviModule`.
`LearningEngine`, the scheduler, and scheduling transitions are not modified
beyond one minimal read-only usage fact (see below).

### `StudySession` policy contract

- `StudySessionOptions.newCardsPerDay?: number | null` — initial value;
  `undefined` normalizes to unlimited (`null`) at construction.
- `StudySession.setNewCardsPerDay(limit: number | null): void` — narrow
  setter; updates internal policy state; takes effect on the **next**
  `nextCard()`/`dueCount()` call; does **not** reconstruct the session and
  does **not** reset ephemeral bury state.
- No React types, refs, or callbacks anywhere in `packages/engine`.

### Derived usage (no persisted counters)

Usage is derived from the Review Log on demand: unique `cardId` count of
reviews with `reviewedAt >= startOfLocalDay(now)` and `stateBefore === 'new'`.
A minimal read-only method is added where actually needed (either on
`LearningEngine` or as a narrow `EngineStore` read query) — no counter is
persisted, and no broader "for future use" API is introduced.

### UI status signal

`nextCard() === null` alone cannot distinguish "nothing eligible at all" from
"new cards exist but are withheld by the limit". `StudySession` exposes one
additional minimal, read-only, data-only signal (e.g. a withheld-count or a
narrow status value) computed from the **same** selection logic that backs
`nextCard()`/`dueCount()`, so the three cannot desynchronize. No React
concerns in the signal's shape.

### Settings persistence

- `settings` table added to the **existing** `AlsaviDB` (`apps/web/src/dexie-store.ts`)
  via an **additive** Dexie `version(3)` — existing `notes`/`cards`/`reviews`
  untouched, no data migration.
- `EngineStore` interface is **not** extended for settings; settings are not
  engine memory-data. A narrow settings accessor lives next to `DexieStore`,
  sharing the same `AlsaviDB` instance (one storage lifecycle, no
  `localStorage`, no separate Dexie database).
- `EngineStore.replaceAll` (backup restore) continues to touch only
  `notes`/`cards`/`reviews` — the `settings` table is not part of its
  transaction/clear/replace sequence, so restore **cannot** reset the
  daily-limit setting.
- Backup schema stays `BACKUP_VERSION = 1`; settings are **not** included in
  backup v1; old backup files remain fully compatible. After a restore,
  derived daily usage is recalculated from the restored Review Log while the
  local setting itself is left unchanged (a deliberate, documented v1
  limitation — cross-device settings transfer is deferred).

### Safe initialization gate (race prevention)

`ReviewSession.nextCard()` is currently called synchronously on mount
(`useEffect` in `ReviewSession.tsx`), before any async settings load could
complete. To prevent a persisted `0` or an already-exhausted positive limit
from briefly behaving as unlimited:

- `App.tsx` owns a `settingsReady` boolean, `false` until the persisted
  setting has been loaded (confirmed present with a value, or confirmed
  absent → unlimited) **and** `session.setNewCardsPerDay(resolvedValue)` has
  been called.
- `ReviewSession` does not call `nextCard()` (and the app does not call
  study `dueCount()`) until `settingsReady === true`. Until then, the UI
  shows the existing neutral loading state already used for the in-flight
  case (no new visual design).
- `StudySession` itself may still be constructed synchronously in `useMemo`
  — the gate only withholds its first real usage, so no reconstruction is
  needed and no bury state is ever at risk.
- Runtime updates (user changes the limit while reviewing): validate/normalize
  → persist to the `settings` table → call `session.setNewCardsPerDay(...)`
  → next `nextCard()`/`dueCount()` reflects it. No reconstruction.

## In scope

1. `tasks/TASK_020.md` (this file).
2. `StudySession`: `newCardsPerDay` option + `setNewCardsPerDay` setter;
   selection logic restricts `state==='new'` cards to remaining allowance;
   non-new due/learning/relearning cards unaffected.
3. Minimal read-only engine-side fact for "unique cards first-answered as
   new today", consumed by `StudySession`.
4. A minimal read-only limit-status signal from `StudySession`, derived from
   the same selector as `nextCard()`/`dueCount()`.
5. `apps/web/src/dexie-store.ts`: additive `version(3)` `settings` table +
   narrow accessor (get/set the daily limit value). `replaceAll` unchanged
   (still only notes/cards/reviews).
6. `apps/web/src/App.tsx`: bootstrap `settingsReady` gate; load setting;
   apply via `setNewCardsPerDay`; wire runtime updates.
7. `apps/web/src/ReviewSession.tsx` (or a small adjacent control): gate on
   `settingsReady`; three UI states (see below); minimal input control for
   the daily new-card limit (empty/unlimited or an integer ≥ 0) placed at the
   smallest reasonable existing UI surface — no settings-screen redesign.
8. Tests (headless, deterministic, injected `now`) per the list below.
9. Documentation updates: `PROGRESS.md`, `ARCHITECTURE.md`,
   `docs/ROADMAP_ALSAVI_BETA.md` (M1 section).

## Out of scope

- `max-reviews/day` and its counting semantics.
- Undo, and the undo ADR.
- Configurable rollover hour; timezone/DST redesign.
- `StudyService`, `SettingsService`, `AppDataRepository`, `packages/services`,
  Domain Events, `AlsaviModule`.
- Settings included in backup; any backup schema version change.
- Persisted usage counters.
- A separate settings Dexie database.
- `localStorage`.
- Any change to the FSRS scheduler, scheduling transitions, or
  `EngineStore.replaceAll`'s table set.
- Full UI/settings-screen redesign; unrelated refactoring or cleanup.

## UI states (exact contract)

1. **No eligible cards** — no due review, no learning/relearning, no
   available new cards. Unchanged existing message ("Всё повторено. 🎉").
2. **New-card daily limit reached** — new cards exist but are withheld by
   the limit, and nothing else is eligible. Distinct message (e.g. "Дневной
   лимит новых карточек достигнут").
3. **Eligible non-new cards remain** — new limit reached, but due
   review/learning/relearning cards remain. Normal review flow continues;
   no terminal state shown.

The UI must never show state 2 when there are simply no new cards at all
(that is state 1).

## Required tests

**Engine / StudySession:**
- Unlimited preserves current behavior (unaffected by this change).
- `0` blocks all new cards; non-new cards unaffected.
- Positive limit allows only the remaining allowance.
- Usage counted by unique cards with `stateBefore === 'new'`.
- Multiple matching review records for one card consume allowance once.
- Reviews with `stateBefore !== 'new'` do not consume allowance.
- Reviews before the local day boundary are not counted.
- Learning/relearning cards remain eligible after the new limit is reached.
- `nextCard()` and `dueCount()` remain consistent with each other.
- The limit-status signal is consistent with the same selector (no false
  "no new cards" vs "limit reached" mismatch).
- Showing a new card without answering it does not consume allowance.
- `setNewCardsPerDay` changes policy for the next selection.
- `setNewCardsPerDay` does not reset bury state.
- Restart/reconstruction: a new `StudySession` instance recovers the correct
  allowance purely from the persisted Review Log.

**Settings/Dexie:**
- Absent setting reads back as unlimited.
- `null`, `0`, and a positive integer round-trip correctly.
- Setting survives adapter/app reconstruction (simulated reload).
- Additive `version(3)` upgrade preserves existing notes/cards/reviews.
- `replaceAll` does not reset the `settings` table.
- Restore changes derived daily usage per the restored Review Log, while the
  setting itself is unchanged.

**Initialization/UI:**
- Before settings load completes, `nextCard()` is not called.
- Persisted `0` does not yield a new card at startup.
- An already-exhausted positive limit does not yield a new card at startup.
- After confirmed absence of a setting, unlimited flow starts.
- The three UI states are distinguished correctly.
- A runtime setting change applies without session reconstruction.

All tests use an injected time source. Full timezone/DST coverage is not
claimed; only deterministic boundary behavior around the existing
`startOfLocalDay` under an injected `now` is covered.

## Definition of Done

1. `new cards/day` is enforced as configurable `StudySession` policy.
2. Usage is derived from the Review Log (unique-card, first-`new`-answer,
   local day) — no persisted counters.
3. `null`/unlimited, `0`/block-all, and positive-integer semantics are all
   correct, including the `??`-safe normalization of `undefined`.
4. Learning/relearning cards are never restricted by this limit.
5. The three UI states are distinguishable and never show a false
   limit-reached state.
6. Settings persist in the existing `AlsaviDB` (additive `version(3)`),
   survive reload, and are unaffected by backup restore.
7. Backup schema remains `BACKUP_VERSION = 1`; old backups remain compatible;
   settings are not included in backup v1.
8. The initialization gate prevents any unlimited-before-load behavior; a
   persisted `0` or exhausted limit is honored from the very first
   `nextCard()` call.
9. Runtime setting changes apply without reconstructing `StudySession` and
   without losing bury state.
10. `EngineStore`, the FSRS scheduler, and scheduling transitions are
    unmodified beyond the one minimal read-only usage fact.
11. All required tests pass; `npm test` green across all workspaces.
12. `npx tsc --noEmit` clean for `packages/engine` and `apps/web`.
13. `git diff --check` clean; diff scope limited to files listed above.
14. `PROGRESS.md`, `ARCHITECTURE.md`, and the M1 section of
    `docs/ROADMAP_ALSAVI_BETA.md` are updated to record this as an
    owner-approved deviation from the roadmap's literal
    `M0 → StudyService + SettingsService` breakdown, executed instead via
    Accepted ADR-003.
15. `ADR-005` remains `Proposed`; no new ADR is created.
16. No unrelated findings are folded into this scope.

## Verification plan

- Full `npm test` across all workspaces.
- `npx tsc --noEmit` for `packages/engine` and `apps/web`.
- `git diff --check`.
- Confirm changed-file scope matches this task's "In scope" list.
- Manual smoke test on the local dev server, on isolated test data (not
  production data): unlimited behavior, `0`, a positive limit, the
  initialization gate, reload persistence, all three UI states, and that
  restore preserves the setting.
- No commit, push, or deploy without a separate, explicit owner instruction.

## Risks

- `0` vs. falsy-check bugs: mitigated by explicit `??`-based normalization
  and a dedicated test for `0`.
- Per-selection Review Log scan for usage computation is O(reviews); adequate
  for MVP volumes; an indexed query is a future optimization if needed.
- Local-midnight day boundary (vs. e.g. Anki's 4am rollover) is a documented
  assumption, not a limitation to silently work around.
- Restore changes derived usage (not the setting) — documented, not treated
  as a defect.
- Showing a new card without answering does not consume allowance —
  documented, accepted v1 limitation of log-derived usage.
