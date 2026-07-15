# SahelFlow 1.0 — Frozen Launch Scope and Entitlements

> **Status:** Founder-approved baseline  
> **Purpose:** Define what Stable must include, what remains conditional on certification, what is excluded, and what each permanent license contains.

## 1. Launch-required systems

A Stable release requires complete, integrated, localized, accessible, tested behavior for:

| System | Required launch outcome |
|---|---|
| Installation and onboarding | Packaged Windows installer, capability preflight, signed trial issuance, shop setup, recovery setup, and guided configuration |
| Licensing and payment | Seven-day signed trial, complete lockout, professional manual BaridiMob/CCP verification, offline permanent signing, transfer/recovery, entitlement dashboard |
| Multi-shop | Five included isolated shops, safe switching, slot accounting, restore/replacement rules, paid expansion to ten |
| Teams | Owner plus ten members, roles, custom permissions, field filtering, workgroups, assignments, local/remote profiles, revocation, audit, approvals |
| Products and inventory | Products, variants, stock, adjustments, history, low-stock workflows, safe imports/exports |
| Customers and risk | Search, history, blacklist, risk factors, encrypted PII, duplicate handling, audit |
| Orders | Manual, WhatsApp, storefront and commerce-platform intake; confirmation, history, state machine, stock effects, conflicts, idempotency |
| WhatsApp | Connection, inbox, message history, extraction review, sending, delivery states, reconnect/recovery, bounded low-resource operation |
| AI | Seller-owned Gemini key wizard, privacy-safe redaction, typed results, explicit approvals, quota/error health, non-AI fallbacks |
| Couriers | Certified launch providers only; shipment, label, tracking, cancellation/return capabilities only where live-proven |
| Commerce integrations | Shopify, WooCommerce and YouCan only after capability-by-capability live certification; hybrid synchronization and repair |
| Delivery and returns | Delivery lifecycle, return/exchange, cancellation, compensation, history and audit |
| Refunds | Creation, explicit compensation facts, reversal, authorization, accounting and audit |
| COD reconciliation | Collected/remitted status, references, discrepancy handling, courier reconciliation and realized economics |
| Expenses/accounting | Integer DZD money, expenses, profit/cost visibility by permission, corrections, export, audit |
| Analytics | Operational, financial, COD, confirmation, delivery, return and team metrics using bounded/indexed aggregation |
| Automations | Conditions, multi-step actions, dry-run, durable outbox, retries, permissions, approval and audit |
| Storefronts | Shared hosted platform, three distinct templates, builder, preview/publish/rollback, delegated allocation, durable COD checkout, tracking/policy pages |
| Mobile/browser companion | Operational workflows, team queues, encrypted projections, signed commands, offline/stale/pending/conflict states |
| Backup/recovery | Local encrypted bundles, zero-knowledge cloud history, verification, clean-install restore, migration rollback, service-exit portability |
| Audit and diagnostics | Global and per-record audit, trusted actor, privacy-safe diagnostics, health dashboards, recovery guidance |
| Founder administration | Licensing, payment review, trial service, transfer, entitlement expansion, incidents, support and provider health |
| Updates and migrations | Signed update channels, version authority, verified pre-migration backup, rollback, compatibility refusal, recovery |

## 2. Conditional launch capabilities

These may be advertised only after live evidence passes the named certification gate:

- Individual courier providers and exact actions.
- Shopify, WooCommerce, and YouCan event/update capabilities.
- YouCan order-update/cancellation hooks.
- Universal apex/root custom domains.
- Tiny11/modified-Windows security equivalence; functional compatibility remains capability-based.
- ARM64 Windows and Wine/Linux builds.
- Sensitive-data Gemini mode using a seller-owned paid project.
- Automated remote wipe where platform capabilities are insufficient.
- Any AI model replacing the certified default.

Conditional capability must remain hidden, labeled experimental, or described narrowly until certified.

## 3. Explicit exclusions from SahelFlow 1.0

- Subscription plans or feature tiers.
- Native Android application.
- macOS or native Linux release.
- Multiple authoritative Windows installations per standard license.
- Cloud multi-master business database.
- Enterprise SSO, Active Directory, payroll, attendance, HR, or employee surveillance.
- TikTok and Meta inbox integrations.
- Multi-country tax/currency localization.
- Public marketplace or agency multi-company tenancy.
- Unlimited shops, users, devices, storage, or traffic.
- Arbitrary storefront JavaScript or unrestricted HTML.
- Automated BaridiMob/CCP monitoring or approval.
- Product-funded general Gemini inference.

## 4. Commercial and entitlement matrix

| Item | Base entitlement |
|---|---:|
| One-time price | 35,000 DZD |
| Purchased major release | 1 |
| Guaranteed maintenance/connected continuity | 5 years from Stable launch |
| Primary owner | 1 |
| Active team members | 10 |
| Personal devices per member | 2 |
| Owner remote devices | 3 |
| Included shops | 5 |
| Extra shops | Up to 5 at 5,000 DZD each |
| Initial total shop ceiling | 10 |
| Storefronts | 1 per entitled shop |
| Default subdomains | 1 per storefront |
| Certified custom subdomains | 1 per storefront |
| Base backup storage | 20 GB shared |
| Backup added per extra shop | 4 GB |
| Base storefront media | 2 GB/storefront, 10 GB shared |
| Media added per extra shop | 2 GB |
| Pinned recovery points | Up to 3/shop within quota |
| Team load-test target | 25 active members |

## 5. Certified data profiles per active shop

### Low-end profile

Validated on the 4 GB reference machine:

- 50,000 orders;
- 250,000 order items;
- 50,000 customers;
- 5,000 products;
- 25,000 variants;
- 50,000 conversations;
- 250,000 messages;
- approximately 2 GB active SQLite database excluding external media.

### Recommended-hardware high-volume profile

- 100,000 orders;
- 500,000 order items;
- 75,000 customers;
- 10,000 products;
- 50,000 variants;
- 100,000 conversations;
- 1,000,000 messages;
- 2,000,000 audit/history/outbox records;
- approximately 5 GB active SQLite database excluding external media.

Larger data remains owned and accessible but falls outside the first-release performance guarantee until separately certified.

## 6. Cloud fair-use validation envelope

Architecture and cost testing must validate at least, per permanent license per month:

- 250,000 remote team/mobile commands;
- 100,000 operational notifications;
- 250,000 storefront visitor sessions across all stores;
- 25,000 durable COD submissions;
- associated webhook, reconciliation, release, domain, and backup operations.

Crossing these figures is not an automatic charge or local lockout. It triggers telemetry review, abuse analysis, and a capacity decision. Security, durability, backups, and paid entitlements cannot be silently weakened.

## 7. Storefront acceptance targets

Initial internal Stable targets:

- mobile LCP p75 <= 1.8 s;
- mobile INP p75 <= 150 ms;
- CLS p75 <= 0.05;
- checkout API p95 <= 500 ms under approved regional tests;
- availability objective >= 99.95%;
- durable receipt before accepted-checkout success: 100%;
- duplicate canonical effect under retry: 0;
- cross-tenant leakage: 0;
- displayed/authoritative price mismatch: 0;
- WCAG 2.2 AA on launch-critical customer journeys.

## 8. Low-end desktop targets

On the 4 GB dual-core floor device with representative data and required components:

- cold usable shell <= 15 s p95 on entry SSD, <= 25 s on HDD;
- ordinary navigation gives visible response <= 100 ms and usable page <= 1.5 s p95;
- indexed order/customer search <= 750 ms p95;
- normal local order mutation <= 1 s p95 excluding provider latency;
- no ordinary interaction freeze > 200 ms;
- steady-state working-set target <= 750 MB with WhatsApp connected and no heavy job;
- no sustained memory growth over an eight-hour session.

On the founder T470 class:

- cold launch <= 8 s p95;
- navigation <= 700 ms p95;
- indexed search <= 350 ms p95;
- ordinary local mutation <= 500 ms p95.

Targets are launch evidence requirements, not claims about the current code.

## 9. Launch evidence gate

Stable requires:

- complete route, command, API, state, permission, and data inventories;
- no unresolved P0/P1 defect;
- packaged installer and updater tests;
- real reference-machine performance;
- real backup/restore/migration drills;
- real provider certification and dated contracts;
- threat models and independent security review of critical architecture;
- team/tenant/field authorization testing;
- offline, cloud-outage, replay, duplicate, conflict, and recovery testing;
- Arabic/French/English and RTL/LTR validation;
- accessibility testing;
- five representative live seller storefronts;
- controlled beta with 3–5 representative Algerian COD businesses;
- public claims linked to evidence.

## 10. Change rule

An entitlement, inclusion, exclusion, price, support promise, or launch gate changes only through a new founder decision. Engineering optimizations cannot silently reduce the complete edition.