# SahelFlow — Coding, Review and Delivery Workflow

> **Status:** Active operating contract
> **Operating model:** SahelFlow Completion Operating Model v2
> **Agents:** ChatGPT Web Agentic Coding Agent and Desktop Agent
> **Durable truth:** GitHub protected `main`, branches, PRs, Actions, releases
> and evidence
> **Last consolidated:** 2026-07-27

This workflow is the fastest professional path to a complete class-AAA SahelFlow
candidate. Speed comes from dependency-correct parallelism, short coherent work
packages, one frozen review head, milestone releases and strict blocker
classification. It never comes from weakening data preservation, business
integrity, Arabic/RTL quality, accessibility, security or evidence.

GLM, Codex Cloud, MAWS and the `agent-handoff` continuity model are not part of
the active workflow.

## Roles

### Founder

- Sets product direction, price, entitlements, priorities and value judgments.
- Resolves consequential product, money, ownership, privacy and experience
  tradeoffs.
- Approves sensitive signing, payment, Beta and Stable actions.
- Installs and observes coherent Founder Internal milestone candidates.
- Decides Beta and Stable promotion.

### Web Agent

- Works from synchronized GitHub authority.
- Investigates source and active documentation.
- Designs and implements complete work packages.
- Runs every environment-valid check it can actually prove.
- Creates branches, commits, pushes and PRs.
- Reviews Desktop Agent PRs.
- Does not claim installed-Windows evidence it did not observe.

### Desktop Agent

- Works in the local SahelFlow checkout on a branch from current protected
  `main`.
- Designs and implements complete work packages and pushes them to GitHub.
- Does not run source builds, automated tests, coverage, dependency
  installation or other heavy validation on the Founder machine.
- Uses GitHub Actions on the exact pushed commit for required source, test,
  build and packaging evidence.
- Uses the local machine only for lightweight source inspection/editing and
  non-destructive installed-Windows, WebView, UI, AppData-preservation and
  reference-hardware observation.
- Reviews Web Agent PRs.
- Installs exact signed artifacts and records Windows/runtime/UI/preservation
  evidence.
- Protects canonical AppData and does not casually uninstall, reset seller data
  or recreate large build caches.

### GitHub and GitHub Actions

GitHub is infrastructure and durable authority, not a third coding agent.

- Protected `main` is integrated source truth.
- Branches and PRs are proposed work.
- Actions is clean-checkout verification and artifact production authority.
- Releases bind exact source, versions, signatures, artifacts and evidence.
- PR comments, checks and issues carry review, scope and acceptance facts.

## Core rules

1. One work package has one owning agent, one branch and one PR.
2. No direct work on protected `main`.
3. The non-authoring agent reviews material work.
4. Shared schema, migration, domain and design-system contracts are serialized
   before dependent parallel work.
5. Parallel work is allowed only when contracts and files are independent.
6. No important decision or intended work remains only in chat or an unpushed
   checkout.
7. `CURRENT_STATE.md` describes merged `main`; `WORKING_MEMORY.md` describes the
   execution frontier and in-flight work.
8. Source changes or green CI do not complete a capability; the named outcome
   and required evidence must pass.
9. Arabic/RTL, accessibility, recovery states and low-resource performance are
   continuous product requirements, not final polish.
10. Public Stable claims remain evidence-gated even when implementation is
    compressed into a small number of intensive sessions.

## Completion Operating Model v2

### Multi-phase sessions

Each intensive execution session advances multiple roadmap phases when their
shared dependencies permit. A session is not limited to one small correction.
It normally combines foundation, seller journeys, experience quality and
platform work through independent lanes.

The four-session execution overlay is defined in `../system/ROADMAP.md` and the
compact current entry point is in `WORKING_MEMORY.md`.

### Work lanes and WIP limits

#### Core authority lane — WIP 1

Owns shared contracts that dependent work may not reinvent:

- workspace and trusted shop context;
- schema, migration and compatibility;
- business state machines;
- stock and money movements;
- trusted audit, inbox/outbox, idempotency and permissions.

#### Seller vertical lanes — WIP 2 total

Each lane delivers one observable seller journey across UI, API, domain and
database after the required shared contracts are frozen. The two vertical lanes
must not overlap ownership of the same contract or files.

#### Experience and Arabic lane — WIP 1

Owns the cross-application quality foundation and works continuously:

- design tokens, typography and navigation architecture;
- Arabic-first copy and typography;
- real RTL geometry and mixed Arabic/Latin content;
- tables, charts, icons, forms, dialogs, focus and keyboard behavior;
- loading, empty, error, degraded, stale, conflict and recovery states;
- responsive and 1366×768 containment;
- accessibility and visual polish.

A major unusable Arabic/RTL or UX failure in the named outcome is P1, not P3.

#### Platform and performance lane — WIP 1

Owns:

- cold and warm startup;
- updater and release automation;
- packaging, diagnostics and CI elapsed time;
- backup/restore infrastructure;
- low-resource scheduling and long-session stability.

At most one frozen signed candidate may be in flight. Release publication,
installation or Founder observation does not stop independent development.

## Work-package contract

Before implementation, record in the PR body and Working Memory:

- seller/Founder outcome;
- governing Founder decision, product clause and capability/journey;
- architecture invariants and frozen shared contracts;
- source baseline and owner;
- scope and explicit non-goals;
- existing data/behavior to preserve;
- migration, compatibility and forward-repair strategy;
- threat/privacy implications;
- Arabic/RTL, accessibility and performance implications;
- required automated, installed and Founder evidence.

Normal branch lifetime is less than two working days. A package that cannot
produce a coherent observable outcome in about one or two days is split by
usable outcomes, not by arbitrary backend/frontend files.

Ordinary feature PRs do not bump the app version. Do not mix drive-by refactors,
unrelated dependency upgrades, broad formatting or general cleanup into a
product outcome.

## Start/resume protocol

Before changing anything:

1. Declare the actual environment: Web checkout, Desktop local Windows, GitHub
   Actions Linux/Windows, or installed Windows artifact.
2. Read `AGENTS.md`, this file and `WORKING_MEMORY.md`.
3. Read the governing product, experience, decisions, architecture, current
   state and roadmap sections.
4. Synchronize with protected `main` and inspect repository status.
5. Preserve unrelated user work.
6. Resolve active PR/branch ownership and the WIP-lane allocation.
7. State the exact multi-phase session outcomes.
8. Freeze shared contracts before dependent parallel implementation.

Chat history is useful context but never substitutes for current GitHub
authority.

## Branch and PR practice

- Branch naming: `agent/<outcome>`.
- Branch from current protected `main`.
- Rebase or merge current `main` deliberately; never hide conflicts.
- Open a draft PR early for material work.
- Push meaningful coherent batches rather than every tiny edit.
- Keep one PR focused enough to review as one outcome.
- PR body states purpose, current gap, exact changes, preservation, risks,
  evidence and next action.
- Move a ready PR back to draft before a multi-commit correction cycle.
- Merge dependency-correct packages as soon as their selected gates and review
  pass; do not wait for an unrelated candidate installation.

## Review model

### Review passes

Material work receives:

1. contract review before substantial dependent implementation;
2. author self-review;
3. one independent review of the frozen implementation head;
4. one consolidated repair batch for actionable blockers.

Review findings are classified by severity rather than allowed to create an
unbounded loop.

### Severity

- **P0 — stop immediately:** data loss, security compromise, cross-shop leakage,
  corrupt update/restore, irreversible stock or money damage.
- **P1 — blocks merge or release:** broken required journey, authority bypass,
  duplicate effect, unsafe migration, startup/install failure, or major unusable
  Arabic/UX failure in the named outcome.
- **P2 — scheduled hardening:** bounded edge case or secondary inconsistency that
  does not invalidate the package outcome.
- **P3 — polish backlog:** low-impact cleanup or optional optimization.

P2/P3 findings do not repeatedly reopen a frozen green release candidate. Group
them into focused follow-up packages with an owner and dependency position.

## Risk-aware CI

`Required PR gate` is the single protected-branch aggregate check. It requires
classification, fast authority and every lane selected for the exact PR head.

### Draft head

Run only fast feedback appropriate to changed paths:

- path/risk classification;
- product/version/documentation authority;
- targeted type/lint checks where available;
- relevant focused unit/domain tests.

### Frozen review head

When the coherent head becomes ready, run the selected full lanes once:

- complete type/lint/unit/domain quality;
- database/integration/migration checks when applicable;
- Linux Rust/Tauri when applicable;
- Windows standalone/Rust/MSI only for affected risk.

Installed-MSI testing is selected for native startup, migrations, packaged
runtime, installer/updater, signing/version or release-authority risk. Ordinary
business/UI PRs do not build an MSI merely because they change the installed
application.

### CI economy

- Never rerun an unchanged passing exact head.
- Cancel superseded runs.
- Retry only failed infrastructure jobs when evidence supports a transient
  failure.
- Do not dispatch duplicate full workflows while one is running.
- Retain lane timing and diagnose the slow stage before repeating a pipeline.
- Documentation-only work runs authority/audit only and never creates an MSI.

Healthy targets are under two minutes for draft authority, under fifteen minutes
for ordinary reviewable source feedback and 10–20 minutes from a frozen milestone
merge set to a published Internal updater under healthy infrastructure.

## Milestone Internal release train

Routine Internal delivery is milestone/session-based, not one release for every
tiny merged PR.

1. Merge independently complete packages to protected `main` without ordinary
   feature version bumps.
2. When the merged outcomes form one coherent Founder test, create one exact
   release request and unique immutable Internal version.
3. Build the exact-source signed MSI, signature and `latest.json` as a draft.
4. Verify source binding, signature, packaged runtime, installed launch/reopen,
   authenticated hydrated UI, deterministic evidence and manifest.
5. Publish automatically only in a protected final step after every required
   post-build gate succeeds.
6. Failed candidates remain drafts and never reach the live updater endpoint.
7. Install through the existing in-app updater, preserve AppData, observe the
   named milestone, close and reopen, and record Founder result.

Manual MSI is recovery/bootstrap only. Manual GitHub publication is not the
routine Internal model after the protected automatic-promotion step is
implemented.

Beta and Stable always require explicit Founder approval. Internal automation
must never promote or leak unfinished work into those channels.

## Completion states

- **Source-complete package** — coherent PR merged to protected `main`.
- **Release-complete milestone** — exact-source signed candidate passed every
  selected release and installed-artifact gate and was published.
- **Founder-accepted milestone** — installed update preserved data, reopened and
  demonstrated the named outcomes on the reference machine.
- **Stable-complete product** — representative beta, provider, security/privacy,
  legal, restore, compatibility and rollout gates also pass.

A source-complete package may be followed by independent work before the
milestone candidate is accepted. A dependent package may not bypass an unproven
shared contract.

## Performance workflow

Startup and low-resource performance are a dedicated platform lane, not a reason
to freeze the whole program.

Measure before changing architecture:

```text
native process start
→ registry/migration
→ packaged runtime launch
→ first socket listening
→ authenticated semantic readiness
→ dashboard response
→ WebView hydration
→ first usable interaction
```

Fix the largest measured stage first. Record cold and warm attempts separately.
Do not delete AppData/caches, reinstall or weaken authenticated readiness to make
a number look better. The product target remains the T470 and 4 GB/HDD envelope
in the active product decisions.

## Database and migration rules

- Production schema uses append-only reviewed migrations; `db push` is
  development-only.
- Inventory every affected shop/database and format.
- Preflight disk, version, compatibility and required backup.
- Never silently initialize an empty database over an existing failure.
- Migrations are journaled, restartable and observable.
- Preserve Founder data unless an explicit destructive ceremony is approved.
- No schema-only package without a compatible application path.
- Failed migration leaves an explicit recoverable state.
- Restore is atomic; failure leaves the current installation unchanged.

## Business transaction and provider rules

- Derive workspace/shop/member/device/permission from trusted context.
- Validate state transition and idempotency before effects.
- Commit domain mutation, required movements, trusted audit, domain event,
  outbox and compensation facts atomically.
- Persist authenticated inbound events before acknowledgement.
- Store stable effect keys, attempts, receipts and ambiguous-result state.
- Checkpoints advance only after prior work commits or enters governed dead
  letter.
- Money uses integer smallest units and explicit currency.
- Stock, money, status and provider effects reverse through explicit
  compensating facts.
- Provider code remains hidden or conditional until capability-specific live
  certification.

## UI and experience completion

Every material UI change applies `../product/EXPERIENCE.md` with real content:

- happy, loading, first-use empty, filtered-empty, success-empty, permission,
  offline, stale, pending, conflict, error, retry and recovery states;
- normal, destructive, bulk and keyboard behavior;
- Arabic, French and English with real RTL/LTR parity;
- Arabic joining, typography and mixed-direction numbers/identifiers;
- 1366×768, responsive layout and 100–200% zoom;
- screen-reader, focus and reduced-motion behavior;
- representative data and low-end responsiveness;
- trust cues for shop, actor, money, stock, sync and commit authority.

Attractive screenshots do not replace journey evidence.

## Validation layers

Use only the evidence an environment can prove:

1. static/source;
2. unit/domain;
3. integration/API/database;
4. development UI;
5. clean GitHub Actions;
6. signed artifact;
7. installed Windows;
8. T470 and floor-device hardware;
9. external/provider;
10. representative seller/Beta.

A lower layer cannot claim a higher one.

## Low-storage Founder machine

- The Desktop Agent may inspect and edit source locally, but does not run builds,
  automated tests, coverage, dependency installation or heavy validation.
- Builds, matrices and Windows packaging belong in GitHub Actions.
- Do not require permanent `node_modules`, `.next`, Rust `target` or repeated
  installer caches locally.
- Use exact prebuilt artifacts for installation and observation.
- Do not delete canonical Roaming/Local AppData, registry, databases, migration
  records or keys during routine work.
- Record exact machine, profile, artifact and timing for performance claims.

## Documentation updates

- Founder choice → `product/DECISIONS.md` plus affected owner.
- Scope/public promise → `product/PRODUCT.md`.
- Capability/journey/UI standard → `product/EXPERIENCE.md`.
- Target invariant/protocol → `system/ARCHITECTURE.md`.
- Merged implementation/evidence → `system/CURRENT_STATE.md`.
- Dependency and multi-session order → `system/ROADMAP.md`.
- Workflow/release practice → this file.
- Execution frontier → `WORKING_MEMORY.md`.
- Adopted research → `research/RESEARCH.md`.

Update an owner. Do not create another permanent plan, gap report, wave, prompt,
status or handoff document. Issue #164 is the tracked execution epic, not an
additional documentation authority.

## Stop conditions

Stop and escalate when:

- a consequential Founder choice is missing;
- branch ownership or shared-contract overlap is unclear;
- preservation would require destructive data handling;
- signing/secrets/permissions are unavailable;
- evidence disproves the governing design;
- a protected workflow requires unavailable authority;
- exact source cannot bind to the release;
- a P0 or unresolved P1 exists;
- public claims would exceed current evidence.
