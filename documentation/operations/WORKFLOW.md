# SahelFlow — Coding, Review and Delivery Workflow

> **Status:** Active operating contract
> **Agents:** ChatGPT Web Agentic Coding Agent and Desktop Agent
> **Durable truth:** GitHub protected `main`, branches, PRs, Actions, releases
> and evidence
> **Last consolidated:** 2026-07-27

This workflow optimizes for the fastest path to flawless product completion:
clear ownership, dependency-correct work, independent review, exact evidence
and continuous delivery to the Founder-installed application.

GLM, Codex Cloud, MAWS and the `agent-handoff` continuity model are not part of
the active workflow.

## Roles

### Founder

- Sets product direction, price, entitlements, priorities and value judgments.
- Resolves genuinely consequential product/business tradeoffs.
- Approves sensitive signing, payment and release actions.
- Installs and observes Founder Internal updates on the reference machine.
- Decides Beta/Stable promotion.

### Web Agent

- Works from a synchronized GitHub repository checkout.
- Investigates source and authoritative documentation.
- Designs and implements complete work packages.
- Runs all available environment-valid checks.
- Creates branches, commits, pushes and PRs.
- Reviews Desktop Agent PRs.
- Does not claim local installed-Windows evidence it did not observe.

### Desktop Agent

- Works in the local SahelFlow checkout on a branch from current protected
  `main`.
- Designs and implements complete work packages and pushes them to GitHub.
- Does not run source builds, automated tests, coverage, dependency
  installation or other heavy validation on the Founder machine.
- Uses GitHub Actions on the exact pushed commit for required source, test,
  build and packaging evidence.
- Uses the local machine for lightweight source inspection and editing plus
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
- Branches/PRs are proposed work.
- Actions is clean-checkout verification and artifact production authority.
- Actions runs all required builds, automated tests, coverage and heavy
  validation for Desktop-owned work; a local Desktop run is not a prerequisite.
- Releases bind exact source, versions, signatures, artifacts and evidence.
- PR comments/checks carry review and acceptance facts.

## Core rules

1. One task has one owning agent.
2. One coherent work package uses one branch and one PR.
3. No direct work on protected `main`.
4. The other agent reviews material work before completion.
5. Parallel work is allowed only when contracts and files are independent.
6. Shared schema, migration, domain contracts and design-system primitives are
   serialized before dependent parallel work.
7. No important work or decision remains only in chat or an unpushed local
   checkout.
8. `CURRENT_STATE.md` describes merged `main`; `WORKING_MEMORY.md` describes
   everything still in flight.
9. Product code is not complete because files changed or CI turned green; the
   governed capability/journey outcome and evidence must pass.
10. Founder questions are reserved for consequential product, money,
    ownership, privacy and user-experience choices. Agents decide ordinary
    technical mechanics professionally.

## Fast agentic delivery loop

The default loop optimizes elapsed time without separating quality from the
seller outcome:

1. Select one dependency-correct vertical outcome and include every affected
   layer required to make it complete; avoid isolated line-by-line chores and
   unrelated cleanup.
2. Branch from current protected `main`, keep the PR draft during implementation
   and push meaningful coherent batches instead of triggering automation for
   each small edit.
3. Draft synchronization runs only risk classification and fast authority.
   Read and fix that feedback while coding; do not manually dispatch Windows or
   MSI workflows during ordinary draft iteration.
4. Complete self-review, tests, documentation and migration/recovery reasoning,
   then mark one coherent head ready once. That transition starts only the
   heavy lanes selected by its paths and risk.
5. A failed selected lane or actionable review finding is corrected on the same
   branch. Move back to draft for a multi-commit repair cycle; do not rerun a
   still-running or already-passing exact head.
6. Merge after the required aggregate gate and review pass. Documentation-only
   packages end there and never create an MSI.
7. An app-changing merge produces one immutable signed Internal candidate.
   Install it once through the current in-app updater, observe the real change,
   preservation, close and reopen, then record acceptance. Manual MSI is only a
   bounded updater bootstrap or recovery action.

Healthy-infrastructure service goals are under two minutes for draft authority
feedback, under fifteen minutes for ordinary reviewable source feedback and
10–20 minutes from an app-changing merge to a published Founder updater. These
are operating targets, not permission to bypass a selected safety gate. When a
target is missed, identify the slow stage from retained timings and repair or
reroute that stage before repeating the whole workflow.

## Start/resume protocol

Before changing anything:

1. Declare environment: Web checkout, Desktop local Windows, GitHub Actions
   Linux/Windows, or installed Windows artifact.
2. Read `AGENTS.md`.
3. Read this file and `WORKING_MEMORY.md`.
4. Read the governing product, experience, architecture, current-state and
   roadmap sections.
5. Synchronize with protected `main`.
6. Inspect `git status`; preserve unrelated user work.
7. Resolve active PR/branch ownership.
8. State the exact outcome, non-goals, risk class and evidence required.

Chat history is useful context but never a substitute for current GitHub
authority.

## Work-package contract

Before implementation, record:

- outcome in seller/Founder terms;
- governing product clause and decision;
- capability IDs and journeys/states;
- architecture invariants;
- source baseline and branch owner;
- in-scope and non-goals;
- existing data/behavior to preserve;
- migration/compatibility and rollback/forward-repair strategy;
- threat/privacy implications;
- target device/performance implications;
- acceptance evidence and Founder observation required.

Do not create a new permanent planning document. Put the compact contract in
the PR body and active Working Memory; update the owning durable documents when
the product, architecture, current state or roadmap actually changes.

## Branch and PR practice

- Branch naming: `agent/<outcome>`.
- Branch from current protected `main`.
- Rebase or merge current `main` only deliberately; never hide conflicts.
- Commit coherent checkpoints with concise intent.
- Push before ending a session that contains intended work.
- Open a draft PR early for material work.
- Keep one PR focused enough to review and install as one outcome.
- Do not mix drive-by refactors, unrelated dependency upgrades or broad
  formatting into a product change.
- PR body states purpose, root/current gap, exact changes, preservation,
  risks, evidence and next action.
- Review findings are resolved in the same PR unless they prove the scope itself
  is wrong.

### Risk-aware PR automation

- `Required PR gate` is the single protected-branch and signed-release check.
  It always verifies exact-head risk classification and the fast version/docs
  authority lane, then requires every lane selected for the changed paths.
- Draft PR synchronization runs only classification and fast authority. Keep
  material work in draft while coding; `ready_for_review` starts the selected
  heavy lanes once for the reviewable head.
- A new commit on a ready PR reruns the selected lanes because the reviewed tree
  changed. Move the PR back to draft before a multi-commit revision cycle.
- Documentation-only changes do not install dependencies or run application
  builds. Ordinary web source changes run the full source-quality lane without
  Windows packaging.
- Tauri, contained runtime, database/migration, installer, updater, version and
  release-authority paths select progressively stronger Rust, Windows runtime
  and installed-MSI lanes. Version or signed-release authority changes require
  the full set.
- Windows parity and installed-MSI workflows are reusable/manual workflows;
  they do not trigger independently on every PR push or again after merge.
- Protected-main merges do not repeat PR source checks. Exact-tree signed builds
  still perform their own packaging, signature, installed-runtime and visible-UI
  gates because those prove the produced artifact rather than repeat source CI.
- Signed-release status observation records completed runs only; requested-state
  chatter does not create duplicate PR updates.

## Risk classes

Risk determines evidence depth; it never weakens product quality.

### R0 — Documentation and non-executable metadata

Examples: active docs, comments, non-runtime inventories.

Required:

- authority and conflict review;
- link/reference/audit validation;
- no application update unless packaging/updater/release authority changed.

### R1 — Presentation and read-only behavior

Examples: copy, layout, visual hierarchy, read-only projections.

Required:

- type/lint/unit checks;
- representative data and all applicable page states;
- AR/FR/EN, RTL/LTR, keyboard, zoom and accessibility review;
- installed Founder update for material app-visible work.

### R2 — Ordinary local business writes

Examples: product/customer/settings writes with bounded effects.

Required:

- R1 evidence;
- domain/integration tests;
- authorization/shop boundaries;
- audit and migration/compatibility review;
- installed update and real workflow observation.

### R3 — Identity, money, secrets or external effects

Examples: orders, inventory, COD, refunds, roles, licenses, providers, AI
actions.

Required:

- R2 evidence;
- explicit state machine and invariants;
- transaction/idempotency/replay/concurrency and compensation tests;
- threat/privacy review;
- failure/degraded/recovery evidence;
- external sandbox/live proof when applicable;
- installed Founder acceptance.

### R4 — Data survivability and release authority

Examples: migrations, backup/restore, key recovery, installer/updater/signing.

Required:

- R3 evidence;
- exact-source clean-checkout artifacts;
- preflight, preservation, failure injection and recovery;
- clean install, in-place update, rollback-compatible repair and replacement
  restore as applicable;
- signed artifact/manifest/signature verification;
- installed Founder lifecycle acceptance.

## Validation layers

Use only the layers the environment can actually prove:

1. **Static/source** — types, lint, schema/contracts, dependency and policy
   inspection.
2. **Unit/domain** — invariants, calculations, validation, state transitions.
3. **Integration/API/database** — transactions, authorization, idempotency,
   migrations, retry and rollback.
4. **Development UI** — real browser flows and all required states in the
   available source environment.
5. **Clean GitHub Actions** — fresh checkout and exact commit.
6. **Signed artifact** — exact versions, hashes, signatures, manifests and
   retained evidence.
7. **Installed Windows** — MSI install/update, WebView, real UI, close/reopen,
   process teardown, registry/database/AppData preservation.
8. **Reference hardware** — T470 and 4 GB/HDD performance, long-session,
   sleep/resume/reboot where required.
9. **External/provider** — dated sandbox/live capability proof.
10. **Seller/beta** — representative operational outcome.

A lower layer cannot claim a higher one.

## Database and migration rules

- Production schema change uses append-only reviewed migrations; `db push` is
  development-only.
- Inventory every affected shop/database and format.
- Preflight disk, version, compatibility and required backup.
- Never silently initialize a new empty database over an existing failure.
- Migrations are journaled, restartable and observable.
- Preserve existing Founder data unless an explicit destructive ceremony is
  approved.
- No schema-only release without a compatible application path.
- Failed migration leaves a clear recoverable state.
- Restore is atomic; failure leaves the current installation unchanged.

## Business transaction and provider rules

- Derive workspace/shop/member/device/permission from trusted context.
- Validate state transition and idempotency before effects.
- Domain mutation, required movements, trusted audit and outbox commit
  atomically.
- Persist authenticated inbound events before acknowledgement.
- Store stable effect keys, attempts, receipts and ambiguous-result state.
- Advance checkpoints only after earlier work commits or enters a governed dead
  letter.
- Money uses integer smallest units and explicit currency.
- Stock, money, status and external effects reverse through explicit
  compensating facts.
- Provider code is hidden/conditional until capability-specific live
  certification.

## UI and experience completion

Every material UI change applies the contract in
`../product/EXPERIENCE.md`. Review real content and:

- loading, first-use empty, filtered-empty, success-empty, error, permission,
  offline, stale, pending, conflict, retry and recovery states;
- normal, destructive, bulk and keyboard behavior;
- AR/FR/EN and RTL/LTR;
- 1366×768, zoom and responsive layouts;
- screen-reader/focus/reduced-motion;
- representative data and low-end responsiveness;
- trust cues for shop, actor, money, stock, sync and commit authority.

Attractive screenshots do not replace journey evidence.

## Continuous Founder Internal update loop

Every work package that changes the installed app follows:

```text
task contract
→ owner branch
→ implementation and targeted checks
→ push/draft PR
→ cross-agent review
→ clean GitHub Actions
→ merge protected main
→ unique Internal version request
→ exact-source signed MSI + signature + latest.json
→ automated installed runtime and visible-UI acceptance
→ Founder Internal publication
→ in-app update over previous accepted version
→ AppData preservation
→ real UI/change observation, close and reopen
→ evidence record
→ final completion
```

### Completion states

- **Source-complete** — merged protected source.
- **Release-complete** — exact-source signed candidate passed release gates.
- **Founder-accepted** — real installed update preserved data, reopened and
  demonstrated the intended change.

App-changing work is finally complete only at Founder-accepted.

### Update rules

- Every app-changing work package gets a unique immutable version.
- Never rebuild or reuse a failed version.
- Release requests bind the exact protected-main merge SHA.
- The signed workflow may reuse successful required PR checks only after it
  proves the merged protected-main Git tree is byte-identical to the reviewed
  PR-head tree. It still performs the exact-source signed build and installed
  MSI/runtime/visible-UI gates; a commit/tree mismatch or missing check blocks
  release.
- Verify MSI hash, updater signature, trusted source and update manifest before
  installation.
- Routine updates install over the existing accepted version.
- Do not uninstall or delete AppData to make acceptance pass.
- At most one unaccepted Founder Internal version is in flight.
- If acceptance fails, stop related stacking and repair through a new version.
- Manual MSI installation is recovery/bootstrap only after the in-app updater
  path is established.
- Documentation-only work does not create an update unless executable release
  authority changed.

### Channels

- **Internal** — frequent Founder-only development delivery.
- **Beta** — selected representative sellers after phase gates.
- **Stable** — public evidence-approved release.

Internal cadence must never leak unfinished development builds to Beta/Stable
sellers.

## Low-storage Founder machine

- The Desktop Agent may inspect and edit source locally, but does not run builds,
  automated tests, coverage, dependency installation or heavy validation.
- Clean source checks, builds, full matrices and Windows packaging belong in
  GitHub Actions.
- Do not require permanent `node_modules`, `.next`, Rust `target` or repeated
  installer caches on the Founder machine.
- Use exact prebuilt artifacts for local installation and acceptance.
- Do not delete canonical Roaming/Local AppData, registry, database, migration
  records or master keys during routine work.
- Clean temporary artifacts only with explicit validated paths.
- Record the exact machine/profile/artifact for performance claims.

## Review

The non-authoring agent reviews:

- correctness against product and experience;
- authority, state and invariant gaps;
- data preservation and migration;
- security/privacy and abuse paths;
- concurrency, replay, failure and compensation;
- UI states, localization/accessibility and low-end behavior;
- tests that prove outcomes rather than implementation trivia;
- unnecessary scope, duplicate abstractions and stale documentation.

The reviewer challenges material assumptions and can block completion. Review
does not transfer branch ownership unless explicitly handed off.

## Merge gate

Before merge:

- scope is coherent and no unrelated user changes are staged;
- required checks for the risk class pass;
- migration/recovery and compatibility are reviewed;
- reviewer findings are resolved;
- docs accurately describe target/current/in-flight state;
- no secret/private data entered the diff or evidence;
- PR names the post-merge Internal delivery requirement.

## Documentation updates

- Founder product decision → `product/DECISIONS.md` plus affected owner.
- Scope/public promise → `product/PRODUCT.md`.
- Capability/journey/UI standard → `product/EXPERIENCE.md`.
- Target invariant/protocol → `system/ARCHITECTURE.md`.
- Merged implementation/evidence → `system/CURRENT_STATE.md`.
- Dependency order → `system/ROADMAP.md`.
- Workflow/release practice → this file.
- In-flight branch/build/update → `WORKING_MEMORY.md`.
- Adopted research → `research/RESEARCH.md`.

Update an owner; do not create another plan, gap report, wave, prompt, status or
handoff document.

## Stop conditions

Stop and escalate when:

- the requested action needs a new consequential Founder choice;
- branch ownership or overlapping changes are unclear;
- preservation requires destructive data handling;
- permissions/signing/secrets are unavailable;
- evidence disproves the governing design;
- a protected workflow requires authority not already granted;
- a release cannot bind exact source or preserve the accepted installation.
