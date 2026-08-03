# SahelFlow — Current state

> **Authority:** merged protected source and named evidence only
> **Live protected main:** `991c61ac882497fdda01af3ac04f06978146bbda`
> **Latest application-changing protected merge:** `04d4c51831c6e043ab39a614a7e947e6b27d01e6`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Protected signed run:** `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Observed reference machine:** Founder ThinkPad T470
> **Active product phase:** Phase 2 — identity, authorization, licensing and multi-shop
> **Active proposed package:** PR #200 — native multi-shop authority
> **Last assessed:** 2026-08-02

This document states what merged source and named evidence prove now. Proposed PR
#200 source is identified separately and does not become merged, installed or
phase-closed truth merely because it exists. The exact execution frontier belongs
in [`../operations/WORKING_MEMORY.md`](../operations/WORKING_MEMORY.md).

## Executive truth

SahelFlow is a broad, real internal Windows application. It is not an empty
prototype, generic dashboard template or desktop shell around a cloud database.
It contains substantial catalog, customer, order, delivery, return, accounting,
inbox, automation, analytics, AI, storefront and integration behavior; per-shop
SQLite; Tauri runtime supervision; field-level PII encryption; signed updating;
and strong migration/release infrastructure.

It is not yet a commercially complete or class-AAA SahelFlow 1.0 product.

Its strongest protected architecture includes:

- trusted person/member/device/session and exact-shop authority;
- optimistic aggregate versions;
- encrypted request-bound idempotent command replay;
- atomic audit, domain events and outbox intents;
- inventory reservations and movements;
- financial movements and compensation facts;
- projection invalidation;
- durable Teams/permissions authority;
- signed installation-level licensing authority;
- native process containment, exact startup authority and all-shop migration
  recovery.

The central completion task is production adoption and removal of competing legacy
authority, followed by complete recovery, provider, UI, accessibility,
performance, connected-platform and certification evidence. Another broad
architecture reset is not required.

## Latest protected source closures

### Phase 1 plus identity/Teams — PR #195

PR #195 merged at `a3d53cdd21afa8f4d03eefa7088304a9f728e2a0`.
Its exact implementation head
`ddec67a36b8000be91562b33a2bd4d6aceb5e443` passed CI `30734100436`, including
authority/docs, Prisma generation and migration status, TypeScript, ESLint,
unit/integration, database, coverage, dependency audit and the Required PR gate.

Protected-source outcomes include:

- trusted manual order intake and confirmation/rejection;
- stock reservation, packing, shipment, delivery and COD receivable creation;
- canonical settlement, return/refund/compensation boundaries and shared replay
  repairs included in the integration package;
- durable Workspace, Installation, Person, Member, Device and session authority;
- invitations, roles, custom permissions, exact shop grants and revocation;
- workgroups, queues, assignments, comments, mentions and handovers;
- protected-field projections and AR/FR/EN seller states.

Separated sole-agent review repaired concrete replay, route-ordering,
authorization, protected-field, risk/oracle, high-risk ceremony, handover and
stale/revoked UI findings. The pass was not independent review.

### Signed licensing — PR #197

PR #197 merged at
`04d4c51831c6e043ab39a614a7e947e6b27d01e6`. Exact implementation head
`25abbedd176429cf25e657217726d833e3c62a10` passed CI `30744598944`, including
authority/docs, TypeScript, ESLint, complete Vitest, Prisma, coverage, dependency
audit, migration status and the Required PR gate. Every review thread was
resolved.

Protected-source licensing now includes:

- native opaque Windows device binding;
- separate online-trial and offline-permanent Ed25519 authorities;
- one canonical trial record per device binding and reinstall reissue;
- atomic installation-root-authenticated local authority;
- DPAPI/HKCU protected clock, revocation and recovery floors;
- periodic native clock advancement during runtime;
- signed transfer, revocation and recovery ceremonies;
- complete data-preserving lockout across server-rendered pages, APIs and provider
  workers;
- exact recovery/login licensing allowlist;
- AR/FR/EN activation and recovery states;
- release-build failure when service URL or public keyrings are absent.

This is source closure. It does not prove a current Windows release artifact,
signed MSI, installed expiry/activation/recovery or preserved-data lifecycle.
Those remain at Phase 2 exit.

### Single-agent AAA governance — PR #199

PR #199 merged at `991c61ac882497fdda01af3ac04f06978146bbda`.
Exact head `58f12a24bfce1654e8894ede62880c2458a6808f` passed CI
`30750832310`, including authority/version, documentation audit, TypeScript,
ESLint, complete Vitest, Prisma generation/deploy/status, coverage, production
dependency audit, repository inventory and the Required PR gate.

The merge established one active agent, complete reconnaissance, one consolidated
Problem Register, coherent batch remediation, Level 1/2/3 validation and
whole-product AAA frontend governance. It changed no product runtime behavior,
schema, version, release, AppData, registry, database or installed evidence.

## Active proposed source — PR #200

The Founder selected the ChatGPT Web Agentic Coding Agent as the sole active
implementation agent. PR #200 is open as a draft from exact protected base
`991c61ac882497fdda01af3ac04f06978146bbda`.

Current proposed changes:

- reconcile the execution entry points to live PR #200 truth;
- record complete native multi-shop reconnaissance, primary-source research,
  consolidated Problem Register, task sequence and evidence boundaries;
- add a pure Rust native lifecycle contract with typed operations, exact authority
  inputs, signed slot limits, destructive reauthentication requirements, explicit
  stages, compensation states and focused tests.

PR #200 currently does **not** mutate the shop registry, any database, process
runtime, AppData, key, version or release. It is proposed source only. Task 1 must
pass its source/Rust gate before registry mutation begins.

## Release and installed truth

### Internal.5

Internal.5 remains the latest explicit Founder-accepted installed baseline. That
acceptance proves only the exact historical artifact and observation.

### Internal.13

Internal.13 is the latest published release. Protected run `30366866703` proved,
for its exact historical source:

- source and reviewed-tree binding;
- signed build;
- staged packaged authenticated readiness;
- MSI and signature verification;
- installed launch and reopen;
- authenticated hydrated WebView UI;
- deterministic evidence;
- retained asset equality;
- release tag and automatic publication.

The Founder reports Internal.13 installed. Desktop observation confirmed uninstall
version `1.0.0.13`, executable product version `1.0.0-internal.13` and executable
SHA-256
`30C49C3E0C38A228D8939622C4B57EC5CC7DFF346B11A642CCF131148F6643A8`.
No AppData, registry, database, migration or key deletion occurred during that
observation.

The first observed current-session launch reached authenticated Arabic UI-ready in
68.863 seconds (92.014 seconds wall). Immediate reopen reached the same marker in
31.834 seconds (41.092 seconds wall). Both exceed the eight-second T470 target.
One reopen observation left host/runtime processes alive for more than 50 seconds
before later exit. Arabic chart visual correctness and explicit Founder acceptance
remain open.

Internal.13 predates the protected Phase 1/Teams/licensing source closures. It
cannot prove current Phase 2 behavior.

## Current implementation shape

```text
Tauri Windows host
├── protected installation root and commercial clock/device authority
├── versioned shop registry and all-shop migration/recovery coordinator
├── runtime-generation, containment, authenticated readiness and shutdown
├── packaged Node/Next.js standalone runtime
│   ├── App Router UI and API routes
│   ├── Prisma services and one SQLite database per shop
│   ├── durable identity, permissions and signed licensing source
│   ├── canonical business command foundation
│   ├── temporary/legacy shop lifecycle and business services
│   ├── local PWA shell
│   └── local storefront prototype
└── contained Bun/Baileys WhatsApp sidecar
```

The host owns migration before startup, contained runtime resources,
authenticated readiness, per-launch loopback credentials, process supervision,
crash-loop handling and cleanup.

The Node process is intentionally bound to one immutable exact `ShopContext`.
Changing shop authority requires native runtime transition; it cannot be performed
safely by changing Zustand state or selecting another Prisma client underneath
in-flight work.

## Exact-head inventory

The repository inventory produced on the signed-licensing head reported:

- 1,026 tracked files;
- 32 pages/routes;
- 152 API routes;
- 145 components;
- 65 Prisma models;
- 18 migration files;
- 234 test/spec files;
- 35 provider/integration files;
- 27 sidecar/desktop resources;
- 12 Playwright E2E scenarios.

All 32 routes were flagged for physical-geometry/logical RTL review. Fourteen
chart routes were flagged for Arabic chart-geometry review. These counts prove
breadth and risk surface, not completeness.

## Proven strengths

### Business command kernel

The canonical kernel provides:

- trusted person and exact shop derivation;
- canonical request hashes;
- request-bound idempotency and encrypted committed-result replay;
- optimistic aggregate versions;
- one database transaction;
- audit, events and outbox intents;
- reservations and inventory movements;
- financial movements;
- compensation facts;
- projection invalidations.

This is a strong foundation for operational truth.

### Identity and authorization

Merged source provides installation-owned Workspace, Installation, Person,
WorkspaceMember, Device and session bindings, exact shop grants, role-bounded
custom policies, invitations, revocation, policy freshness, reauthentication and
Teams/collaboration authority. Mutable browser state is not identity authority.

### Native registry, migrations and process authority

Merged Rust source already provides:

- workspace, installation, shop-incarnation and registry-revision validation;
- exact contained database-file identity and anti-aliasing checks;
- migration-set hashing and compatibility reports;
- all-shop preflight, verified snapshots, interruption recovery and compensation;
- runtime generations, process containment, safe mode, readiness and cleanup;
- exact authority transport to the Node process.

Native multi-shop should compose these primitives, not replace them.

### Security and crypto

- AES-256-GCM field encryption and HMAC blind indexes;
- native DPAPI path for production installation keys;
- signed licensing and updater concepts;
- authenticated loopback/sidecar boundaries;
- exact protected-field projections and deny-before-query repairs.

These foundations do not replace complete threat modeling, independent review,
privacy/legal mapping or installed attack-path evidence.

### Windows/release engineering

The release workflow binds exact protected source, required checks, clean source,
frozen dependencies, signed MSI, staged/installed runtime, authenticated UI,
updater signature and evidence artifacts. It is unusually rigorous for an
internal product.

### Backup creation

Local backup creation performs WAL checkpoint where applicable, staged copy,
SQLite integrity/foreign-key checks, hash, installation/shop/schema-bound manifest
and atomic manifest write.

Production restore remains intentionally unavailable until the native supervisor
owns it.

## Blocking discontinuities

### 1. Native multi-shop is incomplete

Licensing and durable membership exist, but production create, rename, switch,
archive, recover and delete are not yet owned and proven by the native supervisor
with exact registry, license-slot, membership, process-relaunch and preservation
authority.

Temporary TypeScript functions explicitly block production create, switch, delete
and restore with `*_SUPERVISOR_REQUIRED`. This is correct containment, not feature
completion.

The current browser flow also contains a direct API-plus-generic-relaunch pattern,
and its delete caller omits the API's required typed confirmation. PR #200 must
replace the temporary flow rather than patching it into authority.

This is the final Phase 2 implementation outcome.

### 2. Canonical and legacy business authority coexist

Trusted manual order paths use the canonical architecture. Other intake sources,
delivery exceptions, provider callbacks, some COD/return/refund paths,
automations and connected paths still rely substantially on legacy services or
fields.

The strongest architecture does not protect a journey that bypasses it. Each
phase must migrate callers, prove parity/recovery and remove or make the old write
path read-only.

### 3. Provider durability is inconsistent

The durable WhatsApp and courier patterns include encrypted payloads, outbox
leases, retries, receipts, ambiguity and dead letter. Adoption is incomplete:
legacy and automation paths can still execute effects differently, and no public
provider is fully live-certified across authentication, duplicate, timeout,
reconciliation, degraded UI and recovery.

### 4. Automations are not production-safe for destructive work

The current automation engine is fire-and-forget in important paths. Multi-step
execution may continue after failed steps and can report overall success despite
individual failure. Some actions execute provider effects directly or mutate
legacy-compatible order state.

Destructive automations require durable intents, truthful per-step status,
idempotency, retries, ambiguity, approval, dead letter and operator recovery.

### 5. AI approval is not consistently proposal-bound

Some AI tools require confirmation, but destructive behavior is inconsistent and
generic current-message confirmation is not durably bound to exact tool,
arguments, record, expected version, actor, shop and expiry.

Reads, extraction, summaries and drafts are useful. Destructive AI should remain
disabled until a persisted one-time proposal/approval record exists.

### 6. Backup restore and replacement recovery are incomplete

Backup creation is strong partial source. Production restore currently requires
native supervisor ownership and is intentionally blocked. Full all-shop encrypted
backup, independent recovery kit, replacement-install restore, failed-restore
rollback and drills remain Phase 4 work.

### 7. Storefront, PWA and cloud are incomplete

The local storefront and PWA contain useful product behavior but are not yet the
complete shared multi-tenant control/relay/storefront/zero-knowledge recovery
platform. Desktop canonical authority, encrypted protocols, outage behavior,
cross-tenant isolation, quotas and cost controls remain to be completed and
certified.

### 8. Whole-product UI is not AAA

The application has a coherent shell and useful operational pages, but route
quality, complete states, design-system consistency, chart geometry, Arabic/RTL,
accessibility, zoom, responsive behavior, visual regression and installed
performance are inconsistent.

The current dependencies include Radix primitives, TanStack Table, Tailwind,
Framer Motion and Recharts. Their presence does not prove a finished design
system. A benchmark must select one governed chart foundation and every visible
primitive must pass through SahelFlow-owned components/tokens.

### 9. Performance remains outside contract

Historical clean-runner behavior improved substantially, but the recorded T470
launch/reopen results are far over target. Startup stages, process shutdown,
query/render performance, memory, low-resource scheduling and eight-hour stability
remain blocking Phase 7 evidence and continuous package requirements.

## Capability status

| Area | Current evidence | Principal closure |
|---|---|---|
| Signed Windows runtime/update | Strong historical Internal proof | current Phase 2 artifact/install, T470 lifecycle/performance, wider compatibility |
| Local database/migrations | Strong partial | native lifecycle plus full restore/replacement and prior-version/interruption matrix |
| Workspace/person/member/session | Strong protected source | Phase 2 installed and recovery evidence |
| Teams and permissions | Strong protected source | installed and representative journey evidence |
| Licensing/entitlements | Strong protected source | Phase 2 Windows/install/expiry/activation/transfer/recovery evidence |
| Native multi-shop | Partial merged primitives; PR #200 proposed contract | complete native lifecycle and Phase 2 checkpoint |
| Golden COD | Strong canonical manual/source boundary | remove remaining legacy intake/exceptions/provider bypasses and installed full journey |
| Inventory/finance | Strong canonical facts in adopted paths | remaining callers, reconciliation, returns/compensation and installed proof |
| Providers | Strong patterns, inconsistent adoption | one protocol everywhere and live certification |
| Automations | Unsafe partial | durable truthful execution and recovery |
| AI | Useful reads/drafts, unsafe destructive boundary | exact persisted proposal approval and corpus/privacy certification |
| Backup/recovery | backup creation partial | production restore, replacement install, recovery kit and drills |
| UI/UX | broad functional internal app | complete design/chart system and every route/state |
| Arabic/RTL/accessibility | partial | full route/journey parity and external/installed evidence |
| Performance/reliability | below T470 launch target | stage correction, floor targets and eight-hour stability |
| Connected platform | prototype/partial | complete encrypted desktop-authoritative platform |
| Stable | not achieved | Phases 2–9 and explicit Founder promotion |

## Immediate frontier

1. Keep the Web Agent as the sole active implementation agent on PR #200.
2. Complete Task 1 authority reconciliation and pure Rust lifecycle contract.
3. Pass the Task 1 authority/Rust/source gate before registry mutation.
4. Implement the native switch transaction against the existing runtime generation,
   registry, identity, licensing and readiness authorities.
5. Implement create/rename, then archive/recover, then destructive delete and
   legacy-path removal as coherent tasks with Level 1 gates.
6. Freeze the exact head for one separated adversarial review and one consolidated
   repair batch.
7. Run the complete Phase 2 Level 2 checkpoint.
8. Run the risk-triggered Level 3 Windows/Rust/signed-MSI/install/upgrade/reopen/
   preserved-data/licensing/shop-lifecycle checkpoint.
9. Close Phase 2 only with objective evidence and zero known P0/P1.
