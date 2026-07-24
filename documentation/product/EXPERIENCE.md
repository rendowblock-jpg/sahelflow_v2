# SahelFlow 1.0 — Experience and Capability Contract

> **Status:** Active experience authority
> **Last consolidated:** 2026-07-24
> **Purpose:** Define every required capability, journey, operational state and
> AAA user-experience standard in one place.

A capability may be reused, hardened, migrated, replaced or newly implemented. Its presence in this atlas does not claim the current code is ready.

## Experience thesis — quiet power

SahelFlow should feel powerful without feeling heavy. The seller experiences a
clear command center rather than a maze of modules, dense operational
information without noise, immediate feedback without distracting motion, and
human recovery guidance instead of developer jargon. Money, stock, authority,
sync and failure states remain explicit. Arabic, French and English receive the
same product depth.

“Premium” means intentional states, trustworthy numbers, fast common paths,
discoverable advanced paths and graceful recovery. It does not mean decorative
gradients, excessive cards or animation.

## 1. Product surfaces

| Surface | Purpose | Authority |
|---|---|---|
| Windows desktop | Full business operation and administration | Canonical business authority |
| Android PWA | Daily operational work and queues | Projection/command client |
| Responsive browser workspace | Operational access from approved devices | Projection/command client |
| Hosted storefront | Public catalog, COD checkout and tracking | Immutable release + durable receipt |
| Cloud control plane | Identity, licensing, routing, relay, support and release control | Bounded control authority |
| Founder admin | Payment, license, transfer, support, incidents and releases | SahelFlow control authority |
| Marketing/help site | Acquisition, education, download, legal and support | Public information |
| Provider workers | WhatsApp, AI, courier, commerce and Sheets effects | Scoped external-effect executors |

## 2. Installation, setup and onboarding

Required functions:

- signed Windows installer and updater;
- clean install without Node, Bun or Rust;
- component and runtime prerequisite diagnosis;
- first-run language, theme and accessibility preference;
- owner identity creation and secure local unlock;
- trial retrieval or activation;
- business profile and first shop creation;
- recovery-kit creation with explicit loss warnings;
- optional sample data that is clearly separated from real data;
- guided first product, customer and order;
- WhatsApp connection wizard;
- Gemini key wizard;
- courier and commerce connection tests;
- backup enrollment;
- team invitation;
- completion checklist with resumable progress;
- skip-now paths that leave visible incomplete setup states;
- fresh-install to first valid order target;
- onboarding reset and support recovery.

## 3. Shop and workspace management

- five included active shops and expansion to ten;
- atomic shop registry;
- explicit trusted shop context;
- create, rename, archive and recover a shop;
- switch active UI preference without changing background authority;
- per-shop locale, address, storefront and provider configuration;
- per-shop member access;
- per-shop database health, migration and backup status;
- shop import/export and compatibility report;
- safe shop deletion ceremony with owner re-authentication;
- extra-shop purchase and signed entitlement amendment;
- no silent fallback to another shop database.

## 4. Team, identity and work management

- owner, manager, operator and viewer/analyst presets;
- custom roles;
- action-level and field-level permissions;
- per-shop membership;
- invitations and acceptance;
- local operator profile;
- remote session authentication;
- member and owner device enrollment;
- session/device/member revocation;
- assignments, workgroups and queues;
- internal notes and comments;
- mentions and handovers;
- approval requests;
- optional two-person approval for configured high-risk actions;
- activity and audit history;
- presence/availability only where privacy-safe and operationally useful;
- no employee surveillance, payroll or attendance in 1.0.

## 5. Products, variants and inventory

### Catalog

- product create/read/update/archive/restore;
- SKU and barcode;
- categories and tags;
- descriptions and multilingual public copy;
- multiple images;
- active/inactive state;
- cost and selling price;
- bulk editing;
- CSV/XLSX import with preview and mapping;
- export;
- duplicate detection;
- search, filters, multi-sort, saved views and recent records.

### Variants

- variant name, SKU, price override, cost and stock;
- color/size or generic option presentation;
- default variant;
- variant activation;
- variant image association;
- storefront variant picker;
- out-of-stock behavior.

### Inventory

- stock on hand, reserved, available and damaged where applicable;
- append-only stock ledger;
- manual adjustment with reason;
- order reservation and release;
- delivery, cancellation, return and exchange compensation;
- low-stock thresholds and alerts;
- stock history and reconciliation;
- concurrency protection;
- no negative or double-adjusted inventory.

## 6. Customers and risk

- customer create/read/update/archive/restore;
- encrypted name, phone, alternate phone, address and notes;
- normalized phone and blind-index lookup;
- duplicate detection and merge;
- order, delivery, return and refund history;
- lifetime and realized value;
- delivery and return rates;
- blacklist with reason, actor and timestamp;
- phone reputation;
- wilaya and commune context;
- risk factors and explainable score;
- configurable thresholds and rules;
- manual override with reason;
- risk history;
- customer contact handoff;
- data access, correction and deletion/export workflows subject to law and business-record requirements.

## 7. Orders and confirmation

### Sources

- manual entry;
- WhatsApp extraction;
- AI chat action draft;
- hosted storefront receipt;
- Shopify;
- WooCommerce;
- YouCan;
- import;
- automation where explicitly approved.

### Order functions

- draft, pending, confirmed, fulfillment, shipped, delivered, failed/refused, cancelled, returned and other certified states;
- explicit valid transition graph;
- source evidence and external IDs;
- customer and address;
- products, variants, quantity and price;
- shipping fee, discount and totals;
- notes and internal comments;
- owner/assignee/queue;
- risk assessment and confirmation priority;
- optimistic concurrency;
- idempotent creation;
- search, filters, multi-sort, group-by and saved views;
- bulk confirm, assign, ship, cancel and other safe operations;
- order timeline;
- audit history;
- entity drawers and hover previews;
- print/label actions;
- import/export;
- delete/archive rules that preserve financial and audit facts.

### Confirmation queue

- priority based on risk, age, source and seller policy;
- WhatsApp/call contact action;
- confirmation result;
- reschedule and snooze;
- reason codes;
- assignment and SLA;
- AI draft review;
- bulk safe actions;
- “all caught up” success state.

## 8. WhatsApp inbox

- QR/pairing lifecycle;
- connection and reconnect state;
- conversation list, thread and customer context;
- unread, open, pending, snoozed and closed states;
- priority, labels, assignment and queue;
- text, image, document and voice messages;
- send status and receipts where available;
- search;
- canned replies and templates;
- media sending;
- contact sync;
- message-to-customer association;
- message-to-order draft extraction;
- human review before order creation;
- activity events in thread;
- internal notes distinct from customer messages;
- bounded reconnect and visible failure;
- export/support diagnostics without secret or PII leakage;
- unofficial-provider risk disclosed and monitored.

Broadcast or bulk messaging may be included only when provider policy, consent, rate limits and abuse controls are certified.

## 9. AI extraction and assistant

### Key and privacy

- seller-owned Gemini key;
- protected desktop secret storage;
- AR/FR/EN setup wizard;
- restriction, rotation and disconnection guidance;
- privacy mode and payload preview where useful;
- no silent raw PII/full-history transmission;
- quota, model and error diagnosis.

### Extraction

- deterministic local parsing;
- redaction/tokenization;
- Gemini structured extraction;
- schema validation;
- confidence by field;
- low-confidence review queue;
- manual correction;
- real Darija corpus certification;
- model/version tracking;
- measured latency and accuracy.

### Assistant

- typed tools and capability registry;
- inline tool-result cards, not raw JSON;
- source links and affected-record preview;
- persistent confirmation card for destructive actions;
- permission and current-state recheck at commit;
- retry and partial-response recovery;
- audited action result;
- safe fallback when AI is unavailable;
- no autonomous owner-authority mutation.

## 10. Delivery and courier operations

- provider connection and credential test;
- declared capability matrix per courier;
- fee/service-area lookup where supported;
- create shipment;
- label retrieval/printing;
- office/desk/home delivery options;
- wilaya/commune mapping;
- bulk shipment creation;
- tracking timeline;
- status normalization;
- edit/cancel where supported;
- pickup coordination where supported;
- provider health and degraded state;
- retries, idempotency and reconciliation;
- manual correction with audit;
- order-state synchronization;
- delivery cost;
- failed/refused/returned handling;
- live certification for Yalidine, ZR Express and Maystro;
- DHD and Procolis exposed only according to certified status.

## 11. Returns, exchanges and refunds

### Returns/exchanges

- request, approval, rejection, receipt and completion states;
- return reason and evidence;
- returned items and quantities;
- exchange replacement items;
- stock restoration or damage disposition;
- delivery/courier relationship;
- customer history update;
- notes and timeline;
- search, filters, bulk safe actions and export.

### Refunds

- full and partial refund;
- idempotency;
- refund method and reason;
- explicit money ledger;
- reversal through append-only compensation;
- COD impact;
- customer and order balance;
- approval according to policy;
- no boolean-only reversal;
- discrepancy and reconciliation views.

## 12. COD, accounting and expenses

### COD reconciliation

- expected COD;
- collected, remitted and pending states;
- courier remittance batches;
- fee, adjustment and discrepancy lines;
- bulk reconciliation;
- evidence/receipt reference;
- unmatched and partially matched items;
- immutable financial facts;
- correction through adjustment/compensation;
- period and courier views;
- export.

### Accounting

- gross order value;
- realized delivered revenue;
- shipping income/cost where applicable;
- product COGS from explicit cost, never silent percentage guess;
- refunds, returns and losses;
- operating expenses;
- net profit;
- cash/COD receivable position;
- period comparison;
- SKU, channel, wilaya and courier profitability;
- missing-cost warnings;
- exact metric definitions shared across dashboard, analytics and accounting.

### Expenses

- create/update/archive/restore;
- categories;
- recurring expense definition where included;
- receipt attachment;
- shop and date;
- import/export;
- ledger relationship;
- approval and audit.

## 13. Analytics and decision support

- today/period dashboard;
- order count and value;
- realized revenue;
- confirmation rate;
- delivery and return rates;
- COD outstanding;
- profit and margin;
- customer growth and lifetime value;
- product/SKU performance;
- return rate by product and wilaya;
- courier performance;
- source/channel performance;
- team queue and throughput metrics without surveillance;
- AI extraction accuracy and fallback rate;
- automation success/failure;
- sync/provider health;
- storefront funnel from visit to confirmed/delivered order;
- period-over-period comparison;
- drill-down to source records;
- CSV and other certified exports;
- charts that remain correct in RTL and low-resource mode.

## 14. Automations and operational rules

- trigger registry;
- condition builder with nested AND/OR;
- action registry;
- recipes/templates;
- draft, active, paused and degraded states;
- dry run;
- test against sample record;
- explicit scope and permission;
- rate limits;
- retry classes;
- idempotency/effect key;
- approval for configured high-risk actions;
- execution timeline;
- failure queue and operator recovery;
- version history;
- no silent skip;
- low-stock notifications and other migrated effects;
- AI can propose an automation, not silently activate it.

## 15. Commerce integrations

For Shopify, WooCommerce and YouCan:

- credential setup and validation;
- capability declaration;
- webhook/REST-hook ingress where certified;
- scheduled overlap reconciliation;
- order import;
- product/catalog sync according to certified direction;
- fulfillment/status write-back where certified;
- cancellation and edit handling;
- pagination;
- rate limits and retry;
- duplicate/replay protection;
- source version/conflict handling;
- sync runs, failures and retry queue;
- health dashboard;
- manual resync and reconciliation;
- disable/kill switch;
- exact live-certification evidence.

## 16. Google Sheets and import/export

- scoped Sheets credential setup;
- create/select sheet;
- export orders and approved reports;
- append/update only according to declared capability;
- mapping and preview;
- rate-limit and error handling;
- no secret exposure;
- CSV/XLSX import for customers, products, orders and expenses where safe;
- field mapping presets;
- validation preview;
- row-level errors;
- atomic or resumable commit;
- idempotency;
- migration report;
- rollback/compensation policy.

## 17. PWA/browser companion

- secure enrollment and pairing;
- member/device/session identity;
- role- and field-filtered projections;
- today dashboard;
- confirmation queue;
- order list/detail;
- AI draft review;
- customer history/risk;
- product/stock lookup;
- delivery/return visibility;
- inbox preview and approved reply/contact actions;
- team assignments and queues;
- limited analytics;
- command queue, pending, committed, rejected and conflict states;
- offline/stale/read-only behavior;
- encrypted partitioned cache;
- revocation purge;
- push notifications and quiet hours where certified;
- installability and Android mobile interaction patterns;
- no high-risk administration.

## 18. Hosted storefront

### Builder and release

- create storefront;
- choose shop and allocation;
- three distinct templates;
- controlled brand color, typography, media and content;
- product/variant selection;
- contact and policy content;
- private preview;
- validation;
- immutable publish;
- release history;
- rollback;
- default hostname and certified custom subdomain;
- domain/TLS status;
- content-addressed media.

### Customer experience

- mobile-first catalog;
- product detail and variants;
- persistent cart;
- COD checkout;
- server-authoritative price, stock allocation and delivery rules;
- wilaya/commune selection;
- phone validation;
- anti-bot and abuse controls;
- durable receipt before success;
- order receipt/status;
- secure tracking;
- WhatsApp confirmation/contact where appropriate;
- Arabic/French/English;
- accessibility and performance;
- SEO, Open Graph, structured data, sitemap and canonical/hreflang where applicable.

### Storefront analytics

- qualified visits;
- add-to-cart;
- checkout start;
- accepted receipt;
- desktop import;
- confirmed order;
- delivered order;
- profitable delivered outcome.

## 19. Backup, recovery, transfer and migration

- local verified snapshot primitive;
- all-shop backup set;
- zero-knowledge encrypted upload;
- versioned chunk and manifest;
- remote integrity verification;
- retention and pinned points;
- restore certification;
- independent recovery kit;
- optional assisted recovery shares;
- replacement-install restore;
- canonical installation transfer;
- emergency recovery;
- business ownership transfer;
- old installation revocation;
- migration preflight across every shop;
- backup-before-migration;
- resumable migration journal;
- compatibility report;
- maintenance UI;
- failed restore/migration leaves existing data unchanged.

## 20. Licensing, payment and entitlements

- signed online machine-bound seven-day trial;
- one trial per recognized machine;
- complete lockout after expiry with data preserved;
- payment request with versioned amount and reference;
- customer evidence upload;
- founder verification against actual receiving account;
- immutable approval;
- offline permanent signing;
- activation;
- shop expansion purchase;
- member/device/shop/storage entitlement enforcement;
- five-year support horizon in metadata;
- transfer and recovery;
- revocation epoch and key rotation;
- prolonged control-plane outage behavior;
- no automatic BaridiMob/CCP monitoring.

## 21. Diagnostics, support and founder administration

### Seller support

- contextual help;
- searchable help center and FAQ;
- onboarding guide;
- in-app bug report;
- consented redacted diagnostic bundle;
- provider/license/backup/sync health summary;
- support case status;
- AI-first guidance with founder escalation;
- known limitations.

### Founder admin

- payment requests and verification;
- permanent license signing workflow;
- extra-shop amendments;
- transfers and recovery;
- tenant/member/device control metadata;
- support queue;
- release channels and holds;
- provider certification state;
- incidents and kill switches;
- cost and quota monitoring;
- continuity reserve/economic review records;
- no seller operational plaintext access.

## 22. Marketing, download and public trust

The public site must include, at minimum:

- home;
- features;
- how it works;
- pricing;
- download/system requirements;
- security and privacy;
- support;
- changelog;
- about/founder story;
- contact;
- legal terms/privacy/refund;
- relevant educational content or blog when sustainable.

It must be FR/AR/EN, mobile-first, accessible, fast, evidence-honest and consistent with the product design system. Public claims, customer counts and performance statements may not be invented.

## 23. Release and operations

- internal, beta and stable channels;
- single generated version manifest;
- signed installer and updater;
- artifact hashes;
- update compatibility checks;
- staged rollout;
- hold, rollback-compatible repair and forward-fix;
- clean install, upgrade, migration, restore and replacement-install evidence;
- incident runbooks;
- SLOs for critical journeys;
- error budget and reliability freeze policy where useful;
- security/privacy review;
- SBOM/dependency review;
- controlled beta and launch report.

## 24. Universal operational state vocabulary

Every surface uses the same language. A generic “success” message is
insufficient when several authorities are involved.

| State | Meaning |
|---|---|
| Draft | Local work not yet committed as the intended business action |
| Pending | Accepted for review or execution, not complete |
| Queued | Durably stored for later execution |
| Processing | An executor is actively working |
| Committed | Canonical desktop transaction succeeded |
| Rejected | Validation, permission, policy or current state prevented commit |
| Conflict | Current state differs and needs explicit resolution |
| Retrying | A safe automatic retry is scheduled |
| Degraded | Capability remains partly usable with a known limitation |
| Offline | A required network is unavailable |
| Stale | A displayed projection may not reflect current desktop state |
| Blocked | Human action, approval, entitlement or recovery is required |
| Failed | The attempt ended without success; preservation/recovery is stated |
| Reconciled | External and canonical records were compared and resolved |
| Verified | Required integrity or evidence checks passed |
| Revoked | Identity, session, device, entitlement or key is no longer valid |

The order, delivery, inventory, COD/financial and return/refund state machines
are separate. For example, an order may be delivered while its COD remains
awaiting carrier remittance.

## 25. Required journey coverage

Every Required capability defines and tests:

- happy path;
- interrupted and resumed path;
- validation denial;
- permission denial;
- offline/provider/cloud degradation;
- duplicate/replay behavior;
- stale/conflict behavior;
- cancellation or compensation;
- recovery and support path;
- audit/history result.

The Stable journey inventory is:

1. acquire, install and explore the safe demo;
2. create identity/workspace and start the signed trial;
3. purchase, verify payment and activate permanently;
4. handle trial expiry without data loss or bypass;
5. complete first-shop onboarding;
6. use the daily owner command center;
7. receive/import a manual, WhatsApp, storefront or commerce order;
8. extract a WhatsApp message into a reviewed order;
9. confirm/reject an order and reserve/release stock;
10. prepare, fulfill and ship;
11. track delivery and exceptions;
12. return, exchange and refund;
13. reconcile COD receivables, fees and remittance;
14. manage catalog, reservations, movements and physical stock;
15. invite, authorize, assign and revoke team members;
16. request/complete configured high-risk approval;
17. create, dry-run, execute and recover an automation;
18. connect, test, degrade and disconnect a provider;
19. synchronize and reconcile commerce events;
20. build, preview, publish and roll back a storefront;
21. durably accept and later canonically import storefront checkout;
22. submit and observe a remote PWA command;
23. create, verify and restore backup;
24. replace a machine or transfer ownership;
25. update, migrate, fail safely and recover;
26. gather privacy-safe diagnostics and resolve an incident;
27. complete controlled beta and Stable promotion.

### Golden COD Journey

The first product-completion epic is the binding cross-module journey:

```text
Create/import product
→ receive/create customer order
→ validate customer and risk
→ confirm or reject
→ reserve stock
→ create and track shipment
→ delivered / failed / physically returned
→ create and reconcile COD receivable
→ refund/exchange when required
→ update inventory, customer, finance and analytics
→ preserve through restart, update, backup and restore
```

It is incomplete if any screen, route, provider callback or automation can
bypass the canonical transition, movement, audit or compensation rules.

## 26. Twelve required quality dimensions

Every page and major component is evaluated independently on:

1. **Motion** — tokenized, interruptible, reduced-motion-safe and optional on
   low-resource paths.
2. **Density/layout** — compact operational hierarchy, stable scroll behavior,
   1366×768 usability and 100–200% zoom.
3. **Typography** — coherent Latin/Arabic families, tabular numerals and
   locale-correct formatting without broken Arabic joining.
4. **Color/hierarchy** — semantic tokens, WCAG AA contrast and no
   color-only meaning.
5. **Empty states** — distinguish first use, no data, no results, successful
   empty queue, permission denial, offline/provider unavailability and archive.
6. **Error/degraded states** — explain failure, preservation, safe retry,
   recovery and support; never rely on a generic toast.
7. **Micro-interactions** — clear focus, pressed, selected, pending, committed,
   failed and undo behavior with keyboard parity.
8. **Perceived performance** — structure-matching skeletons, honest progress,
   bounded prefetch and immediate acknowledgement distinct from commit.
9. **Data UX** — search, filters, sort, saved views, bulk actions, selection,
   pagination/virtualization, export and record history where appropriate.
10. **Onboarding/disclosure** — progressive guidance, resumable setup and
    advanced controls without hiding essential truth.
11. **Trust** — visible shop, actor, source, time, sync, backup, permission,
    money and stock authority.
12. **Polish/fluency** — consistent copy, shortcuts, command palette,
    responsive details and no prototype placeholders.

## 27. Frontend and design-system rules

- Shared tokens and primitives precede page-local styling.
- Server data has one query/cache authority; UI preference state does not
  impersonate business authority.
- Forms use shared validation, dirty-state protection, draft/recovery rules and
  explicit destructive-action ceremonies.
- Tables and list/detail layouts use shared interaction contracts.
- Loading, empty, error, permission, offline, stale, pending and conflict
  states are designed, not patched later.
- Optimistic UI is allowed only when rollback and canonical authority are
  explicit.
- Animation uses transform/opacity on hot paths and never delays business work.
- Mobile/PWA layouts are redesigned for their context, not squeezed desktop
  pages.
- Localized copy is semantic, not concatenated fragments.
- RTL affects layout, navigation, icons, tables, charts, shortcuts and mixed
  content—not only `dir="rtl"`.
- Keyboard access, focus order, screen readers, zoom and reduced motion are
  release requirements.

## 28. Page-completion contract

A page is complete only when it has:

- correct information architecture and capability scope;
- real data authority and permission filtering;
- happy, loading, empty, filtered-empty, degraded, offline, stale, error,
  conflict and recovery states as applicable;
- safe create/edit/delete/bulk behavior;
- responsive and RTL/LTR behavior;
- keyboard, focus, screen-reader and zoom coverage;
- representative-data performance;
- audit/history and trust cues;
- copy in Arabic, French and English;
- automated evidence plus installed-Founder observation for material UI work.

A screenshot, route, component, mocked happy path or attractive shell does not
complete a page.

## 29. Experience anti-patterns

Do not ship:

- decorative dashboards without actionable operational truth;
- one generic status for order, delivery, stock and money;
- inaccessible icon-only actions;
- critical instructions only in transient toasts;
- hidden destructive behavior or irreversible actions without reason/audit;
- fake real-time behavior, fake provider support or fake success;
- untranslated or left-to-right-only fallback;
- large unvirtualized operational tables;
- “AI” copy or animation that masks weak workflow depth;
- silent fallback to another shop, cached projection or stale record;
- remote acknowledgement presented as canonical desktop commit.

## Consolidation provenance

The full pre-consolidation
[Experience and Frontend Constitution](../archive/experience/EXPERIENCE_FRONTEND_CONSTITUTION-2026-07-15.md)
and
[Journey and State Atlas](../archive/experience/JOURNEY_STATE_ATLAS-2026-07-15.md)
are retained as dated design evidence. This document adopts their durable
requirements and is the current authority when wording or scope differs.
