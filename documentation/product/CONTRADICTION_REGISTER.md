# SahelFlow 1.0 — Contradiction Register

> **Status:** Active through implementation and Stable release  
> **Architecture package baseline:** source audit at `03f0d48436b42788e463bbd1d74a388b2da22294`  
> **Rule:** A founder choice or ADR closes a decision. `RESOLVED` requires matching implementation, evidence and active documentation.

## States

- **ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED** — the product decision and engineering design are complete; code/evidence do not yet match.
- **DOCUMENTATION RESOLVED / IMPLEMENTATION REQUIRED** — competing active documents were removed/redirected, but code/evidence still conflict.
- **DECISION LOCKED / IMPLEMENTATION REQUIRED** — no additional architecture decision is needed before the roadmap issue is prepared.
- **VERIFICATION REQUIRED** — implementation may exist, but required packaged/provider/security/performance/user evidence is absent.
- **RESOLVED** — decision, implementation, evidence and active documentation agree.

## Register

| ID | Topic | Authoritative position | Architecture-reset result / remaining closure | State |
|---|---|---|---|---|
| CR-001 | Public identity/version | SahelFlow 1.0 / app 1.0.0 with separate version dimensions | Active docs now use 1.0; package/Cargo/Tauri still say 4.1.0. Implement generated version/evidence manifest in M0. | DOCUMENTATION RESOLVED / IMPLEMENTATION REQUIRED |
| CR-002 | Price | 35,000 DZD one-time complete edition | Former 25,000 DZD authority is historical. Build payment/license claims and tests in M4; audit any code/public constants. | DOCUMENTATION RESOLVED / IMPLEMENTATION REQUIRED |
| CR-003 | Shops | Five included; up to five extra at 5,000 DZD each; maximum ten initially | Signed shop-pack entitlement, slot accounting and migration remain M4 work. | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-004 | Support promise | Five-year same-major maintenance/connected continuity; perpetual local use | ADR-004/015 specify separation. Terms, support dates, service-exit tooling and economic evidence remain. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-005 | Teams | Owner + ten active members with roles, fields, devices, queues, approvals and audit | ADR-005 and Engineering Specification define identity/authorization. No matching schema/runtime exists. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-006 | Cloud/local-first | Desktop canonical; bounded Cloudflare control/relay/backup/storefront plane | ADR-007 defines data classes/outages/cost. Cloud implementation is missing. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-007 | Mobile/PWA | Operational companion with limited administration | ADR-008 replaces shell-only local PWA. Pairing, encrypted projections, commands, conflicts and revocation are missing. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-008 | Synchronization transport | Hybrid webhooks plus reconciliation; webhook never sole truth | ADR-010 supersedes polling-only ADR. Durable inbox/checkpoints/reconciliation remain M6/M9/M12. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-009 | Automatic sync | Scheduled, repairable and visible | Current polling is not durable/certified. Implement workers, backfill, health and provider evidence. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-010 | Trial issuance | One signed online machine-bound seven-day trial | ADR-004 specifies issuer/anti-replay. Delete browser self-issuance/localStorage authority in M4. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-011 | Trial expiry | Complete lockout with preserved data | Unified entitlement gate and UI/API/background/remote lockout matrix remain M4. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-012 | License storage | Signed local entitlement protected outside browser authority | ADR-003/004 define key and entitlement caches. Current localStorage/legacy status paths remain unsafe. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-013 | License transfer | One canonical installation with legitimate replacement/recovery | ADR-004 defines an audited signed state machine; control-plane/founder tooling is missing. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-014 | Master key | Protected versioned hierarchy; no plaintext production root key | ADR-003 specifies root/subkeys/recovery. Current plaintext keyfile authority must be migrated. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-015 | Third-party secrets | Seller-controlled, purpose/shop scoped, protected, never browser/cloud/log plaintext | Secret service interface may remain; backend/key hierarchy/migration/evidence remain M3. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-016 | Backup | Zero-knowledge cloud backup, required retention, recovery kit and restore proof | ADR-009 specifies format/process. Current local byte-copy backup is unsafe; M8 implementation is missing. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-017 | Migration | All shops, verified backup, fail closed, resumable journal/recovery | ADR-002 specifies coordinator. Current packaged path targets `dev.db` and can continue after backup failure. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-018 | Transactional effects | Mutation + trusted audit + event/outbox atomicity; durable inbox/effects/compensation | ADR-006 defines records/workers. Current fire-and-forget paths remain unsafe. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-019 | Audit | Trusted actor/session/device and critical facts in same transaction | Existing free-form/best-effort logs must migrate under ADR-005/006. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-020 | Database safety | Explicit trusted shop context; no undefined/empty/cross-shop mutation | ADR-002 replaces global fallback proxy and shallow guards. M2 implementation/tests remain. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-021 | Refund reversal | Append-only exact money/stock/accounting compensations | ADR-006 rejects reversal booleans/heuristics as authority. Domain migration/evidence remain M6/M13. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-022 | AI provider | Seller-owned key; centrally versioned certified default `gemini-3.5-flash` | ADR-013 defines registry/quota/outage behavior. Code/model/provider evidence remain. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-023 | AI privacy | Allowlisted privacy-classified payloads; no silent prohibited plaintext | ADR-013 specifies policy/corpus/receipts. Existing heuristic redaction alone is insufficient. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-024 | AI actions | Typed plan plus current server/desktop permission and explicit approval | ADR-006/013 define action/approval receipts. Generic-current-message confirmation/direct tools must migrate. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-025 | Storefront hosting | Shared multi-tenant hosted runtime with immutable releases | ADR-012 specifies tenancy/releases/domains/media. No implementation exists. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-026 | Storefront templates | Three materially distinct certified templates | Builder UI may migrate; release schema, three systems and evidence remain M11. | DECISION LOCKED / IMPLEMENTATION REQUIRED |
| CR-027 | Storefront checkout | Durable server-authoritative Algerian COD receipt relayed to allocated desktop/shop | ADR-012 replaces active-local-DB checkout. Hosted receipt/idempotency/relay/reconciliation are missing. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-028 | Custom domains | One certified custom subdomain per entitled shop; apex conditional | Domain ownership/DNS/TLS/renewal/transfer runbook and live evidence remain M11. | VERIFICATION REQUIRED |
| CR-029 | Couriers | Only capability-by-capability live-certified providers are public | ADR-011 and Provider Registry govern claims. Yalidine/ZR/Maystro remain candidates; Procolis optional; DHD experimental. | VERIFICATION REQUIRED |
| CR-030 | Commerce platforms | Shopify/WooCommerce/YouCan only after live durable-sync certification | Candidate adapters exist; hybrid ingress, checkpoints, repair and live certification remain. | VERIFICATION REQUIRED |
| CR-031 | Low-end performance | Same correctness/security on 4 GB dual-core floor; T470 reference | ADR-001/016 define budgets/lab. No packaged reference measurements exist. | VERIFICATION REQUIRED |
| CR-032 | Windows compatibility | Windows x64 launch with capability-based support and explicit recovery | M1 package/runtime/preflight and real clean-install/update evidence remain. | VERIFICATION REQUIRED |
| CR-033 | CI quality gates | Required checks actually execute and block merge/Stable | Actions failed before any step during this audit; CI/security/packaged gates must be repaired in M0. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-034 | Test/page/count claims | Generated, scoped, dated evidence only | Former manual active counts are redirected. Automated inventory/evidence manifest remains M0. | DOCUMENTATION RESOLVED / IMPLEMENTATION REQUIRED |
| CR-035 | “Production hardened/99%/fully implemented” claims | Prohibited without evidence-ledger gates | Active README/state/assessment/plan authorities were rewritten/redirected; historical records are explicitly classified. | RESOLVED |
| CR-036 | Documentation authority | Product package + architecture package govern | Inventory created; former active architecture/ADR/state/assessment/build/design docs redirect to current authority. | RESOLVED |
| CR-037 | Unit economics | 20% reserve, conservative five-year connected-service model, no hidden recurring customer fee | Cloud/provider/domain/media/backup costs require measured beta/100/300/1,000-seller model and ADR reopening only if unsustainable. | VERIFICATION REQUIRED |
| CR-038 | Public superiority claims | `Best`/`AAA` only after comparative and production evidence | Claim rule is active; competitor/seller/independent design/security/a11y evidence remains before use. | VERIFICATION REQUIRED |
| CR-039 | Runtime supervision | Windows child services are authenticated, supervised, dynamically addressed and visibly recoverable | ADR-001 specifies target. Current fixed 3000/3001 best-effort process model remains unsafe. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-040 | Release authority | Build/test/sign exact candidate before publish; Windows-only launch; immutable promotion | ADR-015/016 supersede push/tag-before-build and three-OS release workflow. M0/M1/M14 implementation remains. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-041 | Provider delivery durability | No acknowledged provider event/effect can disappear | ADR-006/009/010/011 define inbox/outbox/checkpoints. WhatsApp callbacks and other effects remain partly best-effort. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |
| CR-042 | Tenant/shop allocation | Hosted/PWA/control-plane requests resolve tenant/member/device/shop from trusted context | ADR-005/007/008/012 define authority. Current active-shop/global assumptions cannot support it. | ARCHITECTURE SPECIFIED / IMPLEMENTATION REQUIRED |

## Closure procedure

A row is promoted to `RESOLVED` only when:

1. the product choice and active ADR/spec agree;
2. implementation at an exact commit enforces the relevant invariants;
3. required automated, packaged, provider, security, performance, recovery and user evidence is linked;
4. migrations/deprecations are complete and recoverable;
5. active product/support/public copy matches the evidence;
6. the Evidence Ledger is updated.

Replacing a document or creating an ADR does not by itself resolve an implementation contradiction.
