# SahelFlow working memory

> **Last updated:** 2026-07-19

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

[**Proven Canonical Windows Desktop**](PROVEN_CANONICAL_WINDOWS_DESKTOP_WAVE.md) is active. PR #104 integrated the source checkpoint into `main` at `d33890fe31836d9a982902dd469bcc3960c4c23c`; PR #105 proposes the reproducible remote-development environment from that baseline on `agent/codespaces-main-integration`. No Codespaces result is installed-Windows evidence.

Required outcome:

> A seller can install one Windows candidate, start it reliably, open only the intended shop, and receive a clear recoverable failure instead of silent fallback or partial startup. The repository can prove this from a clean checkout.

Current checkpoint:

- GitHub Actions infrastructure is operational; run #371 passed the complete Quality Gate and Tauri smoke after the CI fallback key was corrected to a valid 256-bit hex key and the Linux cargo-check sidecar placeholder was created inside CI only.
- `sf-inventory` now generates machine-readable clean-checkout evidence. Run #374 passed and retained an inventory for 691 files, 31 pages, 114 API routes, 125 components, 142 CSS custom-property tokens, 31 Prisma models and 97 test files.
- A 2026-07-18 `sf-inventory --allow-dirty` diagnostic refresh reports 692 files, 31 pages, 114 API routes, 36 commands, 125 components, 31 Prisma models, 9 migration files, 97 test files and 14 sidecar/desktop resource files. This is useful local drift information only; it is not clean-checkout evidence.
- The Tauri smoke now runs `cargo check --release`, so release-only startup code is compiled instead of being silently excluded by `cfg(not(debug_assertions))`.
- The first Phase 1A runtime patch is implemented: the mandatory Next.js resource/runtime/spawn/readiness path fails closed, kills a timed-out child, and starts the degradable WhatsApp sidecar only after the application server is proven ready.
- Run #378 passed authority audit, inventory, TypeScript, ESLint, Vitest, coverage, security audit, migration status and `cargo check --release` for that patch.
- The integrated Phase 1A source allocates loopback endpoints per launch, creates independent runtime/application/sidecar credentials, authenticates readiness and webview bootstrap, binds readiness to the exact process/shop/registry/migration tuple, and shows a redacted seller-visible blocked-startup document instead of the main shell.
- Phase 1B source includes a process-bound fail-closed `ShopContext`, atomic versioned registry, positive imported revisions, all-shop migration planning, external journal, verified snapshots, OS-backed installation lock, interrupted-run restoration, and process-bound database authority with no registry fallback.
- Production domain services, AI tools/agent, e-commerce sync, automation dispatch, secrets/credentials, audit/auth persistence, order ledger, repository writes and route-local transactions now carry explicit shop authority. Packaged Google Sheets credential loading cannot fall back to a process working-directory file. A production-only source scan finds zero direct global-`db` route mutations and zero global-`db.$transaction` route roots; the remaining 23 raw-name mutation matches across eight service/tool files are aliases assigned from `ServiceContext` or `ToolContext`, not authority selection.
- The migration coordinator writes an atomic, support-readable per-shop compatibility report before migration. Deterministic source drills prove insufficient-space blocking before snapshots, a zero-snapshot-space no-op rerun, two-shop migration with row preservation, divergent-history reporting, and one-version-back representative seller rows surviving the repository's actual packaged migration set.
- Mandatory runtime supervision uses one explicit state machine: post-ready crashes and failed automatic restarts share a three-attempt 2/5/15-second budget, 60 seconds of stable runtime resets the budget, exhaustion enters seller-visible crash-loop safe mode, and shutdown prevents restart or late child registration.
- Commits `b3fcb26` and `7ad237a` closed the adversarial-review blockers around stale journal rollback, Windows process-tree containment, bounded generation-aware restarts, registry file aliasing, legacy schema fingerprinting, strict order ledgers, COD/refund atomicity, shipment reconciliation and disposable test-sandbox escape.
- Clean-checkout CI run `29697219950` passed at `7ad237a`: the Quality Gate covered 94 files and 1,534 tests with 80.87% statement/line coverage, a clean production audit and current migration status; the independent Tauri job passed release-path Rust compilation.
- Current local Windows verification is green for the source-testable changes: the fast shared gate passed TypeScript and complete ESLint; 60 focused transaction/sandbox tests passed; `cargo test --all-features --locked` passed 42/42 tests including a real descendant-process Job Object test; warning-denied Clippy, formatting, release compilation and the shared migration hash vector passed.
- The HP development machine is an Intel Celeron N3060 with 8 GB RAM and less than 10 GB free disk. `sf-verify --fast` required 7 minutes 56 seconds, making it a Windows/low-end test machine rather than the primary compilation environment.
- A personal GitHub Codespaces pilot proved the 2-core/8 GB environment as the normal coding-agent mode: warm `sf-verify --fast` completed in 37-48 seconds and the complete Prisma/TypeScript/ESLint/Vitest gate completed in about 1 minute 59 seconds to 2 minutes 10 seconds. The 4-core/16 GB pilot completed the fast gate in 39 seconds and the complete gate in about 93 seconds, so it is reserved for bounded heavy work rather than routine sessions.
- The refreshed Codespaces branch pins Bun 1.3.14, Node 22 and Rust, prepares synthetic sandbox paths, keeps port 3000 private by default, creates only an ignored Linux sidecar placeholder and leaves native Tauri release compilation in GitHub Actions. The original full rebuild passed automatic bootstrap, authority audit and the complete shared gate at documented branch head `74bfc07`.
- PR #105 is merge-ready at `779e7311a99fe7f896ade9d23977fbf5119486ae`: clean-checkout run `29700383175` passed the Quality Gate in 3 minutes 32 seconds and Tauri release smoke in 51 seconds.
- The pilot corrected Windows-only shop test paths, a host-native `ShopContext` fixture and an Algiers-day report fixture. Auth tests no longer write `.env.local` or the unread `data/auth-secret` shadow file outside the sandbox.
- The Phase 1A/1B source and clean-checkout sub-gates are met. Installed Windows migration/failure injection, a separately approved representative seller-data copy and reference-device measurements remain required before artifact or field claims.
- No installed Windows artifact, failure-injection run, migration/recovery drill, T470 measurement or 4 GB measurement is claimed yet.

Exact next executable action:

1. merge green PR #105;
2. only then separately authorize the internal MSI and perform the clean-install, migration, restart/crash-loop and failure-injection matrix before any installed-candidate claim.

Do not begin Cloudflare, hosted storefront, remote PWA or provider expansion before the foundation gates pass.

## Open implementation-lab decisions

- Exact local Windows environment for the first installed candidate.
- Exact 4 GB floor-reference machine/dataset and T470 dataset.
- Persisted shop-incarnation identity before backup restore or future inbox/outbox records may treat a deleted-and-recreated slug as the same shop.
- Which implemented design tokens are retained or changed after the packaged frontend/design-system audit.
- Which courier candidates the Founder selects for the public launch set after live certification evidence.
