# SahelFlow working memory

> **Last updated:** 2026-07-23

This is the compact entry point for current work. Update it at meaningful checkpoints and link deeper material rather than turning it into a transcript.

## Founder direction

- Use a lightweight multi-agent system with GitHub-backed shared memory.
- Work through deep-dive waves and multi-phase plans without task-by-task bureaucracy.
- Preserve the complete Founder-approved product contract.
- Preserve the durable Maze Map richness about capabilities, journeys, UI/UX, frontend behavior, Arabic/RTL and accessibility.
- Ground product and architecture work in actual source and evidence.
- Maintain one non-conflicting authority flow before implementation begins.
- Preserve GLM's one-ref cross-session continuity without maintaining a second product, roadmap or tool source.
- Use ChatGPT as the lead product/experience/architecture/engineering partner, active critical implementer, independent reviewer and continuity controller.
- Use Codex Cloud as the normal primary builder and executable Linux environment for implementation, development-app launch, browser inspection, tests, builds and iterative fixes.
- Use Codex Desktop as the installed-Windows laboratory and local-machine executor rather than the routine primary compiler.
- Keep GitHub Actions as clean-checkout validation and exact artifact production authority.
- The Founder PC is low-end and SSD-constrained. Routine work must not require it to retain the full development checkout, dependency caches, `.next`, Rust `target` or repeated build/install caches.
- The preferred hands-on test path is: cloud implementation and validation → GitHub Actions internal Windows artifact → download/install only the exact artifact on the Founder PC → launch SahelFlow locally and record observed behavior.
- The Founder removed heavy caches, build output and development installation because the disk became full and the machine became slow. Do not recreate them unless a bounded Windows-only investigation explicitly requires it.
- Prefer the first routine local installation to contain a proven signed updater. After an installed A→B update drill succeeds, normal testing should use in-app updates rather than source pulls, local builds or repeated manual MSI installation.

## Canonical documentation state

The documentation reset, experience recovery, semantic consistency audit and MAWS cloud-workflow transition are integrated into `main`:

- PR #95 — current-to-target program: `dee78e9c6085b367fb7a533b50624f4389a4cb8d`.
- PR #96 — Maze Map experience authority: `2e5594b9af5bf1cb765f7b84dfbce4b393ba21c5`.
- PR #97 — documentation authority/consistency audit: `7a138695d4075998165cee362436f5201febe4ea`.
- PR #98 — post-audit checkpoint: `7a5e21d94f577db3946ac347fad49533b8625687`.
- Integrated baseline used to start the first implementation wave: `5fe00b5cb85505e5df27499fe46d0fa6050c0788`.
- PR #112 — MAWS Codex Cloud workflow and low-storage Windows launch path: `11e6fa114dc257f8f686c9859d72886a034e1e50`.
- PR #113 — post-merge Working Memory and active-wave checkpoint: `87af8227f4c361b2d99786bed3289a87f17a12f2`.
- PRs #115–#124 — signed internal updater activation and Windows release hardening through `f977242924e98b4be0f147988b41504f0dbeba1b`.
- PRs #125–#128 — verified LocalAppData runtime staging, production dependency repair, contained-child standard handles and release-format enforcement through `abf2603fa9291615300ffe679e32c7861ff4375c`.
- PR #129 — immutable `1.0.0-internal.3` version authority and initial release-parity baseline: `e3ae19334bb8066039340820a3b90e745f8bee9f`.
- PR #130 — deterministic Rust descendant containment, collision-safe migration snapshots and permanent Windows Rust release parity: `a79d4fc22a4b3d5e4b27604dac8e6be5d0aff957`.
- PR #131 — digest-pinned hermetic Windows libsodium preparation enforced across CI, release parity and signed release: `274cdb71406ff05cc98b732bf0fafc6547101a40`.
- PR #136 — installed executable readiness, explicit close/teardown, bounded diagnostics and a permanent read-only installed-MSI lifecycle gate: `9b5fb46f4f8703c468ff19dee2cd0334851ada31`.

PRs #95–#98, #112 and #113 are documentation/continuity changes. PRs #115–#131 and #136 include executable, version, workflow or release-source changes and define the current implementation baseline.

### Canonical read order

1. [`../product/README.md`](../product/README.md)
2. [`../experience/README.md`](../experience/README.md)
3. [`../architecture/README.md`](../architecture/README.md)
4. [`../architecture/CURRENT_TO_TARGET_ANALYSIS.md`](../architecture/CURRENT_TO_TARGET_ANALYSIS.md)
5. [`../architecture/IMPLEMENTATION_ROADMAP.md`](../architecture/IMPLEMENTATION_ROADMAP.md)
6. [`../architecture/CODING_WORKFLOW.md`](../architecture/CODING_WORKFLOW.md)

## Confirmed authority model

1. A newer numbered Founder decision governs only the choice it explicitly changes.
2. Product package controls promises, Stable scope, entitlements, exclusions and public truth.
3. Experience package controls required capability depth, journeys/states and frontend/UI/UX quality for included scope.
4. Engineering Specification and accepted ADRs control target system boundaries and invariants.
5. Current-to-Target Analysis controls the source-grounded implementation model.
6. Roadmap, Workflow and Provider Registry control sequence, review/evidence and integration claims.
7. Working Memory and the active wave control current progress only.

A lower layer cannot silently weaken a higher layer. Apparent conflicts are reconciled in the owning documents before coding continues.

## Scope classes

- **Required** — explicit Founder/Launch Scope commitment.
- **Conditional** — named capability public only after certification.
- **Depth requirement** — behavior/state/UX needed to make required scope complete.
- **Candidate** — useful recovered or planned item needing Founder classification before commitment.
- **Excluded** — prohibited for SahelFlow 1.0.

Ambiguous scope defaults to Candidate.

## Active roles and session continuity

- **Founder** — direction, priority, value judgment, sensitive authorization and release approval.
- **ChatGPT** — lead engineering partner, critical implementer, independent reviewer and durable-memory controller.
- **Codex Cloud** — primary cloud builder and Linux source/development/browser executor.
- **Codex Desktop** — installed-Windows laboratory on the authorized local machine.
- **GitHub Actions** — clean-checkout validation and exact artifact production.
- **GLM** — external research and adversarial discovery specialist.

The exact resume prompts for every ChatGPT and Codex Cloud session are in [`AGENT_PROMPTS.md`](AGENT_PROMPTS.md). Both interfaces resume from `AGENTS.md`, this Working Memory, the active wave, the governing authorities and the exact branch/PR rather than depending on chat history.

## GLM continuity state

The old `agent-handoff` orphan ref remains useful, but its current role is narrow:

- compact GLM resume checkpoint;
- thin bootstrap into current `main`;
- no product, experience, engineering, roadmap, source or tool authority;
- no application work directly on the orphan ref.

The current protocol is [`GLM_CONTINUITY_PROTOCOL.md`](GLM_CONTINUITY_PROTOCOL.md). Shared commands and their source live on `main`:

```bash
bun run sf-audit
bun run sf-inventory
bun run sf-verify
bun run sf-verify --fast
bun run glm:bootstrap
```

Historical Session-40 handoff/tool content remains in orphan-branch Git history only. GLM reads current `AGENTS.md`, Working Memory, the active wave and governing authorities at every resume.

## Active wave

[**Proven Canonical Windows Desktop**](PROVEN_CANONICAL_WINDOWS_DESKTOP_WAVE.md) is active. PR #136 merged the repaired installed executable lifecycle into protected `main` at `9b5fb46f4f8703c468ff19dee2cd0334851ada31`. No Linux/cloud result substitutes for installed-Windows evidence.

Required outcome:

> A seller can install one Windows candidate, start it reliably, open only the intended shop, receive a clear recoverable failure instead of silent fallback or partial startup, and move to a newer approved version without rebuilding locally or losing shop data. The repository can prove this from a clean checkout and an installed A→B drill.

Current checkpoint:

- Signed `1.0.0-internal.3` was produced from approved executable source `274cdb71406ff05cc98b732bf0fafc6547101a40` by signed run `29951527992`. The MSI installed over `.2` with Windows Installer exit `0`, preserved registry revision `1`, active shop `default`, database and existing caches, and created the exact final `.3` runtime cache.
- Installed `.3` then failed closed before the workspace with `SF-RUNTIME-STARTUP-BLOCKED`: the mandatory local server failed its authenticated readiness attempt. `.3` is permanently classified **installation-success / installed-launch-failure**, remains draft/unpublished, and must not be rebuilt or reused under the same version.
- Issue #135 reproduced the failure away from the Founder workstation. PR #136 repaired the raw HTTP readiness client so a complete Content-Length response does not require socket EOF, added bounded non-secret route/transport diagnostics, made the packaged runtime independent of inherited telemetry environment, added an explicit main-window shutdown path and moved SQLite identity hashing after Prisma releases the live handle.
- PR #136 exact final head `1b6a2c0204be9dad83903d6577b5a2af6d038417` passed CI run `29974471798`, Windows Rust release parity run `29974471817` and permanent read-only installed-MSI run `29974471792`. The installed gate proved two authenticated launches, two normal closes, complete SahelFlow/Bun/WhatsApp teardown, endpoint removal, distinct runtime instances, exact cache reuse and unchanged registry/database identity.
- The repaired source merged to protected `main` at `9b5fb46f4f8703c468ff19dee2cd0334851ada31`. The next immutable signed replacement is `1.0.0-internal.4` / MSI `1.0.0.4`, installed over the existing `.3` without deleting AppData.
- The next Founder involvement is one `.4` install-over, one launch/close/reopen and confirmation of the intended workspace and preserved shop. No further manual diagnostic loop is authorized before that pre-proven candidate exists.
- After installed `.4` passes, create a deliberately small compatible `1.0.0-internal.5` and prove the in-app `.4`→`.5` updater, restart, preservation and failure-recovery drill. Do not silently treat failed `.3` as the updater baseline.
- Seller databases, registry, migration records and master key remain in canonical roaming AppData; only immutable packaged application-server resources are staged in the local runtime cache.

Exact next executable action:

1. Create an immutable `1.0.0-internal.4` version-authority PR from protected main `9b5fb46f4f8703c468ff19dee2cd0334851ada31`; update every bound product/MSI/updater authority consistently and preserve the permanent installed-MSI gate.
2. Require normal CI, Windows Rust release parity and installed-MSI launch/close/reopen proof on the exact `.4` PR head before merge.
3. After merge, manually dispatch **Build Signed Internal Windows Update** from branch `main` with the exact merged `.4` source SHA. Do not change signing secrets or the `internal-updater` environment.
4. Verify source, version, updater signing identity, MSI/signature hashes, standalone manifest, libsodium provenance and `latest.json` binding before installation. Keep the release draft/unpublished.
5. Install `.4` over installed `.3` without uninstalling `.3` first and without deleting Roaming/Local AppData. Prove launch, close/reopen, intended shop `default`, registry, database, migrations and runtime-cache preservation.
6. Keep `.1`, `.2` and `.3` unpublished. Keep `.4` draft until installed launch/restart/preservation succeeds and the Founder approves the next updater-drill step.
7. After `.4` passes, create and sign one deliberately small `.5`, publish only the approved internal `.5` channel metadata/artifacts and prove installed `.4`→`.5` in-app update, restart, preservation and failure recovery.
8. After the `.4`→`.5` drill passes, normal product work uses two lanes: ordinary PR CI for implementation and one monotonically increasing signed internal version per Founder-approved feature slice for installed testing. Manual MSI installation remains recovery-only.

Do not begin Cloudflare, hosted storefront, remote PWA or provider expansion before the foundation and updater/install gates pass.

## Open implementation-lab decisions

- Record updater private-key generation provenance, named custody, offline backup, recovery test, rotation and key-loss procedure outside Git.
- Record the exact Windows machine profile used for the installed-candidate evidence. One-machine observations remain limited to that exact machine and artifact.
- Exact T470 and 4 GB reference datasets remain implementation-lab choices.
- Persisted shop-incarnation identity is still required before backup restore or future inbox/outbox records may treat a deleted-and-recreated slug as the same shop.
- Which implemented design tokens are retained or changed after the packaged frontend/design-system audit.
- Which courier candidates the Founder selects for the public launch set after live certification evidence.
