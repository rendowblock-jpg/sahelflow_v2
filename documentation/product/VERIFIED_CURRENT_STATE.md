# SahelFlow 1.0 — Current Implementation Baseline

> **Status:** Final source-audit baseline for the Architecture Reset; not launch certification  
> **Source commit:** `03f0d48436b42788e463bbd1d74a388b2da22294` (`main`, 2026-07-15)  
> **Final status authority:** [`../architecture/EVIDENCE_LEDGER.md`](../architecture/EVIDENCE_LEDGER.md)

The original preliminary baseline is preserved in git at the source commit above. This completed record summarizes the current implementation shape that informed the Engineering Specification, superseding ADRs and roadmap.

## Audit method and limit

The audit read the authoritative product package in order, pinned `main`, reviewed repository history/tree comparisons and inspected the launch-critical configuration, schema, migrations, database routing, domain services, security, licensing, key/secret handling, backup, synchronization, automation, storefront, PWA, WhatsApp sidecar, AI/provider surfaces, tests, CI and release tooling.

GitHub Actions jobs failed before executing any step during the audit, including an audit-only export workflow. Therefore this document does not claim a new green test, build, installer, provider, performance or restore result. The Evidence Ledger uses conservative statuses until reproducible evidence is linked.

## Existing implementation shape

The repository contains a substantial local-first application built from:

- Tauri as the desktop host;
- a bundled/local Next.js server loaded by the WebView;
- a Bun/Hono/Baileys WhatsApp sidecar;
- Prisma and one intended SQLite database per shop;
- Next.js App Router UI and API routes;
- domain services for catalog, customers, orders, deliveries, returns, refunds, expenses, COD reconciliation and analytics;
- integrations for WhatsApp, Gemini, couriers, e-commerce platforms and Google Sheets;
- storefront builder/view/checkout work;
- unit/integration and Playwright test sources;
- GitHub Actions, Tauri updater and release tooling.

This is meaningful migration/reuse value. It is not equivalent to the approved SahelFlow 1.0 architecture.

## Narrow foundations supported by source evidence

- Core monetary fields use integer DZD rather than floating-point money.
- Per-shop SQLite/Prisma models and substantial domain/UI workflows exist.
- Ed25519 verification, AES-GCM helpers and blind-index techniques exist as reusable primitives.
- Storefront checkout derives item prices from server-side product records rather than trusting a submitted price.
- The WhatsApp sidecar defaults to loopback binding and protects non-root endpoints with a bearer token.
- Significant test sources and historical verification records exist, although they require a clean current rerun and risk-based evidence.

These statements do not certify the larger systems that contain them.

## High-confidence architecture mismatches

### Version and documentation

- Package, Tauri and Cargo metadata use internal `4.1.0` while the founder-approved public product is SahelFlow 1.0.
- Former README, architecture, project-state, ADR, assessment and build-plan files contained conflicting v3/v4, pricing, team, cloud, polling, backup and readiness claims. They are now redirects/history.

### Desktop runtime and migrations

- The packaged design is a three-process system using fixed local ports.
- Startup/resource failure recovery is incomplete.
- Production child environment and migration code target `shops/dev.db` instead of coordinating every registered shop.
- Migration backup errors can be logged without blocking migration.

### Database authority

- Global active-shop/app-meta routing can silently fall back to a default database when registry handling fails.
- The schema and service assumptions are structurally single-user.
- There is no trusted tenant/member/device/session/field-permission model.
- Audit actors are not universally authenticated identities.

### Keys, licensing and recovery

- The current master-key authority is a plaintext hex keyfile; Stronghold registration does not make it the server-side key authority.
- The same root protects selected PII and provider-secret rows without the required purpose-separated recovery hierarchy.
- The browser can self-issue an unsigned seven-day trial, store it in localStorage and obtain another trial after storage deletion.
- The server retains a legacy path that can trust locally editable status.
- Founder payment verification, shop/member/device entitlements, transfer and the five-year same-major connected-service policy are not implemented.

### Durability and external effects

- Automation dispatch and some provider/sidecar callbacks are fire-and-forget rather than transactionally durable.
- There is no general durable inbox/outbox/effect-receipt/dead-letter/checkpoint foundation.
- Commerce synchronization can advance a watermark after individual item failure.
- Refund reversal and other critical compensations are not represented by a complete append-only money/stock/accounting fact model.

### PWA, cloud, backup and storefront

- The current service worker caches only the local app shell; there is no remote identity, pairing, encrypted projection, command, revocation or conflict protocol.
- No bounded Cloudflare control plane/relay/backup/storefront implementation exists.
- Backup is a local best-effort active-DB byte copy without authenticated zero-knowledge format, required retention, recovery kit or restore certification.
- Storefront checkout writes to the active local database and uses process-memory rate limiting; there is no hosted tenant/shop allocation, immutable release, durable checkout receipt or relay/import acknowledgement.

### Providers, tests and release

- Provider source adapters and mocks do not constitute live certification.
- Packaged Windows, 4 GB reference-device, backup restore, tenant boundary and real provider evidence are missing.
- GitHub Actions was non-operational during the audit.
- The local release script pushes/tags before building; the CI release workflow targets Windows, Linux and macOS despite Windows-only launch scope.

## Disposition

The final keep/harden/migrate/replace/delete decisions are in [`../architecture/REUSE_MIGRATION_DELETION_PLAN.md`](../architecture/REUSE_MIGRATION_DELETION_PLAN.md). The dependency-correct implementation order is in [`../architecture/IMPLEMENTATION_ROADMAP.md`](../architecture/IMPLEMENTATION_ROADMAP.md).

No founder-approved product choice was reopened. The audit instead established that the current domain/UI work should be preserved behind new authorities for runtime, shop context, keys, licensing, identity, durable effects, Cloudflare, backup, PWA, storefront, provider certification and release evidence.
