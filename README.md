# SahelFlow 1.0

SahelFlow is a Windows-first, desktop-authoritative operations platform for Algerian COD sellers.

> **Repository status:** The current codebase contains a broad, valuable operational application, but it is not yet a Stable SahelFlow 1.0 release. The active work is a controlled migration from the current local single-owner foundations to the Founder-approved identity, durability, recovery and connected-system architecture.

## Start here

1. [`documentation/product/README.md`](documentation/product/README.md) — Founder-approved product contract.
2. [`documentation/experience/README.md`](documentation/experience/README.md) — complete experience, frontend, capability and end-to-end journey authority recovered from the Maze Map.
3. [`documentation/architecture/README.md`](documentation/architecture/README.md) — engineering authority and read order.
4. [`documentation/architecture/CURRENT_TO_TARGET_ANALYSIS.md`](documentation/architecture/CURRENT_TO_TARGET_ANALYSIS.md) — source-grounded current state, full gap matrix, metrics and migration disposition.
5. [`documentation/architecture/IMPLEMENTATION_ROADMAP.md`](documentation/architecture/IMPLEMENTATION_ROADMAP.md) — the single work path to Stable.
6. [`documentation/operations/WORKING_MEMORY.md`](documentation/operations/WORKING_MEMORY.md) — current wave and next move.

## Approved launch shape

- **Platform:** Windows x64 desktop; 4 GB dual-core floor and ThinkPad T470 reference.
- **Authority:** one canonical desktop installation; one operational SQLite database per shop; desktop remains final business-write authority.
- **Connected plane:** bounded Cloudflare control plane, encrypted relay/projections, zero-knowledge backup and hosted storefronts.
- **Commercial model:** 35,000 DZD one-time complete edition; five included shops; up to five paid extra shops; owner plus ten active members under the approved device limits.
- **Trial:** one signed online machine-bound seven-day trial with complete lockout after expiry and preserved data.
- **AI:** seller-owned Google AI Studio key; typed, privacy-controlled workflows and explicit bound approval for consequential actions.
- **Synchronization:** durable hybrid webhook plus scheduled reconciliation; checkpoints never pass untracked failure.
- **Experience:** quiet-power operational UX, page-complete behavior, Arabic/French/English parity, rigorous RTL, WCAG 2.2 AA, keyboard fluency and low-end responsiveness.
- **Release:** signed Windows artifacts promoted through internal, beta and stable channels only after evidence exists.

## Current implementation conclusion

The existing Tauri, Next.js, Prisma, SQLite, domain, UI, WhatsApp, provider, AI and test work is a strong migration base. The main gaps are trusted shop/member/device/entitlement authority, safe migrations and key recovery, durable audit/inbox/outbox/compensation, real connected-system boundaries, provider certification, complete journey/state depth, packaged low-end evidence and artifact-first release authority.

Do not add visible connected features around those missing foundations. Preserve useful code and migrate it through the active roadmap. Product work must also satisfy the relevant capability, journey and experience requirements rather than only the happy-path screen.

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

These are development checks, not release evidence. The current CI command drift and packaged-candidate gaps are tracked in the current-to-target analysis and Phase 0 roadmap.

`prisma db push` is development-only and is not a production migration mechanism.

## Evidence rule

A claim such as “verified,” “supported,” “production-ready,” or “Stable” must identify the exact source commit, artifact, environment/provider/device, procedure and result. Source code, mocks, historical test counts and version labels are not substitutes.