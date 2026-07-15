# SahelFlow 1.0 — Functional Capability Atlas

> **Status:** Active launch-capability map  
> **Purpose:** Preserve every approved or durable planned function and map it to the complete product structure.

A capability may be reused, hardened, migrated, replaced or newly implemented. Its presence in this atlas does not claim the current code is ready.

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
