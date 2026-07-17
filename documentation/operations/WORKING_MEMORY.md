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
- PR #100 — first Proven Canonical Windows Desktop implementation checkpoint, merged as `2a6233e1e0e090b7d963f217240b013071a9b90c`.

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

A lower layer cannot silently weaken a higher layer. Ambiguous scope defaults to Candidate.

## GLM continuity state

The old `agent-handoff` orphan ref remains a compact GLM resume checkpoint only. Shared commands and their source live on `main`:

```bash
bun run sf-audit
bun run sf-inventory
bun run sf-verify
bun run sf-verify --fast
bun run glm:bootstrap
```

GLM reads current `AGENTS.md`, Working Memory, active wave and governing authorities at every resume.

## Active wave

[**Proven Canonical Windows Desktop**](PROVEN_CANONICAL_WINDOWS_DESKTOP_WAVE.md) remains active.

Required outcome:

> A seller can install one Windows candidate, start it reliably, open only the intended shop, and receive a clear recoverable failure instead of silent fallback or partial startup. The repository can prove this from a clean checkout.

Current checkpoint:

- PR #100 is merged to `main`.
- GitHub Actions is fully operational and binds dependency installation, Prisma generation/deployment/status, documentation audit, inventory, TypeScript, ESLint, Vitest, coverage, production audit and `cargo check --release`.
- `sf-inventory` retains machine-readable clean-checkout evidence. The retained Phase 0 checkpoint reported 691 files, 31 pages, 114 API routes, 125 components, 142 CSS custom-property tokens, 31 Prisma models and 97 test files.
- Mandatory Next.js resource/runtime/spawn/readiness failures no longer permit a blank or partial-ready shell. Timed-out children are killed, and the degradable WhatsApp sidecar starts only after mandatory application-server readiness.
- The configured desktop window starts hidden. Successful startup reveals the normal shell; migration or mandatory runtime failure navigates the same window to a French/English/Arabic blocked-state page with a diagnostic code, safe-retry guidance and a persisted JSON report path.
- Follow-up PR #101 fixes Windows diagnostic replacement behavior by writing unique timestamped reports. Run #394 passed the complete Quality Gate and `cargo check --release`.
- No installed Windows artifact, packaged failure-injection result, all-shop migration/recovery drill, T470 measurement or 4 GB measurement is claimed yet.

Exact next executable action:

1. enumerate every fixed-port, sidecar URL, health/readiness and local-runtime authentication call site;
2. define one supervisor-owned per-launch runtime context containing allocated endpoints, credentials and readiness state;
3. migrate the Tauri host, Next.js server and WhatsApp sidecar behind that boundary without exposing the normal shell early;
4. then begin explicit `ShopContext` and atomic registry work, preserving one SQLite file per shop while removing silent fallback;
5. validate each bounded change through the full clean-checkout Quality Gate and release-path Rust smoke before installed Windows evidence.

Do not begin Cloudflare, hosted storefront, remote PWA or provider expansion before the foundation gates pass.

## Open implementation-lab decisions

- Exact local Windows environment for the first installed candidate.
- Exact 4 GB floor-reference machine/dataset and T470 dataset.
- Exact failure-injection harness for occupied endpoint, missing resource, migration failure and child termination.
- Which implemented design tokens are retained or changed after the packaged frontend/design-system audit.
- Which courier candidates the Founder selects for the public launch set after live certification evidence.
