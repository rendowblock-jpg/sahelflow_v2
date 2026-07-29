# SahelFlow — Research and adopted findings

> **Status:** Research reference and adopted-evidence index; not product, current-state or roadmap authority
> **Last consolidated:** 2026-07-29
> **Governing decision:** FD-028 — Final Completion Program and Research-First Quality Protocol

Research is mandatory before every major phase and material implementation.
Research informs the owning product, experience, architecture, roadmap or
workflow decision. It does not create scope, certify a provider, prove current
implementation or become a second roadmap.

## Research-first quality rule

No material implementation starts from generic AI-generated recommendations,
remembered patterns, visual trends or unsourced claims alone.

Before implementation, inspect the exact SahelFlow source, tests, migrations,
production paths and current evidence, then research the current professional
standard for the named decision.

The result must be a SahelFlow-specific adopted decision with measurable
acceptance criteria, not a collection of links or a fashionable redesign.

## Source hierarchy

Prefer evidence in this order:

1. Applicable standards bodies, legal authorities and primary specifications.
2. Official framework, platform, operating-system and provider documentation.
3. Primary security advisories, research papers and protocol documents.
4. High-quality production engineering reports with measurable evidence.
5. Mature open-source implementations whose real code and failure behavior can
   be inspected.
6. Direct teardown of relevant best-in-class operational products.
7. Representative Algerian COD seller observation and Founder product judgment.
8. Secondary articles and opinion only as supporting context.

Do not treat these as authority:

- unsourced AI answers;
- generic “best SaaS design” lists;
- Dribbble-only concepts;
- screenshots without operational states;
- marketing claims without implementation evidence;
- outdated tutorials;
- architecture diagrams without production code;
- competitor features that conflict with SahelFlow’s product contract;
- mocks, adapter presence or test counts presented as provider readiness.

## Required research package

Every phase or material work package records the smallest durable package that
answers the decision.

### 1. Exact research question

State one decision, for example:

- How should SQLite stock reservations remain correct under concurrent order
  confirmation?
- How should a 1366×768 confirmation queue balance density, keyboard speed and
  error prevention?
- How should mixed Arabic, French, phone, SKU, date and DZD content behave in
  RTL tables and charts?
- What durable effect protocol prevents duplicate or lost courier and WhatsApp
  actions?

### 2. Current SahelFlow baseline

Record:

- exact source and production path;
- existing behavior and tests;
- data and migration constraints;
- behavior to preserve;
- known failure modes;
- security, privacy, accessibility, RTL and performance implications;
- evidence currently available and evidence still missing.

### 3. External evidence

For every load-bearing source record:

- source title and authority;
- publication or revision date;
- platform/provider/version and jurisdiction where relevant;
- finding;
- applicability to SahelFlow;
- limitation, conflict or uncertainty.

Time-sensitive facts must be revalidated when implementation or certification
begins.

### 4. Benchmark set

Study a representative set of real systems. Evaluate why they work rather than
copying visual style.

Inspect as applicable:

- information architecture and navigation;
- task and state depth;
- data density;
- forms and destructive ceremonies;
- search, filters, saved views and bulk work;
- keyboard and accessibility behavior;
- responsive redesign;
- performance and resource use;
- failure, offline, stale, conflict and recovery behavior;
- trust cues for actor, shop, money, stock, provider and commit authority.

### 5. Decision matrix

Compare meaningful options across:

- correctness and product fit;
- migration and compatibility;
- performance and resource cost;
- security and privacy;
- Arabic/RTL and accessibility;
- implementation complexity;
- operational recovery;
- long-term maintainability;
- one-time-price continuity economics.

### 6. Adopted standard

Record:

- chosen approach and rationale;
- rejected alternatives;
- existing behavior retained;
- legacy behavior removed;
- measurable acceptance criteria;
- automated, installed, external and Founder evidence required.

### 7. Revalidation trigger

Research expires or must be revalidated when:

- a major dependency or platform version changes;
- a provider contract or API changes;
- applicable law or standard changes;
- implementation begins materially later;
- evidence contradicts the adopted decision;
- Beta or certification begins.

## Research-to-implementation gate

Implementation may begin only when:

- the exact current code and data path have been inspected;
- current primary sources and standards have been reviewed;
- alternatives have been compared;
- a SahelFlow-specific decision has been adopted;
- acceptance criteria and required evidence are measurable;
- no higher Founder/product/experience/architecture authority is contradicted.

Research must not become delay. Once enough evidence exists to make the decision,
implementation begins and the result is tested against the adopted standard.

## Phase research index

### Phase 0 — Authority and execution

Research focus:

- documentation authority models;
- traceable engineering decisions;
- risk-based CI and release evidence;
- high-throughput work packaging without weakening review.

Adopted direction:

- one existing owner per kind of truth;
- no additional permanent masterplan document;
- one live execution epic;
- outcome packages rather than micro-task ceremony.

### Phase 1 — Canonical Golden COD business core

Research focus:

- independent commerce lifecycle states;
- SQLite optimistic concurrency;
- stock reservations and append-only movements;
- idempotent commands and exact replay;
- transactional outbox;
- financial ledgers and compensation;
- Algerian COD remittance and reconciliation;
- return, exchange and refund accounting;
- durable provider-event ingestion and checkpoint safety.

Blocking research questions:

- atomic availability and reservation enforcement;
- migration from mutable stock and Boolean COD fields;
- exact Golden COD state and compensation matrix;
- source-intake idempotency and durable checkpoint semantics.

### Phase 2 — Identity, authorization, licensing and multi-shop

Research focus:

- local-first identity and device trust;
- action- and field-level authorization;
- secure local unlock;
- machine-bound signed licensing;
- offline permanent entitlements;
- trial abuse resistance;
- transfer and recovery ceremonies;
- Windows-protected secret storage;
- high-risk and two-person approval.

### Phase 3 — Providers, inbox, AI and automations

Research focus:

- official provider contracts and rate limits;
- hybrid webhook/polling reconciliation;
- durable inbox/outbox, receipts and dead letter;
- WhatsApp session and policy risk;
- prompt-injection resistance;
- AI data minimization and typed tools;
- exact proposal-bound human approval;
- durable automation execution and partial-failure semantics.

### Phase 4 — Data protection, recovery, migrations and security

Research focus:

- current cryptographic recommendations;
- Windows DPAPI/Credential/secure-storage choices;
- purpose-separated key hierarchy;
- zero-knowledge backup;
- SQLite online backup and integrity verification;
- crash-safe file replacement;
- migration journaling and interruption recovery;
- threat modeling;
- Law 18-07 data classes, retention and rights;
- secure diagnostics and independent review preparation.

### Phase 5 — Whole-product AAA UI/UX and frontend redesign

Research focus:

- operational-product information architecture;
- high-density back-office interfaces;
- seller command centers and confirmation queues;
- inventory and financial data UX;
- search, filtering, saved views, bulk work and timelines;
- keyboard-first operation;
- form validation and destructive ceremonies;
- perceived performance and honest progress;
- page-specific empty, degraded, offline, stale, conflict and recovery states;
- mobile/PWA redesign rather than compressed desktop;
- Arabic typography and mixed-script content;
- RTL navigation, tables, charts and icons;
- WCAG 2.2 AA, zoom and reduced motion;
- low-end WebView performance.

#### No-AI-slop frontend rule

Reject:

- generic gradient dashboards;
- excessive decorative cards and glass effects;
- arbitrary floating elements;
- oversized whitespace that destroys operational density;
- page-local components that duplicate shared behavior;
- fake charts or decorative metrics;
- motion that delays work;
- icon-only critical actions;
- desktop layouts merely squeezed onto mobile;
- RTL implemented only with `dir="rtl"`;
- placeholder or machine-sounding copy;
- aesthetic changes that ignore real data and failure states.

Every design decision must answer:

- Which seller task becomes clearer, faster or safer?
- Which error becomes harder to make?
- Which recovery becomes easier?
- How does it work with representative data?
- How does it work in Arabic and mixed script?
- How does it work at 1366×768 and 200% zoom?
- How does it work with keyboard and screen reader?
- What is its rendering and memory cost?

### Phase 6 — Arabic, RTL and accessibility

Research focus:

- WCAG 2.2 and WAI-ARIA authoring patterns;
- Arabic typography and joining;
- Unicode bidirectional behavior;
- mixed-script technical values;
- locale-sensitive DZD, dates and numbers;
- RTL tables, charts, navigation and focus order;
- screen-reader behavior with Arabic;
- accessible asynchronous state communication.

Native Arabic review is required. Automated translation and visual inspection are
not sufficient proof.

### Phase 7 — Performance and reliability

Research focus:

- Tauri/WebView startup;
- Next.js standalone and Node compile-cache behavior;
- SQLite query planning and data-scale profiles;
- pagination and virtualization;
- memory and handle profiling;
- background-worker resource control;
- HDD and 4 GB Windows behavior;
- real-user performance measurement and eight-hour soak testing.

### Phase 8 — Connected platform

Research focus:

- current Cloudflare contracts, limits and economics;
- tenant isolation;
- durable checkout receipt architecture;
- encrypted command relay and projections;
- offline-first PWA and revocation purge;
- custom-hostname and TLS lifecycle;
- zero-knowledge cloud backup;
- abuse protection, cost alarms and incident isolation.

### Phase 9 — Certification, beta and Stable

Research focus:

- representative beta design;
- incident and restore drills;
- independent security/privacy review preparation;
- accessibility audit methodology;
- provider certification evidence;
- release rollout, hold and forward-fix;
- support readiness and evidence-backed public claims.

## Adopted durable findings

The following remain adopted unless a newer decision changes them:

- COD profitability depends on confirmation quality, delivery success, returns,
  courier fees, remittance delay and stock accuracy—not gross order count alone.
- Order, confirmation, fulfillment, delivery, inventory, COD and return/refund
  state are independent.
- Reservation differs from physical movement.
- Money and stock corrections require append-only compensation.
- Provider events require authentication, durable persistence, deduplication,
  idempotency, retry and reconciliation.
- Checkpoints may not advance past uncommitted or untracked failure.
- Immediate acknowledgement is distinct from canonical commit.
- Premium operational UX means clear authority, complete states, fast common work,
  discoverable advanced paths and human recovery—not decoration.
- Arabic/French mixed content and low-end Windows constraints are product-level
  requirements.
- Adapter code, mocks and test counts do not prove provider/public readiness.

## GitHub recording rule

Use the smallest durable form:

- governing issue section for a phase decision;
- ADR or architecture section only for a durable technical invariant;
- `EXPERIENCE.md` for adopted UI/capability standards;
- this file for adopted research findings and source index;
- archived detailed report only when future reuse justifies it.

Do not create another roadmap, status report, prompt collection or gap document
under research.
