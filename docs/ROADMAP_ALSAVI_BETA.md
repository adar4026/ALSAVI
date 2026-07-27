# ALSAVI Beta — Anki Replacement
### Authoritative Planning Document · Product roadmap

## 0. Status, provenance & scope of this document

**This roadmap is a product document.** It defines *what* ALSAVI Beta delivers and in what order. Architectural detail — concrete contracts, data boundaries, event schemas, representations, and invariants — is deliberately **carried out to ADRs** (`docs/adr/`), not decided here. Where a milestone names an architectural concept (Application Services, `AppDataRepository`, Module Contract, Domain Events, extensible note model), it does so only to keep the product plan traceable and consistent; the **binding decision lives in that concept's ADR**, not in this document.

**Engineering task numbers are assigned only when a task is officially created.** This roadmap **reserves no engineering task numbers.** Milestones (M0–M6) and the independent follow-up in §6 will each be opened as their own `TASK_NNN` engineering task when their turn comes, with the number assigned at creation. References to "the next engineering task" below are deliberately number-free.

**Documentation review (completed before drafting).** This roadmap was prepared after a review of the authoritative project documentation at HEAD `4b68b07`:
- `PROGRESS.md`
- `CLAUDE.md`
- `PROJECT_CONSTITUTION.md`
- `ARCHITECTURE.md`

**Conflicts found:** none. The roadmap is consistent with the constitution's phase discipline ("don't start the next phase until the current works end-to-end"), the Engine-ownership invariants (INV-1…INV-9, ADR-003), the minimal-public-API principle (№8), and the documented "Replace Anki before Cloud Sync" objective. The one boundary this roadmap *adds* — an Application Services layer — is justified below by the constitution's own "lay expensive-to-retrofit seams from day one" exception, not in tension with it.

**Source of repository-derived facts.** The feature comparison in §2 is based on a **read-only inspection of the current repository** — the Engine public API (`packages/engine/src/engine.ts`, `types.ts`, `study-session.ts`) and the current web UI (`apps/web/src/App.tsx`, `CardManager.tsx`, `ReviewSession.tsx`) — together with the authoritative documentation above. Items below are presented as **repository observations**, not unsupported assertions.

**Durability gating (authoritative status).** ALSAVI Beta is **gated on successful completion of the on-device IndexedDB durability experiment.** Per `PROGRESS.md` at HEAD `484d74d`, this experiment is recorded as a **deferred, gating next-step**, with `Export (backup)` as interim insurance; the Durability Protocol (`docs/DURABILITY_PROTOCOL.md`) now exists on `main`, including the owner's ratification record, but **a formal Day-0 declaration in `PROGRESS.md` still does not exist.** The experiment's status must always be read from `PROGRESS.md` (or a later handover record), never assumed. If/when Day 0 is officially declared in project documentation, this roadmap should cite that record; until then the wording remains neutral. All implementation and any rebuild/redeploy remain subject to Protocol Freeze as recorded in project documentation.

**Scope.** A living planning artifact. It produces no code, no commits, and no engineering tasks by itself.

**Terminology — ecosystem naming.** *A-Lex Core* is the canonical name of the personal-ecosystem platform of which ALSAVI is the learning module (ecosystem siblings: Health, Finance, Ministry). Earlier project notes may refer to it simply as *A-Lex*; both denote the same ecosystem. *ALSAVI* remains the name of this application.

---

## 1. Architectural direction (planning-level; not implementation scope)

The roadmap is organized around a clean layered target that lets ALSAVI serve **both** as a standalone application and as a future **module of A-Lex Core** (ecosystem siblings: Health, Finance, Ministry). Stated here at planning level for traceability; concrete contracts are **ADR candidates**, deferred to their own decisions.

```
UI (web · mobile · cli)      → presentation only
Services (application layer)  → use-cases / orchestration, platform-agnostic
Engine (LearningEngine)       → deterministic memory core
  └ EngineStore (repository of memory data — private port of the Engine)
AppDataRepository             → non-memory application data (settings, deck metadata, prefs)
Module Contract + Domain Events → A-Lex Core integration seam
```

Planning-level principles (each already embedded in M0–M6, none adding scope):
- **Application Services are the orchestration layer.** Business orchestration moves out of UI into platform-agnostic services, reusable across web/mobile/CLI/A-Lex Core.
- **Engine data vs application data are separated.** The Engine remains the sole owner of memory data (cards/notes/reviews) behind its public API; non-memory data (settings, deck names/metadata) lives in a distinct `AppDataRepository`, so the Engine's minimal API (principle №8) is not bloated.
- **Feature-oriented Services.** Services are vertical, feature-aligned slices (`CardService`, `DeckService`, `StudyService`, `StatsService`), favoring modularity and reuse over purely technical layering.
- **Module Contract** (`AlsaviModule` facade with DI + lifecycle) — **ADR candidate**, seam only; not implemented within Beta.
- **Domain Events** as the cross-module integration seam. Events are **emitted by the write-path** (e.g. `ReviewRecorded` at M0's module boundary) and **consumed** by read-side services (M4) and, in future, independently by Health/Finance/Ministry — **ADR candidate**, seam only; not implemented within Beta.

| Concept | Where it lives in the plan | Verdict |
|---|---|---|
| Application Services (orchestration) | M0 + every feature milestone | Planning-level (accepted in principle) |
| Engine-data vs application-data separation | M0 (`AppDataRepository`), M3 | Planning-level; boundary = ADR candidate |
| Feature-oriented Services | M1–M4 vertical slices | Guiding principle |
| Module Contract (A-Lex Core) | M0 seam, M6 | ADR candidate; not Beta implementation |
| Domain Events (emit at write path; consume read-side) | Emitted by M0 write path; consumed by M4 | ADR candidate; not Beta implementation |

> Maturity note: these are accepted **in principle** and appear here as direction + ADR candidates. They are **not** milestones and do **not** change the ordering or scope of feature work below.

---

## 2. Feature comparison — ALSAVI vs Anki *(repository observations)*

Legend: ✅ exists · 🟡 partial (engine ready, no/minimal UI) · ❌ missing

| Capability | Anki | ALSAVI today *(observed)* | Status |
|---|---|---|---|
| FSRS scheduling | ✅ | deterministic FSRS, fuzz off | ✅ |
| Review session, 4 ratings, interval preview, hotkeys | ✅ | present + bury-siblings | ✅ |
| Add basic + reversed cards | ✅ | `addNote`, reverse toggle | ✅ |
| **Edit a card** | ✅ | engine `updateNoteContent` exists, **no UI** | 🟡 |
| Delete card | ✅ | single, `×` | ✅ |
| **Card browser (list, columns, paging)** | ✅ | flat unpaged list; front/back/state only | 🟡 |
| **Search** | ✅ | none | ❌ |
| **Filter** (state/deck/suspended) | ✅ | none | ❌ |
| **Sort** | ✅ | fixed: createdAt desc | 🟡 |
| **Bulk operations** | ✅ | none | ❌ |
| **Deck management** | ✅ | `deckId` on card, always `'default'`; no UI; session studies **all** cards | 🟡 |
| Subdecks / hierarchy | ✅ | none | ❌ |
| **New-cards/day & max-reviews/day limits** | ✅ | none (shows everything due) | ❌ |
| **Undo last answer** | ✅ | none | ❌ |
| **Suspend / unsuspend** | ✅ | none | ❌ |
| Bury (persistent) / flags / marks | ✅ | bury is session-only; no flags | 🟡 / ❌ |
| **Statistics** (forecast, counts-by-state, history, retention, per-deck) | ✅ | status bar: due / total / today / lifetime accuracy / streak | 🟡 |
| Tags | ✅ | none (`Note` has no field) | ❌ |
| Rich text / images / audio | ✅ | plain text; import strips media | ❌ |
| Cloze deletion | ✅ | none (import skips cloze) | ❌ |
| Custom note types / multi-field templates | ✅ | bounded `forward`/`reverse` enum | ❌ |
| Import `.apkg` | ✅ | basic + reversed, plain text, no media/cloze | 🟡 |
| Export / backup / restore | ✅ | self-contained JSON, full Review Log, atomic restore | ✅ |
| Offline | ✅ | PWA (durability gating; see §0) | ✅ |
| Cross-device sync | ✅ | none | ❌ *(post-MVP)* |

**Summary:** the scheduling core matches or beats Anki. The gap is collection-management UI, daily-workflow controls, statistics depth, and a media/cloze honesty caveat.

---

## 3. Minimum feature set — "I can stop using Anki and use ALSAVI every day"

1. Do daily reps sustainably — **new-cards/day** and **max-reviews/day** caps.
2. Fix mistakes instantly — **edit** a card; **undo** the last answer.
3. Find any card — **search** by text; **filter** by state/deck.
4. Manage the collection — **browse** with meaningful columns; **bulk delete/move/suspend**; **suspend/unsuspend**.
5. Organize by subject — create decks, assign cards, **study one chosen deck**.
6. Trust the system — **statistics** answering "am I keeping up?" (forecast, counts-by-state, reviews/day, retention).
7. Never lose data — backup/restore (done) + verified durability (gating, §0).

Not in the minimum: sync, accounts, AI, tags, subdecks, custom note types, flags, filtered/custom study, media/cloze (see §7 honesty caveat).

---

## 4. Milestones

Complexity: S/M/L. "Engine-risk" flags changes to the deterministic core (regression tests + migration required).

### M0 — Services layer + Module Seam *(foundation, thin, incremental)*
- **Objective:** introduce the Application Services layer and integration seams without rewriting the system.
- **Layer:** Services + Module Contract.
- **Dependencies:** none (uses existing Engine public API and existing DI pattern).
- **Complexity:** M. Engine-risk: **none** (Engine unchanged; orchestration extracted *around* it).
- **Task breakdown:** define service interfaces (`StudyService`, `CardService`, `DeckService`, `StatsService`, `ImportService`, `BackupService`, `SettingsService`); extract existing orchestration out of React (import, backup, stats-refresh, session wiring) behavior-preserving with tests; introduce `AppDataRepository` port; define `AlsaviModule` facade (DI: store, clock, id, eventBus, identity) and **emit the first Domain Event `ReviewRecorded` at the write path**.
- **Rationale:** the expensive-to-retrofit seams (per the constitution's day-one exception), applied one level above the Engine. Enables reuse (mobile/CLI/Core) and testability; every later feature is built inside this layer.

### M1 — Daily Study Controls → `StudyService` + `SettingsService`
- **Objective:** sustainable, trustworthy daily reps (new/day, reviews/day, undo).
- **Layer:** Services.
- **Dependencies:** M0. Undo depends on the append-only-log decision.
- **Complexity:** limits = M. **Undo — Architecture complexity: Large; UI complexity: Small** — *Undo touches the append-only Review Log invariant (INV-4), requires an ADR, regression testing, and preservation of engine invariants.*
- **Task breakdown:** new-cards/day + max-reviews/day as `StudyService` policy; persist settings via `SettingsService`; undo (**ADR first**, then implement).
- **Update (TASK_020, owner-approved deviation).** The `new-cards/day` slice
  of M1 was delivered **without** the full `M0` prerequisite and **without**
  introducing `StudyService`/`SettingsService`: it is implemented as
  `StudySession` presentation policy (`newCardsPerDay`/`setNewCardsPerDay`),
  which the **Accepted** [ADR-003](adr/ADR-003-studysession-separation.md)
  already authorizes ("будущие дневные лимиты ... как опции/стратегии
  `StudySession`"), plus a narrow settings accessor in the existing `AlsaviDB`
  (additive Dexie `version(3)`, outside the `EngineStore` port). A
  `StudyService` that only delegated to `StudySession` would have been a
  pure pass-through wrapper, which the (**Proposed**, non-binding)
  [ADR-005](adr/ADR-005-application-services-layer.md) itself warns against.
  `max-reviews/day` and undo remain open, future M1 work — see
  `tasks/TASK_020.md` for the full rationale and scope. `ADR-005` is
  unaffected and remains `Proposed`.

### M2 — Card Management → `CardService` + thin UI
- **Objective:** browser, editor, search, filter, sort, bulk.
- **Layer:** Services (`CardService`) + UI.
- **Dependencies:** M0. Batches the schema migration (`suspended` flag) here.
- **Complexity:** L (UI-heavy). Engine-risk: `suspended` = Card field + Dexie version bump + migration; `moveCardToDeck` low-risk.
- **Task breakdown:** `CardService` with a `CardQuery` abstraction (state/deck/text/suspended/sort); virtualized table UI bound to `CardService`; editor wiring `updateNoteContent`; multi-select bulk (delete, move-deck, suspend/unsuspend).
- **Boundary (ADR-004):** `CardQuery` operates as client-side filtering over already-public `CardView` data. Any narrowing beyond that — an indexed or remote-backed query — is subject to ADR-004 and the pending retrieval-reconciliation ADR; **no consumer-side index/cache** may be introduced in the Service layer.

### M3 — Deck Management → `DeckService` + `AppDataRepository`
- **Objective:** organize by subject; study a chosen deck.
- **Layer:** Services (`DeckService`).
- **Dependencies:** M0 (`AppDataRepository`), M2 (bulk-move).
- **Complexity:** M. Engine-risk: low.
- **Task breakdown:** deck metadata (name/color/parent) in `AppDataRepository`; `deckId` stays on Card (scheduling scope); deck-scoped study as `StudyService` policy; hierarchy seam defined, implementation deferred.

### M4 — Statistics → `StatsService` *(read-only; consumer of the domain-event stream)*
- **Objective:** Anki-comparable stats, built as a **read model** over the Review Log and the domain-event stream.
- **Layer:** Services (`StatsService`, pure/read-only).
- **Dependencies:** M0 (consumes the `ReviewRecorded` event emitted there). No new data (log is self-sufficient). **Parallelizable** from any point after M0.
- **Complexity:** M (compute trivial, viz is the work). Engine-risk: **none** (read-only).
- **Task breakdown:** future-due forecast; counts-by-state; reviews/day history; retention; per-deck breakdown.
- **Event direction:** `StatsService` is a **consumer** — it subscribes to the `ReviewRecorded` domain event (emitted by the write-path in M0) and reads the Review Log to derive statistical views. **It emits no events of its own.** The same domain-event stream is what Health/Finance/Ministry would independently subscribe to; Stats is one consumer among peers, never the source.

### M5 — Extensible Note Model *(seam early; implementation post-Beta)*
- **Objective:** evolve the current fixed content shape (`Note = {front, back}` + bounded `forward`/`reverse` enum) into an **extensible note model** — supporting arbitrary fields, note types, templates, and media references.
- **Layer:** domain evolution inside the Engine bounded context.
- **Dependencies:** design the model boundary early; implement **post-Beta**.
- **Complexity:** L. Engine-risk: high (domain-model change + Note migration).
- **Task breakdown (deferred):** design the **extensible note model** early as a cheap seam — its **concrete representation is an ADR decision**, not fixed here; then media (audio/images — candidate for a shared A-Lex Core blob store); cloze; import fidelity.

### M6 — Ecosystem Shells & Integration *(post-Beta; seam now)*
- **Objective:** mobile shell; A-Lex Core embedding; shared storage/identity/sync from Core.
- **Layer:** UI shells + Module Contract + `SyncService`.
- **Task breakdown:** define `SyncStore`/`identity` DI seams now; implement shells and sync post-Beta. Cloud Sync remains post-MVP.

---

## 5. Recommended implementation order

```
M0 (thin foundation)
   └─► M1 StudyService+Settings ─► M2 CardService+UI ─► M3 DeckService
   M4 StatsService (read-only) ── parallel, any time after M0
   M5 extensible-note-model seam: design early ── implement post-Beta
   M6 SyncStore/identity seams early ── shells post-Beta
```

- **M0 first, thin** — so no feature accretes coupling; most of M0 dissolves into M1–M4.
- **Feature order M1→M2→M3 preserved** (fastest path to daily usability).
- **M4 elevated & parallelized** — zero-risk (read-only), and it is the **first consumer of the domain-event stream** (not a source).
- **M5 split** into "seam early / implementation post-Beta."
- Batch all Dexie migrations (`suspended`, app-data) into a single upgrade after Protocol Freeze lifts. The **undo ADR** and the **extensible-note-model seam** are the two "design-early" items.

---

## 6. Independent follow-up — app-shell precache

The app-shell precache follow-up remains intentionally **outside the ALSAVI Beta roadmap**. It is an **independent engineering item**, recorded in `PROGRESS.md` (HEAD `4b68b07`) as an open follow-up finding, not yet scoped. When it is acted on it will be opened as **its own engineering task (number to be assigned when opened)**, scheduled **after Protocol Freeze is lifted and before public release.** Its scheduling is **intentionally independent** from Beta feature development and does not gate, and is not gated by, any milestone above.

**Update (2026-07-21).** Number assigned: this item is implemented as part of **`tasks/TASK_018.md`** (GitHub Pages production deployment), which the owner directed ahead of the originally planned Day-14 durability checkpoint — see `PROGRESS.md`, 2026-07-21 entry, for the Protocol Freeze lift decision. This is an infrastructure/deployment change, not a Beta feature milestone; it does not itself alter the Beta feature-completeness gating in §0/§7 above, which remains a separate, still-open question.

---

## 7. Definition of ALSAVI Beta

ALSAVI can **honestly replace Anki for one daily user** when **all** non-caveat items hold:

**Daily study**
- [ ] New-cards/day limit enforced (configurable).
- [ ] Max-reviews/day limit enforced (configurable).
- [ ] Undo of the last answer works, consistent with the Review Log invariant.
- [ ] On-device review session with FSRS intervals identical to desktop *(depends on the durability experiment's DoD-12 read-back; see §0)*.

**Cards**
- [ ] Card editor (edit front/back via `updateNoteContent`, reflected on all siblings).
- [ ] Card browser (paged/virtualized; front, back, deck, state, due, reps/lapses).
- [ ] Search by text across front/back.
- [ ] Filter by state, deck, suspended.
- [ ] Sort by at least due and created.
- [ ] Bulk: delete, move-deck, suspend/unsuspend.
- [ ] Suspend/unsuspend a single card; suspended cards never appear in study.

**Decks**
- [ ] Create a deck and assign cards (single + bulk).
- [ ] Choose a deck and study only that deck.

**Statistics**
- [ ] Future-due forecast (next N days).
- [ ] Counts by state (new / learning / young / mature).
- [ ] Reviews-per-day history.
- [ ] Retention (with per-deck breakdown).

**Data safety**
- [ ] Export / restore verified (done).
- [ ] On-device IndexedDB durability experiment **completed successfully** per authoritative documentation (see §0); backup remains insurance until then.

**Honesty caveats (documented, not hidden) — acceptable for Beta only if the daily user's decks don't rely on them:**
- [ ] **Media (audio/images) and cloze are not yet supported**; importing such Anki decks loses that content. Beta honestly replaces Anki for **plain-text / basic + reversed** decks (the language-vocabulary case). Audio/image/cloze-dependent daily decks are **not** yet served (M5, post-Beta).
- [ ] No tags, subdecks, flags, custom note types, or filtered/custom study — deferred; none required for the single-user text-deck daily workflow.

When every non-caveat box is checked **and** the durability experiment has completed successfully per authoritative documentation, ALSAVI Beta is a truthful Anki replacement for a single daily user on plain-text decks — reached without Cloud Sync, accounts, or AI.

---

## 8. Preserved constraints (unchanged)

- **Engine invariants** (determinism, core autonomy, Review Log = source of truth, access only via public API, `Scheduler`/`EngineStore` ports) — all preserved; Services build **on top of** these boundaries.
- **No big-bang rewrite** — M0 extracts existing orchestration and defines interfaces; behavior-preserving, test-covered.
- **Protocol Freeze & durability gating** — honored; no deploy until the experiment completes per authoritative documentation; schema migrations batched into one upgrade afterward.

---

## 9. Relationship to the engineering task stream

- This document is a **product/planning artifact**, not an engineering task: it has no Definition of Done and no final report, and it **reserves no `TASK_NNN` numbers**.
- Each milestone (M0–M6) and the §6 follow-up become **their own engineering task when officially opened**, with the number assigned at that moment.
- Architectural decisions named here (Engine-vs-app-data boundary, Undo vs append-only log, Module Contract, Domain Events, extensible note model) are routed to **ADRs** in `docs/adr/`, not to task numbers.

---

### Revision history
- Established as the authoritative planning document for "ALSAVI Beta — Anki Replacement." Wording is number-neutral: no engineering task numbers are reserved; the app-shell precache follow-up (§6) will receive its number when opened. M4 `StatsService` is a consumer (not a source) of domain events; M5 is framed as an extensible note model with representation deferred to ADR.
