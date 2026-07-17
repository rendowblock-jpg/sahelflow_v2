# SahelFlow 1.0 — Current-to-Target Analysis

> **Status:** Active engineering truth for planning and migration  
> **Code baseline:** `fd9fa97dfcf96e08ffa1273070e74c4bb6db980e` (`main`, 2026-07-16)  
> **Target authority:** `../product/LAUNCH_CONSTITUTION.md`, `../product/FOUNDER_DECISIONS.md`, `../product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md`, `ENGINEERING_SPECIFICATION.md`  
> **Evidence rule:** Source inspection proves implementation shape, not packaged, provider, performance, security-review, recovery, or seller readiness.

## 1. Executive conclusion

SahelFlow is already a broad operational application, not an empty prototype. The repository contains substantial Windows/Tauri, Next.js, Prisma, SQLite, order-management, inventory, customer, delivery, return, refund, accounting, COD, risk, automation, WhatsApp, AI, integration, storefront, localization, accessibility, and test work.

The finished SahelFlow 1.0 described by the Founder is nevertheless **not a hardening-only continuation** of the current application. The current implementation was built around several assumptions that the final product explicitly replaces:

1. one local owner and a global active shop;
2. browser/local state as part of license authority;
3. best-effort callbacks and fire-and-forget effects;
4. localhost as the boundary for PWA, storefront, WhatsApp, and connected workflows;
5. local file copies as backup;
6. source/dev-server tests as the main proof of readiness;
7. three-platform packaging despite a Windows-only launch contract.

The correct path is therefore neither “rewrite everything” nor “keep adding features.” It is a controlled migration:

- **preserve** the product surfaces and domain knowledge that already create value;
- **harden** code whose authority is already correct;
- **migrate** reusable behavior behind new trusted boundaries;
- **replace** unsafe authorities and protocols;
- **retire** obsolete implementation and documentation only after its durable value is preserved.

The four structural discontinuities are:

- **trusted context:** shop, tenant, member, device, session, actor, permission, and entitlement must be explicit and authenticated;
- **durable effects:** business writes, audit, domain events, provider intents, receipts, retries, checkpoints, and compensations must be recorded durably;
- **connected product boundaries:** cloud control, relay, backup, PWA, and storefront must become real bounded systems rather than extensions of localhost;
- **release evidence:** a signed installed Windows candidate, migration/recovery drills, provider certification, low-end measurements, and real beta evidence must govern claims.

## 2. Assessment method and status language

This analysis combines the current product contract, active architecture, and a source-level inspection of the application layers. It does not claim that the application was launched, packaged, installed, connected to real providers, or exercised on the Founder’s machine during this documentation wave.

Status terms:

- **Implemented and reusable** — coherent code exists and the direction remains valid, but launch evidence may still be missing.
- **Partial** — useful implementation exists, but a required authority, protocol, workflow, or proof is incomplete.
- **Unsafe** — implementation exists but can violate a launch invariant under failure, tampering, ambiguity, concurrency, recovery, or cross-context use.
- **Missing** — the target system is not meaningfully implemented.
- **Obsolete** — the implementation or claim encodes a superseded product decision.
- **Unverified** — source exists, but the required packaged, provider, device, recovery, security, or user evidence does not.

Disposition terms:

- **Keep** — preserve the architecture and implementation direction.
- **Harden** — preserve the implementation and close bounded safety/evidence gaps.
- **Migrate** — preserve behavior or UI behind a new authority/interface/data model.
- **Replace** — the current authority or protocol cannot satisfy the product contract.
- **Retire** — remove after replacement, migration, references, and rollback implications are complete.

## 3. Finished-product system shape

The target SahelFlow 1.0 is a desktop-authoritative, selectively connected system:

```text
Canonical Windows desktop
├── explicit installation / tenant / member / device / shop context
├── one encrypted operational SQLite database per shop
├── domain transactions + trusted audit + event/outbox records
├── provider workers + reconciliation
├── local entitlement and identity cache
├── verified backup and migration coordinator
└── encrypted relay connector
        │
        ├── bounded Cloudflare control plane
        ├── encrypted projection / command relay
        ├── zero-knowledge backup object store
        ├── hosted multi-tenant storefront runtime
        └── operational PWA/browser companion
```

The desktop remains final business-write authority. Cloud services hold only approved control, routing, encrypted projection, backup, and public storefront data. Remote acceptance never equals business commitment until the canonical desktop commits and acknowledges the result.

## 4. Current implementation map

The current application is approximately:

```text
Tauri host
├── fixed localhost Next.js standalone server
│   ├── React / App Router UI
│   ├── Server Components and API routes
│   ├── Prisma service/domain code
│   ├── per-shop SQLite files selected through app-meta.json
│   ├── encrypted PII and encrypted Secret rows
│   ├── provider clients
│   └── local storefront and PWA shell
└── Bun / Baileys WhatsApp sidecar on fixed localhost port
```

Important reusable foundations already exist:

- a mature multilingual UI and broad daily-operational surface;
- integer DZD money fields and centralized revenue formulas;
- order state transitions, inventory effects, COD tracking, returns, refunds, expenses, risk, and analytics;
- per-shop SQLite files and a Prisma model with meaningful indexes;
- AES-GCM helpers, blind indexes, Ed25519 verification, PIN hashing, signed updater support, and loopback sidecar authentication;
- adapter patterns for couriers and commerce platforms;
- typed Gemini extraction and tool schemas;
- transaction-focused unit/integration regression coverage;
- Tauri packaging, bundled server/runtime/sidecar preparation, and updater integration.

The main risk is not the absence of code. It is that visible features are built on uneven authorities and failure guarantees.

## 5. Comprehensive gap matrix

| Area | Current state | Finished SahelFlow 1.0 | Gap / disposition | Closure phase |
|---|---|---|---|---|
| Product identity and version | Product docs say 1.0; package, Cargo and Tauri say 4.1.0 | One generated version/build/schema/protocol authority | **Unsafe — replace version authority** | Phase 0 |
| Repository verification | Workflows exist, current head has no recorded run, CI invokes an undefined `sf-verify` script | Clean-checkout required checks with retained evidence | **Unsafe — repair and prove** | Phase 0 |
| Release | Local script pushes/tags before build; CI targets Windows, Linux and macOS | Artifact-first, signed Windows-only candidate promotion | **Unsafe — replace** | Phase 0–1 |
| Desktop runtime | Tauri packages Next.js and WhatsApp child processes on fixed ports with partial supervision | Authenticated dynamic endpoints, readiness state, crash recovery and support diagnostics | **Partial/unsafe — migrate** | Phase 1 |
| Shop isolation | Separate SQLite files and registry exist | Explicit trusted `ShopContext`; no silent fallback | **Partial/unsafe — keep files, replace routing** | Phase 1 |
| Shop registry | Plain JSON, synchronous reads, global active shop, fallback behavior | Atomic, versioned, validated registry with recovery state | **Unsafe — replace** | Phase 1 |
| Migrations | Startup targets `dev.db`; broad failure is treated as baseline; all shops are not coordinated | Append-only, all-shop, journaled, resumable, backup-gated migration | **Unsafe — replace** | Phase 1 |
| PII encryption | Useful AES-GCM/blind-index extensions cover selected fields | Versioned key hierarchy, complete field inventory, context binding and recoverability | **Partial — harden/migrate** | Phase 1–2 |
| Root and secret keys | One plaintext key file unlocks PII and provider secrets | OS-protected installation root and wrapped purpose/shop keys | **Unsafe — replace** | Phase 2 |
| Local auth | One PIN, HMAC sessions and setup-mode bypass | Owner/member/device/session identity with fail-closed bootstrap and revocation | **Unsafe/partial — migrate** | Phase 2 |
| Teams and field permissions | Assignee/team fields are free-form; no trusted member model | Owner + 10 members, roles, field policy, assignments, approvals and devices | **Missing** | Phase 2 |
| Trial and licensing | Browser self-issues trial; local storage and legacy status paths remain; enforcement is not universal | Signed online one-per-machine trial, full lockout, permanent offline use, transfer and resource entitlements | **Unsafe/missing — replace around reusable Ed25519** | Phase 2 |
| Payment/founder administration | No professional payment verification, issuance, transfer, incident or support plane | Manual BaridiMob/CCP review, immutable approval, offline signing and support controls | **Missing** | Phase 2 and 4 |
| Order/catalog/customer core | Broad services and UI exist; many operations are transactional | Same features under explicit shop/actor/permission/event authority | **Implemented and reusable — migrate/harden** | Phase 3 |
| Inventory | Product and variant stock exist; order transitions adjust stock | Reservation/adjustment ledger, replay safety and exact compensation | **Partial — migrate** | Phase 3 |
| Returns/refunds | Rich flows exist, but related state transitions can commit separately; reversal re-derives side effects heuristically | Exact append-only money, stock, status and accounting compensation facts | **Unsafe — redesign while preserving UI/history** | Phase 3 |
| COD/accounting | Collected/remitted fields, references, metrics and UI exist | Durable remittance/discrepancy ledger with permissioned corrections and reconciliation | **Partial — keep/migrate** | Phase 3 |
| Audit | AuditLog and OrderChange exist; actors are strings; many writes are best-effort | Trusted actor/session/device and atomic audit with the business transaction | **Partial/unsafe — migrate** | Phase 3 |
| Automation | Conditions, steps, dry-run, retries and UI exist; dispatch is fire-and-forget | Transactional outbox intents, idempotent workers, receipts, dead letters, approvals and recovery | **Unsafe — preserve authoring, replace execution** | Phase 3 |
| WhatsApp | Real Baileys sidecar, QR, chats, send, WS events and receipts; message store is volatile | Durable encrypted ingress/egress, replay, history, identity, recovery and live certification | **Partial/unsafe — migrate** | Phase 3 and 5 |
| Commerce sync | Shopify/Woo/YouCan adapters, paging and update polling exist | Durable hybrid webhook + reconciliation inbox with contiguous checkpoints | **Unsafe — preserve adapters, replace sync authority** | Phase 3 and 5 |
| Couriers | Capability-like adapter code and several provider implementations exist; some endpoints are experimental | Capability registry and dated live certification per action/provider | **Partial/unverified — migrate/certify** | Phase 5 |
| AI | Regex fallback, Gemini extraction/chat, schemas, tools and partial redaction exist | Central provider/model policy, allowlisted payloads, request receipts and bound approval records | **Partial/unsafe — keep UX/schemas, migrate authority** | Phase 5 |
| Google Sheets | Functional service-account export path exists | Shop/member/field permission, privacy scope, idempotency and live evidence | **Partial/unverified — harden/certify** | Phase 5 |
| Local storefront | Builder/view/checkout exist and derive price server-side | Hosted tenant/shop allocation, immutable releases and durable receipt relay | **Unsafe for target — migrate builder, replace checkout/runtime** | Phase 5 |
| PWA | Service worker caches shell and requires the local Next.js server for data | Authenticated remote operational companion with encrypted projections/commands/conflicts | **Obsolete as architecture — retire and rebuild boundary** | Phase 4–5 |
| Cloud control and relay | No implementation | Bounded control plane, identity/entitlement services and encrypted command/projection relay | **Missing** | Phase 4 |
| Backup/recovery | Active-shop local byte copy; checkpoint/disconnect/integrity are best-effort | All-shop verified snapshots, zero-knowledge cloud retention, recovery kit and replacement-machine drills | **Unsafe/missing — replace** | Phase 2 and 4 |
| Onboarding | Optional skippable business/provider/AI/product wizard | Installation preflight, owner/license/shop/recovery setup and guided first operational outcome | **Partial — redesign after authorities exist** | Phase 2 and 6 |
| UX/i18n/RTL | Strong AR/FR/EN, RTL, responsive shell, modern tables and workflows | Complete accessible desktop/PWA/storefront journeys under real permissions and failures | **Implemented but unverified — keep/harden** | Continuous; gate in Phase 6 |
| Performance | Query/index optimizations exist; heavy RSC loads and three-process runtime remain | Target dataset, 4 GB floor and T470 packaged budgets | **Unverified — measure before claiming, then optimize** | Phase 0–1 and 6 |
| Observability/support | Structured logs, optional Sentry and best-effort audit exist | Correlated health, process/provider/queue/migration/backup diagnostics and consented support bundles | **Partial — migrate** | Phase 1–4 |
| Testing | Large Vitest and Playwright suites exist; multi-shop and provider behavior are mocked or bypassed; E2E uses dev server | Risk-based CI plus signed installed-candidate, provider, recovery, security and low-end evidence | **Implemented but insufficient — preserve and expand** | Phase 0 onward |
| Documentation | Rich contract and architecture exist beside transition records, duplicated ledgers and historical redirects | Small durable authority set with current source truth and one execution path | **Drifted — consolidate in this reset** | This documentation wave |

## 6. Gap analysis by engineering level

### 6.1 Product and commercial contract

#### What is already strong

The Founder-approved product package is unusually specific. It defines Algeria/COD/WhatsApp focus, Windows and low-end constraints, one-time pricing, included shops, teams, remote access, storefronts, backup, AI ownership, provider certification, trial behavior, update support, and evidence gates. These are not vague ambitions.

#### Main gap

The application does not yet have a single entitlement or identity model capable of enforcing the contract. Existing `features:["all"]` licensing cannot express:

- five included shops and five paid expansion slots;
- owner plus ten active members;
- personal/owner device limits;
- canonical installation state;
- purchased product major;
- five-year connected-support horizon;
- transfer/recovery state;
- backup/media resource entitlements.

The commercial contract is therefore documented but not yet represented as executable claims.

#### Required migration

Preserve Ed25519 primitives and current activation UI concepts. Replace self-issued trials, browser authority, trusted status rows, arbitrary feature gating, and incomplete API enforcement with one signed entitlement service used by UI, API, background workers, provider workers, PWA, storefront allocation, and founder administration.

### 6.2 Runtime, packaging and release

#### What exists

Tauri packages a Next.js standalone server, Prisma resources, migration scripts, a bundled runtime and a compiled WhatsApp sidecar. The updater verifies signed manifests. The Rust host tracks child handles and includes sidecar restart logic.

#### Structural gaps

- fixed ports remain part of readiness;
- service authentication and token bootstrap are not one coherent per-launch protocol;
- a missing server/runtime can log and return rather than enter a blocking recovery state;
- startup migrations and service readiness are coupled to one default path;
- Windows, Linux and macOS targets remain in release configuration despite the Windows-only launch contract;
- the local release script changes and pushes source before candidate proof;
- clean installed-candidate tests are absent.

#### Target

A Windows-only candidate pipeline produces immutable signed artifacts first. A local supervisor owns endpoint reservation, per-launch authentication, migrations, health, restart budgets, logs and failure UI. Publication follows evidence and Founder approval, never precedes build/test/signing.

### 6.3 Data authority, shops and migrations

#### What exists

The one-file-per-shop model is aligned with the target. The Prisma schema is broad and indexed. The active-shop proxy makes existing code easy to reuse.

#### Structural gaps

The same proxy hides the most important authority:

- API/background code does not receive explicit shop context;
- registry failure can fall back to another database;
- global active shop can affect public storefront and background work;
- tests intentionally bypass real multi-shop routing;
- new shops use `prisma db push --accept-data-loss`;
- packaged migration targets `shops/dev.db`;
- migration failures can be misclassified as baseline and still exit successfully;
- backup is not a verified all-shop prerequisite.

#### Target

Every write receives a trusted `ShopContext`. The registry is atomic, versioned and recoverable. Migrations enumerate every shop, validate compatibility, obtain verified snapshots where required, journal progress, stop on failure and produce a readable report.

### 6.4 Cryptography, secrets and recovery

#### What exists

AES-256-GCM field encryption, blind-index search, race-safe initial key generation and encrypted `Secret` rows are useful foundations.

#### Structural gaps

One readable key file is the root for multiple purposes. There is no protected installation root, per-shop key separation, backup key separation, authenticated recovery kit, versioned key registry, or tested replacement-machine ceremony. File permissions are not a complete Windows security and recovery design.

#### Target

Use a protected installation root and wrapped subkeys with explicit identifiers, versions and context. Existing ciphertext is migrated through a resumable journal. Recovery material is user-controlled; SahelFlow/cloud cannot decrypt seller operational data.

### 6.5 Identity, authorization and trusted actor

#### What exists

PIN hashing, session cookies, revocation rows, route middleware, and defense-in-depth API checks exist.

#### Structural gaps

The setup bypass is broad, identity is not associated with a tenant/member/device/shop policy, and many audit or workflow fields use free-form strings. There is no field authorization, device enrollment, invitation, workgroup, owner approval or remote revocation model.

#### Target

Migrate the current owner into first-class tenant/member/device/session records. Build trusted request context and policy enforcement before team/PWA behavior. UI hiding is not authorization. High-risk actions require current permission and re-authentication or an approval receipt.

### 6.6 Domain correctness and financial integrity

#### What exists

The order lifecycle, stock side effects, customer statistics, returns, refunds, reversal, COD collection/remittance, expenses and canonical revenue metrics show deep domain work.

#### Structural gaps

Correctness is still spread across several services and transaction boundaries:

- order update, provider update, return completion, refund, customer statistics, stock, audit and automation may not share one atomic record;
- related second-stage transitions can fail after the first state is committed;
- audit failures are swallowed;
- automation and low-stock effects are dispatched after commit without durable intent;
- refund reversal reconstructs what happened from timing and ledger heuristics;
- some derived customer statistics use different definitions across services.

#### Target

Introduce one transaction kernel that records domain state, trusted audit, domain event, outbox/projection intent, idempotency and explicit compensation facts together. Migrate business flows incrementally. Existing UI and historical rows can remain while new ledgers become canonical.

### 6.7 Connected effects and providers

#### What exists

There is meaningful provider-specific knowledge: WhatsApp lifecycle, Shopify update polling, WooCommerce pagination, YouCan limitations, courier status mapping, rate-limit handling, Google Sheets batching, and Gemini fallback behavior.

#### Structural gaps

Adapters are called directly from request/business code. Provider acknowledgement, retry, dead-letter, reconciliation, cursor advancement and local commit are not one durable protocol. Commerce watermarks can advance after per-order failures. WhatsApp history and delivery callback persistence can be lost during process outages. Courier POST ambiguity can create an external parcel without a local receipt.

#### Target

Current adapters become producers/consumers of a shared durable provider framework:

- inbox event before acknowledgement;
- stable source identity and resource version;
- transactional normalization/domain commit;
- outbox effect with idempotency key;
- effect attempts and receipts;
- dead-letter and operator repair;
- contiguous checkpoints;
- scheduled reconciliation;
- live capability certification.

### 6.8 Cloud, PWA, storefront and backup

#### What exists

The application has responsive UI, a service worker, local storefront authoring/checkout and local backup controls. Those are useful prototypes and UX assets.

#### Structural gap

All four target connected systems are effectively missing as system boundaries:

- no Cloudflare control plane;
- no encrypted relay/projection/command protocol;
- no zero-knowledge object backup;
- no hosted tenant/storefront/shop allocation;
- no immutable storefront release;
- no durable hosted checkout receipt;
- no remote device/member identity or command result state.

The current storefront and PWA are coupled to whichever local shop/server is active, so they cannot be safely expanded in place.

#### Target

Build identity, entitlement, key and durable-event foundations first. Then implement the bounded control plane and relay. Migrate responsive views into the PWA boundary and storefront builder data into versioned hosted releases. Retire local direct checkout after import parity and reconciliation are proven.

### 6.9 UX, onboarding, accessibility and performance

#### What exists

The UI has modern navigation, tables, SWR data fetching, optimistic updates, undo, dashboards, AR/FR/EN, RTL, keyboard/accessibility work, responsive layouts, rich settings, and broad workflows.

#### Gaps

- loading many customers/products/orders/risk assessments in Server Components can undermine large-shop and low-end targets;
- live inbox and persisted workflow views represent different data realities;
- onboarding is optional and does not establish the required identity/license/recovery state;
- product surfaces do not yet express queued, stale, committed, rejected, degraded, dead-letter, recovery, permission, or lockout states consistently;
- no installed Windows, 4 GB, T470, screen-reader, zoom, or real mobile evidence currently proves the experience.

#### Target

Keep the design system and components, but rework journeys around the new authorities. Performance changes follow traces and target datasets, not premature rewrites. The final experience must make authority and failure visible without exposing technical complexity.

### 6.10 Verification, operations and support

#### What exists

The repository includes a broad test suite, cross-table scenarios, E2E paths, structured logging, optional Sentry, updater code and release workflows.

#### Gaps

- current main has no attached workflow run result;
- CI references an undefined `sf-verify` package script;
- dependency audit is non-blocking;
- E2E is not a pull-request gate and exercises `next dev`;
- providers, multi-shop routing, Windows startup, signed MSI, migration, updater, backup restore, low-end performance and beta are not proven;
- support diagnostics and founder administration are incomplete.

#### Target

Evidence is produced continuously at the risk-appropriate layer. “Implemented” and “tested” remain distinct from “verified.” Stable requires a signed installed candidate, exact artifact manifest, provider certification, recovery drills, low-end report, security review, accessibility report and beta exit evidence.

## 7. Target metrics and current proof status

These are product acceptance metrics, not current claims.

### 7.1 Commercial and entitlement metrics

| Metric | Target | Current proof |
|---|---:|---|
| One-time complete-edition price | 35,000 DZD | Documented; no executable payment/entitlement workflow |
| Included shops | 5 | App allows up to 10 through local count, without signed slots |
| Extra shops | Up to 5 at 5,000 DZD each | Missing purchase/slot accounting |
| Active team members | 10 + owner | Missing trusted team implementation |
| Personal devices per member | 2 | Missing |
| Owner remote devices | 3 | Missing |
| Same-major connected continuity | 5 years | Documented; missing entitlement/service enforcement |
| Storefronts | 1 per entitled shop | Local config exists; entitlement and hosted allocation missing |
| Base backup storage | 20 GB shared | Missing cloud backup |
| Pinned recovery points | Up to 3 per shop | Missing |

### 7.2 Certified data profiles

| Profile | Target per active shop | Current proof |
|---|---|---|
| Low-end | 50k orders, 250k items, 50k customers, 5k products, 25k variants, 50k conversations, 250k messages, ~2 GB DB | Schema/index work exists; no packaged reference-device certification |
| High-volume recommended hardware | 100k orders, 500k items, 75k customers, 10k products, 50k variants, 100k conversations, 1m messages, 2m history/effect records, ~5 GB DB | Not certified |

### 7.3 Desktop experience metrics

| Metric | Target | Current proof |
|---|---:|---|
| Cold usable shell, low-end SSD | ≤ 15 s p95 | Missing packaged measurement |
| Cold usable shell, HDD | ≤ 25 s p95 | Missing |
| T470 cold launch | ≤ 8 s p95 | Missing |
| Common navigation | visible response ≤ 100 ms; usable page ≤ 1.5 s p95 | Source optimizations only |
| Indexed search, low-end | ≤ 750 ms p95 | Missing target-dataset measurement |
| Ordinary local mutation | ≤ 1 s p95 excluding provider latency | Missing packaged measurement |
| Steady working set | ≤ 750 MB with WhatsApp connected | Missing |
| Eight-hour memory growth | No sustained growth | Missing |

The Engineering Specification has slightly tighter internal budgets for some runtime metrics. Until measured evidence selects one approved threshold, the stricter threshold governs engineering and the product-scope threshold governs the public acceptance minimum.

### 7.4 Storefront and connected metrics

| Metric | Target | Current proof |
|---|---:|---|
| Mobile LCP p75 | ≤ 1.8 s | No hosted storefront |
| Mobile INP p75 | ≤ 150 ms | No hosted storefront |
| CLS p75 | ≤ 0.05 | No hosted storefront |
| Checkout API p95 | ≤ 500 ms in approved regional tests | No hosted checkout |
| Storefront availability objective | ≥ 99.95% | No hosted service |
| Durable receipt before success | 100% | Current local checkout does not meet target boundary |
| Duplicate canonical effect on retry | 0 | No durable receipt/import protocol |
| Cross-tenant leakage | 0 | No tenant implementation |
| Public price mismatch | 0 | Current route derives local price server-side; hosted proof missing |
| Remote commands/month/license | Validate at least 250,000 | No relay |
| Operational notifications/month/license | Validate at least 100,000 | No relay |
| Storefront sessions/month/license | Validate at least 250,000 | No hosted storefront |
| Durable COD submissions/month/license | Validate at least 25,000 | No hosted checkout |

### 7.5 Quality and evidence metrics

| Gate | Target | Current proof |
|---|---|---|
| Unresolved P0/P1 defects | 0 at Stable | Not established |
| Binding CI | Clean checkout, required checks | Not currently proven |
| Signed Windows installer/updater | Exact candidate and hashes | Source support exists; no current evidence |
| All-shop migration/restore | Proven | Missing |
| Provider live certification | Every public capability | Missing |
| Independent security/privacy review | Required | Missing |
| AR/FR/EN + RTL/LTR + accessibility | Launch-critical journeys | Implemented broadly; unverified |
| Representative seller beta | 3–5 businesses | Missing |
| Representative live storefronts | 5 | Missing |

## 8. Root-cause map

Most gaps are consequences of six architectural roots:

1. **Implicit global context**  
   Active shop, single owner and process-global caches made early development simple but cannot support background jobs, teams, remote commands, storefront tenancy or reliable multi-shop operations.

2. **Business state without durable effect state**  
   Local transactions are often good, but the intent to send, synchronize, notify, audit or compensate is not always committed with the business change.

3. **One application boundary serving incompatible trust zones**  
   Seller UI, public storefront, PWA shell, provider APIs and local background work share the same Next.js/database authority.

4. **Recovery added after storage decisions**  
   Encryption, secrets, migration and backup were implemented as local protections without a complete replacement-machine and zero-knowledge recovery model.

5. **Provider code treated as support evidence**  
   Adapter source and mocks capture useful knowledge but cannot prove live capability, status semantics, idempotency or provider drift.

6. **Session-era completion claims**  
   Historical documents recorded large amounts of useful work but mixed implementation, test count, readiness and product authority. The documentation reset separates those concepts.

## 9. Preservation and replacement strategy

### Keep and harden

- Next.js/React UI and shared components;
- Tauri Windows host and signed updater mechanism;
- Prisma and one SQLite file per shop;
- integer DZD representation and canonical metrics;
- order/catalog/customer/delivery/COD/accounting product workflows;
- AR/FR/EN, RTL and responsive components;
- test suites that protect current behavior;
- AES-GCM, blind-index and Ed25519 primitives after format/context review.

### Migrate

- standalone server and WhatsApp sidecar behind supervised authenticated runtime;
- domain services behind explicit shop/actor/permission context;
- AuditLog/OrderChange into universal trusted transaction records;
- automation authoring into durable worker execution;
- current courier/commerce/Sheets/Gemini adapters into the provider framework;
- local storefront builder into versioned hosted drafts/releases;
- local owner PIN into tenant/member/device identity;
- current secret service API onto the protected key hierarchy;
- current backup UI onto the new verified recovery engine;
- current Playwright paths onto signed installed-candidate testing.

### Replace

- global active-shop database proxy as write authority;
- plain JSON registry and silent fallback;
- production `db push` and the current migration runner;
- plaintext master-key authority;
- self-issued browser trial and trusted license status;
- fire-and-forget business effects;
- heuristic refund reversal authority;
- polling watermark as synchronization authority;
- local direct storefront checkout;
- shell-only PWA architecture;
- local byte-copy backup engine;
- push/tag-before-build release flow and multi-platform Stable workflow.

### Retire after migration

- unsupported provider claims and experimental public capabilities;
- v3/v4 public/readiness/version claims;
- transition ledgers and session handoffs replaced by this analysis and the roadmap;
- redirect-only historical documents whose full content remains in git history;
- legacy APIs/models only after data migration, reference removal, replacement evidence and rollback review.

## 10. Documentation system after this reset

### Product authority

1. `product/LAUNCH_CONSTITUTION.md`
2. `product/FOUNDER_DECISIONS.md`
3. `product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md`

These preserve the full Founder-approved product contract. Product intent is not mixed with temporary current-state or session handoff documents.

### Engineering authority

1. `architecture/ENGINEERING_SPECIFICATION.md` — target boundaries and invariants.
2. `architecture/SUPERSEDING_ADRS.md` — accepted rationale and rejected alternatives.
3. `architecture/CURRENT_TO_TARGET_ANALYSIS.md` — current code, full gap, disposition and metrics.
4. `architecture/IMPLEMENTATION_ROADMAP.md` — one dependency-correct execution path.
5. `architecture/CODING_WORKFLOW.md` — lightweight work and risk gates.
6. `architecture/PROVIDER_CONTRACT_REGISTRY.md` — provider claims/certification.
7. Operational drills are indexed in `architecture/CODING_WORKFLOW.md`; create an individual runbook only when its implementation and exercise procedure are concrete.

### Operations and shared memory

`operations/` remains the lightweight MAWS coordination layer. `WORKING_MEMORY.md` points to current work; it does not duplicate architecture or become a permanent transcript.

### Removed documentation categories

- completed architecture-reset acceptance records;
- pre-reset current-state and contradiction ledgers now absorbed here;
- repository/reuse/documentation inventories now absorbed here;
- session handoff documents;
- redirect-only files for former v3/v4 authorities;
- stale historical work logs and plans that are already preserved in git history.

Detailed research remains useful only when explicitly linked from current work and revalidated where time-sensitive.

## 11. Solid work path

The implementation path is defined in `IMPLEMENTATION_ROADMAP.md`. In summary:

1. **Prove repository and packaged truth.**
2. **Establish trusted local runtime, shop and migration authority.**
3. **Establish identity, entitlement, key and recovery authority.**
4. **Make every business write and connected effect durable.**
5. **Build the bounded cloud, relay and backup platform.**
6. **Migrate and certify providers, PWA and storefronts.**
7. **Converge UX, accessibility, performance, security and operations.**
8. **Complete controlled beta and publish Stable only from evidence.**

Work may be parallelized inside those dependencies, but visible connected features must not outrun the authority they depend on.

## 12. Recommended first implementation wave

### Outcome

**A seller can install one Windows candidate, start it reliably, open the intended shop only, and receive a clear recoverable failure instead of silent fallback or partial startup. The repository can prove that result from a clean checkout.**

### Scope

- repair executable CI and remove the undefined `sf-verify` dependency from the workflow or implement the script;
- introduce one generated version/evidence manifest and eliminate active 4.1/1.0 drift;
- produce a Windows-only internal candidate path without publishing it;
- create startup/readiness evidence for server, sidecar, runtime and migration resources;
- define and begin the explicit shop-context/atomic-registry migration;
- replace broad migration failure baselining with exact error handling and fail-closed behavior;
- add the first installed-candidate and corrupt/missing-registry/migration-failure tests;
- capture T470 and 4 GB baseline measurements before optimization.

### Explicit non-goals

- no Cloudflare implementation;
- no hosted storefront;
- no remote PWA;
- no provider expansion;
- no redesign of working product pages;
- no deletion of runtime authorities before compatible migration exists.

### Exit evidence

- current protected branch and clean-checkout CI;
- exact candidate/source/version manifest;
- signed or internally signed Windows candidate artifact;
- clean-install startup report;
- failure-mode report for missing runtime/server/sidecar, occupied endpoint, corrupt registry and migration failure;
- first low-end/T470 trace;
- reviewed next-wave design for explicit shop authority and all-shop migration.

This wave converts the repository from “substantial source code” into a system whose next foundational changes can be measured and recovered safely.
