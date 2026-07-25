# SahelFlow 1.0 — Architecture

> **Status:** Active target engineering authority
> **Product authority:** [`../product/PRODUCT.md`](../product/PRODUCT.md)
> **Experience authority:** [`../product/EXPERIENCE.md`](../product/EXPERIENCE.md)
> **Current-state authority:** [`CURRENT_STATE.md`](CURRENT_STATE.md)
> **Last consolidated:** 2026-07-24

This document defines the final target and invariants. It does not claim the
current implementation already satisfies them; source and evidence status
belongs in `CURRENT_STATE.md`.

## 1. Purpose and precedence

This specification converts the Founder-approved SahelFlow 1.0 product contract and the active experience package into engineering boundaries, protocols, data ownership, invariants, evidence requirements and release gates. It is intentionally stricter than the current implementation. When current code conflicts with this specification, the code is migrated or replaced.

This document cannot silently amend product scope, pricing, entitlements, support, exclusions or experience requirements. A newer numbered Founder decision governs only the choice it explicitly changes. Accepted ADRs refine or supersede engineering decisions; they do not weaken the product contract.

## 2. System shape

SahelFlow 1.0 is a **desktop-authoritative, selectively connected system**.

### 2.1 Canonical Windows desktop installation

- Sole authority for canonical operational business mutations and full private operational records.
- Hosts one encrypted operational SQLite database per shop.
- Executes domain transactions, trusted audit, inbox/outbox workers, provider effects and local projections.
- Maintains explicit tenant/member/device/session/shop/entitlement context.
- Remains useful offline for the purchased major release according to the product contract.
- Owns migration, key, recovery and local diagnostic coordination.

A cloud receipt, queue acknowledgement or projection is not a canonical desktop business mutation.

### 2.2 Cloudflare control plane

- Holds only licensing, entitlement, tenant/member/device/session, routing, payment/support/release and bounded operational metadata.
- Uses Workers, D1, Queues, hibernating Durable Objects, R2 and approved custom-hostname infrastructure according to measured need.
- Uses one SahelFlow-operated multi-tenant deployment. Seller-owned Cloudflare
  accounts are not the default architecture.
- Does not become the seller's operational business database.
- Enforces environment separation, migrations, quotas, cost alarms, incident controls and data classification.
- Does not proceed to public entitlements until unit economics are measured at
  10, 100, 1,000 and 10,000 sellers, including p50, p95 and maximum
  per-license cost against the continuity reserve.

### 2.3 Encrypted relay and projection plane

- Moves versioned tenant/shop/member/device-scoped encrypted envelopes.
- Carries bounded projections, operational commands and results.
- Treats cloud command acceptance as `Queued`, never `Committed`.
- Treats the desktop as final authority for operational commands.

### 2.4 Zero-knowledge backup plane

- Stores only client-encrypted backup objects and authenticated manifests.
- Supports required retention, pinned points, trial retention and recovery ceremonies.
- Cannot decrypt seller data with SahelFlow/Cloudflare access alone.

### 2.5 Hosted storefront plane

- Serves immutable multi-tenant storefront releases.
- Owns public catalog/release data and delegated cloud stock allocation only.
- Accepts durable public checkout receipts while the desktop may be offline.
- Relays/imports receipts to the allocated canonical desktop/shop.
- Distinguishes receipt acceptance from canonical order commitment.

### 2.6 PWA/browser clients

- Authenticate as tenant members/devices.
- Read permitted encrypted projections and submit limited signed commands.
- Never become a second authoritative database.
- Exclude licensing, key recovery, backup restore, secrets, destructive shop administration and other high-risk desktop-only administration unless separately certified.

### 2.7 Provider workers

- WhatsApp, Gemini, courier, commerce and any approved export integrations.
- Consume durable intents/events with idempotency, retry, reconciliation and capability-specific certification.
- Expose only Founder-approved and currently certified capabilities.

### 2.8 Founder administration and public/support surfaces

- Founder administration handles payment verification, offline signing workflow, entitlement expansion, transfer/recovery, incidents, provider state, release holds and support metadata without seller operational plaintext.
- The Founder Console is a separate strongly authenticated and audited web
  application. It is Founder-only at launch while retaining a least-privilege
  role model for future trusted operators.
- The online console records approval and authorization but never contains the
  permanent license-signing private key and never mutates canonical seller
  operations.
- Marketing/help/download surfaces are multilingual, accessible, evidence-honest and consistent with the product and experience authorities.

## 3. Data ownership, privacy and legal classes

| Class | Examples | Canonical owner | Cloud plaintext allowed? | Retention/backup rule |
|---|---|---|---|---|
| A — Operational private | customer data, orders, messages, products, stock, accounting, automation payloads | Desktop shop DB | No | Client-encrypted backup only |
| B — Operational projection | queue summary, masked identity, delivery state, permitted metrics | Desktop; derived | Only if explicitly classified non-sensitive; default encrypted | Regenerable, not authoritative |
| C — Identity/control | tenant, member, role, device/session, entitlement, license, payment/support state | Control plane | Yes, minimized | Policy-managed and auditable |
| D — Routing/protocol | envelope IDs, sequence, expiry, ciphertext size, relay routing, acknowledgements | Control/relay | Yes, minimized | Protocol-bounded retention |
| E — Public storefront | published copy, public price/media, template/release data | Hosted release | Yes | Immutable/versioned release retention |
| F — Support/diagnostic | build, health, redacted logs, consented bundle metadata | Desktop/support | Only redacted and consented | Time-bounded |
| G — Evidence/compliance | artifact hashes, certification result, legal review date, non-sensitive evidence metadata | Release/evidence authority | Yes, minimized | Release/recertification policy |

Data classification is deny-by-default. Before a new field/payload is implemented, record:

- class and canonical owner;
- encryption and associated-data binding;
- projection/public rules;
- retention/deletion/export behavior;
- diagnostic/support exposure;
- applicable Law 18-07 review and residual risk.

No secret or prohibited operational plaintext belongs in browser storage, source code, logs, D1, R2 metadata, Queue payloads or diagnostic bundles.

## 4. Identity, authorization, devices and team work

### 4.1 Principals

- Tenant/license holder
- Owner member
- Team member
- Device
- Session
- Canonical desktop installation
- Shop
- Service/provider worker
- Founder support/admin principal

### 4.2 Authenticated context

Every authenticated local or remote request/command derives from signed/server-created context containing as applicable:

- tenant/license ID;
- member ID and role/policy version;
- device ID;
- session ID;
- canonical installation ID;
- allowed shop IDs and exact active `ShopContext`;
- field/action permission policy version;
- entitlement/product/support claims;
- issued/expiry/revocation epoch;
- nonce/request/correlation ID.

Client-supplied actor, role, tenant, shop, member, device or permission fields are never authoritative.

### 4.3 Roles and permissions

Launch supports safe presets and custom permissions:

- **Owner** — full business authority and high-risk approval.
- **Manager** — broad operations without license/founder-only authority.
- **Operator** — assigned operational workflows.
- **Viewer/analyst** — read-only permitted data/projections.

Field and action permissions are explicit, versioned and enforced in local queries, projection generation, commands and mutations. UI masking is not authorization.

### 4.4 Team/work model

The target includes:

- per-shop membership;
- workgroups and queues;
- assignments and reassignment;
- internal comments distinct from customer messages;
- mentions and handovers;
- local and remote profiles;
- optional configured two-person approval for high-risk actions;
- immediate member/device/session revocation;
- trusted actor attribution and complete audit.

Shared staff accounts, surveillance, payroll and attendance are prohibited for 1.0. Architecture is load-tested for at least 25 active members even though the entitlement is owner plus ten active team members.

### 4.5 High-risk actions

Require owner authority, re-authentication and/or explicit bound approval according to policy:

- license transfer/recovery and entitlement amendments;
- key/recovery-kit/assisted-recovery operations;
- member/device administration;
- backup restore;
- provider credential changes;
- bulk destructive mutations;
- refund reversal/accounting adjustment;
- storefront domain/allocation changes;
- remote destructive AI/automation actions;
- release/update channel changes.

A proposal is revalidated against current state at execution. Stale or changed proposals cannot execute.

## 5. Local data architecture and migrations

### 5.1 Local files and stores

- One operational SQLite database per shop.
- One atomic versioned application registry for shop metadata, schema versions, wrapped references and active UI preference.
- A protected local control cache for signed entitlement/member/device/session state.
- A local durable protocol store for relay cursors, inbox/outbox and health.
- No production dependency on `prisma db push`.

The registry is atomically written and validated before use. Missing/corrupt registry or shop file fails closed with explicit recovery. It never silently routes to a fallback shop.

### 5.2 Shop context

Every repository/service/background/remote execution receives an explicit trusted `ShopContext`. Global mutable active-shop state may exist only as presentation preference; it cannot select background, public-storefront, provider, API or remote-command write authority.

### 5.3 Transaction boundary

A launch-critical mutation transaction includes as applicable:

1. domain state change;
2. immutable trusted audit;
3. domain event;
4. external-effect outbox intent;
5. projection invalidation/update marker;
6. idempotency/effect record;
7. exact compensation facts;
8. approval/correlation receipt.

No external provider call executes inside the database transaction. Workers execute only committed intents.

### 5.4 Migrations

- Append-only numbered migrations; never rewrite an applied migration.
- Migration preflight enumerates every registered shop and compatibility range.
- A verified compatible backup is mandatory for every affected shop before destructive/data-transforming migration.
- Backup failure blocks migration.
- Each shop records schema version, journal and outcome.
- Expansion, data migration and contraction are separated when safer.
- Data migration is resumable and idempotent.
- Release manifest declares compatible schema/protocol versions.
- Failure is classified exactly and remains visible.
- Rollback normally means release hold or compatible forward repair; no blind down-migration.
- Existing installation/data remains unchanged after failed restore and protected according to the migration design.

Test fresh install, every supported prior version, mixed multi-shop state, interruption, rerun, low disk, corrupt data and backup failure.

## 6. Key, secret and recovery architecture

### 6.1 Purpose-separated key hierarchy

- **Installation root key** — generated locally and protected through Windows OS-backed secure storage or an independently reviewed equivalent.
- **Per-shop data keys** — random and wrapped by the installation root.
- **Secret-store key** — separate purpose/context from shop data.
- **Per-license Backup Root Key** — recoverable through the seller recovery design, never equal to runtime data keys.
- **Per-backup data-encryption key** — unique for every backup and wrapped by the Backup Root Key.
- **Relay/projection session keys** — scoped, rotating and revocable.
- **Trial signing key** — dedicated to trial/extension claims and separate from permanent signing authority.
- **Permanent signing key** — Founder-controlled and offline.

Keys/ciphertexts use explicit IDs, purpose, algorithm, version and authenticated context. Ciphertexts bind tenant/shop/record/field or protocol context as applicable.

### 6.2 Recovery modes

#### Independent seller recovery

The seller-controlled recovery kit includes:

- human-verifiable version/ownership metadata;
- wrapped recovery material;
- checksum/authentication;
- clear storage/loss warnings;
- tested replacement-install restore ceremony;
- rotation/revocation semantics.

#### Optional assisted recovery

Assisted recovery requires both:

- a protected enrolled-device share; and
- a separate Founder offline share.

Neither SahelFlow, Cloudflare, the Founder share nor the enrolled-device share alone can decrypt operational backups. The ceremony is explicit, authenticated, audited and revocable.

### 6.3 Secrets

Provider credentials never enter browser storage, logs, diagnostics, cloud projections or ordinary exports. Access uses a narrow audited service with purpose/tenant/shop scope. Provider workers receive handles or scoped values only for execution.

### 6.4 Key migration and incident response

Legacy key material is wrapped/re-encrypted through a resumable journal and deleted only after verification/recovery proof. Rotation, compromise, lost-device, transfer and canonical-install replacement are explicit state machines.

## 7. Licensing, payment, entitlements and continuity

### 7.1 Signed entitlement claims

A signed entitlement includes at least:

- license/tenant ID;
- product major;
- trial/permanent state;
- issue/expiry and exact support horizon;
- included and purchased extra shops;
- member/device limits;
- backup/media resource entitlements;
- canonical desktop installation ID;
- transfer/recovery state;
- revocation epoch;
- signing key ID and format version.

### 7.2 Trial

- Issued online by the licensing service.
- Exactly seven days.
- One per recognized machine under privacy-preserving policy.
- Signed by the dedicated trial-only key; never client-self-issued.
- Reinstall/local-state deletion restores original issue/expiry rather than creates another trial.
- Complete lockout after expiry across UI, API, background workers, PWA/cache and integrations.
- Only licensing/payment/extension/support/minimal diagnostics remain.
- Data remains intact but unavailable for viewing/export/operation until activation.
- Trial receives one rolling encrypted cloud backup point retained for 30 days after expiry.
- Clock rollback, key rotation, service outage and false machine mismatch have tested recovery.

### 7.3 Payment verification and permanent issuance

Payment verification and license issuance are separate durable state machines.

- Payment request is versioned, authoritative-price based and machine/license bound.
- Customer screenshot/reference is supporting evidence only.
- Founder verifies the actual receiving-account transaction.
- Controls cover fraud, duplicate/reused evidence, amount mismatch, repeated approval, interrupted issuance and stale Founder session.
- Immutable approval authorizes a separate offline signing ceremony.
- Permanent license and extra-shop amendments are signed offline.
- The permanent private key never enters the online control plane.

### 7.4 Transfer and ownership recovery

- One canonical Windows installation is active at a time.
- Legitimate replacement, loss, theft, upgrade or reinstall carries no activation fee.
- Planned transfer verifies backup, pairs old/new, approves cutover, activates new, revokes old and checks health.
- Emergency recovery does not require the old device online.
- Business ownership transfer requires protected Founder review, evidence, recovery reset and complete old-owner revocation.

### 7.5 Commercial and resource limits

Executable entitlement enforcement represents the Founder matrix:

- 35,000 DZD one-time complete edition;
- purchased major 1;
- five-year same-major maintenance/connected continuity from Stable launch;
- one owner plus ten active team members;
- two personal devices per member and three owner remote devices;
- five included shops plus up to five extra at 5,000 DZD each;
- storefront/subdomain/custom-domain, backup and media allowances from Launch Scope;
- no hidden recurring fee, feature tier or local lockout for fair-use crossing.

### 7.6 Continuity economics and service exit

- 20% of every base/extra-shop sale enters continuity planning (7,000 DZD base; 1,000 DZD extra shop under current prices).
- At least 24 months of forecast infrastructure coverage is validated before public payment.
- Provider/platform pricing is revalidated quarterly.
- Exact support-end date is shown before payment and recorded in payment/license metadata.
- Planned material SahelFlow-controlled discontinuation after the guarantee normally provides at least 12 months' notice and applicable export/migration tooling.
- Permanent local use of the purchased major does not expire merely to force an upgrade.

## 8. Durable event, effect and compensation architecture

SahelFlow uses a hybrid transactional model. Current-state tables remain the
fast read authority for the desktop UI; append-only business records preserve
how consequential state changed. Full event sourcing is not required.

Order, confirmation, delivery, inventory, financial/COD and return/refund state
machines are separate. A single generic order status must not impersonate all
of them.

### 8.1 Required records

- Domain event
- Inventory movement and reservation
- Financial/COD movement and settlement
- Delivery/provider raw event
- Inbox event
- Outbox intent
- Effect attempt
- Effect receipt
- Dead-letter item
- Reconciliation run
- Checkpoint/cursor
- Command request/result
- Projection sequence
- Approval receipt
- Compensation/adjustment fact

### 8.2 Inbound durability

Authenticate and persist an inbound provider/cloud/storefront event before acknowledgement. Normalize through an idempotent processor. A failed item remains tracked and visible.

### 8.3 Outbound effects

Committed intents are executed by bounded workers. Each effect has a stable key, attempt/receipt history, retry safety class, ambiguous-result handling, dead letter and reconciliation.

### 8.4 Idempotency and checkpoints

- Uniqueness is enforced in storage.
- Retries return the original committed result or safely resume.
- A checkpoint advances only after earlier work has committed or entered explicit governed dead-letter state.
- No watermark passes an untracked failure.

### 8.5 Compensation

Money, stock, status and external effects reverse through explicit append-only facts. Boolean reversal flags or heuristic reconstruction alone are insufficient.

### 8.6 Golden COD transaction rules

- Order creation does not silently reduce physical stock.
- Confirmation reserves stock; pre-shipment cancellation releases it.
- Shipment transfers reserved stock to an outbound/in-transit position.
- Delivery creates a carrier COD receivable; it does not prove remittance.
- Failed delivery does not make stock available before physical return.
- Returned goods enter available, damaged or quarantine stock only after
  receipt and inspection.
- Carrier remittance settles explicit receivables, fees and discrepancies.
- Refunds, partial refunds, corrections and reversals create append-only
  financial facts.
- Manual overrides require permission, reason, actor/device attribution and
  audit.
- A provider replay produces the original effect or a safe no-op, never
  duplicate stock, money, shipment or timeline changes.

Every consequential command validates trusted context and transition rules,
updates current state, writes required movements/audit/events and commits its
outbox intent in one database transaction.

## 9. Encrypted relay and PWA command protocol

### 9.1 Envelope

Every envelope includes:

- protocol/version compatibility;
- tenant/shop/member/device/installation scope;
- sender and recipient;
- message type;
- unique ID/idempotency key;
- sequence/cursor;
- issue/expiry/revocation epoch;
- ciphertext/algorithm/key ID;
- authenticated metadata;
- signature/MAC.

### 9.2 Projections and caches

Desktop creates minimal role/field-filtered versioned projections. Sensitive caches are encrypted, tenant/member/device/shop/version partitioned and purgeable on revocation. Projection data is not authoritative.

### 9.3 Operational commands

- Permission check occurs at submission and again at desktop execution.
- Cloud acceptance means `Queued`, not `Committed`.
- Operational command success is shown only after desktop commit result.
- Commands expire and fail after revocation/policy/version mismatch.
- Conflict returns explicit current state/resolution options.
- Last-write-wins is prohibited for money, stock, permissions and order state.

### 9.4 Outage behavior

- Purchased-major desktop operations continue locally.
- PWA explicitly displays stale, offline, read-only, queued and conflict states.
- Cloud outage cannot corrupt local authority or erase durable queued work.
- Reconnection verifies sequences and reconciles before execution.

## 10. Zero-knowledge backup and restore

### 10.1 Backup unit

A backup set contains the recovery-required registry metadata plus one or more shop snapshots, all encrypted client-side. The cloud sees minimized tenant/object IDs, size, time, retention class and ciphertext only.

### 10.2 Backup procedure

1. Quiesce or create a SQLite-consistent snapshot using supported backup/checkpoint discipline.
2. Run integrity/application checks.
3. Produce versioned manifest and hashes.
4. Generate a unique per-backup DEK and wrap it under the per-license Backup Root Key.
5. Encrypt chunks/objects with authenticated metadata.
6. Upload resumably/idempotently.
7. Verify remote object hashes and manifest authentication.
8. Mark `Verified` only after verification.
9. Periodically restore into isolation and run application-level checks.

### 10.3 Retention

- Permanent license: 7 daily, 4 weekly, 6 monthly and up to 3 pinned points per shop, bounded by quota.
- Trial: one rolling encrypted cloud point retained 30 days after expiry.
- Deletion/retention is audited and safe under partial upload/failure.

### 10.4 Restore

- Authenticate entitlement and recovery material.
- Download/decrypt into isolated staging.
- Verify manifest, snapshot integrity, schema compatibility and application health.
- Preserve current installation/data throughout staging.
- Cut over atomically only after success.
- Failure leaves current installation unchanged.

## 11. Provider, commerce and courier contracts

### 11.1 Scope and certification

A provider is public only when:

- its capability is permitted by Founder scope;
- its exact action is currently live-certified;
- its limitations/degraded state are visible;
- its contract/policy/economics remain acceptable.

Adapter source and mocks are not certification. Architecture candidates require a Founder launch-set decision after evidence.

### 11.2 Commerce protocol

- Shopify, WooCommerce and YouCan are named conditional providers.
- Webhooks/REST hooks provide notification where certified; scheduled reconciliation provides correctness.
- Both paths converge on one durable encrypted inbox.
- Resource/event IDs, mutable versions, pagination, rate limits, overlap and conflicts are explicit.
- Shopify/WooCommerce use full hybrid only after certification.
- YouCan uses conservative new-order hooks plus polling/wider reconciliation until update/cancellation behavior is proven.
- Target normal online event-to-desktop import p95 is 5 seconds under the approved test envelope.
- Reconciliation repairs intentionally dropped events.

### 11.3 Courier contract

Each courier declares independently:

- credential test;
- home/desk/office creation;
- fee/service area;
- wilaya/commune mapping;
- label retrieval/format;
- tracking/status;
- edit/cancel/return/pickup;
- bulk behavior;
- provider idempotency and ambiguous success;
- webhook/list-since/reconciliation;
- rate limits and sandbox/live environment.

### 11.4 Common provider declaration

Every provider adapter/worker records:

- scope class and controlling decision;
- provider/API/version/environment;
- authentication and minimum permissions;
- secret purpose and workspace/shop scope;
- supported and explicitly unsupported capabilities;
- normalized request/response/event schemas;
- provider resource/event/version identity;
- idempotency, deduplication and ambiguous-success behavior;
- pagination, ordering, overlap, cursor and reconciliation semantics;
- webhook authentication/replay behavior where applicable;
- rate limits, quotas, retries, timeout and backoff;
- status/error mapping, currency/time-zone/locale assumptions;
- transmitted data classes and retention;
- health, degradation, kill switch and seller recovery UX;
- terms/policy/legal review date and recertification triggers.

Certification is capability-specific. A provider may be certified for tracking
while create, edit or cancellation remains unsupported. A material provider
contract/version change invalidates the affected certification.

Each certification record names the adapter commit, signed artifact, real
environment/account, tester/reviewer, capabilities tested, failures,
duplicate/replay, paging/checkpoint/reconciliation, rate-limit/outage/recovery,
sanitized evidence, limitations and Founder launch-set decision.

No specific courier is a locked Founder promise merely because current code or an ADR names it. Current candidates are certified first and the Founder confirms the public launch set.

## 12. Storefront architecture and success semantics

### 12.1 Tenancy, allocation and releases

- Shared multi-tenant runtime with explicit tenant/storefront/shop IDs.
- One storefront per entitled shop.
- Draft builder data is separate from immutable release artifacts.
- Each publish creates versioned release data with template, catalog/allocation, media, domain and rollback parent.
- Desktop owns physical stock; cloud consumes only delegated allocation.
- Three materially distinct templates pass independent visual, mobile, performance, RTL, accessibility and checkout evidence.

### 12.2 Checkout

- Customer input is untrusted.
- Runtime resolves tenant/storefront/shop allocation server-side.
- Price, availability, quantity and delivery rules are server-controlled.
- Unique idempotency prevents duplicate receipt/canonical effects.
- Customer success is returned only after a durable tenant/shop-scoped encrypted receipt exists.
- Receipt acceptance may occur while desktop is offline and means `Received/Queued for import`, not `Canonical order committed`.
- Relay/import retries until desktop commits or explicitly rejects.
- Customer/seller status distinguishes received, queued, imported/committed, rejected and reconciled.

### 12.3 Domains, media and public safety

Domain ownership/TLS are verified. Media is content-addressed, versioned, scanned, bounded and tenant-isolated. Arbitrary seller JavaScript/unrestricted HTML is forbidden. Custom domains remain conditional on certification.

## 13. AI architecture

- Seller owns and supplies the Google AI Studio key.
- Provider/model registry is centrally versioned; `gemini-3.5-flash` is the current approved default, not an immutable scattered code assumption.
- No key or provider outage never breaks core non-AI operation.
- Professional AR/FR/EN wizard covers key creation, restrictions, safe test, privacy acknowledgement, secure storage, quota/error diagnosis, rotation and disconnection.
- Deterministic local extraction, tokenization/redaction, schema validation and manual fallback are mandatory.
- Default privacy-safe mode never silently sends raw customer data, confidential records, credentials, sensitive finance data or complete WhatsApp histories.
- Payload builders are allowlisted and data-classified; raw objects are never serialized by convenience.
- Real Darija/Arabic/French/mixed corpora validate extraction, redaction and error behavior.
- Typed schemas validate responses.
- Suggestions are drafts/action plans. Mutations require authenticated permission/current-state check and explicit bound approval where policy requires.
- Safe request metadata is auditable without prohibited plaintext.

## 14. Experience and frontend engineering contract

The Experience and Frontend Constitution, Capability Atlas and Journey Atlas are binding for included scope.

### 14.1 Frontend state authority

Separate:

- canonical domain state;
- server/desktop mutation state;
- remote command state;
- query/cache state;
- local ephemeral UI state;
- persisted user preference;
- draft form state.

React/local state cannot masquerade as committed business truth.

### 14.2 Design-system and interaction architecture

Implementation uses shared foundation tokens, primitives, operational composites and converged interaction patterns. Raw color/spacing/motion values and page-specific CRUD patterns require explicit justification.

### 14.3 Arabic/RTL/localization

- correct `lang`/`dir` root and logical CSS;
- bidi-safe mixed content with technical values LTR as appropriate;
- intentional directional icons, charts, legends and sticky columns;
- Western digits/Gregorian calendar for `ar-DZ` unless Founder policy changes;
- consistent DZD formatting and Arabic pluralization;
- no hardcoded user-facing English or raw enum fallback;
- no letter spacing that breaks Arabic joining;
- Arabic and Latin typography tested in packaged performance.

### 14.4 Page-completion and accessibility

Required pages/journeys cover applicable empty/loading/pending/queued/committed/rejected/conflict/degraded/offline/stale/recovery states, permission behavior, responsive design, 1366×768, 100–200% zoom, keyboard, visible focus, screen-reader, reduced motion, mobile 44px touch targets and WCAG 2.2 AA.

## 15. Windows compatibility and performance authority

### 15.1 Capability matrix

Target functional compatibility where required components exist:

- Windows 10 22H2;
- supported and unsupported-CPU Windows 11;
- Tiny11/modified Windows builds;
- HDD and SSD systems;
- virtual machines;
- systems without TPM/Secure Boot.

Functional compatibility is distinct from security equivalence. Missing components are diagnosed precisely.

### 15.2 Founder-approved launch thresholds

On the 4 GB dual-core floor device with representative data:

- cold usable shell ≤ 15 s p95 on entry SSD and ≤ 25 s on HDD;
- ordinary interaction visible response ≤ 100 ms and usable page ≤ 1.5 s p95;
- indexed order/customer search ≤ 750 ms p95;
- normal local order mutation ≤ 1 s p95 excluding provider latency;
- no ordinary interaction freeze > 200 ms;
- steady-state working set ≤ 750 MB with WhatsApp connected/no heavy job;
- no sustained memory growth over eight hours.

On Founder T470 class:

- cold launch ≤ 8 s p95;
- navigation ≤ 700 ms p95;
- indexed search ≤ 350 ms p95;
- ordinary local mutation ≤ 500 ms p95.

Engineering may maintain stricter unpublished internal goals, but they must be labeled as optimization goals and cannot create a competing acceptance authority. Architecture changes when the approved envelope cannot be met.

Low-resource mode may reduce animation, prefetch, freshness or heavy concurrency; it never weakens feature ownership, correctness, security, durability, backup retention or audit.

## 16. Observability, diagnostics, support and Founder operations

Required signals include:

- process/startup/restart health;
- shop DB/migration/backup state;
- inbox/outbox lag, retries, dead letters and checkpoints;
- control/relay/PWA sessions;
- provider quota/latency/error/degraded state;
- storefront receipt/import lag;
- entitlement/support state without sensitive payloads;
- app/schema/protocol/release versions;
- low-resource metrics;
- cost/continuity thresholds.

Diagnostic bundles are generated locally, previewable, redacted, consented, encrypted in transit and time-limited. They never include keys, tokens, raw customer data or WhatsApp credentials.

Founder operations are sparse and security-first. Every action identifies scope, evidence, reason, approval, reversibility and audit. Founder access does not include seller operational plaintext.

## 17. Version, update and release authority

A generated manifest is the single authority for:

- app semantic version (`1.x.y`);
- product major;
- git commit/build ID/channel;
- schema/protocol/projection/backup/storefront versions;
- compatible ranges;
- signing key IDs;
- artifact digests;
- support horizon.

Package, Cargo, Tauri, updater, About UI, payment/support surfaces and release notes are derived or checked against it.

Release channels are `internal`, `beta`, `stable`. Stable is Windows x64 only at launch. Candidate build/sign/test/evidence occurs before publication. Updater accepts only signed compatible artifacts and supports staged rollout/hold. Data rollback is normally compatible forward repair, not destructive down-migration.

Every merged work package that changes the installed product receives a unique
monotonically increasing Internal version. Its exact protected-main source is
bound to the signed MSI, signature, update manifest and retained evidence.

The packaged Next.js standalone runtime executes directly from the MSI
installation under protected `Program Files` using a pinned, checksum-verified
Node.js LTS binary. Bun remains a development/build tool and the compiler for
the isolated WhatsApp executable; it is not the installed Next.js process.
Clean build and release gates generate and verify the complete deterministic
standalone tree identity and runtime provenance before signing. Installed
Windows gates independently recompute the protected tree, bind its manifest,
entrypoint and Node runtime to the exact candidate, and exercise launch plus
reopen. User-writable AppData may retain business state, diagnostics and legacy
caches, but it is not executable runtime authority. Interactive startup
validates the installed manifest/version and required regular-file entrypoint
without recursively copying or hashing the complete runtime tree, and aborts
readiness immediately when the contained server process exits.

The installed client exposes explicit states: `Checking`, `Current`,
`Available`, `Deferred`, `Downloading`, `Verifying`, `Ready to install`,
`Installing`, `Restart required`, `Restarting`, `Completed`, `Offline`,
`Rejected`, `Failed` and `Retrying`. Failure copy identifies preservation,
safe retry and recovery. A workflow artifact, draft release and published
channel update are distinct states.

An app-changing task moves through three distinct states:

1. **Source-complete** — reviewed and merged into protected `main`.
2. **Release-complete** — exact-source signed artifact passes automated
   release, runtime and visible-UI gates.
3. **Founder-accepted** — installed over the prior accepted version with
   AppData preserved, reopened successfully and the intended real change
   observed.

Only the third state is final completion for an installed-app change. At most
one unaccepted Founder Internal update is in flight. Documentation-only changes
do not create an MSI unless they alter executable packaging, updater or release
authority.

## 18. System invariants

| ID | Invariant |
|---|---|
| INV-001 | The canonical desktop is the sole authority for canonical operational business mutations. |
| INV-002 | Tenant, member, device, session, shop, role and actor come only from authenticated context. |
| INV-003 | No shop operation silently falls back to another database. |
| INV-004 | Domain mutation, trusted audit, event and required intent commit atomically. |
| INV-005 | No acknowledged inbound event is lost. |
| INV-006 | One effect key cannot create duplicate external/domain effects. |
| INV-007 | Checkpoints never pass an untracked failure. |
| INV-008 | Operational remote-command success is shown only after desktop commit. |
| INV-009 | Storefront customer success means a durable tenant/shop receipt exists and does not misclaim desktop commitment. |
| INV-010 | Purchased-major local use does not depend on continuous cloud availability. |
| INV-011 | Trial is online, signed with the trial-only key, machine-bound and non-resettable by local clearing. |
| INV-012 | Trial expiry locks all product operations without deleting data. |
| INV-013 | Permanent and extra-shop claims are signed offline with separate permanent authority. |
| INV-014 | Payment verification and license issuance are separate durable state machines. |
| INV-015 | Shop/member/device/storage limits use signed claims and mutation-boundary enforcement. |
| INV-016 | Provider credentials, root keys and signing material never enter prohibited plaintext locations. |
| INV-017 | Backup upload contains neither plaintext seller operations nor decryption keys. |
| INV-018 | Every backup has a unique DEK wrapped under the per-license Backup Root Key. |
| INV-019 | Assisted recovery requires both enrolled-device and Founder offline shares. |
| INV-020 | A backup is `Verified` only after snapshot and remote authentication pass. |
| INV-021 | Failed restore leaves the existing installation unchanged. |
| INV-022 | Migration starts only after verified compatible backup for every affected shop. |
| INV-023 | Money is integer DZD and corrections/reversals are append-only facts. |
| INV-024 | Inventory cannot go negative or double-adjust under concurrency/replay. |
| INV-025 | Storefront price, allocation, shipping and availability are never trusted from customer input. |
| INV-026 | PWA projections/caches are tenant/member/device/shop/version partitioned and revocable. |
| INV-027 | Field permissions are enforced in reads/projections/commands/mutations, not only UI. |
| INV-028 | Destructive AI/automation actions require current permission and bound approval. |
| INV-029 | Low-resource mode never reduces correctness, security, durability, retention or feature ownership. |
| INV-030 | A public provider capability exists only with Founder scope and current live certification. |
| INV-031 | Cloud outage cannot corrupt desktop authority or erase durable queued work. |
| INV-032 | Law 18-07 review exists for every applicable data class before Stable. |
| INV-033 | A release cannot publish before signed artifacts and evidence manifest exist. |
| INV-034 | Installed clients accept only signed compatible updates from their channel. |
| INV-035 | Diagnostics are opt-in, previewable and secret/private-data safe. |
| INV-036 | Continuity reserve/coverage and support-horizon promises are validated before public payment. |
| INV-037 | Every product/readiness claim links to exact current evidence. |
| INV-038 | Included pages and journeys satisfy their experience/page-completion contract. |
| INV-039 | Source-complete, signed-release-complete and Founder-installed acceptance are recorded as distinct facts. |
| INV-040 | One seller workspace has one independent base license; a person may own several separately licensed workspaces. |
| INV-041 | Founder control-plane access cannot expose seller operational plaintext or permanent signing material. |
| INV-042 | Shared connected-service entitlements cannot become public before measured unit economics, quotas and alarms exist. |
| INV-043 | The desktop executes the release-verified MSI-installed Node.js and standalone runtime from the protected installation; user-writable runtime copies and developer-PATH runtimes are not executable authority. |

Every invariant maps to automated tests, packaged/provider/device/recovery evidence and observable recovery in the implementation wave that introduces it.

## 19. Evidence and launch gates

Stable requires all Founder gates plus:

- operational CI and protected branch;
- signed Windows installer/updater candidate and exact evidence manifest;
- clean-install, upgrade, migration, hold/forward-repair and restore evidence;
- all-shop migration matrix;
- approved Windows compatibility matrix;
- 4 GB/T470 performance reports using Founder thresholds;
- Founder-selected provider launch set and current live certifications;
- threat model, independent security/privacy review and Law 18-07 report;
- independent and assisted zero-knowledge recovery drills;
- PWA authorization/revocation/conflict tests;
- storefront receipt/allocation/replay/durability tests;
- complete capability/journey/page-completion accessibility/RTL report;
- continuity economics and support/service-exit readiness;
- beta exit with 3–5 representative businesses and five representative live storefronts;
- no unresolved P0/P1 defect;
- final Founder approval.

## 20. Explicit non-goals

This specification does not authorize:

- subscription or feature tiers;
- native Android application;
- macOS/native Linux Stable release;
- multiple canonical Windows installations under a standard license;
- cloud multi-master operational database;
- enterprise SSO/AD, payroll, attendance or surveillance;
- TikTok/Meta inbox integrations;
- arbitrary storefront JavaScript/unrestricted HTML;
- automated BaridiMob/CCP monitoring or approval;
- unlimited included resources;
- product-funded general Gemini inference;
- provider scope merely because adapter code exists;

## Consolidation provenance

The detailed pre-consolidation
[superseding ADR register](../archive/architecture/SUPERSEDING_ADRS-2026-07-15.md)
and
[Internal.5-era updater trust contract](../archive/architecture/UPDATER_RELEASE_CONTRACT-internal5-era.md)
remain available as dated rationale/evidence. This document incorporates the
governing decisions and supersedes those snapshots when wording or current
state differs.
- security-equivalence claims for modified Windows without evidence.
