# SahelFlow — Current State

> **Authority:** merged protected `main` only
> **Executable source baseline:** `3db7e4072f403f39632b7134be841047767a2e6d`
> **Source version:** `1.0.0-internal.7` / MSI `1.0.0.7`
> **Latest signed candidate:** `1.0.0-internal.7`, run `30142585934`
> **Latest Founder-installed acceptance:** `1.0.0-internal.5`
> **Current installed status:** Internal.7 is installed but not accepted;
> runtime preparation completed in 271 ms, then bundled Bun exited while
> loading the protected Next.js entrypoint
> **Observed machine:** Founder ThinkPad T470
> **Last assessed:** 2026-07-25

This document describes what integrated source and named evidence prove now. It
does not convert target architecture, adapter presence, test count, mock output
or planned scope into a readiness claim. Unmerged work belongs in
[`../operations/WORKING_MEMORY.md`](../operations/WORKING_MEMORY.md).

## Executive truth

SahelFlow is a broad internal Windows application with a proven Internal.5
installed runtime chain and signed-release-complete but unaccepted Internal.6
and Internal.7 startup corrections. It is not an empty prototype, but it is not yet a
commercially complete or AAA SahelFlow 1.0 product.

The protected-main → signed MSI → installed Founder-machine chain remains
strong historical evidence for Internal.5. Internal.6 proved a responsive safe
startup surface. Internal.7 removed recursive staging and reduced protected
runtime preparation to 271 ms, but its bundled Bun process exited with `EPERM`
while loading `server.js` from `Program Files`; the desktop discarded that
output and consumed two 90-second readiness deadlines. Both candidates passed
automated installed runtime/UI gates and failed Founder acceptance, so the
remaining gap is artifact-to-reference-machine runtime compatibility. The
source also contains substantial catalog, customer, order, delivery,
return/refund, COD, accounting, risk, automation, WhatsApp, AI, integration,
storefront, multilingual UI and test work.

PR #158 exact head `05fffb0ac0885a8f9d5ef56870b026b744233e7d`
passed complete CI and Windows Rust release parity. Its clean Windows MSI built,
installed and matched the complete 3,985-file protected standalone tree. The
fixed signed bootstrap executed on the real installed launch, but its
environment-supplied protected entrypoint still failed in Node's CommonJS
resolver with `EISDIR` while processing `C:`. This isolates the remaining gap
to the native contained-process entrypoint representation/transport rather than
package content, runtime identity, migration, AppData or disk speed. The staged
runtime passed, but it uses Bun's spawn environment and therefore does not prove
the custom `CreateProcessW` environment boundary. This is not yet signed,
installed on the Founder machine or Founder-accepted evidence.

The main remaining discontinuity is product coherence and authority:

- operational pages exist without one fully proven cross-module COD journey;
- shop selection remains process-global/relaunch-oriented rather than a trusted
  live workspace context;
- inventory, money, delivery and return facts are not yet governed by the
  final separate state machines and append-only movement ledgers;
- identity, teams, devices and commercial entitlements are not represented by
  the target model;
- the local trial remains unsuitable for commercial release;
- provider adapters exist without a certified public launch set;
- PWA/storefront/cloud boundaries are prototypes or targets, not the final
  connected platform;
- zero-knowledge cloud recovery and Founder administration are missing;
- UI breadth is substantial but complete AAA journey/page evidence is absent.

The correct characterization is:

> **Accepted Internal.5 baseline plus installed-but-unaccepted Internal.7;
> current Windows runtime-compatibility gate; broad partial desktop product; commercial
> and connected platform still largely ahead.**

## Evidence ledger

| Evidence | Exact authority | Result |
|---|---|---|
| Runtime/session repair | PR #152, merge `f07779a9328dc57f8a2a73a034587b44c31263d6` | Native WebView session handoff and installed visible-UI acceptance integrated |
| Signed-release acceptance | PR #153, merge `d1fb321ea213b0bfbb10042144c4c9b8019254eb` | Exact signed MSI required to pass runtime and visible UI twice |
| Signed Internal.5 build | Actions run `30055297869`, job `89366909225` | Passed |
| Retained artifact | ID `8583209047`, archive SHA-256 `12d310443f99afebc2bf3f0e1486861782f965db5423f83c819bfd3e1f3dfd88` | Verified |
| MSI | `SahelFlow_1.0.0-internal.5_x64_en-US.msi`, SHA-256 `5541cb1cb8519bd09ce36b8b8fd397764d96676f77415932c1bf74ea1480fe7b` | Verified |
| Updater signature | `.msi.sig` SHA-256 `f9f8e689e6c71eaf00eb5d8f991d27a0734ea18e47b75f4d550c7b2ddaf145c9`, public key ID `C7183693A0589B55` | Cryptographically verified |
| Independent artifact checks | Exact retained candidate | 54/54 passed |
| Founder install | Internal.4 → Internal.5 in-place upgrade | MSI hash and AppData preservation passed |
| Founder UI | Installed Internal.5 | Real authenticated hydrated setup/login/workspace UI visible and responsive |
| Founder lifecycle | Installed Internal.5 | Normal close and successful reopen passed |
| Post-acceptance startup incident | Installed Internal.5 on 2026-07-24 | Multi-minute hidden launch, brief dashboard, then `SF-RUNTIME-UI-BLOCKED`; AppData preserved and cause not yet proven |
| Responsive startup correction | PR #156, merge `772d09c3b2ada4668f8c872bfd469cabb839d82a` | Safe startup runs off the event loop; bounded authenticated UI diagnostics integrated |
| Signed Internal.6 build | Actions run `30136644587` | Signature, signed installed runtime/UI, deterministic-source and candidate-evidence gates passed |
| Founder Internal.6 install | Internal.5 to Internal.6 in-place upgrade | Exact release MSI installed as display version `1.0.0.6`; AppData was not deleted |
| Founder Internal.6 startup | Installed Internal.6 on 2026-07-25, SSD | Safe window responsive; runtime prepare began about 02:36:20 and staging about 02:50:18; authenticated UI missed the installer bound; not accepted |
| Runtime-staging removal | PR #157, merge `3db7e4072f403f39632b7134be841047767a2e6d` | Direct protected-runtime resolution integrated; PR CI, Windows Rust and installed MSI/UI gates passed |
| Signed Internal.7 build | Actions run `30142585934`; retained artifact `8615273329` | Exact-main signed build, signature, installed runtime/UI and evidence gates passed |
| Founder Internal.7 install | Internal.6 to Internal.7 in-place upgrade | Exact release MSI installed as display version `1.0.0.7`; AppData was preserved |
| Founder Internal.7 startup | Installed Internal.7 on 2026-07-25, SSD | Startup screen about 1.6 s; migration about 4.6 s; runtime preparation 271 ms; bundled Bun exited with `EPERM` loading protected `server.js`; two readiness deadlines elapsed; not accepted |

The earlier accepted reopen proves that exact historical attempt only.
Internal.6 exposed recursive verification/staging as the dominant 14-minute
mechanism. Internal.7 removed that mechanism and proved prompt runtime
preparation, then exposed a separate Bun Windows module-loader incompatibility
and missing early-exit observation. The same installed entrypoint remained
readable as ordinary data, so basic ACL denial, missing content, AppData loss
and disk class are not adequate explanations. Startup compatibility is blocking
recovery work, not deferred debt.

## Repository shape

At the baseline:

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
| CAP-001 | Signed Windows install/update/runtime | **Partial internal proof** | Internal.5 accepted; Internal.6/7 signed and installed with AppData preserved | Production server runtime compatibility, broader hardware matrix, future A→B repetitions |
| CAP-002 | Local database/migrations | **Partial** | Prisma/SQLite, eight migrations, runtime preservation | All-shop journaled migrations, preflight, rollback/recovery proof |
| CAP-003 | Shop management | **Partial/unsafe** | Per-shop files, shop store/routes, creation UI | Trusted workspace/shop context, live safe switch, no process-global fallback |
| CAP-004 | Local PIN/session | **Implemented for local baseline** | `AuthSecret`, `Session`, runtime auth | Not seller identity, team authority, device or recovery model |
| CAP-005 | Seller identity/workspace/team | **Missing** | Agents/profile UI fragments only | Person/workspace/license, memberships, roles, fields, devices, revocation |
| CAP-006 | Trial/permanent licensing | **Unsafe/partial** | License UI/store/hook and Ed25519 concepts | Online signed machine trial, complete gate, offline permanent issuance and entitlements |
| CAP-007 | Catalog/products/variants | **Partial** | Pages, components, routes, models, import/export | Complete stock authority, bulk/data UX, journey and scale proof |
| CAP-008 | Inventory | **Partial/unsafe** | Stock fields and order lifecycle effects | Reservation and movement ledger, replay/concurrency and physical-return states |
| CAP-009 | Customers/risk | **Partial** | Search, details, blacklist, risk/phone reputation | Complete PII classification, duplicate merge, permissions and journey proof |
| CAP-010 | Orders/confirmation | **Partial** | Order routes/UI/timeline, confirmation queue, status actions | Separate state machines, canonical transition service and full Golden journey |
| CAP-011 | Delivery/couriers | **Partial/unverified** | Delivery model/UI/routes and candidate adapters | Idempotent provider inbox, capability certification, exceptions/reconciliation |
| CAP-012 | Returns/refunds | **Partial/unsafe** | Return/refund models, routes and UI | Atomic append-only stock/money/status compensation |
| CAP-013 | COD/accounting | **Partial** | Expenses, COD fields/reconciliation UI/tests | Carrier receivable/remittance/fee/discrepancy ledger and governed correction |
| CAP-014 | Audit/history | **Partial/unsafe** | `AuditLog`, `OrderChange`, timelines | Trusted actor/device and atomic business audit/movements |
| CAP-015 | Imports/exports | **Implemented/partial** | Product/customer/order/expense import and multiple exports | Preview/mapping/recovery consistency and scale evidence |
| CAP-016 | Local backup/restore | **Partial/unsafe** | Create/list/restore routes and settings UI | All-shop verified snapshots, atomic restore and independent recovery |
| CAP-017 | WhatsApp/inbox | **Partial/unverified** | Sidecar, QR/connect, chats/messages/send and inbox UI | Durable encrypted ingress/egress, restart/replay, supportable certification |
| CAP-018 | Automations | **Partial/unsafe** | Conditions, steps, logs, editor | Transactional outbox, approvals, idempotent effects, receipts/dead letters |
| CAP-019 | AI/extraction | **Partial/unsafe** | Deterministic/Gemini routes, schemas, chat/extraction UI | Central data policy, safe corpus, receipts and bound approvals |
| CAP-020 | Analytics/reporting | **Partial/unverified** | Dashboard, analytics and reporting routes/charts | Financial semantics, representative scale, actionability and complete states |
| CAP-021 | Provider framework | **Candidate/unverified** | Courier/commerce/Sheets integration code | Founder launch set and dated capability-by-capability live certification |
| CAP-022 | Hosted storefront | **Prototype/unsafe boundary** | Builder/view/config and local submit route | Hosted tenant releases, allocation, durable receipt, canonical import/reconciliation |
| CAP-023 | Remote PWA | **Prototype/obsolete boundary** | Manifest/service worker/local shell | Remote identity, encrypted projections, commands, revocation/conflict |
| CAP-024 | Shared cloud/control plane | **Missing** | Target documentation only | Measured multi-tenant control/relay architecture and economics gate |
| CAP-025 | Zero-knowledge cloud backup | **Missing** | Target documentation only | Key hierarchy, client encryption, retention and restore drills |
| CAP-026 | Founder Console | **Missing** | Scattered release/support operations | Private audited seller/trial/payment/license/device/usage/incident UI |
| CAP-027 | Localization/RTL | **Partial/unverified** | i18n hooks, locale-aware UI and RTL foundations | Complete copy/state parity and systematic AR/FR/EN/RTL evidence |
| CAP-028 | Accessibility/keyboard | **Partial/unverified** | Radix primitives, shortcuts, focus-related components | Whole-journey WCAG, zoom, screen-reader and keyboard evidence |
| CAP-029 | AAA design system/page depth | **Partial** | Strong shared UI primitives and broad pages | One coherent system and complete loading/empty/error/degraded/recovery states |
| CAP-030 | Low-end performance | **Unverified; blocking startup defect** | Internal.7 runtime preparation completed in 271 ms on the Founder T470 SSD | Compatible Node-based launch acceptance, representative datasets, budgets and eight-hour stability |
| CAP-031 | Security/privacy/legal | **Partial/unverified** | Crypto, PIN, secrets, loopback auth and redaction pieces | Full threat models, key recovery, tenant boundaries, Law 18-07 and review |
| CAP-032 | Release/operational evidence | **Internal.5 accepted; Internal.7 release-complete** | Exact-source signing, runtime/UI gates, distinct release/Founder acceptance records | Complete the next coherent runtime correction and retain the discipline for every app-changing package |

## Provider status

No external provider has a public Stable support claim from source presence
alone.

| Provider | Current source | Status | Main closure requirement |
|---|---|---|---|
| WhatsApp via Baileys | Sidecar, QR, chats, send, events and delivery updates | Candidate | Durable encrypted history/ingress/egress, credential recovery, replay/reconnect/policy proof |
| Google AI Studio / Gemini | Extraction, chat/tools, schemas and heuristic redaction | Candidate | Central allowlisted privacy policy, bound approvals, quota/outage and multilingual corpus evidence |
| Yalidine | Courier adapter and tests | Architecture candidate | Founder launch-set choice plus real capability-specific certification |
| ZR Express | Courier adapter and tests | Architecture candidate | Founder launch-set choice plus real capability-specific certification |
| Maystro | Courier adapter and tests | Architecture candidate | Founder launch-set choice plus real capability-specific certification |
| Procolis | References/implementation knowledge | Experimental/optional | Founder scope plus full certification |
| DHD/other guessed courier code | Experimental endpoints/knowledge | Not approved | Keep hidden unless Founder scope and full certification exist |
| Shopify | Polling/pagination/update/dedup knowledge | Named conditional candidate | Durable hybrid inbox/reconciliation and live edit/cancel/rate-limit proof |
| WooCommerce | Polling/pagination/update/URL controls | Named conditional candidate | Durable ingress plus host/plugin/version/live capability matrix |
| YouCan | Full-scan polling/normalization/dedup | Named conditional candidate | Durable efficient reconciliation and event/update semantics proof |
| Google Sheets | Service-account export/batching | Architecture candidate | Founder scope, field/privacy/idempotency/quota/live proof |
| Cloudflare | Target control/relay/backup/storefront architecture | Planned | Phase 6 implementation, tenant/security/recovery and economics evidence |
| Sentry | Environment-gated diagnostics/redaction hooks | Optional internal candidate | Consent, minimization, retention, canary/outage/deletion proof |
| GitHub Releases/Tauri updater | Signed internal workflow and installed proof | Internal.5 accepted; Internal.7 signed and installed but not accepted | Next Node-runtime acceptance; Beta/Stable promotion remains separate |

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
connected planes without replacing the canonical desktop.

## Keep and harden

- Tauri Windows host and packaged-runtime supervision.
- Next.js/App Router product surface where it remains performant.
- Prisma/SQLite per-shop local authority.
- Existing product, customer, order, delivery, return, accounting and risk
  behavior that survives the target invariants.
- Shared multilingual/RTL component foundations.
- Runtime authentication, signature verification, updater and evidence
  infrastructure.
- Existing tests and provider knowledge when they prove the right contract.

## Migrate or replace

- Process-global active-shop routing → authenticated workspace/shop context.
- Direct stock fields/effects → reservations and append-only movement ledger.
- Conflated statuses → separate order/delivery/inventory/financial/return state
  machines.
- Best-effort audit/effects → atomic audit and durable inbox/outbox.
- Local PIN as identity → local unlock plus real person/workspace/member/device
  authority.
- Self-issued/local trial authority → online trial-only signed issuance and
  offline permanent entitlement.
- Direct provider callback mutation → authenticated persisted idempotent event
  processing and reconciliation.
- Local storefront submit → hosted durable receipt and desktop canonical
  import.
- Local-server PWA → authenticated remote projections and commands.
- Byte-copy backup → verified encrypted all-shop recovery and zero-knowledge
  cloud retention.

## Retire or defer

- GLM, Codex Cloud and their continuity/bootstrap workflow.
- Separate status, wave, gap, prompt and authority documents superseded by the
  consolidated documentation set.
- Uncertified provider claims.
- Seller-owned Cloudflare/BYOC as the default deployment.
- Native mobile, generic international ERP, marketplace/ecosystem and
  speculative AI expansion before the core product is complete.

## Immediate next boundary

Internal.7 fixed recursive runtime preparation but did not close the acceptance
loop because Bun's Windows module loader exited on the protected Next.js
entrypoint and the desktop waited full readiness deadlines after process exit.
The immediate implementation boundary is:

> Launch the release-verified standalone server on pinned Node.js from the
> MSI-protected installation, fail immediately on child exit, and open the real
> workspace promptly on the Founder T470 without deleting AppData, weakening
> fail-closed runtime/shop authority or loading a fallback workspace.

The next coherent candidate must retain bounded redacted attempt evidence, pass
exact-source checks and installed Windows packaging in GitHub Actions, prove no
user-writable runtime copy or developer-PATH fallback exists, ship as one new
signed Internal update, and pass preserved-AppData launch plus close/reopen
acceptance on the T470. Only then may the workspace/shop and business-integrity
boundary resume. The exact sequence and exit gates are in
[`ROADMAP.md`](ROADMAP.md).
