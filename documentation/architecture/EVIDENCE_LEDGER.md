# Commit-Linked Launch Evidence Ledger

**Baseline commit:** `03f0d48436b42788e463bbd1d74a388b2da22294`  
**Audit date:** 2026-07-15  
**Allowed statuses:** `Verified`, `Implemented but unvalidated`, `Partial`, `Unsafe`, `Missing`, `Obsolete`

## Status semantics

- **Verified** — behavior was proven at the cited commit by reproducible evidence appropriate to its risk, not merely by source inspection.
- **Implemented but unvalidated** — a coherent implementation exists, but launch-grade runtime/provider/packaged evidence is absent.
- **Partial** — useful pieces exist, but the launch system or invariant is incomplete.
- **Unsafe** — implementation exists but violates a security, privacy, durability, authorization, migration, money, tenant, or recovery invariant.
- **Missing** — no meaningful implementation of the launch system exists.
- **Obsolete** — implementation or documentation encodes a product/architecture choice superseded by the SahelFlow 1.0 Constitution.

No launch system is upgraded to `Verified` by this planning PR because GitHub Actions failed before running any step and no packaged/provider/reference-hardware certification was executed.

## Ledger

| ID | Launch system | Status | Commit-linked evidence | Constitution comparison | Disposition / evidence required |
|---|---|---|---|---|---|
| SYS-001 | Product/version authority | **Unsafe** | `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` say `4.1.0`; README/docs say v3/v4; Constitution says 1.0.0 | One launch identity is mandatory | Replace with generated version manifest; gate all artifacts/docs/migrations/updater on it |
| SYS-002 | Windows packaged runtime | **Implemented but unvalidated** | `src-tauri/`, standalone Next server, bundled runtime/sidecar scripts | Windows is launch platform; packaged evidence mandatory | Keep/harden; prove clean install, first run, upgrade, uninstall/reinstall, offline launch and failure UI |
| SYS-003 | Runtime process supervision | **Unsafe** | Tauri spawns fixed ports 3000/3001; missing services can return success; sidecar events are partly fire-and-forget | Correctness and supportability must survive crashes | Replace with reserved dynamic endpoints, authenticated capability channel, health state machine, restart/recovery evidence |
| SYS-004 | Low-end hardware support | **Missing** | No measured packaged evidence for 4 GB dual-core HDD/SSD 1366×768; build itself requests 4 GB heap | Constitution defines a hard floor | Add reference-device lab, budgets, low-resource mode and release-blocking measurements |
| SYS-005 | Per-shop SQLite authority | **Partial** | Prisma schema and `src/lib/db.ts` route by app-meta active shop | Desktop must remain canonical and shop-isolated | Keep model; replace silent fallback, make shop context explicit, atomic registry, all-shop lifecycle tests |
| SYS-006 | Database query safety | **Unsafe** | `src/lib/db.ts` bulk guard only checks missing/empty top-level `where`, silently falls back to default DB on registry errors | No ambiguous or cross-shop writes | Fail closed, require explicit shop context, recursive undefined rejection, typed repositories and mutation tests |
| SYS-007 | Migrations | **Unsafe** | Tauri migration path targets `shops/dev.db`; backup failure logs and migration continues | Migration requires verified backup and rollback/recovery | Replace runner with all-shop preflight, authenticated backup, integrity check, resumable migration journal and fail-closed launch |
| SYS-008 | Money representation | **Verified** | Core monetary columns in Prisma use integer DZD; canonical metrics module exists | Matches approved DZD behavior | Preserve invariant; add schema/lint/property gates preventing float money |
| SYS-009 | Domain order/catalog/customer foundation | **Implemented but unvalidated** | Prisma models, domain services, order ledger, tests and UI exist | In launch scope | Keep/harden behind explicit transactions, actor identity, outbox, compensation and packaged scenario evidence |
| SYS-010 | Inventory correctness | **Partial** | Product/variant stock and order-service paths exist; historical docs cite fixes | Launch requires trustworthy stock | Add reservation/commit/release facts, concurrency tests, provider/storefront reconciliation and reversal evidence |
| SYS-011 | Returns/refunds/exchanges | **Unsafe** | Return/refund models and services exist; refund reversal has only `reversed/reversedAt` and no explicit compensation facts | Money and inventory reversals must be auditable and correct | Redesign append-only financial/inventory compensations; prove partial/full/refund/reversal/exchange scenarios |
| SYS-012 | COD reconciliation/accounting | **Partial** | COD fields, expenses, metrics, accounting UI exist | Core launch value | Preserve; add remittance ledger, provider references, immutable money events, reconciliation imports and discrepancy workflow |
| SYS-013 | Audit trail | **Partial** | `AuditLog` and `OrderChange` exist; actor is free-form string and audit is not transactionally universal | Every privileged/business mutation needs trusted immutable audit | Migrate to authenticated actor/session/device IDs; write audit in same transaction; hash/sequence integrity and export |
| SYS-014 | Transactional outbox/inbox | **Missing** | No durable outbox/inbox/provider event/dead-letter models in Prisma | Required for providers, automations, cloud and mobile commands | Build before provider/cloud/mobile feature work |
| SYS-015 | Automation engine | **Unsafe** | `dispatchTrigger` is explicitly fire-and-forget; actions/logs are separate from domain commit | No lost or duplicate effects | Keep conditions/editor; replace dispatcher with transactional intents, idempotent workers, approvals, retries and compensation |
| SYS-016 | Local owner authentication | **Unsafe** | PIN/HMAC sessions exist; proxy allows all if `AUTH_SECRET` missing; environment and DB secret paths differ | Authentication must fail closed and support owner/member model | Replace with unified local identity/session authority; bootstrap capability only; no setup-wide bypass |
| SYS-017 | Team identity and permissions | **Missing** | No member/role/device/permission/invitation models; conversation fields are future strings | Owner + 10 active members and field-level permissions are required | Build control-plane identities, desktop cache, roles, field policy, approvals and trusted actor propagation |
| SYS-018 | Device/session limits and revocation | **Missing** | Local session table lacks user/device/license/shop subject; no remote session registry | 2 devices/member and 3 owner remote devices | Build signed device enrollment, session registry, limit enforcement, revocation and offline grace policy |
| SYS-019 | License cryptography | **Partial** | Ed25519 permanent verification exists | Permanent signed activation can be reused | Keep verifier format only after new claims/version/key-rotation spec; add offline signing ceremony evidence |
| SYS-020 | Online trial | **Unsafe** | Browser self-issues unsigned trial, stores it in localStorage; deletion grants a fresh trial | Trial must be signed online, one per machine, 7 days, complete lockout | Delete self-issuance; implement control-plane issuance, anti-replay and server/background/UI enforcement |
| SYS-021 | Entitlements/shop packs/support term | **Missing** | Existing `features:["all"]`; no included/extra-shop, member/device, five-year or major-version claims | Founder decisions require explicit entitlements | Build signed entitlement schema and enforcement service |
| SYS-022 | Manual BaridiMob/CCP payment verification | **Missing** | No founder workflow or payment-verification ledger | Mandatory activation workflow | Build minimal control-plane admin, evidence receipt, approval audit and offline license issuance link |
| SYS-023 | License transfer/recovery | **Missing** | No transfer state machine; local machine ID only | Device replacement and recoverability are mandatory | Build bounded transfer/recovery workflow with signed revocation/activation records |
| SYS-024 | Master key and secret hierarchy | **Unsafe** | `src/lib/crypto/master-key.ts` stores one plaintext hex key file; same root protects PII and secret rows | Credentials and recovery require protected, separable hierarchy | Replace with protected root, wrapped per-shop/data/backup keys, recovery kit, rotation journal and fail-closed loss behavior |
| SYS-025 | Field-level PII encryption | **Partial** | AES-GCM/blind-index extensions cover selected Customer/Order/Conversation/Message fields | Useful defense but not complete zero-knowledge design | Keep primitives; inventory every sensitive field/cache/log, bind AAD/context, version ciphertext and test migrations/tamper |
| SYS-026 | Provider credential storage | **Unsafe** | Credentials are encrypted in per-shop SQLite by the plaintext master key; Stronghold is registered but not server authority | Credentials require protected local storage | Migrate secret service to key hierarchy/OS protection; prohibit export and cross-shop ambiguity |
| SYS-027 | WhatsApp bridge | **Implemented but unvalidated** | Baileys sidecar, loopback bearer auth, QR/send/events exist | WhatsApp is launch scope | Keep as provider adapter candidate; certify real sessions, reconnect, history, duplicates, logout, key protection and policy risk |
| SYS-028 | WhatsApp durable ingress/egress | **Unsafe** | Chats/messages are in-memory in sidecar; acknowledgements and callbacks can be lost | No acknowledged event/effect may disappear | Add encrypted inbox/outbox, event identity, replay, delivery state and sidecar/app crash drills |
| SYS-029 | Gemini extraction/chat | **Partial** | Typed validation, redaction helpers, tools and UI exist | Seller-owned Gemini key and explicit approvals are approved | Keep; centralize model registry, prove redaction corpus, enforce no-key/no-cloud behavior and immutable action approvals |
| SYS-030 | AI privacy | **Unsafe** | Heuristic key/regex redaction; no representative privacy certification or provider request ledger | Product-funded data exposure is prohibited | Add policy engine, allowlisted payload builders, adversarial corpus, request receipts and kill switch |
| SYS-031 | Courier adapter framework | **Partial** | Adapter types and multiple provider files/tests exist | Yalidine, ZR Express, Maystro and optional Procolis are scope | Keep interface ideas; replace claims with capability registry and live certification per provider |
| SYS-032 | Courier providers | **Implemented but unvalidated** | Source adapters and test-connection APIs exist; no live certification evidence at baseline | Public support requires real-provider certification | Certify individually; unsupported capabilities must be hidden/fail closed |
| SYS-033 | E-commerce adapters | **Implemented but unvalidated** | Shopify, WooCommerce and YouCan adapters/tests exist | Launch scope | Keep adapters; certify auth, paging, status mapping, edits, cancellations, rate limits and reconciliation |
| SYS-034 | Commerce synchronization | **Unsafe** | Polling watermark advances after batch despite per-order errors; no durable provider events/checkpoints | Approved architecture is hybrid webhook + scheduled reconciliation, no checkpoint past failure | Replace engine with durable ingress, contiguous checkpoints, replay, dead letters and scheduled reconciliation |
| SYS-035 | Google Sheets export | **Implemented but unvalidated** | Export implementation/tests exist | Launch scope | Keep behind explicit schema, redaction, idempotency, permission and live certification |
| SYS-036 | Storefront local page/builder | **Partial** | Storefront config/view and server-priced checkout exist | Useful UI can migrate | Preserve builder/theme/product UI; detach from local active DB and unsupported hosting assumptions |
| SYS-037 | Hosted multi-tenant storefront | **Missing** | No Cloudflare tenant/release/domain/media/allocation service or data model | Mandatory launch system | Build after control plane, identity, encryption and outbox foundations |
| SYS-038 | Storefront checkout integrity | **Unsafe** | Public route uses process-memory rate limiting and writes directly to active local DB; no durable hosted receipt/relay/replay | Checkout success must mean durable receipt; tenant/shop must be explicit | Replace with durable hosted checkout ingress, server price/stock/shipping, idempotency, allocation and desktop import ack |
| SYS-039 | Storefront templates/releases | **Missing** | One dynamic view/config; no immutable versioned releases or proof of three materially distinct templates | Three distinct templates required | Build template contracts, preview, immutable release artifacts and rollback |
| SYS-040 | PWA install shell | **Obsolete** | Service worker caches local app shell and cannot operate on data without local server | Approved PWA is full operational remote/team surface | Retire as product architecture; reuse responsive UI and manifest assets only |
| SYS-041 | Remote PWA/team operations | **Missing** | No pairing, projections, commands, revocation, tenant/member auth or conflicts | Mandatory launch system | Build only after team identity, control plane, outbox and projection protocols |
| SYS-042 | Cloudflare control plane | **Missing** | No worker/D1/R2/queue code or workspace/dependencies | Mandatory bounded cloud plane | Implement documented data classes, auth, entitlements, routing, cost limits and outage modes |
| SYS-043 | Encrypted projections/relay | **Missing** | No envelope/projection/command protocol | Cloud must not become business authority or see prohibited plaintext | Build versioned E2E envelopes, sequence/replay/expiry, tenant/shop/member scoping and desktop commit acknowledgements |
| SYS-044 | Zero-knowledge cloud backup | **Missing** | Only local byte-copy backup exists | Mandatory at launch | Build encrypted chunk/object format, authenticated manifests, retention, pinning, recovery kit and restore drills |
| SYS-045 | Local backup/restore | **Unsafe** | WAL checkpoint and disconnect are best-effort; no integrity/authentication/restore verification; active shop only | Backup must be provably restorable | Replace implementation under unified backup engine; fail if snapshot cannot be verified |
| SYS-046 | Diagnostics/observability | **Partial** | Logger, Sentry hooks and audit records exist | Support and privacy require bounded diagnostics | Add structured health/events, consented redacted bundles, correlation IDs, local incident log and provider/control-plane dashboards |
| SYS-047 | Founder admin/support plane | **Missing** | No control-plane admin for licenses, payments, transfers, support metadata, incidents or revocation | Required operational capability | Build minimal role-separated admin with immutable actions and no seller operational plaintext |
| SYS-048 | Update verification | **Partial** | Tauri updater pubkey and release manifest exist | Signed updates are required | Keep Tauri mechanism; add channel policy, version manifest, staged rollout, rollback compatibility and updater drills |
| SYS-049 | Release process | **Unsafe** | Local release script pushes/tag before build; CI release targets three OSes and drafts; no evidence manifest | Windows-only launch and evidence gates | Replace with artifact-first candidate pipeline; publish only after signed evidence approval |
| SYS-050 | CI merge gates | **Unsafe** | Workflows exist, audit run failed before any step; dependency audit is non-blocking; packaged E2E absent | No merge/release without binding risk-based gates | Repair Actions, branch protection, required checks, security gates and artifact retention |
| SYS-051 | Unit/integration tests | **Implemented but unvalidated** | Large Vitest suite and historical coverage claims | Valuable but insufficient alone | Re-run from clean baseline in repaired CI; publish machine-readable evidence and mutation/invariant results |
| SYS-052 | Packaged E2E | **Missing** | Playwright specs exist but CI states they are not run; no MSI evidence | Mandatory launch gate | Run against installed signed candidate with real process lifecycle and upgrade/restore scenarios |
| SYS-053 | Accessibility/RTL/responsiveness | **Implemented but unvalidated** | Extensive i18n/UI code and historical browser claims | Mandatory launch quality | Verify keyboard, screen reader, RTL, zoom, 1366×768 and touch on packaged/PWA surfaces |
| SYS-054 | Provider live certification | **Missing** | No current certification records | Mandatory before public support claims | Execute provider registry protocol and retain sanitized evidence |
| SYS-055 | Security/privacy review | **Partial** | Many source hardenings and tests exist; no complete current threat model/pen test | Public stable requires security/privacy evidence | Threat model all trust boundaries, independent review, secret scan, dependency/SBOM and penetration test |
| SYS-056 | Beta seller evidence | **Missing** | No commit-linked launch beta record | Stable gate requires real sellers | Complete staged beta with consent, incident log, restore drill and exit criteria |
| SYS-057 | Documentation authority | **Unsafe** | Root and historical docs contain conflicting versions, readiness and architecture claims | Documentation must be one source of truth | Supersede via this package; preserve history through git and inventory; block claim drift |

## Verified foundations that may be preserved

The ledger intentionally gives few `Verified` ratings. At this commit, source inspection supports preservation of the following narrow invariants:

- Core money fields use integer DZD.
- The repository contains a coherent per-shop SQLite/Prisma model and substantial domain/UI code.
- Ed25519 verification, AES-GCM helpers and blind-index techniques are usable cryptographic primitives, although their surrounding key/license systems are not launch-safe.
- Public storefront item prices are derived from server-side product records rather than trusted client prices.
- The WhatsApp sidecar defaults to loopback binding and protects non-root endpoints with a bearer token.

These statements do not certify the larger launch systems.

## Evidence promotion rule

A row may be promoted only when an evidence record identifies:

1. source commit and artifact digest;
2. environment/device/provider identity;
3. test or drill procedure;
4. expected and actual result;
5. logs/screenshots/receipts with secrets and PII removed;
6. reviewer and date;
7. open defects and accepted residual risk;
8. rollback/recovery outcome where applicable.
