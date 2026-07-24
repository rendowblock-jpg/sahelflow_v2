# SahelFlow 1.0 — Superseding Architecture Decision Records

> **Status:** Accepted engineering baseline  
> **Accepted:** 2026-07-15; reconciled with product/experience authority in the documentation consistency audit  
> **Product authority:** `../product/`  
> **Experience authority:** `../experience/`  
> **Source-code evidence baseline:** `fd9fa97dfcf96e08ffa1273070e74c4bb6db980e`

These ADRs record accepted engineering choices and rejected alternatives. They are subordinate to explicit Founder product decisions and cannot silently expand scope or weaken the experience contract. Reopen an ADR only through evidence and update the Engineering Specification in the same change.

---

## ADR-001 — Windows runtime and process supervision

**Decision.** SahelFlow 1.0 ships one supported Windows x64 package. Tauri remains the host, with child services supervised through an explicit local service manager. Endpoints are dynamically reserved or OS-native, authenticated per launch and never exposed beyond loopback. Startup is a user-visible state machine; missing runtime, failed migration, occupied endpoint or failed child blocks readiness.

The packaged process set may initially include the Next.js server and WhatsApp worker. Consolidation is permitted only when measured low-end evidence proves a safer simpler runtime.

Target functional compatibility covers the product-approved Windows capability matrix where required components exist. Functional compatibility is distinct from security equivalence for modified systems.

**Why.** The baseline uses fixed ports, a multi-process runtime and incomplete startup failure handling. The product requires Windows/4 GB capability, not three-desktop-OS launch parity.

**Consequences.** Linux/macOS launch jobs and claims are removed. Process correlation, health, restart budgets, shutdown, precise missing-component guidance and packaged compatibility evidence are required.

**Migration.** Introduce supervisor, per-launch endpoint manifest and installed-candidate tests before changing connected business features.

**Rejected.** Immediate full Tauri-command rewrite; continuing fixed-port best effort; macOS/Linux Stable launch; vague hardware rejection.

**Reopen only if.** Packaged measurements prove the process model cannot meet Founder thresholds after bounded optimization.

---

## ADR-002 — Desktop data authority, explicit shop context and all-shop migrations

**Decision.** The canonical desktop is the sole authority for canonical operational business mutations. Each shop keeps an independent SQLite database. Every repository, service, worker and remote command receives a trusted explicit `ShopContext`; global active-shop state is presentation preference only. Registry or shop-file failure is explicit and fail-closed, never fallback.

Migrations enumerate all shops, declare compatibility, require verified backup where data may change, journal progress and are resumable/idempotent. Production `db push` is forbidden.

**Why.** The useful one-file-per-shop design is undermined by implicit global routing, fallback behavior and a migration path that does not govern every shop.

**Consequences.** Data APIs change. Direct database imports are inventoried and migrated behind context-aware repositories. Release manifests carry schema/protocol compatibility.

**Migration.** Atomic registry and migration coordinator first; compatibility adapters; domain-by-domain call-site migration; fallback proxy removed last.

**Rejected.** Shared local multi-tenant DB; cloud-authoritative operational DB; preserving implicit routing.

**Reopen only if.** A proven platform defect makes independent shop files unsupportable without violating desktop authority.

---

## ADR-003 — Purpose-separated keys, secrets and recovery

**Decision.** Replace the plaintext master keyfile with a protected installation root and purpose-separated versioned keys: per-shop data, secret store, per-license Backup Root Key, unique per-backup DEKs, relay/session keys, dedicated trial signing key and offline permanent signing key.

Independent recovery uses the seller recovery kit. Optional assisted recovery requires both a protected enrolled-device share and a separate Founder offline share. No single SahelFlow/Cloudflare/Founder/device party can decrypt seller backups alone.

**Why.** One readable file currently unlocks multiple purposes and cannot support zero-knowledge replacement-machine recovery. Signing-purpose separation and assisted recovery are explicit Founder requirements.

**Consequences.** Key loss, rotation, compromise, transfer and replacement become state machines. Ciphertexts include key/purpose/version and authenticated context. Diagnostics/exports prove no leakage.

**Migration.** Add key registry/envelopes; wrap/migrate existing material through resumable journal; prove independent and assisted recovery before deleting legacy material.

**Rejected.** Cloud plaintext escrow; one key for all purposes; file permissions alone; shared trial/permanent signing key; one-share assisted recovery.

**Reopen only if.** Independent review proves the selected Windows protection/recovery design cannot meet both security and recovery promises.

---

## ADR-004 — Signed trial, payment verification, permanent issuance and entitlements

**Decision.** Licensing is signed-claim based. The online control plane issues one seven-day machine-bound trial using a dedicated trial-only signing key. Clients cannot self-issue/reset it. Trial expiry locks all operational surfaces without deleting data and leaves only the approved licensing/payment/extension/support/minimal-diagnostic shell.

Payment verification and license issuance are separate durable state machines. Founder verifies the actual BaridiMob/CCP receiving-account transaction; immutable approval authorizes a separate offline permanent-signing ceremony. Permanent licenses and extra-shop amendments use the offline permanent key.

Entitlements encode product major, shops/expansion slots, members/devices, storage/media, canonical installation, support horizon and revocation. Legitimate machine replacement is included without activation fee.

**Why.** Browser/local trial authority is resettable and current feature flags cannot represent the product contract. Payment evidence alone cannot safely issue a permanent license.

**Consequences.** One entitlement verifier gates UI/API/workers/PWA/integrations. Fraud, duplicate/reused evidence, amount mismatch, repeated approval, interrupted issuance and stale Founder session become explicit cases.

**Migration.** Define signed formats/vectors; build trial issuer and payment/approval/issuance records; implement lockout matrix; migrate legitimate existing licenses; delete legacy branches.

**Rejected.** Subscription licensing; client self-issued trial; always-online permanent license; automatic payment monitoring; online permanent private key.

**Reopen only if.** Legal/cryptographic review identifies a blocking flaw or Founder changes the product contract.

---

## ADR-005 — Tenant/team identity, authorization, devices and work management

**Decision.** Add tenant, member, role, field-policy, device, session, invitation and approval identities. Remote identity/session state is controlled by the bounded plane; desktop holds a signed offline cache. Owner plus ten active members and device limits are explicit entitlements; architecture is tested for at least 25 active members.

Per-shop roles/custom permissions, workgroups, assignments, queues, comments, mentions, handovers and optional configured two-person approvals are first-class. Authorization uses server/desktop-created context, never client claims.

**Why.** Single-owner PIN and free-form actors cannot enforce team behavior, field privacy or trusted audit.

**Consequences.** Existing owner auth migrates to an owner principal. Permission applies in reads/projections/mutations. Revocation purges sessions and sensitive caches.

**Migration.** Identity schema/policy engine; map owner; device/session lifecycle; work management and approvals; then remote team surfaces.

**Rejected.** Shared staff PINs, UI-only roles, silent last-write-wins, surveillance/payroll/attendance, enterprise SSO at launch.

**Reopen only if.** A Founder decision changes team/device entitlements or a legal requirement intervenes.

---

## ADR-006 — Transactional audit, durable inbox/outbox and exact compensation

**Decision.** Every launch-critical mutation atomically records trusted audit, domain event and required outbox/projection intent. Inbound provider/cloud/storefront events enter a durable inbox before acknowledgement. Effects use idempotent workers with attempts, receipts, dead letters and reconciliation. Money, inventory and status reversals use append-only exact compensation facts.

Automation authoring may be reused, but execution moves from fire-and-forget to durable intents. AI/remote approvals bind actor, arguments, current state/version and expiry.

**Why.** Best-effort callbacks, swallowed audits and heuristic reversals cannot prove integrity under crash/retry/partial failure.

**Consequences.** Domain services and provider workers share one effect protocol; checkpoints cannot pass untracked failures; operators see recovery states.

**Migration.** Add records/transaction helper; dual-write under bounded parity; move one domain/effect class at a time; reconcile legacy rows; remove direct dispatch last.

**Rejected.** In-process emitter as authority; external call inside DB transaction; silent retry without idempotency; boolean-only reversal.

**Reopen only if.** Local storage cannot atomically record the required facts, in which case desktop data authority must be reconsidered as a whole.

---

## ADR-007 — Bounded Cloudflare control plane, data classes and continuity economics

**Decision.** Use Cloudflare for bounded control, encrypted relay/projection, zero-knowledge backup objects and hosted storefront runtime. Operational plaintext stays on desktop except intentionally public release data and explicitly classified minimal metadata.

Every applicable data class receives Law 18-07 review. Private projections/commands/results/notifications/backups use application-layer encryption.

Continuity is product behavior: 20% sale reserve planning, at least 24 months forecast coverage before public payment, quarterly provider/platform price review, explicit quotas/alarms and service-exit/export planning. Cloud cannot become a hidden subscription dependency for permanent local use.

**Why.** Connected team/PWA/storefront/backup/licensing promises cannot be delivered by localhost/static Pages, while uncontrolled cloud replication would violate authority/privacy/economics.

**Consequences.** Isolated environments, IaC, migrations, retention, incidents, cost controls and legal review are required. No cloud implementation outruns identity/key/durable protocols.

**Migration.** Identity/entitlement first, then relay, backup and storefront as bounded modules; validate cost/continuity at each stage.

**Rejected.** Full operational cloud DB, no-cloud architecture, arbitrary serverless sprawl, hidden unlimited usage.

**Reopen only if.** Measured cost, law or platform limits make the approved bounded design unsustainable and equivalent alternatives are compared.

---

## ADR-008 — Encrypted projections and operational remote-command protocol

**Decision.** PWA/browser receives minimal role/field-filtered projections and submits versioned encrypted signed commands. Cloud acceptance means `Queued`, not committed. An **operational command** succeeds only after canonical desktop commit. Commands expire, are idempotent, are reauthorized on desktop and return explicit conflicts.

Caches are tenant/member/device/shop/version partitioned, encrypted when sensitive and purged on revocation. High-risk desktop-only administration remains excluded.

**Why.** The baseline service worker is a local shell without identity, projection, command or revocation semantics.

**Consequences.** Current responsive components may be reused within a new authenticated boundary, but the current PWA architecture is replaced.

**Migration.** Protocol/projection schemas; desktop durable relay state; pairing/read-only projections; commands added by risk.

**Rejected.** Remote direct DB/API, cloud multi-master, last-write-wins for business state, browser storage authority.

**Reopen only if.** End-to-end evidence proves the protocol cannot serve approved scale without weakening authority.

---

## ADR-009 — Zero-knowledge backup, trial retention and disaster recovery

**Decision.** Backups are consistent snapshots, chunked/versioned and encrypted before upload. Each license has a Backup Root Key and each backup has a unique DEK. Authenticated manifests, remote verification and isolated restore certification govern `Verified` status.

Permanent retention is 7 daily, 4 weekly, 6 monthly and up to 3 pinned points per shop. Trial receives one rolling encrypted cloud point retained 30 days after expiry. Failed restore leaves current installation unchanged.

Independent recovery kit and optional two-share assisted recovery restore legitimate ownership without SahelFlow-held plaintext keys.

**Why.** Active-shop byte copy is not all-shop, zero-knowledge, retention-safe or recovery-proven.

**Consequences.** Backup, migration, transfer and recovery share one engine. Backup failure blocks risky migration. Recovery ceremonies and trial retention become testable product behavior.

**Migration.** Verified local snapshot/manifest/crypto/restore; independent recovery; remote resumable objects/retention; assisted recovery; disaster drills.

**Rejected.** Plain uploads; cloud-managed decryption key; copy-success verification; active-shop-only sets; one-share support recovery.

**Reopen only if.** Independent cryptographic/recovery review finds a blocking defect.

---

## ADR-010 — Hybrid commerce ingress and reconciliation

**Decision.** Shopify, WooCommerce and YouCan use durable provider inbox processing fed by certified webhooks/REST hooks for speed and scheduled overlap reconciliation for correctness. Both converge on identical idempotent normalization/domain transactions. Checkpoints advance only across committed contiguous work or governed dead letters.

Shopify/WooCommerce become full hybrid after certification. YouCan uses conservative new-order hooks plus polling/wider reconciliation until update/cancellation behavior is proven. Target normal event-to-desktop import p95 is five seconds under approved tests.

**Why.** Polling-only and watermark-on-partial-failure conflict with Founder decisions and can silently miss updates.

**Consequences.** Adapters expose event identity, mutable resource version, pagination, overlap, rate limit and reconciliation semantics. Provider failures become durable work.

**Migration.** Add inbox/checkpoints; wrap polling as reconciliation; certify hooks/action set; remove old watermark authority.

**Rejected.** Webhook-only; polling-only; checkpoint advancement on untracked partial failure.

**Reopen only if.** A provider forbids hooks; it still uses the same durable reconciliation path.

---

## ADR-011 — Courier candidate contract and Founder-selected launch set

**Decision.** Couriers implement a capability-declared contract. UI/automation exposes only certified supported operations. Each provider/action receives dated live evidence covering auth, create, fees, labels, tracking, edit/cancel/return where available, idempotency, ambiguous success, limits and reconciliation.

Current code makes Yalidine, ZR Express and Maystro **architecture candidates**, not automatic Founder promises. Certify first; Founder then confirms the public launch set. Procolis is optional. DHD/unapproved providers remain hidden/experimental.

**Why.** The Founder scope requires certified courier capability but does not lock these provider names. Source/mocks cannot prove provider behavior.

**Consequences.** Provider registry separates scope from certification. Drift/incidents can downgrade/disable capability. Certification cannot expand product scope by itself.

**Migration.** Create registry/contract suite; map adapters; hide unsupported actions; live certify/economic review; obtain launch-set decision.

**Rejected.** Universal lowest-common-denominator interface; public claim from source; treating candidate names as Founder commitments.

**Reopen only if.** Founder explicitly changes the launch set or provider terms/economics block inclusion.

---

## ADR-012 — Hosted storefront releases and durable receipt semantics

**Decision.** Storefronts run on a shared multi-tenant hosted runtime with explicit tenant/storefront/shop allocation. Drafts publish immutable versioned releases. Three distinct templates, domains/media and delegated allocation are certified.

Checkout derives price/availability/shipping server-side and creates a durable encrypted receipt before customer success. This success means **receipt accepted/queued**, not canonical order committed. Relay/import retries until desktop commits or rejects; statuses remain visible/reconcilable.

**Why.** Local active-DB checkout cannot provide tenancy, offline desktop acceptance, immutable release or durable public success.

**Consequences.** Builder/view assets migrate to release schemas; local direct checkout retires after parity. Storefront success and operational remote-command success remain intentionally different semantics.

**Migration.** Tenant/release/receipt schemas; hosted read path/template; durable checkout/import; domains/media; remaining templates/rollback.

**Rejected.** Static export with local API; customer-trusted price; synchronous desktop availability; calling receipt acceptance a committed order; arbitrary scripts.

**Reopen only if.** Verified hosted cost or law requires a different tenancy model without weakening receipt durability.

---

## ADR-013 — Seller-owned Gemini, privacy and bound action approval

**Decision.** Gemini remains seller-keyed. Versioned provider/model policy currently selects `gemini-3.5-flash`. No key/outage never breaks non-AI workflows.

Payloads use allowlisted data-classified fields and local deterministic parsing/redaction, validated against real Darija/Arabic/French/mixed corpora. Responses are typed. Mutations remain proposals until authenticated current permission/state and required explicit approval are verified immediately before commit.

Professional multilingual setup covers restrictions, secure storage, safe test, privacy, quota/error, rotation and disconnection.

**Why.** Typed schemas are useful but heuristic redaction and client confirmation alone cannot prove privacy or prevent stale/forged actions.

**Consequences.** Direct tool writes migrate behind action plans/receipts. Model/quota drift has observable fallback/kill switch.

**Migration.** Central registry/payload builders; privacy corpus; approval receipts; tools migrated by risk.

**Rejected.** Product-funded key; raw-object serialization; scattered model names; autonomous destructive action.

**Reopen only if.** Provider policy/legal/economic changes block seller-owned use and Founder changes policy.

---

## ADR-014 — Observability, diagnostics, legal review and incident controls

**Decision.** Implement correlated local/cloud health across transaction, event, effect, command, provider, backup and release IDs. Diagnostic bundles are local, previewable, consented, redacted, encrypted in transit and time-limited. Sentry is optional and never the sole support path.

Every cloud/private data class includes Law 18-07 review. Provider/cloud usage has quotas, alarms and graceful degradation. Incidents record severity, scope, versions/providers, containment, recovery and postmortem.

**Why.** Baseline logs/hooks do not provide system durability, legal/privacy evidence or cost control.

**Consequences.** Each worker/protocol declares metrics and alert thresholds. Secret/private-data canaries gate diagnostics. Founder admin sees bounded metadata, not seller plaintext.

**Migration.** Standardize local logger/correlation/health; add cloud/cost/legal controls with each service; support bundles and incident drills before beta.

**Rejected.** Upload-all logs; always-on remote access; hidden unlimited use; unsupported privacy claims.

**Reopen only if.** Legal/privacy review requires stricter collection; changes may only reduce exposure unless Founder changes product policy.

---

## ADR-015 — Version authority, release, updater and continuity/support

**Decision.** A generated manifest is the single authority for app `1.x.y`, product major, commit/build/channel, schema/protocol/projection/backup/storefront versions, compatibility, signing IDs, artifact digests and support horizon.

Release is artifact-first: build/sign/test candidate, attach evidence, approve, then publish. Channels are internal/beta/stable; Stable launch is Windows x64. Updater accepts signed compatible artifacts with staged rollout/hold. Data recovery favors compatible forward repair, not blind down-migration.

Five-year same-major maintenance/connected continuity and perpetual local purchased-major use are represented in payment/license/support metadata. Continuity economics and service-exit notice/export obligations are validated before public payment.

**Why.** Baseline has 1.0/4.x drift, publish-before-proof and unsupported OS targets.

**Consequences.** Direct release pushes retire. Branch protection, evidence, exact support dates, reserve/coverage review and public claim control are mandatory.

**Migration.** Manifest/generator/check; reset public version authority; Windows candidate workflow; updater/hold/forward-repair; continuity/support metadata and procedures.

**Rejected.** Independent version files; publish-before-build; untested tag; forced major upgrade; macOS/Linux Stable launch.

**Reopen only if.** Windows signing/distribution constraints require another compatible channel without weakening artifact/evidence authority.

---

## ADR-016 — Risk-based whole-product evidence and experience completion

**Decision.** Verification is risk-class based, not test-count based. Required layers include unit/integration/property/invariant, migration, replay/idempotency, failure injection, security/privacy/legal, packaged E2E, page-state/Arabic/RTL/accessibility, low-end/compatibility, provider live certification, backup/recovery and seller beta evidence.

Each wave/PR identifies product clause, scope class, capability, journey/states, experience dimensions, invariants and evidence. A page or adapter is not complete until its full governing contract is addressed. A claim is valid only for an exact commit/artifact/environment.

**Why.** The repository has substantial code/tests and strong UI foundations, but no current installed-candidate/provider/recovery/low-end/beta proof. Historical counts and “production hardened” labels mixed implementation with readiness.

**Consequences.** Wave/PR templates and merge gates trace the whole contract. GitHub checks become binding after CI repair. Evidence stays with release candidates.

**Migration.** Repair CI; establish evidence format; bind core checks; add packaged/compatibility/provider/recovery/experience suites in roadmap order.

**Rejected.** Browser screenshot alone; coverage alone; source existence as certification; happy-path page as journey completion; historical label as readiness.

**Reopen only if.** A verification method is technically impossible and an equal-or-stronger replacement is demonstrated.