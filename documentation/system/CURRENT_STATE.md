# SahelFlow — Current state

> **Authority:** merged protected source and named evidence only
> **Live protected main:** `8ebf78ddbbfcbdc5a61c607b591dc9d3beb4a59f`
> **Latest application-changing protected merge:** PR #207 at `8ebf78ddbbfcbdc5a61c607b591dc9d3beb4a59f`
> **Latest protected authority merge:** PR #207 at `8ebf78ddbbfcbdc5a61c607b591dc9d3beb4a59f`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Protected signed run:** `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Observed reference machine:** Founder ThinkPad T470
> **Phase 4 status:** Protected-source closed through PR #207 under the explicit Founder-directed closure exception
> **Active product phase:** Phase 5 — whole-product AAA UI/UX
> **Active Phase 5 package:** not yet opened; begin from protected `main`
> **Retained installed evidence:** issues #201 and #214
> **Execution epic:** issue #164
> **Last assessed:** 2026-08-07

This document states merged protected truth and named evidence. It does not convert
protected-source closure into a release, Founder acceptance, Beta, Stable or
certification claim. Re-fetch GitHub before relying on any active branch or PR SHA.

## Executive truth

SahelFlow is a broad real internal Windows application, not an empty prototype or
generic dashboard shell. It is not yet a commercially complete or class-AAA
SahelFlow 1.0 product.

Protected `main` now includes the canonical Golden COD foundation; durable
identity, Teams, permissions and licensing; Tauri-owned native multi-shop
lifecycle; durable provider ingress/effects; database-authoritative inbox;
truthful automations; proposal-bound sensitive AI actions; durable commerce; one
canonical courier facade; and the complete Phase 4 protected-data, encrypted
backup, recovery, migration, privacy and security source authority merged through
PR #207.

Phase 4 is closed at the protected-source program layer. One installed
replacement-install recovery proof remains explicitly unproven and is retained in
issue #214. That retained evidence does not reopen Phase 4 and does not block
starting Phase 5, but it still blocks any claim that replacement-install recovery
is installed/certified and remains required before Stable if still applicable.

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
retains its installed-evidence/waiver cleanup boundary without reopening native
lifecycle authority.

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
certification to Phase 9 representative beta.

### Phase 4 contract freeze — PR #206

PR #206 merged at `9306564ce5b5ea4b3b13b219aa45d4672ae13184`.
It protected the exhaustive audit, P4-001 through P4-013 Problem Register, frozen
key/backup/recovery/migration/evidence contracts and CI consequence mapping.

### Phase 4 protected-source closure — PR #207

PR #207 merged by squash at
`8ebf78ddbbfcbdc5a61c607b591dc9d3beb4a59f` from closure head
`a06dc8837a7a4f0e44bf2451d416d62104df8918`.

The product head immediately before the closure-control commits was
`ccba7ec138b6aa1a77bf9d972bb1127a3270267d`. On that product head:

- source quality, documentation audit, coverage and dependency audit were green;
- Tauri release smoke was green;
- Windows standalone runtime proof was green;
- Windows Rust parity was green;
- the exact MSI built, installed, launched, closed and reopened;
- authenticated hydrated WebView UI proof passed twice.

The remaining installed job failure occurred before the replacement
backup/corrupt/replace/restore sequence: CI trial activation returned HTTP 503
with `LICENSE_TRIAL_SERVICE_UNAVAILABLE`.

The Founder explicitly directed Phase 4 to close rather than remain indefinitely
blocked on that evidence harness. PR #207 therefore carries a one-PR,
diff-scoped closure marker at
`.github/phase-exceptions/pr-207-phase4-closure-override.md`. The marker skipped
heavy lanes only for the closure-control commit; fast version/documentation
authority still passed. Future PRs do not inherit the bypass because the marker is
already in their base unless deliberately modified again.

The unresolved installed replacement-install proof is retained in issue #214.
This closure decision does **not** claim that replacement-install recovery passed
installed certification.

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

## Phase 4 protected capabilities

### Protected data and migration

- HKDF-SHA-256 versioned purpose-separated installation keys;
- random persisted per-shop data, blind-index and secret authorities;
- contextual versioned AES-256-GCM envelopes and explicit corruption;
- authoritative protected Prisma reads/writes, nested relations, bulk/upsert
  boundaries and purpose-separated exact searches;
- guarded raw Prisma access, installation-root re-wrap and restart-safe
  all-registered-shop protected-data migration.

### Encrypted all-shop backup and independent recovery

- native SQLite Online Backup snapshots for every registered shop;
- immutable encrypted descriptor, manifest and ordered object set;
- per-license BRK and fresh random DEK per backup;
- exact workspace/install/shop/incarnation and migration bindings;
- independent recovery kit, one-time recovery code, persisted round-trip proof,
  verified listing and governed deletion receipt.

### Replacement restore and migration convergence

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

### Privacy, security and evidence authority

- machine-readable classification for Prisma models, protected fields and
  installation-level file stores;
- dependency-ordered export/reset/erase lifecycle, session revocation and governed
  native shop deletion;
- Algeria Law 18-07 / Law 25-11 engineering mapping with qualified legal-review
  boundary;
- threat model, security/privacy review protocol and Level 1/2/3 evidence matrix;
- npm/Cargo CycloneDX SBOM, checked-in VEX triage authority and deterministic
  evidence manifest;
- executable closure verifier guarding unclassified models/stores, legacy backup
  paths, incomplete erase authority and missing security evidence.

## Retained post-Phase 4 evidence

### Issue #214 — installed replacement-install recovery proof

Required follow-up:

- repair the disposable CI trial-service activation path without weakening
  production licensing;
- run installed backup → corruption/replacement → restore → rollback on an exact
  executable head;
- retain recovery receipts and failure diagnostics;
- retire the PR #207 closure override mechanism when appropriate.

This is release/certification evidence, not a Phase 5 blocker.

### Issue #201 — installed WebView evidence/waiver cleanup

The installed MSI and authenticated WebView path have materially improved and the
PR #207 product head passed hydrated WebView UI proof twice. Issue #201 remains
open only until its retained cleanup/waiver obligations are explicitly reconciled.
It does not reopen Phase 2 or block Phase 5.

## Active Phase 5 frontier

Phase 5 may now begin from protected `main` at
`8ebf78ddbbfcbdc5a61c607b591dc9d3beb4a59f`.

Its objective is whole-product AAA UI/UX: one coherent design system,
information architecture, navigation, dense operational surfaces, complete
happy/loading/empty/validation/permission/offline/pending/stale/conflict/error/
retry/recovery/history states, real authority on every Required page and
route-by-route visual regression with Founder visual acceptance.

No Phase 5 implementation package is opened by this documentation update.

## Release and installed truth

Internal.13 remains the latest published and Founder-installed release. It
predates the protected Phase 1–4 source packages and cannot prove current merged
behavior. Recorded T470 launches remain beyond the eight-second target. Founder
acceptance remains open.

Phase 4 protected-source closure does not authorize a version bump, release
publication, Founder acceptance, Beta, Stable, legal certification, penetration
test claim or installed replacement-recovery certification.
