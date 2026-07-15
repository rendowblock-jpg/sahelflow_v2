# SahelFlow 1.0 — Architecture Reset Brief

> **Next-session phase:** Analysis, consolidation, architecture, and coding-workflow design  
> **Explicit restriction:** Do not begin feature implementation during this phase.

## 1. Mission

Transform the founder-approved product contract into one coherent, evidence-grounded engineering plan based on the full current codebase—not on historical assumptions, isolated file reviews, or imagined greenfield architecture.

The phase must finish and organize the product documentation, eliminate active drift, inspect every relevant implementation surface, decide the system architecture through superseding ADRs, and produce the dependency-correct coding workflow for the following implementation phase.

## 2. Required reading order

Before inspecting code:

1. `documentation/product/README.md`
2. `documentation/product/LAUNCH_CONSTITUTION.md`
3. `documentation/product/FOUNDER_DECISIONS.md`
4. `documentation/product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md`
5. `documentation/product/VERIFIED_CURRENT_STATE.md`
6. `documentation/product/CONTRADICTION_REGISTER.md`
7. this brief
8. `documentation/product/NEXT_SESSION_HANDOFF.md`

Then inspect the entire current `main` repository.

## 3. Full-codebase awareness requirement

The next session must build a repository map and read the full implementation before finalizing architecture.

### Repository and build

- branches, tags, recent commits, open PRs, and default-branch state;
- complete tracked-file tree;
- package manager, lockfile, workspaces, scripts, and generated files;
- Next.js, Tauri, Rust, WebView2, Node/Bun/sidecar packaging;
- development versus packaged runtime topology;
- installer, updater, release tooling, signing, and CI.

### Data and domain

- complete Prisma schema and every migration;
- per-shop database creation/switching/closing;
- extensions, middleware, encryption hooks, blind indexes, and query guards;
- every write service and raw database write;
- order/customer/product/inventory/delivery/return/refund/accounting/reconciliation state machines;
- import/export and bulk operations;
- analytics and large-data queries;
- cleanup, soft-delete, retention, and archival behavior.

### Security, identity, and licensing

- master-key generation/storage/use/rotation;
- secret storage and every credential consumer;
- license state, trial issuance, machine identity, clock behavior, activation, lockout, and recovery;
- Tauri commands/capabilities and local API trust boundaries;
- browser/PWA storage;
- logs, diagnostics, telemetry, Sentry, and redaction;
- current authorization assumptions and actor handling.

### External systems

- WhatsApp sidecar startup, session storage, reconnect, message/media flow, limits, and failure modes;
- Gemini/API calls, prompts, tools, extraction, confirmation, key handling, and UI;
- Shopify, WooCommerce, YouCan, courier adapters, credentials, sync cursors, retries, and tests;
- storefront routes, catalog projection, templates, builder, media, checkout, and order ingestion;
- service worker/PWA behavior and mobile routes.

### Reliability and quality

- backup, restore, migration, rollback, and corruption handling;
- audit and automation delivery;
- background schedulers and process lifecycle;
- concurrency, idempotency, optimistic versions, and transaction boundaries;
- all tests and fixtures;
- CI, lint, typecheck, unit/integration/E2E, packaged app tests, mutation testing, Lighthouse, dependency auditing, and artifacts;
- performance and memory behavior on current architecture.

### Documentation

- inventory every README, vision, design system, ADR, project-state, handoff, roadmap, ship spec, session document, research note, and public claim;
- identify owner, status, date, supported release, and whether it remains useful;
- do not delete historical evidence until any still-useful facts are migrated or linked.

## 4. Required analysis outputs

### 4.1 Repository map

Create a concise map of:

- processes and binaries;
- runtime boundaries;
- data stores;
- primary modules;
- external providers;
- critical paths;
- ownership and authority boundaries;
- test and release infrastructure.

### 4.2 Evidence ledger

For every launch system, record:

- route/UI inventory;
- API/command inventory;
- data/schema inventory;
- implementation status;
- tests and evidence;
- known defects;
- security/privacy risks;
- performance risks;
- documentation claims;
- exact commit.

Use only:

- `Verified`;
- `Implemented but unvalidated`;
- `Partial`;
- `Unsafe`;
- `Missing`;
- `Obsolete`.

### 4.3 Dependency graph

Map prerequisites so work is not scheduled in the wrong order. At minimum include:

- version authority;
- secure storage/key hierarchy;
- license/entitlement state;
- trusted identity/actor/authorization;
- database transaction/audit/outbox foundation;
- cloud identifiers, sessions, encryption, durable ingress;
- backup/recovery;
- mobile/team protocols;
- integration synchronization;
- storefront publishing/checkout;
- feature completion and UI;
- performance/security/release gates.

### 4.4 Gap and reuse analysis

For each current subsystem decide:

- keep as-is;
- harden/refactor;
- migrate behind new interface;
- replace;
- delete;
- preserve only as historical/reference.

No rewrite decision may be based on taste alone. Record evidence, migration risk, reuse value, and impact on low-end performance.

## 5. Documentation consolidation outputs

The next session must finish the repo-wide cleanup that this session intentionally did not perform before the full repository read.

Required result:

- one signed/final Launch Constitution;
- one consolidated Founder Decisions Register;
- one frozen Scope and Entitlement Matrix;
- one Engineering Specification;
- one Evidence Ledger;
- one current Contradiction Register;
- one ADR index containing only active superseding ADRs;
- one provider-contract registry;
- one operational runbook index;
- one implementation roadmap;
- one coding-workflow document.

For older documents:

- **rewrite** when they are active and broadly useful;
- **archive** when historical context remains valuable;
- **delete** when empty, duplicated, superseded, misleading, or without durable value;
- **redirect** when links are likely to remain useful.

The next session must show a proposed deletion/archive list before making large destructive documentation changes, then perform the approved cleanup in the same session using best judgment if no user clarification is necessary.

## 6. Superseding ADR set

The Architecture Reset must produce or explicitly defer ADRs for:

1. Runtime/process topology and low-resource execution.
2. Database access, transaction boundaries, strict query safety, and multi-shop lifecycle.
3. Master-key, secret, license, device, and recovery-key hierarchy.
4. Licensing, entitlement, trial, lockout, transfer, expansion, and updater authority.
5. Team identity, roles, field permissions, sessions, device enrollment, approvals, and trusted actors.
6. Audit, inbox/outbox, automation, external side effects, idempotency, and compensation.
7. Cloudflare control plane, identifiers, data classes, retention, encryption, and outage behavior.
8. Mobile/team projection and command protocol.
9. Zero-knowledge backup format, upload, immutability, restore, and service exit.
10. Commerce webhook/reconciliation/checkpoint architecture.
11. Courier provider contract and capability architecture.
12. Storefront tenant, catalog projection, media, release, domain, allocation, checkout, and import architecture.
13. Gemini provider, privacy-safe redaction, tool/action approval, and provider-policy versioning.
14. Observability, privacy-safe diagnostics, incident response, and cost attribution.
15. Version authority, migrations, compatibility, release channels, updater, rollback, and support dates.
16. Testing, evidence, release gates, and reference-device performance lab.

## 7. Engineering specification requirements

The Engineering Specification must define invariants, not just component descriptions.

Examples:

- no canonical mutation succeeds outside an authorized domain transaction;
- no acknowledged external event lacks a durable record;
- no checkpoint advances past an untracked failure;
- no critical mutation can lose its required audit/outbox record;
- no client-provided user/role is trusted;
- no remote/mobile success appears before desktop commit;
- no seller secret persists in browser/cloud plaintext;
- no backup is called verified without integrity and restore evidence;
- no migration proceeds without verified recovery path;
- no checkout trusts browser price/stock/shipping totals;
- no tenant/shop/member field crosses an unauthorized projection or cache;
- no low-end adaptation changes business logic, money, security, authorization, or retention silently;
- no public claim is emitted without evidence metadata.

Each invariant needs owner, enforcement points, tests, observability, and failure/recovery behavior.

## 8. Coding workflow design deliverable

Do not code features yet. Design the exact workflow that the implementation phase will follow:

- branch strategy;
- milestone and epic structure;
- issue template and acceptance criteria;
- ADR/spec/evidence links required before work starts;
- vertical-slice versus foundation sequencing;
- maximum PR size and review rules;
- database migration rules;
- security-sensitive change rules;
- required tests per risk class;
- packaged-app validation;
- reference-device performance checks;
- provider live-certification workflow;
- documentation/evidence update requirements;
- release-gate ratcheting;
- rollback and emergency fix procedure;
- merge policy and `main` protection.

## 9. Required implementation roadmap shape

The roadmap must be dependency-correct and evidence-gated. Expected high-level order:

1. Documentation/version/evidence authority.
2. Runtime and performance baseline.
3. Secure key/secret/license/entitlement foundation.
4. Identity, teams, authorization, trusted actors, and sessions.
5. Database safety, domain transactions, audit, outbox/inbox, idempotency.
6. Cloud control plane and encrypted protocols.
7. Backup and disaster recovery.
8. Synchronization and provider contract framework.
9. Mobile and remote team operations.
10. Storefront platform, builder, allocation, and checkout.
11. Domain-feature completion and AAA UI/state coverage.
12. Low-end optimization and large-data certification.
13. Security, accessibility, provider, and packaged release gates.
14. Controlled seller beta and Stable launch.

The next session may change this order only with an explicit dependency rationale.

## 10. End-of-next-session acceptance criteria

The next session is complete only when:

- the full current codebase and documentation set have been inspected;
- the evidence ledger is tied to an exact commit;
- active documentation drift is removed or explicitly queued with owners;
- the final architecture and ADR set are coherent with all founder decisions;
- current reusable code versus replacement scope is clear;
- the dependency graph and roadmap are complete;
- the coding workflow and merge/release gates are ready;
- no feature code has been started prematurely;
- the repository is left clean, committed, and ready for the implementation session.