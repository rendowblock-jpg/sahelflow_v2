# SahelFlow — Current state

> **Authority:** merged protected source and named evidence only
> **Live protected main:** `9306564ce5b5ea4b3b13b219aa45d4672ae13184`
> **Latest application-changing protected merge:** PR #203 at `aa4ca0758fd696f4b02fc1975629ac698f9349c3`
> **Latest protected authority merge:** PR #206 at `9306564ce5b5ea4b3b13b219aa45d4672ae13184`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Protected signed run:** `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Observed reference machine:** Founder ThinkPad T470
> **Active product phase:** Phase 4 — data protection, recovery, migrations and security
> **Active phase package:** issue #204 through PR #207 — bounded P4-A/P4-B protected-data authority and migration
> **Retained installed evidence:** issue #201
> **Execution epic:** issue #164
> **Last assessed:** 2026-08-04

This document states what merged protected source and named evidence prove now.
The exact live execution frontier belongs in
[`../operations/WORKING_MEMORY.md`](../operations/WORKING_MEMORY.md).

## Executive truth

SahelFlow is a broad real internal Windows application, not an empty prototype or
generic dashboard shell. It is not yet a commercially complete or class-AAA
SahelFlow 1.0 product.

Protected source includes the canonical Golden COD foundation; durable identity,
Teams, permissions and licensing; Tauri-owned native multi-shop lifecycle;
durable provider ingress/effects; database-authoritative inbox; truthful
automations; proposal-bound sensitive AI actions; durable commerce; and one
canonical courier facade.

Protected PR #206 froze Phase 4 contracts and consequence-based CI lanes. PR #207
is the only active production package and remains unmerged until exact-head source,
Windows runtime, installed-MSI and review-conversation gates pass.

## Latest protected source closures

### Phase 1 and durable identity — PR #195

PR #195 merged at `a3d53cdd21afa8f4d03eefa7088304a9f728e2a0`.
Protected source includes trusted manual order intake, canonical confirmation and
rejection, stock reservation and fulfillment, shipment/delivery/COD facts,
settlement, return/refund/compensation boundaries, durable identity, Teams,
permissions, exact shop grants and revocation.

### Signed licensing — PR #197

PR #197 merged at `04d4c51831c6e043ab39a614a7e947e6b27d01e6`.
Protected source includes machine-bound signed trial/permanent claims, protected
clock/recovery floors, transfer/recovery/revocation ceremonies and data-preserving
lockout.

### Single-agent AAA governance — PR #199

PR #199 merged at `991c61ac882497fdda01af3ac04f06978146bbda`.
It established one active agent, audit-first execution, one Problem Register,
coherent batch remediation and Level 1/2/3 validation.

### Native multi-shop — PR #200

PR #200 merged at `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`.
The Tauri host is protected source authority for create, rename, switch, archive,
recover and delete through one exact-identity journaled lifecycle. Issue #201
retains the installed hydrated-WebView evidence limitation without reopening
native lifecycle authority.

### Phase 3 protected-source closure — PR #203

PR #203 merged at `aa4ca0758fd696f4b02fc1975629ac698f9349c3`
from validated head `f0db4116874238d0c415b4725cd2c5f3ef6201da`.
Final required CI run `30901725446` passed version/documentation authority,
frozen install, Prisma generation and migration status, TypeScript, ESLint, the
complete Vitest suite, 80%+ coverage and a zero-vulnerability production
dependency audit.

Protected-source outcomes include:

- authenticated persistence-before-acknowledgement and durable WhatsApp ingress;
- database-authoritative inbox, exact identities, leases, immutable attempts and recovery;
- truthful durable automations and receipt-safe external effects;
- immutable proposal/approval/execution binding for sensitive AI actions;
- one canonical courier facade and internal durable effect/tracking runtime;
- durable commerce run/page/item/attempt truth, opaque continuation, bounded
  yields, monotonic watermarks and audited recovery;
- deterministic provider conformance and fail-closed unverified capabilities.

Issue #202 is closed. No known Phase 3 P0/P1 remains. FD-030 defers real-provider
certification to Phase 9 representative beta and retains issue #201 at the
applicable Level 3/installed evidence gate.

### Phase 4 contract freeze and risk lanes — PR #206

PR #206 merged at `9306564ce5b5ea4b3b13b219aa45d4672ae13184`.
It protected the exhaustive audit, P4-001 through P4-013 Problem Register, frozen
key/backup/recovery/migration/evidence contracts and CI consequence mapping.
Crypto, migration, storage, backup/restore and secret-store changes now select
Windows packaged-runtime and installed-MSI evidence; native authority changes also
select Rust parity where applicable.

## Current implementation shape

```text
Tauri Windows host
├── installation root, licensing, device and clock authority
├── versioned workspace/shop registry and native lifecycle journal
├── all-shop migration and recovery coordinator
├── exact runtime containment, readiness and shutdown
├── packaged Node/Next.js standalone runtime
│   ├── App Router UI and API routes
│   ├── Prisma and one SQLite database per shop
│   ├── identity, permissions and licensing authority
│   ├── canonical business commands, events and durable effects
│   ├── database-authoritative inbox, automations, AI and commerce
│   └── local PWA/storefront foundations
└── contained Bun/Baileys WhatsApp sidecar
```

The Node process is bound to one immutable exact `ShopContext`. Shop switching
remains a native lifecycle operation.

## Active Phase 4 frontier

Issue #204 owns the active phase. PR #207 is the only active implementation PR.
It delivers the first dependency-correct P4-A/P4-B package:

- HKDF-SHA-256 versioned purpose-separated installation wrapping/integrity keys;
- random persisted per-shop data, blind-index and secret authorities;
- strict contextual versioned AES-256-GCM protected-value envelopes;
- explicit corruption for malformed, wrong-key, wrong-purpose, wrong-context and
  authentication failures;
- canonical protected reads/writes, nested relation decryption, exact projections
  and blind-index searches for Customer, Order, Conversation and Message;
- separated secret-store and business-truth envelope authority;
- guarded raw Prisma access and one canonical contextual client;
- installation-root re-wrap without rewriting seller ciphertext;
- exclusive, idempotent, restart-safe all-registered-shop protected-data migration;
- exact-record race-safe protected upserts;
- process-memory-only sharing of the one-use native installation root across
  duplicated standalone server chunks.

PR #207 does not implement all-shop encrypted backup, independent recovery kit,
replacement-install restore/cutover, complete privacy/destructive lifecycle,
Phase 4 closure, release, Founder acceptance, Beta or Stable.

## Remaining Phase 4 dependency order

After PR #207 is protected and issue #204 is reconciled:

1. P4-C: native SQLite online all-shop encrypted backup, immutable container,
   authenticated manifest, independent recovery kit and retention/pinning;
2. P4-D: replacement-install staged restore, authorization, rescue, key re-wrap,
   identity re-enrollment, all-shop cutover, compensation and recovery UX;
3. P4-E: general authenticated migration journal and complete clean/mixed/
   interrupted/low-disk/corrupt matrices;
4. P4-F: erase/reset/export/retention governance, SBOM/VEX, threat model,
   Law 18-07 mapping, independent reviews and Level 3 closure evidence.

## Release and installed truth

Internal.13 remains the latest published and Founder-installed release. It predates
the protected Phase 1–4 source packages and cannot prove current merged behavior.
Recorded T470 launches remain beyond the eight-second target. Founder acceptance
remains open.

No active Phase 4 source package authorizes a version bump, release publication,
Founder acceptance, Beta or Stable claim.
