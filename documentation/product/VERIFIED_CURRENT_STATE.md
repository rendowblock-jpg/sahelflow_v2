# SahelFlow — Verified Current-State Baseline

> **Status:** Preliminary evidence baseline, not the final Architecture Reset audit  
> **Prepared:** 2026-07-15  
> **Purpose:** Prevent the next session from treating intended architecture, historical claims, or UI presence as implemented product truth.

The next session must re-read and revalidate the entire repository at the exact current `main` commit. This document records high-confidence findings from the Excellence Reset review so that known risks are not lost.

## 1. Current implementation shape

The repository currently uses a local-first Windows-oriented stack built around:

- Tauri;
- WebView2;
- Next.js/React;
- Prisma with per-shop SQLite files;
- application-layer field encryption for selected PII;
- a WhatsApp/Baileys sidecar;
- local API/server routes;
- delivery and commerce adapter abstractions;
- Zustand/browser state in some areas;
- historical documents describing multiple incompatible architectures and product generations.

The exact production process topology, installer behavior, resource use, and runtime security must be revalidated from packaged builds—not inferred from source dependencies.

## 2. What appears materially implemented

Subject to full revalidation, the codebase contains meaningful implementation for:

- per-shop SQLite domain models;
- products, customers, orders, items, deliveries, returns, expenses, automations, integrations, AI chat records, secrets, and conversation/message records;
- order versioning and many useful indexes;
- integer DZD money;
- customer PII encryption/blind-index concepts;
- order state services and some compensation behavior;
- WhatsApp-sidecar integration;
- e-commerce adapters for Shopify, WooCommerce, and YouCan;
- courier adapter work;
- storefront routes and presentation work;
- license-related UI/state;
- backup and migration paths;
- analytics and COD reconciliation concepts;
- a substantial automated-test footprint.

Existence does not prove launch completeness, provider correctness, UI quality, packaged operation, or resilience.

## 3. Known critical mismatches

### 3.1 Synchronization can skip failed records

The reviewed synchronization engine catches individual order-processing errors but advances the integration watermark to the newest fetched watermark. A failed record can therefore be permanently skipped. The approved design requires distinct committed checkpoints, durable retries/dead letters, overlap windows, and repair scans.

### 3.2 Current schema is single-user

The schema explicitly removed team-member tables, has no general trusted actor context, and lacks comprehensive `createdBy`/`updatedBy` authorization fields. Conversation `assigneeId` and `teamId` are placeholders rather than complete relational authorization. Professional teams require a foundation-level redesign.

### 3.3 Secret/key claims do not match storage

Historical documents claim Stronghold/OS-backed master-key storage, while reviewed code stores a plaintext hex master key in a local file and stores encrypted secret rows in SQLite. The threat model, key recovery, rotation, backup behavior, and stolen-profile risk are not aligned with claims.

### 3.4 License authority is unsafe for production

Reviewed code self-issues an unsigned trial and stores license state in browser/Zustand localStorage. Deleting state can recreate trial behavior. The approved product requires one-time online signed trial issuance, OS-protected license storage, trusted time, entitlement recovery, and complete lockout defense in depth.

### 3.5 Backup is not yet trustworthy disaster recovery

The reviewed backup implementation is principally a local database copy with best-effort WAL handling. It does not implement the approved authenticated encrypted archive, recovery kit, cloud retention, immutability, restore simulation, clean-install recovery, or zero-knowledge key hierarchy.

### 3.6 Migration does not fail closed

Reviewed Tauri migration behavior can continue after backup creation fails. Approved behavior requires verified backup as a prerequisite for existing databases, atomic rollback, and recovery tooling.

### 3.7 Critical writes lack unified atomicity

Order mutations, audit records, automation dispatch, and external side effects are not consistently joined through transactional outbox/inbox patterns. Crash windows may lose required automation or audit behavior.

### 3.8 Audit is incomplete

The current audit coverage and user-facing audit product do not match broad historical claims. Critical events are not universally transactional, actor-attributed, or exposed through complete global/per-record history.

### 3.9 Database safety guard is overstated

The reviewed guard does not reliably reject dangerous filters containing `undefined`, despite comments claiming protection, and the documented bypass is absent. Strict recursive validation and aligned tests are required.

### 3.10 Refund reversal is heuristic

Reviewed reversal behavior can infer compensation from later state rather than storing exact compensation facts at refund creation. This can restore the wrong statistic or state.

### 3.11 AI UX and action confirmation are incomplete

Reviewed AI UI truncates raw serialized tool results and uses a weak generic confirmation flow. The approved product requires typed localized result cards, durable exact pending actions, explicit approve/cancel, permissions, idempotency, audit, safe redaction, and the professional Gemini setup wizard.

### 3.12 Storefront templates are not genuinely distinct

The existing storefront implementation does not materially branch into the three approved template systems and lacks the complete shared hosted tenant/release/checkout platform.

### 3.13 Current PWA is not the approved remote product

The reviewed service worker primarily caches the shell. Business data and operations depend on a reachable local server; secure pairing, encrypted projections, signed commands, conflict handling, team access, and cloud relay are not complete.

### 3.14 Automatic synchronization is not proven

Historical claims describe automatic two-to-five-minute synchronization, while the current engine is principally manually/API invoked and sequential. Scheduler, health, backfill, retry, provider lifecycle, and degraded-mode behavior remain launch work.

### 3.15 External adapters are not launch-certified

Adapter code and documentation are not equivalent to real provider certification. DHD is explicitly experimental/unverified, and no complete capability-by-capability evidence ledger exists for couriers or commerce platforms.

### 3.16 CI quality gates are not all binding

Known examples from reviewed configuration include:

- Lighthouse failures swallowed by shell fallback;
- production dependency audit configured as non-blocking;
- mutation-test threshold effectively non-blocking;
- E2E not established as a reliable packaged release gate;
- encryption-related CI fallback keys that do not satisfy the documented key format.

The next session must inspect the current `main` workflows rather than assuming these exact files remain unchanged.

### 3.17 Performance is not proven on the approved floor

No current evidence proves the full packaged app, WhatsApp sidecar, background jobs, backups, teams, cloud relay, and certified data profiles meet the 4 GB/dual-core/HDD-or-SSD targets. Architecture topology remains negotiable if measurement fails.

## 4. Historical documentation problems

The repository has contained mutually inconsistent claims about:

- Supabase/Vercel versus Tauri/SQLite;
- no server versus a local server and approved cloud services;
- subscription pricing versus one-time pricing;
- 25,000 versus 35,000 DZD;
- single-user versus professional teams;
- polling-only versus hybrid synchronization;
- SQLCipher versus field encryption;
- Stronghold versus plaintext key file;
- one local trial versus online signed trial;
- shell PWA versus full operational companion;
- one storefront layout versus three AAA templates;
- Windows/version identifiers v3/v4/v4.1/v4.2 versus public SahelFlow 1.0;
- production-hardened claims versus unverified real providers, packaged tests, security review, and sellers.

No historical document should survive as current authority merely because it is detailed.

## 5. Mandatory next-session codebase read

Before architecture planning is finalized, the next session must inspect at minimum:

- complete repository tree and branches;
- package/runtime dependencies and build scripts;
- Tauri configuration and Rust code;
- process and sidecar startup/shutdown;
- Prisma schema, migrations, extensions, indexes, and transaction usage;
- all domain services and write paths;
- secrets, encryption, key storage, license, and machine identity;
- backup, restore, migration, updater, and installer;
- API routes and authorization assumptions;
- WhatsApp sidecar and media/session storage;
- AI provider calls, tools, prompts, extraction, confirmation, and UI;
- commerce and courier adapters;
- storefront routes, builder, media, checkout, and order ingress;
- PWA/service worker/mobile routes;
- analytics and large-query behavior;
- imports/exports;
- audit and automation;
- tests, fixtures, CI, Lighthouse, mutation, dependency audit, packaged E2E;
- documentation and public claims.

The result must be an evidence ledger tied to an exact commit, with `Verified`, `Implemented but unvalidated`, `Partial`, `Unsafe`, `Missing`, and `Obsolete` states.

## 6. No-current-claim rule

This document does not assert that SahelFlow is currently production-ready, secure, AAA, real-time, zero-loss, fully offline, or complete. Those are launch objectives requiring implementation and evidence.