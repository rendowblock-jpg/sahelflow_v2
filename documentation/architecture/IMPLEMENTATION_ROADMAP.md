# SahelFlow 1.0 — Implementation Roadmap

> **Status:** Active execution path  
> **Product authority:** `../product/`  
> **Experience authority:** `../experience/`  
> **Current-state source:** `CURRENT_TO_TARGET_ANALYSIS.md`  
> **Target engineering authority:** `ENGINEERING_SPECIFICATION.md` and `SUPERSEDING_ADRS.md`  
> **Planning model:** Outcome-driven phases and waves; issues are optional implementation aids, not the unit of product continuity.

## 1. Purpose

This roadmap is the single dependency-correct work path from the current application to the finished SahelFlow 1.0. It replaces the former M0–M14 and session-number ladders.

A phase is complete only when its outcome is demonstrated. A screen, schema, branch, test count or merged PR does not by itself close a phase.

The roadmap controls **when** work may safely proceed. Product scope controls **what** Stable includes. The experience package controls **how completely and coherently** included capabilities behave. The Engineering Specification controls **which invariants** implementation must satisfy.

## 2. Sequencing principles

1. Preserve useful product behavior while replacing unsafe authority underneath it.
2. Prove the packaged Windows system early; runtime reality is not postponed until release.
3. Do not build connected customer-facing features before explicit identity, shop context, keys and durable events exist.
4. Migrate one domain, effect and provider class at a time behind bounded compatibility layers.
5. Remove legacy paths only after data migration, parity, evidence and recovery review.
6. Performance, Arabic/RTL, accessibility, security, privacy, recovery and support UX are continuous constraints.
7. Every wave identifies its scope class, capability, journey/states, experience dimensions, engineering invariants and evidence.
8. Conditional capabilities remain hidden or narrow until certified.
9. Architecture candidates do not become product promises without a Founder decision.
10. Founder involvement is reserved for product choices, provider launch-set selection, consequential tradeoffs, public claims and Stable approval.

## 3. Dependency map

```text
Phase 0 — Repository, documentation and packaged truth
        │
        ├───────────────┐
        ▼               ▼
Phase 1A — Runtime   Phase 1B — Shop/data authority
        └───────┬───────┘
                ▼
Phase 2 — Identity, entitlement, keys and local recovery
                ▼
Phase 3 — Durable operational core and team work
                ▼
Phase 4 — Bounded connected platform and cloud recovery
          ├──────────────┬───────────────┐
          ▼              ▼               ▼
      Backup        Provider framework   Remote protocol
          └──────────────┬───────────────┘
                         ▼
Phase 5 — Certified providers, PWA and storefront convergence
                         ▼
Phase 6 — Whole-product completion, beta and Stable
```

Phase 1A and Phase 1B may run in parallel after Phase 0. Research and prototypes may happen early, but production authority and public claims cannot bypass the graph.

## 4. Continuous horizontal tracks

These run through every phase rather than waiting for Phase 6:

- product/scope and claim accuracy;
- capability and journey/state completeness;
- design-system and shared interaction patterns;
- Arabic/French/English and RTL/LTR quality;
- keyboard, screen-reader, zoom and accessibility;
- low-end/T470 measurement and adaptive behavior;
- migration and compatibility planning;
- threat modeling, data classification and Law 18-07 review;
- evidence capture and support/recovery UX;
- deletion of obsolete paths only after replacement proof.

## 5. Phase 0 — Repository, documentation and packaged truth

### Outcome

A clean checkout executes binding checks and produces an internal Windows candidate whose exact source, versions, artifacts, documentation authority and baseline behavior are known.

### Workstreams

#### Repository and CI

- repair Actions startup and the undefined `sf-verify` command;
- establish required type, lint, test, migration and dependency checks;
- create branch protection and artifact retention appropriate to risk;
- retain machine-readable results and logs.

#### Version and release truth

- generate one app/product/build/schema/protocol/projection/backup/storefront/evidence manifest;
- remove active 4.x/session/version drift from product surfaces;
- make candidate creation Windows-only and artifact-first;
- keep all Phase 0 artifacts internal; no Stable publication.

#### Documentation and inventory truth

- run local Markdown link/reference validation;
- generate inventories for routes, commands, APIs, models, migrations, tests and provider claims;
- generate a page/component/design-token inventory without creating another permanent authority;
- verify each active entrypoint follows product → experience → engineering → current state → roadmap/workflow → active wave;
- ensure legacy history/research/component docs cannot make current product or readiness claims.

#### First packaged baseline

- produce a Windows internal candidate without external Node, Bun or Rust on the test machine;
- record startup/readiness and missing-resource behavior;
- capture no-optimization T470 and 4 GB floor baselines;
- identify supported runtime capabilities and the test matrix for Windows 10 22H2, Windows 11 including unsupported-CPU cases, Tiny11/modified builds, HDD/SSD and VMs.

### Exit gate

- clean-checkout CI actually executes on a pull request;
- required checks are binding and reproducible;
- exact source, version manifest, build ID and artifact digests agree;
- a Windows candidate installs and starts without development tooling;
- missing runtime/resource/startup failures are visible and recoverable;
- baseline device/memory/startup results exist;
- documentation links and active authority flow are validated locally;
- no active document points to invalid commands, unsupported Stable platforms or superseded product assumptions.

### Enables

Runtime supervision, explicit shop authority, safe migrations and all later evidence.

## 6. Phase 1 — Trusted local foundation

Phase 1 has two parallel workstreams that converge before Phase 2.

### 6.1 Phase 1A — Windows runtime and supervision

#### Outcome

The desktop owns a deterministic authenticated service lifecycle with explicit readiness, diagnostics and recovery on the approved Windows capability matrix.

#### Workstreams

- introduce a local service-supervisor abstraction;
- reserve dynamic loopback endpoints or an equivalent OS-native channel;
- generate per-launch service credentials and endpoint manifest;
- supervise Next.js and WhatsApp processes with restart budgets and backpressure;
- validate bundled runtime, server, sidecar and resource hashes;
- make startup a visible state machine;
- implement clean shutdown, crash-loop, support and safe-mode diagnostics;
- test sleep/resume, reboot, occupied endpoint, missing resource and child crash;
- test Windows capability cases without claiming security equivalence for modified systems;
- measure and reduce low-end cost without weakening correctness.

#### Exit gate

- clean standard-user Windows install launches consistently;
- the app never presents ready state while required services are unavailable;
- service endpoints are loopback-only and per-launch authenticated;
- restart/recovery behavior is bounded and seller-visible;
- total process memory/startup budgets have measured evidence;
- unsupported/missing components produce precise capability guidance rather than vague hardware rejection.

### 6.2 Phase 1B — Explicit shop authority and safe migrations

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
- produce seller/support-readable compatibility and migration reports;
- add multi-shop, corrupt-registry, missing-file, interrupted-migration, low-disk and rerun tests;
- preserve existing data with bounded adapters while call sites migrate.

#### Exit gate

- no write executes without explicit shop context;
- missing/corrupt registry never opens another shop;
- every registered shop is enumerated and version-checked;
- backup failure blocks risky migration;
- interrupted migration resumes or enters clear maintenance/recovery state;
- current seller data has a tested supported-version migration path.

### Enables

Keys, identity, licensing, durable events, backup and cloud protocols.

## 7. Phase 2 — Identity, entitlement, keys and local recovery

### Outcome

The installation has trusted owner/member/device/shop authority, executable commercial entitlements, protected key separation and a local recovery design that does not depend on browser state or unsafe key files.

### Workstreams

#### Key and secret hierarchy

- threat-model the Windows root-key and recovery design;
- add versioned key/ciphertext envelopes and purpose separation;
- create per-license Backup Root Key handling and a unique data-encryption key for each backup;
- separate per-shop data, secret-store, backup, relay, trial-signing and permanent-signing purposes;
- keep the permanent private signing key offline;
- migrate the plaintext keyfile through a resumable journal;
- move provider credential access to scoped handles;
- create secret/private-data canary scans;
- implement rotation, compromise response and revocation.

#### Identity, authorization and team foundations

- create tenant/member/role/field-policy/device/session/invitation/approval models;
- migrate the current owner PIN into the owner principal;
- replace broad setup bypass with a narrow one-time bootstrap capability;
- create trusted request and command context;
- enforce shop/action/field permissions at read, projection and mutation boundaries;
- enroll/revoke member and owner devices;
- bind audit actors to principals and sessions;
- implement owner re-authentication and approval policy;
- test the model for at least 25 active members even though the entitlement includes owner plus ten active members.

#### Licensing and commercial entitlements

- define signed entitlement format, key IDs and verifier vectors;
- use a dedicated trial-only signing key and online one-per-machine seven-day trial issuance;
- enforce complete lockout across UI, API, background and remote surfaces while preserving data;
- build structured payment request and evidence intake;
- implement payment verification and license issuance as separate durable state machines;
- enforce manual Founder verification against the actual receiving account;
- build offline permanent license and extra-shop signing tooling;
- encode product major, shops, expansion slots, members, devices, storage and support horizon;
- implement legitimate no-fee machine replacement, transfer/recovery and revocation;
- migrate/delete browser self-issuance and trusted-status branches.

#### Local recovery foundation

- define recovery-kit format, ceremony, warnings, rotation and loss behavior;
- implement verified all-shop local snapshot format;
- design independent recovery and optional assisted recovery requiring both an enrolled-device share and separate Founder offline share;
- prove key and entitlement recovery on a replacement installation;
- require recovery setup in first-run onboarding.

### Exit gate

- clearing browser/local display state cannot reset a trial;
- trial and permanent signatures are purpose-separated;
- trial expiry locks all product operations without deleting data;
- permanent purchased-major local use survives prolonged cloud outage;
- forged actor/member/shop/device claims fail;
- field policy is enforced outside the UI;
- provider/root keys do not appear in ordinary files, database plaintext, browser storage, logs or diagnostics;
- replacement-machine local recovery succeeds with the recovery kit;
- assisted recovery cannot succeed with only SahelFlow/Cloudflare or one share;
- Founder payment verification, issuance, transfer and revocation are separate, auditable operations.

### Enables

Trusted operational actors, cloud identity, remote backup, teams and remote clients.

## 8. Phase 3 — Durable operational core and team work

### Outcome

Every launch-critical business change and external effect survives crashes, retries, concurrency and partial failure, while team work remains attributable, permissioned and recoverable.

### Workstreams

#### Transaction kernel

- add domain-event, inbox, outbox, effect-attempt, receipt, dead-letter, checkpoint and reconciliation records;
- add a transaction helper for domain state + trusted audit + event + intent + idempotency + compensation;
- add worker scheduler, bounded concurrency, retries and operator controls;
- create correlation and health views.

#### Domain convergence

Migrate one business slice at a time:

1. order intake, confirmation and status;
2. stock reservation, adjustment and reconciliation;
3. delivery creation and tracking;
4. return and exchange;
5. refund and reversal;
6. COD collected/remitted/discrepancy;
7. accounting correction/export;
8. customer statistics and risk;
9. automation actions and notifications.

For each slice:

- preserve existing useful UI where practical;
- satisfy its capability, journey states and page-completion contract;
- dual-write only under a bounded parity plan;
- prove replay, concurrency, failure and compensation;
- remove direct writes only after parity;
- retain historical rows with source/version markers.

#### Team work and approvals

- implement per-shop roles and custom field/action permissions;
- implement workgroups, assignments, queues, internal comments, mentions and handovers;
- implement optional configured two-person approval for high-risk actions;
- maintain local profiles and prepare permission-filtered remote projections;
- ensure immediate member/device/session revocation and trusted actor history;
- avoid surveillance, payroll and attendance features.

#### Automation and AI approval foundation

- migrate automation conditions/editor to durable intents;
- support nested conditions, multi-step actions, dry run and test execution;
- classify actions by risk;
- bind approval to exact action, arguments, actor, state version and expiry;
- replace generic conversational confirmation authority;
- expose pending, retry, dead-letter and recovery states.

#### Provider boundary preparation

- migrate WhatsApp callbacks and current provider effects into inbox/outbox records;
- wrap current polling as a reconciliation producer;
- stop checkpoints from passing unresolved failures.

### Exit gate

- crash-at-every-step tests show no acknowledged event loss;
- one effect key cannot execute twice;
- audit and outbox intent commit with high-risk business writes;
- poison events block or enter governed dead-letter state;
- return/refund/COD/stock/accounting scenarios reconcile exactly;
- automation/AI destructive actions require bound current approval;
- team queues, assignments, handovers and approvals enforce trusted identity and field policy;
- operator recovery is visible and tested.

### Enables

Safe cloud relay, provider migration, storefront import and remote commands.

## 9. Phase 4 — Bounded connected platform and cloud recovery

### Outcome

SahelFlow gains the connected services required by the product contract without moving canonical operational authority or prohibited plaintext out of the desktop.

### Workstreams

#### Cloud control plane

- create isolated Cloudflare workspace, infrastructure-as-code and environment separation;
- implement tenant/license/member/device/session/payment/support metadata;
- enforce data classes, retention, rate limits, quotas and incident controls;
- build minimal security-first Founder administration;
- reserve 20% of base and extra-shop sales for continuity planning;
- validate at least 24 months of forecast infrastructure coverage before public payment;
- revalidate provider/platform pricing quarterly;
- design 12-month notice and export/migration behavior for planned material discontinuation after the guarantee.

#### Encrypted relay and command protocol

- define signed/encrypted envelope and projection schemas;
- add sequence, replay, expiry, revocation and compatibility rules;
- implement durable relay and desktop connector;
- distinguish queued, processing, committed, rejected, expired and conflict states;
- re-authorize operational commands on desktop execution;
- create outage/reconnect reconciliation;
- ensure command success is shown only after desktop commit.

#### Zero-knowledge cloud backup

- implement client-side encrypted chunks/manifests using per-license root and unique per-backup data keys;
- add resumable upload/download and remote object verification;
- enforce 7 daily, 4 weekly, 6 monthly and up to 3 pinned points per shop within quota;
- provide one rolling encrypted trial backup point retained for 30 days after trial expiry;
- add isolated periodic restore certification;
- integrate independent recovery kit and optional two-share assisted recovery;
- make migration coordinator consume verified snapshots;
- prove SahelFlow or Cloudflare alone cannot decrypt seller backups.

#### Data/legal/economic control

- classify every cloud field and payload;
- run Law 18-07 review for every applicable data class;
- verify private projections, commands, results, notifications and backups use application-layer encryption;
- validate the product fair-use and cost envelopes without hidden recurring fees or local lockout.

### Exit gate

- packet/object inspection finds no prohibited operational plaintext;
- cross-tenant, replay, expiry and revocation attacks fail;
- desktop continues purchased-major local operation during cloud outage;
- queued work reconciles safely after outage;
- cloud operator cannot decrypt backup data;
- replacement installation restores every shop from remote backup;
- independent and assisted recovery ceremonies pass;
- trial backup retention works as promised;
- cost, reserve and continuity forecasts pass Founder review.

### Enables

Operational PWA, hosted storefront, provider webhooks and connected support.

## 10. Phase 5 — Certified providers, PWA and storefront convergence

### Outcome

Connected product surfaces operate on the new identity, durability and cloud foundations and expose only Founder-approved, live-certified capabilities.

### 10.1 Provider framework and launch-set selection

Build the shared capability/error/idempotency/checkpoint framework, then migrate and certify the product-required and named-conditional surfaces:

- WhatsApp/Baileys;
- Shopify;
- WooCommerce;
- YouCan;
- seller-owned Gemini extraction/chat/actions.

The current courier candidates are Yalidine, ZR Express and Maystro. They are not automatic Founder promises. Certify their real capabilities, limitations, economics and terms, then obtain the Founder launch-set decision. Procolis remains optional; DHD and unapproved providers remain hidden/experimental.

Google Sheets is an architecture candidate and requires explicit scope classification before it becomes a Stable commitment.

Each public provider capability requires dated environment/account/API evidence, failure cases, reconciliation proof, known limitations, policy review and recertification triggers.

### 10.2 Operational PWA/browser companion

- pair and enroll remote devices;
- generate role/field-filtered encrypted projections;
- partition and purge caches by tenant/member/device/shop/version;
- implement the approved daily-work surfaces from the Founder package;
- add read-only views first, then commands by risk;
- show offline, stale, queued, processing, committed, rejected and conflict states;
- exclude licensing, recovery, secrets, destructive shop administration and other prohibited administration;
- certify mobile performance, installability, accessibility, revocation and cache purge.

Operational command success means the canonical desktop committed the action.

### 10.3 Hosted storefront

- add tenant/storefront/shop/domain/media/allocation models;
- separate drafts from immutable releases;
- migrate builder data to controlled release schemas;
- build hosted render path and one template;
- implement server-authoritative durable checkout receipt;
- relay/import/reconcile with the canonical desktop;
- add domains, TLS, content-addressed media and rollback;
- deliver three materially distinct certified templates;
- retire local direct checkout only after parity and recovery evidence.

Storefront customer success means a durable tenant/shop-scoped receipt exists. The receipt remains `queued` or `pending import` until the desktop commits the canonical order; the storefront must never mislabel receipt acceptance as canonical order commitment.

### 10.4 AI privacy and action convergence

- centralize provider/model registry;
- build allowlisted privacy-classified payloads;
- test real Darija/Arabic/French/mixed-format canary corpora;
- retain deterministic extraction and typed result validation;
- record safe request metadata and quota health;
- use the bound approval service for mutations;
- preserve non-AI fallbacks and professional AR/FR/EN key setup/rotation/disconnection UX.

### Exit gate

- every public provider action is both Founder-authorized and currently live-certified;
- no accepted provider or storefront receipt is lost;
- operational remote success appears only after desktop commit;
- storefront receipt success appears only after durable cloud receipt and clearly remains pending desktop import;
- revoked devices lose sessions and sensitive caches;
- price/allocation/replay attacks fail;
- three storefront templates meet performance, mobile, RTL and accessibility targets;
- uncertified or unapproved capabilities remain hidden, experimental or explicit.

## 11. Phase 6 — Whole-product completion, beta and Stable

### Outcome

All launch-required systems converge into a coherent, accessible, recoverable and supportable SahelFlow 1.0 proven with representative sellers.

### Workstreams

#### Product and experience completion

- rebuild onboarding around capability preflight, owner, signed trial/license, shop, recovery, providers and first valid order;
- support skip/resume while keeping incomplete setup visible;
- remove remaining direct database/global-context paths;
- unify inbox persisted/live data;
- expose permission, pending, queued, retry, conflict, degradation, backup and recovery states consistently;
- complete every required capability and journey under the page-completion contract;
- complete AR/FR/EN and RTL/LTR review across desktop, PWA, storefront, founder admin and marketing/help;
- complete keyboard, screen-reader, reduced-motion, high-contrast, zoom and 1366×768 testing;
- validate work-centered navigation, data UX, forms, empty states and trust signals.

#### Performance, scale and compatibility

- exercise the certified data profiles;
- optimize query/page boundaries from packaged traces;
- bound RSC loading, background work, caches and provider concurrency;
- implement low-resource scheduling that never weakens correctness, security, durability or retention;
- validate T470 and 4 GB HDD/SSD product thresholds;
- exercise Windows compatibility cases and clearly separate functional compatibility from security certification;
- run eight-hour memory and prolonged outage tests.

#### Security, privacy and legal

- close the full threat model and residual-risk disclosure;
- produce SBOM and dependency policy;
- run secret/private-data scans and penetration testing;
- conduct independent review of identity, crypto, tenant, backup, command, storefront and release boundaries;
- complete Law 18-07 reviews and records;
- rehearse incident containment, key/session/provider revocation and diagnostic consent.

#### Continuity, support and service exit

- verify support-end metadata and five-year same-major policy;
- verify continuity reserve and 24-month coverage before accepting public payment;
- exercise provider/control-plane degradation and support cases;
- prepare planned-discontinuation notice, export and migration procedures where applicable.

#### Beta and release

- internal dogfood and disaster drills;
- controlled beta with 3–5 representative Algerian COD businesses;
- five representative live seller storefronts;
- real provider and restore incidents recorded;
- beta exit review;
- signed Windows Stable candidate and immutable evidence manifest;
- staged updater rollout, hold and forward-fix rehearsal;
- accurate public claims, legal/support material and Founder approval.

### Exit gate

- all Founder launch gates and conditional-provider decisions are met;
- no unresolved P0/P1 defect;
- every public capability and claim is evidence-linked;
- reference devices and compatibility matrix meet approved thresholds;
- replacement-install restore and service-exit portability succeed;
- Arabic/RTL, accessibility, security/privacy/legal and continuity reports pass;
- beta exit is approved;
- signed Windows artifact is promoted only after final Founder approval.

## 12. First implementation wave

After the documentation consistency audit is merged and local link/reference validation passes, start one application wave:

### `Proven Canonical Windows Desktop`

The wave combines Phase 0 with the minimum Phase 1 design needed to prove a reliable installed candidate. Its exact outcome, scope, non-goals and evidence are defined in `CURRENT_TO_TARGET_ANALYSIS.md` and must be copied into the active wave using `../operations/WAVE_TEMPLATE.md`.

Do not start Cloudflare, hosted storefront, remote PWA or provider expansion before this wave establishes repository truth, packaged runtime evidence and the explicit shop/migration boundary.