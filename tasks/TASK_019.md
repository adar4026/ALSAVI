# TASK_019: Unify Safe Backup Restore Orchestration

**Status: IMPLEMENTATION COMPLETE, in approved scope. Manual UI verification partial — see "Manual verification log" below. Not yet ready for commit/push/deploy; awaiting owner instruction.**

Implementation and all code-level verification (tests, types, diff scope) are
done and unaffected by the manual-verification anomaly discussed below. This
is a **separate, limited application-layer cleanup ahead of a future M0** —
not an implementation of `M0: Services Layer + Module Seam` itself (see
"Relationship to future M0" below).

## Основание задачи

Owner-approved, scoped-down follow-up to the M0 evaluation session
(`docs/ROADMAP_ALSAVI_BETA.md` M0 — "Services layer + Module Seam"). That
evaluation found that full M0 is premature: most of its seven proposed
services either already exist as independent packages (`@alsavi/backup`,
`@alsavi/anki-import`, `AIService`) or have no current feature driving them
(`CardService`, `DeckService`, `StatsService`, `SettingsService`), and the
`AlsaviModule`/Domain Events portion of M0 lacks even an accepted ADR
(`docs/adr/ADR-005-application-services-layer.md` explicitly excludes that
seam from its own scope). What the evaluation did find is one real, narrow
problem worth fixing now, independent of M0: **the safe-restore sequence is
implemented twice.**

**This task is NOT an implementation of M0.** It does not introduce
`packages/services`, any of the seven named services, `AppDataRepository`, or
`AlsaviModule`/Domain Events. It is a small, self-contained cleanup inside the
existing `@alsavi/backup` package boundary (ARCHITECTURE.md §11b), justified
on its own merits (duplication removal, not architecture-building).

## Concrete problem

`packages/backup/src/import.ts`'s `importBackup(store, text)` already
implements the safe order `parseBackup → store.replaceAll` (validate fully
before any destructive write — INV-9). But it has **no confirmation step** —
by design, per its own doc comment: *"the explicit user confirmation of the
destructive replace lives in the UI (between validation and this call)"*.

`apps/web/src/CardManager.tsx`'s `onRestore` (lines 107-138) therefore cannot
use `importBackup` and instead **re-implements the same sequence inline**:
`parseBackup(text)` → `window.confirm(...)` → `store.replaceAll(result.data)`.
This is a second, hand-written copy of the INV-9-critical
validate-before-destroy order, untestable without the DOM (`window.confirm`),
that can drift from the package version if either is edited independently.

`apps/cli/src/cli.ts` uses `importBackup` directly (loading a snapshot into a
fresh, empty `MemoryStore` for the `ask` command — no existing data to
protect, hence no confirmation today).

## Approved scope

### In scope

1. **One common headless restore-orchestration primitive in `@alsavi/backup`**
   that: accepts an `EngineStore`-compatible store and backup text; validates
   fully before any destructive action; passes parsed metadata to an injected
   `confirm` callback supporting `boolean | Promise<boolean>`; calls
   `store.replaceAll` only after successful validation **and** a positive
   confirmation; returns a structured, discriminated outcome (rejected /
   cancelled / restored) with counts — no UI strings baked in.
2. **Single implementation of `parse → replaceAll`.** No second independent
   copy remains. `importBackup`'s existing public contract (signature,
   `BackupError` throw-on-invalid, `RestoreReport` shape) is preserved as a
   thin wrapper over the new primitive with automatic (`confirm: () => true`)
   approval, so existing callers (tests, CLI) do not need to change behavior.
3. **Web integration.** `CardManager.onRestore` calls the new primitive; React
   keeps only file read, the `window.confirm` adapter passed in as `confirm`,
   status-string display, and `reload()`/`onChanged()`. No inline
   `parseBackup`/`replaceAll`/branching validation remains in the component.
4. **CLI integration.** `apps/cli/src/cli.ts`'s restore path is switched to the
   same shared primitive (via the preserved `importBackup` wrapper, or a
   direct call with `confirm: () => true` — whichever keeps the diff smaller),
   preserving today's no-prompt behavior exactly.
5. **Tests** (headless, in `packages/backup/test`): invalid backup (rejected,
   confirm not called, store untouched); valid + confirm→false (cancelled, no
   replace, data intact); valid + confirm→true synchronously (restored,
   correct counts); valid + confirm→true asynchronously (same path);
   `importBackup` still behaves as before (round-trip/replace-semantics tests
   already in `backup.test.ts` keep passing unmodified).

### Out of scope (explicit non-goals)

- Full Services Layer, `packages/services`, `SettingsService`, `StudyService`,
  `CardService`, `DeckService`, `StatsService`, `ImportService`, a
  `BackupService` *class*, `AppDataRepository`, any new `localStorage` adapter.
- `AlsaviModule`, `eventBus`, Domain Events, `ReviewRecorded`.
- M1 concerns: `new-cards/day`, `max-reviews/day`, undo.
- Any change to `packages/engine` (scheduler, learning algorithm, public API),
  `packages/ai`, or `packages/anki-import`, beyond an unavoidable import
  adjustment (none anticipated).
- `.apkg` import flow, backup export/download flow — unchanged.
- UI redesign or copy changes beyond what the new API requires; unrelated
  refactoring.
- Resolving the roadmap-vs-ADR-005 conflict over `AlsaviModule`/Domain Events
  (tracked as a follow-up observation, not fixed here).

## Definition of Done

1. `@alsavi/backup` has one common headless restore-orchestration path.
2. Validation always runs before confirmation and before any destructive
   mutation.
3. `store.replaceAll` runs only after a positive confirmation.
4. Confirmation callback supports `boolean | Promise<boolean>`.
5. `importBackup` contains no separate/duplicate orchestration implementation.
6. Web restore uses the shared API; no inline `parseBackup → replaceAll` left
   in `CardManager.tsx`.
7. CLI restore uses the same shared primitive.
8. Existing web and CLI behavior is preserved exactly.
9. New headless tests cover: validation failure, cancellation, synchronous
   approval, asynchronous approval.
10. Existing atomic-replacement/round-trip tests are not weakened.
11. All relevant tests pass (`npm test`, all workspaces).
12. TypeScript checks pass for touched packages/apps.
13. `packages/engine`, scheduler, and persistence architecture are untouched.
14. `TASK_019.md` and `PROGRESS.md` are updated.
15. `ADR-005` remains `Proposed` — not changed to `Accepted`; no new ADR is
    created (this stays inside the existing `@alsavi/backup`/`EngineStore`
    boundary).
16. No unrelated findings are folded into this scope.

## Relationship to future M0

This task removes one specific piece of UI-locked orchestration
(restore-sequence duplication) that the M0 evaluation identified as the one
candidate with real, provable value today (vs. `StudySession`, which the
evaluation found would become a pure pass-through wrapper with no orchestration
of its own). It does **not** stand up the Services layer, the
`AppDataRepository` port, or the Module Contract/Domain Events seam — those
remain gated on their own future milestones/ADRs as recorded in the M0
evaluation report. `ADR-005` stays `Proposed`; this task does not constitute
acceptance of that ADR.

## Manual verification log (2026-07-21 → 2026-07-22 session)

**Code-level verification: complete and unaffected by anything below.**
`npm test` (130/130, all workspaces, incl. 6 new `restoreBackup` cases), `tsc --noEmit`
clean for `packages/backup`/`apps/web`/`apps/cli`, `git diff --check` clean, diff
scope confirmed to touch only the approved files. None of this is in question.

**Manual browser/UI verification: anomaly identified, not a code defect.**

During this session's manual smoke testing (both an agent-driven browser-pane
attempt and a subsequent owner-driven physical attempt), selecting a restore
file — intended to be a prepared fixture (`.../scratchpad/task_019_smoke/
C-valid-confirm-test.json`, 2 notes / 3 cards / 0 reviews, distinctive
`"TASK_019 branch C (CONFIRM)"` content) — instead, on both occasions,
produced a restore of **3 notes / 6 cards / 0 reviews** with note fronts
`Это моя вина` / `Успокойся` / `Прежде всего`.

**Root cause identified (read-only filesystem check, 2026-07-22):**
`~/Desktop/alsavi-backup-2026-07-21.json` (SHA-256
`755b75e0b5b97dcf695b3322f8410d97726bd56499f03106d997cb0238304fa2`, 2164
bytes) contains **exactly** that dataset — 3 notes / 6 cards / 0 reviews,
identical note front text, `exportedAt: 1784666201152`. This is a real,
pre-existing personal backup file on the Desktop (an intermediate snapshot
from the actual GitHub-Pages Day-0 baseline session recorded in
`PROGRESS.md`, predating the final 5/10/0 baseline export). It is not part
of this repository and was never touched or modified by this task.

**Conclusion:** the "successful restore" branch (C) is confirmed to exercise
the real code path correctly end-to-end (validate → confirm → atomic
replace → persisted across reload) — `restoreBackup`/`CardManager.onRestore`
did exactly what the code says it should do. What remains unconfirmed is
*why* this specific Desktop file was selected instead of the intended
fixture, on two independent attempts (one automated, one physical). The
leading, unconfirmed hypothesis is that this file sits somewhere a file
picker defaults to (e.g. Desktop) or was already the "last used" file in
this browser profile/OS dialog history, making it easy to select
by habit or dialog-default rather than by deliberately choosing the
fixture path. **This hypothesis is not yet proven** and no other explanation
has been ruled out with certainty.

**Status of the three required branches:**
- **A (invalid backup):** not yet confirmed.
- **B (valid + cancel):** not yet confirmed.
- **C (valid + confirm):** the *mechanism* (validate→confirm→replace,
  persisted restore) is confirmed working, but **not on the intended
  fixture** — so it does not yet stand in as proof that a small,
  distinctly-countable dataset routes through cleanly end-to-end. Given the
  restored counts/content trace 1:1 to a known, real file, this is not being
  treated as a code defect, but the branch is not marked done until re-run
  against the actual intended fixture with the selected filename confirmed.

**No code was changed in response to this anomaly**, per instruction — there
is no reproducible evidence of an implementation defect to fix.

## Verification plan

- Full `npm test` across all workspaces.
- `npx tsc --noEmit` for `packages/backup`, `apps/web`, `apps/cli` (the touched
  packages).
- `git diff --check`.
- Full diff review restricted to TASK_019-related files.
- Manual smoke test of the web restore flow (invalid backup / valid+cancel /
  valid+confirm) on isolated test data, in the local dev server — not against
  production data. If this cannot be safely exercised in the current
  environment, that will be stated honestly rather than claimed as done.
- No commit, push, or deploy without a separate, explicit owner instruction.
