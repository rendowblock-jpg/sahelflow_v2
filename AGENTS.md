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
7. Read issue #204, issue #164 and retained evidence issue #201.
8. Verify protected `main` `aa4ca0758fd696f4b02fc1975629ac698f9349c3` directly on GitHub.
9. Inspect exact source, migrations, tests, native boundaries and production callers
   before trusting implementation claims.

Chat history, screenshots, old branches and archived reports are context only.
They never replace current GitHub authority.

## Current verified frontier

- Protected `main`: `aa4ca0758fd696f4b02fc1975629ac698f9349c3`.
- Latest application-changing merge: PR #203 Phase 3 closure at that commit.
- Published executable source: `fb32faedc5ecfc1718e395824f437b805cbb9ef2`.
- Published release: `1.0.0-internal.13` / MSI `1.0.0.13`.
- Founder-installed release: Internal.13; acceptance remains open.
- Founder-accepted baseline: Internal.5.
- Active product phase: Phase 4 — data protection, recovery, migrations and security.
- Active phase issue: #204.
- Active branch/PR: none until audit and contract freeze identify the first package.
- Retained installed evidence issue: #201.
- PR #203 is merged; issue #202 is closed.
- Final validated Phase 3 head: `f0db4116874238d0c415b4725cd2c5f3ef6201da`.
- Final required gate `30901725446` passed tests, lint, typecheck, Prisma,
  coverage, production dependency audit and migration status.
- No known Phase 3 P0/P1 remains.
- Real provider certification and issue #201 remain mandatory later evidence under
  FD-030; they are not current proof and do not reopen Phase 3.
- The next session is Phase 4 audit, research, Problem Register and shared contract
  freeze only. Broad Phase 4 production edits are not yet authorized.

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

FD-029 requires uncompromised top-tier class-AAA completion. It does not
authorize an MVP, hidden deferral or fabricated readiness.

## Single-agent and session rule

- The Founder selects either the Web Agent or Desktop Agent as active.
- Only that agent may implement SahelFlow at that time.
- One outcome has one owner, one branch and one PR.
- A frozen-head adversarial review occurs only after implementation stops.
- With one agent, that review is a separated adversarial pass, not independent
  review.
- Required security, privacy, legal, accessibility and provider reviews remain
  genuinely independent later.
- Declare one session purpose: governance/planning, research/contract,
  implementation, frozen review/closure or installed evidence.
- The current session is Phase 4 exhaustive audit and contract freeze only;
  production edits wait for the Problem Register and shared contracts.

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

Group findings by root cause. Do not patch one symptom while a competing
authority remains.

```text
complete audit
→ consolidated Problem Register
→ freeze shared contracts
→ coherent root-cause package
→ task gate
→ frozen exact head
→ complete adversarial review
→ one consolidated repair batch
→ checkpoint
```

Phase 3 closure evidence remains in the Phase 3 checkpoints and PR #203.
Issue #204 owns the new Phase 4 inventory, Problem Register and contract freeze.
Historical Phase 4 branches/PRs and the older Phase 3 branches are evidence only;
never merge or cherry-pick them wholesale without revalidation on current main.

## Validation levels

### Level 1 — Task Gate

Run after each coherent completed task:

- `bun run sf-version`;
- `bun run sf-audit`;
- Prisma generation/validation and migration checks when applicable;
- TypeScript;
- ESLint;
- complete Vitest;
- targeted Playwright, provider, Rust or native checks selected by risk.

### Level 2 — Phase Checkpoint

Before a phase closes, run the frozen complete phase checkpoint: clean install,
source/database/integration/migration suites, production build, seller journeys,
permission/shop isolation, AR/FR/EN, RTL, accessibility, performance, applicable
native/Windows/recovery lanes and unresolved-problem/documentation audit.

A phase does not close merely because its PR merges.

### Level 3 — Major Full Checkpoint

Run after every two completed phases by default, or earlier for licensing,
identity, cryptography, installer/updater, migrations, backup/restore, provider
money/effects or destructive data authority. It includes exact-source Windows
release compilation, signed MSI, clean install, upgrade, reopen, process cleanup,
preserved AppData, recovery, browser journeys, visual regression, security,
performance and an evidence bundle.

Issue #201 remains a separate installed hydrated-WebView evidence boundary and
must not be weakened.

## AAA frontend rule

Every Required route and journey must converge on one SahelFlow-owned design
system with professional information architecture and complete loading, empty,
validation, permission, offline, queued, pending, stale, partial, conflict,
error, retry, ambiguity, dead-letter, recovery and history states. Arabic,
French and English, true RTL and mixed-direction handling, keyboard/focus/screen
reader/contrast/zoom/reduced motion, 1366×768 containment and low-end budgets are
mandatory. Library presence or a screenshot is not AAA evidence.

## Branch and PR rules

- Branch from verified current protected `main`.
- Use `agent/<observable-outcome>`.
- Open a draft PR early for material work.
- Keep one PR reviewable as one outcome.
- No direct protected-main edits.
- No unrelated refactors or dependency upgrades.
- No application version bump for ordinary source packages.
- Freeze the exact head before consolidated review.
- Merge only after selected gates pass and all P0/P1 threads close.

## Frozen Phase 3 shared contract

- Reuse canonical commands, events and encrypted `OutboxIntent`; do not create
  provider-specific competing transaction authority.
- Authenticate and persist inbound events before acknowledgement.
- The sidecar writes an encrypted durable spool before broadcast or app delivery.
- Inbound identity binds provider, environment, exact account, installation,
  shop incarnation and provider event/message identity.
- Normalize with storage-enforced idempotency and leases.
- Publish WebSocket/UI changes only from database-committed results.
- External provider calls never execute inside business transactions.
- Outbound effects have stable identity, encrypted request binding, attempts,
  leases, known/ambiguous outcome, receipts, dead letter and recovery.
- Automation runs and steps persist truthful states; provider actions use durable
  effects and all producers await bounded trigger persistence.
- Sensitive AI actions require an exact persisted one-time proposal and approval.
- Only the exact active native runtime drains its shop DB. Shop switching
  quiesces workers; inactive-shop work remains durable and visibly pending.
- Server-side connection, capability, credential and endpoint evidence gates
  provider effects. DHD is removed from runtime registration; NOEST effects remain
  fail-closed until its exact provider contract is independently certified.

## Completed package rules — durable inbound WhatsApp

The package is source-closed at
`f016055be55fd220baa87c26ffed565c4e9e1d85` with complete checkpoint
`30808773702`. It is source/integration/database evidence only, not signed,
installed, live-provider-certified, Founder-accepted or Phase-closed evidence.

## Completed package rules — truthful durable automations

The package is source-closed at
`c873b8b6a256383497d3799e0839160178e92149` with complete checkpoint
`30826354580` and normal CI `30826355685` passed.

It includes additive run/step/attempt truth, encrypted immutable snapshots,
ordered stop/continue execution, restart-safe leases and attempts, truthful
partial/dead-letter/ambiguity, durable WhatsApp effect correlation, deterministic
daily-report receipt replay, strict executable schemas, complete recipe config,
AR/FR/EN recovery history and reason-bound audited retry. The separated review
repaired timestamp-bound replay drift, invalid nested writes, unawaited action
errors, retry hot loops, false success, test leakage, fire-and-forget producers,
SQLite trigger contention, repeat-blacklist identity and direct report sends.

This is source evidence only. It is not signed, installed, provider-certified,
Founder-accepted, Phase 3 closed or Stable.

## Completed package rules — proposal-bound sensitive AI actions

Task 5 is source-closed at
`07caedbc797ced5dc0e2ac959f252d5b3481285d` with checkpoint `30849680029`.
One immutable encrypted proposal binds exact arguments, requester, approver,
device, session, shop, policy, permissions, entitlement, target versions, expiry
and one execution claim. Generic message confirmation is not execution authority.

## Completed package rules — provider convergence and durable commerce

Task 6 is source-closed at clean head
`676d0e41cc69d44c29b912038cba100fd827fcfa` with checkpoint `30875723975`.

- commerce requests queue durable runs and never execute provider pages inline;
- opaque page continuation, encrypted items, immutable attempts, exact credential
  contracts, monotonic watermarks and audited recovery are source-proven;
- one public courier facade owns booking, tracking and reconciliation;
- the courier effect runtime is internal and obsolete queue/reconciliation exports
  are removed;
- DHD is absent from runtime registration and NOEST remains effect-disabled;
- provider source authority is not live certification evidence.

## Completed evidence rule — Phase 3 Level 2 source/build checkpoint

Run `30878352410` passed semantic authority, frozen install, Prisma generation and
deployment, TypeScript, ESLint, complete Vitest, migration status, production
WhatsApp sidecar build and production Next build. It is source/build evidence,
not live-provider, signed-artifact or installed-Windows evidence.

## Founder closure rule — FD-030

Only these next actions are authorized:

- preserve the exact green Phase 3 closure head and merge PR #203;
- close issue #202 after the protected merge;
- begin Phase 4 with complete data-protection/recovery/migration/security audit;
- defer real-account provider certification to Phase 9 representative beta;
- retain issue #201 for applicable Level 3/installed evidence.

Do not paste credentials into chat or source, fabricate live certification, bump
the version, publish an MSI/release, claim Founder acceptance or claim Stable.

## Evidence language

1. static/source;
2. unit/domain;
3. integration/API/database;
4. development UI;
5. clean GitHub Actions;
6. signed artifact;
7. installed Windows;
8. T470/floor hardware;
9. external provider/security/accessibility/legal;
10. representative seller/Beta.

A lower level cannot claim a higher one. Implemented, source-proven,
artifact-proven, installed, Founder-accepted, phase-closed and Stable are distinct.

## Review severity

- **P0:** active data loss, secret exposure, cross-shop effect, corrupt
  update/restore or irreversible stock/money damage.
- **P1:** required journey or authority failure, duplicate/lost effect, unsafe
  migration, startup/install/recovery failure, incorrect stock/money or major
  unusable Arabic/UX/accessibility behavior.
- **P2:** bounded material hardening with a safe workaround and assigned owner.
- **P3:** low-impact polish.

P0 stops work. P1 blocks the affected merge or checkpoint. P2/P3 receive explicit
ownership and dependency position.

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
- PR #194 and historical Phase 3 branches are evidence only.
- The active package is PR #203.
- No version bump, release, MSI publication, Founder acceptance or Stable claim
  is authorized.
