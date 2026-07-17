# SahelFlow 1.0

SahelFlow is a Windows-first, desktop-authoritative operations platform for Algerian COD sellers.

> **Repository status:** The current codebase contains a broad, valuable operational application, but it is not yet a Stable SahelFlow 1.0 release. The active work is a controlled migration from the current local single-owner foundations to the Founder-approved identity, durability, recovery, connected-system and page-complete experience architecture.

## Start here

1. [`documentation/product/README.md`](documentation/product/README.md) — Founder-approved product contract and Stable scope.
2. [`documentation/experience/README.md`](documentation/experience/README.md) — capability depth, journeys/states, UI/UX, frontend, Arabic/RTL and accessibility authority.
3. [`documentation/architecture/README.md`](documentation/architecture/README.md) — target engineering system, current-to-target model and execution path.
4. [`documentation/operations/WORKING_MEMORY.md`](documentation/operations/WORKING_MEMORY.md) — current wave, checkpoint and exact next move.

## Authority and conflict rule

Use this order when documents overlap:

1. a newer explicit numbered Founder decision that states what it changes;
2. the Founder-approved product contract;
3. the experience package for included capabilities, journeys and frontend quality;
4. the Engineering Specification and accepted superseding ADRs for system boundaries and invariants;
5. the Current-to-Target Analysis for source-grounded implementation status and migration disposition;
6. the Implementation Roadmap and Coding Workflow for sequence, review and evidence;
7. Working Memory and the active wave for current progress.

A lower layer cannot silently weaken a higher layer. Current code, research, a test count, a historical plan or an implementation convenience never overrides the target. When experience and engineering requirements appear to conflict, stop and reconcile the owning documents; preserve the product contract, security, data integrity, accessibility and recoverability rather than allowing one document to drift.

## Documentation classes

- `documentation/product/`, `documentation/experience/` and `documentation/architecture/` contain active durable authority.
- `documentation/operations/` coordinates current work and does not redefine the product.
- `documentation/research/` is reference material and must be revalidated before use; it is not current authority.
- `CHANGELOG.md` records the current SahelFlow 1.0 migration. The former session/v3/v4 chronology is preserved separately as history.
- Component-local READMEs describe their code boundary only. They cannot make product, provider, platform or readiness claims beyond the active authorities and evidence.

## Approved launch shape

- **Platform:** Windows x64 desktop; capability-based compatibility across the approved Windows matrix; 4 GB dual-core floor and ThinkPad T470 reference.
- **Authority:** one canonical desktop installation; one operational SQLite database per shop; desktop remains final authority for canonical business mutations.
- **Connected plane:** bounded Cloudflare control plane, encrypted relay/projections, zero-knowledge backup and hosted storefronts.
- **Commercial model:** 35,000 DZD one-time complete edition; five included shops; up to five paid extra shops; owner plus ten active members under the approved device limits.
- **Trial:** one signed online machine-bound seven-day trial with complete lockout after expiry and preserved data.
- **AI:** seller-owned Google AI Studio key; typed, privacy-controlled workflows and explicit bound approval for consequential actions.
- **Synchronization:** durable hybrid webhook plus scheduled reconciliation; checkpoints never pass untracked failure.
- **Experience:** quiet-power operational UX, page-complete behavior, Arabic/French/English parity, rigorous RTL, WCAG 2.2 AA, keyboard fluency and low-end responsiveness.
- **Storefront receipt:** public checkout success means a durable tenant/shop receipt exists; it does not claim the canonical desktop has committed the order yet.
- **Release:** signed Windows artifacts promoted through internal, beta and stable channels only after evidence exists.

## Current implementation conclusion

The existing Tauri, Next.js, Prisma, SQLite, domain, UI, WhatsApp, provider, AI and test work is a strong migration base. The main gaps are trusted shop/member/device/entitlement authority, safe migrations and key recovery, durable audit/inbox/outbox/compensation, real connected-system boundaries, provider certification, complete journey/state depth, packaged low-end evidence and artifact-first release authority.

Do not add visible connected features around those missing foundations. Preserve useful code and migrate it through the active roadmap. Product work must satisfy its governing scope class, capability, journey states, experience dimensions, architecture invariants and evidence—not only the happy-path screen.

## Development commands

The package scripts currently available include:

```bash
bun install --frozen-lockfile
bun run db:generate
bun run typecheck
bun run lint
bun run test
bun run build
```

These are development checks, not release evidence. The current CI command drift and packaged-candidate gaps are tracked in the Current-to-Target Analysis and Phase 0 roadmap.

`prisma db push` is development-only and is not a production migration mechanism.

## Evidence rule

A claim such as “verified,” “supported,” “production-ready,” or “Stable” must identify the exact source commit, artifact, environment/provider/device, procedure and result. Source code, mocks, historical test counts and version labels are not substitutes.