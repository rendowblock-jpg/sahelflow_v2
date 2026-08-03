# SahelFlow — Current state

> **Authority:** merged protected source and named evidence only
> **Live protected main:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`
> **Latest application-changing protected merge:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Protected signed run:** `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Observed reference machine:** Founder ThinkPad T470
> **Active product phase:** Phase 3 — durable providers, inbox, AI and automations
> **Active proposed package:** PR #203 — Phase 3 audit and contract freeze
> **Phase execution issue:** #202
> **Retained installed evidence:** #201
> **Last assessed:** 2026-08-03

This document states what merged source and named evidence prove now. PR #203 is
identified separately as proposed audit/documentation source and does not become
merged, installed or phase-closed truth merely because it exists. The exact live
execution frontier belongs in
[`../operations/WORKING_MEMORY.md`](../operations/WORKING_MEMORY.md).

## Executive truth

SahelFlow is a broad real internal Windows application. It is not an empty
prototype, generic dashboard template or desktop shell around a cloud database.
It contains substantial catalog, customer, order, delivery, return, accounting,
inbox, automation, analytics, AI, storefront and integration behavior; one SQLite
database per shop; Tauri runtime supervision; field-level PII encryption; signed
updating; and strong migration/release infrastructure.

It is not yet a commercially complete or class-AAA SahelFlow 1.0 product.

Its strongest protected architecture now includes:

- installation-owned Workspace, Installation, Person, Member, Device and session
  authority;
- exact-shop grants, policy freshness, revocation and protected-field projection;
- signed installation-level trial/permanent licensing authority;
- a Tauri-owned native shop lifecycle for create, rename, switch, archive,
  recover and delete;
- optimistic aggregate versions;
- encrypted request-bound idempotent command replay;
- atomic audit, domain events and outbox intents;
- inventory reservations and movements;
- financial movements and compensation facts;
- projection invalidation;
- native process containment, exact startup authority and all-shop migration
  recovery;
- strong outbound WhatsApp and courier durable-effect foundations.

The central completion task is adoption and removal of competing legacy authority,
followed by complete provider, recovery, UI, accessibility, performance,
connected-platform and certification evidence. Another broad architecture reset
is not required.

## Latest protected source closures

### Phase 1 plus identity/Teams — PR #195

PR #195 merged at `a3d53cdd21afa8f4d03eefa7088304a9f728e2a0`.
Its implementation head `ddec67a36b8000be91562b33a2bd4d6aceb5e443`
passed CI `30734100436`.

Protected-source outcomes include:

- trusted manual order intake and confirmation/rejection;
- stock reservation, fulfillment, shipment, delivery and COD receivable facts;
- canonical settlement, return/refund/compensation boundaries and shared replay
  repairs;
- durable person/member/device/session identity;
- invitations, roles, custom permissions, exact shop grants and revocation;
- workgroups, queues, assignments, comments, mentions and handovers;
- protected-field projections and AR/FR/EN states.

This is protected source, not a current signed or installed claim.

### Signed licensing — PR #197

PR #197 merged at
`04d4c51831c6e043ab39a614a7e947e6b27d01e6`. Its implementation head
`25abbedd176429cf25e657217726d833e3c62a10` passed CI `30744598944` and every
review thread was resolved.

Protected-source licensing includes:

- native opaque Windows device binding;
- separate online-trial and offline-permanent Ed25519 authorities;
- one canonical trial record per device binding and reinstall reissue;
- atomic installation-root-authenticated local state;
- protected clock, revocation and recovery floors;
- signed transfer, revocation and recovery ceremonies;
- data-preserving product lockout;
- AR/FR/EN activation and recovery states;
- fail-closed release configuration.

### Single-agent AAA governance — PR #199

PR #199 merged at `991c61ac882497fdda01af3ac04f06978146bbda`.
It established one active agent, complete reconnaissance, one consolidated Problem
Register, batch remediation, Level 1/2/3 validation, complete failure reporting
and whole-product AAA frontend governance.

### Native multi-shop — PR #200

PR #200 merged at `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`.
Its exact package established the Tauri host as the sole native authority for:

- create;
- rename;
- switch;
- archive;
- recover;
- delete.

The protected lifecycle binds operation payload, registry revision, workspace,
installation, person/member/device/session authority, policy/revocation state,
signed entitlement revision and shop slots, migration-set identity and exact shop
incarnations. One durable native journal owns quiescence, database/registry
mutation, runtime restart, authenticated readiness, compensation and startup
reconciliation.

The browser submits authenticated typed intent and renders state. It no longer
owns registry mutation, database-path selection or generic process relaunch.

Evidence passed for authority/docs, TypeScript, ESLint, complete Vitest, Prisma,
coverage, dependency audit, Rust lifecycle tests, strict Clippy, Tauri switch and
mutation interruption contracts, Windows release compilation, database/runtime
containment and MSI build/install/launch/close/reopen.

The installed hydrated-WebView receipt did **not** pass twice on the ephemeral
runner. The Founder authorized PR #200 to merge with that single limitation
retained in issue #201. This is not passing installed-UI proof and does not reopen
native lifecycle authority.

No Phase 1/2 protected-source closure bumped the version, published a new release,
claimed Founder acceptance or declared a phase fully installed/certified.

## Release and installed truth

### Internal.5

Internal.5 remains the latest explicit Founder-accepted installed baseline. That
acceptance proves only its exact historical artifact and observation.

### Internal.13

Internal.13 is the latest published and Founder-installed release. Protected run
`30366866703` proved, for its historical source:

- reviewed-source binding;
- signed build;
- staged packaged authenticated readiness;
- MSI/signature verification;
- installed launch and reopen;
- authenticated hydrated WebView UI;
- deterministic evidence;
- exact release-asset comparison;
- source-bound tag and automatic publication.

The observed T470 executable identity was confirmed without deleting AppData,
registry, database, migration or key state. A stopped-process launch reached
authenticated Arabic UI-ready in 68.863 seconds and immediate reopen in 31.834
seconds, both beyond the eight-second T470 target. Arabic chart visual correctness,
long-session behavior and explicit Founder acceptance remain open.

Internal.13 predates the protected Phase 1/Teams/licensing/native-multi-shop
closures. It cannot prove current Phase 2 or Phase 3 behavior.

## Current implementation shape

```text
Tauri Windows host
├── protected installation root and licensing/device/clock authority
├── versioned workspace/shop registry
├── native journaled shop lifecycle
├── all-shop migration and recovery coordinator
├── runtime generation, containment, authenticated readiness and shutdown
├── packaged Node/Next.js standalone runtime
│   ├── App Router UI and API routes
│   ├── Prisma services and one SQLite database per shop
│   ├── durable identity, permissions and licensing source
│   ├── canonical business command/event/outbox foundation
│   ├── provider, automation, AI and compatibility services
│   ├── local PWA shell
│   └── local storefront prototype
└── contained Bun/Baileys WhatsApp sidecar
```

The Node process is bound to one immutable exact `ShopContext`. Switching shop
requires the native lifecycle; mutable UI preference cannot select background or
API write authority.

## Repository breadth

The latest retained inventory before PR #200 reported approximately:

- 1,026 tracked files;
- 32 pages/routes;
- 152 API routes;
- 145 components;
- 65 Prisma models;
- 18 migrations;
- 234 test/spec files;
- 35 provider/integration files;
- 27 sidecar/desktop resources;
- 12 Playwright scenarios.

These counts prove breadth and risk surface, not completion. The Phase 3 audit is
revalidating the provider, inbox, automation and AI subset from exact current
source because GitHub code search is not indexed for this repository.

## Proven strengths

### Canonical business command kernel

The protected kernel provides:

- trusted actor and exact shop derivation;
- canonical request hashes;
- request-bound idempotency and encrypted committed-result replay;
- optimistic aggregate versions;
- one database transaction;
- audit, events and encrypted outbox intents;
- reservations and inventory movements;
- financial movements;
- compensation facts;
- projection invalidation.

### Identity, authorization and licensing

Merged source provides durable Workspace, Installation, Person, Member, Device
and session bindings, exact shop grants, role/custom policy, invitations,
revocation, policy freshness, reauthentication, Teams/collaboration and signed
commercial authority outside mutable browser/shop state.

### Native registry, migration and process authority

Merged Rust source provides:

- exact registry revision, workspace, installation and shop-incarnation checks;
- contained database-file identity and anti-aliasing checks;
- migration-set hashing and compatibility reports;
- verified all-shop snapshots, interruption recovery and compensation;
- runtime generations, containment, safe mode, readiness and cleanup;
- native lifecycle mutation and startup reconciliation.

### Durable outbound WhatsApp foundation

Protected source provides:

- atomic local message, command, audit, event, effect correlation and encrypted
  outbox intent;
- effect identity scoped to exact shop incarnation and paired WhatsApp account;
- encrypted request binding;
- leases, retries, ambiguity, dead letter and operator retry;
- sidecar receipt journal and post-restart reconciliation;
- integration tests for replay, concurrency and interruption.

This does not make inbound WhatsApp durable and does not govern all WhatsApp
callers.

### Canonical courier foundation

Protected source provides:

- canonical order/reservation validation;
- committed booking intent before provider effect;
- worker leasing, retry and ambiguity handling;
- manual confirm-created/confirm-not-created reconciliation;
- tracking ingestion and restart-owned worker execution.

### Commerce checkpoint safety

The current commerce sync engine retains the prior watermark whenever any fetched
order fails. It no longer advances the checkpoint past an uncommitted order.

### Windows/release engineering

Release workflows bind exact protected source, required checks, frozen
dependencies, signed MSI, staged/installed runtime, authenticated UI, updater
signature and evidence artifacts. This remains a major strength but does not
replace current installed proof for newly merged source.

## Active proposed Phase 3 package — PR #203

PR #203 is a draft from exact protected base
`e9c92f08f39e8d87ddfd72d2e698418ae81fc084`.

It currently changes documentation and Phase 3 checkpoint authority only. It has
not changed product runtime, schema, migration, provider behavior, version or
release.

The proposed audit has identified these root-cause blockers:

1. active authority remained stale after PR #200;
2. inbound WhatsApp depends on in-memory sidecar history rather than
   persistence-before-acknowledgement;
3. multi-step automations can continue after failure and report overall success;
4. automation WhatsApp effects call the sidecar directly and bypass durable
   effect authority;
5. sensitive AI tools use generic current-message confirmation rather than one
   exact persisted proposal/approval;
6. WhatsApp, courier and commerce effect semantics are fragmented;
7. commerce lacks durable run/item ingress and operator recovery;
8. the explicitly uncertified DHD adapter remains registered in normal provider
   execution authority.

The full proposed Problem Register and task sequence are in Working Memory and the
Phase 3 checkpoint. Production implementation remains unauthorized until the
exhaustive inventory and shared contract freeze are complete.

## Blocking discontinuities

### 1. Inbound provider durability is incomplete

Baileys maintains live chats/messages in memory and emits inbound messages to
subscribers. The database fallback reconstructs locally queued outbound messages,
not a complete persisted inbound inbox. Interruption, duplicate/conflict and
pre-acknowledgement authority remain incomplete.

### 2. Automations are not production-safe

The current engine is fire-and-forget. Multi-step actions can continue after a
failed step and then record the whole run as success. Provider actions use direct
sidecar calls and in-process retries rather than durable intents, receipts and
recovery.

### 3. Sensitive AI approval is incomplete

AI order creation has a useful persisted source identity and canonical draft path,
but the general confirmation gate accepts words such as yes/ok for the tool call
emitted on that turn. Exact tool/arguments, target versions, actor/shop/session,
permission/licensing snapshot, expiry, one-time approval and durable result are
not one persisted authority.

### 4. External-effect protocols remain fragmented

WhatsApp and courier implement separate lease/retry/ambiguity machines over the
generic outbox. Commerce uses integration config and a watermark. Shared effect,
receipt, reconciliation, retention and operator-state contracts must freeze before
expansion.

### 5. Commerce ingress and recovery are incomplete

Whole-page checkpoint refusal is correct, but there is no durable sync run,
provider page/event identity, per-item attempt, quarantine, dead-letter, overlap
reconciliation or operator recovery history.

### 6. Provider certification remains incomplete

Yalidine, Maystro and legacy ZR Express contain substantial adapters, but source
presence and tests are not current live certification. DHD explicitly contains
unverified guessed endpoints and must remain effect-disabled until certified.

### 7. Inactive-shop background policy is implicit

WhatsApp and courier workers drain only the process-active shop database. The
intended behavior for queued work in inactive shops must be explicit, visible and
tested.

### 8. Backup/replacement recovery remains Phase 4

Migration recovery and native archive/recover are strong protected primitives.
Full encrypted all-shop backup, independent recovery kit, replacement-install
restore and failed-restore rollback remain Phase 4.

### 9. Storefront, PWA and connected platform remain incomplete

Local prototypes are useful but do not yet constitute the final multi-tenant
control/relay/storefront/zero-knowledge platform with outage, cross-tenant,
quotas, costs and certification evidence.

### 10. Whole-product UI is not AAA

The application has a coherent shell and useful pages, but route quality, complete
states, design/chart consistency, Arabic/RTL, accessibility, zoom, responsive
behavior, visual regression and installed performance remain inconsistent.

### 11. Performance remains outside contract

Recorded T470 launch/reopen results remain far above target. Startup, shutdown,
queries, rendering, memory, low-resource scheduling and eight-hour stability are
still blocking Phase 7 evidence and continuous package requirements.

## Capability status

| Area | Current evidence | Principal closure |
|---|---|---|
| Signed Windows runtime/update | strong historical Internal proof | current-source artifact/install and T470 evidence |
| Workspace/person/member/session | strong protected source | installed/recovery and representative journey evidence |
| Teams and permissions | strong protected source | installed and representative evidence |
| Licensing/entitlements | strong protected source | installed activation/expiry/transfer/recovery evidence |
| Native multi-shop | strong protected source through PR #200 | issue #201 and current-source installed/Founder evidence |
| Golden COD | strong canonical source boundary | remaining provider/intake adoption and installed journey |
| Inventory/finance | strong facts in adopted paths | remaining callers and reconciliation evidence |
| Outbound WhatsApp | durable strong partial | all callers, live certification and operator UI |
| Inbound WhatsApp/inbox | unsafe partial | durable persistence-before-ack and replay/recovery |
| Courier | durable strong partial | shared contract and live provider certification |
| Commerce sync | checkpoint-safe partial | durable run/item ingress, overlap and recovery |
| Automations | unsafe partial | durable truthful run/step/effect execution |
| AI | useful reads/drafts and canonical order draft | exact persisted proposal approval and legacy write removal |
| Backup/recovery | strong migration/native partial | complete Phase 4 backup/restore/replacement drills |
| UI/UX | broad functional internal app | complete design/chart system and every route/state |
| Arabic/RTL/accessibility | partial | full route/journey and installed/external evidence |
| Performance | historical improvements; target missed | Phase 7 T470/floor/stability evidence |
| Connected platform | prototype/partial | Phase 8 complete authority and certification |

## Exact current boundary

SahelFlow has credible protected foundations and substantial product breadth. It
is not yet a complete AAA candidate or Stable product.

The exact next source work is the Phase 3 audit and contract package on PR #203:
complete governance reconciliation, exhaustive inventory, consolidated Problem
Register and shared durable ingress/effect/automation/AI contracts. Production
implementation begins only after those gates.
