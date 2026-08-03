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
   CI and issue #164 directly on GitHub.
8. Inspect exact source, migrations, tests and production callers before trusting
   implementation claims.

Chat history, screenshots and archived reports are context only. They never
replace current GitHub authority.

## Current verified frontier

- Protected `main`: `991c61ac882497fdda01af3ac04f06978146bbda`.
- Governance reset: PR #199 merged at that protected commit.
- Latest application-changing protected merge:
  `04d4c51831c6e043ab39a614a7e947e6b27d01e6` (PR #197 licensing).
- Published executable source: `fb32faedc5ecfc1718e395824f437b805cbb9ef2`.
- Published release: `1.0.0-internal.13` / MSI `1.0.0.13`.
- Founder-installed release: Internal.13; acceptance remains open.
- Founder-accepted baseline: Internal.5.
- Active product phase: Phase 2 — identity, authorization, licensing and
  multi-shop.
- Sole active implementation agent: ChatGPT Web Agentic Coding Agent, selected by
  the Founder on 2026-08-02.
- Active branch: `agent/native-multi-shop-authority`, based exactly on protected
  `main` above.
- Active draft: PR #200 — `Phase 2: establish native multi-shop authority`.
- Current coherent task: Task 1, authority reconciliation and pure native
  lifecycle contract. No registry mutation is authorized until its task gate
  passes.

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

A governance/planning or frozen-review session does not perform unrelated product
implementation.

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

For native multi-shop, the complete reconnaissance, adopted decision, consolidated
Problem Register, task sequence and non-goals are frozen in Working Memory. The
Tauri host is the sole lifecycle transaction authority; the browser submits typed
intent and renders state only.

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

Phase 2 requires this major checkpoint because licensing and native multi-shop
are both high-risk native authority.

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

## Native multi-shop package rules

- Compose the existing Rust migration coordinator, runtime supervisor, exact
  process `ShopContext`, durable identity authority and signed licensing
  authority; do not duplicate them.
- The browser never writes the registry, selects a database file, changes process
  environment or calls generic relaunch after an HTTP mutation.
- Every lifecycle operation carries expected registry revision, exact actor and
  installation authority, signed entitlement/slot authority and migration-set
  identity.
- Create, rename, switch, archive, recover and delete use one journaled native
  state machine with compensation and visible recovery.
- No success is returned before the new exact runtime reaches authenticated
  readiness.
- Destructive delete requires owner authority, recent reauthentication and an
  exact typed confirmation ceremony.
- Temporary TypeScript registry mutation and broad process permissions are removed
  only after native parity and recovery proof.

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
- The active package is PR #200 only. Historical branch movement is not permission
  to begin competing work.
