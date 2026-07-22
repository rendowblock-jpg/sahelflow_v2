# SahelFlow working memory

> **Last updated:** 2026-07-22

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

No application behavior or executable product source changed in the documentation waves above.

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

[**Proven Canonical Windows Desktop**](PROVEN_CANONICAL_WINDOWS_DESKTOP_WAVE.md) is active. PR #104 integrated the source checkpoint into `main` at `d33890fe31836d9a982902dd469bcc3960c4c23c`; PR #105 integrated the reproducible development environment at `1a0469bb5384561d85178316d0cd6e94745b44a0`; PR #112 integrated the ChatGPT/Codex Cloud/Codex Desktop workflow at `11e6fa114dc257f8f686c9859d72886a034e1e50`. No Linux/cloud result substitutes for installed-Windows evidence.

Required outcome:

> A seller can install one Windows candidate, start it reliably, open only the intended shop, receive a clear recoverable failure instead of silent fallback or partial startup, and move to a newer approved version without rebuilding locally or losing shop data. The repository can prove this from a clean checkout and an installed A→B drill.

Current checkpoint:

- The signed internal updater path is active in source and protected by exact-source dispatch, the `internal-updater` environment, Tauri updater signature verification, immutable source-specific draft tags, `latest.json` verification and retained evidence. This is internal-lab authority only; no Beta or Stable claim follows.
- GitHub Actions produced signed candidate `1.0.0-internal.1` from exact commit `f977242924e98b4be0f147988b41504f0dbeba1b`. The Founder verified the MSI, signature, source commit, signing-key ID, evidence manifest and SHA-256 `e5e62f3e3faacf330565dbffde21db898a154c2dd2ce246599ec091742b8513f`, then installed it on the authorized Windows lab PC.
- Installed `.1` created registry revision 1 with active shop `default`, deployed all eight packaged migrations and preserved fail-closed startup. It did not reach ready: bundled Bun 1.3.14 returned `EPERM` only when loading `C:\Program Files\SahelFlow\standalone\server.js` as its entry script. The `.1` GitHub Release remains draft and must not be published.
- PowerShell and both Bun file APIs could read the packaged `server.js`; the exact complete standalone tree copied to a writable directory, using the same bundled Bun, Prisma engine, database, registry, migration digest, auth mode and readiness token, returned HTTP 200 with all app/database/migration/registry/shop/auth checks `ready`. This isolates the installed blocker to Bun entry-script loading below Program Files rather than data, migration, authentication, signing or installer integrity.
- Draft PR #125 on `agent/windows-runtime-staging` implements corrected manual-replacement baseline `1.0.0-internal.2` / MSI `1.0.0.2`: deterministic standalone tree manifest, packaged-source verification, atomic version/digest-bound LocalAppData staging, cached-tree verification, explicit contained-process working directory, release evidence binding and exact Windows authenticated readiness smoke.
- PR #125 CI run `29881291176` passed the complete quality gate, coverage, production audit, migration status, Tauri release compilation, exact Windows database suite, production standalone build and the new staged packaged-runtime authenticated readiness check. This is source/CI evidence, not yet an installed `.2` claim.
- Seller databases, registry, migration records and master key remain in the canonical roaming AppData directory; only immutable packaged application-server resources are staged in the local runtime cache.

Exact next executable action:

1. Complete final review and merge PR #125 into protected `main`.
2. Manually dispatch **Build Signed Internal Windows Update** from the exact new merged `main` SHA to produce signed `1.0.0-internal.2` as a draft and retained workflow artifact.
3. Verify `.2` source/signature/hash/evidence, install it over `.1` without deleting AppData, and prove first launch plus close/reopen while preserving registry, shop database and migration records.
4. Keep both `.1` and `.2` releases unpublished during that installed baseline test.
5. After installed `.2` passes, create a deliberately small compatible `1.0.0-internal.3`, publish only the approved `.3` channel metadata/artifacts, and prove installed `.2`→`.3` in-app update, restart, preservation and failure recovery.
6. Only after the installed updater drill passes may normal local testing rely on in-app updates. Manual MSI replacement remains the recovery fallback.

Do not begin Cloudflare, hosted storefront, remote PWA or provider expansion before the foundation and updater/install gates pass.

## Open implementation-lab decisions

- Record updater private-key generation provenance, named custody, offline backup, recovery test, rotation and key-loss procedure outside Git.
- Record the exact Windows machine profile used for the installed-candidate evidence. One-machine observations remain limited to that exact machine and artifact.
- Exact T470 and 4 GB reference datasets remain implementation-lab choices.
- Persisted shop-incarnation identity is still required before backup restore or future inbox/outbox records may treat a deleted-and-recreated slug as the same shop.
- Which implemented design tokens are retained or changed after the packaged frontend/design-system audit.
- Which courier candidates the Founder selects for the public launch set after live certification evidence.
