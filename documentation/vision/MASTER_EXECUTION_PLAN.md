# SahelFlow 1.0 — Unified Master Execution Plan

> **Status:** Active execution overlay  
> **Base roadmap:** `documentation/architecture/IMPLEMENTATION_ROADMAP.md`  
> **Purpose:** Preserve the full product and experience vision while respecting architectural dependency order.

## 1. Two-axis execution model

SahelFlow cannot be built from only an infrastructure roadmap or only a page-polish roadmap.

Every issue is located on two axes:

### Vertical dependency milestone

M0–M14 define what technical authority must exist before another capability can safely become real.

### Horizontal product track

- Product and journeys
- Experience/design system
- Desktop domain operations
- Teams and authorization
- Connected plane
- Providers
- PWA/browser
- Storefront
- Recovery
- Licensing/payment
- Support/founder admin
- Marketing/public trust
- Evidence/beta/release

A milestone is complete only when its relevant horizontal tracks are covered.

## 2. M0 — Restore authority, CI and complete traceability

M0 now includes:

- repair CI startup/execution;
- single version/evidence manifest;
- branch protection and templates;
- generated repository inventory;
- evidence-record schema;
- claim drift checks;
- this unified vision authority;
- complete capability/journey/page traceability;
- historical reconciliation;
- issue taxonomy that requires product and experience references.

### M0 exit additions

- every launch capability maps to a milestone;
- every historical durable requirement is preserved or explicitly dispositioned;
- no final founder decision conflicts with an active plan;
- no UI/UX work is hidden only under M13;
- first implementation issue set exists for M1/M2 and horizontal foundation work;
- future session handoff can be reconstructed from authority + current issue/evidence, not narrative memory.

## 3. M1 — Windows runtime plus experience shell

Engineering:

- canonical Windows bundle;
- runtime/process supervisor;
- dynamic local endpoint;
- integrity and startup diagnostics;
- low-end performance harness.

Experience track:

- application shell and navigation contract;
- current shop and health visibility;
- startup, missing-resource, occupied-port, crash and recovery states;
- token foundation;
- responsive desktop frame;
- low-resource visual policy;
- packaged typography and RTL smoke;
- support bundle entry point.

M1 does not redesign all business pages, but it establishes the shell they must share.

## 4. M2 — Shop authority plus data interaction foundation

Engineering:

- atomic registry;
- explicit `ShopContext`;
- query safety;
- all-shop migrations;
- snapshot primitive.

Product/experience:

- shop switcher and shop health;
- create/archive/recover shop journeys;
- maintenance and migration UI;
- DataTable foundation for bounded/paginated reads;
- shared loading/error/empty patterns for database-backed pages;
- import preview and compatibility-report pattern.

## 5. M3 — Keys, secrets and recovery experience

- protected root and scoped keys;
- secret-service migration;
- recovery kit;
- rotation/revocation;
- secret canary scanner.

Experience:

- recovery-kit ceremony;
- clear storage/loss language;
- provider credential field pattern;
- secret rotation/disconnection UX;
- recovery and compromised-key states;
- owner re-auth pattern.

## 6. M4 — Licensing, trial, payment and entitlement experience

- signed entitlement/trial;
- full lockout;
- manual payment verification;
- permanent signing;
- limits and five-year claims;
- transfer/recovery;
- legacy migration.

Surfaces:

- trial countdown and status;
- locked shell;
- purchase/payment request;
- evidence submission;
- verification status;
- activation receipt;
- shop expansion;
- license/support details;
- machine replacement.

## 7. M5 — Team and authorization product

- tenant/member/role/field/device/session schemas;
- owner migration;
- authentication;
- enrollment/revocation;
- policy engine;
- approvals;
- trusted actor audit.

Experience:

- team directory;
- invitations;
- role/field editor;
- shop access;
- device/session management;
- assignments/workgroups/queues;
- comments/mentions/handover;
- approval center;
- permission-denied and revocation states.

## 8. M6 — Durable business workflow foundation

- transaction + audit + event + outbox atomicity;
- inbox/outbox/effects;
- scheduler/retry/backpressure;
- compensation ledgers;
- reconciliation UI.

This milestone enables trustworthy depth for:

- orders;
- stock;
- returns/refunds;
- COD;
- automations;
- provider effects;
- notifications.

Experience:

- audit timeline;
- execution timeline;
- retry/dead-letter queue;
- operator recovery;
- explicit pending/committed/rejected states;
- money and stock compensation views.

## 9. M7 — Cloud control plane and founder administration foundation

- cloud environments/IaC;
- identity/license/device/session APIs;
- encrypted envelope;
- durable relay;
- quotas/outage modes;
- founder admin;
- threat model/DR.

Experience:

- founder payment/license/support console;
- tenant/device/session containment;
- release/provider kill switches;
- cost/quota health;
- desktop connected/degraded/offline status;
- command/projection diagnostics.

## 10. M8 — Backup and disaster-recovery product

- zero-knowledge formats;
- resumable transfer;
- retention;
- replacement-install recovery;
- restore certification.

Experience:

- backup enrollment and health;
- recovery-kit confirmation;
- backup history;
- pinned points;
- storage limits;
- restore wizard;
- isolated verification progress;
- atomic cutover;
- support-assisted recovery.

## 11. M9 — Provider framework and integration UX

- common provider contract;
- scoped worker credentials;
- inbox/outbox adapters;
- certification harness;
- health and kill switches.

Experience:

- provider catalog;
- certified/experimental capability labels;
- connection wizard;
- scope and environment test;
- health/history;
- retry/reconcile;
- limitation and policy notices.

A pilot provider must pass before broad adapter migration.

## 12. M10 — Operational PWA/browser product

- enrollment;
- encrypted role-filtered projections;
- partitioned cache;
- operational views;
- low/high-risk commands;
- accessibility/RTL/mobile performance.

Product scope:

- today dashboard;
- confirmation queue;
- orders;
- AI draft review;
- customer risk/history;
- product/stock lookup;
- delivery/returns;
- inbox preview;
- team work;
- limited analytics;
- command status;
- notifications.

## 13. M11 — Hosted storefront product

- tenancy/allocation/media;
- immutable releases;
- three templates;
- durable checkout;
- relay/reconciliation;
- domain/TLS;
- rollback.

Experience:

- builder, preview and validation;
- template-specific design;
- mobile catalog, variants and cart;
- COD checkout;
- tracking;
- receipt/import state;
- analytics funnel;
- SEO/accessibility/RTL/performance.

## 14. M12 — Provider migration and live certification

- WhatsApp lifecycle;
- Shopify/Woo/YouCan;
- Yalidine/ZR/Maystro;
- Procolis decision;
- Sheets;
- Gemini/Darija.

Product-depth work includes:

- WhatsApp search/media/templates and workflow controls according to certified policy;
- AI tool cards, persistent confirmation and error recovery;
- sync health and reconciliation;
- courier timeline and bulk actions;
- extraction metrics and review queue;
- exact provider limitation UI.

## 15. M13 — Domain and experience convergence

M13 is **not** the first UI milestone. It is the point where existing and newly built domain surfaces fully converge on the safe authorities.

Required domain completion:

- products/variants/inventory;
- customers/risk;
- orders/confirmation;
- deliveries;
- returns/exchanges/refunds;
- COD/accounting/expenses;
- analytics;
- automations;
- imports/exports;
- settings;
- inbox and AI operator flows.

Required experience convergence:

- every launch page passes the page completion contract;
- saved views, column controls, virtualization and contextual record navigation where needed;
- consistent empty/loading/error/degraded states;
- complete audit/history visibility;
- AR/FR/EN copy;
- WCAG and keyboard coverage;
- low-end optimization;
- documentation/help;
- final threat-model and privacy closure.

## 16. M14 — Beta, public trust and Stable launch

- internal dogfood;
- controlled seller beta;
- incident exercises;
- recovery/replacement drills;
- stable candidate;
- staged updater;
- post-release review.

Parallel launch surfaces:

- marketing/download/security/support/legal site;
- help center and onboarding guide;
- founder support operations;
- public known limitations;
- evidence-linked claims;
- beta recruitment and support material.

Marketing may be prototyped earlier but cannot publish unsupported claims or distribute an unapproved candidate.

## 17. Page-complete delivery slices

After a page’s architectural prerequisites exist, page work should use small slices:

1. read model and permission contract;
2. shared primitives/patterns;
3. happy path;
4. write transaction and audit/outbox;
5. failure/recovery states;
6. bulk/search/filter/data UX;
7. responsive/RTL/a11y;
8. packaged/low-end evidence;
9. documentation and traceability.

“Redesign the whole page” is not an acceptable issue.

## 18. Priority sequence after M0

Start:

1. M0 CI and authority.
2. M1 runtime shell and performance harness.
3. M2 shop/database authority.
4. M3 keys/recovery and M5 identity in allowed parallel.
5. M4 licensing after M3.
6. M6 durability after M2/M5.
7. M7 cloud and M8/M9.
8. M10/M11/M12.
9. M13 convergence.
10. M14 beta/Stable.

Within each milestone, the product and experience slices in this plan are mandatory—not optional polish.

## 19. No-loss issue template additions

Every issue must name:

- vision capability ID/section;
- user journey;
- surface;
- role;
- required states;
- experience dimensions affected;
- founder decision;
- architecture milestone/ADR/invariant;
- evidence;
- historical source if recovering old value;
- superseded assumptions explicitly excluded.

## 20. Progress measurement

Track:

- capabilities implemented and evidenced;
- journeys with full state coverage;
- pages meeting completion contract;
- invariants proven;
- provider certifications;
- packaged/low-end evidence;
- beta outcomes;
- unresolved contradictions.

Do not use session number, raw test count or subjective completion percentage as the main progress measure.
