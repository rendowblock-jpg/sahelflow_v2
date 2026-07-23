# Wave: Proven Canonical Windows Desktop

> Started: 2026-07-17  
> Current focus: immutable installed `.4` replacement baseline and signed `.4`→`.5` updater proof  
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

The original wave evidence remains provenance. PR #104 integrated the consolidated Windows source checkpoint into `main` at `d33890fe31836d9a982902dd469bcc3960c4c23c`; PR #105 integrated the reproducible development environment at `1a0469bb5384561d85178316d0cd6e94745b44a0`; PR #112 integrated the ChatGPT/Codex Cloud/Codex Desktop workflow at `11e6fa114dc257f8f686c9859d72886a034e1e50`.

- GitHub Actions binds clean-checkout dependency installation, Prisma generation/deployment/status, documentation authority, TypeScript, ESLint, Vitest, coverage, production audit, Rust formatting, Clippy and Tauri release compilation.
- Tauri packaged startup fails closed for the mandatory server, uses OS-allocated loopback ports and per-launch credentials, binds authenticated readiness to exact process/app/shop/registry/migration/auth state, and starts degradable WhatsApp only after the required server is ready.
- A hidden main window navigates only to an authenticated bootstrap URL or a seller-visible blocked document with redacted diagnostics. The supervisor bounds restart attempts, safe mode and shutdown registration.
- Process-bound `ShopContext`, atomic registry authority, exact shop database identity, all-shop migration planning, verified snapshots, external journal, OS locking and interrupted recovery are implemented and tested.
- PRs #115–#124 activated and hardened the signed internal updater through exact source-specific draft releases, protected signing authority, signature/key binding, `latest.json` verification and retained evidence. This remains internal-lab authority only.
- Signed `1.0.0-internal.1` installed with registry revision 1, shop `default` and all eight migrations correct, but Bun returned `EPERM` when Program Files `standalone/server.js` was the entry script. `.1` remains draft/unpublished.
- Signed `1.0.0-internal.2` installed over `.1` with AppData preserved and created its verified LocalAppData cache, but the GUI launcher did not provide usable standard handles to Bun. `.2` remains draft/unpublished.
- PRs #125–#128 added manifest-bound LocalAppData staging, production dependency repair, valid restricted standard handles and canonical Rust formatting. PRs #129–#131 established immutable `.3`, deterministic descendant containment, collision-safe migration snapshots, Windows release parity and digest-pinned hermetic libsodium preparation.
- Signed `1.0.0-internal.3` from source `274cdb71406ff05cc98b732bf0fafc6547101a40` installed over `.2` with Windows Installer exit `0`, preserved registry/shop/database/caches and created its exact verified final cache. Installed `.3` then failed closed with `SF-RUNTIME-STARTUP-BLOCKED` because the mandatory server failed authenticated readiness. `.3` remains draft/unpublished and is not rebuilt under the same version.
- Issue #135 moved further reproduction away from the Founder workstation. PR #136 fixed the readiness client’s incorrect EOF dependency after a complete Content-Length response, retained bounded non-secret readiness diagnostics, embedded telemetry independence in the packaged bootstrap, added explicit main-window cleanup/termination and made database identity checks occur after Prisma releases the live file.
- PR #136 exact final head `1b6a2c0204be9dad83903d6577b5a2af6d038417` passed CI `29974471798`, Windows Rust release parity `29974471817` and permanent installed-MSI lifecycle `29974471792`. The installed gate proved two authenticated launches, two normal closes, full SahelFlow/Bun/WhatsApp teardown, endpoint removal, distinct instances, exact cache reuse and unchanged registry/database identity.
- PR #136 merged to protected `main` at `9b5fb46f4f8703c468ff19dee2cd0334851ada31`. The next signed replacement must be immutable `1.0.0-internal.4`, installed over existing `.3`; a later deliberately small `.5` is the updater-drill target.
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

The Founder hands-on install/update path remains lightweight:

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

- Clean-checkout gates, produced artifacts and installed-Windows behavior are separate evidence layers.
- The installed `.1`, `.2` and `.3` failures are positive fail-closed evidence: the desktop did not silently open another shop or partial workspace.
- A readable packaged file does not guarantee Bun can use it as an entry script below Program Files; immutable resources therefore execute only after manifest-bound LocalAppData staging.
- Writable staging must not become an unsigned injection path. Both packaged and cached trees are verified and altered bytes fail closed.
- Seller databases, registry, migration journal/snapshots and key material never enter the runtime cache.
- A complete Content-Length HTTP response is complete without socket EOF. Raw readiness clients must parse message framing rather than equating a persistent connection with failure.
- GUI close is part of the installed product contract: the main-window path must stop child trees, remove runtime authority, perform Tauri cleanup and terminate deterministically.
- Live SQLite identity checks must occur after Prisma releases the file handle; an evidence harness must not block the shutdown it is supposed to test.
- A real installed-MSI lifecycle gate is stronger than separate package, launcher and runtime smokes. The permanent workflow is read-only and proves launch, close, teardown, reopen, cache reuse and data authority together.
- The low-storage constraint changes execution method, not evidence quality: local testing consumes signed prebuilt candidates and updates instead of rebuilding locally.
- Normal product work should use two lanes after updater proof: PR CI for rapid implementation, and one immutable signed internal version for each Founder-approved feature slice tested in the installed app.

## Multi-phase plan

### Phase: 0A — Clean-checkout authority and repository truth

- Status: source-level command and inventory evidence complete; refresh after material source changes.

### Phase: 0B — CI startup and shared-command repair

- Status: complete through repaired protected-main source `9b5fb46f4f8703c468ff19dee2cd0334851ada31`.
- Evidence: quality, coverage, audit, migrations, Rust format/release, Clippy, deterministic containment, actual contained Bun HTTP, staged authenticated readiness, hermetic libsodium and full installed-MSI lifecycle are green.

### Phase: 0C — Signed updater pipeline and installed Windows baseline

- Status: `.1`, `.2` and `.3` installed evidence complete; all remain unpublished. `.3` installed successfully but failed authenticated launch on the Founder machine. The repaired source is integrated and pre-proven by the permanent installed-MSI gate.
- Exact next source work: create immutable `.4` version authority from main `9b5fb46f4f8703c468ff19dee2cd0334851ada31` and require CI, Windows release parity and installed-MSI lifecycle before merge.
- Exact next artifact work: after merge, build signed `.4` from the exact protected-main SHA and verify version/source/signing/MSI/signature/manifest/libsodium/`latest.json` binding.
- Exact next Windows work: install `.4` over `.3` without uninstalling or deleting AppData; prove intended workspace, close/reopen, active shop, registry, database, migrations and cache preservation.
- Update drill: after `.4` passes, create one deliberately small `.5` and prove installed `.4`→`.5` in-app update, restart, preservation and failure recovery.

### Phase: 1A — Supervised authenticated local runtime

- Status: source runtime/restart protocol and installed lifecycle are verified in GitHub Actions; signed `.4` on the authorized Windows machine is the remaining baseline gate.
- Next work after baseline: bounded child crash, failed restart, shutdown race, sleep/resume and reboot drills at appropriate feature milestones rather than per commit.

### Phase: 1B — Explicit shop authority and safe all-shop migration

- Status: source write authority and migration-coordinator sub-gates are met; collision-safe snapshot identity is integrated. Installed `.4` preservation and `.4`→`.5` update evidence remain.
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
| Keep `.1`, `.2` and `.3` unpublished. | Each installed safely but did not reach the trusted seller baseline; `.3` specifically installed cleanly and failed authenticated launch. | Installed evidence and issue #135. | 2026-07-23 |
| Stage a manifest-verified standalone tree in LocalAppData before Bun launch. | Program Files entry loading failed; writable execution must remain bound to packaged bytes. | Installed lab plus PR #125. | 2026-07-22 |
| Give contained GUI children explicit restricted standard handles. | The exact cached server worked manually with valid stdio while the GUI-launched child exited before readiness. | Installed `.2` evidence and PR #127 Windows gate. | 2026-07-22 |
| Treat complete Content-Length framing as readiness completion without waiting for socket EOF. | Next/Bun may keep an authenticated HTTP connection alive after sending the full response. | Issue #135 reproduction and PR #136. | 2026-07-23 |
| Make main-window close an explicit supervised shutdown path. | Installed close must stop all child processes, remove endpoint authority and terminate the GUI deterministically. | Installed E2E evidence and PR #136. | 2026-07-23 |
| Require the permanent read-only installed-MSI lifecycle workflow before signed replacement candidates. | Separate package/runtime checks did not prove the combined installed path. | PR #136 and runs `29971863101` / `29974471792`. | 2026-07-23 |
| Use `.4` as the immutable signed replacement and `.5` as the updater-drill target. | Failed signed `.3` cannot be rebuilt or silently treated as a healthy updater baseline. | Immutable release discipline after PR #136. | 2026-07-23 |
| After `.4`→`.5` proof, use PR CI for implementation and signed internal updates only for approved feature slices. | This preserves real installed testing without turning packaging into the development loop. | Founder workflow direction. | 2026-07-23 |

## Working notes and open questions

- Keep `.1`, `.2` and `.3` draft/unpublished. Keep `.4` draft until installed launch/restart/preservation passes.
- Keep installed `.3` in place and closed until signed `.4` is verified and ready. Do not uninstall it or delete Roaming/Local AppData.
- Do not ask the Founder for another iterative diagnostic loop. The next local action is one pre-proven `.4` install-over and launch/close/reopen confirmation.
- Record updater private-key generation provenance, named custody, offline backup, recovery test, rotation and key-loss response outside Git.
- Record the exact Windows machine profile for installed evidence; do not generalize one-machine observations.
- Exact T470 and 4 GB reference datasets remain implementation-lab choices.
- Persisted shop-incarnation identity remains required before future restore/inbox/outbox semantics can treat a recreated slug safely.

## Implementation and evidence

- Integrated foundation: PR #100; consolidated source: PR #104 at `d33890fe31836d9a982902dd469bcc3960c4c23c`.
- Reproducible environment: PR #105 at `1a0469bb5384561d85178316d0cd6e94745b44a0`; MAWS transition: PR #112 at `11e6fa114dc257f8f686c9859d72886a034e1e50`.
- Updater pipeline: PRs #115–#124 through `f977242924e98b4be0f147988b41504f0dbeba1b`.
- Runtime staging and launcher repair: PRs #125–#128 through `abf2603fa9291615300ffe679e32c7861ff4375c`.
- Immutable `.3` authority, deterministic containment and hermetic native preparation: PRs #129–#131 through `274cdb71406ff05cc98b732bf0fafc6547101a40`.
- Signed installed `.1`: source `f977242924e98b4be0f147988b41504f0dbeba1b`; startup blocked before workspace.
- Signed installed `.2`: source `341711e5a3e6f2301197f1cf8c5fcc7da56e8ec4`; exact final cache HTTP 200 manually; GUI contained launch blocked before PR #127.
- Signed installed `.3`: source `274cdb71406ff05cc98b732bf0fafc6547101a40`; signed run `29951527992`; MSI SHA-256 `6a5459d2564bccc905ddeeb51198c389daab476d28aceb617000b18e68fe55d8`; installation/preservation passed and authenticated launch failed closed.
- Installed runtime repair: issue #135; PR #136 merged at `9b5fb46f4f8703c468ff19dee2cd0334851ada31`.
- PR #136 final merge head `1b6a2c0204be9dad83903d6577b5a2af6d038417`: CI `29974471798`, Windows Rust release parity `29974471817` and permanent installed-MSI `29974471792` all green.
- Successful installed lifecycle evidence: two ready launches with distinct instance IDs; two normal closes; process-tree and endpoint cleanup; cache `1.0.0-internal.3-085d9ea424bf9198`; 3,981 files; tree SHA-256 `085d9ea424bf9198771e5f569d389442c5f523496db16b8e2b7e9d7767cfe996`; registry revision 1 / shop `default`; unchanged database SHA-256 `EB84380F07E56A31E85B393308F2D7E705ADB2D7688D3996D727F27E5EA4B4E0`.
- Visual/RTL/accessibility evidence: the blocked recovery page was observed on installed `.1`, `.2` and `.3`; broader ready/update-state evidence remains for signed `.4` and the updater drill.

## Current checkpoint

- What is now true: the repaired installed runtime lifecycle and permanent installed-MSI authority are merged into protected `main` at `9b5fb46f4f8703c468ff19dee2cd0334851ada31`. `.3` remains an unpublished installation-success / launch-failure artifact and is never rebuilt under the same version.
- What changed in the plan: `.4`, not `.3`, is the next signed replacement baseline. After signed `.4` passes on the authorized Windows machine, `.5` is the deliberately small in-app updater target.
- Current uncertainty: signed `.4` artifact/signature/evidence production; installed `.4` workspace and preservation on the Founder machine; `.4`→`.5` updater preservation/failure recovery; representative seller data and reference-device behavior.
- Exact next move: create and merge immutable `.4` version authority from `9b5fb46f4f8703c468ff19dee2cd0334851ada31`, require the full PR and installed lifecycle gates, build the signed draft `.4` from the exact merged main SHA, verify its retained evidence, then perform one install-over `.3` and launch/close/reopen confirmation without deleting AppData.
