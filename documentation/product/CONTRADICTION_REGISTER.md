# SahelFlow — Consolidated Contradiction Register

> **Status:** Active until the Architecture Reset closes implementation/documentation drift  
> **Rule:** A founder decision closes the choice, not the implementation. `RESOLVED` requires matching code, tests/evidence, and removal or archival of conflicting active documentation.

## States

- **DECISION LOCKED / IMPLEMENTATION REQUIRED** — founder direction is final; code does not yet match.
- **DOCUMENTATION CLEANUP REQUIRED** — authoritative direction exists; stale claims remain.
- **VERIFICATION REQUIRED** — implementation may exist, but required real/package/provider/performance/security evidence is missing.
- **ARCHITECTURE RESET REQUIRED** — foundational design must be specified before safe coding.
- **RESOLVED** — decision, implementation, evidence, and documentation agree.

## Register

| ID | Topic | Authoritative position | Remaining closure work | State |
|---|---|---|---|---|
| CR-001 | Public identity/version | SahelFlow 1.0 / app 1.0.0; separate version dimensions | Replace v3/v4/v4.1/v4.2 public/current labels; generated version manifest and CI drift check | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-002 | Price | 35,000 DZD one-time complete edition | Replace 25,000/subscription references and code constants; payment/license tests | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-003 | Shops | Five included; up to five extra at 5,000 DZD each; max ten initially | Replace ten-included assumption; signed expansion entitlement and slot accounting | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-004 | Support promise | Five-year guaranteed same-major maintenance/connected continuity; perpetual local use | Financial validation, support dates, service-exit tooling, public terms | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-005 | Teams | One owner + ten members, roles/permissions/queues/approvals/audit | Redesign schema, authorization, actor context, projections, commands, sessions, migration | ARCHITECTURE RESET REQUIRED |
| CR-006 | Cloud/local-first | Desktop canonical; bounded Cloudflare control plane | Superseding cloud ADR, data registry, outage behavior, encryption, cost telemetry | ARCHITECTURE RESET REQUIRED |
| CR-007 | Mobile/PWA | Full operational companion with limited administration | Replace shell-only PWA with pairing, encrypted projections, signed commands, conflicts, revocation | ARCHITECTURE RESET REQUIRED |
| CR-008 | Synchronization transport | Hybrid webhooks + reconciliation; webhook never sole truth | Replace polling-only ADR, unsafe watermark, add durable ingress/retry/checkpoints/health | ARCHITECTURE RESET REQUIRED |
| CR-009 | Automatic sync | Scheduled, repairable, visible hybrid synchronization | Scheduler, provider lifecycle, adaptive polling, backfill, health UX, certification | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-010 | Trial issuance | One signed online trial per recognized machine | Remove self-issued trial, add issuer, entitlement recovery, trusted time, abuse controls | ARCHITECTURE RESET REQUIRED |
| CR-011 | Trial expiry | Complete product lockout with preserved data | Defense-in-depth allowlist across routes/API/background/mobile/cache and localized UX | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-012 | License storage | Tauri/OS-protected authority; no browser localStorage authority | Storage abstraction, migration, tamper/reinstall tests | ARCHITECTURE RESET REQUIRED |
| CR-013 | License transfer | One authoritative machine; legitimate replacement free; protected business transfer | Transfer state machine, revocation, overlap/cutover, recovery, founder tooling | ARCHITECTURE RESET REQUIRED |
| CR-014 | Master key | No plaintext key-file production authority; exact threat model required | Secure storage/key hierarchy/rotation/recovery ADR and implementation | ARCHITECTURE RESET REQUIRED |
| CR-015 | Third-party secrets | Seller-controlled, OS-protected, never cloud/browser plaintext | Secret inventory, migration, backup/transfer behavior, field coverage | ARCHITECTURE RESET REQUIRED |
| CR-016 | Backup | Zero-knowledge cloud backup with seller recovery kit and tested restore | Full format/key/retention/upload/immutability/restore architecture and crypto review | ARCHITECTURE RESET REQUIRED |
| CR-017 | Migration | Verified backup required; fail closed; rollback/recovery | Replace continue-on-backup-failure behavior and prove package migration drills | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-018 | Transactional side effects | Critical mutation + audit + outbox/compensation atomicity | Define transaction boundaries, durable outbox/inbox, retries, idempotency | ARCHITECTURE RESET REQUIRED |
| CR-019 | Audit | Complete trusted actor and critical before/after facts | Team-aware actor model, transactional audit, global/per-record UI, retention | ARCHITECTURE RESET REQUIRED |
| CR-020 | Database safety guard | Dangerous undefined/empty filters must fail safely | Strict recursive validation, explicit escape hatch, tests, aligned comments | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-021 | Refund reversal | Exact stored compensation facts; canonical reversible workflow | Replace heuristic, permissions/UI/audit/tests | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-022 | AI provider | Seller-owned Google AI Studio key; certified default `gemini-3.5-flash` | Versioned provider contract, wizard, secure storage, model health, fallback | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-023 | AI free-tier privacy | Default privacy-safe mode; no silent raw PII/confidential transmission | Local redaction/tokenization, adversarial language tests, data-classification permissions | ARCHITECTURE RESET REQUIRED |
| CR-024 | AI action UX | Typed results and durable exact approval; no generic `oui` authority | Pending action schema, typed cards, idempotency, permission/audit integration | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-025 | Storefront hosting | Shared multi-tenant hosted platform with immutable releases | Tenant/release/media/domain/checkout/allocation ADR and implementation | ARCHITECTURE RESET REQUIRED |
| CR-026 | Storefront templates | Three materially distinct templates | Full builder/template systems and visual/conversion/accessibility evidence | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-027 | Storefront checkout | Durable server-authoritative Algerian COD checkout | Price/stock/delivery validation, allocation, anti-abuse, offline desktop ingress, import | ARCHITECTURE RESET REQUIRED |
| CR-028 | Custom domains | One certified custom subdomain per entitled shop; apex conditional | Ownership/DNS/TLS/renewal/transfer/suspension/recovery certification | VERIFICATION REQUIRED |
| CR-029 | Couriers | Advertise only capability-by-capability certified providers | Live provider contracts/tests; hide DHD experimental behavior | VERIFICATION REQUIRED |
| CR-030 | Commerce platforms | Shopify/Woo/YouCan only after live capability certification | Provider registry, permissions/scopes, rate/retry, webhook contracts, repair tests | VERIFICATION REQUIRED |
| CR-031 | Low-end performance | Same product capability on 4 GB dual-core floor; T470 premium reference | Architecture profiling, process/memory budgets, packaged performance lab | ARCHITECTURE RESET REQUIRED |
| CR-032 | Windows compatibility | Capability-based compatibility; security certification distinguished | Runtime/preflight/fallback design and real tests on standard/modified/old systems | VERIFICATION REQUIRED |
| CR-033 | CI quality gates | Security/performance/test gates must actually block Stable | Remove swallowed failures, valid test keys, packaged E2E, audit/mutation thresholds | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-034 | Test/page counts | Generated, scoped, dated evidence only | Remove stale manual counts; generate route/test/coverage inventories | DOCUMENTATION CLEANUP REQUIRED |
| CR-035 | `production hardened` claims | Prohibited without evidence-ledger gates | Archive/rewrite historical status documents and marketing claims | DOCUMENTATION CLEANUP REQUIRED |
| CR-036 | Documentation authority | `documentation/product/` hierarchy governs | Full repository documentation inventory; archive/delete/redirect conflicting active docs | DOCUMENTATION CLEANUP REQUIRED |
| CR-037 | Unit economics | 20% reserve; five-year conservative model; no hidden recurring customer fee | Model teams/storefronts/backups/domains at beta/100/300/1,000 sellers | VERIFICATION REQUIRED |
| CR-038 | Public superiority claims | `Best/AAA` only after comparative and production evidence | Competitor teardown, real seller metrics, independent design/security/accessibility review | VERIFICATION REQUIRED |

## Next-session closure rule

The next session must expand this register after a full codebase and documentation inventory. It must not mark an item resolved merely because a replacement document exists. Closure requires:

1. authoritative product/engineering decision;
2. implementation matching the decision;
3. required automated, packaged, provider, security, performance, and user evidence;
4. stale active documents removed, archived, or rewritten;
5. public and support copy aligned.