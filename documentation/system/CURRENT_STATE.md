# SahelFlow — Current State

> **Authority:** merged protected `main` only
> **Protected-main executable baseline:** `ab3c1fb46bbe028745321d7469ae0924e9f236bd`
> **Source version:** `1.0.0-internal.10` / MSI `1.0.0.10`
> **Latest signed candidate:** `1.0.0-internal.10`, run `30201584875`
> **Latest Founder-installed acceptance:** `1.0.0-internal.5`
> **Current installed status:** Internal.10 is installed with AppData preserved
> but unaccepted because the observed Founder launch took multiple minutes
> **Observed machine:** Founder ThinkPad T470
> **Last assessed:** 2026-07-27

This document describes what integrated source and named evidence prove now. It
does not convert target architecture, adapter presence, test count, mock output
or planned scope into a readiness claim. Unmerged work belongs in
[`../operations/WORKING_MEMORY.md`](../operations/WORKING_MEMORY.md).

## Executive truth

SahelFlow is a broad internal Windows application with a proven Internal.5
accepted baseline and a signed, installed-but-unaccepted Internal.10. It is not
an empty prototype, but it is not yet a commercially complete or AAA SahelFlow
1.0 product.

PR #158 app source `1cd9a27fc747d85979427e51eff9b0ba8b7ba7a7`
replaced the failing packaged Bun server with pinned Node.js 22.23.1, retained
the protected `Program Files` runtime authority, added fail-fast contained-child
exit evidence and passed exact-head CI, Windows Rust and installed MSI/UI gates.
PR #159 at `eca2111a18fb900e9880177848ada497fd07ab72` corrected the signed
release's disposable test-database preparation. Signed run `30183140347` then
built, signed, installed and published exact app source Internal.8.

PR #160 at `d516e5fe3459f9e5efba15b6019f1e063a81c10c` integrated the
full-size startup shell, bottom viewport containment, runtime-listening trace
and repeat-launch Node compile cache. Signed run `30190505041` built and
published immutable Internal.9 and passed installed runtime/UI launch, close and
reopen gates. On the Founder installation, the live Internal.9 manifest and
signature were reachable but no update prompt appeared. Source inspection
proved the loopback-hosted workspace was not listed in Tauri capability remote
URLs, both effective CSP layers omitted the IPC transport and automatic updater
access failures were hidden. Internal.10 is the focused bootstrap correction.
It also supersedes the Internal.9 startup shell with the single-window launch
contract in FD-025: no separate splash or startup window, the authenticated
dashboard is the first visible successful state, and the same main window owns
actionable recovery on failure.

PR #161 merged the correction at
`ab3c1fb46bbe028745321d7469ae0924e9f236bd`. Exact-head run `30200603507`
passed every selected source, Rust, Windows runtime and installed-MSI lane;
signed run `30201584875` built and published immutable Internal.10 and passed
clean installed launch/close/reopen gates. The Founder installation upgraded in
place to `1.0.0.10`, and the retained registry and shop-database identities
matched exactly before and after installation. The real dashboard eventually
opened, but only after multiple minutes. Internal.10 is therefore not accepted;
installed dashboard-first visibility, bottom containment, target cold/warm
launch, close/reopen and the next-version in-app updater path remain unproven.

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

> **Accepted Internal.5 baseline; Internal.10 source, signed release and
> preserved installation complete but Founder acceptance blocked by multi-minute
> launch; broad partial desktop product; commercial and connected platform still
> largely ahead.**

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
| Node packaged runtime | PR #158, merge `1cd9a27fc747d85979427e51eff9b0ba8b7ba7a7` | Pinned Node 22.23.1, native containment, fail-fast exit diagnostics and exact-head CI/Rust/MSI gates passed |
| Release DB fixture | PR #159, merge `eca2111a18fb900e9880177848ada497fd07ab72` | Signed workflow prepares the disposable staged database before packaged-runtime verification |
| Signed Internal.8 build | Actions run `30183140347` | Exact app source built, signed, installed twice, published with updater signature and `latest.json` |
| Founder Internal.8 install | Internal.7 to Internal.8 in-place upgrade | Exact MSI SHA-256 `5D5DC9A26BC32304EE1A8D850A566A2AE2F3EB8A40CB6CDFE5FD69618AFD85D0`; AppData preserved |
| Founder Internal.8 lifecycle | Installed Internal.8 on 2026-07-26, SSD | Authenticated dashboard visible; normal process-tree close and new-instance reopen passed |
| Founder Internal.8 startup/layout | Installed Internal.8 on 2026-07-26, SSD | About 42.5 s to authenticated UI; separate-window transition is jarring and bottom sidebar/footer can clip; not accepted |
| Startup/layout correction | PR #160, merge `d516e5fe3459f9e5efba15b6019f1e063a81c10c` | Full-size startup shell, viewport containment, listening trace and repeat-launch compile cache integrated |
| Signed Internal.9 build | Actions run `30190505041` | Exact source built, signed, installed twice in clean release gates and published with updater signature and `latest.json` |
| Founder Internal.8 updater attempt | Installed Internal.8 on 2026-07-26 | Internal.9 feed returned HTTP 200 but no prompt appeared; loopback Tauri capability/CSP authorization was absent and the updater check failure was silent |
| Internal.10 updater/direct-launch correction | PR #161, merge `ab3c1fb46bbe028745321d7469ae0924e9f236bd`; reviewed head `776a91410439e0195e11d48db604d855a22e2b75` | Exact-head run `30200603507` passed every selected risk-routed lane |
| Signed Internal.10 build | Actions run `30201584875`; tag `sahelflow-v1.0.0-internal.10-ab3c1fb46bbe028745321d7469ae0924e9f236bd` | Signed MSI, signature and updater manifest published; clean installed launch/close/reopen gates passed |
| Founder Internal.10 install | Internal.8 to Internal.10 in-place bootstrap on 2026-07-27 | MSI SHA-256 `DF9F038C3BE3FF7F814CB053CE8B20F00088FDF8FB46935E1E8BAC5C3C436A85`; display version `1.0.0.10`; registry and shop-database pre/post identities matched |
| Founder Internal.10 launch | Installed Internal.10 on 2026-07-27, SSD | Real dashboard eventually opened and process was responsive, but launch took multiple minutes; no current-version updater prompt is expected; not accepted |

The earlier accepted reopen proves that exact historical attempt only.
Internal.6 exposed recursive verification/staging as the dominant 14-minute
mechanism. Internal.7 removed it and isolated Bun's installed loader failure.
Internal.8 closes runtime compatibility and lifecycle correctness. Internal.9
integrates the first startup/layout correction. Internal.10 closes the updater
bootstrap and reaches the real Founder dashboard with AppData preserved, but
its multi-minute launch fails the performance contract. This is installed
evidence, not a claim that the wider product is complete.

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
| CAP-001 | Signed Windows install/update/runtime | **Partial internal proof** | Internal.5 accepted; Internal.10 signed and installed in place with AppData preserved | Prove the next real in-app A→B update, target launch timing, full Founder lifecycle and a broader hardware matrix |
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
| CAP-030 | Low-end performance | **Unmet on Founder launch** | Internal.10 retains listening trace and repeat-launch compile cache, but the observed Founder launch took multiple minutes | Isolate the dominant cold/warm startup stage, meet the ≤8 s p95 launch contract, then prove representative datasets and eight-hour stability |
| CAP-031 | Security/privacy/legal | **Partial/unverified** | Crypto, PIN, secrets, loopback auth and redaction pieces | Full threat models, key recovery, tenant boundaries, Law 18-07 and review |
| CAP-032 | Release/operational evidence | **Internal.5 accepted; Internal.10 release/install complete** | Exact-source signing, runtime/UI gates, preserved Founder installation and distinct release/acceptance records | Close Internal.10 performance/lifecycle acceptance and prove the next real in-app update |

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

The superseded runtime boundary was: **Launch the release-verified standalone
server on pinned Node.js**. Internal.8 achieved that protected-runtime
mechanism; the phrase remains here as historical continuity, not the current
next action.

Internal.10 is installed and reaches the authenticated dashboard, so the
updater bootstrap is no longer the immediate blocker. Its multi-minute Founder
launch violates the ≤8 s p95 target and blocks acceptance. The immediate
implementation boundary is:

> Use retained installed startup timings to isolate the dominant cold and warm
> launch stage, correct the root cause across every affected layer, and make the
> authenticated dashboard the first visible responsive surface within target
> on the Founder T470 without reinstalling Internal.10, deleting AppData,
> weakening fail-closed authority or loading a fallback workspace.

The next coherent candidate uses the fast draft lane while coding, runs selected
heavy evidence once at its reviewable head, ships as one new signed Internal
through the recovered in-app updater and proves AppData preservation, bottom
containment, normal close and reopen. Only then may the workspace/shop and
business-integrity boundary resume. The exact sequence and exit gates are in
[`ROADMAP.md`](ROADMAP.md).
