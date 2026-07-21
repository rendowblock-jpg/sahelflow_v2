# Wave: Proven Canonical Windows Desktop

> Started: 2026-07-17  
> Current focus: Codex Cloud workflow transition and installed-candidate preparation  
> Lead: ChatGPT / Codex Cloud; Codex Desktop for installed-Windows evidence

## Founder intent and outcome

A seller can install one Windows candidate, start it reliably, open only the intended shop, and receive a clear recoverable failure instead of silent fallback or partial startup. The repository can prove this from a clean checkout.

The Founder must also be able to launch and evaluate the exact internal SahelFlow candidate on a low-end, SSD-constrained Windows PC without rebuilding the complete development workspace or retaining heavy dependency/build caches.

## Governing contract

- Product clause or Founder decision: SahelFlow 1.0 Launch Constitution and Launch Scope requirements for canonical local Windows operation, shop entitlements, data preservation, low-end support and evidence-gated claims.
- Scope class: Required for the Windows desktop, shop isolation, startup/recovery behavior and clean-checkout proof; Depth requirement for explicit degraded/error/recovery states; Candidate only for exact implementation mechanisms not already fixed by engineering authority.
- Capability atlas section: desktop shell/runtime, shop management, settings/support diagnostics, local data authority and migration/recovery surfaces.
- Journey and required states: install/first launch, startup, open intended shop, switch shop, missing/corrupt registry, missing shop file, occupied endpoint, missing runtime resource, child-process failure, migration preflight/failure/interruption, maintenance and recovery. Applicable states include loading, pending, ready, degraded, blocked, rejected, error, maintenance and recoverable failure.
- Experience dimensions and page-completion obligations: trustworthy authority/freshness, clear progress and failure language, no silent fallback, keyboard and screen-reader operability, Arabic/French/English and RTL/LTR behavior where seller-visible, 1366×768 and low-end behavior, reduced motion and support-readable diagnostics.
- Engineering invariants / ADRs: canonical Windows desktop remains final local business-mutation authority; explicit trusted shop context; one operational SQLite database per shop; atomic versioned registry; no silent database fallback; supervised authenticated local runtime; append-only all-shop migration with preflight, journal, verified snapshot gate and fail-closed recovery; artifact-level evidence separated from source claims.
- Roadmap phase and dependencies: Phase 0, then the minimum converging Phase 1A runtime and Phase 1B shop/data authority work needed for the installed candidate.
- Risk class and evidence layers: R0 for wave/inventory records; R3 for authenticated runtime and trusted shop context; R4 for migrations, data survivability and installed candidate/release authority. Evidence must distinguish source inspection, Codex Cloud or Codespaces Linux execution, clean-checkout GitHub Actions, produced Windows artifact, installed Windows behavior, failure injection, migration/recovery drills and reference-hardware measurements.
- Explicit non-goals: no Cloudflare implementation; no hosted storefront; no remote PWA; no provider expansion; no broad page redesign; no deletion of legacy runtime or data paths before compatible migration and recovery evidence exist; no requirement to restore a full local development toolchain merely to launch the candidate on the Founder PC.

## Current reality

The original wave evidence remains listed below for provenance. PR #104 integrated the consolidated Windows source checkpoint into `main` at `d33890fe31836d9a982902dd469bcc3960c4c23c`; PR #105 integrated the reproducible development environment at `1a0469bb5384561d85178316d0cd6e94745b44a0`. Clean-checkout source evidence is green, but no installed-artifact claim attaches to it:

- GitHub billing was the original pre-step Actions blocker and is resolved; current jobs execute normally.
- CI binds clean-checkout dependency installation, Prisma generation and migration deployment, documentation authority audit, TypeScript, ESLint, Vitest, coverage, production dependency audit, migration status and Tauri Rust compilation.
- The CI fallback `SF_MASTER_KEY` is a deterministic valid 64-character hexadecimal test key; run #371 passed the full Quality Gate after this repair.
- Tauri `externalBin` resolution requires a target-suffixed binary even for Linux cargo checking. CI creates only a temporary Linux placeholder; packaged Windows sidecar contents are unchanged.
- `sf-verify` retains complete failure output and CI uploads bounded diagnostic artifacts when Actions logs are truncated.
- `sf-inventory` generates machine-readable clean-checkout inventories without becoming a competing permanent authority. Run #374 retained a seven-day artifact.
- The retained inventory at commit `bf369cd5f091dd0d74bcbdac12f07ba00c8b2238` reports 691 tracked files, 38 Markdown files, 9 READMEs, 31 pages, 114 API routes, 33 commands, 125 components, 2 design-token source files, 142 CSS custom-property tokens, 31 Prisma models, 9 migration files, 97 test files, 35 provider/integration files and 13 sidecar/desktop resource files.
- A 2026-07-18 dirty-tree diagnostic refresh reports 692 files, 36 commands and 14 sidecar/desktop resource files, with the other headline counts unchanged. Because it used `--allow-dirty`, it is drift information rather than retained clean-checkout evidence.
- CI runs `cargo check --release`, so release-only packaged startup code is compiled rather than excluded by `cfg(not(debug_assertions))`.
- Mandatory application-server failures abort setup; timed-out process trees are terminated; the degradable WhatsApp sidecar starts only after authenticated server readiness.
- Packaged startup uses OS-allocated loopback ports and independent per-launch runtime, application and sidecar credentials. Readiness verifies the exact process identity, instance header, app version, port, shop ID, positive registry revision, migration-set digest and required checks.
- A hidden main window navigates to either an authenticated bootstrap URL or a seller-visible blocked-startup document with redacted support diagnostics.
- One supervisor state machine gives post-ready crashes and failed restart attempts a shared three-attempt 2/5/15-second budget, resets after 60 stable seconds, enters persistent-diagnostic crash-loop safe mode on exhaustion, and rejects restart or child registration after shutdown begins.
- Process-bound `ShopContext`, an atomic versioned registry, exact database-file authority, all-shop migration planning, an external journal, verified snapshots, OS-backed installation locking, interrupted-run restoration and a migrated shop template are implemented.
- The coordinator writes `migration-journal/compatibility.json` atomically with per-shop current/migration-required/blocked state, applied and pending counts, inferred-legacy status, snapshot-space requirements and bounded failure detail.
- Domain `ServiceContext` and AI `ToolContext` carry explicit shop authority through production services, provider credentials, automation dispatch, route-local transactions and repositories.
- Adversarial review and commits `b3fcb26`/`7ad237a` added terminal journal safety, creation-time Windows Job Object containment, generation-safe restart teardown, exact legacy schema fingerprinting, physical database-file validation, transaction-bound order ledgers, local shipment reservations/reconciliation receipts, identity-bound refund compensation and strict sandbox containment.
- Local Windows verification on 2026-07-19 passed 60 focused transaction/sandbox tests; `cargo test --all-features --locked` passed 42/42 tests; warning-denied Clippy, formatting, release compilation, the shared migration hash vector, TypeScript and complete ESLint passed.
- Clean-checkout runs `29697219950` and `29697766459` passed the Quality Gate and Tauri release smoke. Coverage passed 94 files and 1,534 tests at 80.87% statements/lines; production audit and migration status were clean.
- Eleven coordinator tests cover fresh installation, positive legacy revision, real OS lock behavior, rollback, interruption restoration, corrupt registry, divergent history with per-shop compatibility detail, deterministic low disk before snapshots, a zero-space no-op rerun, two-shop migration with row preservation, and a one-version-back representative fixture upgraded through the packaged migrations.
- The mechanically enumerated Phase 1B source write-authority, migration-coordinator and clean-checkout sub-gates are met. Phase 1B remains incomplete because installed Windows migration/failure injection and a separately approved representative seller-data copy remain unproven.
- The local HP workstation is CPU-bound on an Intel Celeron N3060 with 8 GB RAM and less than 10 GB free disk: `sf-verify --fast` took 7 minutes 56 seconds. It remains useful for Windows installation and constrained-device behavior, not as the primary compiler.
- A 2026-07-19 Codespaces pilot measured a 2-core/8 GB warm fast gate at 37-48 seconds and a complete shared gate at about 1:59-2:10. A 4-core/16 GB fast gate took 39 seconds and the complete gate about 93 seconds. The 2-core machine remains an optional reproducible fallback; Codex Cloud is now the selected normal primary cloud builder.
- A full rebuild from `.devcontainer/devcontainer.json` installed pinned Bun 1.3.14, Node 22, Rust, frozen dependencies, Prisma, an ignored Linux sidecar placeholder and a disposable sandbox without creating `.env.local`. `sf-version`, `sf-audit`, shell syntax, Rust formatting and the complete shared gate passed in that rebuilt container.
- The pilot corrected Windows-only shop test paths, a host-native `ShopContext` fixture, an Algiers-boundary report fixture and auth-test writes outside the sandbox.
- The packaged-auth blocker found during the pilot was repaired before PR #104 integration: startup now loads the canonical active-shop `AuthSecret` fail-closed. Installed restart evidence remains outstanding.
- On 2026-07-21, the Founder configured a Codex Cloud environment for `rendowblock-jpg/sahelflow_v2` with agent internet access. Its first SahelFlow bootstrap, development launch and shared-gate checkpoint is not yet recorded.
- ChatGPT is now the lead engineering partner, critical implementer and independent reviewer; Codex Cloud is the primary cloud implementation/runtime agent; Codex Desktop is the installed-Windows laboratory; GitHub Actions remains clean-checkout and artifact-production authority.
- The Founder removed local dependency, build and installation caches because the SSD filled and the PC became unusably slow. The intended local path is to download and install an exact prebuilt internal artifact and launch SahelFlow for hands-on evaluation without restoring `node_modules`, `.next`, Rust `target` or routine compiler caches.
- No packaged Windows, failure-injection, migration/recovery, provider, performance, T470 or 4 GB result is claimed yet.

The current program has clean integrated source, a reproducible Linux environment and a configured Codex Cloud environment. No MSI has yet been built, installed or launched under the current internal-candidate procedure, and installation remains a separately confirmed implementation-lab action.

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

The Founder hands-on path must be lightweight:

1. obtain the exact internally approved Windows artifact from retained GitHub Actions output;
2. verify the recorded artifact identity/digest;
3. install it on the authorized low-storage PC without restoring the source development workspace;
4. launch and use the application as a seller would;
5. record visual, runtime, recovery and low-end observations;
6. preserve evidence, then remove obsolete downloaded artifacts when storage requires it.

## Deep-dive findings

- `sf-audit`, `sf-verify` and `sf-inventory` execute from clean Actions checkouts and are retained through visible steps or artifacts.
- Packaged startup uses per-launch loopback endpoints and credentials, exact process/shop readiness, a seller-visible blocked document and a locally tested bounded restart/crash-loop policy. Installed process-kill, shutdown-race, sleep/resume and reboot proof remains missing.
- WhatsApp remains a degradable capability with backoff respawn and demo/offline behavior. Its exact required/degraded policy must be represented in the startup state model rather than inferred from logs.
- The coordinator enumerates the versioned registry, reports compatibility per shop, reserves verified-snapshot space only when work is pending, migrates every registered database and restores all verified snapshots after failure/interruption. Installed and representative real-data evidence remains.
- The direct-write source inventory is closed for the current production mutation graph. New repository, background or remote execution paths must accept explicit context and must not reintroduce global active-shop selection.
- Codex Cloud and Codespaces provide Linux source/development evidence; GitHub Actions provides exact clean-checkout and artifact-production evidence; the Windows lab remains installed-runtime authority. None can silently substitute for another claim layer.
- Packaged startup reloads the canonical active-shop HMAC secret fail-closed; cloud or CI passes still cannot prove installed restart behavior.
- The low-storage PC constraint changes the execution method, not the product evidence standard: local testing should consume a prebuilt candidate instead of rebuilding the app locally.

## Multi-phase plan

### Phase: 0A — Clean-checkout authority and repository truth

- Status: source-level command and inventory evidence complete; refresh after material source changes.
- Evidence: runs #371, #374, #378, `29697219950`, `29697766459` and final PR #105 run `29700649624` plus the retained `phase0-repository-inventory` artifact.

### Phase: 0B — CI startup and shared-command repair

- Status: complete for the integrated source checkpoint.
- Evidence: required Quality Gate and Tauri release smoke passed after integration review.

### Phase: 0C — Cloud workflow bootstrap and installed Windows candidate baseline

- Status: Codex Cloud environment configured; SahelFlow bootstrap/launch evidence and installed candidate not yet executed.
- Cloud work: resume from canonical GitHub state, declare exact environment/ref, install from clean checkout, run appropriate shared gates, launch the development application, inspect runtime/browser behavior and record limitations without making installed-Windows claims.
- Windows work: produce one internal Windows-only candidate and establish runtime/readiness truth through clean install, missing resource, occupied endpoint, child failure and shutdown/restart evidence.

### Phase: 1A — Supervised authenticated local runtime

- Status: source runtime/restart protocol locally and in clean-checkout CI verified; installed evidence incomplete.
- Completed bounded work: mandatory application-server failures abort setup; timeout kills the contained process tree; optional sidecar starts only after readiness; per-launch endpoints and credentials authenticate readiness/bootstrap; readiness binds process and shop authority; blocked startup is seller-visible and writes redacted diagnostics; one state machine bounds crash/restart failures, stable reset, safe mode and shutdown registration.
- Next work: failure-inject child crash, failed restart, shutdown race, sleep/resume and reboot in an installed candidate.
- Evidence: 42 Rust tests, warning-denied Clippy, local release compile and clean-checkout Tauri smoke are green; installed-candidate failure-injection proof remains required before completion.

### Phase: 1B — Explicit shop authority and safe all-shop migration

- Status: source write-authority and migration-coordinator sub-gates met locally and in clean-checkout CI; installed exit evidence not met.
- Completed bounded work: process-bound `ShopContext`; atomic versioned registry; positive imported revisions; process-bound database without registry fallback; production context propagation; packaged migration deployment; per-shop compatibility report; all-shop coordinator; external journal; verified snapshots; pending-work disk reserve; OS lock; corrupt/divergent-registry/history failure; rollback, interruption, rerun, multi-shop and actual packaged current-data tests.
- Next work: perform separately approved installed Windows and representative-data drills. Add persisted shop-incarnation identity before backup restore or future durable inbox/outbox work can conflate a deleted-and-recreated shop slug.

### Phase: 0D — Reference baseline

- Status: not executed.
- Work: run the exact candidate and datasets on ThinkPad T470 and an agreed 4 GB floor-reference environment. The low-storage Founder PC may be used as one observation device only after it is explicitly identified and its machine profile is recorded.

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
| Use 2-core/8 GB Codespaces as an optional reproducible Linux fallback and 4 cores only for bounded heavy work. | The measured 2-core full gate is about two minutes and preserves twice the included wall-clock allowance. | Codespaces pilot measurements. | 2026-07-19 |
| Keep native Tauri release compilation/artifact production in GitHub Actions and installed Windows behavior in the local lab. | A Linux cloud environment cannot prove packaged Windows behavior. | Environment/evidence boundary review. | 2026-07-19 |
| Use ChatGPT as lead engineering partner, critical implementer and independent reviewer. | It provides cross-layer product/architecture reasoning and a separate review pass instead of letting the implementing agent judge itself. | Founder decision. | 2026-07-21 |
| Use Codex Cloud as the normal primary builder and Linux executable environment. | The Founder PC is too slow and storage-constrained for routine heavy development; the configured cloud environment can hold the disposable checkout and runtime. | Founder decision and configured environment. | 2026-07-21 |
| Use Codex Desktop as the installed-Windows laboratory rather than the routine primary compiler. | Windows installation and machine behavior require local access, while ordinary implementation belongs in the cloud. | Founder/MAWS workflow decision. | 2026-07-21 |
| Launch SahelFlow locally from an exact prebuilt internal Windows artifact without restoring full build/dependency caches. | The SSD filled and the PC became slow; hands-on testing needs the installed product, not the full compiler workspace. | Founder constraint and decision. | 2026-07-21 |

## Working notes and open questions

- Select and separately authorize the exact first installed-candidate lab and procedure.
- The Founder low-storage PC is the intended hands-on launch machine, but its exact machine profile and evidence role must be recorded before claims attach to it.
- Define the exact artifact download, digest verification, install, test-data and cleanup procedure.
- Exact T470 and 4 GB reference datasets remain implementation-lab choices.

## Implementation and evidence

- Integrated foundation: PR #100.
- Consolidated source: PR #104 integrated into `main` at `d33890fe31836d9a982902dd469bcc3960c4c23c`.
- Green clean-checkout CI: run #371 (`29603869888`), run #374 (`29604264999`), run #378 (`29605285748`), `29697219950` and `29697766459`.
- Inventory artifact: `phase0-repository-inventory`, artifact `8416217843`, digest `sha256:545f9ebbf1b9857bc7f44561c0f28832c5421bcf452bdd0036492380f3fd376c`.
- Runtime source: Tauri setup rejects mandatory local-server startup failures and does not start the sidecar before server readiness.
- Visual/RTL/accessibility evidence: none yet for the blocked/recovery startup state.
- Packaged/provider/recovery evidence: none yet.
- Known limitation: CI proves clean checkout and release compilation/artifact steps, not an installed Windows candidate.
- Codespaces integration: PR #105 merged into `main` at `1a0469bb5384561d85178316d0cd6e94745b44a0`; original measured checkpoint `74bfc07` remains historical evidence.
- Codespaces evidence: full clean container rebuild, authority audit, fast/full shared gates, Rust formatting and private web-development startup; no installed-Windows claim.
- PR #105 clean-checkout evidence: final-head run `29700649624` passed the Quality Gate in 3 minutes 26 seconds and Tauri release smoke in 46 seconds at `013f61df335c2341d4eacbafab68078e0aa633ab`.
- Codex Cloud: environment configured on 2026-07-21; first exact bootstrap/launch/verification checkpoint pending.
- MAWS workflow transition: branch `agent/maws-codex-cloud-workflow`; documentation review and merge pending.

## Current checkpoint

- What is now true: integrated clean-checkout source has an authenticated per-launch runtime, seller-visible blocked startup, process-bound shop authority, atomic registry, recoverable all-shop migration, contained child trees, bounded generation-safe restarts and transaction-bound order effects; required CI is green. Codex Cloud is configured as the primary cloud builder, and the low-storage PC is reserved for installed candidate launch/testing rather than routine compilation.
- What changed in the plan: ChatGPT leads architecture, critical implementation and review; Codex Cloud performs primary cloud implementation/runtime/browser work; GitHub Actions produces clean-checkout evidence and Windows artifacts; Codex Desktop runs the installed candidate locally. The local test path uses a prebuilt artifact without restoring full caches.
- Current uncertainty: first Codex Cloud SahelFlow bootstrap/launch evidence, the exact authorized Windows lab/procedure, real installed child-process failure injection, representative seller data, persisted shop-incarnation identity and all installed Windows behavior remain unproven.
- Exact next move: merge the MAWS workflow update; run the canonical Codex Cloud resume/bootstrap/launch checkpoint from current `main`; then select/authorize the Windows lab, produce the exact internal artifact in GitHub Actions and install/launch only that artifact on the low-storage PC for the recorded drill.
