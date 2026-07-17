# Wave: Proven Canonical Windows Desktop

> Started: 2026-07-17  
> Current focus: Phase 1A authenticated per-launch runtime supervision, then explicit shop authority  
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
- Risk class and evidence layers: R0 for wave/inventory records; R3 for authenticated runtime and trusted shop context; R4 for migrations, data survivability and installed candidate/release authority.
- Explicit non-goals: no Cloudflare implementation; no hosted storefront; no remote PWA; no provider expansion; no broad page redesign; no deletion of legacy runtime or data paths before compatible migration and recovery evidence exist.

## Current reality

- PR #100 merged the first implementation checkpoint to `main` as `2a6233e1e0e090b7d963f217240b013071a9b90c`.
- CI now binds clean-checkout dependency installation, Prisma generation/deployment/status, documentation authority audit, repository inventory, TypeScript, ESLint, Vitest, coverage, production audit and release-path Tauri compilation.
- The CI fallback master key satisfies the 256-bit hexadecimal encryption contract.
- Tauri smoke uses `cargo check --release`, so the startup supervisor behind `cfg(not(debug_assertions))` is compiled.
- Bounded diagnostic artifacts retain exact Quality Gate and release-Rust failures when Actions logs are truncated.
- `sf-inventory` generated retained Phase 0 evidence: 691 tracked files, 38 Markdown files, 9 READMEs, 31 pages, 114 API routes, 33 commands, 125 components, 142 CSS custom-property tokens, 31 Prisma models, 9 migration files, 97 test files, 35 provider/integration files and 13 sidecar/desktop resource files.
- Mandatory Next.js resource/runtime/spawn/readiness failure is fail-closed. A timed-out server child is killed; the WhatsApp sidecar starts only after mandatory server readiness.
- The main desktop window starts hidden. Successful startup reveals the business shell only after mandatory gates pass.
- Migration or mandatory runtime failure now reveals a seller-visible blocked page instead of the business shell. It provides French/English/Arabic language, an assertive alert region, diagnostic code, safe-retry guidance, technical detail and the persisted JSON report path.
- Follow-up PR #101 changes the report path to `startup-diagnostic-<unix-seconds>.json`, avoiding Windows destination-replacement failure and retaining previous incidents. Run #394 passed all configured checks.
- Fixed ports 3000/3001, default `shops/dev.db`, process-global active-shop routing and incomplete per-launch authentication remain.
- No installed Windows, packaged failure-injection, all-shop migration/recovery, provider, T470 or 4 GB evidence is claimed yet.

## Target startup system

The installed candidate must converge on one deterministic startup state machine:

1. validate bundled resources and candidate manifest;
2. allocate per-launch authenticated local endpoints;
3. start and supervise required processes;
4. validate the atomic shop registry;
5. resolve exactly one explicit shop context;
6. preflight schema compatibility and required migrations across registered shops;
7. enter ready only after every mandatory gate passes;
8. otherwise enter a named blocked/degraded/recovery state with safe retry, diagnostics and no fallback to another shop or partial-ready shell.

## Deep-dive findings

- The current source has enough runtime and shop coupling that filename counts are not call-site completeness proof.
- Fixed endpoint removal, per-launch credentials and readiness must be one supervisor change, not independent environment patches.
- WhatsApp is currently degradable; its offline/crash-loop state must be represented explicitly rather than inferred from logs.
- The migration runner still assumes one default shop. It must not be generalized before explicit registry and `ShopContext` boundaries exist.
- The blocked page is source- and release-compile-proven, but actual WebView2 display, keyboard behavior, Arabic rendering and retry guidance require installed Windows failure injection.
- A backup-copy failure still logs and proceeds. The target all-shop migration coordinator will require a verified snapshot gate and must fail closed before any migration mutates a registered shop.

## Multi-phase plan

### Phase 0A — Clean-checkout authority and repository truth

- Status: complete for the current implementation checkpoint; refresh mechanically after material changes.
- Evidence: runs #371, #374, #378, #392 and #394 plus retained inventory/diagnostic artifacts.

### Phase 0B — CI startup and shared-command repair

- Status: complete for the current branch family.
- Evidence: complete Quality Gate and `cargo check --release` are green.

### Phase 0C — Installed Windows candidate baseline

- Status: not executed; requires the Windows implementation lab.
- Required proof: clean install, no external Node/Bun/Rust dependency, candidate/resource manifest, occupied endpoint, missing resource, migration failure, child failure, shutdown/restart and exact artifact identity.

### Phase 1A — Supervised authenticated local runtime

- Status: active.
- Completed: mandatory server fail-closed behavior; delayed sidecar startup; hidden-until-resolved desktop window; structured seller-visible blocked state; persisted incident diagnostics; release-path compile gate.
- Next: enumerate all fixed-port/readiness/auth call sites; create a supervisor-owned per-launch runtime context; allocate endpoints; generate credentials; pass them to Next.js and the sidecar; authenticate health/readiness; define restart budget, degraded state and support diagnostics; failure-inject every named state.
- Completion signal: the installed candidate cannot expose ready while a required service is absent or unauthenticated, and every blocked/degraded state is observable and recoverable.

### Phase 1B — Explicit shop authority and safe all-shop migration

- Status: implementation not started.
- Next after runtime boundary: define `ShopContext`; design atomic versioned registry; enumerate request/background call sites; remove silent fallback through bounded adapters; implement all-shop preflight, external journal, verified snapshots, interruption/rerun/low-disk/corrupt-registry handling.
- Completion signal: no write without explicit context; missing/corrupt registry never opens another shop; every supported shop receives verified migration and recovery results.

### Phase 0D — Reference baseline

- Status: not executed.
- Required proof: exact candidate and representative datasets on ThinkPad T470 and an agreed 4 GB floor-reference environment.

## Decisions

| Decision | Why | Evidence | Date |
|---|---|---|---|
| Use a valid deterministic 256-bit hexadecimal CI key. | The previous placeholder violated the encryption contract and caused broad test failure. | Retained run diagnostics; run #371. | 2026-07-17 |
| Create the target-suffixed Linux sidecar placeholder inside CI only. | Tauri validation needs the path; committing a fake packaged sidecar would weaken artifact truth. | Build-script failure and subsequent green smoke. | 2026-07-17 |
| Retain bounded diagnostic artifacts. | Connector logs can omit the failure tail. | Runs #370 and #377. | 2026-07-17 |
| Add `sf-inventory`. | Phase 0 requires reproducible inventories without creating a second authority. | Run #374 artifact. | 2026-07-17 |
| Compile Tauri with `cargo check --release`. | Debug checking excluded packaged startup code. | Runs #376 and #378. | 2026-07-17 |
| Fail closed when the mandatory application server is unavailable. | Returning success allowed a blank or partial-ready shell. | Source inspection and green release compile. | 2026-07-17 |
| Keep the desktop window hidden until startup resolves. | A seller must never interpret an unverified shell as ready. | Run #392 release compile. | 2026-07-17 |
| Route migration/runtime failure to a structured recovery page. | Failure must be seller-visible and support-readable without loading another shop or partial workspace. | Run #392. | 2026-07-17 |
| Persist unique timestamped startup reports. | Windows rename cannot reliably replace an existing destination, and incident history is useful for support. | PR #101; run #394. | 2026-07-17 |

## Implementation and evidence

- Merged checkpoint: PR #100, merge commit `2a6233e1e0e090b7d963f217240b013071a9b90c`.
- Follow-up: draft PR #101, branch `agent/startup-diagnostic-windows`.
- Green CI: run #392 (`29606423872`) for the structured recovery implementation; run #394 (`29606827962`) for unique Windows diagnostics.
- Phase 0 inventory artifact: `8416217843`, digest `sha256:545f9ebbf1b9857bc7f44561c0f28832c5421bcf452bdd0036492380f3fd376c`.
- Evidence boundary: clean Linux checkout and release compilation are proven; installed Windows behavior is not.

## Current checkpoint

- What is now true: the normal desktop shell is hidden until mandatory startup succeeds; migration/runtime failure resolves to a structured blocked page with retained diagnostics; configured CI is fully green.
- What remains uncertain: actual installed Windows rendering/failure injection, fixed endpoints, per-launch authentication, sidecar degraded UX and explicit shop authority.
- Exact next move: inventory every fixed endpoint and local auth/readiness caller, then implement the minimum supervisor-owned per-launch runtime context before touching shop routing.
