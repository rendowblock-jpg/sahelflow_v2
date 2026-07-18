# SahelFlow working memory

> **Last updated:** 2026-07-18

This is the compact entry point for current work. Update it at meaningful checkpoints and link deeper material rather than turning it into a transcript.

## Founder direction

- Use a lightweight multi-agent system with GitHub-backed shared memory.
- Work through deep-dive waves and multi-phase plans without task-by-task bureaucracy.
- Preserve the complete Founder-approved product contract.
- Preserve the durable Maze Map richness about capabilities, journeys, UI/UX, frontend behavior, Arabic/RTL and accessibility.
- Ground product and architecture work in actual source and evidence.
- Maintain one non-conflicting authority flow before implementation begins.
- Preserve GLM's one-ref cross-session continuity without maintaining a second product, roadmap or tool source.
- Active roles are Codex Desktop, ChatGPT and GLM.
- Codex Desktop is the only agent assumed to have full local desktop/runtime access.

## Canonical documentation state

The documentation reset, experience recovery and semantic consistency audit are integrated into `main`:

- PR #95 — current-to-target program: `dee78e9c6085b367fb7a533b50624f4389a4cb8d`.
- PR #96 — Maze Map experience authority: `2e5594b9af5bf1cb765f7b84dfbce4b393ba21c5`.
- PR #97 — documentation authority/consistency audit: `7a138695d4075998165cee362436f5201febe4ea`.
- PR #98 — post-audit checkpoint: `7a5e21d94f577db3946ac347fad49533b8625687`.
- Integrated baseline used to start the first implementation wave: `5fe00b5cb85505e5df27499fe46d0fa6050c0788`.

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

Historical Session-40 handoff/tool content remains in orphan-branch Git history only. GLM reads current `AGENTS.md`, Working Memory, active wave and governing authorities at every resume.

## Active wave

[**Proven Canonical Windows Desktop**](PROVEN_CANONICAL_WINDOWS_DESKTOP_WAVE.md) is active in the local Windows checkout on `agent/authenticated-runtime-protocol`. The branch has a large uncommitted implementation checkpoint; source and tests are evidence, but no clean-checkout or installed-candidate claim attaches to those uncommitted changes.

Required outcome:

> A seller can install one Windows candidate, start it reliably, open only the intended shop, and receive a clear recoverable failure instead of silent fallback or partial startup. The repository can prove this from a clean checkout.

Current checkpoint:

- GitHub Actions infrastructure is operational; run #371 passed the complete Quality Gate and Tauri smoke after the CI fallback key was corrected to a valid 256-bit hex key and the Linux cargo-check sidecar placeholder was created inside CI only.
- `sf-inventory` now generates machine-readable clean-checkout evidence. Run #374 passed and retained an inventory for 691 files, 31 pages, 114 API routes, 125 components, 142 CSS custom-property tokens, 31 Prisma models and 97 test files.
- A 2026-07-18 `sf-inventory --allow-dirty` diagnostic refresh reports 692 files, 31 pages, 114 API routes, 36 commands, 125 components, 31 Prisma models, 9 migration files, 97 test files and 14 sidecar/desktop resource files. This is useful local drift information only; it is not clean-checkout evidence.
- The Tauri smoke now runs `cargo check --release`, so release-only startup code is compiled instead of being silently excluded by `cfg(not(debug_assertions))`.
- The first Phase 1A runtime patch is implemented: the mandatory Next.js resource/runtime/spawn/readiness path fails closed, kills a timed-out child, and starts the degradable WhatsApp sidecar only after the application server is proven ready.
- Run #378 passed authority audit, inventory, TypeScript, ESLint, Vitest, coverage, security audit, migration status and `cargo check --release` for that patch.
- The uncommitted Phase 1A source checkpoint now allocates loopback endpoints per launch, creates independent runtime/application/sidecar credentials, authenticates readiness and webview bootstrap, binds readiness to the exact process/shop/registry/migration tuple, and shows a redacted seller-visible blocked-startup document instead of the main shell.
- Phase 1B source work now includes a process-bound fail-closed `ShopContext`, atomic versioned registry, positive imported revisions, all-shop migration planning, external journal, verified snapshots, OS-backed installation lock, interrupted-run restoration, and process-bound database authority with no registry fallback.
- Production domain services, AI tools/agent, e-commerce sync, automation dispatch, secrets/credentials, audit/auth persistence, order ledger, repository writes and route-local transactions now carry explicit shop authority. Packaged Google Sheets credential loading cannot fall back to a process working-directory file. A production-only source scan finds zero direct global-`db` route mutations and zero global-`db.$transaction` route roots; the remaining 23 raw-name mutation matches across eight service/tool files are aliases assigned from `ServiceContext` or `ToolContext`, not authority selection.
- The migration coordinator now writes an atomic, support-readable per-shop compatibility report before migration. Deterministic source drills prove insufficient-space blocking before snapshots, a zero-snapshot-space no-op rerun, two-shop migration with row preservation, divergent-history reporting, and one-version-back representative seller rows surviving the repository's actual packaged migration set.
- Mandatory runtime supervision now uses one explicit state machine: post-ready crashes and failed automatic restarts share a three-attempt 2/5/15-second budget, 60 seconds of stable runtime resets the budget, exhaustion enters seller-visible crash-loop safe mode, and shutdown prevents restart or late child registration.
- Current local verification is green: the full shared gate passed Prisma generation, migration deployment, TypeScript, ESLint and the complete Vitest suite in a fresh disposable sandbox; the consolidated write-path regression wave passed 198/198 tests across 13 suites; `cargo test --all-features` passed all 20 Rust tests; Clippy passed with warnings denied; and `cargo check --release` passed without warnings.
- The Phase 1B source-level write-authority and migration-coordinator sub-gates are met for the mechanically enumerated graph and source fixtures, but Phase 1B remains incomplete. A fresh clean-checkout Quality Gate, installed Windows migration/failure injection, and a separately approved representative seller-data copy remain required before artifact or field claims.
- No installed Windows artifact, failure-injection run, migration/recovery drill, T470 measurement or 4 GB measurement is claimed yet.

Exact next executable action:

1. create a separately authorized committed checkpoint for the clean-checkout Quality Gate and release-path Rust verification;
2. only then build the internal MSI and perform the separately confirmed clean-install, migration, restart/crash-loop and failure-injection matrix before any installed-candidate claim.

Do not begin Cloudflare, hosted storefront, remote PWA or provider expansion before the foundation gates pass.

## Open implementation-lab decisions

- Exact local Windows environment for the first installed candidate.
- Exact 4 GB floor-reference machine/dataset and T470 dataset.
- Which implemented design tokens are retained or changed after the packaged frontend/design-system audit.
- Which courier candidates the Founder selects for the public launch set after live certification evidence.
