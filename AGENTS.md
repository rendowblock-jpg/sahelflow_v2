# SahelFlow agent entry point

SahelFlow uses two coding agents and GitHub as durable truth:

- ChatGPT Web Agentic Coding Agent;
- Desktop Agent working in the local Windows checkout.

GitHub Actions is clean-checkout and artifact infrastructure, not a third coding
agent. GLM, Codex Cloud, MAWS and legacy handoff systems are not active authority.

## Start here

1. Read [`documentation/README.md`](documentation/README.md).
2. Read FD-028 in
   [`documentation/product/DECISIONS.md`](documentation/product/DECISIONS.md).
3. Read the active phase and exact exit gate in
   [`documentation/system/ROADMAP.md`](documentation/system/ROADMAP.md).
4. Read
   [`documentation/operations/WORKFLOW.md`](documentation/operations/WORKFLOW.md),
   especially the research-to-implementation gate and work-package contract.
5. Read
   [`documentation/operations/WORKING_MEMORY.md`](documentation/operations/WORKING_MEMORY.md).
6. Inspect active branches, PRs and issue #164.
7. Read the governing sections of:
   - [`PRODUCT.md`](documentation/product/PRODUCT.md);
   - [`EXPERIENCE.md`](documentation/product/EXPERIENCE.md);
   - [`ARCHITECTURE.md`](documentation/system/ARCHITECTURE.md);
   - [`CURRENT_STATE.md`](documentation/system/CURRENT_STATE.md);
   - [`RESEARCH.md`](documentation/research/RESEARCH.md).
8. Inspect exact source and tests before trusting implementation claims.

Chat history and archived reports are context only. They never replace current
GitHub authority.

## Authority precedence

1. Newer explicit Founder decision for the choice it changes.
2. Product contract.
3. Experience/capability/journey contract.
4. Architecture and invariants.
5. Source-grounded current state.
6. Final roadmap.
7. Workflow.
8. Working Memory.
9. Research/archive.

A lower layer cannot silently weaken a higher one.

## Governing completion program

FD-028 replaces the obsolete four-session execution overlay with one final
Phase 0–9 program:

0. authority freeze and execution reset;
1. canonical Golden COD business core;
2. identity, authorization, licensing and multi-shop;
3. durable providers, inbox, AI and automations;
4. data protection, recovery, migrations and security;
5. whole-product AAA UI/UX and frontend redesign;
6. Arabic, RTL and accessibility parity;
7. performance and reliability;
8. connected SahelFlow platform;
9. certification, representative beta and Stable.

Valid FD-027 rules remain: bounded WIP, coherent outcome packages, independent
review, P0/P1 blocking, milestone releases, exact-source evidence and continuous
Arabic/RTL, accessibility, recovery and performance.

No agent may replace this program with another permanent plan, wave or session
map without a new Founder decision.

## Research-first gate

Before every major phase, durable contract or material implementation:

- state the exact decision;
- inspect the current SahelFlow production path and tests;
- research current primary standards, official documentation and provider
  contracts;
- inspect mature implementation code and relevant best-in-class operational
  products;
- consider Algerian COD, Arabic/French, Windows and constrained-network reality;
- compare alternatives across correctness, migration, security, accessibility,
  RTL, performance, recovery and economics;
- adopt one SahelFlow-specific decision with measurable acceptance criteria;
- record the evidence and revalidation trigger.

Generic AI recommendations, visual trends, screenshots, mocks and adapter
existence are not authority.

Research is bounded. Once the decision is sufficiently supported, implementation
begins.

## Current baseline

- Phase 0 closeout base: `18c45e474f58744b6f837372509154ca500044b0`.
- Published executable source:
  `fb32faedc5ecfc1718e395824f437b805cbb9ef2`.
- Published release: `1.0.0-internal.13`, run `30366866703`.
- Internal.13 passed protected signed build, staged runtime, install/reopen,
  authenticated UI, deterministic evidence, tag and publication gates.
- Internal.13 is Founder-installed and locally version-confirmed on the T470; it
  is not yet Founder-accepted.
- Internal.5 remains the Founder-accepted baseline.
- The new canonical command/event/outbox/reservation/movement foundation is
  merged, but production business routes still mainly use legacy paths.
- Phase 0 completed through PR #179. Phase 1 research for the first canonical
  manual order-confirmation vertical is complete and implementation is ready.
- Next implementation branch: `agent/phase1-manual-confirmation`, created from
  the then-current protected `main`.

## Exact next outcome

Begin Phase 1 implementation from current protected `main` for:

> A manual order is created under trusted authority, confirmed or rejected using
> optimistic version and exact idempotency, reserves available product/variant
> stock atomically, writes inventory movement, audit, event, outbox and projection
> invalidation, exposes complete AR/FR/EN UI states, survives duplicate and
> concurrent submissions, and removes the migrated direct-stock legacy path.

Internal.13 T470 observation remains independent in the platform lane. Installed
version and preservation evidence are captured; Arabic chart visual acceptance
and the Founder acceptance decision remain open.

## Work rules

- One owner, branch and PR per outcome.
- Never push directly to protected `main`.
- Preserve unrelated user work and canonical AppData.
- Freeze shared contracts before dependent parallel work.
- Core authority WIP 1; seller vertical WIP 2 total; experience/Arabic WIP 1;
  platform/performance WIP 1.
- Normal branches are short and coherent.
- Merge ordinary source-complete packages without app-version bumps.
- Group coherent outcomes into one Internal milestone candidate.
- At most one frozen signed candidate is in flight.
- Remove or disable a legacy mutation path after canonical adoption, migration and
  recovery proof.
- No important decision remains only in chat.
- Do not create another permanent plan, gap report, prompt, status or handoff.

## Before implementation record

- named seller/Founder outcome;
- phase, capability and journey;
- governing Founder/product/experience/architecture clauses;
- exact research package and adopted decision;
- source baseline and owner;
- scope/non-goals and dependencies;
- existing data/behavior to preserve;
- migration, compatibility and forward repair;
- security/privacy/authorization implications;
- Arabic/RTL/accessibility/responsive implications;
- performance budget;
- required evidence;
- legacy path to remove.

## Review severity

- **P0:** active data loss, secret exposure, cross-shop/tenant effect, corrupt
  update/restore or irreversible stock/money damage. Stop immediately.
- **P1:** required journey or authority failure, negative/double stock, incorrect
  money, duplicate/lost effect, unsafe migration, startup/install/recovery
  failure, or major unusable Arabic/UX/accessibility defect. Blocks merge/release.
- **P2:** bounded material hardening with a safe workaround.
- **P3:** low-impact polish.

P2/P3 are owned follow-ups. They do not create unbounded review loops.

## Evidence ladder

1. Static/source.
2. Unit/domain.
3. Integration/API/database.
4. Development UI.
5. Clean GitHub Actions.
6. Signed artifact.
7. Installed Windows.
8. T470/floor hardware.
9. External provider/security/accessibility.
10. Representative seller/Beta.

A lower layer cannot claim a higher one.

## Completion rule

A model, page, route, adapter, screenshot, mock or passing test does not complete
a capability. The named outcome must pass every applicable happy, validation,
permission, duplicate, concurrency, loading, empty, offline, stale, conflict,
failure, retry, recovery, audit, Arabic/RTL, accessibility, performance and
preservation case.

Public Stable additionally requires representative seller beta, live provider
certification, independent security/privacy and Law 18-07 review, restore and
incident drills, compatibility evidence, rollout readiness and explicit Founder
promotion.

## Desktop boundaries

The Founder machine is storage constrained.

- Do not run source builds, full automated tests, coverage or dependency
  installation locally when Actions can prove them.
- Do not require permanent `node_modules`, `.next`, Rust `target` or repeated
  installer caches.
- Do not delete canonical AppData, registry, databases, migrations or keys.
- Use exact signed artifacts for install and observation.
- Record exact machine, profile, artifact, version, identities and timing.

## Shared validation commands

GitHub Actions uses commands including:

```bash
bun run sf-version
bun run sf-audit
bun run sf-inventory
bun run sf-verify
bun run sf-verify --fast
```

These commands prove only what they execute. Linux/source checks cannot prove
installed Windows, T470, provider, legal or Beta behavior.

## Milestone release truth

Routine Internal candidates remain draft until every selected signed post-build
gate passes. The protected workflow verifies exact source, signed MSI, signature,
staged/installed runtime, authenticated UI, evidence, updater metadata and the
source-bound release tag before automatic publication.

`latest.json` is updater metadata that contains the signature for the signed MSI;
do not call the JSON document independently signed unless explicit manifest
signing is implemented.

Failed candidates remain drafts. Beta and Stable always require explicit Founder
promotion.
