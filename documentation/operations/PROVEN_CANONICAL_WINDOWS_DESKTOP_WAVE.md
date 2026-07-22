# Wave: Proven Canonical Windows Desktop

> Started: 2026-07-17  
> Current focus: corrected installed baseline and signed `.2`→`.3` updater proof  
> Lead: ChatGPT / Codex Cloud; Codex Desktop for installed-Windows evidence

## Founder intent and outcome

A seller can install one Windows candidate, start it reliably, open only the intended shop, and receive a clear recoverable failure instead of silent fallback or partial startup. The repository can prove this from a clean checkout.

The Founder must also be able to launch and evaluate the exact internal SahelFlow candidate on a low-end, SSD-constrained Windows PC without rebuilding the complete development workspace or retaining heavy dependency/build caches.

The preferred routine is install once, then receive coherent signed in-app updates. The first trusted local installation must include the updater, and the workflow must prove an installed version A updating to version B without losing shops, databases, settings, credentials, migration history or recovery material.

## Governing contract

- Product clause or Founder decision: SahelFlow 1.0 Launch Constitution and Launch Scope requirements for canonical local Windows operation, shop entitlements, data preservation, low-end support and evidence-gated claims.
- Scope class: Required for the Windows desktop, shop isolation, startup/recovery behavior, safe update path and clean-checkout proof; Depth requirement for explicit degraded/error/recovery/update states; Candidate only for exact implementation mechanisms not already fixed by engineering authority.
- Capability atlas section: desktop shell/runtime, shop management, settings/support diagnostics, local data authority, updater and migration/recovery surfaces.
- Journey and required states: install/first launch, startup, open intended shop, switch shop, update check, update available, later, download, install, restart, update failure/retry, offline, invalid signature, missing/corrupt registry, missing shop file, occupied endpoint, missing runtime resource, child-process failure, migration preflight/failure/interruption, maintenance and recovery. Applicable states include loading, pending, ready, degraded, blocked, rejected, error, maintenance and recoverable failure.
- Experience dimensions and page-completion obligations: trustworthy authority/freshness, clear progress and failure language, no silent fallback, keyboard and screen-reader operability, Arabic/French/English and RTL/LTR behavior where seller-visible, 1366×768 and low-end behavior, reduced motion and support-readable diagnostics.
- Engineering invariants / ADRs: canonical Windows desktop remains final local business-mutation authority; explicit trusted shop context; one operational SQLite database per shop; atomic versioned registry; no silent database fallback; supervised authenticated local runtime; append-only all-shop migration with preflight, journal, verified snapshot gate and fail-closed recovery; signed/versioned update metadata and artifacts; no unsigned or unapproved update installation; artifact-level evidence separated from source claims.
- Roadmap phase and dependencies: Phase 0, then the minimum converging Phase 1A runtime and Phase 1B shop/data authority work needed for the updater-enabled installed candidate.
- Risk class and evidence layers: R0 for wave/inventory records; R3 for authenticated runtime, updater trust/signing and trusted shop context; R4 for migrations, data survivability, installed update and release authority. Evidence must distinguish source inspection, Codex Cloud or Codespaces Linux execution, clean-checkout GitHub Actions, produced Windows/update artifacts, installed Windows behavior, installed A→B update, failure injection, migration/recovery drills and reference-hardware measurements.
- Explicit non-goals: no Cloudflare implementation; no hosted storefront; no remote PWA; no provider expansion; no broad page redesign; no deletion of legacy runtime or data paths before compatible migration and recovery evidence exist; no requirement to restore a full local development toolchain merely to launch the candidate on the Founder PC; no dependence on the updater until its signed A→B drill passes.

## Current reality

The original wave evidence remains listed below for provenance. PR #104 integrated the consolidated Windows source checkpoint into `main` at `d33890fe31836d9a982902dd469bcc3960c4c23c`; PR #105 integrated the reproducible development environment at `1a0469bb5384561d85178316d0cd6e94745b44a0`; PR #112 integrated the ChatGPT/Codex Cloud/Codex Desktop workflow at `11e6fa114dc257f8f686c9859d72886a034e1e50`.

- GitHub Actions infrastructure is operational and binds clean-checkout dependency installation, Prisma generation/deployment/status, documentation authority, TypeScript, ESLint, Vitest, coverage, production audit and Tauri release compilation.
- Tauri release checking compiles the packaged startup path behind `cfg(not(debug_assertions))`; mandatory application-server failures abort setup, timed-out process trees are terminated, and the degradable WhatsApp sidecar starts only after authenticated server readiness.
- Packaged startup uses OS-allocated loopback ports and independent per-launch runtime, application and sidecar credentials. Readiness binds exact process identity, instance header, app version, port, shop ID, positive registry revision, migration-set digest, auth mode and required checks.
- A hidden main window navigates to either an authenticated bootstrap URL or a seller-visible blocked-startup document with redacted support diagnostics. One supervisor state machine bounds crash/restart attempts, stable reset, safe mode and shutdown registration.
- Process-bound `ShopContext`, an atomic versioned registry, exact database-file authority, all-shop migration planning, external journal, verified snapshots, OS-backed locking, interrupted restoration and migrated shop templates are implemented.
- Production service, AI, integration, automation, credential, audit/auth, repository and API writes carry explicit shop authority. Adversarial review added terminal journal safety, Windows Job Object containment, generation-safe teardown, legacy schema fingerprinting, physical database identity validation, transaction-bound order ledgers, shipment reconciliation, refund compensation and strict sandbox containment.
- Source and clean-checkout migration tests cover fresh install, legacy import, OS locking, rollback, interruption recovery, corrupt/divergent registry/history, low disk, no-op rerun, two-shop row preservation and a supported prior-version fixture upgraded through packaged migrations.
- PRs #115–#124 activated and hardened the signed internal updater path through exact `main` commit `f977242924e98b4be0f147988b41504f0dbeba1b`. The protected workflow creates source-specific draft releases, verifies the Tauri signature key binding and `latest.json`, and retains exact-source candidate evidence. This is internal-lab authority only.
- GitHub Actions produced signed `1.0.0-internal.1` from `f977242924e98b4be0f147988b41504f0dbeba1b`. The Founder verified source, key identity, MSI/signature hashes and evidence, then installed MSI SHA-256 `e5e62f3e3faacf330565dbffde21db898a154c2dd2ce246599ec091742b8513f` on the authorized Windows lab PC.
- Installed `.1` successfully created registry revision 1, selected shop `default`, deployed all eight packaged migrations and failed closed before workspace load. Its redacted diagnostic was `SF-RUNTIME-STARTUP-BLOCKED`: the mandatory local server did not complete authenticated readiness.
- Installed investigation proved the bundled Bun runtime and files were intact: PowerShell and Bun file APIs could read `server.js`; however, Bun 1.3.14 returned `EPERM` when the same path below `C:\Program Files\SahelFlow\standalone` was used as the entry script.
- The exact complete standalone tree copied to a writable directory, with the same bundled Bun, Prisma engine, installed database, registry, migration digest, auth mode and runtime token, returned HTTP 200 and all app/database/migration/registry/shop/auth checks `ready`. The blocker is therefore entry-script loading below Program Files, not installer integrity, signing, shop data, migration or authentication.
- The `.1` release remains draft and must not be published.
- Draft PR #125 implements corrected manual baseline `1.0.0-internal.2` / MSI `1.0.0.2`: deterministic standalone tree manifest; packaged-tree verification; atomic version/digest-bound LocalAppData staging; cached-tree verification with tamper rejection; explicit contained-process working directory; standalone evidence binding; and exact Windows staged-runtime authenticated readiness smoke.
- PR #125 CI run `29881291176` passed the full quality gate, coverage, production audit, migration status, Rust release check, Windows database suite, production standalone build and the exact staged packaged-runtime readiness check. This does not yet prove installed `.2` behavior.
- Seller data remains in canonical roaming AppData. The new local cache contains only verified immutable application-server resources derived from the installed package.

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

The Founder hands-on install/update path must remain lightweight:

1. obtain the exact internally approved updater-enabled Windows baseline from retained GitHub Actions output;
2. verify artifact identity, digest, source and updater signature;
3. install it over the prior internal candidate without deleting canonical AppData;
4. launch, close and reopen it as a seller would;
5. publish an approved deliberately small signed version B with compatible metadata/migrations;
6. from A, check, defer or install, download, verify, restart and confirm B;
7. prove shop/data/settings/credentials/migration/recovery preservation and visible failure recovery;
8. preserve evidence and remove only obsolete downloaded artifacts when storage requires it;
9. use in-app updates as the normal local loop only after the A→B proof passes.

## Deep-dive findings

- Clean-checkout gates, Windows artifact production and installed-Windows behavior remain separate evidence layers.
- The `.1` installed failure is useful positive safety evidence: the desktop did not open another shop or partial workspace when the mandatory local server was not ready.
- A readable packaged file does not guarantee Bun can use it as an entry script below Program Files on the authorized machine. The corrected design stages and verifies immutable resources in Tauri LocalAppData before launch.
- Writable staging must not become an unsigned code-injection path. The build emits a deterministic tree digest; the desktop verifies both packaged and cached trees and fails closed on mismatch instead of executing altered files.
- Seller databases, registry, migration journal/snapshots and key material must never be copied into the runtime cache.
- WhatsApp remains degradable with bounded respawn; its exact seller-visible offline policy still needs installed behavior evidence.
- The all-shop coordinator remains authoritative on first launch after installation/update; installed migration/failure evidence and separately approved representative data remain outstanding.
- The low-storage constraint changes the execution method, not the product evidence standard: local testing consumes signed prebuilt candidates and updates instead of rebuilding locally.

## Multi-phase plan

### Phase: 0A — Clean-checkout authority and repository truth

- Status: source-level command and inventory evidence complete; refresh after material source changes.
- Evidence: runs #371, #374, #378, `29697219950`, `29697766459`, PR #105 run `29700649624`, and current updater/runtime CI checkpoints.

### Phase: 0B — CI startup and shared-command repair

- Status: complete for the current source checkpoint.
- Evidence: full quality, coverage, audit, migrations and release-path Rust checks are green; Windows CI now also proves staged packaged runtime readiness.

### Phase: 0C — Signed updater pipeline and installed Windows baseline

- Status: signed `.1` built, verified and installed; installed `.1` blocked on Program Files entry loading; corrected `.2` source/CI implementation ready in PR #125.
- Next GitHub Actions work: merge PR #125 and produce signed `.2` from the exact protected-main commit as a draft plus retained evidence.
- Next Windows work: install `.2` over `.1` without deleting AppData; prove first launch, close/reopen, active shop/database/migration preservation and creation/reuse of the verified LocalAppData runtime cache.
- Update drill: after `.2` passes, create deliberately small `.3`, publish only approved `.3` metadata/assets and prove installed `.2`→`.3` update and restart.

### Phase: 1A — Supervised authenticated local runtime

- Status: source runtime/restart protocol and exact Windows staged-runtime readiness are verified; installed `.2` and failure-injection evidence remain incomplete.
- Completed bounded work: fail-closed startup, process-tree containment, per-launch authenticated endpoints, exact readiness, verified writable staging, seller-visible blocked state and bounded crash/restart/safe-mode behavior.
- Next work: installed `.2` launch/relaunch, then child crash, failed restart, shutdown race, sleep/resume and reboot drills.

### Phase: 1B — Explicit shop authority and safe all-shop migration

- Status: source write-authority and migration-coordinator sub-gates are met; installed preservation/failure exit evidence remains.
- Completed bounded work: process-bound shop/database authority, versioned registry, all-shop preflight, compatibility report, external journal, verified snapshots, disk reserve, lock, rollback/interruption restoration and packaged migration tests.
- Next work: prove `.1`→`.2` replacement preservation and `.2`→`.3` updater preservation, then perform separately approved representative-data drills. Persisted shop-incarnation identity remains required for future restore/inbox/outbox work.

### Phase: 0D — Reference baseline

- Status: not executed.
- Work: run the exact accepted candidate and dataset on ThinkPad T470 and an agreed 4 GB floor-reference environment. The current Founder PC proves only the exact recorded artifact/machine behavior.

## Decisions

| Decision | Why | Decided by or evidence | Date |
|---|---|---|---|
| Base the wave on `main` commit `5fe00b5cb85505e5df27499fe46d0fa6050c0788`. | It was the integrated default-branch commit observed at wave start. | GitHub repository inspection. | 2026-07-17 |
| Use a valid deterministic 256-bit hexadecimal fallback key in CI. | The earlier placeholder violated the encryption contract. | Retained diagnostics; run #371. | 2026-07-17 |
| Create target-suffixed Linux sidecar placeholders inside CI only. | Release checking needs the path; a fake committed packaged sidecar would weaken artifact truth. | Build error and green smoke. | 2026-07-17 |
| Compile Tauri with `cargo check --release` in CI. | Packaged startup is excluded from debug checks. | Runs #376 and #378. | 2026-07-17 |
| Fail closed when the mandatory application server is unavailable. | A blank or partial-ready shell would violate shop/data authority. | Source inspection and installed `.1` behavior. | 2026-07-17 / 2026-07-22 |
| Start WhatsApp only after mandatory server readiness. | A blocked workspace must not leave a misleading optional child. | Source and release compile. | 2026-07-17 |
| Use ChatGPT as lead/reviewer, Codex Cloud as primary Linux builder, GitHub Actions as exact artifact authority and Codex Desktop as installed-Windows laboratory. | Each environment has a distinct evidence boundary. | Founder/MAWS decision. | 2026-07-21 |
| Keep the Founder PC as a low-storage installed-product observation device. | Hands-on testing needs the product, not the compiler workspace. | Founder constraint. | 2026-07-21 |
| Activate only the signed internal-lab updater channel and require installed A→B proof before relying on it. | Plugin scaffolding or a signed artifact alone is not installed update evidence. | Founder decision; PR #115. | 2026-07-21 |
| Keep `.1` unpublished and treat `.2` as a corrected manual replacement baseline rather than updater B. | `.1` cannot reach ready; publishing it would expose a broken channel. A trusted A must launch before the updater drill. | Installed `.1` and staged HTTP 200 evidence. | 2026-07-22 |
| Stage a manifest-verified standalone tree in LocalAppData before Bun launch. | Exact installed evidence isolates Bun entry loading below Program Files; writable execution must remain cryptographically bound to packaged bytes. | Installed lab plus PR #125 CI. | 2026-07-22 |

## Working notes and open questions

- Keep `.1` and `.2` releases draft/unpublished until installed `.2` launch/restart/preservation passes.
- Record updater private-key generation provenance, named custody, offline backup, recovery test, rotation and key-loss response outside Git.
- Record the exact Windows machine profile for the installed evidence; do not generalize one-machine observations.
- Exact T470 and 4 GB reference datasets remain implementation-lab choices.
- Persisted shop-incarnation identity remains required before future restore/inbox/outbox semantics can treat a recreated slug safely.

## Implementation and evidence

- Integrated foundation: PR #100; consolidated source: PR #104 at `d33890fe31836d9a982902dd469bcc3960c4c23c`.
- Reproducible environment: PR #105 at `1a0469bb5384561d85178316d0cd6e94745b44a0`; MAWS transition: PR #112 at `11e6fa114dc257f8f686c9859d72886a034e1e50`.
- Updater pipeline: PRs #115–#124 through `f977242924e98b4be0f147988b41504f0dbeba1b`.
- Signed installed `.1`: source `f977242924e98b4be0f147988b41504f0dbeba1b`; MSI SHA-256 `e5e62f3e3faacf330565dbffde21db898a154c2dd2ce246599ec091742b8513f`; key identity `tauri-internal-c7183693a0589b55`; installed startup blocked before workspace load.
- Installed `.1` data authority: registry format/revision `1/1`, active shop `default`, database `dev.db`, eight packaged migrations complete.
- Installed root-cause proof: packaged Program Files entrypoint `EPERM`; exact complete writable copy returned authenticated HTTP 200 with all readiness checks ready.
- Corrected source: draft PR #125, version `.2`; CI run `29881291176` green across quality, coverage, audit, migrations, Rust, Windows database/build and exact staged-runtime readiness.
- Visual/RTL/accessibility evidence: the blocked recovery page was observed on installed `.1`; broader ready/update-state evidence remains.
- Known limitation: `.2` is not yet signed, installed or launched; `.2`→`.3` updater behavior, failure injection, representative data, T470 and 4 GB evidence remain unproven.

## Current checkpoint

- What is now true: the signed internal artifact pipeline works; `.1` was exactly verified and installed; its data/migration path succeeded and its fail-closed runtime correctly blocked an unsafe partial workspace. The remaining `.1` blocker is exactly isolated to Bun entry loading below Program Files. PR #125 implements and CI-proves a manifest-verified LocalAppData staging repair as `.2`.
- What changed in the plan: `.1` is retained only as failed installed evidence and never published. `.2` becomes the corrected manual replacement baseline. `.3`, not `.2`, becomes updater B after `.2` installed launch/restart/preservation passes.
- Current uncertainty: installed `.2` behavior, runtime-cache creation/reuse on the Founder PC, `.2`→`.3` updater preservation/failure recovery, representative seller data and reference-device behavior remain unproven.
- Exact next move: merge green PR #125; build and verify signed `.2` from its exact protected-main commit; install `.2` over `.1` without deleting AppData; prove launch/relaunch and preservation; then build/publish a deliberately small signed `.3` for the installed updater drill.
