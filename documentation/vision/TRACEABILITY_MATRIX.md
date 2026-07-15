# SahelFlow 1.0 — Vision and Delivery Traceability Matrix

> **Status:** Active traceability baseline  
> **Purpose:** Prevent a founder decision, feature, journey or experience requirement from becoming invisible inside a broad engineering milestone.

## 1. Founder decision coverage

| Decision | Product outcome | Primary milestones | Required evidence |
|---|---|---|---|
| FD-001 | One complete one-time edition | M0, M4, M14 | price/version consistency, entitlement tests, public-copy audit |
| FD-002 | Complete trial-expiry lockout | M4 | UI/API/worker/PWA/cache bypass tests; data-preservation drill |
| FD-003 | Online machine-bound signed trial | M3, M4, M7 | reinstall/replay/clock/outage vectors; signing-key separation |
| FD-004 | Operational PWA/browser companion | M5, M7, M10 | role/field isolation, revocation, offline/conflict, mobile a11y |
| FD-005 | Hybrid Cloudflare control plane | M7 | threat model, outage, encryption, tenant isolation, cost quotas |
| FD-006 | Multi-tenant AAA storefront | M7, M9, M11, M13 | checkout durability, allocation, template, RTL/a11y/perf |
| FD-007 | Zero-knowledge backup | M2, M3, M8 | object inspection, recovery-kit, replacement restore |
| FD-008 | Hybrid commerce sync | M6, M7, M9, M12 | dropped-event repair, dedup, checkpoint, live provider evidence |
| FD-009 | Manual BaridiMob/CCP verification | M4, M7 | fraud/duplicate/amount/session/issuance state-machine tests |
| FD-010 | Low-end-first Windows | M1, continuous, M13 | 4 GB/HDD/SSD/T470 packaged reports |
| FD-011 | Professional teams | M5, M6, M10, M13 | permission, field, concurrency, revocation and actor tests |
| FD-012 | 35,000 DZD price | M0, M4, M14 | single price authority and signed payment metadata |
| FD-013 | Five-year continuity | M4, M7, M14 | support-horizon metadata, outage and economics review |
| FD-014 | Complete-edition boundaries | M4, M5, M7, M8, M11 | boundary/concurrency/quota/storage tests |
| FD-015 | Seller-owned Gemini | M3, M9, M12 | secret storage, privacy corpus, quota/fallback, live certification |
| FD-016 | Transfer and recovery | M3, M4, M8 | planned/emergency/ownership transfer drills |
| FD-017 | Extra-shop purchase | M2, M4, M11 | entitlement amendment, max-shop and capacity tests |
| FD-018 | SahelFlow 1.0 authority | M0, M14 | generated manifest, artifact/version drift gates |

## 2. Capability-to-milestone coverage

| Capability group | Foundation | Product completion | Certification |
|---|---|---|---|
| Installation/runtime | M0–M1 | M13 | M14 |
| Shop management | M2 | M13 | M14 migration matrix |
| Keys/secrets/recovery kit | M3 | M8/M13 | security review + restore |
| Trial/payment/license | M4/M7 | M13 | payment/transfer drills |
| Teams/roles/devices | M5 | M10/M13 | isolation/revocation |
| Products/variants/inventory | M2/M6 | M13 | concurrency/ledger/low-end |
| Customers/risk | M5/M6 | M13 | privacy/accuracy/domain |
| Orders/confirmation | M2/M5/M6 | M13 | money/stock failure tests |
| WhatsApp inbox | M6/M9 | M12/M13 | live lifecycle/policy |
| AI extraction/assistant | M3/M5/M6/M9 | M12/M13 | Darija/privacy/live model |
| Delivery/couriers | M6/M9 | M12/M13 | per-provider certification |
| Returns/refunds | M6 | M13 | compensation/reconciliation |
| COD/accounting/expenses | M6 | M13 | property/mutation/reconcile |
| Analytics | M2/M5/M6 | M13 | definition/perf/permissions |
| Automations | M6 | M13 | crash/retry/approval |
| Commerce sync | M6/M7/M9 | M12 | live hybrid certification |
| Sheets/import/export | M2/M6/M9 | M12/M13 | data/migration evidence |
| PWA/browser | M5/M7 | M10 | mobile/RTL/revocation |
| Storefront | M7/M9 | M11 | checkout/templates/perf |
| Backup | M2/M3 | M8 | replacement restore |
| Support/diagnostics | M1/M7 | M13/M14 | privacy and incident drill |
| Founder admin | M4/M7 | M12/M14 | audit, key and incident controls |
| Marketing/help/legal | M0 authority | M14 | copy/evidence/legal review |
| Release/update | M0/M1 | continuous | M14 signed candidate |

## 3. Experience coverage requirements

Every launch surface must cover:

| Dimension | Desktop | PWA | Storefront | Founder admin | Marketing/help |
|---|:---:|:---:|:---:|:---:|:---:|
| Motion/reduced motion | ✓ | ✓ | ✓ | ✓ | ✓ |
| Density/responsiveness | ✓ | ✓ | ✓ | ✓ | ✓ |
| AR/FR/EN | ✓ | ✓ | ✓ | at least required admin locales | ✓ |
| RTL/bidi | ✓ | ✓ | ✓ | required admin views | ✓ |
| Keyboard | ✓ | applicable | applicable | ✓ | ✓ |
| Screen reader | ✓ | ✓ | ✓ | ✓ | ✓ |
| Empty/loading/error | ✓ | ✓ | ✓ | ✓ | ✓ |
| Degraded/offline | ✓ | ✓ | receipt/import state | control-plane outage | download/support outage |
| Permission/authority | ✓ | ✓ | public/tenant allocation | founder roles | public only |
| Low-end/performance | ✓ | ✓ | ✓ | reasonable | Core Web Vitals |
| Evidence/claim honesty | ✓ | ✓ | ✓ | ✓ | ✓ |

## 4. Journey evidence matrix

| Journey | Critical proof |
|---|---|
| Install and first run | clean standard-user install; missing dependency; low disk; tamper |
| Trial | one-per-machine; reinstall; clock; outage; expiry lockout |
| Purchase/activation | amount mismatch; duplicate evidence; interrupted signing; offline license |
| Onboarding | fresh DB to first valid order; skip/resume; accessibility |
| Order intake | duplicate/replay; source preservation; invalid data; audit/outbox |
| Confirmation | transition, reservation, assignment, permission, reschedule |
| Shipment | unknown timeout result; idempotency; label; provider degradation |
| Delivery tracking | missed webhook repair; status conflict; stale provider |
| Return/refund | partial/full/reversal; stock and COD compensation |
| COD reconciliation | property tests; unmatched/partial/duplicate batches |
| Team operations | field isolation; concurrency; revocation/cache purge |
| Automation | crash at every step; duplicate effect; poison event |
| PWA command | queued vs committed; expiry; conflict; offline; revocation |
| Storefront checkout | tampered price/allocation; duplicate; desktop offline |
| Backup/restore | corruption; interruption; missing object; replacement machine |
| Transfer/recovery | old device unavailable; replay; revocation; health |
| Update/migration | every shop; backup failure; interruption; incompatible/tampered |
| Provider sync | dropped event; duplicate; partial page; rate limit; wider scan |
| Support incident | redaction; consent; containment; postmortem |
| Beta | real workflows, recovery drills, no unresolved money-loss incident |

## 5. Page/surface completion record template

Each page or major view receives a row in the generated implementation inventory:

| Field | Required value |
|---|---|
| Route/view | Stable identifier |
| Surface | Desktop/PWA/storefront/admin/public |
| Job | What the user is accomplishing |
| Roles | Allowed principals |
| Read model | Versioned source/projection |
| Writes | Commands/transactions |
| Connections | Related entities/views |
| States | Empty/loading/error/offline/degraded/conflict |
| Data UX | Search/filter/sort/bulk/etc. |
| RTL/a11y | Required evidence |
| Performance | Dataset/device budget |
| Milestone/issues | Delivery links |
| Evidence | Exact commit/artifact |

## 6. Historical recovery controls

Any issue based on historical content must include:

- source document and commit/branch;
- durable idea being recovered;
- final founder decision compatibility;
- old assumptions explicitly not recovered;
- current architecture mapping;
- updated acceptance/evidence.

This prevents copying an old solution together with its obsolete product model.
