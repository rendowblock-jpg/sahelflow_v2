# Wave: Proven Canonical Windows Desktop

> Started: 2026-07-17  
> Current focus: Phase 0 clean-checkout truth, CI startup, repository inventories and Windows candidate readiness  
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

Verified from `main` commit `5fe00b5cb85505e5df27499fe46d0fa6050c0788`:

- `package.json` defines `sf-audit` and `sf-verify`; the earlier missing-package-script defect is no longer present.
- `.github/workflows/ci.yml` defines an Ubuntu quality-gate job and a Tauri Rust smoke job.
- Pull-request workflow run `29592496180` for branch head `4baf3a36c37f4d17593c98cad153d82b600bd139` created both jobs, but both concluded failure with zero steps and no retained job-log blob.
- Because no checkout/setup/command step was created, that run does not implicate `sf-audit`, `sf-verify`, Bun, Prisma, Rust or repository source. The failure boundary is GitHub Actions runner/account/repository startup before workflow execution.
- The current source model still uses a Tauri host around a fixed-loopback Next.js runtime and WhatsApp sidecar, with per-shop SQLite selection routed through process-global metadata/proxy behavior.
- The architecture baseline identifies fixed endpoints, incomplete readiness/supervision, silent shop fallback risk, production `db push`/unsafe migration assumptions and missing all-shop migration coordination.
- No packaged Windows, provider, recovery, performance, T470 or 4 GB result is claimed by this wave until executed and retained.

Session environment limitation observed on 2026-07-17: GitHub repository access is available through the connected GitHub app, but no repository checkout is mounted and outbound `git clone` cannot resolve `github.com`. Therefore local `bun`, Rust, packaging, Windows, migration and hardware commands have not been executed in this checkpoint.

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

- The active `main` baseline equals the expected integrated commit: `5fe00b5cb85505e5df27499fe46d0fa6050c0788`.
- Open PR #83 is a stale stacked documentation draft based on an older authority model; PR #74 is an older non-mergeable documentation/master-plan PR. Neither is a valid implementation base for this wave.
- `scripts/sf-audit.ts` performs a repository-wide active-Markdown relative-link scan, required-authority checks, shared-script drift checks and entrypoint authority checks. Its correctness still requires clean-checkout execution.
- `scripts/sf-verify.ts` runs TypeScript and ESLint in fast mode, and adds Prisma generation plus Vitest in full mode. Its command wiring is coherent by source inspection but remains unexecuted in a clean checkout.
- GitHub Actions run `29592496180` proves the current CI failure occurs before any workflow step. Editing workflow commands would not be evidence-based until repository/account runner startup is restored or GitHub provides a concrete startup annotation.
- The branch must first generate observed inventories and command reports before selecting runtime/shop/migration patches.

## Multi-phase plan

### Phase: 0A — Clean-checkout authority and repository truth

- Purpose: prove the repository can be checked out and its governing commands execute.
- Work and questions: run complete Markdown link/reference validation; run `bun run sf-audit`; generate inventories for files, routes, API endpoints, commands, pages, components, design tokens, Prisma models, migrations, tests and providers; inspect component-local READMEs and sidecars; run `bun run sf-verify --fast`, then relevant full checks.
- Capability/journey/experience impact: establishes traceability and prevents stale local notes from weakening active product/experience authority.
- Evidence or completion signal: retained machine-readable reports from a clean checkout at the exact commit.

### Phase: 0B — CI startup and shared-command repair

- Purpose: make pull-request checks actually start and bind to the same commands used locally.
- Work and questions: inspect repository/account Actions availability, billing/minute/spending restrictions, Actions policy and runner availability; retrieve any run-level startup annotation GitHub exposes; repair repository/account configuration first if blocked; change workflow source only for an observed workflow defect; verify `sf-audit` and `sf-verify` from a second clean checkout; retain logs/results.
- Capability/journey/experience impact: none directly; enables trustworthy implementation evidence.
- Evidence or completion signal: a pull-request run creates and executes checkout/setup/verification steps and completes the intended gates from a clean checkout.

### Phase: 0C — Installed Windows candidate baseline

- Purpose: produce one internal Windows-only candidate and establish runtime/readiness truth.
- Work and questions: build without external Node/Bun/Rust on the test machine; verify resources and manifest; exercise clean install, occupied endpoint, missing resource, child failure and shutdown/restart; capture source/artifact digests and machine/Windows profile.
- Capability/journey/experience impact: startup, blocked/degraded/recovery states and support diagnostics.
- Evidence or completion signal: installed-candidate report with exact artifact identity and observed failure behavior.

### Phase: 1A — Supervised authenticated local runtime

- Purpose: prevent partial-ready startup and ambiguous fixed-endpoint behavior.
- Work and questions: design service supervisor, endpoint allocation, per-launch credentials, readiness protocol, restart budget, crash-loop/safe-mode behavior and seller-visible diagnostics; migrate incrementally behind compatibility boundaries.
- Capability/journey/experience impact: startup, degraded, blocked, retry, support and recovery journeys.
- Evidence or completion signal: failure-injection tests plus installed-candidate proof that ready is impossible while required services are unavailable.

### Phase: 1B — Explicit shop authority and safe all-shop migration

- Purpose: guarantee every operation targets the intended shop and every supported upgrade is recoverable.
- Work and questions: define `ShopContext`; design atomic versioned registry; enumerate all call sites and background scopes; remove silent fallback through bounded adapters; replace production `db push`; implement all-shop preflight, compatibility report, external journal, verified snapshots, interruption/rerun/low-disk/corrupt-registry handling.
- Capability/journey/experience impact: open/switch shop, missing/corrupt shop, maintenance, migration and recovery journeys.
- Evidence or completion signal: no write without explicit context; corrupt/missing registry never opens another shop; interrupted migrations resume or enter clear maintenance/recovery; every supported shop has verified backup and result report.

### Phase: 0D — Reference baseline

- Purpose: capture no-optimization startup, memory and representative operation measurements.
- Work and questions: run exact candidate and datasets on ThinkPad T470 and an agreed 4 GB floor-reference environment when available.
- Capability/journey/experience impact: low-end responsiveness and guidance.
- Evidence or completion signal: retained traces identifying artifact, Windows build, hardware, dataset, cold/warm runs and limitations.

## Decisions

| Decision | Why | Decided by or evidence | Date |
|---|---|---|---|
| Base the wave on `main` commit `5fe00b5cb85505e5df27499fe46d0fa6050c0788`. | It is the actual latest default-branch commit observed at wave start and includes the integrated documentation/tool baseline. | GitHub repository and commit inspection. | 2026-07-17 |
| Use `agent/proven-canonical-windows-desktop`. | Normal outcome branch required by the coding workflow. | Coding Workflow. | 2026-07-17 |
| Treat CI run `29592496180` as a pre-step Actions startup failure, not a repository-command failure. | Both jobs have zero steps and no log blob, so no workflow command executed. | GitHub Actions run/job metadata. | 2026-07-17 |
| Do not edit CI YAML until a concrete workflow defect is observed. | Repository/account runner startup must be repaired before command-level workflow changes can be validated. | Evidence rules and current run metadata. | 2026-07-17 |
| Do not claim local command, package, Windows or hardware results in this checkpoint. | The current session has no executable checkout or Windows runtime. | Observed environment limitation. | 2026-07-17 |

## Working notes and open questions

- Obtain an executable clean checkout with Bun/Rust.
- Inspect repository/account Actions settings for disabled Actions, policy restrictions, billing/minute/spending limits or runner unavailability; capture the exact GitHub startup annotation if visible in the web UI.
- Generate inventories mechanically; do not convert them into a competing permanent repository authority.
- Select exact registry and `ShopContext` interfaces only after current call-site inventory and tests are observed.
- Exact T470 and 4 GB reference datasets remain implementation-lab choices, not product changes.

## Implementation and evidence

- Branches or pull requests: `agent/proven-canonical-windows-desktop`; draft PR #100.
- Tests, demonstrations or measurements: no repository commands executed in this session. GitHub Actions run `29592496180` inspected; both jobs failed before steps, with no job log blob.
- Visual/RTL/accessibility evidence where applicable: none yet.
- Packaged/provider/recovery evidence where applicable: none yet.
- Known limitations: no mounted checkout, no outbound clone, no local Bun/Rust/Windows environment, and no run-level startup annotation exposed by the available GitHub API response.

## Current checkpoint

- What is now true: the wave is active on a normal branch and draft PR at the exact current `main` baseline; shared command source is coherent by inspection; GitHub Actions is proven to fail before workflow steps rather than inside repository commands.
- What changed in the plan: CI repair now begins with repository/account Actions startup availability and policy, not speculative YAML edits. No authority reset was performed.
- Current blocker or uncertainty: this session cannot execute a clean checkout or Windows candidate, and the available API does not expose the human-readable run-level startup annotation.
- Exact next move: restore/verify GitHub Actions availability for the repository/account until run `CI` creates checkout/setup steps; then, from a mounted clean checkout of this branch, run `bun install --frozen-lockfile`, `bun run sf-audit`, generate the required inventories, and run `bun run sf-verify --fast` before selecting implementation patches.