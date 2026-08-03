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
2. Read FD-028 and FD-029 in
   [`documentation/product/DECISIONS.md`](documentation/product/DECISIONS.md).
3. Read [`documentation/system/CURRENT_STATE.md`](documentation/system/CURRENT_STATE.md).
4. Read the active phase in
   [`documentation/system/ROADMAP.md`](documentation/system/ROADMAP.md).
5. Read [`documentation/operations/WORKFLOW.md`](documentation/operations/WORKFLOW.md).
6. Read
   [`documentation/operations/WORKING_MEMORY.md`](documentation/operations/WORKING_MEMORY.md).
7. Read both Phase 3 checkpoints under `.github/phase-checkpoints/`.
8. Verify protected `main`, active branches, PR #203, exact head, review threads,
   CI and issues #164, #201 and issue #202 directly on GitHub.
9. Inspect exact source, migrations, tests and production callers before trusting
   implementation claims.

Chat history, screenshots, old branches and archived reports are context only.
They never replace current GitHub authority.

## Current verified frontier

- Protected `main`: `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`.
- Phase 2 native multi-shop authority: PR #200 merged at that commit.
- Published executable source: `fb32faedc5ecfc1718e395824f437b805cbb9ef2`.
- Published release: `1.0.0-internal.13` / MSI `1.0.0.13`.
- Founder-installed release: Internal.13; acceptance remains open.
- Founder-accepted baseline: Internal.5.
- Active product phase: Phase 3 — durable providers, inbox, AI and automations.
- Sole active agent: ChatGPT Web Agentic Coding Agent.
- Active branch: `agent/phase3-durable-effects-audit`.
- Active draft: PR #203 — `Phase 3: audit durable effects and operator workflows`.
- Phase execution issue: issue #202.
- Retained installed-runtime evidence issue: #201.
- Governance reconciliation, exhaustive inventory, frozen Problem Register and
  shared Phase 3 contract are complete on the draft branch.
- Task 3 durable inbound WhatsApp is source-closed at
  `f016055be55fd220baa87c26ffed565c4e9e1d85`; full source checkpoint
  `30808773702` passed and no review threads remain.
- **Authorized production package:** truthful durable automations and WhatsApp
  effect adoption only.
- Every other Phase 3 production package remains unauthorized.

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

## Single-agent rule

- The Founder selects either the Web Agent or Desktop Agent as active.
- Only that agent may implement SahelFlow at that time.
- The inactive agent does not create a competing branch, modify shared files or
  begin later-phase work.
- One outcome has one owner, one branch and one PR.
- A frozen-head adversarial review occurs only after implementation stops.
- With one agent, that review is a **separated adversarial pass**, not independent
  review.
- Required security, privacy, legal, accessibility and provider reviews remain
  genuinely independent later.

## Session types

Declare exactly one purpose before work:

- governance/planning;
- research/contract;
- implementation;
- frozen review/closure;
- installed evidence.

A governance/planning, research/contract or frozen-review session does not perform
unrelated product implementation. The current session is implementation of the
exact truthful durable automation package only.

## Audit-first rule

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

For Phase 3, the complete inventory and frozen Problem Register are in:

- `.github/phase-checkpoints/phase3-surface-inventory.json`;
- `.github/phase-checkpoints/phase3-durable-effects.json`;
- `documentation/operations/WORKING_MEMORY.md`.

Historical `agent/phase3-durable-whatsapp-recovery`,
`codex/phase3-durable-provider` and PR #194 are diverged evidence only. Never
merge or cherry-pick them wholesale.

## Batch remediation rule

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

Do not drip-feed review findings while the same frozen head is still being
inspected. New concrete P0/P1 evidence reopens the affected gate.

## Three validation levels

### Level 1 — Task Gate

Run after each coherent completed task:

- `bun run sf-version`;
- `bun run sf-audit`;
- Prisma generation/validation and migration checks when applicable;
- TypeScript;
- ESLint;
- full Vitest;
- targeted Playwright, provider, Rust or native checks selected by risk.

Focused tests may be used during coding, but the completed task passes the
ordinary source gate.

### Level 2 — Phase Checkpoint

Before a phase closes, run the frozen complete phase checkpoint:

- clean frozen dependency install;
- complete source, database, integration and migration suites;
- production build;
- affected seller journeys and permission/shop-isolation matrices;
- AR/FR/EN, RTL, accessibility and representative UI states;
- phase performance and resource evidence;
- applicable Rust, Windows, packaging and recovery lanes;
- unresolved-problem and documentation audit.

A phase does not close merely because its PR merged.

### Level 3 — Major Full Checkpoint

Run after every two completed phases by default, or earlier for licensing,
identity, cryptography, installer/updater, migrations, backup/restore, provider
money/effects or destructive data authority.

It includes exact-source Windows release compilation, signed MSI, clean install,
upgrade, reopen, process cleanup, preserved AppData, backup/restore, recovery,
browser journeys, visual regression, security, performance, stability and an
evidence bundle.

Issue #201 remains a separate installed hydrated-WebView evidence boundary and
must not be weakened.

## AAA frontend rule

Every Required route and journey must converge on one SahelFlow-owned design
system and governed chart foundation with:

- professional information architecture and operational density;
- loading, empty, validation, permission, offline, queued, pending, stale,
  partial, conflict, error, retry, ambiguity, dead-letter, recovery and history;
- Arabic, French and English parity;
- real RTL and mixed-direction handling;
- keyboard, focus, screen-reader, contrast, zoom and reduced motion;
- 1366×768 and responsive containment;
- low-end rendering and interaction budgets;
- visual regression and Founder visual acceptance.

Library presence or a screenshot is not AAA evidence.

## Branch and PR rules

- Branch from verified current protected `main`.
- Use `agent/<observable-outcome>`.
- Open a draft PR early for material work.
- Keep one PR reviewable as one outcome.
- No direct protected-main edits.
- No unrelated refactors or dependency upgrades.
- No application version bump for ordinary source packages.
- Rebase or merge current `main` deliberately before final review.
- Freeze the exact head before consolidated review.
- Merge only after selected gates pass and all P0/P1 threads close.
- Delete merged branches and close superseded PRs promptly.

## Frozen Phase 3 shared contract

- Reuse canonical commands, events and encrypted `OutboxIntent`; do not create
  provider-specific competing transaction authority.
- Authenticate and persist inbound events before acknowledgement.
- When the sidecar owns the provider socket, it writes an encrypted durable spool
  before broadcast or app delivery.
- Inbound identity binds provider, environment, exact account, installation,
  shop incarnation and provider event/message identity.
- Normalize with storage-enforced idempotency and leases.
- Commit `Conversation`, `Message`, audit, event and trigger intent atomically as
  applicable.
- Publish WebSocket/UI changes only from database-committed results.
- External provider calls never execute inside business transactions.
- Outbound effects have stable identity, encrypted request binding, attempt
  history, leases, known/ambiguous outcome, receipts, dead letter and recovery.
- Checkpoints never advance past untracked work.
- Automation runs and steps persist truthful states; provider actions use durable
  effects.
- Sensitive AI actions require an exact persisted one-time proposal and approval.
- Only the exact active native runtime drains its shop DB. Shop switching quiesces
  workers; inactive-shop work remains durable and visibly pending.
- Server-side capability certification and kill switches gate provider effects.
  DHD remains disabled in production until live-certified.

## Completed package rules — durable inbound WhatsApp

The source package is closed at
`f016055be55fd220baa87c26ffed565c4e9e1d85` with full source checkpoint
`30808773702` passed. It is source/integration/database evidence only, not signed,
installed, live-provider-certified, Founder-accepted or Phase-closed evidence.

Its separated adversarial repair batch closed Baileys type drift, plaintext spool
evidence, key/tamper handling, attempt-history collisions, duplicate WebSocket
publication and the status-trigger phone key mismatch.

## Authorized package rules — truthful durable automations

Only these production edits are authorized now:

- additive `AutomationRun`, `AutomationStepRun` and `AutomationStepAttempt`
  persistence;
- stable trigger-event plus automation-definition-version identity;
- an active-shop worker consuming committed `automation.trigger.v1` intents;
- ordered steps with explicit stop/continue policy and truthful aggregate state;
- restart-safe leases, retries, dead letter, replay and operator history;
- `send_whatsapp` through the existing durable WhatsApp outbox with
  step-to-effect correlation;
- durable daily-report send identity instead of direct sidecar dispatch;
- strict trigger/action/config schemas and fail-closed activation when a producer
  or required configuration is missing;
- AR/FR/EN, RTL, accessibility and partial/retry/dead-letter states;
- exact database, concurrency, restart and no-false-success tests.

Do not implement proposal-bound AI, courier/commerce convergence, live provider
certification, a version bump, MSI, release, Founder acceptance or Stable in this
package.

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
