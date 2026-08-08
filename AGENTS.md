# SahelFlow agent entry point

SahelFlow uses the ChatGPT Web Agentic Coding Agent and Desktop Agent with
**one active implementation agent at a time**. GitHub is durable truth. GitHub
Actions is clean-checkout validation/evidence infrastructure, not a coding agent.

The Founder-owned Windows checkout is evidence-bearing local state. Never reset,
delete, overwrite or replace unrelated work, canonical AppData, shop databases,
registry, keys or retained evidence merely to simplify development.

## Verified product frontier

- Latest application-changing protected merge: PR #223 at
  `23f1bc3912aecfd2a32c591a18fcca70bf454daa`.
- Protected documentation reconciliation: PR #225 at
  `6a9c3e9372e9994428e65dbbc79303cf08160db0`.
- Validated Phase 6/7 source head:
  `fa0ff6de649421c879f62364383a363b61c71bfc`.
- Phase 5 protected product baseline:
  `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`.
- Phase 5 issue #208: closed at protected-source + controlled-browser level.
- Phase 6 source/browser package: complete and protected through PR #223.
- Active product phase: **Phase 6 — Arabic, RTL and accessibility parity**.
- Current Phase 6 sub-frontier: **installed/human exit checkpoint**, not another
  broad source/browser implementation wave.
- Active release-preparation PR: #227 — Internal.14 Phase 5–6 Founder checkpoint.
- PR #227 remains draft, unmerged and unpublished.
- Last installed-tested Internal.14 **code** head:
  `8640ddc2b616aaf5e6d5027f7302e80062673110`.
- Current exact installed blocker: the `/api/backup/create` all-shop source-backup
  assertion in focused replacement evidence; the retained failure does not yet
  distinguish HTTP status, returned shop count, or returned backup-path existence.
- Final stopped-session installed run: `31281491280`, job `93163466194`, artifact
  `windows-installed-e2e-31281491280` / ID `9028790269`.
- Detailed next-session handoff is consolidated in
  `documentation/operations/WORKING_MEMORY.md`.
- Execution epic: issue #164.
- Retained installed/human evidence: issues #201, #214, #221 and #226.
- Published executable source remains
  `fb32faedc5ecfc1718e395824f437b805cbb9ef2`.
- Requested Founder checkpoint candidate is `1.0.0-internal.14` / MSI
  `1.0.0.14`; it is not published until the exact protected-main signed workflow
  succeeds.
- Published release remains `1.0.0-internal.13` / MSI `1.0.0.13`.
- Founder-installed Internal.13 is observed but not Founder-accepted; accepted
  baseline remains Internal.5.

Always re-read live protected `main`, open PRs/issues and current Actions state at
the start of a session. Documentation-only reconciliation can advance the active
PR head without changing the last installed-tested code SHA. Do not copy a SHA from
this document into a write action without re-fetching live GitHub.

## 2026-08-08 session stop and next-session entry

Founder direction was explicit: after one final evidence-driven installed attempt,
a further failure ends engineering for the session and requires a complete handoff.
That stop was reached. The final attempt **must not be followed by another code fix,
manual installed rerun, full matrix, merge or release from the same session**.

The final installed candidate at `8640ddc2…` successfully passed MSI build,
installed launch/close/reopen, hydrated authenticated WebView UI twice, the prior
native request-write boundary and independent recovery-kit creation. It then failed
with:

`All-shop source backup was not created.`

The harness check immediately after `POST /api/backup/create` combines three
requirements: status 201, `shopCount >= 2`, and existence of the returned backup
`location`. The artifact does not safely identify which predicate failed.

The next implementation session therefore starts by **decomposing or capturing
those three safe backup-create facts before changing product code**. Only after the
failing predicate is known should the agent inspect the owning API/JavaScript-native/
Rust backup layer and make one bounded repair.

Do not restart the already-closed investigations unless contradictory evidence
appears: CI trial issuer/signing fixture, Ed25519 Node verification, Windows license
fsync/persistence, process-wide packaged root cache, single request root/context
snapshot, app/Node/WebView lifetime, endpoint/PID mismatch, raw survivability
request write, or independent recovery-kit creation.

`documentation/operations/WORKING_MEMORY.md` contains exact run IDs, artifact
digest, failure progression and the required next-session order.

## Start here

Read these active authorities in order:

1. [`documentation/README.md`](documentation/README.md)
2. [`documentation/product/PRODUCT.md`](documentation/product/PRODUCT.md)
3. [`documentation/product/EXPERIENCE.md`](documentation/product/EXPERIENCE.md)
4. [`documentation/product/DECISIONS.md`](documentation/product/DECISIONS.md)
5. [`documentation/system/ARCHITECTURE.md`](documentation/system/ARCHITECTURE.md)
6. [`documentation/system/CURRENT_STATE.md`](documentation/system/CURRENT_STATE.md)
7. [`documentation/system/ROADMAP.md`](documentation/system/ROADMAP.md)
8. [`documentation/operations/WORKFLOW.md`](documentation/operations/WORKFLOW.md)
9. [`documentation/operations/WORKING_MEMORY.md`](documentation/operations/WORKING_MEMORY.md)
10. [`documentation/research/RESEARCH.md`](documentation/research/RESEARCH.md)

Issue #164 is the execution dashboard, not an extra product/architecture authority.

## Phase 5 is closed

Do not restart or broadly re-audit Phase 5 merely because old prompts or archived
reports mention it. PR #220 merged the complete whole-product source/browser
convergence with green exact-head source CI, a blocking route-completion matrix,
fresh-install/login evidence, representative LTR and Arabic RTL route traversal,
viewport containment and zero unresolved review threads.

Retained evidence issue #221 owns the human installed Phase 5 visual checkpoint
and the applicable Phase 6 Arabic/RTL/accessibility Windows checkpoint. Never
report that evidence as passed unless the Founder actually records it.

## Active Phase 6 contract

Phase 6 source/browser work is complete through PR #223. The current objective is
to prove the already-protected result on an installed Windows/Tauri build, not to
repeat the exhaustive route/source audit.

The exact validated Phase 6/7 head already passed the Required PR gate, Required
Phase 5 Experience gate, static localization/RTL/accessibility contract, complete
source-quality diagnostics, SQLite planner checks, full EN/FR/AR route sweeps,
200%-equivalent reflow, keyboard/focus/dialog/reduced-motion evidence and the
integrated Phase 6/7 browser gate.

The remaining formal Phase 6 exit evidence is:

- native-Arabic human language, joining, line-height and reading-flow review;
- installed keyboard-only critical journeys and focus entry/return behavior;
- critical accessible names/descriptions and status/error/recovery semantics;
- representative Arabic RTL geometry at 1366×768 and applicable zoom/reflow;
- signed installed Windows/Tauri observation;
- explicit Founder accept/reject evidence reconciling issue #221.

Before that human checkpoint, PR #227 must close its installed replacement evidence
without weakening survivability, authority or release rules.

Issue #226 owns Phase 7 installed performance/reliability certification and begins
after the Phase 6 installed checkpoint is satisfied. Performance changes are
measurement-driven only.

## Internal.14 release checkpoint

PR #227 exists to bind the protected Phase 5–6 source result to one unique signed
Founder checkpoint. Until the exact protected signed workflow publishes the
candidate, release truth remains Internal.13.

Release invariants:

- `release-on-version-authority.yml` is the single signed-release dispatcher;
- `dispatch-internal-14.yml` is observer/reporting only and must not dispatch a
  second build;
- normal signed release licensing requires protected HTTPS configuration;
- the deterministic loopback issuer is confined to the explicit restore-evidence
  build and is not a production runtime override;
- do not merge/publish until the focused installed replacement proof and final
  exact-head required matrix/review are green;
- automated evidence is not Founder acceptance.

## Permanent engineering rules

### One authority per business fact

Every order status, stock movement, money movement, customer identity, provider
effect, license right and recovery fact has one canonical owner. No UI/API/import/
AI/provider path may bypass it.

### Permission before protected read

Resolve actor/shop/action authority **before** querying protected contact,
financial, risk, identity or secret fields. Projection is defense-in-depth, not a
substitute for permission-before-read.

### Local-first and Windows-first

SQLite is one file per shop. Native/Tauri owns installation-level lifecycle,
registry, shop switching and recovery. Treat packaged Windows runtime behavior as
product behavior, not a browser afterthought.

### No silent truth

Do not show sampled lists as totals, optimistic business status as committed,
local-only sorts as global, hidden export caps, fake actions or recovery success
without authoritative proof.

### Durable effects and recovery

Provider, AI, automation and financial effects remain replayable/auditable with
idempotency, conflict/recovery semantics and explicit external capability truth.

## Repository hygiene

Before edits:

```bash
git status
git branch --show-current
git log -1 --oneline
```

Rules:

- work from a task branch/PR, never directly on protected `main`;
- do not force-push/reset/rebase away another agent’s work;
- do not modify version/release/native/recovery authorities unless the task truly
  requires it;
- do not create ad-hoc worktrees inside this repo;
- never commit credentials, signing material, private seller data or secret values;
- update active authority docs when the execution frontier materially changes.

## Delivery workflow

Use the Founder-approved audit-first pattern:

```text
live protected source
→ complete reconnaissance
→ consolidated Problem Register
→ freeze shared contracts
→ coherent implementation batch
→ self-review full diff
→ exact-head adversarial review
→ selected Level 1/2/3 gates
→ consolidated repair batch
→ expected-head merge
→ protected-main verification
→ documentation reconciliation
```

For the current PR #227 blocker, this means: diagnose the exact backup-create
predicate first, repair once, run the smallest focused validation, then one focused
installed proof. Do not rerun the full matrix until the installed proof is green.

## Evidence and claims

Keep these realities separate:

- integrated protected source;
- proposed PR source;
- clean-checkout CI/browser evidence;
- signed distributable;
- installed Founder-observed application;
- Founder acceptance;
- Beta/Stable certification.

A lower layer cannot claim a higher one. Retained issues #201, #214, #221 and
#226 are explicit evidence obligations, not passing proof.

## Review/merge rule

Before merge:

- freeze the exact final **code** head;
- all selected blocking gates pass;
- collect and repair all actionable review findings;
- latest-head adversarial review is clean (zero unresolved P0/P1; resolve threads
  only after the fix actually exists);
- use expected-head merge protection;
- re-read protected `main` after merge.

Coverage is currently informational in general CI by Founder direction; do not use
that as permission to weaken TypeScript, ESLint, Vitest, Prisma, dependency audit,
migration, authority, browser, accessibility or risk-selected native gates.
