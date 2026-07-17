# SahelFlow working memory

> **Last updated:** 2026-07-17

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

[**Proven Canonical Windows Desktop**](PROVEN_CANONICAL_WINDOWS_DESKTOP_WAVE.md) is active on `agent/proven-canonical-windows-desktop`, based on `main` commit `5fe00b5cb85505e5df27499fe46d0fa6050c0788`.

Required outcome:

> A seller can install one Windows candidate, start it reliably, open only the intended shop, and receive a clear recoverable failure instead of silent fallback or partial startup. The repository can prove this from a clean checkout.

Current checkpoint:

- GitHub Actions infrastructure is operational; run #371 passed the complete Quality Gate and Tauri smoke after the CI fallback key was corrected to a valid 256-bit hex key and the Linux cargo-check sidecar placeholder was created inside CI only.
- `sf-inventory` now generates machine-readable clean-checkout evidence. Run #374 passed and retained an inventory for 691 files, 31 pages, 114 API routes, 125 components, 142 CSS custom-property tokens, 31 Prisma models and 97 test files.
- The Tauri smoke now runs `cargo check --release`, so release-only startup code is compiled instead of being silently excluded by `cfg(not(debug_assertions))`.
- The first Phase 1A runtime patch is implemented: the mandatory Next.js resource/runtime/spawn/readiness path fails closed, kills a timed-out child, and starts the degradable WhatsApp sidecar only after the application server is proven ready.
- Run #378 passed authority audit, inventory, TypeScript, ESLint, Vitest, coverage, security audit, migration status and `cargo check --release` for that patch.
- No installed Windows artifact, failure-injection run, migration/recovery drill, T470 measurement or 4 GB measurement is claimed yet.

Exact next executable action:

1. use the retained inventory to enumerate all desktop startup/readiness and shop-routing authority call sites;
2. add a structured seller-visible blocked/recovery startup surface without allowing the main shell to appear ready;
3. converge fixed endpoint replacement and per-launch authentication behind that startup state machine;
4. then begin the explicit `ShopContext` and atomic registry boundary, preserving one SQLite file per shop while removing silent fallback;
5. validate each bounded change through the full clean-checkout Quality Gate and release-path Rust smoke before installed Windows evidence.

Do not begin Cloudflare, hosted storefront, remote PWA or provider expansion before the foundation gates pass.

## Open implementation-lab decisions

- Exact local Windows environment for the first installed candidate.
- Exact 4 GB floor-reference machine/dataset and T470 dataset.
- Which implemented design tokens are retained or changed after the packaged frontend/design-system audit.
- Which courier candidates the Founder selects for the public launch set after live certification evidence.
