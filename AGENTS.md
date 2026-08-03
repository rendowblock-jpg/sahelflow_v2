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
7. Verify protected `main`, active branches, open PRs, exact heads, review threads,
   CI and issues #164, #201 and #202 directly on GitHub.
8. Inspect exact source, migrations, tests and production callers before trusting
   implementation claims.

Chat history, screenshots and archived reports are context only. They never
replace current GitHub authority.

## Current verified frontier

- Protected `main`: `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`.
- Phase 2 native multi-shop authority: PR #200 merged at that protected commit.
- Latest application-changing protected merge:
  `e9c92f08f39e8d87ddfd72d2e698418ae81fc084` (PR #200 native multi-shop).
- Published executable source: `fb32faedc5ecfc1718e395824f437b805cbb9ef2`.
- Published release: `1.0.0-internal.13` / MSI `1.0.0.13`.
- Founder-installed release: Internal.13; acceptance remains open.
- Founder-accepted baseline: Internal.5.
- Active product phase: Phase 3 — durable providers, inbox, AI and automations.
- Sole active implementation agent: ChatGPT Web Agentic Coding Agent, selected by
  the Founder for this session on 2026-08-03.
- Active branch: `agent/phase3-durable-effects-audit`, based exactly on protected
  `main` above.
- Active draft: PR #203 — `Phase 3: audit durable effects and operator workflows`.
- Phase execution issue: issue #202.
- Retained installed-runtime evidence issue: issue #201.
- Current session purpose: research/contract and governance reconciliation.
- Production implementation remains unauthorized until the complete Phase 3
  inventory, consolidated Problem Register and shared contract freeze exist.

Always re-read live GitHub. The exact values above record the current verified
frontier, not permission to rely on copied state after the repository moves.

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

A lower layer cannot silently weaken a higher one.

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

FD-029 requires uncompromised top-tier class-AAA completion across product,
business truth, data, security, recovery, Windows, providers, UI/UX,
localization, accessibility, performance, testing, diagnostics, documentation and
evidence. It does not authorize an MVP, hidden deferral or fabricated readiness.

## Single-agent rule

- The Founder selects either the Web Agent or Desktop Agent as active.
- Only that agent may implement SahelFlow at that time.
- The inactive agent does not create a competing branch, modify shared files or
  begin later-phase work.
- One outcome has one owner, one branch and one PR.
- A frozen-head adversarial review may occur only after implementation stops.
- With one agent, that review is a **separated adversarial pass**, not independent
  review.
- Required external security, privacy, legal, accessibility and provider reviews
  remain genuinely independent later.

## Session types

Declare exactly one purpose before work:

- governance/planning;
- research/contract;
- implementation;
- frozen review/closure;
- installed evidence.

A governance/planning, research/contract or frozen-review session does not perform
unrelated product implementation.

## Audit-first rule

Before the first production edit of a phase or material package, inspect the
complete affected surface and create one Problem Register covering every
applicable layer:

- production callers, routes, pages, commands and background workers;
- models, migrations, existing databases and compatibility projections;
- tests, fixtures, mocks, dynamic imports and failure diagnostics;
- business invariants, idempotency, concurrency and restart behavior;
- trusted actor, exact shop, permissions and protected-field oracles;
- provider effects, receipts, ambiguity, retry and recovery;
- AR/FR/EN, RTL, accessibility, responsive and installed UI states;
- performance, resource use, diagnostics and evidence;
- legacy paths that must be removed or made read-only.

Group findings by root cause. Do not patch one visible symptom while a shared
competing authority remains.

For Phase 3, inventory WhatsApp inbound and outbound paths, courier booking and
tracking, commerce synchronization, inbox persistence, automation execution,
AI tool approval, direct provider calls, worker ownership, migrations, tests and
all operator-visible degraded/recovery states. The older
`agent/phase3-durable-whatsapp-recovery` and `codex/phase3-durable-provider`
branches are diverged evidence only and must not be merged or cherry-picked
wholesale.

## Batch remediation rule

The normal cycle is:

```text
complete audit
→ consolidated Problem Register
→ root-cause packages
→ task gate after each coherent task
→ frozen exact head
→ complete adversarial review
→ one consolidated repair batch
→ final checkpoint
```

Do not drip-feed review findings while the same frozen head is still being
inspected. New concrete P0/P1 evidence always reopens the affected gate, but
avoidable one-finding-at-a-time loops are prohibited.

## Three validation levels

### Level 1 — Task Gate

Run after each coherent completed task, not after every tiny edit:

- `bun run sf-version`;
- `bun run sf-audit`;
- Prisma generation/validation and migration checks when applicable;
- TypeScript;
- ESLint;
- full Vitest;
- targeted Playwright, provider, Rust or native checks selected by risk.

Focused tests may be used during coding, but the completed task must pass the
full ordinary source gate.

### Level 2 — Phase Checkpoint

Before a phase closes, run the frozen complete phase checkpoint:

- clean frozen dependency install;
- complete source, database, integration and migration suites;
- production build;
- affected seller journeys and permission/shop-isolation matrices;
- AR/FR/EN, RTL, accessibility and representative UI states;
- phase performance and resource evidence;
- applicable Rust, Windows, packaging and recovery lanes;
- complete unresolved-problem and documentation audit.

A phase does not close because its PRs merged.

### Level 3 — Major Full Checkpoint

Run after every two completed phases by default. Three phases may share one only
when dependency and risk analysis explicitly justify it. Run earlier whenever
licensing, identity, cryptography, installer/updater, migrations, backup/restore,
provider money/effects or destructive data authority changes.

The major checkpoint includes exact-source Windows release compilation, signed
MSI, clean install, upgrade, reopen, process cleanup, preserved AppData,
backup/restore, recovery, complete browser journeys, visual regression, security,
performance, stability and an evidence bundle.

Phase 3 provider effects involving orders, inventory, money or irreversible
external actions trigger the applicable Level 3 evidence at the affected exit.
Issue #201 must be resolved or formally reclassified without weakening the
installed hydrated-WebView check.

## AAA frontend rule

Whole-product frontend transformation is a Stable 1.0 requirement, not optional
polish. Every Required route and component must use one SahelFlow-owned design
system and one governed chart foundation, with:

- professional information architecture and operational density;
- complete happy, loading, empty, validation, permission, offline, pending,
  stale, conflict, error, retry, recovery and history states;
- Arabic, French and English parity;
- real RTL and mixed-direction handling;
- keyboard, focus, screen-reader, contrast, zoom and reduced-motion behavior;
- 1366×768 containment and responsive behavior;
- low-end rendering and interaction budgets;
- visual-regression and Founder visual acceptance evidence.

Do not mix random library defaults page by page. Existing Radix, TanStack Table,
Tailwind, Framer Motion and Recharts are inputs to a benchmark, not automatic
final choices. Any replacement must show measurable accessibility, RTL,
performance, charting and maintainability benefit.

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

## Phase 3 package rules

- Reuse the canonical business command kernel and encrypted `OutboxIntent`; do
  not create provider-specific competing transaction authority.
- Authenticate and persist inbound provider events before acknowledgement.
- External provider calls never execute inside a business transaction.
- Every effect has stable exact identity, encrypted request binding, lease,
  attempt history, known/ambiguous outcome, receipt, dead letter and recovery.
- Checkpoints never advance past untracked or uncommitted provider work.
- Automation runs and every step persist truthful state; a failed step cannot be
  reported as overall success.
- Automation provider actions use the durable effect protocol rather than direct
  sidecar or adapter calls.
- Sensitive AI actions use a persisted one-time proposal and approval bound to
  exact tool, arguments, actor, shop, affected versions and expiry, or remain
  disabled.
- Provider adapters remain hidden or fail closed until current live certification
  supports the exact capability being exposed.
- Worker ownership across active and inactive shops is explicit and tested.
- Every affected route exposes complete AR/FR/EN pending, degraded, ambiguous,
  retry, recovery and history states.

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

P0 stops work. P1 blocks the affected merge or checkpoint. P2/P3 do not create an
unbounded review loop; they receive explicit ownership and dependency position.

## Protected local boundaries

- Preserve
  `C:\Users\DMR\Desktop\sahelflow_v2\scripts\Founder-install-result.json`.
- Preserve the unrelated local modification to
  `src/lib/identity/__tests__/session-authority.test.ts`.
- Do not delete canonical AppData, registry, databases, migrations or keys.
- Do not require permanent local `node_modules`, `.next`, Rust `target` or
  repeated installer caches when Actions can provide evidence.
- PR #186 is closed obsolete/diverged source and must never be merged wholesale.
- PR #196 is closed superseded; its valid complete-diagnostics intent is protected
  through PR #199.
- PR #194 and the historical Phase 3 branches are preserved evidence only; reuse
  validated design and tests selectively on current `main`.
- The active package is PR #203 only. Production edits remain unauthorized until
  the Phase 3 audit, Problem Register and contract freeze are complete.
