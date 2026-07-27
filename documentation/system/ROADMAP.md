# SahelFlow — Completion Roadmap

> **Status:** Active dependency order
> **Current protected-main executable source:** Internal.10 at
> `ab3c1fb46bbe028745321d7469ae0924e9f236bd`
> **Latest Founder-accepted baseline:** Internal.5
> **Current phase:** Phase 1 — workspace/shop and business-integrity foundation
> **Immediate gate:** correct Internal.10's measured multi-minute Founder launch
> without reinstalling it, then prove the next version through the recovered
> in-app updater
> **Founder maximum AAA-candidate target:** 2026-08-27
> **Last consolidated:** 2026-07-27

This is the shortest safe path from the current application to the complete
SahelFlow 1.0 product. It controls dependency order under FD-026's maximum
2026-08-27 AAA-candidate target. Work is complete only when its named outcome
and evidence pass; the date does not weaken a gate or create a readiness claim.

## Sequencing rules

1. Finish one authority layer before building dependent behavior on it.
2. Preserve useful seller functionality and Founder data while replacing unsafe
   authority underneath.
3. Complete vertical seller journeys rather than accumulating pages.
4. Give one task/branch to one agent; parallelize only independent areas.
5. Include UX, Arabic/RTL, accessibility, performance, security, migration,
   diagnostics and recovery in each work package.
6. Treat adapter presence as knowledge, not provider certification.
7. Keep connected systems optional to valid permanent local desktop operation.
8. Produce one unique signed Founder Internal update for every merged work
   package that changes the installed app.
9. Do not stack related product work over an unaccepted Founder update.
10. Remove obsolete code only after compatible migration, parity and recovery
    evidence.
11. Complete coherent vertical outcomes across all affected layers and use the
    path/risk-aware fast loop in `WORKFLOW.md`; do not repeat full release lanes
    for draft iterations or documentation-only work.

## Critical path

```text
0. Documentation and truth reset
        ↓
1. Workspace/shop and business-integrity foundation
        ↓
2. Golden COD Journey
        ↓
3. Complete local product + AAA experience
        ↓
4. Identity, teams, licensing and Founder operations
        ↓
5. Certified providers and durable external effects
        ↓
6. Shared cloud, PWA, storefront and zero-knowledge backup
        ↓
7. Representative beta, hardening and Stable
```

Research, design exploration and cost modeling may run early. Production
authority and public claims may not bypass the graph.

## Continuous quality tracks

Every phase carries:

- product/scope/claim accuracy;
- complete happy/degraded/failure/recovery journeys;
- Arabic/French/English and RTL/LTR parity;
- keyboard, focus, screen-reader, zoom and reduced-motion behavior;
- T470 and 4 GB/HDD performance measurement;
- data migration, backup and recovery;
- threat modeling, privacy classification and Law 18-07 review;
- diagnostics and support UX;
- exact source/artifact/environment evidence;
- deletion of superseded paths only after proof.

## Phase 0 — Documentation and truth reset

**Status:** Complete in PR #154 at
`5e0527289d7cc3ff06a0e6d4307f6fb125f358ae`.

### Outcome

Every agent can determine the final product, current implementation, complete
gap, dependency order, workflow and exact next move from ten active documents
without reading contradictory plans or relying on chat history.

### Work

- consolidate product, experience, decisions, architecture, current state,
  roadmap, workflow, working memory and research;
- preserve full valuable research under a clearly non-authoritative archive;
- remove duplicate readmes, atlases, specifications, gap reports, prompts,
  waves, legacy chronology and obsolete GLM/Codex Cloud instructions;
- install the Web Agent/Desktop Agent GitHub workflow;
- record the three-stage source → signed release → Founder acceptance model;
- update `AGENTS.md`, repository README, changelog and authority audit;
- validate required files, links, stale references and active document count;
- bind current state to accepted Internal.5.

### Exit gate

- exactly ten active documentation Markdown files;
- no active GLM, Codex Cloud, MAWS or `agent-handoff` workflow;
- no active link to removed authority;
- `sf-audit` passes locally and in clean CI;
- `CURRENT_STATE.md` identifies protected source, signed candidate and
  Founder-installed baseline separately;
- `WORKING_MEMORY.md` names the first implementation outcome;
- another agent can resume without chat history.

Documentation-only completion does not create an MSI.

## Phase 1 — Workspace/shop and business-integrity foundation

Before Phase 1A changes the installed application, the current installed
acceptance loop must close. Internal.10 merged as PR #161 at
`ab3c1fb46bbe028745321d7469ae0924e9f236bd`; exact-head run `30200603507`
and signed run `30201584875` passed the selected source, Windows, installed MSI,
signature, runtime and visible-UI gates. The Founder installation upgraded in
place to `1.0.0.10` with exact AppData identities preserved, and no update
prompt is expected while it is already the current release.

The real Founder dashboard eventually opened, but launch took multiple minutes.
Internal.10 is therefore not accepted. The immediate work is to measure one
cold and one warm launch from retained startup evidence, identify the dominant
stage, and correct it without reinstalling Internal.10, weakening authenticated
readiness, loading a fallback workspace or deleting data. The resulting single
app-changing package must ship once through the recovered in-app updater and
prove dashboard-first visibility, bottom containment, target launch timing,
AppData preservation, normal close and reopen. The workflow-speed redesign is
already integrated; Phase 1A then resumes through the fast vertical-outcome
loop rather than another release-process project.

### Outcome

The existing local product operates through trusted workspace/shop context and
one transactional truth for order, delivery, inventory, COD money,
return/refund, audit and external effects.

### 1A — Workspace and shop authority

- introduce durable workspace identity compatible with the existing local
  installation;
- bind every shop to one workspace;
- replace process-global/fallback shop selection with explicit trusted context;
- separate current UI preference from background job/provider authority;
- switch shops without app relaunch or cross-shop cache leakage;
- introduce persistent shop-incarnation identity;
- migrate existing Founder registry/databases safely;
- make all-shop discovery, preflight, backup and migrations journaled and
  resumable.

### 1B — Business state and movement contracts

- define separate state machines for order/confirmation, delivery, inventory,
  COD/financial and return/refund;
- create stock reservation and inventory movement records;
- create COD receivable, remittance, fee, refund and correction movements;
- bind trusted audit, domain event and required outbox intent to the mutation
  transaction;
- persist raw provider/inbound events before acknowledgement;
- enforce idempotency and checkpoint rules;
- add explicit compensation rather than heuristic reversal;
- migrate current order/return/refund/delivery behavior behind the new
  contracts.

### Exit gate

- no shop operation can silently use another database;
- active-shop switching works without relaunch and preserves all open work
  safely;
- replay/concurrency cannot duplicate stock, money, delivery or audit effects;
- cancellation, failure, physical return, remittance and refund have explicit
  movements;
- current Founder data migrates and rolls forward safely;
- required automated, migration and installed Internal-update evidence passes.

### Internal delivery

Phase 1 is split into coherent app-changing work packages small enough to
install and observe. Each receives a unique Internal version. No package
changes only a schema without a compatible application path and recovery
evidence.

## Phase 2 — Golden COD Journey

### Outcome

One seller can complete the full daily COD loop through real UI and data with
correct inventory, delivery, money, history and recovery.

### Journey

```text
Catalog/import
→ customer/order intake
→ validation/risk
→ confirmation
→ stock reservation
→ shipment
→ delivery/failed/return
→ COD receivable/remittance
→ refund/exchange
→ inventory/finance/customer/analytics
→ restart/update/backup/restore preservation
```

### Work

- unify manual, WhatsApp, storefront-staged and commerce-staged intake behind
  one command contract;
- complete customer matching/duplicate and address/phone validation;
- make risk results explainable and non-bypassing;
- complete confirmation queue, rejection and stock reservation behavior;
- complete shipment creation, provider mapping and exception states;
- distinguish delivered from remitted;
- complete physical return inspection, restock/quarantine/damage and refund;
- reconcile carrier statements, fees and discrepancies;
- make dashboards and record timelines derive from governed truth;
- complete all loading, empty, permission, offline, stale, conflict, failure
  and recovery states for the journey;
- prove restart, signed update and backup/restore preservation.

### Exit gate

- the journey passes through UI, API/domain, database and installed Windows;
- no direct route, provider callback or automation bypasses canonical rules;
- money/stock invariants hold under duplicate, interruption and retry;
- Arabic/French/English, RTL/LTR, keyboard and accessibility evidence passes;
- T470 and floor-device budgets are measured and blocking regressions fixed;
- Founder installs and accepts the resulting Internal update.

## Phase 3 — Complete local product and AAA experience

### Outcome

Every required local capability reaches the same depth and quality as the
Golden COD Journey.

### Workstreams

- onboarding, safe demo and guided first operation;
- catalog, variants, imports, exports and inventory operations;
- customer/risk history and duplicate resolution;
- inbox, canned responses and extraction review;
- operational automations with durable execution;
- expenses, accounting, COD and profitability;
- analytics, saved views and reports;
- settings, secrets, diagnostics and support;
- local encrypted backup, restore and replacement-install recovery;
- one coherent design system and navigation architecture;
- complete AR/FR/EN, RTL, keyboard, accessibility and responsive behavior;
- low-resource scheduling, bounded sidecars/caches and long-session stability.

AI remains optional, seller-key-funded and privacy-policy-bound. Storefront,
remote PWA and uncertified providers cannot substitute for local completion.

### Supplier/procurement gate

The current schema has no dedicated supplier, purchasing or stock-receipt
domain. Before Phase 3 scope freezes, the Founder decides whether professional
procurement is Required for 1.0 or a following release. Stock movement history
is Required regardless.

### Exit gate

- every Required local capability satisfies the page-completion contract;
- no known P0/P1 defect;
- representative data and eight-hour low-end stability pass;
- clean install, update, migration, backup and replacement restore pass;
- Founder accepts the complete local-product Internal candidate.

## Phase 4 — Identity, teams, licensing and Founder operations

### Outcome

SahelFlow can identify, sell to, activate, recover and support real seller
workspaces without making daily local operation subscription-dependent.

### Workstreams

- immutable person identity plus changeable verified contact methods;
- seller workspace, ownership and separately licensed multi-workspace support;
- member invitations, per-shop membership, roles, fields, assignments,
  approvals and revocation;
- device enrollment, sessions, replacement and emergency recovery;
- isolated safe demo and online trial-only signed seven-day trial;
- complete expiry lockout without data loss or bypass;
- structured BaridiMob/CCP evidence and Founder actual-account review;
- offline permanent signing and signed entitlement amendments;
- five included shops plus paid expansion to ten;
- private Founder Console with bounded metadata and immutable audit;
- release/support horizon, refund/transfer and incident state machines.

### Exit gate

- one trial per recognized machine survives reinstall/local clearing;
- permanent desktop validates and operates offline;
- owner/member/device/shop/field boundaries pass adversarial isolation tests;
- permanent signing key never enters the online system;
- Founder Console cannot access operational plaintext;
- transfer/recovery revokes old authority without stranding valid data;
- commercial policies and legal/support copy are approved.

## Phase 5 — Certified providers and durable external effects

### Outcome

Only Founder-selected, capability-specific, live-proven providers are public,
and every external effect is durable, observable and repairable.

### Workstreams

- common provider contract, credentials and health model;
- bounded worker lifecycle, rate limits and backpressure;
- raw-event inbox, effect outbox, receipts, dead letter and reconciliation;
- Founder-selected courier launch set;
- WhatsApp lifecycle and message durability;
- Shopify, WooCommerce and YouCan capability-by-capability certification;
- Google Sheets only if Founder classifies it for launch;
- provider incidents, kill switches, support guidance and dated recertification.

### Exit gate

- each public action has dated sandbox/live evidence;
- duplicates, missed callbacks, ambiguity, outage and reconciliation drills pass;
- UI hides or labels uncertified capabilities honestly;
- credentials and private payloads remain protected;
- no checkpoint advances past untracked failure.

## Phase 6 — Shared connected platform

### Outcome

Optional remote work, hosted storefronts and encrypted recovery operate through
a bounded measured SahelFlow cloud while the desktop remains canonical.

### Economics gate

Before implementation fixes public quotas:

- model Workers, D1, Queues, Durable Objects, R2, domains, media, egress,
  monitoring and support at 10/100/1,000/10,000 sellers;
- measure p50, p95, maximum and abuse scenarios per license;
- validate the five-year 7,000 DZD base reserve and 1,000 DZD extra-shop
  reserve;
- define quotas, rate limits, retention, alarms and service-exit behavior;
- retain shared multi-tenancy; do not default to seller BYOC.

### Workstreams

- minimal identity/licensing/routing control plane;
- encrypted projection and signed remote-command relay;
- durable sequences, revocation, conflict and outage behavior;
- zero-knowledge backup keys, retention and recovery ceremonies;
- shared storefront releases, media, delegated allocation and domains;
- durable checkout receipt, desktop import and reconciliation;
- operational PWA/browser companion;
- per-workspace metering, cost, quota and incident views in Founder Console.

### Exit gate

- cloud outage cannot block permanent local work or corrupt desktop authority;
- remote success appears only after desktop commit;
- storefront customer success always has a durable receipt;
- neither SahelFlow nor Cloudflare alone can decrypt backups;
- tenant isolation, replay, revocation, restore and service-exit drills pass;
- real cost stays within approved continuity boundaries.

## Phase 7 — Representative beta and Stable

### Outcome

The complete product is proven with representative Algerian COD businesses and
promoted through evidence rather than ambition.

### Work

- controlled beta with 3–5 representative businesses;
- at least five representative live storefronts;
- real order, delivery, return, COD, provider, team and restore incidents;
- support/incident/release rehearsals;
- independent security/privacy and Law 18-07 review;
- complete compatibility and reference-hardware matrix;
- accessibility, localization and claims audit;
- staged Stable updater rollout, hold and forward-fix rehearsal;
- continuity reserve and service-exit readiness;
- final P0/P1 review and Founder approval.

### Stable gate

- every public capability and claim links exact current evidence;
- no unresolved P0/P1 defect;
- signed Windows Stable artifact and immutable manifest pass;
- reference hardware and data profiles meet approved thresholds;
- migrations, clean install, upgrade, restore and replacement install pass;
- provider, security, privacy, accessibility and localization reports pass;
- beta exit and Founder promotion are explicit.

## Work-package ordering after this reset

The first application program is:

1. workspace/shop context compatibility design and migration;
2. persistent shop incarnation and safe live switching;
3. state-machine and movement schema with compatibility reads;
4. canonical transition/audit/outbox service;
5. inventory reservation/movement integration;
6. COD receivable/remittance/refund integration;
7. delivery/return/provider event idempotency;
8. Golden COD Journey UI and end-to-end evidence.

The Web Agent and Desktop Agent may divide independent packages, but one owns
each branch and the other reviews. Shared schema/contract work is serialized
before dependent parallel UI/domain work.
