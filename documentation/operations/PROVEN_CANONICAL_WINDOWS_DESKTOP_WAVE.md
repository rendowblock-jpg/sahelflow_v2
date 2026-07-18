# Wave: Proven Canonical Windows Desktop

> Started: 2026-07-17  
> Current focus: Phase 1A/1B source completion for authenticated runtime, explicit shop authority and recoverable all-shop migration
> Lead: Codex Desktop / ChatGPT continuity

## Founder intent and outcome

A seller can install one Windows candidate, start it reliably, open only the intended shop, and receive a clear recoverable failure instead of silent fallback or partial startup. The repository can prove this from a clean checkout.

## Governing contract

- Product clause or Founder decision: SahelFlow 1.0 Launch Constitution and Launch Scope requirements for canonical local Windows operation, shop entitlements, data preservation, low-end support and evidence-gated claims.
- Scope class: Required for the Windows desktop, shop isolation, startup/recovery behavior and clean-checkout proof; Depth requirement for explicit degraded/error/recovery states; Candidate only for exact implementation mechanisms not already fixed by engineering authority.
- Capability atlas section: desktop shell/runtime, shop management, settings/support diagnostics, local data authority and migration/recovery surfaces.
- Journey and required states: install/first launch, startup, open intended shop, switch shop, missing/corrupt registry, missing shop file, occupied endpoint, missing runtime resource, child-process failure, migration preflight/failure/interruption, maintenance and recovery. Applicable states include loading, pending, ready, degraded, blocked, rejected, error, maintenance and recoverable failure.
- Experience dimensions and page-completion obligations: trustworthy authority/freshness, clear progress and failure language, no silent fallback, keyboard and screen-reader operability, Arabic/French/English and RTL/LTR behavior where seller-visible, 1366×768 and low-end behavior, reduced motion and support-readable diagnostics.
- Engineering invariants / ADRs: canonical Windows desktop remains final local business-mutation authority; explicit trusted shop context; one operational SQLite database per shop; atomic versioned registry; no silent database fallback; supervised authenticated local runtime; append-only all-shop migration with preflight, journal, verified snapshot gate and fail-closed recovery; artifact-level evidence separated from source claims.
- Roadmap phase and dependencies: Phase 0, then the minimum converging Phase 1A runtime and Phase 1B shop/data authority work needed for the installed candidate.
- Risk class and evidence layers: R0 for wave/inventory records; R3 for authenticated runtime and trusted shop context; R4 for migrations, data survivability and installed candidate/release authority. Evidence must distinguish source inspection, clean-checkout command execution, installed Windows artifact, failure injection, migration/recovery drills and reference-hardware measurements.
- Explicit non-goals: no Cloudflare implementation; no hosted storefront; no remote PWA; no provider expansion; no broad page redesign; no deletion of legacy runtime or data paths before compatible migration and recovery evidence exist.

## Current reality

The integrated evidence below remains tied to the original wave branch and Actions runs. The current local Windows implementation checkpoint is on `agent/authenticated-runtime-protocol` and is uncommitted, so its source/test observations do not yet constitute clean-checkout or artifact evidence:

- GitHub billing was the original pre-step Actions blocker and is resolved; current jobs execute normally.
- CI now binds clean-checkout dependency installation, Prisma generation and migration deployment, documentation authority audit, TypeScript, ESLint, Vitest, coverage, production dependency audit, migration status and Tauri Rust compilation.
- The CI fallback `SF_MASTER_KEY` was invalid for the encryption contract. It is now a deterministic 64-character hexadecimal test key; run #371 passed the full Quality Gate after this repair.
- Tauri `externalBin` resolution requires a target-suffixed binary even for Linux cargo checking. CI now creates only a temporary Linux placeholder; packaged Windows sidecar contents are unchanged.
- `sf-verify` retains complete failure output and CI uploads bounded diagnostic artifacts when Actions logs are truncated.
- `sf-inventory` generates machine-readable clean-checkout inventories without becoming a competing permanent authority. Run #374 retained a seven-day artifact.
- The retained inventory at commit `bf369cd5f091dd0d74bcbdac12f07ba00c8b2238` reports 691 tracked files, 38 Markdown files, 9 READMEs, 31 pages, 114 API routes, 33 commands, 125 components, 2 design-token source files, 142 CSS custom-property tokens, 31 Prisma models, 9 migration files, 97 test files, 35 provider/integration files and 13 sidecar/desktop resource files.
- A 2026-07-18 dirty-tree diagnostic refresh reports 692 files, 36 commands and 14 sidecar/desktop resource files, with the other headline counts unchanged. Because it used `--allow-dirty`, it is drift information rather than retained clean-checkout evidence.
- The earlier Rust smoke used debug `cargo check`, which excluded the actual packaged startup code behind `cfg(not(debug_assertions))`. CI now runs `cargo check --release` and retains the release compile log on failure.
- Release-path compilation exposed a latent `tauri-plugin-shell` API misuse in the existing standalone-server command construction. The program and server argument are now passed through `.command(runtime).arg(server_path)`.
- The first Phase 1A runtime patch is implemented: missing standalone resources, missing runtime, server spawn failure, supervisor-state failure and readiness timeout now abort Tauri setup; a timed-out server child is killed; the WhatsApp sidecar starts only after the mandatory application server is proven ready.
- Run #378 passed the full Quality Gate and `cargo check --release` for the runtime patch.
- The local source checkpoint replaces fixed packaged endpoints with OS-allocated loopback ports and independent per-launch runtime, application and sidecar credentials. Readiness verifies the exact process identity, instance header, app version, port, shop ID, positive registry revision, migration-set digest and required checks.
- A hidden main window now navigates to either an authenticated bootstrap URL after readiness or a seller-visible blocked-startup document with redacted support diagnostics. One explicit supervisor state machine gives post-ready crashes and failed restart attempts a shared three-attempt 2/5/15-second budget, resets after 60 stable seconds, enters persistent-diagnostic crash-loop safe mode on exhaustion, and rejects restart/child registration after shutdown begins.
- The local source checkpoint introduces process-bound `ShopContext`, an atomic versioned registry, exact database-file authority, all-shop migration planning, an external journal, verified snapshots, OS-backed installation locking, interrupted-run restoration and a migrated shop template.
- The coordinator now writes `migration-journal/compatibility.json` atomically with per-shop current/migration-required/blocked state, applied and pending counts, inferred-legacy status, snapshot-space requirements and bounded failure detail. Blocked startup errors include the report path for support.
- Legacy registry imports now start at revision 1 and non-empty revision-0 registries fail closed, matching the runtime readiness contract.
- Domain `ServiceContext` and AI `ToolContext` carry explicit shop authority; the AI agent, storefront/import transactions and service-routed production writes pass the process-bound context. Audit, auth persistence, refunds, COD, phone reputation, conversations, extraction metrics, canned responses and the order-change ledger now use the same authority boundary. A test-only raw-Prisma escape remains explicit through `never`.
- E-commerce sync now receives caller-supplied `ServiceContext`; its direct customer, order and integration mutations no longer select authority through a global database import.
- Automation dispatch now carries the originating `ServiceContext` through trigger lookup, low-stock dispatch, logging, retries, customer tagging and automated order-status transitions.
- The secret repository and e-commerce, delivery, Google Sheets, Gemini and extraction credential loaders now require explicit `ServiceContext`; packaged Google Sheets loading cannot fall back to a process working-directory credential file.
- Route-local import, delivery, return, storefront, settings-reset, profile, expense, automation, license and AI-session mutations now root transactions and writes through an explicit `{ prisma, shop }` tuple. Production routes contain no direct global-`db` mutation or global-`db.$transaction` root. The 23 remaining raw-name mutation matches across eight service/tool files are verified aliases of `ServiceContext.prisma` or `ToolContext.db`.
- Local verification on 2026-07-18: the full shared gate passed Prisma generation, migration deployment, TypeScript, ESLint and the complete Vitest suite in a fresh disposable sandbox; the consolidated write-path regression wave passed 198/198 tests across 13 suites, including delivery, returns/refunds, storefront/import creation, orders/COD, AI tools/consent, auth and cross-table integrity. `cargo test --all-features` passed all 20 tests, `cargo clippy --lib --all-features -- -D warnings` passed and `cargo check --release` passed without warnings.
- Eleven coordinator tests now cover fresh installation, positive legacy revision, real OS lock behavior, rollback, interruption restoration, corrupt registry, divergent history with per-shop compatibility detail, deterministic low disk before snapshots, a zero-space no-op rerun, two-shop migration with row preservation, and a one-version-back representative fixture upgraded through the repository's actual packaged migrations.
- The mechanically enumerated Phase 1B source write-authority and migration-coordinator sub-gates are met. Phase 1B is not complete because the consolidated checkpoint has not passed a fresh clean-checkout Quality Gate, and installed Windows migration/failure-injection plus a separately approved representative seller-data copy remain unproven.
- No packaged Windows, failure-injection, migration/recovery, provider, performance, T470 or 4 GB result is claimed yet.

The current session has the local Windows checkout and Rust/TypeScript test toolchain. No MSI was built, installed or launched, and installation remains a separately confirmed implementation-lab action.

## Target experience or system

The internal installed candidate must expose one deterministic startup state machine:

1. validate bundled resources and candidate manifest;
2. establish per-launch authenticated local service endpoints;
3. start and supervise required processes;
4. validate the atomic shop registry;
5. resolve exactly one explicit shop context;
6. preflight schema compatibility and required migrations across registered shops;
7. enter ready only after all required gates pass;
8. otherwise enter a named blocked/degraded/recovery state with safe retry, diagnostics and no fallback to another shop or partial-ready shell.

## Deep-dive findings

- `sf-audit`, `sf-verify` and `sf-inventory` now execute from clean Actions checkouts and are retained through visible steps or artifacts.
- Source inventory confirms the runtime/shop migration surface is broad enough that call-site enumeration must precede a `ShopContext` rewrite.
- Packaged startup now uses per-launch loopback endpoints and credentials, exact process/shop readiness, a seller-visible blocked document and a locally tested bounded restart/crash-loop policy. Installed process-kill, shutdown-race, sleep/resume and reboot proof remains missing.
- WhatsApp remains a degradable capability with backoff respawn and demo/offline behavior. Its exact required/degraded policy must be represented in the startup state model rather than inferred from logs.
- The coordinator enumerates the versioned registry, reports compatibility per shop, reserves verified-snapshot space only when work is pending, migrates every registered database and restores all verified snapshots after failure/interruption. Source drills cover low disk, rerun, multi-shop and supported one-version-back packaged migration; installed and representative real-data evidence remains.
- The direct-write source inventory is closed for the current production mutation graph. New repository, background or remote execution paths must accept explicit context and must not reintroduce global active-shop selection.

## Multi-phase plan

### Phase: 0A — Clean-checkout authority and repository truth

- Status: source-level command and inventory evidence complete for the current branch; refresh after material source changes.
- Evidence: runs #371, #374 and #378 plus the retained `phase0-repository-inventory` artifact.

### Phase: 0B — CI startup and shared-command repair

- Status: complete for current branch.
- Evidence: run #378 passed every configured Quality Gate and release-path Rust step.

### Phase: 0C — Installed Windows candidate baseline

- Status: not executed; requires Windows implementation lab.
- Purpose: produce one internal Windows-only candidate and establish runtime/readiness truth through clean install, missing resource, occupied endpoint, child failure and shutdown/restart evidence.

### Phase: 1A — Supervised authenticated local runtime

- Status: source runtime/restart protocol locally verified; clean-checkout and installed evidence incomplete.
- Completed bounded work: mandatory application-server failures abort setup; timeout kills the child; optional sidecar starts only after readiness; per-launch endpoints and credentials authenticate readiness/bootstrap; readiness binds process and shop authority; blocked startup is seller-visible and writes redacted diagnostics; one state machine bounds crash/restart failures, stable reset, safe mode and shutdown registration.
- Next work: create a separately authorized committed checkpoint for the clean-checkout gate, then failure-inject child crash, failed restart, shutdown race, sleep/resume and reboot in an installed candidate.
- Evidence: 20 Rust tests, warning-denied Clippy and release compile are green; installed-candidate failure-injection proof remains required before completion.

### Phase: 1B — Explicit shop authority and safe all-shop migration

- Status: source write-authority and migration-coordinator sub-gates met and locally verified; clean-checkout and installed exit evidence not met.
- Completed bounded work: process-bound `ShopContext`; atomic versioned registry; positive imported revisions; process-bound database without registry fallback; production service/AI/e-commerce-sync/automation/credential/audit/auth/repository/API context propagation; packaged migration deployment; per-shop compatibility report; all-shop coordinator; external journal; verified snapshots; pending-work disk reserve; OS lock; corrupt/divergent-registry/history failure; rollback, interruption, rerun, multi-shop and actual packaged current-data tests.
- Next work: create a separately authorized committed checkpoint for clean-checkout consolidation verification before separately approved installed Windows and representative-data drills.

### Phase: 0D — Reference baseline

- Status: not executed.
- Work: run the exact candidate and datasets on ThinkPad T470 and an agreed 4 GB floor-reference environment.

## Decisions

| Decision | Why | Decided by or evidence | Date |
|---|---|---|---|
| Base the wave on `main` commit `5fe00b5cb85505e5df27499fe46d0fa6050c0788`. | It is the integrated default-branch commit observed at wave start. | GitHub repository inspection. | 2026-07-17 |
| Use a valid deterministic 256-bit hexadecimal fallback key in CI. | The earlier placeholder violated the encryption key contract and caused broad test failure. | Retained diagnostics; run #371. | 2026-07-17 |
| Create the target-suffixed Linux sidecar placeholder inside CI only. | Tauri validation needs the path for Linux checking; committing a fake packaged sidecar would weaken artifact truth. | Build-script error and green smoke. | 2026-07-17 |
| Retain diagnostic artifacts for truncated Quality Gate and Rust logs. | Connector responses can omit the failure tail; artifacts provide exact bounded evidence. | Runs #370 and #377. | 2026-07-17 |
| Add `sf-inventory` as a mechanical evidence command. | Phase 0 requires repeatable inventories without creating a second authority. | Run #374. | 2026-07-17 |
| Compile Tauri with `cargo check --release` in CI. | Packaged startup code is behind `cfg(not(debug_assertions))`; debug checking excluded it. | Runs #376 and #378. | 2026-07-17 |
| Fail closed when the mandatory application server is unavailable. | Returning success allowed a blank or partial-ready shell. | Source inspection and run #378. | 2026-07-17 |
| Start the degradable WhatsApp sidecar only after mandatory server readiness. | A failed shell launch must not leave an orphan sidecar or imply partial readiness. | Source inspection and release compile. | 2026-07-17 |

## Working notes and open questions

- Enumerate startup/readiness and shop-routing call sites from the inventory; filename counts alone are not completeness proof.
- The next Phase 1A patch must produce a structured blocked/recovery state visible to the seller, not only a panic or stderr message.
- Endpoint allocation, per-launch credentials and readiness must be one bounded supervisor protocol.
- Select registry and `ShopContext` interfaces only after current call sites and background scopes are observed.
- Exact T470 and 4 GB reference datasets remain implementation-lab choices.

## Implementation and evidence

- Branch and PR: `agent/proven-canonical-windows-desktop`; draft PR #100.
- Green clean-checkout CI: run #371 (`29603869888`) and run #374 (`29604264999`).
- Green runtime checkpoint: run #378 (`29605285748`) passed authority audit, inventory, Prisma generation/deploy/status, TypeScript, ESLint, Vitest, coverage, security audit and `cargo check --release`.
- Inventory artifact: `phase0-repository-inventory`, artifact `8416217843`, digest `sha256:545f9ebbf1b9857bc7f44561c0f28832c5421bcf452bdd0036492380f3fd376c`.
- Runtime source: Tauri setup rejects mandatory local-server startup failures and does not start the sidecar before server readiness.
- Visual/RTL/accessibility evidence: none yet for the blocked/recovery startup state.
- Packaged/provider/recovery evidence: none yet.
- Known limitation: CI proves clean Linux checkout and release compilation, not an installed Windows candidate.

## Current checkpoint

- What is now true: the uncommitted source has an authenticated per-launch runtime, seller-visible blocked startup, process-bound shop authority, atomic registry and recoverable all-shop migration coordinator; the enumerated production write graph carries explicit shop authority; targeted TypeScript/Rust checks are green.
- What changed in the plan: Phase 1A and 1B source work now proceed together because readiness is bound to the exact registry/shop/migration authority tuple.
- Current uncertainty: clean-checkout consolidation, real child-process failure injection, representative real seller data and all installed Windows behavior remain unproven. Source scans, state-machine tests and fixtures are not proof against machine-specific failures.
- Exact next move: create a separately authorized committed checkpoint for clean-checkout CI before any MSI or installed-candidate action.
