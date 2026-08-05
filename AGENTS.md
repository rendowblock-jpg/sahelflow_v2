# SahelFlow agent entry point

SahelFlow uses the ChatGPT Web Agentic Coding Agent and the Desktop Agent with
**one active implementation agent at a time**. GitHub is durable truth. GitHub
Actions is clean-checkout validation and artifact infrastructure, not a coding
agent.

The Founder-owned Windows checkout is evidence-bearing local state. Never reset,
delete or overwrite unrelated work, canonical AppData, shop databases, registry,
keys or retained evidence merely to simplify development.

## Start here

1. Read [`documentation/README.md`](documentation/README.md).
2. Read FD-028, FD-029 and FD-030 in
   [`documentation/product/DECISIONS.md`](documentation/product/DECISIONS.md).
3. Read [`documentation/system/CURRENT_STATE.md`](documentation/system/CURRENT_STATE.md).
4. Read Phase 4 in [`documentation/system/ROADMAP.md`](documentation/system/ROADMAP.md).
5. Read [`documentation/operations/WORKFLOW.md`](documentation/operations/WORKFLOW.md).
6. Read [`documentation/operations/WORKING_MEMORY.md`](documentation/operations/WORKING_MEMORY.md).
7. Read issue #204, issue #164, active PR #207 and retained evidence issue #201.
8. Verify protected `main` `9306564ce5b5ea4b3b13b219aa45d4672ae13184`
   directly on GitHub, then re-fetch the active PR head before every write, review
   request, workflow assessment or merge.
9. Inspect exact source, migrations, tests, native boundaries and production callers
   before trusting implementation claims.

Chat history, screenshots, temporary Git objects, old branches and archived reports
are context only. They never replace a successful commit, live branch head and
GitHub-confirmed file set.

## Current verified frontier

- Protected `main`: `9306564ce5b5ea4b3b13b219aa45d4672ae13184`.
- Latest application-changing protected merge: PR #203 Phase 3 closure at
  `aa4ca0758fd696f4b02fc1975629ac698f9349c3`.
- Latest protected authority merge: PR #206 Phase 4 contract freeze and risk lanes.
- Published executable source: `fb32faedc5ecfc1718e395824f437b805cbb9ef2`.
- Published release: `1.0.0-internal.13` / MSI `1.0.0.13`.
- Founder-installed release: Internal.13; acceptance remains open.
- Founder-accepted baseline: Internal.5.
- Active product phase: Phase 4 — data protection, recovery, migrations and security.
- Active phase issue: #204.
- Active branch: `agent/phase4-protected-data-authority`.
- Active PR: #207 — complete P4-A…P4-F source candidate awaiting final exact-head
  review and selected gates.
- Retained installed evidence issue: #201.
- PR #203 is merged; issue #202 is closed.
- Final validated Phase 3 head: `f0db4116874238d0c415b4725cd2c5f3ef6201da`.
- Final Phase 3 gate `30901725446` passed tests, lint, typecheck, Prisma,
  coverage, production dependency audit and migration status.
- No known Phase 3 P0/P1 remains.
- PR #207 is unmerged and Phase 4 remains open until exact-current-head source,
  Rust, Windows runtime, installed-MSI and review-conversation gates all pass.

Always re-read live GitHub. These values record the verified frontier; they are
not permission to rely on copied state after the repository moves.

## Authority precedence

1. Newer explicit Founder decision for the choice it changes.
2. Product contract.
3. Experience and journey contract.
4. Architecture and invariants.
5. Source-grounded current state.
6. Final roadmap.
7. Workflow.
8. Working Memory.
9. Research and archive.

A lower layer cannot silently weaken a higher layer.

## Completion program

FD-028 defines the final Phase 0–9 program:

0. authority freeze and execution reset;
1. canonical Golden COD business core;
2. identity, authorization, licensing and multi-shop;
3. durable providers, inbox, AI and automations;
4. data protection, recovery, migrations and security;
5. whole-product AAA UI/UX and frontend transformation;
6. Arabic, RTL and accessibility parity;
7. performance and reliability;
8. connected SahelFlow platform;
9. certification, representative beta and Stable.

FD-029 requires uncompromised top-tier class-AAA completion. It does not authorize
an MVP, hidden deferral or fabricated readiness.

## Single-agent and session rule

- The Founder selects either the Web Agent or Desktop Agent as active.
- Only that agent may implement SahelFlow at that time.
- One outcome has one owner, one branch and one PR.
- A frozen-head adversarial review occurs only after implementation stops.
- With one agent, that review is a separated adversarial pass, not an author-written
  independent approval.
- Required security, privacy, legal, accessibility and provider reviews remain
  genuinely independent where the evidence contract requires them.
- Declare one session purpose: governance/planning, research/contract,
  implementation, frozen review/closure or installed evidence.
- The current session is Phase 4 final-candidate static audit, exact-head review,
  selected gate and protected closure.

The historical contract-freeze record was: **Phase 4 exhaustive audit and contract
freeze** under issue #204; no Phase 4 implementation PR is active. That record was
superseded when protected PR #206 authorized PR #207. Preserve it as history, not
as a live restriction.

## Audit-first and batch remediation rule

Before the first production edit of a phase or material package, inspect:

- production callers, routes, pages, commands and background workers;
- models, migrations, existing databases and compatibility projections;
- tests, fixtures, mocks, dynamic imports and failure diagnostics;
- business invariants, idempotency, concurrency and restart behavior;
- trusted actor, exact shop, permissions and protected-field oracles;
- provider effects, receipts, ambiguity, retry and recovery;
- AR/FR/EN, RTL, accessibility, responsive and installed UI states;
- performance, resource use, diagnostics and evidence;
- legacy paths that must be removed or made read-only.

Group findings by root cause. Do not patch one symptom while a competing authority
remains.

```text
complete audit
→ consolidated Problem Register
→ freeze shared contracts
→ coherent root-cause implementation
→ durable skipped-CI checkpoints during implementation
→ complete static audit
→ one frozen exact head
→ complete adversarial/security/privacy review
→ one selected full gate
→ one consolidated repair only if complete diagnostics require it
→ expected-head merge and protected-main verification
```

Phase 3 closure evidence remains in the Phase 3 checkpoints and PR #203. Issue
#204 owns the Phase 4 Problem Register, contracts and exit gate. Historical Phase
4 branches/PRs remain evidence only; never merge or cherry-pick them wholesale
without revalidation on protected current main.

## Validation levels

### Level 1 — Task Gate

Run after each coherent completed task when it adds value without starting the full
phase gate:

- version and documentation authority;
- Prisma generation/validation and migration checks when applicable;
- TypeScript, ESLint and focused/complete Vitest as risk requires;
- targeted parser, crypto, database, Rust or native checks.

Implementation checkpoints may use `[skip ci]` only while the complete Phase 4
candidate is still being assembled. They must be real durable commits.

### Level 2 — Phase Checkpoint

Before a phase closes, run the frozen complete phase checkpoint: clean install,
source/database/integration/migration suites, production build, seller journeys,
permission/shop isolation, AR/FR/EN, RTL, applicable native/Windows/recovery lanes,
security/privacy evidence and unresolved-problem/documentation audit.

A phase does not close merely because its PR merges.

### Level 3 — Major Full Checkpoint

Run after every two completed phases by default, or earlier for licensing,
identity, cryptography, installer/updater, migrations, backup/restore, provider
money/effects or destructive data authority. It includes exact-source Windows
release compilation, signed/installed lifecycle as authorized, clean install,
upgrade, reopen, process cleanup, preserved AppData, recovery, security and an
evidence bundle.

Issue #201 remains a separate installed hydrated-WebView evidence boundary and
must not be weakened.

## Branch and PR rules

- Branch from verified current protected `main`.
- Use `agent/<observable-outcome>`.
- Keep one PR reviewable as one outcome.
- No direct protected-main edits.
- No unrelated refactors or dependency upgrades.
- No application version bump for ordinary source packages.
- Never report a temporary blob/tree as a commit.
- Freeze the exact head only after implementation and static audit stop.
- Merge only after selected gates pass and all P0/P1 threads close.
- Re-fetch the PR immediately before merge and bind the merge to
  `expected_head_sha`.

## Frozen Phase 4 shared contract

- The DPAPI installation root is a local KEK/derivation root, not a universal
  seller-data key.
- HKDF-SHA-256 derives versioned, purpose-separated installation keys.
- Per-shop data, blind-index and secret authorities remain independently rotatable.
- Protected values use one contextual versioned AEAD envelope; malformed or
  unauthenticated canonical values become explicit corruption.
- Raw Prisma access is exceptional, allowlisted and prohibited from normal domain
  callers.
- Backup is one immutable encrypted all-shop installation snapshot using native
  SQLite Online Backup and a complete authenticated recovery set.
- Every backup uses a fresh random DEK wrapped by a per-license BRK; independent
  recovery kit/code custody is separate from the container.
- Replacement restore stages and verifies the complete set, rescues the current
  generation, re-wraps imported shop keys, preserves the new local installation
  identity, removes source session/auth authority and compensates on failure.
- Migration/restore journals are authenticated, exact-identity-bound,
  restart-safe and converge before Node, Prisma or WebView exposure.
- Every durable model, protected field and file store has purpose, retention,
  backup/export/erase and diagnostic classification.
- Generated SBOM/VEX, threat model, amended Algeria privacy-law engineering map,
  exact-head review and Level 1/2/3 evidence are required for closure.
- No package may create a competing key, backup, journal, lifecycle or restore
  authority.

## Current package boundary — PR #207

PR #207 now carries the complete Phase 4 implementation candidate:

- P4-A/P4-B protected key hierarchy, contextual values, guarded Prisma authority
  and protected-data migration;
- P4-C encrypted all-shop backup and independent recovery kit;
- P4-D replacement-install staging, cutover, identity re-enrollment, key re-wrap
  and rollback;
- P4-E authenticated recovery/migration convergence and replay-protected native
  command bridge;
- P4-F governed export/reset/erase/delete lifecycle, full data inventory, threat
  model, Law 18-07/Law 25-11 engineering mapping, resolved npm/Cargo SBOM, VEX
  triage, review protocol, evidence matrix and executable closure verifier.

This is source implementation, not proof of the final exact head. Phase 4 remains
open until the review and selected gates pass, every P0/P1 is resolved, PR #207 is
merged with expected-head binding and protected main is verified.

## Final Phase 4 process

1. Finish static TypeScript/Rust/interface/documentation review under skipped-CI
   durable commits.
2. Create one non-skipped exact final head.
3. Request exact-head security/privacy review using
   `documentation/security/PHASE4_INDEPENDENT_REVIEW.md`.
4. Run one complete selected Phase 4 gate.
5. On failure, collect every job log, artifact and review finding before one
   consolidated repair; never return to one-error-at-a-time CI loops.
6. Resolve every P0/P1, merge with expected head, verify protected main and only
   then reconcile issue #204.

## Evidence language

Implemented, source-proven, artifact-proven, installed, Founder-accepted,
phase-closed, legally reviewed, penetration-tested, Beta and Stable are distinct.
A lower evidence level cannot claim a higher one.

No current Phase 4 source package authorizes a version bump, release publication,
Founder acceptance, Beta, Stable, legal-certification or penetration-test claim.

## Protected local boundaries

- Preserve
  `C:\Users\DMR\Desktop\sahelflow_v2\scripts\Founder-install-result.json`.
- Preserve the unrelated local modification to
  `src/lib/identity/__tests__/session-authority.test.ts`.
- Do not delete canonical AppData, registry, databases, migrations or keys.
- Do not require permanent local `node_modules`, `.next`, Rust `target` or
  repeated installer caches when Actions can provide evidence.
- PR #186 is obsolete/diverged and must never be merged wholesale.
- PR #196 is superseded; its diagnostics intent is protected through PR #199.
- PR #194 and historical Phase 3/4 branches are evidence only.
