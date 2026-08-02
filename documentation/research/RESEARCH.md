# SahelFlow — Research and adopted findings

> **Status:** Research reference and adopted-evidence index; not product, current-state or roadmap authority
> **Last consolidated:** 2026-08-01
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

#### Research question

What is the smallest durable authority and delivery model that prevents planning
and evidence drift in a two-agent SahelFlow repository while preserving fast,
independently reviewed and exact-source delivery?

#### Current SahelFlow baseline

Before FD-028, the repository already had ten active documentation authorities,
protected `main`, risk-selected CI, exact-source release evidence, two coding
agents, issue #164 and an authority audit. The remaining failure was semantic:
Session 1–4 instructions, stale release language and duplicated execution wording
could remain active after their underlying milestone had changed.

The reset therefore needed to preserve the useful authority, branch protection,
review, release and evidence machinery while removing the time-boxed session map
and preventing a second masterplan from competing with existing owners.

#### External evidence reviewed

Reviewed on 2026-07-29 unless another date is stated:

1. **NIST SP 800-218, Secure Software Development Framework v1.1** — final
   publication dated 2022-02-03. It organizes secure development around defined
   practices, tasks and implementation examples that can be integrated into an
   existing lifecycle rather than imposing one universal process. SahelFlow
   adopts the principle of explicit practices, responsibilities and verifiable
   outcomes. NIST SP 800-218 Revision 1 v1.2 was an initial public draft dated
   2025-12-17 at review time, so the final v1.1 remains the stable normative
   baseline until a final revision is published.
   Source: `https://csrc.nist.gov/pubs/sp/800/218/final` and draft status at
   `https://csrc.nist.gov/pubs/sp/800/218/r1/ipd`.
2. **GitHub protected-branch and required-status-check documentation** — current
   official documentation reviewed 2026-07-29. GitHub supports required approving
   reviews, resolved conversations, required status checks, no-bypass enforcement
   and validation against the latest pull-request head SHA. SahelFlow adopts the
   exact-head, selected-gate and non-author review model rather than treating an
   earlier green commit as merge authority.
   Sources:
   `https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches`
   and
   `https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks`.
3. **Google Engineering Practices — Code Review** — current published guidance
   reviewed 2026-07-29. The guidance emphasizes review by another engineer,
   design, functionality, complexity, tests, documentation, code health and small
   understandable changes. SahelFlow adopts independent review and coherent
   outcome packages, while avoiding micro-change ceremony that would fragment a
   seller journey.
   Sources: `https://google.github.io/eng-practices/review/` and
   `https://google.github.io/eng-practices/review/reviewer/standard.html`.
4. **Google SRE Book — Release Engineering** — current online edition reviewed
   2026-07-29. It emphasizes repeatable, automated and hermetic releases, exact
   source revisions, policy enforcement, review and auditable release history.
   SahelFlow applies these principles through protected exact-source Internal
   artifacts and evidence, not through a larger-company release bureaucracy.
   Source: `https://sre.google/sre-book/release-engineering/`.
5. **IETF RFC 2119 and RFC 8174 normative-language convention** — reviewed
   2026-07-29. They distinguish requirement words such as MUST, SHOULD and MAY
   when used normatively. SahelFlow adopts explicit blocking and optional language
   in Founder, roadmap, workflow and audit contracts so lower documents cannot
   silently reinterpret a requirement.
   Source: `https://www.rfc-editor.org/info/rfc2119/`.

These sources support governance, review, release and requirement-language
practices. They do not define SahelFlow product scope, COD behavior, pricing or
Founder authority; those remain owned by the active product documents and
Founder decisions.

#### Alternatives evaluated

1. **Create the masterplan and research protocol as two new permanent documents.**
   Rejected because it would exceed the ten-document authority set and recreate
   duplicate roadmap/workflow ownership.
2. **Put the complete program only in issue #164.** Rejected because an issue is
   suitable for live tracking but can be edited chronologically and would compete
   with Product, Experience, Architecture, Roadmap and Workflow authority.
3. **Keep the four-session overlay and add more completion detail beneath it.**
   Rejected because elapsed sessions are not evidence gates and the old map had
   already become stale while major Required capabilities remained incomplete.
4. **Distribute the final program into existing owners, retain issue #164 as the
   live dashboard and update `sf-audit` to enforce the new continuity contract.**
   Adopted because it preserves one owner per truth type, exact-head review and a
   compact execution frontier without adding authority.

#### Adopted Phase 0 standard

- FD-028 is the explicit Founder change-control decision.
- `ROADMAP.md` solely owns Phase 0–9 dependency and exit order.
- `WORKFLOW.md` solely owns research, implementation, review, CI and evidence.
- `WORKING_MEMORY.md` contains current truth and one exact next outcome.
- Issue #164 is a live dashboard, never an eleventh authority.
- Existing Product, Experience and Architecture requirements remain unchanged
  unless an explicit Founder or owning-authority decision changes them.
- The authority audit requires FD-028/current-release markers and rejects obsolete
  active Session 1–4 execution or next-action language.
- Material work is reviewed against the latest exact PR head by a non-authoring
  reviewer and the selected required checks.

#### Phase 0 acceptance and evidence

Phase 0 completed through PR #179 at protected-main merge
`18c45e474f58744b6f837372509154ca500044b0`. Exact-head CI run `30430538958`
passed. The accepted evidence is:

- exactly ten active documentation Markdown files remain;
- FD-028 states exact supersession and preserved clauses;
- all entry points reference the same Phase 0–9 program and Internal.13 boundary;
- issue #164 is the Phase 0–9 execution dashboard and is explicitly
  non-authoritative;
- no active current-owned document contains an obsolete Session 1–4 execution or
  next-action instruction;
- `sf-version`, `sf-audit` and every risk-selected latest-head CI gate passed;
- the reviewed head was current with protected `main` before merge;
- independent latest-head review had no unresolved P0/P1 finding;
- the exact first Phase 1 production outcome can be reconstructed without chat;
- no application, schema, updater or release behavior was changed by the reset.

#### Phase 0 revalidation trigger

Revalidate this authority model when:

- GitHub branch-protection, required-check or review behavior changes materially;
- the set or ownership of active documentation authorities changes;
- another coding agent, release system or execution tracker becomes active;
- audit evidence shows contradictory instructions can pass;
- a new Founder decision changes FD-028;
- the Stable governance and claims audit begins.

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

#### Teams operational authorization repair — adopted 2026-08-01

**Exact question.** How must central order mutations and idempotent command replay
behave after SahelFlow introduces multiple durable people and custom field/action
allowlists?

**Current source.** PR #195 represented every durable person inside the legacy
`authenticated-owner` business-principal kind. Its default replay rule accepted
any stored actor with that prefix. Central order create/update also allowed a
mutation to commit before read/projection denial, and compatibility update could
write and return contact or financial fields without explicit field-write
authority. Static source-string tests did not exercise those failures.

**Primary evidence reviewed.** OWASP's current Authorization Cheat Sheet requires
least privilege, deny by default, permission validation on every request, safe
failure and unit/integration authorization tests. OWASP's Business Logic Security
guidance requires server-side re-derivation of permissions and prices and treats
every request field as untrusted. NIST SP 800-162 defines access decisions from
subject, object, operation and environment attributes rather than role name
alone. Sources reviewed 2026-08-01:

- `https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html`;
- `https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html`;
- `https://csrc.nist.gov/pubs/sp/800/162/upd2/final`.

**Alternatives.** Keeping the broad owner-prefix replay rule was rejected because
role compatibility is not person identity. Requiring exact session equality was
rejected because safe session rotation would break retry recovery. Returning raw
mutation rows and relying on UI masking was rejected by Architecture INV-027.
Blind field writes under read-only field actions were rejected because they make
custom permission intent ambiguous and unsafe.

**Adopted decision.** Default replay for a durable person is limited to that exact
person across session rotation; cross-person or legacy-to-person replay requires
an explicit command authorizer. Order create/update must prove read authority
before mutation. Compatibility updates require distinct contact/financial write
actions plus their corresponding read actions before touching those fields, and
their responses use the same permission-filtered projection as reads. Custom
allowlists inherit no new actions. Tests execute denial before persistence and
verify redacted responses; source-string presence is not completion evidence.

The same standard applies across operational HTTP boundaries. Conversation read,
workflow update, reply and WhatsApp connection management are separate actions.
Conversation/message access does not imply contact-name, phone or provider-JID
access. A GET cannot create a live-JID conversation or clear unread state; mark
read is an explicit update. Order lifecycle mutations require `orders.update`,
order search additionally requires contact read, money operations require both
financial read and write, and recovery additionally requires approval authority.
Courier and customer-return projections redact monetary fields when financial
read is absent. Order intake writes contact and price-bearing state, so it
requires both protected field domains; the standard operator preset therefore
does not grant `orders.create`, while manager and owner presets do.

Role ceilings remain deliberately bounded: viewers receive permitted read-only
projections; operators may update/reply/claim assigned operational work without
financial or provider-connection administration; managers add broad workflow,
financial, assignment and WhatsApp connection authority without owner-only
destructive, approval or licence authority; owners retain the fixed recovery
ceiling. UI controls consume the server-resolved action set and do not invent a
parallel role matrix.

**Acceptance and revalidation.** Same-person replay succeeds after session
rotation; cross-person replay is denied before result decryption; denied create
or update leaves no mutation; protected field writes require exact actions;
responses redact ungranted fields; AR/FR/EN permission labels are complete; the
full exact-head checkpoint passes. Operational route inventory is supporting
coverage only and is paired with executable deny-before-write/read-purity and
projection tests. Revalidate when principal encoding, permission vocabulary,
remote commands, projection transport, provider connection control or
multi-owner recovery changes.

#### Teams collaboration authority closure — adopted 2026-08-01

**Exact decision.** Shared collaboration state is a server-authorized operational
aggregate, not inbox UI metadata. Workgroups, queues, comments, mentions and
handover transitions use exact shop and durable-person authority, command replay,
optimistic versions and append-only audit/event history. Customer/provider
messages remain separate from encrypted internal comments. A state-only
open/closed transition is itself a durable handover and cannot be discarded.

The seller surface reuses server-projected permissions and exact active-member
mention options. It distinguishes ordinary 403 action denial from stale or
revoked identity that requires reauthentication, preserves one idempotency key
across safe network retry, refreshes on version conflict, and exposes complete
AR/FR/EN loading, empty, permission, stale, offline and recovery states.

**Evidence and revalidation.** Implementation head
`a5f5b47626da9d6ec3d31d2a5332c09fcb9b4d5d`, normal CI `30714461757`
and complete checkpoint `30714461656` passed. The separated review covered
cross-person replay, cross-shop and revoked targets, permission-before-parsing,
protected-field leakage/oracles, high-risk ceremonies, state-only transitions,
concurrency, recovery and localized failure states; no P0/P1 remained. Revalidate
when entity types, assignment states, member lifecycle, action ceilings,
projection fields or remote collaboration commands change.

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
