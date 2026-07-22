# Wave: Proven Canonical Windows Desktop

> Started: 2026-07-17  
> Current focus: immutable installed `.3` baseline and signed `.3`→`.4` updater proof  
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

The original wave evidence remains listed for provenance. PR #104 integrated the consolidated Windows source checkpoint into `main` at `d33890fe31836d9a982902dd469bcc3960c4c23c`; PR #105 integrated the reproducible development environment at `1a0469bb5384561d85178316d0cd6e94745b44a0`; PR #112 integrated the ChatGPT/Codex Cloud/Codex Desktop workflow at `11e6fa114dc257f8f686c9859d72886a034e1e50`.

- GitHub Actions binds clean-checkout dependency installation, Prisma generation/deployment/status, documentation authority, TypeScript, ESLint, Vitest, coverage, production audit, Rust formatting and Tauri release compilation.
- Tauri packaged startup fails closed for the mandatory server, uses OS-allocated loopback ports and per-launch credentials, binds authenticated readiness to exact process/app/shop/registry/migration/auth state, and starts degradable WhatsApp only after the required server is ready.
- A hidden main window navigates only to an authenticated bootstrap URL or a seller-visible blocked document with redacted diagnostics. The supervisor bounds restart attempts, safe mode and shutdown registration.
- Process-bound `ShopContext`, atomic registry authority, exact shop database identity, all-shop migration planning, verified snapshots, external journal, OS locking and interrupted recovery are implemented and tested.
- PRs #115–#124 activated and hardened the signed internal updater through exact source-specific draft releases, protected signing authority, signature/key binding, `latest.json` verification and retained evidence. This remains internal-lab authority only.
- Signed `1.0.0-internal.1` from `f977242924e98b4be0f147988b41504f0dbeba1b` was verified and installed. Registry revision 1, shop `default` and all eight migrations were correct, but Bun returned `EPERM` when Program Files `standalone/server.js` was the entry script. `.1` remains draft and unpublished.
- PR #125 introduced a deterministic standalone manifest and atomic version/digest-bound LocalAppData runtime cache. Signed `1.0.0-internal.2` from `341711e5a3e6f2301197f1cf8c5fcc7da56e8ec4` was verified and installed over `.1` with AppData preserved.
- Installed `.2` created and verified cache `1.0.0-internal.2-4ed75a71e6d72c06` with 3,981 files, but startup still blocked because the custom Windows GUI process launcher did not supply valid standard handles to Bun.
- The exact final `.2` cache launched manually with the installed Bun, Prisma engine, shop database, registry revision, migration digest and runtime authentication returned HTTP 200 with all app/database/migration/registry/shop/auth checks ready. This proves the package data, staged tree and runtime itself are healthy.
- PR #127 supplied explicit restricted `NUL` stdin/stdout/stderr handles while retaining suspended process creation, pre-resume Job Object assignment and kill-on-close tree containment. Windows CI proved HTTP through the actual Rust `ContainedChild` path and complete staged authenticated readiness. PR #128 added release-equivalent Rust formatting to normal CI.
- PR #129 established immutable candidate `1.0.0-internal.3` / MSI `1.0.0.3` rather than rebuilding `.2` under the same version.
- PR #130 replaced the remaining shell-dependent descendant observation with a deterministic Rust helper child/grandchild, added a permanent Windows Rust release-parity workflow, required five consecutive process-tree passes and fixed a real migration-snapshot collision by adding a secure per-run identity to filenames. It merged to `main` at `a79d4fc22a4b3d5e4b27604dac8e6be5d0aff957`.
- The signed `.3` workflow from that exact source passed product authority, TypeScript, lint, tests, migrations, coverage and dependency audit, then stopped before signing or MSI creation because `libsodium-sys-stable v1.24.0` attempted a hidden network download and received `ConnectionRefused`. No `.3` artifact or draft release was produced.
- PR #131 made Windows libsodium preparation hermetic. Before every Windows Cargo invocation, the pipeline downloads immutable libsodium `1.0.22` MSVC bytes over HTTPS, pins SHA-256 `3e03a726fac4bc09cb61d8f29d658ef7a5eca0811de59082130414f7ca2e4279`, preserves the crate-bundled source/signature and official minisign public-key verification path, requires the exact x64 v143 debug/release static libraries, exposes the local distribution through `SODIUM_DIST_DIR` and retains a provenance manifest with the signed candidate.
- PR #131 final head `6fbc3942db5a07a10dd0e2c129f015004337ad6a` passed an isolated Windows Cargo proof with no dependency build-script network fallback, normal CI and Windows release parity; it merged to protected `main` at `274cdb71406ff05cc98b732bf0fafc6547101a40`.
- PR #132 is a documentation-only continuity checkpoint merged at `e4169a12745dfa1e6daf28ba1dbb579f99e876cd`. It changed the `main` tip at that checkpoint but did not supersede approved executable source `274cdb71406ff05cc98b732bf0fafc6547101a40` for the `.3` artifact.
- No signed `.3` artifact exists at this checkpoint. Installed `.2` remains closed; do not uninstall it or delete either AppData directory.
- Seller data remains in canonical roaming AppData. LocalAppData contains only verified immutable application-server cache content derived from the installed package.

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
- The installed `.1` and `.2` failures are positive fail-closed evidence: the desktop did not open another shop or partial workspace.
- A readable packaged file does not guarantee Bun can use it as an entry script below Program Files; immutable resources therefore execute only after manifest-bound LocalAppData staging.
- Writable staging must not become an unsigned injection path. Both packaged and cached trees are verified and altered bytes fail closed.
- Seller databases, registry, migration journal/snapshots and key material must never enter the runtime cache.
- A real bundled-Bun HTTP probe through the production Rust launcher is more representative than a shell timing test. Synthetic process-tree tests must be deterministic and cannot substitute for the real launcher gate.
- Build dependencies that download artifacts during Cargo compilation create release-only failure and provenance gaps. Windows native dependencies must be prepared and verified before compilation, with immutable digest/signature evidence and the same path in PR CI and release.
- The low-storage constraint changes execution method, not evidence quality: local testing consumes signed prebuilt candidates and updates instead of rebuilding locally.
- Normal product work should use two lanes after updater proof: PR CI for rapid implementation, and one immutable signed internal version for each Founder-approved feature slice tested in the installed app.

## Multi-phase plan

### Phase: 0A — Clean-checkout authority and repository truth

- Status: source-level command and inventory evidence complete; refresh after material source changes.

### Phase: 0B — CI startup and shared-command repair

- Status: complete for approved executable source `274cdb71406ff05cc98b732bf0fafc6547101a40`; later documentation-only continuity commits do not replace that artifact source.
- Evidence: full quality, coverage, audit, migrations, Rust format/release, deterministic containment tree, actual contained Bun HTTP, staged authenticated readiness and hermetic libsodium preparation are green before signed release dispatch.

### Phase: 0C — Signed updater pipeline and installed Windows baseline

- Status: `.1` and `.2` installed evidence complete; both blocked safely for distinct fixed causes. `.3` executable source is ready and reachable from protected `main`, but no `.3` artifact exists yet.
- Exact next GitHub Actions work: manually dispatch **Build Signed Internal Windows Update** from branch `main` with `source_ref` `274cdb71406ff05cc98b732bf0fafc6547101a40` and the release notes recorded in Working Memory.
- Exact next artifact work: after a green run, verify `.3` source/version/signing identity, MSI and signature hashes, standalone manifest, libsodium provenance and `latest.json` source-tag binding.
- Exact next Windows work: install `.3` over `.2` without deleting AppData; prove first launch, close/reopen, active shop/database/migration preservation and verified LocalAppData cache creation/reuse.
- Update drill: after `.3` passes, create one deliberately small `.4`, publish only approved `.4` metadata/assets and prove installed `.3`→`.4` update and restart.

### Phase: 1A — Supervised authenticated local runtime

- Status: source runtime/restart protocol, actual contained-Bun HTTP and exact staged readiness are verified; installed `.3` remains the final baseline gate.
- Next work after baseline: bounded child crash, failed restart, shutdown race, sleep/resume and reboot drills at appropriate feature milestones rather than per commit.

### Phase: 1B — Explicit shop authority and safe all-shop migration

- Status: source write authority and migration-coordinator sub-gates are met; collision-safe snapshot identity is integrated. Installed `.3` preservation and `.3`→`.4` update evidence remain.
- Persisted shop-incarnation identity remains required for future restore/inbox/outbox work.

### Phase: 0D — Reference baseline

- Status: not executed.
- Work: run the accepted candidate and agreed dataset on ThinkPad T470 and an agreed 4 GB floor-reference environment. Current evidence applies only to the exact recorded artifact/machine.

## Decisions

| Decision | Why | Decided by or evidence | Date |
|---|---|---|---|
| Use ChatGPT as lead/reviewer, Codex Cloud as primary builder, GitHub Actions as exact artifact authority and Codex Desktop as installed-Windows laboratory. | Each environment has a distinct evidence boundary. | Founder/MAWS decision. | 2026-07-21 |
| Keep the Founder PC as a low-storage installed-product observation device. | Hands-on testing needs the product, not compiler caches. | Founder constraint. | 2026-07-21 |
| Activate only the signed internal-lab updater and require installed A→B proof before relying on it. | Signed source or artifacts alone are not installed-update evidence. | Founder decision; PR #115. | 2026-07-21 |
| Keep `.1` and `.2` unpublished. | Both fail safely but do not reach the workspace. | Installed evidence. | 2026-07-22 |
| Stage a manifest-verified standalone tree in LocalAppData before Bun launch. | Program Files entry loading failed; writable execution must remain bound to packaged bytes. | Installed lab plus PR #125. | 2026-07-22 |
| Give contained GUI children explicit restricted standard handles. | The exact cached server worked manually with valid stdio while the GUI-launched child exited before readiness. | Installed `.2` evidence and PR #127 Windows gate. | 2026-07-22 |
| Use `.3` as a new immutable baseline rather than rebuilding `.2`. | Distinct binaries require monotonically increasing versions and unambiguous evidence/update ordering. | Founder best-practice direction; PR #129. | 2026-07-22 |
| Require deterministic Rust helper descendants and full Windows release parity before signed workflow dispatch. | Release must not discover a broader Rust boundary than normal PR validation. | Failed signed run plus PR #130. | 2026-07-22 |
| Add a secure per-run identity to migration snapshot filenames. | Consecutive upgrades within one second must not collide with retained snapshots. | Windows release-parity evidence; PR #130. | 2026-07-22 |
| Prepare and verify libsodium before Cargo instead of allowing a dependency build script to download it. | Hidden build-time network access caused release-only failure and weak provenance. | Failed signed run plus PR #131. | 2026-07-22 |
| After `.3`→`.4` proof, use PR CI for implementation and signed internal updates only for approved feature slices. | This preserves real installed testing without turning packaging into the development loop. | Founder workflow direction. | 2026-07-22 |

## Working notes and open questions

- Keep `.1` and `.2` draft/unpublished. Keep `.3` draft until installed launch/restart/preservation passes.
- Keep installed `.2` closed until `.3` is verified and ready to install. Do not uninstall it or delete Roaming/Local AppData.
- Record updater private-key generation provenance, named custody, offline backup, recovery test, rotation and key-loss response outside Git.
- Record the exact Windows machine profile for installed evidence; do not generalize one-machine observations.
- Exact T470 and 4 GB reference datasets remain implementation-lab choices.
- Persisted shop-incarnation identity remains required before future restore/inbox/outbox semantics can treat a recreated slug safely.

## Implementation and evidence

- Integrated foundation: PR #100; consolidated source: PR #104 at `d33890fe31836d9a982902dd469bcc3960c4c23c`.
- Reproducible environment: PR #105 at `1a0469bb5384561d85178316d0cd6e94745b44a0`; MAWS transition: PR #112 at `11e6fa114dc257f8f686c9859d72886a034e1e50`.
- Updater pipeline: PRs #115–#124 through `f977242924e98b4be0f147988b41504f0dbeba1b`.
- Runtime staging and launcher repair: PRs #125–#128 through `abf2603fa9291615300ffe679e32c7861ff4375c`.
- Immutable `.3` version authority: PR #129 at `e3ae19334bb8066039340820a3b90e745f8bee9f`.
- Deterministic containment, Windows release parity and collision-safe snapshots: PR #130 at `a79d4fc22a4b3d5e4b27604dac8e6be5d0aff957`.
- Hermetic digest-pinned Windows libsodium preparation: PR #131 at `274cdb71406ff05cc98b732bf0fafc6547101a40`.
- Documentation-only resume checkpoint: PR #132 at `e4169a12745dfa1e6daf28ba1dbb579f99e876cd`.
- Signed installed `.1`: source `f977242924e98b4be0f147988b41504f0dbeba1b`; MSI SHA-256 `e5e62f3e3faacf330565dbffde21db898a154c2dd2ce246599ec091742b8513f`; startup blocked before workspace.
- Signed installed `.2`: source `341711e5a3e6f2301197f1cf8c5fcc7da56e8ec4`; exact final cache HTTP 200 manually; GUI contained launch blocked before PR #127.
- PR #131 exact final head `6fbc3942db5a07a10dd0e2c129f015004337ad6a`: isolated local-libsodium Cargo probe green; normal CI run `29950419410` green; Windows Rust release-parity run `29950419462` green.
- Visual/RTL/accessibility evidence: the blocked recovery page was observed on installed `.1` and `.2`; broader ready/update-state evidence remains.

## Current checkpoint

- What is now true: the signed internal pipeline source includes verified staging, valid contained Bun stdio, deterministic Job Object tree validation, collision-safe snapshots and digest-pinned local libsodium preparation. Approved executable source for the `.3` artifact is `274cdb71406ff05cc98b732bf0fafc6547101a40`. PR #132 later moved `main` to `e4169a12745dfa1e6daf28ba1dbb579f99e876cd` with documentation only; later documentation-only merges likewise do not supersede the approved artifact source. No `.3` artifact has been produced yet.
- What changed in the plan: release-only native dependency downloads are prohibited; Windows native build inputs are prepared and verified before Cargo, and the same boundary is enforced by normal CI, Windows release parity and signed release.
- Current uncertainty: whether the next signed `.3` workflow completes artifact/signature/evidence production; installed `.3` launch/relaunch; `.3`→`.4` updater preservation/failure recovery; representative seller data and reference-device behavior.
- Exact next move: manually dispatch **Build Signed Internal Windows Update** from exact source `274cdb71406ff05cc98b732bf0fafc6547101a40`; verify the retained signed `.3` candidate; install it over `.2` without deleting AppData; prove launch/relaunch and preservation; then build/publish a deliberately small signed `.4` for the installed updater drill.
