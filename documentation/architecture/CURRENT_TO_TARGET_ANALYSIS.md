# SahelFlow 1.0 — Current-to-Target Analysis

> **Status:** Active source-grounded engineering truth for planning and migration  
> **Executable source baseline:** `fd9fa97dfcf96e08ffa1273070e74c4bb6db980e` (`main`, 2026-07-16)  
> **Product target:** `../product/`  
> **Experience target:** `../experience/`  
> **Engineering target:** `ENGINEERING_SPECIFICATION.md` and `SUPERSEDING_ADRS.md`  
> **Evidence rule:** Source inspection proves implementation shape. Packaged, provider, performance, security/legal, recovery, accessibility and seller readiness require their own evidence.

Later commits through the documentation consistency audit are documentation-only and do not alter the executable-source assessment. Refresh this baseline after implementation changes materially change current reality.

## 1. Executive conclusion

SahelFlow is already a broad operational application, not an empty prototype. It contains substantial Windows/Tauri, Next.js, Prisma, SQLite, order, inventory, customer, delivery, return, refund, COD, accounting, risk, automation, WhatsApp, AI, integration, storefront, multilingual UI, RTL, accessibility and test work.

The finished SahelFlow 1.0 is nevertheless **not a hardening-only continuation**. Current implementation grew around assumptions the Founder-approved target replaces:

1. one local owner and process-global active shop;
2. browser/local state as part of trial/license authority;
3. best-effort callbacks and fire-and-forget effects;
4. localhost as the boundary for PWA, storefront and connected work;
5. a readable general-purpose root key and local byte-copy backup;
6. adapter code/tests as provider support evidence;
7. source/dev-server checks as readiness proof;
8. session/v3/v4 labels and three-OS packaging as product/release truth;
9. strong visual primitives without complete state/journey depth across every surface.

The correct path is a controlled migration:

- **Keep** useful architecture and product behavior whose authority remains correct.
- **Harden** bounded implementation where the target direction is already valid.
- **Migrate** reusable behavior/UI/data behind new trusted boundaries.
- **Replace** authorities/protocols that cannot satisfy the contract.
- **Retire** obsolete code and claims only after migration, parity, references, recovery and evidence are complete.

The five structural discontinuities are:

- **trusted context** — tenant, member, device, session, shop, actor, permission and entitlement become explicit and authenticated;
- **durable effects** — audit, events, provider intents, receipts, retries, checkpoints and compensations become first-class data;
- **recovery-safe authority** — keys, trial/permanent signing, migrations, backups and replacement-machine recovery use purpose separation and tested ceremonies;
- **real connected boundaries** — cloud control, relay, PWA and storefront are bounded systems rather than localhost extensions;
- **artifact and journey evidence** — a signed installed Windows candidate, full operational states, provider certification, reference-device measurements and beta evidence govern claims.

## 2. Authority and status language

When documents overlap, use repository precedence:

1. newer explicit numbered Founder decision for the choice it expressly changes;
2. product package and Stable scope;
3. experience/capability/journey authority;
4. Engineering Specification and accepted ADRs;
5. this current-state analysis;
6. roadmap/workflow/provider registry;
7. working memory and active wave.

### Implementation status

- **Implemented and reusable** — coherent code exists and target direction remains valid; launch evidence may still be missing.
- **Partial** — useful implementation exists but required authority, state depth, recovery or proof is incomplete.
- **Unsafe** — implementation can violate a target invariant under failure, tampering, ambiguity, concurrency, recovery or cross-context use.
- **Missing** — target system is not meaningfully implemented.
- **Obsolete** — implementation/claim encodes a superseded product decision.
- **Unverified** — source exists but required packaged/provider/device/recovery/security/user evidence does not.

### Disposition

- **Keep** — preserve direction and implementation.
- **Harden** — keep implementation and close bounded safety/evidence gaps.
- **Migrate** — preserve behavior/UI/data behind a new authority/interface/model.
- **Replace** — current authority/protocol cannot satisfy the target.
- **Retire** — remove only after replacement/migration/evidence/recovery review.

### Experience scope classes

- **Required** — explicit Founder/Launch Scope commitment.
- **Conditional** — named but public only after certification.
- **Depth requirement** — state/interaction/recovery quality needed to complete required scope.
- **Candidate** — useful but not yet Founder commitment.
- **Excluded** — prohibited for SahelFlow 1.0.

Ambiguous capability defaults to Candidate, not Required.

## 3. Finished-system map

```text
Canonical Windows desktop
├── explicit installation / tenant / member / device / session / shop context
├── one encrypted operational SQLite database per shop
├── domain transactions + trusted audit + event/inbox/outbox/compensation
├── supervised local runtime and provider workers
├── protected purpose-separated keys and entitlement cache
├── all-shop migration / verified snapshot / recovery coordinator
└── encrypted relay connector
        │
        ├── bounded Cloudflare control plane
        ├── encrypted projection / operational-command relay
        ├── zero-knowledge backup object plane
        ├── hosted multi-tenant storefront and durable receipt plane
        └── operational PWA/browser companion
```

The desktop remains final authority for canonical operational business mutations. Two success models are intentionally different:

- PWA/remote **operational command success** requires desktop commit.
- Storefront **customer checkout success** requires a durable tenant/shop receipt; it remains queued/pending import until desktop canonical commit.

## 4. Current implementation map

```text
Tauri host
├── fixed localhost Next.js standalone server
│   ├── React/App Router product UI
│   ├── Server Components and API routes
│   ├── Prisma service/domain code
│   ├── per-shop SQLite selected through app-meta.json/global proxy
│   ├── selected PII encryption and encrypted Secret rows
│   ├── direct provider clients/callbacks
│   └── local storefront checkout + PWA shell
└── Bun/Baileys WhatsApp sidecar on fixed localhost endpoint
```

Reusable foundations include:

- broad seller workflows and mature multilingual/RTL component work;
- Tauri packaging, updater and bundled runtime preparation;
- Prisma schema, one SQLite file per shop and meaningful indexes;
- integer DZD and centralized metric helpers;
- order lifecycle, inventory, delivery, return/refund, COD, accounting and risk logic;
- AES-GCM, blind indexes, Ed25519 verification, PIN hashing and loopback auth primitives;
- courier/commerce adapter knowledge;
- deterministic/Gemini extraction, typed tools and non-AI fallback concepts;
- large regression suites, route boundaries, loading/error primitives and command/keyboard foundations.

The primary risk is not absence of code. It is visible functionality resting on uneven authority, state semantics, failure guarantees and evidence.

## 5. Comprehensive gap matrix

| Area | Current state | Finished SahelFlow 1.0 | Gap / disposition | Closure phase |
|---|---|---|---|---|
| Product/version authority | Product docs say 1.0; package/Cargo/Tauri and history use 4.x/session labels | Generated product/app/build/schema/protocol authority | **Unsafe — replace** | 0 |
| Documentation flow | Rich active docs plus stale historical/read-order drift | Explicit precedence, scope classes, current changelog and validated links | **Corrected semantically; local link scan pending** | 0 |
| CI/repository verification | Workflow exists; Actions fails before steps; undefined `sf-verify` | Clean-checkout binding checks and retained results | **Unsafe/unverified — repair** | 0 |
| Release | Push/tag-before-proof and unsupported OS targets | Artifact-first signed Windows candidate promotion | **Unsafe — replace** | 0–1 |
| Windows runtime | Packaged child processes on fixed endpoints with partial supervision | Authenticated dynamic lifecycle, readiness, crash recovery, compatibility guidance | **Partial/unsafe — migrate** | 1A |
| Shop isolation | Separate files; global active-shop proxy/fallback | Explicit trusted `ShopContext`, atomic registry, no fallback | **Partial/unsafe — keep files, replace routing** | 1B |
| Migrations | `db push`, default-path assumptions, broad error baselining, no all-shop coordinator | Append-only all-shop journaled backup-gated migration | **Unsafe — replace** | 1B |
| PII/data encryption | Useful field AES-GCM and blind indexes | Complete classified inventory, context/version binding and recoverability | **Partial — harden/migrate** | 1–2 |
| Root/secrets | Readable general keyfile; Secret rows | OS-protected root and wrapped purpose/shop keys | **Unsafe — replace** | 2 |
| Backup/recovery keys | No per-license Backup Root Key/per-backup DEK or assisted shares | Independent recovery + two-share assisted recovery | **Missing** | 2–4 |
| Local auth | PIN/session and setup bypass | Tenant/member/device/session identity and fail-closed bootstrap | **Partial/unsafe — migrate** | 2 |
| Teams/work | Free-form assignee/team strings | Roles/fields, workgroups, queues, assignments, comments, mentions, handovers, approvals | **Missing** | 2–3 |
| Trial/licensing | Browser self-issuance/local authority; scattered gates | Online trial-only signing, complete lockout, offline permanent signing, entitlements | **Unsafe/missing — replace around reusable Ed25519** | 2 |
| Payment/founder admin | No professional payment/issuance/transfer/admin state machines | Manual actual-account verification separated from offline issuance | **Missing** | 2–4 |
| Order/catalog/customer core | Broad services/UI and meaningful transaction logic | Same capabilities under explicit actor/shop/permission/event authority | **Reusable — migrate/harden** | 3 |
| Inventory | Direct stock with useful lifecycle effects | Reservation/adjustment ledger, replay safety, exact compensation | **Partial — migrate** | 3 |
| Return/refund | Rich UI/logic; related facts can commit separately; reversal partly heuristic | Exact append-only money/stock/status/accounting compensation | **Unsafe — redesign preserving UI/history** | 3 |
| COD/accounting | Collected/remitted fields, metrics and UI | Remittance/discrepancy ledger with governed corrections | **Partial — keep/migrate** | 3 |
| Audit | AuditLog/OrderChange; free-form actors; best-effort writes | Trusted actor/session/device and atomic business audit | **Partial/unsafe — migrate** | 3 |
| Automation | Conditions/steps/dry-run/retries; direct dispatch | Durable outbox, idempotent workers, approvals, receipts, failure queue | **Unsafe — preserve authoring, replace execution** | 3 |
| WhatsApp | Real sidecar/QR/chats/send/events; volatile/incomplete history/recovery | Durable encrypted ingress/egress/history/replay and certified lifecycle | **Partial/unsafe — migrate** | 3/5 |
| Commerce | Polling/paging/dedup/update knowledge | Hybrid durable inbox + reconciliation + contiguous checkpoints | **Unsafe — preserve adapters, replace authority** | 3/5 |
| Couriers | Candidate adapters/tests | Founder-selected public launch set with capability-specific live certification | **Candidate/unverified — certify then decide** | 5 |
| AI | Regex/Gemini/schemas/tools and partial redaction | Central policy, allowlisted data, real corpus, request receipts, bound approval | **Partial/unsafe — migrate** | 3/5 |
| Google Sheets | Functional export knowledge | Only if Founder classifies scope; then permission/privacy/idempotency/live proof | **Candidate/unverified** | 5 or later |
| PWA | Cached local shell dependent on desktop server | Authenticated remote companion with projections/commands/revocation/states | **Obsolete boundary — rebuild** | 4–5 |
| Storefront | Local builder/view/checkout tied to active DB | Hosted tenant release/allocation/durable receipt/import/reconciliation | **Useful prototype, unsafe target boundary — migrate/replace** | 4–5 |
| Cloud control/relay | Missing | Bounded encrypted identity/control/relay plane | **Missing** | 4 |
| Backup | Active-shop local byte copy/best-effort checkpoint | All-shop zero-knowledge retention, trial point, recovery drills | **Unsafe/missing — replace** | 2/4 |
| Onboarding | Optional skippable wizard | Capability preflight, owner/trial/shop/recovery and guided first valid order | **Partial — redesign after authorities** | 2/6 |
| Experience system | Strong tokens/primitives/RTL/responsive patterns; incomplete second-order state depth | Binding page-complete journeys, shared patterns, exact authority/failure/trust states | **Strong base, incomplete/unverified — keep/harden** | Continuous/6 |
| Performance | Query/index work; heavy server loads and multi-process runtime | Founder dataset and 4 GB/T470 packaged thresholds | **Unverified — measure then optimize** | 0 onward |
| Windows compatibility | No repeatable capability matrix | Win10 22H2/Win11/modified/VM/HDD capability evidence | **Unverified** | 0–6 |
| Security/privacy/legal | Useful crypto/auth/Sentry/redaction pieces | Complete threat models, key/tenant boundaries, Law 18-07 and independent review | **Partial/unverified** | Continuous/6 |
| Continuity economics | Product decisions documented, no executable cost/reserve process | 20% reserve planning, 24-month coverage, quarterly review, service-exit readiness | **Missing** | 4/6 |
| Testing/evidence | Large Vitest/Playwright source suites; E2E dev-server and mocked boundaries | Risk-based CI + installed/provider/recovery/security/experience/beta evidence | **Substantial but insufficient — preserve/expand** | 0 onward |

## 6. Gap analysis by system level

### 6.1 Product, scope and experience

The Founder package is unusually specific and internally aligned: product identity, one-time price, support, entitlements, teams, PWA, storefront, backup, trial, AI, providers, low-end and launch evidence are explicit.

The restored experience package adds the missing depth:

- quiet-power design thesis;
- 4px spacing, typography/density/motion/color/focus foundations;
- Arabic/RTL and accessibility requirements;
- data-table/forms/empty/error/degraded/command interaction patterns;
- complete capability atlas;
- universal state vocabulary and 27 journeys;
- page-completion and visual-review contracts.

Remaining implementation risk is not vague vision. It is failure to trace each wave to its scope class, capability, journey, experience dimensions and target invariants. The revised Wave Template and Coding Workflow now enforce that mapping.

### 6.2 Runtime, packaging and Windows capability

**Exists:** Tauri packages Next.js, Prisma resources, runtime and WhatsApp sidecar; updater verification concepts exist.

**Gaps:** fixed endpoints; incomplete per-launch auth/readiness; missing blocking recovery; default migration paths; unsupported OS release targets; publish-before-proof script; no installed compatibility matrix.

**Target:** artifact-first Windows candidate, supervised authenticated local services, precise readiness/failure UX and capability-based compatibility evidence.

### 6.3 Data authority, shops and migrations

**Exists:** useful one-file-per-shop model and indexed schema.

**Gaps:** implicit shop routing, fallback, public/background active-shop coupling, `db push`, default `dev.db` migration, broad failure classification and no all-shop verified backup gate.

**Target:** explicit `ShopContext`, atomic registry, all-shop preflight/journal/backup/recovery and readable reports.

### 6.4 Keys, licensing and recovery

**Exists:** AES-GCM, blind index, Ed25519 verification, PIN hashing and encrypted Secret foundations.

**Gaps:** one readable root, no purpose separation, no per-license backup root/per-backup DEK, no independent/assisted recovery, self-issued trial, no separate trial/permanent keys, no professional payment/issuance state machines.

**Target:** protected installation root, wrapped purpose keys, trial-only online signing, offline permanent signing, independent kit, two-share assisted recovery and replacement-machine proof.

### 6.5 Identity, teams and authority

**Exists:** local owner PIN/session checks, free-form workflow fields and broad UI.

**Gaps:** no tenant/member/device/shop policy context, field authorization, invitation, workgroup, queue, comments, mentions, handovers or bound approval authority.

**Target:** trusted principals/policy plus full team-work depth and immediate revocation. UI hiding is never authorization.

### 6.6 Domain/financial correctness

**Exists:** deep order, stock, delivery, return, refund, COD, expense, risk and metric code.

**Gaps:** related writes/effects/audits can cross transaction boundaries; best-effort dispatch; heuristic reversal; uneven derived definitions.

**Target:** one transaction kernel and exact append-only facts, migrated slice by slice while preserving valuable UI/history.

### 6.7 Providers and connected effects

**Exists:** substantial WhatsApp, commerce, courier, Sheets and Gemini knowledge.

**Gaps:** direct calls, volatile callbacks, ambiguous provider POST success, unsafe cursor advancement, no universal attempts/receipts/dead letters and no live certifications.

**Target:** durable inbox/outbox framework and scope/certification registry. Named commerce providers are conditional; couriers and Sheets remain candidates until Founder classification.

### 6.8 Cloud, PWA, storefront and backup

**Exists:** responsive UI, local PWA shell, local builder/checkout and backup controls.

**Gaps:** no bounded cloud identity/control, encrypted relay, remote identity/commands, hosted tenancy/releases/allocation, durable public receipt or zero-knowledge remote backup.

**Target:** build Phase 4 foundations, then migrate PWA and storefront assets. Preserve the semantic distinction between operational command commit and public receipt acceptance.

### 6.9 UX, accessibility and low-end

**Exists:** meaningful design system, translations, RTL, responsive components, command palette, keyboard patterns, loading/error primitives and broad workflows.

**Gaps:** not every page uses shared patterns; inconsistent state depth; live/persisted data realities; incomplete educational states/trust signals; no packaged Arabic/FR/accessibility/low-end proof.

**Target:** use the Experience Constitution continuously, not as final redesign. Complete states/journeys while foundations migrate, and measure on packaged Windows.

### 6.10 Verification, legal, operations and continuity

**Exists:** large source tests, logging, optional Sentry, updater and historical execution records.

**Gaps:** Actions startup failure; undefined command; no binding packaged/provider/recovery/compatibility gates; no independent review/Law 18-07 report; no cost reserve/coverage operational proof; no representative beta.

**Target:** exact commit/artifact evidence, current changelog, certification records, drills, legal/security reports, continuity validation and seller beta.

## 7. Target metrics and current proof

### 7.1 Commercial and entitlements

| Metric | Target | Current proof |
|---|---:|---|
| One-time complete price | 35,000 DZD | Documented; executable payment/entitlement missing |
| Included/extra shops | 5 + up to 5 at 5,000 DZD | Local count only; signed slot accounting missing |
| Team | 1 owner + 10 active members | Trusted team missing |
| Devices | 2/member; 3 owner remote | Missing |
| Same-major continuity | 5 years from Stable | Documented; enforcement/economics missing |
| Storefront | 1 per entitled shop | Local config; hosted entitlement/allocation missing |
| Backup | 20 GB base + 4 GB/extra shop; 3 pinned/shop | Cloud/recovery missing |
| Continuity reserve | 20% of sale; 24-month forecast | Process/evidence missing |

### 7.2 Data profiles

| Profile | Target per active shop | Current proof |
|---|---|---|
| 4 GB floor | 50k orders, 250k items, 50k customers, 5k products, 25k variants, 50k conversations, 250k messages, ~2 GB DB | Schema/index work; no packaged certification |
| Recommended high volume | 100k orders, 500k items, 75k customers, 10k products, 50k variants, 100k conversations, 1m messages, 2m history/effect records, ~5 GB DB | Not certified |

### 7.3 Desktop thresholds

| Metric | Founder target | Current proof |
|---|---:|---|
| Cold usable shell, floor SSD/HDD | ≤15 s / ≤25 s p95 | Missing packaged measurement |
| T470 cold launch | ≤8 s p95 | Missing |
| Visible interaction response | ≤100 ms | Source work only |
| Usable page | ≤1.5 s p95 | Missing target-dataset trace |
| Indexed search floor/T470 | ≤750 ms / ≤350 ms p95 | Missing |
| Ordinary local mutation floor/T470 | ≤1 s / ≤500 ms p95 | Missing |
| Working set | ≤750 MB with WhatsApp/no heavy job | Missing |
| Eight-hour growth | No sustained growth | Missing |

The Founder thresholds are the launch acceptance authority. Stricter engineering goals may exist only as clearly labeled internal optimization goals.

### 7.4 Storefront/connected thresholds

| Metric | Target | Current proof |
|---|---:|---|
| LCP/INP/CLS | ≤1.8 s p75 / ≤150 ms p75 / ≤0.05 | No hosted storefront |
| Checkout API | ≤500 ms p95 approved regional tests | Missing |
| Availability objective | ≥99.95% | Missing |
| Durable receipt before customer success | 100% | Current local boundary insufficient |
| Duplicate canonical effect | 0 | No durable protocol |
| Cross-tenant leakage | 0 | No tenant system |
| Price mismatch | 0 | Hosted proof missing |
| Event-to-desktop import | 5 s p95 normal online target | No durable relay |
| Fair-use validation | 250k commands, 100k notifications, 250k sessions, 25k durable COD submissions/license/month | No cloud platform |

### 7.5 Stable evidence

- zero unresolved P0/P1;
- binding clean-checkout CI;
- signed Windows artifact and exact manifest;
- supported Windows capability matrix;
- all-shop migration/restore and independent/assisted recovery;
- Founder-approved current provider certifications;
- independent security/privacy and Law 18-07 review;
- complete capability/journey/page accessibility/RTL evidence;
- T470/4 GB thresholds;
- 3–5 representative businesses and five live storefronts;
- continuity economics/support/service-exit readiness.

None is currently proven at Stable level.

## 8. Root-cause map

1. **Implicit global context** — early convenience cannot support background jobs, teams, remote commands or tenancy.
2. **Business state without durable effect state** — correct local transactions still lose/audit/retry external consequences unevenly.
3. **One app boundary across incompatible trust zones** — seller UI, public checkout, PWA, providers and background work share local authority.
4. **Recovery added after storage/security choices** — encryption, trial, migration and backup lack a unified replacement-machine design.
5. **Provider code treated as scope/certification** — source/mocks capture knowledge but not Founder permission or live behavior.
6. **Strong visual shell without universal operational states** — quality primitives exist, but complete failure/recovery/trust behavior is inconsistent.
7. **Session-era completion language** — historical implementation/test progress was misread as product/release readiness.

## 9. Preservation and replacement strategy

### Keep and harden

- Next.js/React UI, design tokens and shared components;
- Tauri Windows host and signed-updater mechanism;
- Prisma and independent shop SQLite files;
- integer DZD and canonical metric helpers;
- broad domain workflows and translations/RTL/responsive foundations;
- regression suites that protect current behavior;
- AES-GCM, blind-index and Ed25519 primitives after purpose/context review.

### Migrate

- server/sidecar behind supervised authenticated runtime;
- services behind explicit shop/actor/permission context;
- AuditLog/OrderChange into universal trusted transaction records;
- automation authoring into durable workers;
- candidate adapters into the provider framework;
- local builder into hosted draft/release schemas;
- owner PIN into tenant/member/device identity;
- secrets into protected key hierarchy;
- backup UI into verified recovery engine;
- existing E2E paths into installed-candidate/journey evidence.

### Replace

- global active-shop write authority and silent fallback;
- production `db push`/current migration runner;
- plaintext general root key;
- browser self-issued trial/trusted license state;
- shared/online permanent signing authority;
- fire-and-forget effects and heuristic reversal;
- polling watermark as sync authority;
- local direct public checkout and shell-only PWA boundary;
- active-shop byte-copy backup;
- push/tag-before-build and multi-platform Stable workflow.

### Retire after proof

- unsupported/unapproved provider claims;
- v3/v4/session readiness/version claims;
- duplicate transition ledgers/handoffs;
- direct legacy APIs/models only after data/reference/recovery review;
- one-off UI patterns only after compatible shared-pattern migration.

## 10. Active documentation system

### Product authority

1. `product/LAUNCH_CONSTITUTION.md`
2. `product/FOUNDER_DECISIONS.md`
3. `product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md`

### Experience authority

1. `experience/EXPERIENCE_FRONTEND_CONSTITUTION.md`
2. `experience/FUNCTIONAL_CAPABILITY_ATLAS.md`
3. `experience/JOURNEY_STATE_ATLAS.md`

### Engineering authority

1. `architecture/ENGINEERING_SPECIFICATION.md`
2. `architecture/SUPERSEDING_ADRS.md`
3. `architecture/CURRENT_TO_TARGET_ANALYSIS.md`
4. `architecture/IMPLEMENTATION_ROADMAP.md`
5. `architecture/CODING_WORKFLOW.md`
6. `architecture/PROVIDER_CONTRACT_REGISTRY.md`

### Operations, research and history

- `operations/` coordinates current work and cannot redefine product/experience/engineering authority.
- `research/` is reference material requiring revalidation and explicit adoption.
- `CHANGELOG.md` records the current SahelFlow 1.0 migration; session/v3/v4 chronology is legacy history.
- Component-local notes describe their boundary only and cannot make broader scope/readiness claims.

Do not create parallel product vision, capability, journey, contradiction, status, repository-map, reuse-plan or session-handoff authorities.

## 11. Solid work path

1. Prove repository, documentation and packaged truth.
2. Establish trusted runtime, shop and migration authority.
3. Establish identity, entitlement, key and local recovery authority.
4. Make business writes, team work and connected effects durable.
5. Build bounded control, relay and zero-knowledge backup with legal/economic controls.
6. Migrate/certify Founder-approved providers, PWA and storefront.
7. Complete every required capability/journey/experience and prove compatibility, performance, security, recovery and support.
8. Complete controlled beta and publish Stable only from evidence.

## 12. First implementation wave — Proven Canonical Windows Desktop

### Outcome

**A seller can install one internal Windows candidate, start it reliably, open only the intended shop and receive a clear recoverable failure instead of silent fallback or partial startup. A clean checkout and exact artifact manifest prove the result.**

### Scope

- repair executable CI and the undefined `sf-verify` path;
- generate one version/evidence manifest and remove active 4.x/1.0 drift;
- produce Windows-only internal candidate without publication;
- validate runtime/server/sidecar/resource startup and readiness;
- define/start explicit shop-context and atomic-registry migration;
- replace broad migration failure baselining with exact fail-closed behavior;
- run local Markdown/link/reference checks and generated repository/page/component/token inventories;
- add clean-install, missing-resource, occupied-endpoint, corrupt/missing-registry and migration-failure tests;
- capture T470 and 4 GB no-optimization baseline;
- identify governing capability/journey/experience requirements in the active wave.

### Non-goals

- no Cloudflare implementation;
- no hosted storefront or remote PWA;
- no provider expansion;
- no broad product-page redesign;
- no deletion of runtime/data authorities before compatible migration exists.

### Exit evidence

- current protected branch and clean-checkout CI;
- exact candidate/source/version/artifact manifest;
- installed/internal-signed Windows artifact;
- clean-install startup/readiness report;
- failure-mode report for missing resources, endpoint, registry and migration;
- local documentation link/reference report;
- first T470/4 GB trace;
- reviewed next-wave design for explicit shop authority and all-shop migration.

This wave converts the repository from substantial source code into a measured, recoverable platform for the foundational migration.