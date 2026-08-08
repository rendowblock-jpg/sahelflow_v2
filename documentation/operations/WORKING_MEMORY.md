# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-08
> **Protected main before the active release PR:** `6a9c3e9372e9994428e65dbbc79303cf08160db0`
> **Latest application-changing protected merge:** PR #223 at `23f1bc3912aecfd2a32c591a18fcca70bf454daa`
> **Validated Phase 6/7 source head:** `fa0ff6de649421c879f62364383a363b61c71bfc`
> **Phase 5 product baseline:** PR #220 / `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Founder-accepted baseline:** Internal.5
> **Execution epic:** issue #164
> **Retained evidence:** #201, #214, #221, #226
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Active branch:** `agent/internal-14-phase6-founder-checkpoint`
> **Active PR:** #227 — Internal.14 Phase 5–6 Founder checkpoint release request
> **PR state:** draft, unmerged, unpublished; installed replacement evidence is still blocking
> **Last installed-tested code head:** `8640ddc2b616aaf5e6d5027f7302e80062673110`
> **Session handoff:** [`SESSION_HANDOFF_2026-08-08_INTERNAL14.md`](SESSION_HANDOFF_2026-08-08_INTERNAL14.md)

Live GitHub is authority. Re-fetch protected `main`, PR #227, its exact current
head, review threads and Actions before any write. The branch may advance through
documentation-only reconciliation after the last installed-tested code SHA; never
promote such a docs head into installed evidence.

## Phase 5 closure snapshot

Phase 5 remains closed at the protected-source + controlled-browser layer through
PR #220 / issue #208. The Phase 5 product baseline is
`cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`.

Issue #221 retains Founder-installed visual acceptance. It does not reopen the
source/browser result.

## Phase 6 source/browser closure

PR #223 merged the integrated Phase 6 correctness and Phase 7 measurement package
from exact validated head `fa0ff6de649421c879f62364383a363b61c71bfc` to
protected application-changing merge
`23f1bc3912aecfd2a32c591a18fcca70bf454daa`.

That source/browser package passed the Required PR and Phase 5 gates, static
AR/FR/EN localization/RTL/accessibility contracts, source quality, migration and
query-plan evidence, all nine integrated Phase 6/7 Playwright journeys, complete
route/reflow sweeps, keyboard/focus/reduced-motion checks and review closure.

The active dependency is installed/human evidence, retained in #221, #226 after
the current installed checkpoint is satisfied. Do not restart a general Phase 5/6
source wave.

## Internal.14 release checkpoint

PR #227 requests one unique Founder-test milestone:

- app `1.0.0-internal.14`;
- MSI `1.0.0.14`;
- `release-on-version-authority.yml` remains the single signed-release dispatcher;
- `dispatch-internal-14.yml` remains observer/reporting only;
- ordinary signed release licensing remains protected HTTPS authority;
- the deterministic loopback trial issuer remains confined to the explicit
  Phase 4 restore-evidence build;
- published truth remains Internal.13 until the exact protected signed workflow
  publishes Internal.14.

Do not merge/publish #227 until the installed replacement blocker below is closed,
the exact final code head is fully gated/reviewed, and expected-head merge rules
are satisfied.

## 2026-08-08 installed replacement frontier — session stop

Founder direction for this session was explicit: make one final professional,
evidence-driven attempt; if the focused installed proof still failed, stop
engineering and leave a complete next-session handoff. That stopping condition
was reached. **Do not make another code repair or manually trigger another installed
run from this session.**

### Last installed-tested code

`8640ddc2b616aaf5e6d5027f7302e80062673110`

Commit: `fix(windows): restore blocking survivability sockets`

This commit restored accepted survivability client streams to blocking mode while
keeping the listener nonblocking for shutdown polling. It was a bounded Windows
transport repair only.

Exact-head green runs at that code SHA:

- Phase 6-7 Completion Gate `31281407605`;
- Phase 5 Experience Gate `31281407619`;
- Phase 4 CI trial issuer smoke `31281407662`;
- CI / Required PR gate `31281407722`;
- License Node and authority Windows smoke `31281407608`.

### Final focused installed proof

- run `31281491280`;
- job `93163466194`;
- exact checkout `8640ddc2b616aaf5e6d5027f7302e80062673110`;
- artifact `windows-installed-e2e-31281491280`;
- artifact ID `9028790269`;
- artifact digest `sha256:9541eb2d8799bbdbb0203415c21c9a3b1b2fd56003fd5de405cecf0064d07ef4`.

Passed before failure:

- MSI build;
- installed launch/close/reopen;
- authenticated hydrated WebView UI twice;
- the previous survivability raw request-write boundary;
- independent recovery-kit creation.

Exact first failure from `replacement-restore-error.txt`:

`All-shop source backup was not created.`

The failing harness assertion follows `/api/backup/create` and currently combines
three predicates: HTTP status must be 201, returned `shopCount` must be at least 2,
and returned `location` must exist as a file. The artifact does not record enough
safe response detail to identify which predicate failed. **That is the exact
remaining diagnostic boundary. Do not guess.**

### Previous installed boundary now closed

Run `31279741140` at code head
`4e10200b7b8149e0666304aa21b258559b2873cf` failed earlier with
`SURVIVABILITY_REQUEST_WRITE_FAILED`, despite matching endpoint/source PID 5596.
After `8640ddc2…`, the final installed run advanced beyond that raw write boundary
and through recovery-kit creation. Treat the socket/request-write blocker as closed
unless new direct evidence contradicts it.

Also closed by prior focused evidence in this repair sequence:

- deterministic trial issuer/signing fixture;
- Node Ed25519 entitlement verification;
- Windows license authority fsync/persistence;
- packaged installation-root cache across Next server realms;
- repeated root/context lookup inside one survivability request;
- app/Node/WebView process-lifetime and endpoint/PID mismatch theories;
- independent recovery-kit creation.

Do not restart these investigations without contradictory evidence.

## Exact next-session action

1. Re-read `AGENTS.md`, `CURRENT_STATE.md`, `ROADMAP.md`, this file and
   `SESSION_HANDOFF_2026-08-08_INTERNAL14.md`.
2. Re-fetch protected `main`, live PR #227/head, review threads and Actions; inspect
   any concurrent-agent delta before writing.
3. Preserve `8640ddc2…` as the **last installed-tested code head** even though the
   PR head is expected to be newer from documentation-only commits.
4. Reuse final run `31281491280`, job `93163466194`, artifact `9028790269`.
5. **Before product changes, decompose/capture the three `/api/backup/create`
   predicates safely**: response status/code, returned shop count, and returned
   location existence. Do not expose private seller data or secrets.
6. Only after the exact failing predicate is known, inspect the backup-create API,
   JavaScript/native wrapper and Rust backup implementation that own it.
7. Make one bounded repair and run the smallest direct source/Windows validation.
8. Trigger one focused installed replacement lane only.
9. If and only if that lane becomes fully green, freeze that exact code head, run
   the final required matrix once, complete exact-head adversarial review, merge
   with expected-head binding and observe the one protected signed Internal.14
   publication.
10. Then perform Founder/T470 issue #221. Begin Phase 7 issue #226 only after the
    Phase 6 installed exit is reconciled.

## Phase 7 boundary

Issue #226 remains later work. Required installed evidence still includes T470 cold
launch ≤8 s p95, navigation ≤700 ms p95, indexed search ≤350 ms p95, ordinary local
mutation ≤500 ms p95, declared-floor SSD/HDD/4 GB evidence, large-database behavior,
clean close/reopen/crash recovery and eight-hour stability/resource evidence.

Optimize only from measured failures. Do not weaken accessibility, durability,
canonical state, recovery or required background work for performance.

## Evidence boundaries and non-claims

- #201 — retained native/install evidence;
- #214 — replacement-install recovery certification;
- #221 — Founder-installed Phase 5/6 visual/accessibility acceptance;
- #226 — Phase 7 installed performance/reliability certification.

PR #227 is unmerged. Internal.14 is unpublished. The documentation handoff head is
not installed-tested. Published truth remains Internal.13; Founder-accepted truth
remains Internal.5. No Beta or Stable release exists.

## Hard rules

- one active implementation agent and one coherent branch/PR per product outcome;
- no direct protected-main edits;
- no Phase 1–5 authority weakening;
- active product phase stays Phase 6 until installed exit evidence is recorded;
- no performance optimization without measured evidence;
- exact-head evidence before merge, protected-main verification after merge;
- draft/skipped checks are never promoted into evidence they did not run;
- retained evidence is never described as passed;
- no duplicate release dispatch;
- no production localhost licensing bypass;
- no release/Beta/Stable/Founder-acceptance claim without matching evidence.
