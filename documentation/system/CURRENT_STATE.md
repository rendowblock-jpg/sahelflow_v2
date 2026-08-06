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
> **Active phase package:** issue #204 through PR #207 — complete P4-A…P4-F implementation candidate awaiting exact-head review and validation
> **Retained installed evidence:** issue #201
> **Execution epic:** issue #164
> **Last assessed:** 2026-08-06

This document states merged protected truth and the exact unmerged implementation
frontier without converting either into a release or phase-closure claim. Re-fetch
GitHub before relying on any active PR SHA.

## Executive truth

SahelFlow is a broad real internal Windows application, not an empty prototype or
generic dashboard shell. It is not yet a commercially complete or class-AAA
SahelFlow 1.0 product.

Protected main includes the canonical Golden COD foundation; durable identity,
Teams, permissions and licensing; Tauri-owned native multi-shop lifecycle;
durable provider ingress/effects; database-authoritative inbox; truthful
automations; proposal-bound sensitive AI actions; durable commerce; and one
canonical courier facade.

Protected PR #206 froze Phase 4 contracts and consequence-based CI lanes. PR #207
is the only active production package. Its branch now carries the complete Phase 4
source candidate, but that candidate is not protected or phase-closed until the
exact final head passes the selected source, Rust, Windows, installed-MSI and
review-conversation gates.

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

Protected-source outcomes include authenticated persistence-before-acknowledgement,
durable WhatsApp ingress/effects, database-authoritative inbox, truthful
automations, proposal-bound sensitive AI actions, one canonical courier facade,
durable commerce run/page/item/attempt truth and fail-closed provider capability
authority.

Issue #202 is closed. No known Phase 3 P0/P1 remains. FD-030 defers real-provider
certification to Phase 9 representative beta and retains issue #201 at the
applicable Level 3/installed evidence gate.

### Phase 4 contract freeze and risk lanes — PR #206

PR #206 merged at `9306564ce5b5ea4b3b13b219aa45d4672ae13184`.
It protected the exhaustive audit, P4-001 through P4-013 Problem Register, frozen
key/backup/recovery/migration/evidence contracts and CI consequence mapping.
Crypto, migration, storage, backup/restore and secret-store changes select Windows
packaged-runtime and installed-MSI evidence; native authority changes also select
Rust parity where applicable.

## Current implementation shape

```text
Tauri Windows host
├── DPAPI installation KEK / purpose-separated key derivation
├── versioned workspace/shop registry and native lifecycle journal
├── authenticated all-shop migration and replacement-restore convergence
├── encrypted all-shop backup, BRK/DEK authority and independent recovery kit
├── localhost-only replay-protected survivability command bridge
├── exact runtime containment, readiness and shutdown
├── packaged Node/Next.js standalone runtime
│   ├── App Router UI and API routes
│   ├── Prisma and one SQLite database per shop
│   ├── contextual protected-value and blind-index authority
│   ├── governed export/reset/erase/shop-delete lifecycle
│   ├── identity, permissions and licensing authority
│   ├── canonical business commands, events and durable effects
│   ├── database-authoritative inbox, automations, AI and commerce
│   └── local PWA/storefront foundations
└── contained Bun/Baileys WhatsApp sidecar
```

The Node process is bound to one immutable exact `ShopContext`. Shop switching
remains a native lifecycle operation.

## Active Phase 4 frontier — PR #207

The unmerged branch now implements all authorized packages as one dependency-correct
candidate:

### P4-A / P4-B — protected data and migration

- HKDF-SHA-256 versioned purpose-separated installation keys;
- random persisted per-shop data, blind-index and secret authorities;
- contextual versioned AES-256-GCM envelopes and explicit corruption;
- authoritative protected Prisma reads/writes, nested relations, bulk/upsert
  boundaries and purpose-separated exact searches;
- guarded raw Prisma access, installation-root re-wrap and restart-safe
  all-registered-shop protected-data migration.

### P4-C — encrypted all-shop backup and independent recovery

- native SQLite Online Backup snapshots for every registered shop;
- immutable encrypted descriptor, manifest and ordered object set;
- per-license BRK and fresh random DEK per backup;
- exact workspace/install/shop/incarnation and migration bindings;
- independent recovery kit, one-time recovery code, persisted round-trip proof,
  verified listing and governed deletion receipt.

### P4-D / P4-E — replacement restore and migration convergence

- full verification before live mutation, all-shop staging, rescue generation,
  authenticated applying journal, post-apply proof and compensation;
- local replacement installation identity preserved while imported shop keys are
  re-wrapped and source sessions/auth secret are removed;
- wrong kit, corrupt/missing object, unsupported schema, low disk and interrupted
  cutover fail closed;
- bounded localhost bridge with authenticated handshake, exact action/resource
  binding, short-lived single-use tokens and durable replay protection;
- pending restore converges before Node, Prisma or WebView exposure and proves the
  previous packaged runtime stopped before mutation.

### P4-F — privacy, security and release authority

- machine-readable classification for every Prisma model, protected field and
  installation-level file store;
- one complete dependency-ordered export/reset/erase lifecycle, active-session
  revocation and reuse of governed native shop deletion;
- amended Algeria Law 18-07 / Law 25-11 engineering mapping with qualified legal
  review boundary;
- threat model, independent-review protocol and Level 1/2/3 evidence matrix;
- resolved npm/Cargo CycloneDX SBOM, checked-in VEX triage authority and
  deterministic evidence manifest retained through the repository inventory;
- executable closure verifier that blocks new unclassified models/stores, legacy
  backup paths, incomplete erase authority or missing security evidence.

### Installed runtime diagnosis and repair — PR #207

The missing installed UI beacon was one narrow application regression, not a
general WebView2, Windows profile or data-architecture failure. PR #195 changed
the configured-session root redirect to a relative `Location: /login`; Next.js 16
rejects that packaged proxy response as an invalid URL, so authenticated root
navigation returned HTTP 500 before React or the UI-ready beacon could run.

PR #207 commit `80f03768d5c45c9df24412ce750e766ad9dcb13f` restores a
request-derived absolute same-origin 307 redirect and removes the speculative
renderer-prime workaround. Manual Windows run `31126124211` then proved the MSI
build, installed launch/reopen and three authenticated hydrated WebView launches
on the exact repair. The replacement drill's later HTTP 401 was independently
identified as stale evidence-harness authentication: production correctly
required the per-launch HttpOnly runtime cookie.

The replacement harness now obtains that existing cookie through a temporary,
ephemeral-runner-only WebView2 debugging boundary without changing production
authentication or writing the bearer to evidence. Exact final replacement proof
must still be read from the current PR #207 run before Phase 4 closure.

## Remaining before Phase 4 can close

1. finish the exact-head source/quality gate after GitHub Actions service recovers;
2. request separated exact-head security/privacy review and leave no unresolved
   P0/P1 conversation;
3. read the current PR #207 installed run and retain its exact replacement-install
   result alongside the already-green launch/reopen and hydrated-WebView evidence;
4. merge with expected-head binding, verify protected main, then reconcile issues
   #201 and #204 only if every applicable exit condition is actually satisfied.

## Release and installed truth

Internal.13 remains the latest published and Founder-installed release. It predates
the protected Phase 1–4 source packages and cannot prove current merged behavior.
Recorded T470 launches remain beyond the eight-second target. Founder acceptance
remains open.

No active Phase 4 source package authorizes a version bump, release publication,
Founder acceptance, Beta, Stable, legal-certification or penetration-test claim.
