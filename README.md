# SahelFlow 1.0

SahelFlow is a Windows-first, desktop-authoritative operations platform for Algerian COD sellers.

> **Repository status:** Product, architecture and unified-vision planning are complete. The current source contains substantial reusable product work, but it is **not yet a Stable SahelFlow 1.0 release**. Launch readiness is governed by commit-linked evidence, not historical version labels, feature counts or test counts.

## Authoritative documentation

Read in this order:

1. [`documentation/product/README.md`](documentation/product/README.md) — founder-approved product contract and choices.
2. [`documentation/vision/README.md`](documentation/vision/README.md) — complete product, functional, journey, experience and execution vision.
3. [`documentation/architecture/README.md`](documentation/architecture/README.md) — engineering authority, invariants and architecture package.
4. [`documentation/architecture/EVIDENCE_LEDGER.md`](documentation/architecture/EVIDENCE_LEDGER.md) — current launch-system status at the audited commit.
5. [`documentation/architecture/IMPLEMENTATION_ROADMAP.md`](documentation/architecture/IMPLEMENTATION_ROADMAP.md) — dependency-correct M0–M14 implementation order.
6. [`documentation/architecture/CODING_WORKFLOW.md`](documentation/architecture/CODING_WORKFLOW.md) — binding issue, branch, PR, review, test, merge, rollback and release rules.

The product Constitution and founder decisions are preserved. The unified vision package restores durable Maze Map, UX, function, journey and launch depth while explicitly rejecting superseded assumptions. Former v3/v4 architecture, project-state, build-plan and readiness documents are historical only; their disposition is recorded in [`documentation/architecture/DOCUMENTATION_INVENTORY.md`](documentation/architecture/DOCUMENTATION_INVENTORY.md).

## Approved launch shape

- **Platform:** Windows x64 desktop; 4 GB dual-core floor and ThinkPad T470 reference.
- **Authority:** one canonical desktop installation; one SQLite database per shop; desktop remains final business-write authority.
- **Connected plane:** bounded Cloudflare control plane, encrypted relay/projections, zero-knowledge backups and hosted storefronts.
- **Commercial model:** 35,000 DZD one-time complete edition; five included shops; up to five extra shop packs; owner plus ten active members under the approved device limits.
- **Trial:** one signed online machine-bound seven-day trial with complete lockout after expiry and preserved data.
- **AI:** seller-owned Google AI Studio key; typed/privacy-controlled Gemini workflows with explicit approval for destructive actions.
- **Synchronization:** durable hybrid webhook plus scheduled reconciliation; checkpoints never pass untracked failure.
- **Experience:** AR/FR/EN, RTL-native, accessible, page-complete, low-end-first and explicit about offline/degraded/recovery states.
- **Release:** signed Windows artifacts promoted through internal, beta and stable channels only after the required evidence exists.

## Current implementation conclusion

The existing Next.js/Tauri/Prisma/domain/UI work is a valuable migration base. The architecture audit found that launch identity/version, process supervision, explicit shop context, migrations, key recovery, licensing, team identity, durable inbox/outbox, Cloudflare protocols, backup, remote PWA, hosted storefront, provider certification and release authority require replacement or foundational hardening before feature expansion.

The vision recovery also established that UI/UX, onboarding, support, founder administration, marketing, page depth and real-user validation are horizontal product tracks—not late cosmetic work. No feature implementation should bypass the roadmap dependency order or the capability/journey traceability requirements.

## Development baseline

This remains a Bun/Next.js/Tauri/Prisma repository. Development commands are implementation details, not release evidence:

```bash
bun install --frozen-lockfile
bun run db:generate
bun run sf-verify
```

Packaged Windows, migration, recovery, provider and low-end verification must follow the active Coding Workflow and runbooks. `prisma db push` is not a production migration mechanism.

## Evidence rule

A claim such as “verified,” “supported,” “production-ready,” “AAA” or “Stable” must identify the exact source commit, artifact digest, environment/provider/device, procedure, result and reviewer. The current authority is the Evidence Ledger and future signed release evidence manifest.
