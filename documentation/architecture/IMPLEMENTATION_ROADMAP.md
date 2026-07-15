# Dependency-Correct Implementation Roadmap

**Status:** Approved planning baseline; no feature implementation is authorized by this document alone.  
**Baseline commit:** `03f0d48436b42788e463bbd1d74a388b2da22294`

## Sequencing principle

The roadmap is ordered by authority and risk, not by visible feature appeal. Cloud, mobile, storefront and provider expansion cannot be made safe before local identity, keys, explicit shop context, transactional events and release evidence exist.

## Dependency graph

```text
M0 Authority + CI
 ├─> M1 Windows runtime + version manifest + performance harness
 ├─> M2 Explicit shop context + registry + migration/backup preflight
 │    └─> M3 Key hierarchy + secret migration + recovery kit
 │         └─> M4 Licensing/entitlements/payment/transfer
 └─> M5 Tenant/member/device/session/authorization

M2 + M5 ─> M6 Transactional audit + inbox/outbox + compensation
M3 + M4 + M5 + M6 ─> M7 Cloud control plane + encrypted relay foundation
M2 + M3 + M6 ─> M8 Verified zero-knowledge backup
M6 ─> M9 Provider worker framework
M7 + M9 ─> M10 Remote PWA projections/commands
M7 + M9 ─> M11 Hosted storefront/releases/checkout
M9 ─> M12 Commerce/courier/WhatsApp/Sheets/Gemini certification
M1..M12 ─> M13 Domain/UI convergence, accessibility and low-end hardening
M1..M13 ─> M14 Beta, incident drills and stable release
```

## Milestone M0 — Authority, branch protection and reproducible verification

**Goal:** Make repository truth and merge evidence reliable before architecture changes.

### Epics

- M0-E1: Generate single version/evidence manifest skeleton and reset authority to SahelFlow 1.0.
- M0-E2: Repair GitHub Actions startup/execution; retain logs/artifacts.
- M0-E3: Add branch protection, required checks, CODEOWNERS/risk reviewers and PR templates.
- M0-E4: Inventory tracked files, routes, models, migrations, tests, provider claims and dependencies automatically.
- M0-E5: Convert historical active docs to redirects/archive index and add claim-drift checks.
- M0-E6: Establish evidence-record schema and release candidate directory/storage.

### Exit criteria

- CI executes from a clean checkout on PRs.
- Type, lint, unit/integration, migration status and dependency checks are binding.
- The exact source commit and generated manifest appear in build/test evidence.
- No v3/v4/unsupported-platform/readiness claim remains active.
- Documentation-only changes prove the workflow before feature code starts.

## Milestone M1 — Windows runtime, process supervision and low-end harness

**Goal:** Establish a supportable packaged runtime before changing business authority.

### Epics

- M1-E1: Windows-only Tauri bundle configuration and candidate workflow.
- M1-E2: Dynamic authenticated local endpoint/service manifest.
- M1-E3: Process supervisor, health state machine, crash/restart budget and visible recovery UI.
- M1-E4: Bundled runtime/server/sidecar integrity checks and artifact hashes.
- M1-E5: Structured startup diagnostics and support bundle seed.
- M1-E6: T470 and 4 GB dual-core HDD/SSD performance harness and datasets.

### Exit criteria

- Signed candidate installs and launches on clean Windows without Node/Bun/Rust.
- Child crash, occupied endpoint, missing resource and corrupt install scenarios are visible and recoverable.
- Process memory/CPU/startup budgets are measured and published.
- No macOS/Linux stable artifact is produced.

## Milestone M2 — Explicit shop authority, atomic registry and safe migrations

**Goal:** Eliminate ambiguous database routing and make all-shop upgrades recoverable.

### Epics

- M2-E1: Versioned atomic application/shop registry and recovery state.
- M2-E2: Trusted `ShopContext`, context-aware repository interfaces and background-job scoping.
- M2-E3: Remove silent fallback-to-dev behavior.
- M2-E4: Recursive safe filter/query constructors and mutation guard tests.
- M2-E5: All-shop migration coordinator, journal, compatibility manifest and maintenance UI.
- M2-E6: Verified local snapshot primitive used by migrations.
- M2-E7: Incremental domain migration from global `db` proxy.

### Exit criteria

- Every write is provably shop-scoped.
- Corrupt/missing registry never opens another shop DB.
- Migration enumerates all shops, blocks on backup failure and resumes after interruption.
- Existing seller data migrates with an auditable report.

## Milestone M3 — Key hierarchy, secrets and recovery kit

**Goal:** Replace the plaintext master-key authority without losing current data.

### Epics

- M3-E1: Threat model and Windows protected root-key design.
- M3-E2: Versioned ciphertext/key envelope and per-shop/secret/backup key separation.
- M3-E3: Resumable legacy key wrapping/re-encryption migration.
- M3-E4: Scoped secret-service backend and provider credential migration.
- M3-E5: Recovery-kit format, UX, storage warnings and restore ceremony.
- M3-E6: Rotation/revocation journal and failure recovery.
- M3-E7: Secret/PII canary scanner for logs, DB, browser caches, diagnostics and cloud payload fixtures.

### Exit criteria

- No plaintext root/provider secret is stored in ordinary files/DB/browser/cloud.
- Current encrypted data survives migration, restart, rotation and replacement-machine recovery drill.
- Losing one subkey does not expose unrelated shops/purposes.
- Independent security review accepts the hierarchy or records blocking findings.

## Milestone M4 — Signed trial, entitlements, payment verification and transfer

**Goal:** Implement the founder-approved commercial contract exactly.

### Epics

- M4-E1: Signed entitlement format, verifier vectors, key rotation and revocation epoch.
- M4-E2: Online one-per-machine seven-day trial issuer and anti-replay records.
- M4-E3: Unified complete-lockout enforcement matrix.
- M4-E4: Manual BaridiMob/CCP verification and immutable founder approval record.
- M4-E5: Offline permanent-license signing ceremony/tooling.
- M4-E6: Included/extra shop, member/device and five-year same-major claims/enforcement.
- M4-E7: Canonical installation transfer/recovery state machine.
- M4-E8: Legacy license migration and deletion of self-issued/local trusted-status paths.

### Exit criteria

- Clearing/reinstalling local state does not create another trial.
- Expired trial blocks UI/API/background/remote operations and preserves data.
- Permanent major-version local use works through a prolonged control-plane outage.
- Founder can verify payment, issue, transfer and revoke with immutable audit.

## Milestone M5 — Tenant, team, device, session and field authorization

**Goal:** Establish trusted human/device identity before remote/team features.

### Epics

- M5-E1: Tenant/member/role/field-policy/device/session/invitation/approval schemas.
- M5-E2: Owner migration from current PIN/bootstrap state.
- M5-E3: Local unlock and remote session authentication.
- M5-E4: Device enrollment, two-device/three-owner-device limits and revocation.
- M5-E5: Server/desktop policy engine and trusted request context.
- M5-E6: Owner re-auth/approval flows for high-risk actions.
- M5-E7: Audit actor migration from free-form strings.

### Exit criteria

- Forged client actor/role/shop/tenant claims fail.
- Field permissions are enforced in queries/projections/mutations.
- Revoked devices/sessions lose access and cached data is purged according to policy.
- Owner plus ten active members and device limits are enforced under concurrency.

## Milestone M6 — Transactional audit, domain events, inbox/outbox and compensation

**Goal:** Create the durability foundation for all connected and automated behavior.

### Epics

- M6-E1: Event, audit, inbox, outbox, effect, receipt, dead-letter and checkpoint schema.
- M6-E2: Transaction helper enforcing domain + audit + event + outbox atomicity.
- M6-E3: Idempotency/effect-key service and replay semantics.
- M6-E4: Worker scheduler, backpressure, retry classes and health.
- M6-E5: Explicit money/inventory/status compensation ledgers.
- M6-E6: Migrate automation dispatch and low-stock notifications.
- M6-E7: Migrate sidecar callbacks and current provider effects.
- M6-E8: Reconciliation UI/runbook and operator controls.

### Exit criteria

- Crash-at-every-step tests show no acknowledged event loss or duplicate effect.
- Audit actor and outbox intent are in the same transaction as every high-risk mutation.
- Checkpoints block on poison events until tracked resolution.
- Refund/cancel/return/reversal scenarios reconcile money and stock through explicit facts.

## Milestone M7 — Cloud control plane and encrypted relay foundation

**Goal:** Build the bounded connected plane without moving operational authority to cloud.

### Epics

- M7-E1: Cloud workspace, IaC, environment separation and data-class enforcement.
- M7-E2: Tenant/license/member/device/session/control-plane APIs.
- M7-E3: Envelope protocol, signing/encryption, sequence, expiry and replay defense.
- M7-E4: Durable relay queues/storage and desktop connector worker.
- M7-E5: Cost quotas, rate limits, retention and outage modes.
- M7-E6: Founder admin/support minimum viable plane.
- M7-E7: Cloud threat model, security tests and disaster recovery.

### Exit criteria

- Packet/object inspection confirms no prohibited operational plaintext.
- Cross-tenant, replay, expiry and revocation tests pass.
- Desktop operates locally through prolonged cloud outage and reconciles safely.
- Cost alarms and per-tenant quotas are demonstrated.

## Milestone M8 — Zero-knowledge cloud backup

**Goal:** Deliver mandatory recoverability before beta data is trusted.

### Epics

- M8-E1: Consistent all-shop snapshot and integrity checks.
- M8-E2: Versioned encrypted chunk/manifest format.
- M8-E3: Resumable upload/download and remote verification.
- M8-E4: 7/4/6 + 3 pinned retention scheduler.
- M8-E5: Replacement-install recovery using recovery kit and entitlement transfer.
- M8-E6: Periodic isolated restore certification and support UX.

### Exit criteria

- SahelFlow/cloud operator cannot decrypt backup objects.
- Interrupted, duplicate, corrupt and missing-object scenarios are handled.
- A replacement Windows installation restores every shop and passes application checks.
- Migration coordinator consumes only verified backups.

## Milestone M9 — Provider contract and worker framework

**Goal:** Make integrations durable and certifiable before expanding them.

### Epics

- M9-E1: Common provider capability/error/idempotency/rate-limit contract.
- M9-E2: Credential handles and scoped worker execution.
- M9-E3: Provider inbox/outbox adapters, checkpoints and reconciliation records.
- M9-E4: Certification harness and evidence format.
- M9-E5: Provider health/degradation/kill switches and UI capability flags.

### Exit criteria

- Provider mocks and fault injection prove worker invariants.
- Unsupported/uncertified capabilities are hidden or explicit.
- One pilot provider passes a complete live certification before broader migration.

## Milestone M10 — Operational PWA projections and commands

**Goal:** Deliver bounded team operations without creating cloud multi-master.

### Epics

- M10-E1: Device pairing/enrollment and remote session UX.
- M10-E2: Role/field-filtered encrypted projection generation.
- M10-E3: Partitioned encrypted PWA cache and revocation purge.
- M10-E4: Read-only operational views with stale/offline state.
- M10-E5: Low-risk commands, queued/commit/result UX and conflicts.
- M10-E6: Higher-risk permitted commands with approvals; exclude prohibited admin.
- M10-E7: Accessibility/RTL/mobile performance certification.

### Exit criteria

- Remote success appears only after desktop commit.
- Cross-member/tenant/shop cache and command attacks fail.
- Revoked device loses session and cached sensitive projections.
- Offline/stale/conflict behavior is understandable and tested.

## Milestone M11 — Hosted multi-tenant storefront

**Goal:** Publish durable seller storefronts and checkout.

### Epics

- M11-E1: Tenant/storefront/domain/media/allocation data model.
- M11-E2: Draft builder to immutable release pipeline.
- M11-E3: Hosted render runtime and first template.
- M11-E4: Durable server-authoritative checkout receipt and anti-abuse controls.
- M11-E5: Encrypted relay/import/ack/reconciliation to desktop.
- M11-E6: Domain verification/TLS and content-addressed media.
- M11-E7: Two additional materially distinct templates.
- M11-E8: Release rollback and seller-visible receipt/import status.

### Exit criteria

- Tampered price/shop/allocation requests fail.
- Desktop offline at checkout does not lose an accepted order.
- Duplicate/replay/partial relay scenarios reconcile.
- Three templates pass visual, accessibility, RTL, mobile and checkout evidence.

## Milestone M12 — Provider migrations and live certification

**Goal:** Certify all launch integrations against the durable framework.

### Epics

- M12-E1: WhatsApp/Baileys lifecycle, durable events and policy certification.
- M12-E2: Shopify hybrid webhook/reconciliation certification.
- M12-E3: WooCommerce hybrid webhook/reconciliation certification.
- M12-E4: YouCan hybrid webhook/reconciliation certification.
- M12-E5: Yalidine certification.
- M12-E6: ZR Express certification.
- M12-E7: Maystro certification.
- M12-E8: Optional Procolis certification decision.
- M12-E9: Google Sheets export certification.
- M12-E10: Gemini privacy/typed extraction/action certification with real Darija corpus.

### Exit criteria

- Each public capability has current live evidence and known limitations.
- Provider outage/rate-limit/credential-expiry/status-drift drills pass.
- Uncertified DHD/other providers remain experimental and hidden.

## Milestone M13 — Domain/UI convergence, accessibility, security and low-end hardening

**Goal:** Complete product behavior on the new authorities and prove whole-system quality.

### Epics

- M13-E1: Migrate remaining direct DB writes/global shop assumptions.
- M13-E2: Reconcile catalog, order, stock, COD, refund, return and accounting UI with ledgers.
- M13-E3: Automation/AI approval UX and operator recovery tools.
- M13-E4: Full i18n/RTL/a11y audit across desktop, PWA and storefront.
- M13-E5: Low-resource scheduling, pagination, cache and rendering optimization.
- M13-E6: Threat model closure, dependency/SBOM, pen test and privacy review.
- M13-E7: Documentation, support and incident runbooks.

### Exit criteria

- All launch invariants have automated or drill evidence.
- Reference devices meet budgets without correctness/security reduction.
- No critical/high security finding remains open without founder acceptance and bounded mitigation.
- Documentation/evidence ledger matches implementation.

## Milestone M14 — Beta and stable release

**Goal:** Prove operations with real sellers and publish a recoverable Windows stable release.

### Epics

- M14-E1: Internal dogfood and full disaster/rollback drills.
- M14-E2: Controlled beta cohort, onboarding and support.
- M14-E3: Provider/control-plane/storefront/PWA incident exercises.
- M14-E4: Beta data recovery and replacement-install drills.
- M14-E5: Stable release candidate, signed evidence manifest and founder approval.
- M14-E6: Staged updater rollout, monitoring and post-release review.

### Exit criteria

- Beta exit criteria in the Constitution are met.
- Signed installer/updater, release manifest and all evidence are immutable and reviewed.
- Rollback/hold/forward-fix procedures are exercised.
- Known limitations are accurate, public claims are evidence-linked and support is ready.

## Parallelism rules

Permitted parallel work is bounded by dependencies:

- M1 can run alongside M2 after M0.
- M3 and M5 can overlap after their prerequisites, but licensing M4 depends on M3.
- UI design prototypes for PWA/storefront may occur early in isolated branches, but no production data protocol or feature claim can merge before M7/M6 foundations.
- Provider contract research can begin during M6; live adapter migration waits for M9.
- Security, documentation and performance evidence are continuous work, not end-stage cleanup.

## Critical path

`M0 → M2 → M3 → M4 → M5/M6 → M7 → M8/M9 → M10/M11/M12 → M13 → M14`

Any issue that bypasses this path must state why it does not depend on the missing authority and how it avoids creating migration debt.
