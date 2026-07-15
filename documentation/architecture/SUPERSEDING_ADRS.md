# Superseding Architecture Decision Records

**Status:** Accepted as the SahelFlow 1.0 architecture baseline  
**Accepted:** 2026-07-15  
**Evidence baseline:** `03f0d48436b42788e463bbd1d74a388b2da22294`

---

## ADR-001 — Windows runtime and process supervision

**Decision.** SahelFlow 1.0 ships one supported Windows x64 desktop package. Tauri remains the host, but child services are supervised through an explicit local service manager. Endpoints are dynamically reserved or OS-native, authenticated per launch and never exposed beyond loopback. Startup is a state machine with user-visible recovery. A missing runtime, failed migration, occupied endpoint or failed child process blocks readiness rather than returning success.

The packaged process set may continue to include the Next.js server and WhatsApp worker initially, but their lifecycle, health, resource limits and shutdown are first-class. Consolidation is permitted only when measured low-end evidence shows a simpler runtime is safer.

**Why.** The baseline uses fixed ports, a three-process runtime and incomplete startup failure handling. The Constitution requires Windows and 4 GB support, not macOS/Linux parity.

**Consequences.** Linux/macOS release jobs and bundle targets are removed from the launch channel. Process correlation IDs, health endpoints, crash loops, restart budgets and resource metrics are required. The browser/webview is not trusted merely because it is local.

**Migration.** Introduce a supervisor abstraction, authenticated per-launch endpoint manifest and packaged startup tests before changing business features.

**Rejected.** Static export/Tauri-command rewrite now; continuing fixed-port best-effort startup; launch support for three desktop OSes.

**Reopen only if.** Packaged measurements prove the process model cannot meet the 4 GB floor after bounded optimization.

---

## ADR-002 — Desktop data authority, shop context and migrations

**Decision.** The canonical desktop remains the sole operational write authority. Each shop keeps an independent SQLite database. Every repository/service/background/remote operation receives an explicit trusted `ShopContext`; global active-shop state is presentation preference only. Registry corruption or a missing shop fails closed and never falls back to another database.

Migrations enumerate all registered shops, require a verified pre-migration backup when data can change, journal progress, are resumable/idempotent and block launch on failure. Production `db push` is forbidden.

**Why.** The baseline has valuable per-shop isolation but production startup targets `dev.db`, registry errors silently fall back, and backup failure does not stop migration.

**Consequences.** Data access APIs change. All current direct `db` imports are inventoried and migrated behind context-aware repositories. Schema/protocol compatibility is declared by releases.

**Migration.** Build the atomic registry and migration coordinator first; add compatibility adapters; migrate call sites by domain; remove fallback proxy last.

**Rejected.** One shared local multi-tenant DB; cloud-authoritative database; preserving implicit global routing.

**Reopen only if.** A proven SQLite/platform defect makes independent shop files unsupportable without violating canonical-desktop authority.

---

## ADR-003 — Key, secret and recovery hierarchy

**Decision.** Replace the plaintext master keyfile with a protected installation root key and wrapped, versioned subkeys: per-shop data keys, secret-store key, backup keys and relay/session keys. Windows OS-backed protection is the launch default. Ciphertexts carry algorithm/key/version and authenticated context. Recovery material is delivered through a user-controlled recovery kit; SahelFlow cannot decrypt seller operational data.

**Why.** One readable file currently unlocks selected PII and all provider credentials. Stronghold registration does not make it the server key authority, and the current hierarchy has no recovery-safe separation.

**Consequences.** Key loss, rotation, transfer, backup recovery and canonical-desktop replacement become explicit state machines. Diagnostics and exports must prove no key/secret leakage.

**Migration.** Add versioned crypto envelopes and key registry; wrap existing key under the new root; re-encrypt by resumable journal; verify before deleting legacy material.

**Rejected.** Cloud escrow of plaintext keys; one key for all purposes; relying only on file permissions; claiming SQLCipher when Prisma does not use it.

**Reopen only if.** Independent security review proves the selected Windows protection/recovery design cannot meet recovery and zero-knowledge requirements.

---

## ADR-004 — Licensing, entitlements, trial, transfer and lockout

**Decision.** Licensing is signed-claim based. The control plane issues the one-time, machine-bound, seven-day trial online. Clients cannot self-issue or reset it. Permanent activation is signed after manual BaridiMob/CCP verification and can be produced through an offline founder signing ceremony. Entitlements encode product major, included/extra shops, member/device limits, canonical installation, support/connected horizon, key/version and revocation epoch.

Trial expiry creates complete product lockout across UI, API, background workers, caches and remote surfaces without deleting data. Permanent local use for the purchased major continues offline. Transfer/recovery is an audited signed state machine.

**Why.** The baseline browser issues unsigned trials and stores them in localStorage; clearing it grants another trial. Current feature claims do not model founder-approved entitlements.

**Consequences.** One entitlement service becomes the only gate. Legacy trusted status rows, local trial creation and scattered feature flags are deleted.

**Migration.** Define signed format and verifier vectors; build issuer/payment/admin records; implement lockout matrix; migrate permanent beta licenses; then remove legacy branches.

**Rejected.** Subscription licensing; product-funded AI entitlement; always-online permanent license; silent grace that bypasses signed policy.

**Reopen only if.** Legal or cryptographic review identifies a blocking flaw, or verified control-plane economics exceed the approved bounded model.

---

## ADR-005 — Tenant/team identity, authorization, devices and approvals

**Decision.** Add first-class tenant, member, role, field-policy, device, session, invitation and approval identities. The control plane is authoritative for remote identity/session state; the desktop maintains a signed bounded cache for offline enforcement. Owner plus ten active members, two personal devices per member and three owner remote devices are explicit entitlement limits.

Authorization uses server-created context. Client-supplied actor, role, tenant or shop is never trusted. High-risk actions require owner permission plus re-authentication or explicit approval according to policy.

**Why.** The baseline is a single-owner PIN application. Free-form actor/assignee/team strings cannot enforce team behavior or produce trusted audit.

**Consequences.** Existing local auth is migrated to an owner principal. Field permission applies in query/projection generation and mutations, not only UI masking.

**Migration.** Build identity schema and policy engine, map local owner, add device enrollment/session revocation, then enable remote/team features.

**Rejected.** Shared PINs, UI-only roles, cloud operational ownership, enterprise SSO for launch.

**Reopen only if.** A founder decision changes explicit team/device entitlements or a legal identity requirement intervenes.

---

## ADR-006 — Transactional audit, inbox/outbox, automation and compensation

**Decision.** Every business mutation atomically records trusted audit, domain event and required outbox/projection intents. Inbound provider/cloud/storefront events enter a durable inbox before acknowledgement. Effects are executed by idempotent workers with attempt/receipt/dead-letter records. Financial, inventory and status reversals use append-only compensation facts.

Automation conditions/editor code may be reused, but fire-and-forget dispatch is replaced by durable intents. AI and remote approvals produce signed/current-state-checked approval receipts.

**Why.** The baseline explicitly dispatches automation and some sidecar updates best-effort after commits. Free-form actors and reversal booleans cannot prove business integrity.

**Consequences.** Domain service APIs and provider workers share one effect protocol. Checkpoints cannot advance past untracked failures.

**Migration.** Add records and transaction helper; dual-write audit/outbox; move workers one effect class at a time; reconcile legacy rows; remove fire-and-forget paths.

**Rejected.** In-process event emitter as authority; distributed transaction with external providers; silent retry without idempotency.

**Reopen only if.** A storage limitation prevents atomic local recording, in which case the desktop data architecture must be reconsidered as a whole.

---

## ADR-007 — Bounded Cloudflare control plane and data classes

**Decision.** Use Cloudflare for a bounded control plane, encrypted relay/projections, zero-knowledge backup objects and hosted storefront runtime. Cloud services store only the data classes permitted by the Engineering Specification. Seller operational plaintext remains on the canonical desktop except deliberately public storefront data and explicitly classified minimal metadata.

Budgets, quotas, retention and outage modes are product behavior. The cloud cannot become a hidden subscription dependency for purchased local use.

**Why.** Founder decisions require connected team/PWA/storefront/backup/licensing capabilities that cannot be delivered by localhost polling or static Pages alone.

**Consequences.** Introduce an isolated cloud workspace with environment separation, migrations, IaC, secrets, cost alerts and data-class review. No cloud work starts before identity/key/protocol foundations.

**Migration.** Build tenant/entitlement identity first, then relay, backup and storefront services as separate bounded modules.

**Rejected.** Supabase restoration, generic cloud database of all seller data, arbitrary serverless sprawl, no-cloud architecture.

**Reopen only if.** Measured Cloudflare cost/limits or law make the approved bounded design unsustainable; evidence must compare equivalent alternatives.

---

## ADR-008 — Encrypted projections, relay and remote command protocol

**Decision.** The PWA receives minimal role/field-filtered projections and submits versioned commands through encrypted tenant/shop/member/device envelopes. Cloud acceptance means queued, not committed. A command succeeds only after canonical desktop commit. Commands expire, are idempotent, are re-authorized on desktop and return explicit conflict results.

Caches are tenant/member/device/shop/schema partitioned, encrypted when sensitive and purgeable on revocation. The PWA never exposes high-risk administration prohibited by the founder scope.

**Why.** The baseline service worker only caches a local app shell and has no identity, pairing, projection, command or revocation protocol.

**Consequences.** The current PWA is not evolved in place. Responsive components may be reused within a new authenticated remote application boundary.

**Migration.** Define protocol and projection schemas; implement desktop durable relay state; add pairing and read-only projections; add commands by risk class.

**Rejected.** Remote direct SQL/API access to desktop DB; cloud multi-master; last-write-wins for business state; browser localStorage authority.

**Reopen only if.** End-to-end performance/cost evidence proves the relay protocol cannot serve the approved bounded scale.

---

## ADR-009 — Zero-knowledge backup and recovery

**Decision.** Backups are consistent client-side snapshots, chunked/versioned, encrypted before upload, authenticated by manifests and restorable without SahelFlow-held decryption keys. Retention is 7 daily, 4 weekly, 6 monthly and up to 3 pinned. A backup is `verified` only after snapshot integrity, remote object verification and periodic isolated restore evidence.

The recovery kit restores keys and tenant/license binding through an audited ceremony.

**Why.** The baseline copies only the active DB locally after best-effort checkpoint and disconnect. It has no cloud format, retention, key separation or restore proof.

**Consequences.** Backup/migration/recovery share one engine. Backup failure blocks destructive migration. Cloud metadata is minimal and cannot decrypt data.

**Migration.** Implement local verified snapshots, manifest/crypto format and restore first; then remote resumable objects and retention; finally disaster recovery drills.

**Rejected.** Plain DB uploads; cloud-managed encryption keys; “copy succeeded” as verification; active-shop-only backup sets.

**Reopen only if.** Independent cryptographic/recovery review finds a blocking defect.

---

## ADR-010 — Hybrid commerce ingress and reconciliation

**Decision.** E-commerce integrations use durable provider inbox processing fed by webhooks where feasible and scheduled reconciliation for completeness. Both paths converge on identical idempotent normalization and domain transactions. Cursors advance only across committed contiguous work or explicitly governed dead letters. Overlap windows handle provider clock/update behavior.

**Why.** The historical polling-only ADR conflicts with founder decisions. The baseline engine advances its watermark after a batch even when individual orders fail.

**Consequences.** Adapter interfaces expose event identity, resource version, pagination, rate-limit and reconciliation semantics. Provider errors are durable records, not result strings only.

**Migration.** Add inbox/checkpoints; wrap current polling as reconciliation producer; certify adapters; add webhooks per provider; remove old watermark authority.

**Rejected.** Webhook-only delivery; polling-only architecture; checkpoint advancement on partial failure.

**Reopen only if.** A provider contract legally/technically forbids webhooks; that provider still uses the same durable reconciliation path.

---

## ADR-011 — Courier capability contract and live certification

**Decision.** Couriers implement a capability-declared adapter contract. UI and automation expose only certified supported operations. Each provider/environment receives a dated live certification record covering auth, create, fees, labels, tracking/status mapping, edit/cancel, idempotency, retries, rate limits, partial failures and reconciliation.

Yalidine, ZR Express and Maystro are planned launch providers; Procolis is optional only after certification. DHD or any other experimental adapter is not public support without a founder scope decision and certification.

**Why.** Source files and mocks do not prove provider behavior. Broad “fully implemented” claims are unsafe.

**Consequences.** Provider drift can automatically mark a capability degraded/disabled. Credentials remain shop-scoped and protected.

**Migration.** Create registry/contract test kit; map existing adapters; hide uncertified capabilities; execute live certification.

**Rejected.** One universal lowest-common-denominator interface; public claims based on mock tests.

**Reopen only if.** Provider legal terms prohibit the planned integration or certification reveals unsustainable economics.

---

## ADR-012 — Hosted storefront tenancy, releases and durable checkout

**Decision.** Storefronts run on a shared multi-tenant hosted runtime with explicit tenant/storefront/shop allocation. Builder drafts publish immutable versioned release artifacts. Launch includes three materially distinct templates. Domains and media are verified and tenant-isolated. Arbitrary seller JavaScript is forbidden.

Checkout derives product price, availability, quantity and shipping server-side; creates a durable encrypted receipt before returning success; and retries relay/import until the canonical desktop commits or explicitly rejects. Receipt status is visible and reconcilable.

**Why.** The baseline storefront writes into whichever local DB is active, uses process-memory rate limiting and assumes future static Pages deployment. That cannot provide durable public checkout or tenancy.

**Consequences.** Existing builder/view components are migrated to release schemas; local direct checkout is retired. Cloud outage and allocation behavior are explicit.

**Migration.** Define tenant/release/receipt schemas; build hosted read path and one template; durable checkout/relay/import; domains/media; remaining templates and rollback.

**Rejected.** Static export with direct local API; customer-trusted price; synchronous desktop availability requirement; arbitrary scripts.

**Reopen only if.** Verified hosted cost at approved scale is unsustainable or a legal constraint requires a different tenancy model.

---

## ADR-013 — Seller-owned Gemini, privacy and action approval

**Decision.** Gemini remains seller-keyed through Google AI Studio. The approved provider/model registry currently selects `gemini-3.5-flash` and can change through reviewed configuration/evidence. No key means AI features are unavailable while core workflows continue.

Provider payloads are built from allowlisted privacy-classified fields, validated by adversarial multilingual tests, and recorded through redacted request receipts. Responses are typed. Mutations remain proposals until a server/desktop approval service verifies authenticated actor, permission, current state and required explicit approval.

**Why.** Existing typed schemas/redaction are useful, but heuristic redaction and client approval UI alone cannot prove privacy or prevent stale/forged destructive actions.

**Consequences.** Direct tool writes are migrated behind approval/action plans. Provider quota/model drift has a kill switch and observable fallback.

**Migration.** Centralize registry/payload builders; build privacy corpus; introduce action plan/approval receipts; migrate tools by risk.

**Rejected.** Product-funded key at launch; raw-object serialization; model name scattered through code; autonomous destructive actions.

**Reopen only if.** Google policy/legal changes block seller-owned usage or verified free-tier economics fail the approved usage model.

---

## ADR-014 — Observability, diagnostics, incidents and cost controls

**Decision.** Implement structured local and cloud health with correlation across transaction, event, effect, command, provider and release IDs. Diagnostic bundles are generated locally, previewable, consented, redacted, encrypted in transit and time-limited. Sentry is optional and cannot be the only support path.

Cloud/provider usage has per-tenant and global quotas, alerts and graceful degradation. Incidents have severity, owner, timeline, affected versions/providers, containment, recovery and postmortem.

**Why.** Baseline logging/Sentry hooks do not provide system-level durability, privacy or cost evidence.

**Consequences.** Every new worker/protocol declares metrics and alert thresholds. Secret/PII canary tests gate diagnostics.

**Migration.** Standardize logger/correlation and local health first; add cloud dashboards/cost controls with each service; add support bundle and incident runbooks before beta.

**Rejected.** Upload-all logs; always-on remote access; hidden unlimited cloud/provider use.

**Reopen only if.** Privacy/legal review requires stronger local-only defaults; changes may only reduce collection.

---

## ADR-015 — Version authority, release channels, updater, rollback and support

**Decision.** A generated version manifest is the single authority for app `1.x.y`, product major, commit, build/channel, schema/protocol/projection/backup/storefront versions, compatibility ranges, signing key IDs and artifact digests. Package/Cargo/Tauri/About/updater/release notes are derived or checked.

Release is artifact-first: build and test a signed candidate from an immutable commit, attach an evidence manifest, approve, then publish. Channels are internal, beta and stable. Stable launch is Windows x64 only. The updater accepts signed compatible artifacts and supports staged rollout/hold.

Rollback favors a compatible forward-fix; destructive schema down-migration is prohibited. Support/connected continuity follows the signed five-year same-major policy while local permanent use remains.

**Why.** The baseline contains 1.0/v3/v4 drift; a local script pushes/tag before build; CI targets unsupported OSes.

**Consequences.** Direct release pushes to main are retired. Branch protection and release approval become mandatory.

**Migration.** Add manifest/generator/check; reset next public version to 1.0.0 under founder-approved migration plan; create Windows candidate workflow; prove updater/rollback.

**Rejected.** Three independent version files; publish-before-build; public stable from an untested tag; macOS/Linux launch.

**Reopen only if.** Platform signing/distribution constraints require another Windows packaging channel, without weakening artifact/evidence authority.

---

## ADR-016 — Risk-based testing, evidence and low-end certification

**Decision.** Verification is risk-class based, not test-count based. Required layers include unit, integration, property/invariant, migration, replay/idempotency, failure injection, security/privacy, packaged E2E, accessibility/RTL, low-end performance, provider live certification, backup/restore and beta evidence. A claim is valid only at an exact commit/artifact and environment.

GitHub checks are binding after CI is repaired. Dependency/security findings are triaged by severity with production-impact findings blocking. Evidence is retained with release candidates.

**Why.** The repository has substantial tests, but packaged E2E is not a PR gate, providers are uncertified, reference hardware is unmeasured and Actions failed before steps during this audit.

**Consequences.** PR templates, issue acceptance criteria and merge gates cite invariants and evidence. Historical counts/percentages are not readiness claims.

**Migration.** Repair CI; establish risk classes and evidence format; make core gates binding; add packaged/reference/provider suites in roadmap order.

**Rejected.** Browser screenshots alone; unit coverage alone; non-blocking security audit; “works in source” as launch proof.

**Reopen only if.** A test method is technically impossible; the replacement must provide equal or stronger evidence.
