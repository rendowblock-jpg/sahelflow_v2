# SahelFlow — Current State

> **Authority:** merged protected `main` only
> **Protected-main combined source checkpoint:** PR #170 at
> `6cd1103b55c905d26492ecf5436e644d377ce557`
> **Source version request:** `1.0.0-internal.13` / MSI `1.0.0.13`; not yet a
> signed or installed result
> **Latest signed candidate:** `1.0.0-internal.11`, run `30244003253`
> **Latest Founder-installed acceptance:** `1.0.0-internal.5`
> **Current installed status:** Founder reports Internal.11 installed through the
> in-app updater and usable, but exact post-install version/AppData identity is
> not yet recorded and first plus subsequent launches remain materially slow
> **Observed machine:** Founder ThinkPad T470
> **Last assessed:** 2026-07-28

This document describes what merged protected source and named evidence prove
now. It does not convert target architecture, adapter presence, test count, mock
output or planned scope into readiness. The active execution frontier belongs in
[`../operations/WORKING_MEMORY.md`](../operations/WORKING_MEMORY.md).

## Executive truth

SahelFlow is a broad internal Windows application with a proven Internal.5
accepted baseline, a stronger Internal.11 source/release chain installed by the
Founder but not accepted, the merged Session 1 packages, and the merged Session
2 business-truth foundation grouped into an Internal.13 milestone request. It is
not an empty prototype, but it is not yet a commercially complete or class-AAA
SahelFlow 1.0 product.

PR #158 app source `1cd9a27fc747d85979427e51eff9b0ba8b7ba7a7`
replaced the failing packaged Bun server with pinned Node.js 22.23.1, retained
the protected `Program Files` runtime authority, added fail-fast contained-child
exit evidence and passed exact-head CI, Windows Rust and installed MSI/UI gates.
PR #159 at `eca2111a18fb900e9880177848ada497fd07ab72` corrected the signed
release test database and allowed Internal.8 publication.

PR #160 at `d516e5fe3459f9e5efba15b6019f1e063a81c10c` added startup/layout
corrections, runtime-listening evidence and repeat-launch compile caching.
Internal.9 published correctly, but installed Internal.8 could not invoke the
updater from its authenticated loopback workspace.

PR #161 at `ab3c1fb46bbe028745321d7469ae0924e9f236bd` repaired Tauri
loopback capability/CSP access and established the single-window authenticated
launch contract in FD-025. Signed Internal.10 installed in place with exact
registry and shop-database identities preserved. It reached the real dashboard,
but took multiple minutes and remained unaccepted.

PR #163 merged Internal.11 as
`1b9c52235a37d4593c2fffa3c397b85498aba7fd`. Exact-head run
`30243181965` passed every selected source, Rust, Windows runtime, installed-MSI,
authenticated-UI and required lane. Signed run `30244003253` built and verified
the exact candidate, signature, MSI install/reopen, authenticated hydrated UI
twice, deterministic evidence and updater manifest.

The signed workflow intentionally left Internal.11 as a draft. The Founder
manually published that verified draft after the missing updater prompt exposed
the handoff. Installed Internal.10 then detected and installed Internal.11
through the in-app updater. This proves the updater path can deliver a higher
version after publication, but it does not prove automatic publication or full
Founder lifecycle acceptance.

Founder observation after the update:

- the application UI opens and is usable;
- the first Internal.11 launch was slow;
- subsequent launches are also not acceptably fast;
- no exact post-install version, AppData identity, cold/warm stage timing, demo
  workspace walkthrough or full close/reopen record has yet been committed as
  Founder evidence.

Session 1 added four exact merged packages after Internal.11:

- PR #167 at `5081fcadb3794ca6e57f7cc4a32c4b5f573532c6` protects automatic
  Internal publication behind every signed post-build gate and a monotonic
  latest-release check;
- PR #168 at `d7e6568a46a929d552dbe8bbe0541f23dd8d5fc4` migrates the shop
  registry compatibly to workspace/shop/incarnation identity and complete
  trusted request context;
- PR #169 at `e6e1f16a03464c4338548c8905d9bca17b6df4a7` moves the real
  authenticated UI-ready boundary ahead of slower dashboard children and adds
  stronger packaged/installed readiness evidence;
- PR #171 at `a8770e1943e1fb2d33c6f0520c77d257d5c5bd15` adds the global
  Arabic/RTL, chart, operational-state, containment and route-inventory
  foundation.

Selected exact-head source and installed lanes passed for those package heads,
with no open P0/P1 review finding. The startup change has not yet been timed on
the Founder T470, and the Arabic foundation is not evidence that every route is
already AAA; the generated inventory assigns the remaining failures across
Sessions 2–4.

PR #170 merged the Session 2 business-truth source foundation at
`6cd1103b55c905d26492ecf5436e644d377ce557`. It adds independent lifecycle
contracts, canonical aggregate/command/event/outbox/reservation/movement and
compensation persistence, trusted encrypted idempotent command execution,
crash-recoverable multi-shop key rotation, migration-authoritative reset and
fail-closed legacy projections. Production order, delivery, refund, provider,
automation and UI routes remain on the legacy paths until complete observable
verticals adopt those contracts.

The main product discontinuities remain:

- the Phase 1A trusted workspace/shop/incarnation foundation exists, but complete
  seller identity, membership, device and live-switch authority remains ahead;
- independent order, delivery, inventory, COD/financial and return/refund
  contracts exist, but production routes do not yet adopt them end to end;
- append-only inventory and financial movement persistence exists at the
  canonical foundation layer, but complete production journeys do not yet write,
  reconcile and compensate through it;
- the atomic command/audit/event/outbox/idempotency foundation exists, but the
  production order, delivery, refund, provider and automation paths remain legacy;
- no fully proven cross-module Golden COD Journey;
- identity, teams, devices, licensing and Founder operations are incomplete;
- provider adapters exist without a certified public launch set;
- PWA/storefront/cloud/recovery planes are prototypes, partial or target-only;
- the frontend, information architecture and page-state depth are not yet AAA;
- Arabic/RTL now has shared typography, bidi, shell, table, dialog, chart and
  operational-state foundations, but route-level copy, geometry and
  accessibility failures remain assigned work;
- repeated-launch performance violates the T470 target.

The correct characterization is:

> **Accepted Internal.5 baseline; Internal.11 installed but not accepted;
> Session 1 and the Session 2 business-truth foundation merged and grouped
> into an unsigned Internal.13 request; repeated-launch performance and full
> Founder installed evidence remain open; production adoption of the canonical
> business foundation, route-level AAA, commercial, provider and connected-
> platform work continues.**

## Evidence ledger

| Evidence | Exact authority | Result |
|---|---|---|
| Runtime/session repair | PR #152, merge `f07779a9328dc57f8a2a73a034587b44c31263d6` | Native WebView session handoff and installed visible-UI acceptance integrated |
| Signed-release acceptance | PR #153, merge `d1fb321ea213b0bfbb10042144c4c9b8019254eb` | Exact signed MSI required to pass runtime and visible UI twice |
| Signed Internal.5 build | Run `30055297869`, job `89366909225` | Passed |
| Internal.5 retained artifact | ID `8583209047`; archive SHA-256 `12d310443f99afebc2bf3f0e1486861782f965db5423f83c819bfd3e1f3dfd88` | Verified |
| Internal.5 MSI | `SahelFlow_1.0.0-internal.5_x64_en-US.msi`; SHA-256 `5541cb1cb8519bd09ce36b8b8fd397764d96676f77415932c1bf74ea1480fe7b` | Verified |
| Internal.5 Founder lifecycle | Internal.4 → Internal.5 | AppData preservation, real UI, normal close and reopen passed |
| Post-acceptance startup incident | Installed Internal.5 on 2026-07-24 | Multi-minute hidden launch, brief dashboard, then `SF-RUNTIME-UI-BLOCKED`; AppData preserved |
| Internal.6 startup correction | PR #156 / run `30136644587` | Signed and installed; recursive verification caused about 14 minutes; not accepted |
| Internal.7 runtime staging removal | PR #157 / run `30142585934` | Runtime preparation 271 ms, then Bun `EPERM`; not accepted |
| Internal.8 Node packaged runtime | PRs #158–159 / run `30183140347` | Node runtime, authenticated dashboard and close/reopen passed; about 42.5 s launch; not accepted |
| Internal.9 startup/layout | PR #160 / run `30190505041` | Signed release passed; installed Internal.8 updater IPC path was blocked |
| Internal.10 updater/bootstrap | PR #161 / runs `30200603507`, `30201584875` | Signed, manually bootstrapped in place, AppData identities preserved, dashboard opened after multiple minutes; not accepted |
| Internal.11 exact source | PR #163 merge `1b9c52235a37d4593c2fffa3c397b85498aba7fd` | Startup cache flush, streamed dashboard fallback and guarded Algerian demo integrated |
| Internal.11 exact-head gates | Run `30243181965` | Source, Rust, Windows runtime, MSI install/reopen, authenticated UI and required gate passed |
| Internal.11 signed candidate | Run `30244003253` | Signature, MSI, installed lifecycle/UI twice, deterministic evidence and draft `latest.json` passed |
| Internal.11 publication | Founder manual GitHub action | Verified draft published after automatic publication was found missing |
| Internal.10 → Internal.11 update | Founder observation | In-app updater installed the higher version and the app opened; exact preservation/version record pending |
| Internal.11 performance | Founder T470 observation | First and subsequent launches remain materially slow; not accepted |
| Protected auto-publication | PR #167 merge `5081fcadb3794ca6e57f7cc4a32c4b5f573532c6` | Protected final publication and monotonic latest-release guard integrated; first combined live run pending Internal.13 |
| Workspace/shop authority | PR #168 merge `d7e6568a46a929d552dbe8bbe0541f23dd8d5fc4` | Registry v2 migration and trusted workspace/shop/incarnation context passed selected source and installed lanes |
| Startup readiness correction | PR #169 merge `e6e1f16a03464c4338548c8905d9bca17b6df4a7` | Clean-runner packaged/install/reopen/UI evidence passed; no post-change T470 timing yet |
| Arabic/RTL and chart foundation | PR #171 merge `a8770e1943e1fb2d33c6f0520c77d257d5c5bd15` | Shared bidi/layout/state/chart contracts and generated route inventory passed selected exact-head gates |
| Session 2 business-truth foundation | PR #170 merge `6cd1103b55c905d26492ecf5436e644d377ce557`; exact-head run `30344619022` | Independent lifecycle contracts, canonical persistence, encrypted trusted idempotent commands, movement/compensation facts, key rotation, reset and legacy-ambiguity proof integrated; production routes not switched |

The earlier accepted reopen proves that exact historical attempt only. Clean
runner results prove the exact artifact on that runner, not T470 performance or
the wider product.

## Repository shape

The last counted baseline contained:

| Surface | Count |
|---|---:|
| Tracked files | 754 |
| App pages | 31 |
| API routes | 117 |
| TSX components | 125 |
| Prisma models | 31 |
| Prisma migrations | 8 |
| Test/spec files | 116 |
| GitHub workflows | 6 |
| Rust/Tauri source lines (`src-tauri/src/*.rs`) | 7,066 |

Counts show breadth, not completeness.

## Capability ledger

Statuses use the vocabulary in
[`../README.md`](../README.md). “Implemented” is source-level; “Proven” names a
separate evidence result.

| ID | Capability | Current status | Evidence / implementation | Principal gap |
|---|---|---|---|---|
| CAP-001 | Signed Windows install/update/runtime | **Partial internal proof** | Internal.5 accepted; Internal.11 installed; protected auto-publication merged | Prove first automatic publication, record exact T470 preservation/lifecycle, meet launch target and prove broader matrix |
| CAP-002 | Local database/migrations | **Partial** | Prisma/SQLite, eight migrations, runtime preservation | All-shop journaled migration/preflight/rollback/recovery |
| CAP-003 | Shop management | **Partial** | Registry v2 workspace/shop/incarnation identity, trusted context, per-shop files and routes | Complete membership/device authority and safe live switching across every background/provider path |
| CAP-004 | Local PIN/session | **Implemented for local baseline** | `AuthSecret`, `Session`, runtime auth | Not seller identity, team authority, device or recovery model |
| CAP-005 | Seller identity/workspace/team | **Missing** | Profile/agent UI fragments only | Person/workspace/license, memberships, roles, fields, devices, revocation |
| CAP-006 | Trial/permanent licensing | **Unsafe/partial** | License UI/store/hook and Ed25519 concepts | Online signed trial, complete lockout, offline permanent issuance and entitlements |
| CAP-007 | Catalog/products/variants | **Partial** | Pages, routes, models, imports/exports | Complete stock authority, bulk/data UX, journey and scale proof |
| CAP-008 | Inventory | **Partial foundation** | Existing stock behavior plus canonical reservation and `InventoryMovement` persistence with encrypted reasons and same-key concurrency proof | Adopt reservation consumption/release and movement reconciliation across production confirmation, shipment, cancellation and return journeys |
| CAP-009 | Customers/risk | **Partial** | Search, details, blacklist, risk/phone reputation | PII classification, duplicate merge, permissions and journey proof |
| CAP-010 | Orders/confirmation | **Partial foundation** | Existing routes/UI plus independent order/confirmation contracts and the trusted atomic command kernel | Switch a complete production confirmation vertical and prove the Golden journey, conflicts, retries and compensation |
| CAP-011 | Delivery/couriers | **Partial/unverified** | Delivery model/UI/routes and candidate adapters | Durable provider inbox, certification, exceptions and reconciliation |
| CAP-012 | Returns/refunds | **Partial foundation** | Existing models/routes/UI plus compensation facts and canonical inventory/financial movement contracts | Adopt atomic production return/refund transitions and prove stock, money and status compensation end to end |
| CAP-013 | COD/accounting | **Partial foundation** | Expenses, COD UI/tests and canonical DZD `FinancialMovement` persistence with encrypted free-form details | Adopt production receivable/remittance/fee/discrepancy posting, reconciliation and governed correction |
| CAP-014 | Audit/history | **Partial foundation** | `AuditLog`, `OrderChange`, timelines plus trusted principals and atomic audit/event/outbox/movement persistence | Adopt the kernel across production routes, add durable effect workers and complete device/operator authority |
| CAP-015 | Imports/exports | **Implemented/partial** | Product/customer/order/expense import and exports | Preview/mapping/recovery consistency and scale evidence |
| CAP-016 | Local backup/restore | **Partial/unsafe** | Create/list/restore routes and settings UI | Verified all-shop snapshots, atomic restore and independent recovery |
| CAP-017 | WhatsApp/inbox | **Partial/unverified** | Sidecar, QR/connect, chats/messages/send and inbox UI | Durable encrypted ingress/egress, restart/replay and certification |
| CAP-018 | Automations | **Partial/unsafe** | Conditions, steps, logs and editor | Transactional outbox adoption, approvals, idempotent effects, receipts/dead letters |
| CAP-019 | AI/extraction | **Partial/unsafe** | Deterministic/Gemini routes, schemas and chat/extraction UI | Central data policy, safe corpus, receipts and bound approvals |
| CAP-020 | Analytics/reporting | **Partial/unverified** | Dashboard, analytics and reporting routes/charts | Governed financial semantics, representative scale and complete states |
| CAP-021 | Provider framework | **Candidate/unverified** | Courier/commerce/Sheets integration code | Founder launch set and dated live certification |
| CAP-022 | Hosted storefront | **Prototype/unsafe boundary** | Builder/view/config and local submit route | Hosted tenant releases, allocation, durable receipt and canonical reconciliation |
| CAP-023 | Remote PWA | **Prototype/obsolete boundary** | Manifest/service worker/local shell | Remote identity, encrypted projections, commands and conflict/revocation |
| CAP-024 | Shared cloud/control plane | **Missing** | Target documentation only | Measured multi-tenant control/relay implementation and economics gate |
| CAP-025 | Zero-knowledge cloud backup | **Missing** | Target documentation only | Key hierarchy, client encryption, retention and restore drills |
| CAP-026 | Founder Console | **Missing** | Scattered release/support operations | Private audited seller/trial/payment/license/device/usage/incident UI |
| CAP-027 | Localization/RTL | **Partial foundation** | Shared Arabic font/bidi, logical shell, table/dialog/state and chart direction contracts | Close the generated route inventory for systematic copy, geometry, focus and accessibility parity |
| CAP-028 | Accessibility/keyboard | **Partial/unverified** | Radix primitives, shortcuts and focus-related components | Whole-journey WCAG, zoom, screen-reader and keyboard evidence |
| CAP-029 | AAA design system/page depth | **Partial/broadly unaccepted** | Shared primitives and broad pages | Coherent navigation/system, complete states, premium hierarchy and no prototype UX |
| CAP-030 | Low-end performance | **Unmet on Founder launch** | Retained trace measured about 110 s; Session 1 readiness-boundary correction passed clean-runner installed gates | Measure post-change cold/warm T470 stages, meet ≤8 s p95, representative data and eight-hour stability |
| CAP-031 | Security/privacy/legal | **Partial/unverified** | Crypto, PIN, secrets, loopback auth and redaction pieces | Complete threat models, recovery, tenant boundaries, Law 18-07 and review |
| CAP-032 | Release/operational evidence | **Internal.5 accepted; Internal.11 release/install partial proof** | Exact-source signing, automated installed gates, Founder-reported in-app update and protected auto-publication source | Prove first automatic publication and complete T470 evidence/acceptance |

## Provider status

No external provider has a public Stable support claim from source presence
alone.

| Provider | Current source | Status | Main closure requirement |
|---|---|---|---|
| WhatsApp via Baileys | Sidecar, QR, chats, send, events and delivery updates | Candidate | Durable encrypted history/ingress/egress, recovery, replay/reconnect and policy proof |
| Google AI Studio / Gemini | Extraction, chat/tools, schemas and heuristic redaction | Candidate | Central allowlisted privacy policy, bound approvals, quota/outage and multilingual corpus evidence |
| Yalidine | Courier adapter and tests | Architecture candidate | Founder launch-set choice and real capability certification |
| ZR Express | Courier adapter and tests | Architecture candidate | Founder launch-set choice and real capability certification |
| Maystro | Courier adapter and tests | Architecture candidate | Founder launch-set choice and real capability certification |
| Procolis | References/implementation knowledge | Experimental/optional | Founder scope and full certification |
| DHD/other guessed courier code | Experimental endpoints/knowledge | Not approved | Keep hidden unless Founder scope and certification exist |
| Shopify | Polling/pagination/update/dedup knowledge | Conditional candidate | Durable hybrid inbox/reconciliation and live edit/cancel/rate-limit proof |
| WooCommerce | Polling/pagination/update/URL controls | Conditional candidate | Durable ingress plus host/plugin/version/live matrix |
| YouCan | Full-scan polling/normalization/dedup | Conditional candidate | Durable efficient reconciliation and event/update semantics proof |
| Google Sheets | Service-account export/batching | Architecture candidate | Founder scope, field/privacy/idempotency/quota/live proof |
| Cloudflare | Target control/relay/backup/storefront architecture | Planned | Phase 6 implementation, tenant/security/recovery and economics evidence |
| Sentry | Environment-gated diagnostics/redaction hooks | Optional internal candidate | Consent, minimization, retention, canary/outage/deletion proof |
| GitHub Releases/Tauri updater | Signed workflow and in-app update | Internal candidate | Protected automatic post-gate publication; Beta/Stable promotion remains separate |

## Current implementation map

```text
Tauri Windows host
├── packaged Next.js standalone runtime
│   ├── App Router UI and API routes
│   ├── Prisma services and per-shop SQLite
│   ├── local PIN/session and runtime authentication
│   ├── direct provider clients/callbacks
│   ├── local PWA shell
│   └── local storefront prototype
└── Bun/Baileys WhatsApp sidecar
```

The current source also contains an additive canonical business-truth layer for
commands, events, outbox intents, reservations, inventory/financial movements,
projection invalidations and compensation facts. The final target still adds
explicit workspace/member/device/shop/entitlement authority, production adoption
of those business contracts, durable inbox/outbox execution and optional bounded
connected planes without replacing canonical desktop authority.

## Keep and harden

- Tauri Windows host and packaged-runtime supervision.
- Next.js/App Router surface where it remains performant.
- Prisma/SQLite per-shop local authority.
- Existing product, customer, order, delivery, return, accounting and risk
  behavior that survives target invariants.
- Canonical business contracts, command kernel and append-only fact persistence.
- Shared multilingual/RTL component foundations.
- Runtime authentication, signature verification, updater and evidence
  infrastructure.
- Existing tests/provider knowledge when they prove the right contract.

## Migrate or replace

- Process-global active-shop routing → authenticated workspace/shop context.
- Legacy direct stock effects → canonical reservations and movement ledger.
- Conflated production statuses → the separate business lifecycle contracts.
- Best-effort production audit/effects → the atomic command/audit/outbox boundary
  plus durable effect workers.
- Local PIN as identity → local unlock plus person/workspace/member/device.
- Self-issued/local trial → online trial-only signed issuance and offline
  permanent entitlement.
- Direct provider mutation → authenticated persisted idempotent event processing.
- Local storefront submit → hosted durable receipt and canonical import.
- Local-server PWA → authenticated remote projections and commands.
- Byte-copy backup → verified encrypted all-shop recovery and zero-knowledge
  cloud retention.
- Fragmented page-local UI/RTL → coherent shared system with Arabic-first parity.

## Retire or defer

- GLM, Codex Cloud and their continuity/bootstrap workflow.
- Superseded status, wave, gap, prompt and authority documents.
- Uncertified provider claims.
- Seller-owned Cloudflare/BYOC as the default deployment.
- Native mobile, generic international ERP, marketplace/ecosystem and
  speculative AI expansion before the Required core product.

## Immediate next boundary

The superseded runtime boundary was: **Launch the release-verified standalone server on pinned Node.js**.
Internal.8 achieved that mechanism; the phrase remains for historical continuity.

Internal.13 release verification and the next Golden COD vertical are independent
lanes once the source candidate is frozen on protected `main`:

1. merge the exact green Internal.13 source request and dispatch the signed
   protected-main updater workflow;
2. require signature, install/reopen, authenticated hydrated UI twice,
   deterministic evidence, manifest and automatic publication;
3. independently start the first complete observable production vertical that
   adopts the frozen business contracts across UI, API, domain and database;
4. record Founder T470 installation, preservation and cold/warm timing without
   blocking that independent vertical.

Shared contracts remain dependency-serialized. Release observation does not
freeze independent seller or experience work. Exact lane ownership and entry
steps are in [`../operations/WORKING_MEMORY.md`](../operations/WORKING_MEMORY.md)
and [`ROADMAP.md`](ROADMAP.md).
