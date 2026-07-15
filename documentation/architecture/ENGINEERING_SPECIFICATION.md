# SahelFlow 1.0 Engineering Specification

**Status:** Active  
**Product baseline:** `documentation/product/`  
**Implementation audit baseline:** `03f0d48436b42788e463bbd1d74a388b2da22294`

## 1. Purpose

This specification converts the founder-approved SahelFlow 1.0 product contract into engineering boundaries, protocols, data ownership, invariants, evidence requirements and release gates. It is intentionally stricter than the current implementation. When current code conflicts with this specification, the code is migrated or replaced.

## 2. System shape

SahelFlow 1.0 is a **desktop-authoritative, selectively connected system**.

### 2.1 Components

1. **Canonical Windows desktop installation**
   - Sole authority for business writes and full operational records.
   - Hosts one encrypted operational database per shop.
   - Executes domain transactions, provider workers, local projections, audit and outbox.
   - Remains useful offline according to the Constitution.

2. **Cloudflare control plane**
   - Holds only licensing, entitlement, tenant/member/device/session, routing, support, release, payment-verification and bounded operational metadata.
   - Does not become the seller's operational database.

3. **Encrypted relay and projection plane**
   - Moves versioned, tenant/shop/member-scoped envelopes.
   - Carries bounded projections and commands.
   - Treats the desktop as final business-write authority.

4. **Zero-knowledge backup plane**
   - Stores only client-encrypted backup objects and authenticated manifests.
   - Supports required retention and pinned versions.
   - Cannot decrypt seller data.

5. **Hosted storefront plane**
   - Serves immutable multi-tenant storefront releases.
   - Accepts durable public checkout receipts.
   - Relays orders to the allocated canonical desktop/shop.

6. **PWA/browser clients**
   - Authenticate as tenant members/devices.
   - Read permitted encrypted projections and submit limited commands.
   - Never become a second authoritative database.

7. **Provider workers**
   - WhatsApp, Gemini, couriers, e-commerce and Google Sheets integrations.
   - Consume durable intents/events with idempotency, retry, reconciliation and certification.

## 3. Data ownership classes

| Class | Examples | Canonical owner | Cloud plaintext allowed? | Backup policy |
|---|---|---|---|---|
| A — Operational secret | customer PII, orders, messages, products, stock, accounting, automation payloads | Desktop shop DB | No | Client-encrypted only |
| B — Operational projection | order queue summary, masked customer identity, delivery status, permitted metrics | Desktop; derived | Only if explicitly classified non-sensitive; default encrypted envelope | Regenerable, not authoritative |
| C — Identity/control | tenant ID, member identity, role, device/session, entitlement, license state | Control plane | Yes, minimized | Control-plane managed |
| D — Routing/protocol | envelope IDs, sequence, expiry, ciphertext size, relay routing, acknowledgements | Control plane/relay | Yes, minimized | Protocol retention only |
| E — Public storefront | published product copy, public price, public media, template release | Hosted storefront release | Yes | Immutable release retention |
| F — Support/diagnostic | build version, health state, redacted logs, consented diagnostic bundle metadata | Desktop/support plane | Only redacted/consented | Time-bounded |

Data classification is deny-by-default. A new field must name its class, owner, encryption, retention, projection rules and deletion behavior before implementation.

## 4. Identity and authorization model

### 4.1 Principals

- Tenant
- Owner member
- Team member
- Device
- Session
- Canonical desktop installation
- Shop
- Service worker/provider worker
- Founder support/admin principal

### 4.2 Required claims

Every authenticated request or command carries, through a signed server-created context:

- tenant ID;
- member ID and role version;
- device ID;
- session ID;
- allowed shop IDs;
- field-permission policy version;
- entitlement/version claims;
- issued/expiry times;
- nonce or request ID.

Client-supplied actor, role, tenant, shop or permission fields are never authoritative.

### 4.3 Roles

The exact role names may evolve, but launch must support:

- **Owner** — full business authority and high-risk approvals.
- **Manager** — broad operations without entitlement/license/founder-only authority.
- **Operator** — assigned operational workflows.
- **Viewer/analyst** — read-only permitted projections.

Field permissions are explicit, versioned and evaluated server-side/desktop-side. Masking in the UI is not authorization.

### 4.4 High-risk actions

The following require owner authority, re-authentication or explicit owner approval according to policy:

- license transfer and recovery;
- key/recovery-kit operations;
- member/device administration;
- backup restore;
- provider credential changes;
- bulk destructive mutations;
- refund reversal or accounting adjustment;
- storefront domain/allocation changes;
- remote destructive AI/automation actions;
- stable release/update channel changes.

## 5. Local data architecture

### 5.1 Files

- One operational SQLite database per shop.
- One versioned application registry for shop metadata, schema versions, wrapped keys and active shop preference.
- A separate local control cache for signed entitlement/member/device/session state.
- A local durable protocol store for relay cursors, inbox/outbox and diagnostic health.

The registry is written atomically and validated before use. A missing/corrupt registry or shop file fails closed with an explicit recovery state. It never silently routes to a fallback shop database.

### 5.2 Shop context

Every repository/service call receives an explicit trusted `ShopContext`. Global mutable active-shop state may exist only as UI preference; it cannot determine background, API or remote-command write authority.

### 5.3 Transaction boundary

A business mutation transaction includes, as applicable:

1. domain state change;
2. immutable audit event;
3. domain event;
4. external-effect outbox intent;
5. projection invalidation/update marker;
6. idempotency/effect record;
7. compensation facts.

No external effect is executed inside the database transaction. Workers execute committed outbox intents after commit.

### 5.4 Migrations

- Append-only numbered migrations; no production `db push`.
- Migration preflight enumerates every registered shop.
- A verified pre-migration backup is mandatory for any destructive or data-transforming migration.
- Backup failure blocks migration.
- Each shop records schema version, migration journal and outcome.
- Data migrations are resumable and idempotent.
- A release declares minimum/maximum compatible schema and protocol versions.
- Rollback normally rolls application code forward to a compatible fix; data is not blindly down-migrated.

## 6. Key, secret and recovery architecture

### 6.1 Key hierarchy

- Installation root key: generated locally and protected by Windows OS-backed secure storage or an equivalent reviewed mechanism.
- Per-shop data keys: randomly generated and wrapped by the installation root.
- Secret-store key: separate derived/wrapped key with context separation.
- Backup encryption keys: versioned and recoverable through the recovery kit; never equal to runtime data keys.
- Relay/projection session keys: scoped, rotating and revocable.

Keys use explicit key IDs, algorithms, versions and authenticated context. Ciphertexts include version and associated-data binding to tenant/shop/record/field where appropriate.

### 6.2 Recovery kit

The recovery kit enables a legitimate owner to recover backups and re-establish a canonical desktop without giving SahelFlow operational plaintext. It must include:

- human-verifiable version and ownership metadata;
- wrapped recovery material;
- checksum/authentication;
- clear storage and loss warnings;
- a tested restore ceremony;
- rotation/revocation semantics.

### 6.3 Secrets

Provider credentials are never stored in browser storage, logs, diagnostic bundles, cloud projections or ordinary exports. Access is through a narrow secret service with audit, purpose and shop/tenant scope. Credential reads return handles or scoped values only to the executing provider worker.

## 7. Licensing, trial and entitlement architecture

### 7.1 Signed claims

A signed entitlement document includes at least:

- license/tenant ID;
- product major version;
- permanent/trial state;
- issue/expiry and maintenance-support horizon;
- included shops and purchased extra shops;
- active member/device limits;
- canonical desktop installation ID;
- transfer/recovery state;
- minimum revocation epoch;
- signing key ID and format version.

### 7.2 Trial

- Issued online by the control plane.
- Exactly seven days.
- Machine-bound and one-per-policy subject.
- Signed; never self-issued by the client.
- Complete lockout after expiry across UI, API, background workers, cached data mutations and remote surfaces.
- Trial expiry never deletes seller data.

### 7.3 Permanent activation

- Founder verifies BaridiMob/CCP payment manually.
- Verification produces an immutable payment/approval record and signed activation.
- Permanent activation can be signed offline using founder-held signing material.
- Local permanent use continues offline for the purchased major version.

### 7.4 Maintenance and connected continuity

The five-year same-major commitment controls access to connected services, compatible updates and support metadata without converting the purchase into a subscription. Enforcement must distinguish perpetual local use from bounded connected-service continuity.

### 7.5 Transfer and recovery

Machine transfer is an explicit state machine: request, identity/payment evidence if needed, old installation revocation or bounded exception, new installation activation, audit and replay protection.

## 8. Durable event and effect architecture

### 8.1 Required records

- Domain event
- Inbox event
- Outbox intent
- Effect attempt
- Effect receipt
- Dead-letter item
- Reconciliation run
- Checkpoint/cursor
- Command request/result
- Projection sequence

### 8.2 Idempotency

Every inbound event and outbound effect has a stable source/provider key and internal ID. Uniqueness is enforced in storage. Retries return the original committed result or safely resume work.

### 8.3 Checkpoints

A checkpoint advances only after all earlier events in its ordering domain have committed or been explicitly dead-lettered under policy. A failed item remains visible, retryable and correlated. The system never skips untracked failures to advance a watermark.

### 8.4 Compensation

Money, stock, status and external effects are reversed through explicit append-only compensation records. Boolean reversal flags alone are insufficient for launch-critical accounting.

## 9. Cloud relay and PWA protocol

### 9.1 Envelope

Every envelope has:

- protocol version;
- tenant/shop ID;
- sender principal/device;
- recipient scope;
- message type;
- unique ID and idempotency key;
- sequence/cursor;
- issued/expiry time;
- ciphertext and algorithm/key ID;
- authenticated metadata;
- signature/MAC.

### 9.2 Projections

Desktop produces minimal role- and field-filtered projections. Projection schemas are versioned. PWA caches are encrypted where they contain sensitive data, purged on revocation, and partitioned by tenant/member/device/shop/schema version.

### 9.3 Commands

- Commands are permission-checked at submission and again at desktop execution.
- Cloud acceptance means only “durably queued,” not “business committed.”
- Success is shown only after a desktop commit result is returned.
- Commands expire and cannot execute after revocation or policy-version mismatch.
- Conflicts return explicit current state and resolution options; last-write-wins is prohibited for money, stock, permissions and order state.

### 9.4 Offline/outage behavior

- Desktop local operations continue according to entitlement grace rules.
- PWA clearly indicates stale/read-only/queued states.
- Cloud outage cannot corrupt local authority.
- Reconnection performs sequence verification and reconciliation before applying commands.

## 10. Zero-knowledge backups

### 10.1 Backup unit

A backup set includes application registry metadata required for recovery plus one or more shop snapshots, all encrypted client-side. The cloud sees tenant/object IDs, size, time, retention class and ciphertext only.

### 10.2 Snapshot procedure

1. Quiesce or obtain a SQLite-consistent snapshot using the supported SQLite backup API/checkpoint discipline.
2. Run integrity checks.
3. Produce versioned manifest and hashes.
4. Encrypt chunks/objects with backup key and authenticated metadata.
5. Upload with resumable idempotency.
6. Verify remote object hashes and manifest authentication.
7. Mark backup `verified` only after verification.
8. Periodically restore into an isolated environment and run application-level checks.

### 10.3 Retention

Enforce 7 daily, 4 weekly, 6 monthly and up to 3 pinned backups per the product contract. Deletion is policy-driven, audited and safe under partial upload/failure.

## 11. Commerce integration protocol

- Provider adapters normalize immutable source event IDs and mutable resource versions.
- Webhooks are accepted into durable encrypted ingress where provider support and deployment permit.
- Scheduled reconciliation independently lists resources since a stable cursor/time overlap.
- Webhook and reconciliation paths converge on the same idempotent inbox processor.
- Provider checkpoint advancement follows the contiguous-commit invariant.
- Edits, cancellations, fulfillment/status changes and partial pages are handled explicitly.
- Credentials, quotas, backoff, clock skew and provider outages are observable.

## 12. Courier contract

Each courier adapter declares capabilities rather than implying a universal interface:

- create shipment;
- calculate/lookup fee;
- label format and retrieval;
- tracking/status polling;
- cancel/edit;
- pickup/office/desk options;
- wilaya/commune mapping;
- idempotency behavior;
- webhook availability;
- rate limits and retry classes;
- sandbox/live environments.

Unsupported capabilities are hidden or return an explicit supported-error. No public claim is made until live certification is current.

## 13. Storefront architecture

### 13.1 Tenancy and releases

- Shared multi-tenant runtime with explicit tenant/storefront/shop IDs.
- Draft builder data is separate from immutable published release artifacts.
- Each publish creates a signed/versioned release with template version, catalog snapshot references, media manifest, domain config and rollback parent.
- Three materially distinct templates must pass independent visual, accessibility and checkout evidence.

### 13.2 Checkout

- Customer input is untrusted.
- The runtime resolves tenant/storefront/shop allocation server-side.
- Prices, availability, quantity limits and delivery rules are server-controlled.
- A unique checkout idempotency key prevents duplicate orders.
- The response reports success only after a durable encrypted receipt exists.
- Relay/import retries until the canonical desktop commits and acknowledges the order.
- Seller-visible status distinguishes received, queued, imported, rejected and reconciled.

### 13.3 Domains and media

Domain ownership and TLS state are verified. Media is content-addressed/versioned, size-limited, scanned and tenant-isolated. Arbitrary seller JavaScript is forbidden.

## 14. AI architecture

- The provider/model registry is centrally versioned; `gemini-3.5-flash` is the current approved model, not an immutable code assumption.
- The seller supplies the Google AI Studio key.
- No key means AI features are unavailable without breaking non-AI workflows.
- Payload builders are allowlisted and privacy-classified; raw operational objects are never serialized by convenience.
- Redaction is tested against Darija, Arabic, French and mixed-format real-world corpora.
- Typed schemas validate every response.
- Suggested mutations are plans, not effects. A server/desktop approval service verifies identity, permission, current state and signed approval immediately before transaction commit.
- AI request/response metadata is audited without storing prohibited plaintext.
- Quota, timeout, model drift and provider outage have explicit UX and fallbacks.

## 15. Observability and diagnostics

Required signals:

- process health and restarts;
- DB/migration/backup status per shop;
- inbox/outbox lag, retries, dead letters and checkpoints;
- control-plane/relay/PWA session health;
- provider latency, quota and error class;
- storefront receipt/import lag;
- license/entitlement state without sensitive claims;
- release/build/protocol/schema versions;
- low-resource metrics.

Diagnostic bundles are generated locally, previewable, redacted, consented, encrypted in transit, time-limited and never include keys, tokens, raw customer PII or WhatsApp credentials.

## 16. Version and release authority

A generated version manifest is the single authority for:

- app semantic version (`1.x.y` for this major);
- product major;
- git commit;
- build ID/channel;
- schema/protocol/projection/backup/storefront release versions;
- minimum compatible versions;
- signing key IDs;
- artifact digests.

`package.json`, Cargo, Tauri config, updater manifest, About UI and release notes are generated or checked against it.

Release channels: `internal`, `beta`, `stable`. Stable is Windows x64 only at launch.

## 17. System invariants

| ID | Invariant | Enforced by | Required tests/evidence | Observability/recovery |
|---|---|---|---|---|
| INV-001 | The canonical desktop is the sole authority for business writes. | Desktop command handler and DB repositories | Remote-command and partition tests | Command state/desktop commit receipt; reconcile on reconnect |
| INV-002 | Tenant, member, device, shop, role and actor come only from authenticated context. | Control plane, desktop session verifier, repositories | Forged-claim and cross-tenant tests | Audit denied attempts; revoke session/device |
| INV-003 | No shop operation silently falls back to another DB. | Explicit `ShopContext`, registry validator | Missing/corrupt registry and concurrent shop tests | Recovery state; registry restore/rebind |
| INV-004 | Domain mutation, trusted audit, domain event and outbox intent commit atomically. | Transactional service layer | Failure-injection/property tests | Transaction correlation; retry uncommitted request |
| INV-005 | No acknowledged inbound event is lost. | Durable inbox before acknowledgement | Crash-at-every-step tests | Replay/dead letter/reconciliation |
| INV-006 | No external effect executes more than once for one effect key. | Outbox/effect uniqueness and provider idempotency | Duplicate/retry/timeout tests | Effect receipts; manual reconcile |
| INV-007 | Checkpoints never advance past an untracked failure. | Ordered inbox/reconciliation engine | Poison-event and partial-page tests | Blocked cursor alert; retry/dead letter |
| INV-008 | Remote success is shown only after desktop commit. | Command protocol/result state machine | Offline/reconnect/conflict tests | Queued/committed/rejected states |
| INV-009 | Local permanent use for the purchased major does not depend on continuous cloud availability. | Signed local entitlement cache | Long outage and clock tests | Explicit grace/connected-service status |
| INV-010 | Trial issuance is online, signed, machine-bound and cannot be reset by clearing local state. | Control-plane trial issuer and local verifier | reinstall/storage deletion/replay/clock tests | Trial issuance audit; support exception path |
| INV-011 | Trial expiry locks all product operations without deleting data. | Unified entitlement gate | UI/API/background/direct-route tests | Lock reason; activation recovery |
| INV-012 | Shop/member/device limits use signed entitlements and are enforced at mutation boundaries. | Entitlement service | boundary/concurrency/offline-cache tests | Limit events; purchase/disable workflow |
| INV-013 | Provider credentials and root keys never appear in DB plaintext, browser storage, logs, diagnostics or cloud payloads. | Secret service and scanners | secret canary and diagnostic tests | Key rotation/revocation; incident runbook |
| INV-014 | Backup upload never contains plaintext seller operational data or decryption keys. | Client encryption and protocol schema | packet/object inspection and key-separation tests | Quarantine/delete compromised object; rotate keys |
| INV-015 | A backup is called verified only after snapshot integrity and remote object authentication pass. | Backup state machine | corrupt/WAL/interrupted upload/restore drills | Keep prior verified set; alert and retry |
| INV-016 | Migration starts only after a verified compatible backup for every affected shop. | Migration coordinator | backup failure and multi-shop matrix | Fail-closed maintenance UI; restore |
| INV-017 | Money is integer DZD and financial changes are append-only events/compensations. | Schema/domain types | property and reconciliation tests | Financial ledger and discrepancy report |
| INV-018 | Inventory cannot go negative or double-adjust under concurrent/replayed operations. | Reservation/stock ledger transactions | concurrency/replay/cancel/return tests | Stock reconciliation and compensation |
| INV-019 | Storefront success means a durable tenant/shop-scoped checkout receipt exists. | Hosted checkout service | duplicate, crash, allocation and replay tests | Receipt/import states; reconciliation |
| INV-020 | Storefront price, shipping and availability are never trusted from customer input. | Hosted server release/catalog rules | tampered-request tests | Rejection reason; release rollback |
| INV-021 | PWA caches/projections are tenant/member/device/shop/version partitioned and revocable. | Projection protocol and service worker | cross-account/revocation/offline tests | Cache purge and device revoke |
| INV-022 | Field permissions are enforced in projection generation and command execution, not only UI. | Policy engine | hidden-field and crafted-command tests | Denial audit; policy version rollback |
| INV-023 | Destructive AI/automation actions require current server-side permission and explicit approval where policy requires. | Approval service | stale/replayed/forged approval tests | Approval receipt; compensate/disable worker |
| INV-024 | Low-resource mode may reduce freshness/visual work, never correctness, security, durability or retention. | Runtime scheduler and feature policy | reference-device parity tests | Resource health and adaptive-mode log |
| INV-025 | A public provider capability exists only with current live certification. | Provider registry and UI capability flags | certification suite | Auto-disable/incident state |
| INV-026 | A release cannot be published before its signed artifacts and evidence manifest exist. | Candidate pipeline and branch protection | release dry run, tamper test | Withdraw channel/revoke manifest |
| INV-027 | Installed clients accept only signed compatible updates from their channel. | Tauri updater and release manifest | downgrade/tamper/channel tests | Hold update; rollback-compatible fix |
| INV-028 | Diagnostics are opt-in, previewable and PII/secret safe. | Bundle builder and upload service | seeded canary corpus | Delete upload; incident response |
| INV-029 | Cloud/control-plane outage cannot corrupt desktop authority or erase queued work. | Local durable protocol state | prolonged outage/reconnect tests | Reconcile sequences and dead letters |
| INV-030 | Every product/readiness claim is linked to current evidence at an exact commit/artifact. | Documentation/release checks | claim-lint and evidence-manifest check | Retract claim; mark ledger status down |

## 18. Performance budgets

Measured on the required low-end floor and T470 reference:

- cold launch to usable local shell: target ≤ 12 s HDD, ≤ 7 s SSD;
- warm launch: target ≤ 5 s HDD, ≤ 3 s SSD;
- common local navigation feedback: ≤ 150 ms; completed query/render p95 ≤ 1.5 s for reference dataset;
- order/customer search p95 ≤ 750 ms;
- memory steady-state target ≤ 650 MB total across processes on 4 GB device, with documented exception budget during one-time migration;
- idle CPU target < 3% average after settling;
- background provider work is bounded and backpressured;
- UI remains operable at 1366×768, 100–200% zoom and RTL.

Budgets can be refined only by an ADR with measured evidence. Missing a correctness/security invariant is never accepted to hit a budget; architecture must change instead.

## 19. Evidence and launch gates

Stable release requires all Constitution gates plus:

- operational CI and protected branch;
- signed Windows installer and updater candidate;
- clean-install/upgrade/rollback/migration/restore evidence;
- all-shop migration matrix;
- 4 GB reference-device report;
- provider certifications current;
- threat model and independent security/privacy review;
- encrypted-backup restore drill on a replacement installation;
- PWA tenant/member/device revocation and conflict tests;
- storefront durability/allocation/replay tests;
- accessibility/RTL report;
- beta exit report with unresolved defects explicitly accepted or fixed.

## 20. Explicit non-goals

This specification does not authorize native Android, macOS/Linux launch, cloud multi-master business writes, enterprise SSO/AD, Meta/TikTok inbox, arbitrary storefront JavaScript, automated payment monitoring, unlimited included usage or product-funded Gemini.
