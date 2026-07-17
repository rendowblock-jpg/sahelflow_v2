# SahelFlow 1.0 — Implementation Roadmap

> **Status:** Active execution path  
> **Current-state source:** `CURRENT_TO_TARGET_ANALYSIS.md`  
> **Target authority:** `ENGINEERING_SPECIFICATION.md` and the Founder-approved product package  
> **Planning model:** Outcome-driven phases and waves; issues are optional implementation aids, not the unit of product continuity.

## 1. Purpose

This roadmap is the single work path from the current application to the finished SahelFlow 1.0. It replaces the former M0–M14 planning ladder with a smaller dependency model tied directly to the codebase gaps.

A phase is complete only when its outcome is demonstrated. A screen, schema, branch, test count or merged PR does not by itself close a phase.

## 2. Sequencing principles

1. Preserve useful product behavior while replacing unsafe authority underneath it.
2. Prove the packaged Windows system early; do not postpone runtime reality until release.
3. Do not build connected customer-facing features before explicit identity, shop context, keys and durable events exist.
4. Migrate one domain/effect/provider class at a time behind compatibility layers.
5. Remove legacy paths only after data migration, parity, evidence and rollback review.
6. Keep documentation and shared memory concise; implementation evidence belongs with the change that creates it.
7. Performance, accessibility, security and recovery are continuous constraints, not final cleanup.
8. Founder involvement is reserved for product choices, consequential tradeoffs, public claims and Stable approval.

## 3. Dependency map

```text
Phase 0 — Repository and packaged truth
        │
        ├───────────────┐
        ▼               ▼
Phase 1A — Runtime   Phase 1B — Shop/data authority
        └───────┬───────┘
                ▼
Phase 2 — Identity, entitlement, keys and recoverability
                ▼
Phase 3 — Durable operational core
                ▼
Phase 4 — Bounded connected platform
          ├──────────────┬───────────────┐
          ▼              ▼               ▼
      Backup        Provider framework   Remote protocol
          └──────────────┬───────────────┘
                         ▼
Phase 5 — Provider, PWA and storefront convergence
                         ▼
Phase 6 — Whole-product hardening, beta and Stable
```

Phase 1A and 1B may run in parallel after Phase 0. Design research and UI prototypes may occur early, but production authority cannot bypass the graph.

## 4. Phase 0 — Repository and packaged truth

### Outcome

A clean checkout can execute binding checks and produce an internal Windows candidate whose exact source, versions and artifacts are known.

### Workstreams

- repair CI startup and the undefined `sf-verify` command;
- establish required type, lint, test, migration and dependency checks;
- generate one version/build/schema/protocol/evidence manifest;
- remove active version, platform and readiness drift;
- make release candidate creation Windows-only and artifact-first;
- retain logs, machine-readable test results and artifact hashes;
- create generated inventories for routes, models, migrations, tests and provider claims;
- establish a minimal evidence-record format;
- capture a no-optimization T470 and 4 GB baseline;
- keep the candidate internal; no Stable publication.

### Exit gate

- clean-checkout CI executes on a pull request;
- required checks are binding and reproducible;
- a Windows candidate is produced without external Node/Bun/Rust on the test machine;
- source commit, build ID, versions and artifact digests agree;
- missing runtime/resource/startup failures are visible;
- baseline device and memory/startup evidence exists;
- no active documentation points to invalid commands or unsupported Stable platforms.

### Enables

Runtime supervision, shop authority, migration work and all later evidence.

## 5. Phase 1 — Trusted local foundation

Phase 1 has two parallel workstreams that converge before Phase 2.

### 5.1 Phase 1A — Windows runtime and supervision

#### Outcome

The desktop owns a deterministic authenticated service lifecycle with explicit readiness and recovery.

#### Workstreams

- introduce the local service supervisor abstraction;
- reserve dynamic loopback endpoints or an equivalent OS-native channel;
- generate per-launch service credentials and endpoint manifest;
- supervise Next.js and WhatsApp processes with restart budgets;
- validate bundled runtime, server, sidecar and resource hashes;
- make startup a visible state machine;
- implement clean shutdown, crash-loop and support diagnostics;
- test sleep/resume, reboot, occupied endpoint, missing resource and child crash;
- measure and reduce low-end cost without weakening correctness.

#### Exit gate

- clean Windows install launches consistently;
- the app never presents ready state while required services are unavailable;
- service endpoints are loopback-only and per-launch authenticated;
- restart/recovery behavior is bounded and visible;
- total process memory/startup budgets have measured evidence.

### 5.2 Phase 1B — Explicit shop authority and safe migrations

#### Outcome

Every local operation is tied to the intended shop, and every supported upgrade is recoverable across all registered shops.

#### Workstreams

- design and migrate to an atomic versioned registry;
- introduce trusted `ShopContext`;
- build context-aware repositories and background-job scopes;
- remove silent database fallback;
- replace production `db push`;
- implement all-shop migration preflight, compatibility checks and journal;
- require verified local snapshots for risky migrations;
- make migration error classification exact and fail closed;
- produce seller/support-readable migration reports;
- add multi-shop, corrupt-registry, missing-file, interrupted-migration and rerun tests.

#### Exit gate

- no write can execute without explicit shop context;
- missing/corrupt registry never opens another shop;
- every registered shop is enumerated and version-checked;
- backup failure blocks risky migration;
- interrupted migration resumes or enters a clear recovery state;
- current seller data has a tested migration path.

### Enables

Keys, identity, licensing, durable events, backup and cloud protocols.

## 6. Phase 2 — Identity, entitlement, keys and recoverability

### Outcome

The installation has trusted owner/member/device/shop authority, executable commercial entitlements and a recovery design that does not depend on unsafe local/browser state.

### Workstreams

#### Keys and secrets

- threat-model the Windows root-key and recovery design;
- add versioned key/ciphertext envelopes;
- separate per-shop, secret, backup and relay keys;
- migrate the plaintext keyfile through a resumable journal;
- move provider credential access to scoped handles;
- create secret/PII canary scans;
- implement rotation and revocation.

#### Identity and authorization

- create tenant/member/role/field-policy/device/session/invitation/approval models;
- migrate the current owner PIN into the owner principal;
- replace broad setup bypass with a narrow one-time bootstrap capability;
- create trusted request/command context;
- enforce shop and field permissions at query/mutation boundaries;
- enroll and revoke devices;
- bind audit actors to principals and sessions;
- implement owner re-authentication and approval policy.

#### Licensing and commercial entitlements

- define signed entitlement format and verifier vectors;
- build one-per-policy online seven-day trial issuance;
- enforce complete lockout across UI, API, background and remote surfaces;
- build manual BaridiMob/CCP review and immutable approval;
- build offline permanent signing tooling;
- encode product major, shops, extra slots, members, devices and support horizon;
- implement transfer/recovery and revocation;
- migrate/delete browser self-issuance and trusted status branches.

#### Recovery foundation

- define recovery-kit format and ceremony;
- implement verified all-shop local snapshot format;
- prove key and entitlement recovery on a replacement installation;
- require recovery setup in first-run onboarding.

### Exit gate

- clearing browser/local display state cannot reset a trial;
- trial expiry locks operations without deleting data;
- permanent purchased-major local use survives prolonged cloud outage;
- forged actor/member/shop/device claims fail;
- field policy is enforced outside the UI;
- provider/root keys do not appear in ordinary files, DB plaintext, browser storage, logs or diagnostics;
- replacement-machine local recovery succeeds using the recovery kit;
- Founder can issue, transfer and revoke through auditable records.

### Enables

Durable operational actors, cloud identity, backup and remote clients.

## 7. Phase 3 — Durable operational core

### Outcome

Every launch-critical business change and external effect can survive crashes, retries, concurrency and partial failure without silent loss or duplication.

### Workstreams

#### Transaction kernel

- add domain-event, inbox, outbox, effect-attempt, receipt, dead-letter, checkpoint and reconciliation records;
- add a transaction helper for domain state + trusted audit + event + intent + idempotency + compensation;
- add worker scheduler, backpressure, retries and operator controls;
- create correlation and health views.

#### Domain convergence

Migrate one business slice at a time:

1. order creation and status;
2. stock reservation/adjustment;
3. delivery creation/tracking;
4. return/exchange;
5. refund/reversal;
6. COD collected/remitted/discrepancy;
7. accounting correction/export;
8. customer statistics and risk;
9. automation actions and notifications.

For each slice:

- preserve existing UI where practical;
- dual-write only under a bounded parity plan;
- prove replay, concurrency, failure and compensation;
- remove direct writes only after parity;
- retain historical rows with source/version markers.

#### Automation and AI approval foundation

- migrate automation conditions/editor to durable intents;
- classify actions by risk;
- bind approval to exact action, arguments, actor, state version and expiry;
- replace generic “yes/ok in current message” confirmation authority;
- expose retry/dead-letter/recovery states.

#### Provider boundary preparation

- migrate WhatsApp callbacks and current provider side effects into inbox/outbox records;
- wrap current polling as a reconciliation producer;
- stop checkpoints from passing unresolved failures.

### Exit gate

- crash-at-every-step tests show no acknowledged event loss;
- one effect key cannot execute twice;
- audit and outbox intent commit with high-risk business writes;
- poison events block or enter governed dead-letter state;
- return/refund/COD/stock/accounting scenarios reconcile exactly;
- automation/AI destructive actions require bound current approval;
- operator recovery is visible and tested.

### Enables

Safe cloud relay, provider migration, storefront import and remote commands.

## 8. Phase 4 — Bounded connected platform

### Outcome

SahelFlow gains the connected services required by the product contract without moving operational authority or prohibited plaintext out of the desktop.

### Workstreams

#### Cloud control plane

- create isolated Cloudflare workspace, infrastructure and environment separation;
- implement tenant/license/member/device/session/payment/support metadata;
- enforce data classes and retention;
- add rate limits, quotas, cost alarms and incident controls;
- build minimal Founder administration.

#### Encrypted relay and command protocol

- define signed/encrypted envelope and projection schemas;
- add sequence, replay, expiry, revocation and compatibility rules;
- implement durable relay and desktop connector;
- distinguish queued, committed, rejected, expired and conflict states;
- re-authorize commands on desktop execution;
- create outage/reconnect reconciliation.

#### Zero-knowledge backup

- implement client-side encrypted chunk/manifests;
- add resumable upload/download and remote object verification;
- enforce 7 daily, 4 weekly, 6 monthly and pinned retention;
- add isolated periodic restore certification;
- integrate transfer and recovery kit;
- make migration coordinator consume verified snapshots.

### Exit gate

- packet/object inspection finds no prohibited operational plaintext;
- cross-tenant, replay, expiry and revocation attacks fail;
- desktop continues local purchased-major operation during cloud outage;
- queued work reconciles safely after outage;
- cloud operator cannot decrypt backup data;
- replacement installation restores every shop from remote backup;
- cost and fair-use envelopes are measured.

### Enables

Operational PWA, hosted storefront, provider webhooks and connected support.

## 9. Phase 5 — Provider, PWA and storefront convergence

### Outcome

All connected product surfaces operate on the new identity, durability and cloud foundations and expose only certified capabilities.

### 5.1 Provider framework and certifications

Build the shared capability/error/idempotency/checkpoint framework, then migrate and certify:

- WhatsApp/Baileys;
- Shopify;
- WooCommerce;
- YouCan;
- Yalidine;
- ZR Express;
- Maystro;
- Google Sheets;
- Gemini extraction/chat/actions.

Procolis remains optional. DHD and any unverified provider remain experimental and hidden until Founder scope and live certification.

Each public capability requires dated environment/account/API evidence, failure cases, reconciliation proof, known limitations and recertification triggers.

### 5.2 Operational PWA/browser companion

- pair/enroll remote devices;
- generate role/field-filtered encrypted projections;
- partition and purge caches by tenant/member/device/shop/version;
- implement read-only operational views first;
- add low-risk commands, then permitted higher-risk commands;
- show stale, offline, queued, committed, rejected and conflict states;
- exclude prohibited administration;
- certify mobile performance, accessibility and revocation.

### 5.3 Hosted storefront

- add tenant/storefront/shop/domain/media/allocation models;
- separate drafts from immutable releases;
- migrate the builder to release schemas;
- build hosted render path and first template;
- implement server-authoritative durable checkout receipt;
- relay/import/reconcile with the canonical desktop;
- add domains, TLS, content-addressed media and rollback;
- deliver three materially distinct certified templates;
- retire local direct checkout after parity.

### 5.4 AI privacy and action convergence

- centralize provider/model registry;
- build allowlisted privacy-classified payloads;
- test Darija/Arabic/French/mixed-format canary corpora;
- retain typed result validation;
- record safe request metadata and quota health;
- use the bound approval service for mutations;
- preserve non-AI fallbacks.

### Exit gate

- every public provider action has current live certification;
- no accepted provider/storefront event is lost;
- remote success appears only after desktop commit;
- revoked devices lose sessions and sensitive caches;
- storefront accepted checkout always has a durable tenant/shop receipt;
- price/allocation/replay attacks fail;
- three templates meet performance, mobile, RTL and accessibility targets;
- uncertified capabilities remain hidden or explicit.

## 10. Phase 6 — Whole-product hardening, beta and Stable

### Outcome

All launch systems converge into a coherent, accessible, recoverable and supportable SahelFlow 1.0 proven with representative sellers.

### Workstreams

#### Product and UX convergence

- rebuild onboarding around installation preflight, owner, trial/license, shop, recovery, provider and first-order outcomes;
- remove remaining direct DB/global context paths;
- unify inbox persisted/live data;
- expose permission, queue, retry, conflict, degradation, backup and recovery states consistently;
- complete AR/FR/EN and RTL/LTR review across desktop, PWA and storefront;
- complete keyboard, screen-reader, zoom and 1366×768 testing.

#### Performance and scale

- exercise the certified data profiles;
- optimize query/page boundaries from traces;
- bound RSC loading, background work, caches and provider concurrency;
- implement low-resource scheduling that never weakens correctness;
- validate T470 and 4 GB HDD/SSD budgets;
- run long-session memory and outage tests.

#### Security and privacy

- close full threat model;
- produce SBOM and dependency policy;
- run secret/PII scans and penetration testing;
- conduct independent review of identity, crypto, tenant, backup, command, storefront and release boundaries;
- rehearse incident containment, key/session/provider revocation and diagnostic consent.

#### Beta and release

- internal dogfood and disaster drills;
- controlled beta with 3–5 representative Algerian COD businesses;
- five representative live storefronts;
- real provider and restore incidents recorded;
- beta exit review;
- signed Windows Stable candidate and immutable evidence manifest;
- staged updater rollout, hold/rollback/forward-fix rehearsal;
- accurate public claims and support readiness.

### Exit gate

- all Founder launch gates are met;
- no unresolved P0/P1 defect;
- every public capability is evidence-linked;
- reference devices meet budgets;
- replacement-install restore succeeds;
- beta exit is approved;
- signed Windows artifact is promoted only after final Founder approval.

## 11. Continuous workstreams

The following run through every phase:

- documentation and claim accuracy;
- migration and compatibility planning;
- threat modeling and privacy classification;
- accessibility, RTL and localization;
- performance measurement;
- evidence capture;
- support and recovery UX;
- deletion of obsolete paths only after replacement proof.

## 12. First implementation wave

After this documentation reset merges, start one application wave:

### `Proven Canonical Windows Desktop`

The wave combines Phase 0 with the minimum Phase 1 design needed to prove a reliable installed candidate. Its exact outcome, scope, non-goals and evidence are defined in `CURRENT_TO_TARGET_ANALYSIS.md`.

Do not start Cloudflare, hosted storefront, remote PWA or provider expansion before this wave establishes repository truth, packaged runtime evidence and the shop/migration migration boundary.
