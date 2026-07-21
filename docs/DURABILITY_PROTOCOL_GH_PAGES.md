# Durability Protocol (v2) — GitHub Pages origin, 14-day on-device IndexedDB inactivity test

**Status: `CANCELLED BY OWNER`, 2026-07-21.** Not `FAIL`, not `completed` —
the Day-14 check (§8) was never performed, so this observation produces **no
durability conclusion in either direction**. Cancelled because the owner
physically verified on iPhone that the production deployment works
end-to-end (open, launch independent of MacBook/local server, Add to Home
Screen, backup export/import + IndexedDB restore) and decided the 14-day idle
window is no longer a required precondition for normal use or development.
Full record: `PROGRESS.md`, 2026-07-21 entry ("Owner decision: GitHub Pages
durability observation CANCELLED BY OWNER"). This is a new, independent
protocol for the GitHub Pages production origin — it was never a resumption of
the terminated LAN-origin experiment (`docs/DURABILITY_PROTOCOL.md`), whose
result is separately recorded as `TERMINATED EARLY` / `INCONCLUSIVE`.

**Effective immediately:** the idle-regime / zero-interaction rules (§5) no
longer apply; `apps/web` may be opened, used, rebuilt, and redeployed
normally; no Protocol Freeze or durability gate from this protocol remains
active.

**Historical record — preserved, not rewritten.** Day 0 was declared
2026-07-21, 22:42:37, +02:00 (corrected from an earlier 22:30 declaration —
see `PROGRESS.md`), against baseline `alsavi-backup-2026-07-21.json`
(SHA-256 `1e0a92d706576ead747dec08609c58a9d23fcad25b433aa909eda155e7805f9c`,
5 notes / 10 cards / 0 reviews), with a computed (now cancelled) Day-14
checkpoint of 2026-08-04, 22:42:37, +02:00. The backup file remains a valid,
checksummed recovery baseline — no Day-14 comparison against it is required.
Full detail: `PROGRESS.md`, 2026-07-21 entries ("Backup restore verified…"
and the Day-0 declaration below it).

## 1. Why a new protocol, not a resumed one

The terminated experiment observed `http://192.168.1.152` (the MacBook's LAN
IP, served by `vite preview`/mkcert). The production app now lives at a
different origin, **`https://adar4026.github.io/ALSAVI/`**. Browser storage
(IndexedDB, Cache Storage, ITP engagement heuristics) is origin-scoped — none
of it carries over. The underlying question (does iOS/WebKit evict this app's
IndexedDB data under prolonged inactivity?) is unchanged, so the same 14-day
methodology applies, against the new origin, from a fresh Day 0.

## 2. Scope

On-device IndexedDB durability only, on the GitHub Pages production origin.
Does not re-open: app-shell precache correctness (implemented and verified —
`tasks/TASK_018.md`), base-path/deployment correctness (verified against the
live production URL — see `PROGRESS.md`, 2026-07-21 entry), or the terminated
LAN-origin experiment.

## 3. Protected invariant

While this observation is running, the deployed production build (identified
by its stamped `CACHE_VERSION`, i.e. the deploying commit's 12-char sha) must
not change: no push to `main` that touches `apps/web/**` or triggers
`.github/workflows/deploy-pages.yml`. Unlike the original LAN Protocol Freeze,
this does **not** block unrelated engineering work (Engine, AI Layer, other
packages, docs) — only redeploys of `apps/web` that would change the running
production service worker mid-observation.

## 4. Day 0 — exact record required

When the owner performs the steps in "How to start" below, record in
`PROGRESS.md` (new dated entry, this document's format):

- Exact declaration timestamp (date + time + timezone).
- Production origin: `https://adar4026.github.io/ALSAVI/`.
- Source deployment sha (`git rev-parse --short=12 HEAD` of the deployed
  commit) and confirmation it matches the live `CACHE_VERSION` (read `/sw.js`
  or inspect Cache Storage keys, as done during this task's production
  verification).
- Description of the canonical seed dataset (card count, SRS states
  represented) and the Day-0 Export filename/timestamp taken immediately after
  creating it, in the same on-device session.
- Computed Day-14 end timestamp: start + exactly 14×24 hours (336h), not
  calendar-day counting.

## 5. Idle-regime rules (unchanged rationale from the original protocol)

- Zero interaction with the installed PWA for the full 14-day window; opened
  only twice — Day-0 declaration and the Day-14 check.
- No Export taken during the window (would reset ITP engagement timers — the
  exact confound this restriction exists to prevent).
- iOS automatic updates disabled on the device for the window's duration.
- The Day-14 check must be performed on the same device/origin as Day-0
  dataset creation.

## 6. Success criteria

Byte-identical comparison between the Day-0 Export and a Day-14 Export,
record by record — identical to the original protocol's §10.

## 7. Failure criteria

Two distinguished subtypes (identical to the original protocol's §11):
(a) full eviction — entire origin storage cleared; (b) partial loss/corruption
— some records missing or altered while others persist.

## 8. Interpretation rule

On Day 14, require agreement between two independent verification methods:
(1) the app's own UI/statistics, (2) direct IndexedDB inspection via Web
Inspector. If they agree, declare per §6/§7. If they disagree, record
**INCONCLUSIVE** with the discrepancy noted, and treat re-running from a fresh
Day 0 as the next step rather than declaring failure on an ambiguous signal —
identical to the original protocol's §12.

## 9. Completion criteria (explicit — not `TBD`)

This protocol is **complete** — regardless of outcome — as soon as:

1. The Day-14 check (§5) has been performed following the interpretation rule
   (§8), and
2. A result — `PASS`, `FAIL (full)`, `FAIL (partial)`, or `INCONCLUSIVE` — is
   recorded in `PROGRESS.md` by the owner or on the owner's confirmation.

Recording the result **is** completion; a `FAIL` or `INCONCLUSIVE` outcome
does not obligate an indefinite re-run loop. What it does obligate: the result
becomes input to a **separate** owner decision about whether GitHub
Pages/PWA-on-iOS storage durability is acceptable for continued daily use —
that decision is out of this protocol's scope and is made once real evidence
exists, not preemptively here.

## 10. How to start

1. On the iPhone, in Safari, open `https://adar4026.github.io/ALSAVI/`.
2. Share → Add to Home Screen → launch ALSAVI from the Home Screen (standalone
   mode).
3. Create the canonical seed dataset (cards spanning new/learning/review
   states).
4. Immediately take an Export (backup) in the same session — this is the Day-0
   ground-truth snapshot.
5. Record the Day-0 entry in `PROGRESS.md` per §4 above.
6. Do not open the app again until the computed Day-14 timestamp.

## 11. References

- `docs/DURABILITY_PROTOCOL.md` — the original (terminated) protocol; §1-14
  there remain the source of the shared methodology this document reuses.
- `PROGRESS.md`, 2026-07-21 entry — termination decision and this
  deployment's execution record.
- `tasks/TASK_018.md` — the deployment task this protocol follows.
