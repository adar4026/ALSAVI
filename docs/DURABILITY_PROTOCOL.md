# Durability Protocol — 14-day On-device IndexedDB Inactivity Test

**Status:** DRAFT — not authoritative. Owner decisions in §4-12 are
ratified (see the Ratification record below); §13 remains open by design.

**Ratification record.** On 2026-07-10, the project owner ratified all nine
proposed decisions (§4-12) without amendment, except for §9 where the owner
explicitly decided that iOS automatic updates are to be disabled for the
duration of the 14-day observation window. This ratification records the
owner's decisions only. It does not by itself change the document's
publication status or authority, which remain governed by the project's
documentation workflow.

## 1. Purpose

[Repository-derived] Verify that ALSAVI's local IndexedDB data survives
prolonged on-device inactivity under iOS/WebKit storage-eviction policy,
per the Mobile MVP Decision: "Durability локального хранения закрывается
отдельным эмпирическим тестом (2-недельный on-device inactivity-тест), вне
scope первого установочного билда." (docs/MOBILE_MVP_DECISION.md:51-53)

## 2. Scope

[Repository-derived] On-device IndexedDB durability only. Does not cover:
Service Worker cache versioning (closed separately, TASK_016), HTTPS/mkcert
deployment-path validation, or real Safari/iOS WebKit functional identity
(DoD 12) — per PROGRESS.md, TASK_016 entry, «Границы верификации»: "Это
НЕ воспроизводит и НЕ валидирует HTTPS/mkcert deployment path … DoD 12 …
остаётся ОТКРЫТЫМ и вне scope TASK_016."

## 3. Protected invariant

[Repository-derived — owner decision, 2026-07-10, recorded in PROGRESS.md]
"Protocol Freeze защищает стабильность задеплоенной сборки/SHA до и во
время on-device durability-эксперимента IndexedDB." (PROGRESS.md,
2026-07-10 entry)

## 4. Day 0 declaration

[Repository-derived — процедура] Per PROGRESS.md (2026-07-10 entry,
«Согласованный следующий шаг»): "Day 0 объявляется против … свежепроверенного
baseline, а не против исторически реконструированного SHA," established via:
fresh production build from an owner-selected repo state → on-device install
→ owner manually records the deployment event (date + resulting SHA) → Day 0
declared against that baseline.

[Ratified 2026-07-10] The specific Day-0 declaration entry format, and
confirmation of whether the already-recorded deployment event (main HEAD
`ad3f1af`, dated 2026-07-10, per this session's STEP 2 build) qualifies as
this baseline, is ratified (see Ratification record above and §5).

**(ratified 2026-07-10)**
The Day-0 declaration record (to be written into PROGRESS.md when Day 0 is
declared) must be self-contained: exact declaration timestamp (date + time
+ timezone), reference to the baseline SHA, description/export-hash of the
canonical dataset (§6), explicit reference to the idle-regime rules (§7–9),
and the computed Day-14 end timestamp. Rationale: a future session without
access to this chat must be able to conduct the Day-14 check from this
record alone.

## 5. Canonical baseline

Ratified 2026-07-10 (see Ratification record above). The repository does not specify what
constitutes the canonical on-device baseline beyond "a freshly verified
build, installed, with the deployment event manually recorded" (PROGRESS.md,
2026-07-10 entry). It does not specify: what functional checks (if any)
must pass on-device before the baseline is considered valid, beyond the
already-open DoD 10-12 (PROGRESS.md, Session Handover §2).

**(ratified 2026-07-10)**
The already-recorded deployment event (main HEAD `ad3f1af`, dated
2026-07-10, on-device `/sw.js` verified via direct Safari tab) **qualifies**
as the canonical baseline, independent of the
still-open Service Worker registration question. Rationale: `sw.js`
explicitly does not touch IndexedDB (`sw.js:9-12` — "IndexedDB is not even
reachable from here"); the durability experiment concerns WebKit/ITP
storage eviction of IndexedDB, a mechanism independent of the SW.

## 6. Canonical dataset

Ratified 2026-07-10 (see Ratification record above). No repository document defines a seed
dataset, card count, or content to be created on-device before the
observation period begins.

**(ratified 2026-07-10)**
A hybrid dataset: cards spanning multiple SRS states (new, learning,
review, varying intervals), created on-device, followed immediately by an
Export (backup) taken as the Day-0 ground-truth snapshot.

## 7. Observation period

[Repository-derived — duration only] "2-недельный on-device inactivity-тест"
/ "a 2-week on-device inactivity test" (docs/MOBILE_MVP_DECISION.md:52;
apps/web/README.md:112; tasks/TASK_015.md).

Ratified 2026-07-10 (see Ratification record above), covering the idle-regime definition (what
device/app usage is permitted vs. forbidden during the 14 days) and the
exact start/end timestamps. No repository document specifies this.

**(ratified 2026-07-10)**
Zero interaction with the installed PWA for the full 14-day window. The
app is opened only twice: at Day-0 declaration and at the Day-14 check.
Start timestamp = the exact moment of Day-0 declaration (date+time+
timezone); end timestamp = start + exactly 14×24 hours (not calendar-day
counting).

## 8. Allowed actions

Ratified 2026-07-10 (see Ratification record above). Not specified in the repository beyond the
implicit interim safety net: "до его прохождения `Export (backup)` —
страховка" (PROGRESS.md, Session Handover §5), which establishes that
taking a backup export is treated as acceptable/expected practice
independent of the test, but does not state whether taking one *during*
the observation window is permitted without disturbing the test.

**(ratified 2026-07-10)**
Taking an Export (backup) during the window is explicitly FORBIDDEN —
opening the PWA to export could itself reset ITP-related engagement
timers, which is the exact confound the idle-regime restriction exists to
prevent.

## 9. Forbidden actions

[Repository-derived, partial] Rebuild/redeploy of the frozen build is
forbidden for the duration: "Вся реализация и любые rebuild/redeploy
остаются под Protocol Freeze" (PROGRESS.md, 2026-07-09 entry); "no deploy
until the experiment completes per authoritative documentation"
(docs/ROADMAP_ALSAVI_BETA.md §8).

Ratified 2026-07-10 (see Ratification record above), covering whether opening the app, using Safari
generally on the device, or other device activity is forbidden during the
window. Not specified in the repository.

**(ratified 2026-07-10)**
No interaction with the installed PWA during the window (per §7–8).
iOS automatic updates are disabled for the window's duration —
decided by the owner (see Ratification record above), since a system
update could alter default storage-eviction policy.

## 10. Success criteria

Ratified 2026-07-10 (see Ratification record above). The repository states the goal ("verify
durability") but no document defines a measurable pass condition (e.g.,
what data must be present, how it is checked, what counts as "survived").

**(ratified 2026-07-10)**
Byte-identical comparison between the Day-0 Export (§6) and a Day-14
Export, record by record.

## 11. Failure criteria

Ratified 2026-07-10 (see Ratification record above). Not specified in the repository.

**(ratified 2026-07-10)**
Two distinguished subtypes, both counting as durability failure but
categorized separately for follow-up: (a) full eviction — entire origin
storage cleared; (b) partial loss/corruption — some records missing or
altered while others persist. The distinction matters because (a) points
to ITP storage-eviction policy while (b) points more likely to an
application/persistence bug.

## 12. Interpretation rules

Ratified 2026-07-10 (see Ratification record above). Not specified in the repository. (Note:
this session's investigation surfaced a relevant open observation — Service
Worker registration status is unresolved and could confound interpretation
of an on-device inspection — recorded in PROGRESS.md, 2026-07-10 entry,
«Открытые наблюдения», but that record does not itself constitute
interpretation rules for the durability test.)

**(ratified 2026-07-10)**
On Day 14, require agreement between two independent verification methods
before declaring a result: (1) the app's own UI/statistics (reads through
the Dexie/engine layer), and (2) direct IndexedDB inspection via Web
Inspector. If both agree, declare per §10/§11. If they disagree, do NOT
declare failure automatically — record the result as **INCONCLUSIVE** with
the discrepancy noted, and treat re-running the experiment from a fresh
baseline as the next step rather than closing the durability gate on an
ambiguous signal.

## 13. Completion criteria

TBD — owner decision required. Not specified in the repository beyond the
gating relationship: "ALSAVI Beta is gated on successful completion of the
on-device IndexedDB durability experiment" (docs/ROADMAP_ALSAVI_BETA.md §0).
No document defines what "completion" itself requires (e.g., who declares
it, what evidence is recorded).

*Editorial note (non-normative):* this item structurally depends on §10–12
being finalized first — defining the completion report format before
success/failure/interpretation rules are confirmed risks a format that
cannot accommodate the eventual actual rules (e.g., the INCONCLUSIVE
outcome in §12 may not fit a binary pass/fail template). §13 intentionally
remains unresolved until §§10–12 are settled; this note explains that
sequencing choice and is not itself a proposed decision.

## 14. Relationship to Protocol Freeze

[Repository-derived] Protocol Freeze holds implementation and
rebuild/redeploy for the duration of this experiment (PROGRESS.md,
2026-07-09 and 2026-07-10 entries; docs/ROADMAP_ALSAVI_BETA.md §0, §8).
This document's Day 0 declaration (§4) is the trigger that starts the
freeze's protected window; the experiment's completion (§13, TBD) is
Protocol Freeze's documented lift criterion.

## 15. References

- PROGRESS.md — 2026-07-10 entry (Protocol Freeze invariant, deployment
  event procedure); 2026-07-09 entry (Beta gating, Day 0 status); Session
  Handover TASK_015 → TASK_016 §5-6; TASK_016 entry («Границы верификации»,
  «Следующий шаг»); TASK_015 entry.
- PROJECT_CONSTITUTION.md — no durability-specific content (checked).
- docs/ROADMAP_ALSAVI_BETA.md §0, §7, §8.
- docs/MOBILE_MVP_DECISION.md.
- apps/web/README.md §"Notes".
- tasks/TASK_015.md, tasks/TASK_016.md.
