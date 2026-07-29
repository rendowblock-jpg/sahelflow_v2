# SahelFlow — Current state

> **Authority:** merged protected `main` and named evidence only
> **Phase 0 closeout base:** `18c45e474f58744b6f837372509154ca500044b0`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Protected signed run:** `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Observed reference machine:** Founder ThinkPad T470
> **Last assessed:** 2026-07-29

This document states what merged source and named evidence prove now. It does not
convert target architecture, research, adapter presence, mocks, test counts or
planned scope into readiness. The current execution frontier belongs in
[`../operations/WORKING_MEMORY.md`](../operations/WORKING_MEMORY.md).

## Executive truth

SahelFlow is a broad, real internal Windows application. It is not an empty
prototype, generic dashboard template or desktop shell around a cloud database.
It contains substantial catalog, customer, order, delivery, returns, accounting,
inbox, automation, analytics, AI, storefront and integration behavior; per-shop
SQLite; Tauri runtime supervision; field-level PII encryption; signed updating;
and unusually strong migration/release evidence.

It is not yet a commercially complete or class-AAA SahelFlow 1.0 product.

The strongest new architecture—trusted business principals, exact shop context,
optimistic aggregate versions, encrypted idempotent command replay, atomic audit,
domain events, outbox intents, reservations, inventory movements, financial
movements, projection invalidations and compensation facts—is merged. Production
order, delivery, refund, provider, automation and most UI paths still mainly use
legacy services and fields rather than that canonical foundation.

The central completion task is therefore production adoption and removal of
competing legacy authority, not another architecture reset.

## Release and installed truth

### Internal.5

Internal.5 remains the latest Founder-accepted installed baseline. That acceptance
proved the exact historical install/update/reopen attempt only.

### Internal.11

Internal.11 exact-head and signed workflows passed selected source, Rust, Windows
runtime, installed MSI, authenticated hydrated UI, deterministic evidence and
updater-manifest gates. The Founder reported installing it through the in-app
updater and that the application opened and was usable.

Internal.11 was not accepted because first and subsequent launches remained
materially slow, and exact post-install version, AppData identity, timing and full
lifecycle evidence were not recorded.

### Internal.13

PR #174 froze executable source
`fb32faedc5ecfc1718e395824f437b805cbb9ef2`. PR #177 merged release-authority
correction `b2776bd3ea8d879a475c26af9d0c720d666671a9` after GitHub draft-release tag
semantics exposed the final publication gap.

Protected run `30366866703` passed:

- exact source and protected-main reachability;
- reviewed-tree and required-gate authority;
- signed build;
- staged packaged authenticated readiness;
- MSI and signature verification;
- installed launch and reopen;
- authenticated hydrated WebView UI twice;
- deterministic build/evidence checks;
- byte equality of retained release assets;
- exact draft target and source-bound release tag;
- automatic publication.

Internal.13 is non-draft, non-prerelease and GitHub latest. Public `latest.json`
is verified updater metadata containing the signature for the signed MSI; the JSON
document itself is not independently cryptographically signed.

The Founder reports Internal.13 installed. Desktop observation on 2026-07-29
confirmed uninstall version `1.0.0.13`, executable product version
`1.0.0-internal.13` and executable SHA-256
`30C49C3E0C38A228D8939622C4B57EC5CC7DFF346B11A642CCF131148F6643A8`.
No AppData, registry, database, migration or key deletion occurred during this
observation.

The retained identity snapshot was captured locally without publishing raw
identifiers:

| Identity/evidence | Captured result |
|---|---|
| workspace ID SHA-256 | `1DAEEBBCB6D23E142106E718D7F66B5AA03CA7B030336EB22F68C3B416282F8F` |
| installation ID SHA-256 | `A0E8D1E34B8E131A6525E2D9F4752576CFDCDA3221F7CDD31B92300895B0D2DE` |
| active shop ID SHA-256 | `37A8EEC1CE19687D132FE29051DCA629D164E2C4958BA141D5F4133A33F0688F` |
| shop-incarnation ID SHA-256 | `9F4DCA0B7DE6990F468A01D03607FB939A626E8CA2A0A79699AE42F8711FF594` |
| registry SHA-256 | `305A3922C326BB4680C34E94340A0C8F188373C70A99F3FBF6B5D9A9DA5D712E` |
| retained previous-registry SHA-256 | `1395C61C1809836F78615A5A4932D38466A761AC55E54082B396C5BEBE11A81C` |
| shop database path and SHA-256 | `shops/dev.db`; `5C0DDBE3A10A66D87D6482DE5853F71D8E2E5F044A817E542AE2377DBCCFF77C` |
| migration authority | format v2/revision 2; 9 packaged, 9 applied, 0 pending |

The first current-session launch from stopped SahelFlow processes reached the
authenticated Arabic UI-ready marker in 68.863 seconds (92.014 seconds wall
observation). Immediate reopen reached the same marker in 31.834 seconds (41.092
seconds wall). Both exceed the eight-second cold-launch product contract. The
first normal close exited the host and packaged runtime. During immediate-reopen
observation, the window closed but the host and packaged runtime remained alive
for more than 50 seconds; after the Founder closed the app, both exited and the
database hash remained unchanged.

Authenticated Arabic locale and UI-ready behavior are confirmed. Visual Arabic
chart correctness was not captured without exposing private seller data, so that
Founder observation remains open. Founder acceptance is not inferred from
installation and remains an explicit open decision.

## Current implementation shape

```text
Tauri Windows host
├── all-shop migration and authority coordinator
├── packaged Node/Next.js standalone runtime
│   ├── App Router UI and API routes
│   ├── Prisma services and one SQLite database per shop
│   ├── local PIN/session and runtime authentication
│   ├── field-level PII encryption and blind indexes
│   ├── legacy business services and provider callbacks
│   ├── additive canonical business command foundation
│   ├── local PWA shell
│   └── local storefront prototype
└── contained Bun/Baileys WhatsApp sidecar
```

The Tauri host owns migration before startup, exact runtime resources, contained
child processes, authenticated readiness, per-launch loopback credentials,
mandatory-server supervision, degradable sidecar startup, crash-loop handling and
process cleanup.

## Repository scale

The latest generated inventory reports approximately:

- 790 tracked files;
- 31 application pages;
- 118 API routes;
- 128 components;
- 40 Prisma models;
- 140 test/spec files;
- 35 provider/integration files.

These counts prove breadth, not completeness.

## Proven strengths

### Windows runtime and release

- exact-source signed updater path;
- protected automatic Internal publication;
- clean-runner staged and installed runtime proof;
- authenticated readiness and UI verification;
- process containment and crash-loop handling;
- in-place release model and deterministic evidence.

### Local data and migration

- per-shop SQLite files;
- atomic versioned registry with workspace, installation and shop-incarnation
  identity;
- fail-closed process ShopContext;
- all-shop migration preflight;
- disk-space calculation;
- verified snapshots;
- migration journal and interrupted-run recovery;
- schema fingerprint/compatibility checks.

### Canonical business foundation

- independent order, confirmation, fulfillment, delivery, inventory, COD,
  return and refund contracts;
- aggregate optimistic versions;
- exact idempotency and request binding;
- trusted principals and actor attribution;
- encrypted result/event/outbox/movement payloads;
- atomic audit, events, outbox, reservation, movement and compensation persistence;
- same-key process serialization and replay authorization.

### Security foundations

- field-level customer/order/conversation/message encryption;
- phone/name blind indexes;
- secure cookies and session revocation;
- shop-context validation before production writes;
- bearer-protected loopback sidecar;
- signed license/updater concepts and redaction helpers.

These foundations do not yet prove the complete target security, identity,
licensing, recovery or legal model.

## Source-grounded blocking discontinuities

### 1. Production business paths remain legacy

The manual order API and status route use `orderService`, whose legacy transition
path directly updates mutable order status, product stock and customer counters.
They do not yet commit through canonical commands, reservations, inventory and
financial movements, outbox and compensation.

### 2. Stock concurrency and authority

Legacy confirmation decrements product stock without the canonical availability
and reservation boundary. The code does not structurally prevent concurrent
confirmation from overcommitting the same product/variant. Canonical reservation
adoption is blocking.

### 3. Commerce checkpoint safety

Commerce sync catches individual order failures and records them in the returned
result, then still writes the provider’s next watermark. A failed order can
therefore be skipped permanently. The checkpoint must remain behind uncommitted
work or the failed event must first enter durable governed retry/dead-letter.

### 4. Automations and external effects

Automations are fire-and-forget, external effects execute directly and multi-step
execution can report overall success while individual steps failed. Durable
outbox, effect identity, receipts, partial-failure state, approval and operator
recovery remain incomplete.

### 5. Provider durability

WhatsApp chat/message operation depends substantially on in-memory sidecar state;
delivery-status persistence back to the app is best-effort. Courier, commerce and
Sheets adapters contain useful knowledge and tests but no public provider is fully
live-certified with durable ingress/effect/reconciliation proof.

### 6. Identity and commercial authority

Local PIN/session is a useful local baseline, not person/workspace/member/device
authority. Teams, permissions, invitations, devices, revocation and high-risk
approval remain incomplete.

Licensing still contains self-issued trial behavior, production Stronghold-to-
localStorage fallback, weak password derivation and a legacy status-only trust
path. It does not satisfy the signed online-trial/offline-permanent-entitlement
contract.

### 7. Backup and recovery

Local backup creation verifies SQLite integrity and hashes. Production live
restore is intentionally blocked until the native supervisor owns replacement.
All-shop encrypted recovery, independent recovery kit, replacement install,
zero-knowledge cloud retention and drills remain incomplete.

### 8. Storefront, PWA and cloud

The local storefront route has server-authoritative pricing, transactional
customer/order creation and basic abuse protection, but it is not the shared
multi-tenant durable hosted plane. Its Tauri-request detection is spoofable if
exposed without a trusted gateway.

Remote PWA, encrypted projections/commands, shared control plane, hosted releases,
zero-knowledge backup and Founder Console remain prototype, target-only or
missing.

### 9. AI approval and privacy

AI has typed tools, redaction and a structural confirmation check. Confirmation is
not yet bound to an exact persisted proposal, arguments, shop, actor, aggregate
version and expiry; a generic confirmation word can authorize the model’s current
destructive choice. Central allowlisted data policy, proposal receipts and corpus
certification remain incomplete.

### 10. Whole-product experience

The application has a coherent shell, server-derived direction, responsive
navigation, keyboard shortcuts and useful operational pages. It is not yet
whole-product AAA.

The route inventory found physical left/right geometry requiring review across
all 31 routes and Arabic chart validation across 15 chart routes. Complete
loading, empty, permission, offline, stale, conflict, recovery, accessibility,
zoom and installed evidence are inconsistent.

### 11. Performance

Clean-runner Internal.13 evidence showed large progress—roughly 10.5 seconds to
first authenticated UI readiness and roughly 3.1 seconds on the second launch,
with runtime preparation around tens of milliseconds—but runner timing is not
T470 proof. The first clean-runner launch also remains above the eight-second
T470 target.

## Capability status

| Area | Current status | Principal closure |
|---|---|---|
| Signed Windows runtime/update | Strong internal proof | Founder Internal.13 install, T470 lifecycle/performance, wider compatibility |
| Local database/migrations | Strong partial | full restore/replacement drills and every prior-version matrix |
| Workspace/shop authority | Partial foundation | production native create/switch/archive/recover/delete and membership/device authority |
| Local PIN/session | Implemented baseline | person/member/device identity and fail-closed recovery |
| Teams and permissions | Missing/fragmentary | complete identity, roles, fields, assignments, approval and revocation |
| Licensing/entitlements | Unsafe partial | online signed trial, offline permanent issuance, protected storage, transfer/recovery |
| Catalog/customers/risk | Broad partial | canonical authority, duplicate/permission/data-rights and scale proof |
| Orders/confirmation | Partial foundation | production command/reservation adoption and Golden COD proof |
| Inventory | Partial foundation | availability, reservation, movement and reconciliation across every journey |
| Delivery/couriers | Partial/unverified | durable provider protocol, exceptions, reconciliation and live certification |
| Returns/refunds | Partial foundation | canonical compensation and end-to-end money/stock proof |
| COD/accounting | Partial foundation | receivable/remittance/fee/discrepancy ledger adoption |
| Audit/outbox | Strong foundation | production adoption and durable effect workers |
| Imports/exports | Implemented/partial | preview, mapping, resumability and scale consistency |
| Backup/recovery | Partial/unsafe | native all-shop encrypted restore and recovery ceremonies |
| WhatsApp/inbox | Partial/unverified | durable encrypted messages/effects, replay and certification |
| Automations | Partial/unsafe | durable executions, exact effects, receipts, approvals and dead letter |
| AI/extraction | Partial/unsafe | central data policy, proposal-bound approval, corpus and receipts |
| Analytics | Partial/unverified | governed financial semantics, scale and complete states |
| Hosted storefront | Prototype boundary | shared releases, durable receipt, allocation and reconciliation |
| Remote PWA | Prototype boundary | identity, encrypted projections/commands, offline/conflict/revocation |
| Shared cloud | Missing | measured isolated control/relay/storefront/backup planes |
| Founder Console | Missing | bounded strongly authenticated audited control operations |
| Localization/RTL | Partial foundation | route-level copy, geometry, charts, focus and native review |
| Accessibility | Partial/unverified | journey-level WCAG, keyboard, screen reader and zoom proof |
| AAA frontend | Broad partial | research-backed navigation/design system and every page-completion gate |
| Low-end performance | Unproven/unmet on Founder history | Internal.13 T470 measurement, representative data and eight-hour stability |
| Security/privacy/legal | Partial/unverified | threat models, key/recovery, tenant boundaries, Law 18-07 and independent review |
| Public Stable | Not ready | all Required implementation plus external evidence and Founder promotion |

## Keep and harden

- Tauri Windows host and contained packaged runtime.
- Per-shop Prisma/SQLite authority.
- All-shop migration coordinator.
- Canonical command, event, outbox, reservation, movement and compensation layer.
- Field-level PII encryption and blind indexes.
- Shared multilingual/RTL component foundations.
- Existing useful seller pages and provider knowledge that survive target
  invariants.
- Exact-source updater and evidence infrastructure.

## Migrate or replace

- direct order/status/stock/COD mutation → canonical independent lifecycle and
  movement commands;
- mutable active-shop assumptions → complete trusted identity/shop authority;
- best-effort audit/effects → atomic command plus durable workers/receipts;
- local PIN identity → unlock plus person/workspace/member/device;
- self-issued/local trial → online trial-only signing and offline permanent
  entitlement;
- direct provider mutation/checkpoints → durable inbox/outbox/reconciliation;
- in-memory WhatsApp operation → durable encrypted message/effect authority;
- local storefront submit → hosted durable receipt and canonical import;
- local-server PWA → authenticated encrypted remote projections/commands;
- byte-copy backup → verified encrypted all-shop recovery;
- fragmented page-local UI → research-backed coherent AAA system.

## Current exact boundary

Phase 0 completed through PR #179 at protected main
`18c45e474f58744b6f837372509154ca500044b0`; exact-head CI run `30430538958`
passed. Phase 1 research is complete on issue #164 and implementation is ready.
The first production vertical is:

> Manual order intake and confirmation under trusted authority, exact idempotency
> and optimistic versioning, with atomic stock availability/reservation,
> inventory movement, audit, event, outbox and projection invalidation; complete
> AR/FR/EN UI states; duplicate/concurrency/interruption/recovery proof; and removal
> of the migrated direct-stock legacy path.

The remaining Internal.13 Arabic-chart and Founder-acceptance observations stay
independent in the platform lane.
