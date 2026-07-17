# Wave: Proven Canonical Windows Desktop

> Started: 2026-07-17  
> Current focus: Phase 1A fail-closed desktop startup, structured recovery state and authenticated runtime boundaries  
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

Verified from branch `agent/proven-canonical-windows-desktop`, based on `main` commit `5fe00b5cb85505e5df27499fe46d0fa6050c0788`:

- GitHub billing was the original pre-step Actions blocker and is resolved; current jobs execute normally.
- CI now binds clean-checkout dependency installation, Prisma generation and migration deployment, documentation authority audit, TypeScript, ESLint, Vitest, coverage, production dependency audit, migration status and Tauri Rust compilation.
- The CI fallback `SF_MASTER_KEY` was invalid for the encryption contract. It is now a deterministic 64-character hexadecimal test key; run #371 passed the full Quality Gate after this repair.
- Tauri `externalBin` resolution requires a target-suffixed binary even for Linux cargo checking. CI now creates only a temporary Linux placeholder; packaged Windows sidecar contents are unchanged.
- `sf-verify` retains complete failure output and CI uploads bounded diagnostic artifacts when Actions logs are truncated.
- `sf-inventory` generates machine-readable clean-checkout inventories without becoming a competing permanent authority. Run #374 retained a seven-day artifact.
- The retained inventory at commit `bf369cd5f091dd0d74bcbdac12f07ba00c8b2238` reports 691 tracked files, 38 Markdown files, 9 READMEs, 31 pages, 114 API routes, 33 commands, 125 components, 2 design-token source files, 142 CSS custom-property tokens, 31 Prisma models, 9 migration files, 97 test files, 35 provider/integration files and 13 sidecar/desktop resource files.
- The earlier Rust smoke used debug `cargo check`, which excluded the actual packaged startup code behind `cfg(not(debug_assertions))`. CI now runs `cargo check --release` and retains the release compile log on failure.
- Release-path compilation exposed a latent `tauri-plugin-shell` API misuse in the existing standalone-server command construction. The program and server argument are now passed through `.command(runtime).arg(server_path)`.
- The first Phase 1A runtime patch is implemented: missing standalone resources, missing runtime, server spawn failure, supervisor-state failure and readiness timeout now abort Tauri setup; a timed-out server child is killed; the WhatsApp sidecar starts only after the mandatory application server is proven ready.
- Run #378 passed the full Quality Gate and `cargo check --release` for the runtime patch.
- No packaged Windows, failure-injection, migration/recovery, provider, performance, T470 or 4 GB result is claimed yet.

Session environment limitation observed on 2026-07-17: GitHub repository access and Actions execution are available, but this chat environment has no mounted checkout, cannot resolve `github.com` for `git clone`, and has no Windows runtime. Clean-checkout Linux evidence is therefore provided by retained Actions runs; installed Windows evidence still requires the implementation lab.

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
- The current Tauri host still uses fixed ports 3000/3001, a default `shops/dev.db` migration target and process-global child environment.
- The mandatory Next.js runtime is now fail-closed at source level, but the failure is still primarily diagnostic/log-facing; the dedicated seller-visible blocked/recovery shell remains missing.
- WhatsApp remains a degradable capability with backoff respawn and demo/offline behavior. Its exact required/degraded policy must be represented in the startup state model rather than inferred from logs.
- The current database path and migration runner still assume one default shop. This must not be expanded by ad hoc path changes; Phase 1B requires explicit registry/context and all-shop migration coordination.
- Fixed endpoint removal, per-launch credentials and readiness must converge inside one supervisor boundary.

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

- Status: started.
- Completed bounded work: mandatory application-server resource/runtime/spawn/readiness failures now abort setup; timeout kills the server child; optional sidecar startup occurs only after application-server readiness; release-only code is compiled in CI.
- Next work: introduce a structured startup state and seller-visible blocked/recovery window; select per-launch endpoints; generate per-launch credentials; define readiness protocol, restart budget, crash-loop/safe-mode behavior and support-readable diagnostics; then failure-inject each named state.
- Evidence: release compile is green; installed-candidate failure-injection proof remains required before completion.

### Phase: 1B — Explicit shop authority and safe all-shop migration

- Status: call-site inventory next; implementation not started.
- Work: define `ShopContext`; design atomic versioned registry; enumerate all call sites and background scopes; remove silent fallback through bounded adapters; replace production `db push`; implement all-shop preflight, compatibility report, external journal, verified snapshots, interruption/rerun/low-disk/corrupt-registry handling.

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

- What is now true: CI is fully green and binds clean-checkout authority, inventory, JS/Prisma verification and release-only Rust compilation; mandatory local-server failure no longer returns success at source level.
- What changed in the plan: Phase 0A/0B source evidence is complete enough to proceed, and Phase 1A is active.
- Current uncertainty: seller-visible blocked/recovery presentation, fixed endpoints, per-launch authentication and installed Windows behavior remain unproven.
- Exact next move: enumerate startup/readiness call sites and implement one structured blocked/recovery startup state that cannot expose the main shell as ready, while designing endpoint allocation and per-launch authentication inside the same supervisor boundary.
