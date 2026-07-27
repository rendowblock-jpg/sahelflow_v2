# SahelFlow — Current State

> **Authority:** merged protected `main` only
> **Protected-main executable baseline:** `1b9c52235a37d4593c2fffa3c397b85498aba7fd`
> **Source version:** `1.0.0-internal.11` / MSI `1.0.0.11`
> **Latest signed candidate:** `1.0.0-internal.11`, run `30244003253`
> **Latest Founder-installed acceptance:** `1.0.0-internal.5`
> **Current installed status:** Founder reports Internal.11 installed through the
> in-app updater and usable, but exact post-install version/AppData identity is
> not yet recorded and first plus subsequent launches remain materially slow
> **Observed machine:** Founder ThinkPad T470
> **Last assessed:** 2026-07-27

This document describes what merged protected source and named evidence prove
now. It does not convert target architecture, adapter presence, test count, mock
output or planned scope into readiness. The active execution frontier belongs in
[`../operations/WORKING_MEMORY.md`](../operations/WORKING_MEMORY.md).

## Executive truth

SahelFlow is a broad internal Windows application with a proven Internal.5
accepted baseline and a stronger Internal.11 source/release chain installed by
the Founder but not accepted. It is not an empty prototype, but it is not yet a
commercially complete or class-AAA SahelFlow 1.0 product.

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

The main product discontinuities remain:

- process-global/relaunch-oriented shop selection instead of trusted live
  workspace/shop context;
- no final separate order, delivery, inventory, COD/financial and return/refund
  state machines;
- no append-only stock and money movement truth;
- no complete canonical transition/audit/outbox/idempotency service;
- no fully proven cross-module Golden COD Journey;
- identity, teams, devices, licensing and Founder operations are incomplete;
- provider adapters exist without a certified public launch set;
- PWA/storefront/cloud/recovery planes are prototypes, partial or target-only;
- the frontend, information architecture and page-state depth are not yet AAA;
- Arabic/RTL is partial and inconsistent across copy, geometry, mixed content,
  tables, charts, forms, icons, navigation and accessibility;
- repeated-launch performance violates the T470 target.

The correct characterization is:

> **Accepted Internal.5 baseline; Internal.11 source and signed release complete,
> Founder reports successful in-app installation and usable UI, but repeated
> launch performance and full installed evidence remain open; broad partial
> desktop product with major business-authority, AAA experience, commercial,
> provider and connected-platform work ahead.**

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
| CAP-001 | Signed Windows install/update/runtime | **Partial internal proof** | Internal.5 accepted; Internal.11 exact-source release gates passed and Founder reports in-app update installed | Automate protected publication, record exact T470 preservation/lifecycle, meet launch target and prove broader matrix |
| CAP-002 | Local database/migrations | **Partial** | Prisma/SQLite, eight migrations, runtime preservation | All-shop journaled migration/preflight/rollback/recovery |
| CAP-003 | Shop management | **Partial/unsafe** | Per-shop files, registry/store/routes and creation UI | Durable workspace/shop/incarnation authority and safe live switching |
| CAP-004 | Local PIN/session | **Implemented for local baseline** | `AuthSecret`, `Session`, runtime auth | Not seller identity, team authority, device or recovery model |
| CAP-005 | Seller identity/workspace/team | **Missing** | Profile/agent UI fragments only | Person/workspace/license, memberships, roles, fields, devices, revocation |
| CAP-006 | Trial/permanent licensing | **Unsafe/partial** | License UI/store/hook and Ed25519 concepts | Online signed trial, complete lockout, offline permanent issuance and entitlements |
| CAP-007 | Catalog/products/variants | **Partial** | Pages, routes, models, imports/exports | Complete stock authority, bulk/data UX, journey and scale proof |
| CAP-008 | Inventory | **Partial/unsafe** | Stock fields and order lifecycle effects | Reservation and append-only movement ledger, replay/concurrency and return disposition |
| CAP-009 | Customers/risk | **Partial** | Search, details, blacklist, risk/phone reputation | PII classification, duplicate merge, permissions and journey proof |
| CAP-010 | Orders/confirmation | **Partial** | Routes/UI/timeline, confirmation queue, status actions | Separate state machines, canonical service and Golden journey |
| CAP-011 | Delivery/couriers | **Partial/unverified** | Delivery model/UI/routes and candidate adapters | Durable provider inbox, certification, exceptions and reconciliation |
| CAP-012 | Returns/refunds | **Partial/unsafe** | Models, routes and UI | Atomic append-only stock/money/status compensation |
| CAP-013 | COD/accounting | **Partial** | Expenses, COD fields, reconciliation UI/tests | Receivable/remittance/fee/discrepancy ledger and governed correction |
| CAP-014 | Audit/history | **Partial/unsafe** | `AuditLog`, `OrderChange`, timelines | Trusted actor/device and atomic business audit/movements |
| CAP-015 | Imports/exports | **Implemented/partial** | Product/customer/order/expense import and exports | Preview/mapping/recovery consistency and scale evidence |
| CAP-016 | Local backup/restore | **Partial/unsafe** | Create/list/restore routes and settings UI | Verified all-shop snapshots, atomic restore and independent recovery |
| CAP-017 | WhatsApp/inbox | **Partial/unverified** | Sidecar, QR/connect, chats/messages/send and inbox UI | Durable encrypted ingress/egress, restart/replay and certification |
| CAP-018 | Automations | **Partial/unsafe** | Conditions, steps, logs and editor | Transactional outbox, approvals, idempotent effects, receipts/dead letters |
| CAP-019 | AI/extraction | **Partial/unsafe** | Deterministic/Gemini routes, schemas and chat/extraction UI | Central data policy, safe corpus, receipts and bound approvals |
| CAP-020 | Analytics/reporting | **Partial/unverified** | Dashboard, analytics and reporting routes/charts | Governed financial semantics, representative scale and complete states |
| CAP-021 | Provider framework | **Candidate/unverified** | Courier/commerce/Sheets integration code | Founder launch set and dated live certification |
| CAP-022 | Hosted storefront | **Prototype/unsafe boundary** | Builder/view/config and local submit route | Hosted tenant releases, allocation, durable receipt and canonical reconciliation |
| CAP-023 | Remote PWA | **Prototype/obsolete boundary** | Manifest/service worker/local shell | Remote identity, encrypted projections, commands and conflict/revocation |
| CAP-024 | Shared cloud/control plane | **Missing** | Target documentation only | Measured multi-tenant control/relay implementation and economics gate |
| CAP-025 | Zero-knowledge cloud backup | **Missing** | Target documentation only | Key hierarchy, client encryption, retention and restore drills |
| CAP-026 | Founder Console | **Missing** | Scattered release/support operations | Private audited seller/trial/payment/license/device/usage/incident UI |
| CAP-027 | Localization/RTL | **Partial/poor across app** | i18n hooks, locale-aware UI and foundations | Systematic Arabic copy, typography, geometry, mixed content, state and route parity |
| CAP-028 | Accessibility/keyboard | **Partial/unverified** | Radix primitives, shortcuts and focus-related components | Whole-journey WCAG, zoom, screen-reader and keyboard evidence |
| CAP-029 | AAA design system/page depth | **Partial/broadly unaccepted** | Shared primitives and broad pages | Coherent navigation/system, complete states, premium hierarchy and no prototype UX |
| CAP-030 | Low-end performance | **Unmet on Founder launch** | Internal.11 retains stage tracing and compile-cache work | Measure exact cold/warm stages, meet ≤8 s p95, representative data and eight-hour stability |
| CAP-031 | Security/privacy/legal | **Partial/unverified** | Crypto, PIN, secrets, loopback auth and redaction pieces | Complete threat models, recovery, tenant boundaries, Law 18-07 and review |
| CAP-032 | Release/operational evidence | **Internal.5 accepted; Internal.11 release/install partial proof** | Exact-source signing, automated installed gates and Founder-reported in-app update | Protected auto-publication and complete T470 evidence/acceptance |

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

The final target adds explicit workspace/member/device/shop/entitlement
authority, append-only movements, durable inbox/outbox and optional bounded
connected planes without replacing canonical desktop authority.

## Keep and harden

- Tauri Windows host and packaged-runtime supervision.
- Next.js/App Router surface where it remains performant.
- Prisma/SQLite per-shop local authority.
- Existing product, customer, order, delivery, return, accounting and risk
  behavior that survives target invariants.
- Shared multilingual/RTL component foundations.
- Runtime authentication, signature verification, updater and evidence
  infrastructure.
- Existing tests/provider knowledge when they prove the right contract.

## Migrate or replace

- Process-global active-shop routing → authenticated workspace/shop context.
- Direct stock fields/effects → reservations and append-only movement ledger.
- Conflated statuses → separate order/delivery/inventory/financial/return states.
- Best-effort audit/effects → atomic audit and durable inbox/outbox.
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

Session 1 now begins four bounded lanes from current protected `main`:

1. protected automatic Internal publication after all release gates;
2. measured Internal.11 cold/warm performance correction;
3. compatible Phase 1A workspace/shop/incarnation authority;
4. global design-system and Arabic/RTL foundations plus route inventory.

Shared contracts remain dependency-serialized, but the slow-launch defect no
longer freezes independent Phase 1A or experience work. Exact lane ownership and
entry steps are in [`../operations/WORKING_MEMORY.md`](../operations/WORKING_MEMORY.md)
and [`ROADMAP.md`](ROADMAP.md).
