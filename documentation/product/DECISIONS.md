# SahelFlow 1.0 — Consolidated Founder Decisions

> **Status:** Authoritative consolidated product/execution register through FD-033 plus FD-045, FD-048 and FD-049; version-bound FD-034–FD-044 and FD-046–FD-047 remain in protected release authority
> **Consolidated:** 2026-07-29
> **Last amended:** 2026-08-28
> **Supersedes:** scattered Excellence Reset addenda, conflicting provisional product policies and obsolete execution overlays

This register consolidates approved product and execution decisions through FD-033, FD-045 First Revenue Certification, FD-048 source-first batching and FD-049 post-#317 signed successor authority. Version-bound FD-034–FD-044 and FD-046–FD-047 remain durable in their protected release envelopes and are summarized by active current-state documentation. Engineering
mechanisms remain subject to architecture, research, security review, provider
certification and evidence gates, but engineering may not contradict these
policies without a new numbered Founder decision.

---

## FD-001 — One complete one-time edition

- Public price is governed by FD-012: **35,000 DZD one-time**.
- One complete edition; no subscription, feature tiers, team plan, per-seat fee or
  mandatory recurring SahelFlow fee.
- The buyer receives perpetual local use of the purchased major release.
- Same-major security, compatibility, bug-fix and quality updates are included
  under FD-013.
- Future major releases may be optional paid upgrades.
- No forced upgrade or silent cross-major migration.

## FD-002 — Complete lockout after trial expiry

- Trial lasts exactly seven days.
- Expiry blocks the operational product, including desktop, API, sidecars,
  background jobs, remote clients, cached routes, integrations, storefront
  management, AI and exports.
- Only licensing, payment, extension, support and minimal diagnostics remain.
- Data is preserved and becomes accessible after valid activation.
- Paid permanent-license recovery is distinct from unpaid trial lockout.

## FD-003 — Online machine-bound signed trial

- Initial trial issuance requires the minimal online licensing service.
- One trial per privacy-preserving recognized machine identity.
- Reinstall or local-state deletion recovers the original issue/expiry; it never
  creates a new trial.
- Trial/extension signing authority is separate from the offline permanent key.
- Permanent licenses validate offline.
- Production license state uses Tauri/OS-protected storage, not browser
  localStorage.
- Clock rollback, replay, key rotation, outage and false machine mismatch require
  tested recovery.

## FD-004 — Full operational Android/browser companion with limited administration

- Installable PWA and responsive browser product are first-class operational
  companions.
- Desktop remains canonical; remote clients receive minimized projections and
  submit authenticated, versioned, idempotent commands.
- Approved work includes dashboards, orders, confirmation, AI-draft review,
  customer contact handoff, notes, customer risk/history, products/stock,
  delivery/returns, inbox preview, limited analytics, team queues and command
  status.
- Licensing, key recovery, backup restore, secrets, destructive shop
  administration and other high-risk administration remain desktop-only until
  separately certified.

## FD-005 — Hybrid Cloudflare control plane and cost discipline

- Paid Cloudflare platform is used for Workers, D1, Queues, hibernating Durable
  Objects, R2 and approved custom-hostname infrastructure.
- Desktop remains the authoritative business database.
- Cloud never becomes an undocumented full operational database replica.
- Queues and ephemeral Durable Object state are never the sole durable record.
- Private projections, commands, results, notifications and backups use
  application-layer encryption.
- Valid permanent local operation survives cloud outage.
- 20% of each base sale enters the continuity reserve: 7,000 DZD at the approved
  price.
- Maintain at least 24 months of forecast infrastructure coverage and revalidate
  provider pricing quarterly.

## FD-006 — Shared multi-tenant COD storefront and AAA standard

- One shared storefront platform, not one repository/deployment per seller.
- One hosted storefront per entitled shop with default
  `seller-slug.sahelflow.app` and certified custom-subdomain capability.
- Immutable releases, private preview, atomic publish, history and rollback.
- Desktop owns physical stock; cloud may consume only delegated storefront
  allocation.
- Checkout is durably accepted before customer success and remains pending until
  canonical desktop import.
- Three launch templates: Minimal Conversion, Visual Editorial and Bold COD
  Landing.
- North-star metric: profitable confirmed and delivered COD orders per 1,000
  qualified visitors.
- “Best” claims require comparative and production evidence.

## FD-007 — Zero-knowledge backup and disaster recovery

- Cloud backup is mandatory for public launch.
- Encrypt on desktop before upload.
- Per-license Backup Root Key, unique key per backup and envelope encryption.
- Seller recovery kit enables independent restore.
- Optional assisted recovery requires an enrolled-device share and separate
  Founder offline share.
- Neither SahelFlow nor Cloudflare alone can decrypt backups.
- Normal retention: 7 daily, 4 weekly, 6 monthly and up to 3 pinned points per
  shop.
- Base allowance: 20 GB actual encrypted backup storage shared across included
  shops.
- Trial receives one rolling encrypted point retained 30 days after expiry.
- Restore is atomic, integrity checked, migration safe and periodically tested.

## FD-008 — Hybrid commerce synchronization

- Webhooks/REST Hooks provide speed; scheduled reconciliation provides
  correctness.
- Webhooks are never the sole source of truth.
- Provider events are authenticated, deduplicated, durably stored before
  acknowledgement, encrypted before persistent private storage and processed
  idempotently.
- Checkpoints cannot advance past uncommitted or untracked failures.
- Shopify and WooCommerce use full hybrid synchronization after certification.
- YouCan uses conservative hooks plus polling and wider reconciliation until
  update/cancellation behavior is proven.
- Target normal online event-to-desktop import p95 is five seconds.
- Reconciliation must repair intentionally dropped events.
- No material incremental synchronization cost at launch scale may exceed the
  existing approved Cloudflare budget.

## FD-009 — Professional manual BaridiMob/CCP verification

- No payment gateway/API, account scraping, OCR approval, SMS-reading bot,
  credential storage or automatic permanent-license issuance.
- Payment request is structured, versioned, machine/license bound and priced
  through one authority.
- Customer evidence is supporting information only.
- Founder verifies the actual receiving-account transaction.
- Payment verification and license issuance are separate durable state machines.
- Permanent private signing key remains offline.
- Fraud, duplicate payment, reused receipt, repeated approval, amount mismatch,
  interrupted issuance and stale Founder session require explicit controls.

## FD-010 — Low-end-first Windows performance and broad compatibility

- Same product capability on low-end systems; adaptive execution may change
  timing/batching, never authority or correctness.
- Primary floor: x64 Windows, dual-core class CPU, 4 GB RAM, HDD or SSD,
  1366×768 and required runtime capabilities.
- Target functional compatibility for Windows 10 22H2, unsupported-CPU Windows
  11, Tiny11/modified builds, HDD systems, VMs and systems without TPM or Secure
  Boot where required components exist.
- Security certification remains distinct from functional compatibility.
- Founder ThinkPad T470 is mandatory reference hardware; maintain a materially
  weaker 4 GB dual-core floor device.
- Architecture changes if it cannot meet the envelope.
- Low-resource mode limits heavy concurrency, streams work, virtualizes tables,
  bounds sidecars/caches and preserves UI responsiveness.

## FD-011 — Professional multi-user team operations

- One owner plus 10 active team members.
- Two personal devices per team member.
- Individual cryptographic identities; shared staff accounts are prohibited.
- Per-shop roles, custom permissions, field access, workgroups, assignments,
  queues, comments, mentions, handovers and optional high-risk approvals.
- Local profiles and secure remote browser/PWA access.
- Immediate revocation and complete trusted-actor audit.
- No client-only authorization or silent last-write-wins.
- Architecture is tested for at least 25 active members.
- No mandatory SMS/email/SSO provider or per-seat charge.

## FD-012 — 35,000 DZD launch price

- SahelFlow 1.0 costs **35,000 DZD one-time**.
- Includes all launch-approved systems and team functionality within published
  boundaries.
- 20% continuity reserve equals 7,000 DZD per base sale.
- Existing valid earlier licenses are not retroactively charged.
- Discounts or exceptional settlements require Founder-authored adjustment and
  audit reason.
- Price comes from one versioned authority across product, payment, license,
  Founder operations, terms and support.

## FD-013 — Five-year maintenance and connected-service continuity

- Major release 1 receives at least five years of guaranteed same-major
  maintenance from official Stable launch.
- Covers security, compatibility, bugs, quality, recovery, teams, storefront,
  synchronization, licensing and SahelFlow-controlled connected services.
- Local use remains perpetual after the guarantee.
- Exact support end is shown before payment and stored in license/payment
  metadata.
- Planned material service discontinuation normally requires 12 months' notice
  and applicable export/migration support.
- The promise is financially validated before public payment.

## FD-014 — Complete-edition boundaries

Base license includes:

- 1 owner;
- 10 active team members;
- 2 devices per team member;
- 3 owner remote devices;
- 5 shops;
- 1 hosted storefront/default subdomain per shop;
- 1 certified custom subdomain per shop after certification;
- 20 GB backup storage;
- 2 GB media per storefront / 10 GB shared base media.

Up to five additional shops may be purchased, for an initial maximum of 10.
Cloud fair-use targets include up to 250,000 remote commands, 100,000
notifications, 250,000 storefront sessions and 25,000 durable COD submissions per
month per license before capacity review. Boundaries never authorize hidden
recurring fees, destructive retention or local lockout.

## FD-015 — Seller-owned Google AI Studio / Gemini model

- Seller supplies and owns the Google AI Studio Gemini key.
- Launch default is `gemini-3.5-flash`, subject to versioned provider-policy
  updates and certification.
- SahelFlow does not fund ordinary seller inference or pool normal requests
  through a shared key.
- Default `free_privacy_safe` mode does not silently send raw PII, confidential
  records, full WhatsApp histories, credentials or sensitive finance.
- Local redaction/tokenization and deterministic/manual fallback are mandatory.
- Professional AR/FR/EN setup guides privacy, restrictions, secure storage,
  testing, errors, quota, rotation and disconnection.
- Key remains in the protected desktop secret architecture.

## FD-016 — Permanent-license transfer and ownership recovery

- One authoritative Windows installation is active at a time.
- Legitimate replacement, loss, theft, upgrade, reinstall or recovery has no
  activation fee.
- Planned transfer uses verified backup, matching code, cutover, old-machine
  revocation and post-transfer health.
- Emergency recovery does not require the old machine online.
- Business ownership transfer requires protected Founder review, available
  outgoing-owner approval, identity/business evidence, new recovery setup and
  complete old-owner revocation.
- Suspicious transfers may be investigated but cannot silently destroy or strand
  valid data.

## FD-017 — 5,000 DZD one-time extra shop

- Each shop beyond five costs **5,000 DZD one-time**.
- No recurring shop fee.
- Initial maximum is 10 shops.
- Each expansion includes complete features, storefront, subdomain entitlement,
  2 GB media and 4 GB backup allowance.
- Expansion inherits the major release and support end.
- 20% reserve equals 1,000 DZD per expansion.
- Uses manual payment verification and offline signed entitlement amendment.

## FD-018 — SahelFlow 1.0 public identity and version authority

- First public release: **SahelFlow 1.0**.
- First Stable version: `1.0.0`.
- Purchased major release identifier: `1`.
- Historical v3/v4/session/design-system labels are internal history only.
- Version dimensions exist for app, database schema, cloud API, remote protocol,
  storefront engine/data, backup, license, provider and entitlement/support
  policy.
- Channels: Internal, Beta and Stable.
- One generated version manifest feeds official surfaces; CI fails on drift.
- Five-year support starts on official Stable launch, not Internal/Beta.

## FD-019 — Shared SahelFlow cloud; default seller BYOC rejected

- SahelFlow retains one shared multi-tenant Cloudflare architecture for control,
  relay, storefront and encrypted backup.
- Seller-owned Cloudflare is not the default architecture.
- BYOC was rejected because onboarding, routing, drift, security authority and
  support cost would damage reliability and seller experience.
- Shared services remain provisional until unit economics pass at 10, 100, 1,000
  and 10,000 sellers.
- Every license requires metering, quotas, rate limits, storage ceilings, abuse
  controls and cost alarms.
- The 7,000 DZD reserve must support the five-year promise; limits cannot be
  invented to hide unmeasured economics.

## FD-020 — Private Founder Console

- Separate private web control plane for signups, trials, payment review,
  licenses, entitlements, devices, transfers, usage, cost, support, incidents,
  providers and releases.
- Founder-only at launch with least-privilege role design for future trusted
  operators.
- Sensitive actions are strongly authenticated and immutably audited.
- Console accesses bounded control/support metadata only, never seller
  operational plaintext or decrypted backups.
- Permanent signing private key never enters the online console.
- Console records authorization; offline process performs permanent signing.
- Console cannot mutate canonical seller operations.

## FD-021 — Person, workspace and license are separate

- Person has durable identity independent of changeable contact/device details.
- Seller workspace is one independently licensed business and owns shops,
  members, devices, entitlements, cloud limits and support history.
- A person may own multiple workspaces.
- Each workspace requires its own base license.
- Shops belong to workspace, not directly to email, device or installation.

## FD-022 — Safe demo before the signed trial

- Prospect may explore isolated sample data without account creation.
- Demo cannot become production, accept real customer operations or bypass
  licensing.
- Verified owner and workspace are required for the real seven-day trial.
- Trial/permanent activation does not make normal local operation permanently
  internet-dependent.

## FD-023 — Founder continuous Internal-update acceptance

> **Cadence note:** FD-027 superseded one-version-per-package cadence; FD-028
> preserves milestone-based releases.

- Exact-source signed artifacts pass release, runtime and visible-UI gates before
  the Founder update channel.
- Founder installs in place without deleting AppData, observes the named
  milestone, closes and reopens.
- App-changing work is not Founder-accepted until source, signed release and
  installed observation pass.
- Documentation-only changes do not manufacture an MSI unless executable release
  authority changed.
- Internal, Beta and Stable remain separate channels.

## FD-024 — Two coding agents with GitHub as durable truth

- Active agents are ChatGPT Web Agentic Coding Agent and Desktop Agent.
- GLM, Codex Cloud and legacy handoff systems are not fallback authority.
- Either agent may implement; one owns each branch/package and the other reviews.
- Neither works directly on protected `main`.
- Desktop additionally owns installed Windows, MSI, preservation, UI and
  reference-hardware evidence.
- Actions is infrastructure and artifact authority, not a third agent.
- Heavy builds/caches remain off the storage-constrained Founder machine when
  Actions can perform them.

## FD-025 — Authenticated workspace is the first normal-launch window

- Successful launch shows no splash, fake dashboard or intermediate shell.
- The single window remains hidden only while the signed local runtime starts,
  session authority resolves and the real workspace hydrates.
- The authenticated workspace is the first visible normal surface.
- Blocked startup uses the same bounded recovery window with diagnostic code.
- Installed acceptance proves readiness-before-visibility, responsive UI, normal
  close and reopen.
- This does not weaken migration, runtime integrity, containment or recovery.

## FD-026 — Maximum AAA-candidate target and fast agentic delivery

> **Execution note:** FD-028 governs the final phase structure. The maximum
> 2026-08-27 target, full AAA depth and evidence honesty remain unless changed by
> a later Founder decision.

- Maximum target for complete Founder AAA Candidate is **2026-08-27**.
- Work proceeds as dependency-correct vertical outcomes across product, data,
  application, UI, localization, accessibility, security, recovery, diagnostics,
  tests, documentation and installed evidence.
- Fast feedback is risk-aware; heavy checks run once for coherent frozen heads;
  signed MSI runs for milestone/release risk.
- Deadline never authorizes skipped safety, preservation, AAA depth or false
  readiness.
- If the target is materially at risk, agents surface the exact critical path or
  consequential scope choice; they do not silently defer Required capability.

## FD-027 — SahelFlow Completion Operating Model v2

This decision established milestone-based Internal releases, bounded WIP,
dependency-correct parallelism, independent review, P0/P1 blocking, continuous
Arabic/RTL/accessibility/performance quality and evidence honesty.

FD-028 supersedes only FD-027’s four-session execution overlay and any Session
1–4 next-action mapping. These retained rules remain binding:

- ordinary source-complete packages may merge without version bumps;
- coherent merged outcomes receive one exact immutable Internal milestone;
- every milestone requires exact source, signed artifact, automated gates and
  Founder observation;
- at most one frozen signed candidate is in flight;
- unaccepted candidate does not freeze independent work;
- core authority WIP 1, seller vertical WIP 2, experience/Arabic WIP 1 and
  platform/performance WIP 1;
- shared contracts are serialized before dependent parallel work;
- normal branches deliver coherent outcomes and remain short;
- current frontend is not accepted as AAA;
- Arabic/RTL parity is blocking;
- P0 stops, P1 blocks, P2/P3 receive bounded follow-up;
- draft candidates publish only after every protected post-build gate;
- failed candidates remain drafts;
- Beta and Stable require explicit Founder approval;
- no AppData deletion, unsafe migration, weakened authority, false provider,
  performance or Stable claim is authorized.

## FD-028 — Final Completion Program and Research-First Quality Protocol

This decision governs SahelFlow completion from 2026-07-29 until the Founder
explicitly replaces or closes it.

### Superseded execution structure

- Supersedes FD-027’s fixed four-session overlay and every active Session 1–4
  execution map or next action.
- Supersedes any lower plan, working-memory instruction, issue wording or agent
  prompt that conflicts with the final Phase 0–9 roadmap.
- Does not weaken product scope, AAA depth, security, preservation, evidence,
  milestone release or external Stable gates.

### Binding final phases

0. Authority freeze and execution reset.
1. Canonical Golden COD business core.
2. Identity, authorization, licensing and multi-shop.
3. Durable providers, inbox, AI and automations.
4. Data protection, recovery, migrations and security.
5. Whole-product AAA UI/UX and frontend redesign.
6. Arabic, RTL and accessibility parity.
7. Performance and reliability.
8. Connected SahelFlow platform.
9. Certification, representative beta and Stable.

Each phase has an objective, current-research gate, implementation scope,
measurable exit gate and required evidence. A phase is not complete because a
session ended or a large number of files changed.

### Research-first requirement

Before every major phase, durable contract or material implementation:

- inspect exact current SahelFlow source, tests, migrations and production paths;
- research current standards, law, official OS/framework/platform/provider
  documentation and primary security evidence;
- inspect mature implementation code and relevant best-in-class operational
  products;
- include Algerian COD, Arabic/French, Windows, low-end hardware and constrained
  network reality;
- compare alternatives across correctness, migration, security/privacy,
  Arabic/RTL, accessibility, performance, recovery, maintainability and
  continuity economics;
- adopt one SahelFlow-specific decision with measurable acceptance/evidence and a
  revalidation trigger.

Generic AI recommendations, trend articles, visual inspiration, screenshots,
mock behavior, adapter presence and test count are not authority.

Research is bounded: once enough evidence exists for a safe decision,
implementation begins. Research may not become another roadmap or permanent
report collection.

### Complete vertical outcomes

- Work packages deliver named observable seller/Founder outcomes across every
  required layer.
- A new foundation must be adopted by a production vertical immediately or in
  the directly following dependency package.
- After canonical migration, competing legacy mutation paths are removed or made
  read-only after parity and recovery proof.
- No cosmetic page work can declare completion before real authority, data,
  permissions, states and actions exist.
- No feature expansion bypasses unfinished money, inventory, identity, recovery
  or Golden COD authority.

### Whole-product AAA rule

Every page and journey is completed against current researched standards for:

- information architecture and navigation;
- operational density and data UX;
- forms, bulk work and destructive ceremonies;
- complete loading, empty, permission, offline, stale, pending, conflict, error,
  retry and recovery states;
- Arabic/French/English parity and real RTL/mixed content;
- keyboard, focus, screen reader, zoom, reduced motion and responsive redesign;
- low-end rendering, navigation and mutation performance;
- trust cues for shop, actor, source, stock, money, provider and canonical commit.

Reject generic gradient dashboards, excessive decorative cards, glass effects,
fake charts, arbitrary animation, machine-sounding copy, icon-only critical
actions, compressed desktop mobile layouts and superficial RTL.

### Anti-drift and change control

- `ROADMAP.md` is the sole phase/dependency program.
- `WORKFLOW.md` is the sole research/execution/review/evidence process.
- `WORKING_MEMORY.md` contains only current truth and exact next outcome.
- Issue #164 tracks phase status and PR/evidence links; it is not another
  authority.
- No new permanent masterplan, gap report, wave, prompt, status or handoff is
  created.
- New scope requires a new Founder decision.
- P0/P1 cannot be deferred through schedule pressure.
- Public Stable cannot be declared through internal confidence.

### Definition of completion

A capability is complete only when every defined acceptance gate has objective
evidence, all known P0/P1 findings are closed and no contradiction remains between
product promise, source, installed behavior and claim.

Founder AAA Candidate requires complete Required implementation and internal
proof. Public Stable additionally requires representative Algerian seller beta,
live provider certification, independent security/privacy and Law 18-07 review,
restore/incident drills, compatibility evidence, rollout readiness and explicit
Founder promotion. These external results cannot be fabricated by accelerated
implementation.

## FD-029 — Uncompromised AAA completion and disciplined delivery

This decision clarifies how FD-028 is executed. It does not replace the Phase
0–9 program, remove Required scope or weaken any completion/evidence gate.

### Uncompromised target

- The final application targets top-tier class-AAA quality across product,
  Algerian COD correctness, data and money authority, security/privacy,
  recovery, Windows runtime, providers, UI/UX, AR/FR/EN, RTL, accessibility,
  performance, reliability, testing, diagnostics, documentation and evidence.
- Deadline or agent throughput never authorizes incomplete journeys, hidden
  legacy authority, deferred P0/P1, fabricated evidence or a lower quality bar.
- Speed comes from smaller observable packages, complete impact mapping,
  frozen shared contracts, dependency-correct sequencing, reusable fixtures,
  complete CI diagnostics and prompt closure of proven work.

### Agent use

- The Founder decides whether the Web Agent or Desktop Agent is active for
  SahelFlow work. FD-029 does not allocate simultaneous lanes.
- Material work receives a separated adversarial pass on an exact frozen head.
  It is not described as independent review; required external independent
  security, privacy, legal and provider review remains separate.

### Package, CI and session discipline

- After the current Teams package, PR #195 stops accumulating new phases.
  Licensing, native multi-shop and later outcomes use short outcome PRs from
  current protected `main`.
- Before implementation, every package inventories production consumers, direct
  tests and mocks, data/migration effects, protected fields, UI states, Arabic,
  accessibility, recovery, performance, legacy removal and required evidence.
- Draft CI reports the complete failure set with path/risk-aware parallel lanes;
  it does not force serial one-fixture-at-a-time repair. Frozen heads still pass
  the selected full checkpoint before merge.
- Sessions have one declared purpose: governance/planning, research/contract,
  implementation, frozen review/closure or installed evidence. A planning
  session performs no product implementation.
- Progress is measured by closed observable packages and evidence levels, not
  commit count, changed files, agent activity or elapsed sessions.
- The truth levels remain distinct: implemented, source-proven, artifact-proven,
  Founder-accepted and phase-closed. A lower level cannot claim a higher one.

## FD-030 — Phase 3 provider conformance closure; live accounts deferred to representative beta

This decision records the Founder’s 2026-08-04 provider-evidence boundary.

- The Founder is not currently operating an e-commerce seller account and cannot
  supply real courier or communication-provider accounts before the application
  is complete enough for representative beta testers.
- Real credentials must never be pasted into agent chat, source, tests, issues or
  evidence artifacts. They are entered only through SahelFlow’s protected secret
  interface by an authorized seller or beta operator.
- Phase 3 completion does **not** require a live real-account provider call.
  Phase 3 closes when the provider architecture is source-complete, fail-closed,
  production-built and proven by deterministic contract/conformance simulators,
  duplicate/timeout/rate-limit/ambiguity/restart/recovery tests, exact credential
  and endpoint binding, durable attempts/receipts and one canonical effect path.
- Live provider certification moves to Phase 9 representative beta and remains
  mandatory before a provider is publicly described as live-certified or relied
  upon for Stable readiness.
- Until live certification exists, SahelFlow must distinguish configured,
  source-reviewed, simulated/conformance-proven and live-certified states. A
  lower evidence state may never be displayed or documented as live-certified.
- Providers without an authoritative usable contract remain disabled. NOEST
  effects stay fail-closed until its exact provider-issued contract is available;
  DHD remains absent from runtime registration.
- Issue #201 installed hydrated-WebView evidence and real-provider evidence remain
  required at the applicable Level 3 / representative beta / Stable gates, but
  they are not Phase 3 implementation blockers.
- This supersedes only lower Phase 3 roadmap/issue wording that required real
  provider accounts or issue #201 before Phase 3 could close. It does not weaken
  FD-028/FD-029 Public Stable, representative beta, security, privacy, recovery,
  provider, Windows, Founder-acceptance or evidence-honesty requirements.

## FD-031 — One-time Internal.14 installed-evidence exception

This decision records the Founder's explicit 2026-08-10 direction for PR #228 and
Internal.14 only.

- PR #228 exact head `15e9c2e9f8e7dd2ca2ee9ddc7a49df781fcf08f6`
  passed the Phase 5, Phase 6-7, native-source, source-quality, Windows standalone,
  Tauri, Windows Rust and exact MSI-build gates.
- Installed evidence proved launch/close/reopen, authenticated hydrated WebView UI
  and a committed exact two-shop replacement restore with no restore failure code.
- The CI-only post-restore CDP acceptance client remained red. It did not prove
  page-level owner re-enrollment, protected-customer blind-index readback or
  protected-secret readback. Exact-head review also found that its broadened target
  selector was not restricted to the installed page target.
- After explicitly directing that the final run be the last repair cycle, the
  Founder authorized an administrative squash merge and signed Internal.14 release
  despite that retained evidence gap.
- Protected source `2d60e2e74109b6e03626a5ccdff727c029a34591` was
  published by signed run `31388777098`. Main protection was restored immediately.
- The missing post-restore page-level evidence remains retained in issue #214 and
  may not be described as passed, Founder-accepted, Beta-certified or Stable-ready.
- This is a one-time exception. It does not weaken future Required PR, installed,
  recovery, release, review or Stable gates and is not precedent for greenwashing
  an unknown product failure.

## FD-032 — Internal.15 Founder-only offline checkpoint; customer release still requires live trial certification

This decision records the Founder's explicit 2026-08-13 direction for
`1.0.0-internal.15` / MSI `1.0.0.15` only.

- Internal.15 may be signed and published solely as a Founder/internal-lab checkpoint
  for the Founder T470 using the existing signed permanent offline entitlement.
- The Internal.15 release artifact must package no `SF_LICENSE_SERVICE_URL`, must not
  expose an online-trial action, and must fail that endpoint closed if called directly.
- The authority is exact and version-bound: `sahelflow.version.json` must declare
  `founder-offline-only`, `FD-032`, Internal.15, the internal channel and a null owned
  host suffix. Any later version or mismatched authority fails the version/build gate.
- Trial and permanent public verification keyrings remain mandatory. Permanent signed
  activation, recovery, installation identity, AppData preservation and installed
  runtime evidence are not weakened.
- Issue #230 remains open P1. Before any release to users, SahelFlow still requires a
  verified SahelFlow-owned domain, distinct primary/recovery HTTPS trial ingress,
  protected bindings, representative Algerian fixed/mobile reachability, forced
  recovery, and signed installed customer-trial evidence.
- This checkpoint is not a customer release, online-trial certification, Founder
  acceptance, Beta or Stable. It does not change FD-003's customer trial contract.
- This supersedes only the earlier PR #245 instruction that owned-domain provisioning
  blocks the Founder-only Internal.15 checkpoint. It does not supersede the owned-domain
  requirement for user distribution and does not reuse or extend FD-031.

## FD-033 — Internal.16 completion convergence, first-revenue bootstrap and whole-product assurance

This decision records the Founder’s explicit 2026-08-13 completion directive after installing and inspecting Internal.15.

### Completion target and cadence

- Internal.16 (`1.0.0-internal.16` / MSI `1.0.0.16`) is built as the first complete-product candidate, not another partial route/subsystem checkpoint.
- The 24-hour completion/first-revenue constraint and zero paid marketing/infrastructure budget before first revenue change sequencing and economics, never the integrity/evidence bar.
- Remaining Phase 5 whole-product AAA work, Phase 6 Arabic/RTL/accessibility closure, Phase 7 performance/reliability work and full Phase 8 connected-platform implementation may converge in one dependency-correct implementation frontier.
- Execution is: exact-source whole-product reconnaissance → combined Problem Register/contracts/acceptance freeze → one large implementation wave with targeted cheap checks → one frozen deep certification/adversarial review → one consolidated repair batch → affected plus final complete proof.
- Do not run full MSI/replacement-install/eight-hour certification after every tiny edit; do not weaken or retry-away deterministic failures.

### Frozen Founder-installed Internal.15 acceptance input

The Founder explicitly closed installed discovery after Parts 1–3. These 17 P1 classes are frozen inputs to Internal.16; the implementation agent owns exhaustive sibling/root discovery during the exact-source reconnaissance:

1. `SF16-UI-001` systemic Arabic/RTL geometry and bidi parity.
2. `SF16-UI-002` Risk Engine KPI hierarchy.
3. `SF16-UI-003` shared stat-card interaction semantics.
4. `SF16-I18N-004` locale-safe money/date/number/chart formatting.
5. `SF16-INBOX-005` final AAA Inbox convergence.
6. `SF16-AI-006` final AAA AI workbench convergence.
7. `SF16-I18N-007` zero unresolved translation keys/unintended foreign system copy.
8. `SF16-PRODUCTS-008` compact product-row primary thumbnails from existing image projection.
9. `SF16-SEARCH-009` universal permission/shop-aware operational search.
10. `SF16-AI-010` end-to-end Gemini key/provider/readiness/inference lifecycle.
11. `SF16-RESP-011` deterministic responsive composition with no orphan card layouts.
12. `SF16-LAYOUT-012` eliminate accidental stretched panels/low-information dead space.
13. `SF16-CHART-013` top-tier governed decision-support chart system.
14. `SF16-PERF-014` measured startup/first-post-update performance closure.
15. `SF16-THEME-015` atomic smooth light/dark/system/preset switching.
16. `SF16-I18N-016` atomic locale commit across current and subsequently navigated route cache/prefetch.
17. `SF16-NAV-017` smarter default sidebar order plus user reorder/edit preference layered over canonical navigation authority.

Repeated manifestations of those classes do not reopen Founder screenshot discovery. Newly proven P0/P1 root dependencies may be added before the combined source+installed Problem Register is frozen.

### Phase 8 and provider direction

- Full Phase 8 remains required in Internal.16: authenticated encrypted remote projection/commands, desktop-commit success semantics, multi-tenant Cloudflare control plane, hosted storefront with durable checkout receipt and atomic publish/rollback, operational PWA/browser companion, zero-knowledge backup transport, private Founder Console and outage/replay/duplicate/rollback/abuse/rate/cost/tenant-isolation controls.
- Cloudflare Free may bootstrap first-buyer capacity when measured sufficient. Desktop remains canonical and cloud outage must not corrupt/block valid permanent local work.
- Provider hostnames do not satisfy customer-online authority. Issue #230 remains P1 for a verified SahelFlow-owned domain, distinct primary/recovery HTTPS trial ingress, protected bindings, representative Algerian fixed/mobile reachability, forced recovery and signed installed customer-trial evidence.
- Internal.16 removes NOEST/Nord et Ouest as a supported runtime provider identity and adds first-class EcoTrack Pro only from current authoritative provider-issued contracts. Historical `noest` records remain readable and source/conformance/live-certified states remain distinct under FD-030.

### AI and assurance

- AI workspace, order extraction and every model-exposed tool must be completed and benchmarked across AR/FR/EN/Darija/mixed inputs, long sessions, streaming/stop/retry, provider/quota/degraded states, proposal-bound actions, privacy/redaction, idempotency/ambiguity and T470/floor performance.
- Gemini key setup must prove recent reauthentication → official current provider/model verification → encrypted save → immediate readiness → real minimal inference/extraction with localized stable error taxonomy. Provider model comments are not trusted without current official revalidation.
- “99.99% sure” means every defined Required matrix executed at the applicable layer, zero known P0/P1 and exact final-candidate evidence; it is not a mathematical warranty against unknown defects.
- Phase 1–4 canonical business/data/security/recovery authority is protected. No guessed provider capability, fake tool/cloud/provider success, low-confidence extraction promoted as truth, gate weakening, AppData loss or Stable claim from internal confidence is authorized.
- Stable remains Phase 9 plus applicable external/representative evidence and explicit Founder promotion.

### Exact next-session boundary

The installed inspection is closed. The next session reads live protected `main` plus this decision, Current State, Roadmap, Workflow and Working Memory; creates/uses the one Internal.16 application branch from exact documentation-merged main; performs one exact-source whole-product reconnaissance; freezes the combined Problem Register/contracts/acceptance matrix; then begins the large implementation wave. It must not spend another session reconstructing Parts 1–3 from chat.

## FD-045 — Zero-budget First Revenue Certification and evidence-bounded public promises

This decision records the Founder’s explicit 2026-08-25 direction after accepting installed Internal.24 and publishing the protected provider/security checkpoint Internal.25 / FD-044.

### Commercial situation and objective

- The Founder currently has no paid-infrastructure budget, including no budget for an owned production domain, and needs first revenue from SahelFlow as quickly as integrity permits.
- Zero budget changes dependency order and bootstrap choices; it does not weaken correctness, security, privacy, recovery, provider, customer-truth or release evidence.
- The first customer must not be used as an undisclosed experiment. SahelFlow may be sold only against an exact, written, evidence-backed scope.
- This decision does not change the 35,000 DZD one-time Product price, authorize a discount/refundable reservation, define refund terms, or authorize customer distribution by itself. Those commercial choices require their own explicit decision and applicable review.

### Assurance definition

- “100% functional” means every publicly promised Required capability and journey has current applicable evidence and the exact candidate has zero known P0/P1. It does not mean unknown defects are mathematically impossible.
- “99.99% sure” retains FD-033’s definition: execute every defined Required matrix at the applicable layer, preserve one exact evidence chain, disclose residual risk and never manufacture a warranty against future third-party/provider change.
- Public claims are narrower than internal adapter inventory. Only an exact provider/action with current live certification may be exposed or marketed as supported.
- An integration can be certified for tracking while create, edit, cancellation, label or other actions remain hidden/unsupported.
- Open-source libraries and wrappers are research/comparison evidence only; they do not substitute for current provider-issued contracts or live authorized credentials.

### First Revenue Certification sequence

1. **FRC-1 — WhatsApp installed/provider evidence.** On signed Internal.25, close issue #306 only after normal installed QR, real-phone link, reopen persistence, outbound, inbound persistence/database-authoritative Inbox, representative EN/AR presentation and logout pass with redacted evidence. Include message-to-reviewed-order-draft observation when safe.
2. **FRC-2 — AI, every exposed tool and order extraction.** Freeze the current tool/corpus matrix and execute current-model/key setup, minimal real inference, typed tool schemas, privacy minimization, proposal/permission/current-state authority, success/denial/stale/duplicate/partial/timeout/quota/offline/malformed cases, and AR/FR/EN/Darija/mixed extraction through human review to exactly-one canonical order.
3. **FRC-3 — Required complete-product assurance.** Build one finite evidence ledger mapping the Product Stable capability table, Experience page-completion contract, all 27 Required journeys and Architecture invariants to exact source, automated, signed/installed, Founder and external evidence. Open repair scope only from demonstrated defects; batch related roots once and certify one frozen head.
4. **FRC-4 — commerce live certification.** Use official current contracts and official development/test environments where available for Shopify, YouCan and WooCommerce. Prove signatures/auth, webhook and reconciliation convergence, pagination, duplicate/out-of-order events, conflicts, rate limits, credential revocation, outage and recovery per public action.
5. **FRC-5 — courier live certification.** Require current provider-issued contract plus sandbox/demo or explicitly authorized real-account credentials through SahelFlow’s protected secret interface. Certify every public action independently, including ambiguity, idempotency, retry and reconciliation.
6. **FRC-6 — first paid assisted deployment decision.** Select one seller whose actual commerce/courier path is certified. Do not distribute, start a public trial, call it Beta/Stable or create an offline-customer exception until customer-access authority passes or a newer explicit Founder decision establishes a transparent bounded exception.

### AI, WhatsApp and external-provider boundaries

- WhatsApp/Baileys is an unofficial-provider dependency. Current installed behavior can be strongly certified, monitored and recovered; SahelFlow cannot promise Meta will never change or restrict the protocol.
- Free-tier Gemini certification uses synthetic/redacted inputs under the seller-owned-key privacy-safe contract. Real client PII, full WhatsApp histories, credentials, sensitive finance or raw records are never silently sent.
- Core product operation and deterministic/manual fallback remain independent of AI availability.
- Provider credentials never enter chat, source, tests, GitHub issues or evidence artifacts.
- If an authoritative contract/test environment is unavailable, the affected provider/action remains disabled, hidden or explicitly conditional.

### Domain, customer-online and first-revenue boundary

- FRC-1, FRC-2 and local/source portions of FRC-3 can proceed without an owned domain.
- A free development endpoint may support technical testing but does not satisfy business-critical customer authority.
- Issue #230 remains open/reopened P1 until a SahelFlow-owned production hostname, resilient ingress/recovery, representative Algerian-network behavior and exact installed customer-trial evidence exist.
- Internal.25 remains `founder-offline-only`. FD-045 does not authorize customer-online licensing, a paid deployment, Beta or Stable.
- If no courier/provider offers a sandbox, first live-account proof must come from an explicitly informed and authorized representative operator; it can never be silently relabeled pre-certified.

### Execution discipline and supersession

- Heavy builds, Rust, MSI and full validation run in GitHub Actions. This machine is limited to lightweight inspection/edits and the real installed/provider observations that CI cannot prove.
- A reproduced defect opens one bounded root-cause package and affected siblings, selected Level 1/2/3 gates, adversarial review and expected-head merge; deterministic failures are never retried away.
- This decision supersedes FD-033’s historical Internal.16 exact-next-session sequence and any lower document that still says Founder Internal.24 inspection is next.
- It preserves FD-030’s distinction between source conformance and live certification, FD-033’s assurance meaning, FD-044’s exact Internal.25 release authority, the Product/Experience/Architecture launch gates and every protected invariant.

## FD-048 — Batched source-first First Revenue Certification and one installed successor

This decision records the Founder’s explicit 2026-08-26 sequencing direction
after the Internal.27 real-phone observations and protected merge of PR #315.

### Problem and objective

- Rebuilding, signing, updating and physically certifying the Windows app after
  every small Inbox repair is too slow for the zero-budget first-revenue goal.
- Full certification remains required, but repeated complete MSI/installed
  cycles are not the development feedback loop.
- The objective is one coherent source frontier containing the known Required
  notification, Inbox and First Revenue Certification work, followed by one
  expressly authorized signed successor and one installed/provider evidence
  campaign.

### Binding execution order

1. Reconcile active documentation after PR #315 and preserve its exact
   source/CI/review evidence without claiming installed acceptance.
2. Implement issue #316, the Class-AAA durable Notification Center and
   WhatsApp attention-routing contract.
3. Implement issue #317, the professional WhatsApp Inbox capability ledger and
   certified message/media operational-parity waves.
4. Complete FRC-2 through FRC-5 source, contract, deterministic conformance,
   mock, official development/sandbox and available CI evidence in dependency
   order. Missing provider authority remains an explicit external blocker, not
   a fabricated pass.
5. Freeze one combined exact protected-main candidate. Only under a separate
   release-authority decision may SahelFlow build, sign and publish its next
   Internal successor.
6. Update the Founder installation once through the normal signed updater,
   preserve AppData/registry/install identity/keys/shop databases, and execute
   the applicable installed, real-phone and live-provider matrices on that
   exact candidate.

### Certification and release boundaries

- PR #315 is source-complete only. FRC-1/#306 remains open until automatic
  no-refresh inbound, persistence/reopen, representative EN/AR Inbox,
  governed status/reviewed extraction and logout are observed on the eventual
  signed successor.
- Source, mocks, browser tests and CI can close deterministic implementation
  rows but cannot close installed Windows, real-phone, live commerce/courier,
  customer-online, Beta or Stable evidence.
- #316 and #317 do not authorize broad WhatsApp feature claims. Each message,
  media and provider action remains capability-specific and live-certified.
- This batching decision is not release authority, does not authorize a first
  customer or public trial, and does not weaken #230.
- A demonstrated P0/P1 still opens a bounded dependency-correct repair.
  Related findings are batched before one frozen exact-head gate; deterministic
  red is never retried away and known blocking defects are never merged.

### Supersession

FD-048 changes FD-045’s immediate post-#315 execution order only: the next
signed/installed FRC-1 successor is deferred until the #316/#317 and FRC-2–5
source frontier is assembled. It preserves FD-045’s assurance definition,
provider truth boundaries, zero-budget integrity rules and every Product,
Experience, Architecture and release invariant.

---

## FD-049 — One signed/installed successor after #317, before FRC-2

The Founder's 2026-08-27 direction supersedes the FD-048 batching boundary for
the timing of the next installed checkpoint: once the #317 professional
WhatsApp Inbox parity package is complete on protected `main`, one combined
signed successor (Internal.28) is authorized so the Founder can install and
test the retained Inbox/media work in place. FRC-2 through FRC-5 resume only
after that installed Founder observation.

Binding boundaries:

- The successor packages exactly the protected-main frontier that exists when
  #317 completes; no speculative FRC work is bundled.
- FD-045 evidence rules are unchanged: release-authority PR, exact-head review,
  required gates, expected-head merge, signed run, in-place preserved install.
- The installed campaign still executes the retained #306 real-phone rows
  (automatic no-refresh inbound, reopen, EN/AR observation, governed status,
  reviewed extraction, logout last) plus applicable #316/#317 native rows.
- No customer-online, Beta, Stable or paid-deployment authority is created.
  #230 and the zero-budget boundary are unaffected.

## FD-050 — One signed successor (Internal.29) after FRC-2, before FRC-3

The Founder's 2026-08-28 instruction ("let's go on and start FRC-2 professionally
and when it's completed fully we make the internal.29 and test everything")
supersedes the FD-048/FD-049 sequencing for the checkpoint that follows the FRC-2
AI/tools/order-extraction source frontier: once FRC-2's evidence matrix and its
source packages are complete on protected `main`, one combined signed successor
(Internal.29) is authorized so the Founder can install in place, re-verify the
Internal.28 campaign fixes and exercise the FRC-2 rows before FRC-3 resumes.

Binding boundaries:

- The successor packages exactly the protected-main frontier that exists when
  FRC-2 completes; no speculative FRC-3+ work is bundled.
- FD-045 evidence rules are unchanged: release-authority PR, exact-head review,
  required gates, expected-head merge, signed run, in-place preserved install.
- The Internal.29 installed campaign re-verifies the Internal.28 fixes (quoted
  replies to received and sent messages, real PDF/Word document delivery, voice
  recording, permanent multi-select chat delete, compacted composer EN/AR) and
  the applicable FRC-2 matrix rows (key lifecycle, reviewed extraction,
  proposal approval/replay).
- No customer-online, Beta, Stable or paid-deployment authority is created.
  #230 and the zero-budget boundary are unaffected.

## FD-051 — One signed successor (Internal.30) packaging the two repair lines, before FRC-3

The Founder's 2026-08-30 instruction ("Cut the successor") authorizes exactly
one combined signed successor (Internal.30) packaging the protected-main
frontier that exists at cutting time: the FD-050 installed-campaign repair
line (#346–#353, `b1b5a033`) and the deep-audit remediation register (#355,
`14c059b7`), reconciled into the active documentation (#354/#356). It is cut
from the quiet post-reconciliation frontier (`720d697a`) so the audited repair
lines ship without coupling to the parallel frontend/UI work stream, which
becomes the next candidate after this successor.

Binding boundaries:

- The successor packages exactly the protected-main frontier at the release
  head; the parallel frontend/UI stream is NOT bundled and no speculative
  work is included.
- FD-045 evidence rules are unchanged: release-authority PR, exact-head review,
  required gates, expected-head merge, signed run, in-place preserved install.
- The Internal.30 installed campaign re-verifies the FD-050 campaign rows
  (B1–B5, D1, delivery-receipt enum truth on a real outbound, C1 sleep/wake
  auto-receive) plus the deep-audit register's audit-affected rows, the
  retained FRC-2 repair rows, the #306 real-phone rows and the applicable
  matrix rows.
- No customer-online, Beta, Stable or paid-deployment authority is created.
  #230 and the zero-budget boundary are unaffected.

## FD-052 — Demo data coexists with real operations (option A)

Founder directive during the FD-051 installed campaign (2026-08-31). The
blanket demo guard that made the workspace read-only while demo data was
loaded (`DEMO_MUTATION_BLOCKED` on all non-allowlisted mutations, including
real WhatsApp inbound) is removed. The Founder explicitly chose option A:
demo data **coexists** with real usage and demo rows **mix into stats and
reports** until removed.

Binding boundaries:

- Real traffic is never frozen while demo data is loaded; the courier
  effect boundary narrows to `assertNonDemoCourierIdentity` at the four
  real-effect entries so demo identities can never book or sync with real
  courier providers.
- Demo rows keep their `demo-` id tagging; isolation remains id-prefix
  based (no separate shop, no boolean flag).
- Demo removal still refuses (`DEMO_REMOVAL_REAL_DATA_PRESENT`) once real
  seller state exists — coexistence is a one-way door per shop. A removal
  strategy for cross-referenced state (e.g. real orders referencing demo
  products) is a candidate for a future numbered decision.
- The dashboards/reports mixing trade-off is accepted and disclosed in the
  settings UI copy (ar/fr/en).
- Implemented through PR #366; campaign rows R3–R6 repairs (#362–#365) are
  unrelated to this decision and ride the same successor package.

## FD-053 — One signed successor (Internal.31) packaging the campaign repair line and the six-wave stream

The Founder's 2026-08-31 directive ("they do all work for now let's continue
and make the next signed release"), issued after the FD-051 installed-campaign
evidence report, authorizes exactly one combined signed successor (Internal.31)
packaging the protected-main frontier at cutting time: the FD-051 installed-
campaign repair line (#362–#365: B3 sidecar media MIME, D1 Gemini key-format
acceptance + region mapping, B5 coded delete errors, B4 mic-failure
diagnostics), the FD-052 demo-coexist implementation (#366), and the frontend
Class-AAA six-wave stream (#359), which receives its first installed/Founder
observation on this package (delta row D3).

Binding boundaries:

- The successor packages exactly the protected-main frontier at the release
  head; certification cites the tree-identical product head (`569e921…`,
  git-diff empty against squash `f0fca29…`) and its green CI/Phase 5/Phase 6-7
  runs.
- FD-045 evidence rules are unchanged: release-authority PR, exact-head review,
  required gates, expected-head merge, signed run, in-place preserved install.
- The Internal.31 installed campaign re-verifies R3–R6 (B3/B4/B5/D1 repairs),
  R11 (FRC-2 key lifecycle, performable through the #363 gate fix) and D3
  (six-wave first observations); the retained #306 logout row executes LAST,
  after every other row is green.
- No customer-online, Beta, Stable or paid-deployment authority is created.
  #230 and the zero-budget boundary are unaffected.

## FD-054 — Demo data loads into a shop that already contains real data

Founder directive during the Internal.31 installed campaign (2026-09-01):
"yes i want the demo data even if there is real data there". This supersedes
the empty-shop-only seeding boundary that FD-052 intentionally kept, and
resolves the one-way-door removal question FD-052 deferred ("a removal
strategy for cross-referenced state is a candidate for a future numbered
decision").

Binding boundaries:

- Seeding requires only that the annual demo workspace is not already
  loaded (`canSeed = !loaded`). Seller-owned state — records, sequence and
  analytics traces, canonical command authority, phone-risk data,
  configuration, effectful report settings — no longer blocks loading.
- Demo rows keep their `demo-` id tagging; isolation remains id-prefix
  based, and they mix into stats and reports until removed, exactly as
  FD-052 already discloses.
- Demo removal no longer refuses when real seller state exists. Removal
  deletes ONLY the demo-tagged/derived graph. If real records reference
  demo records through enforced foreign keys (e.g. a real order created
  for a demo customer), removal fails closed at the database boundary:
  the transaction rolls back untouched and the seller receives
  `DEMO_REMOVAL_BLOCKED_BY_REFERENCES` naming the required action. Nothing
  real is ever deleted, reassigned or rewritten automatically. JSON-level
  references (e.g. a real storefront listing demo products) are tolerated
  as dangling and are not FK-enforced.
- The courier effect boundary is unchanged: demo identities can never
  book or sync with real courier providers (`DEMO_PROVIDER_EFFECT_BLOCKED`).
- The settings panel (ar/fr/en) discloses coexistence before loading into
  a shop with real records and asks for confirmation; the empty-shop-only
  copy is removed.
- Implemented on the Internal.32 repair line; campaign evidence rows are
  recorded only after the Founder verifies on the installed successor.
- No customer-online, Beta, Stable or paid-deployment authority is created.
  #230 and the zero-budget boundary are unaffected.

## FD-055 — One signed successor (Internal.32) packaging the round-2 campaign repair line

The Founder's 2026-09-01 directive ("merge all PRs and make the update"),
issued after the Internal.31 installed-campaign round-2 findings, authorizes
exactly one combined signed successor (Internal.32) packaging the
protected-main frontier at cutting time: the round-2 repair line #370 (R4 raw
`DOMException.name` in voice banners), #371 (B5 coded shape-400s),
#372 (B3 named sidecar rejections + `code:reason` propagation), #373 (D1
rounds 2-4: probe diagnostics, the documented `?key=` carriage, the
verify-then-store whitespace boundary), #374 (FD-054 demo coexist with real
data) and #375 (B5 client reason surfacing).

Binding boundaries:

- The successor packages exactly the protected-main frontier at the release
  head; certification cites the tree-identical product head and its green
  CI/Phase 5/Phase 6-7 runs.
- FD-045 evidence rules are unchanged: release-authority PR, exact-head
  review, required gates, expected-head merge, signed run, in-place preserved
  install.
- The Internal.32 installed campaign re-verifies the round-2 rows (R3-R6
  surfacing), R11 (FRC-2 key lifecycle — the Founder rotates the
  screenshot-exposed Gemini key first) and D3 (six-wave first observations if
  not yet recorded on Internal.31); the retained #306 logout row executes
  LAST, after every other row is green.
- No customer-online, Beta, Stable or paid-deployment authority is created.
  #230 and the zero-budget boundary are unaffected.

## FD-056 — One signed successor (Internal.33) packaging the triage-ledger quality line

The Founder's 2026-09-02 directive ("complete all the work professionally and
flawlessly then make the update"), issued after the Internal.32 release-freeze
quality line went green, authorizes exactly one combined signed successor
(Internal.33) packaging the protected-main frontier at cutting time: the
consolidated UI/UX triage line on PR #387 — the AAA message-surface repair
waves (F-01..F-03 founder findings, thread/queue/composer polish, AI trust
killers), the ledger completion waves (AI-07/08/11/14/15/16/18/19/20/22,
INB-03/11/20/25/26/29, INB-30 i18n authority, AI-25 capability explainer),
the wave-11..15 line (INB-24 voice gestures with preview-before-send, AI-21
composer screenshot extraction, INB-16 SSRF-disciplined link previews, AI-26
truthful provider turn signals, INB-28 media-sender factory, INB-11
render-window virtualization, AI-13 thumbs feedback loop, INB-12
pin/mute/archive state truth), the qs 6.16.0 security pin and the
archive-queue type-truth repair.

Binding boundaries:

- The successor packages exactly the protected-main frontier at the release
  head; certification cites the tree-identical product head and its green
  CI/Phase 5/Phase 6-7 runs.
- FD-045 evidence rules are unchanged: release-authority PR, exact-head
  review, required gates, expected-head merge, signed run, in-place preserved
  install.
- Sidecar-probe rows (INB-13/14/19/32) stay BLOCKED — no real-session probe
  capability exists in this environment; INB-27 god-hook split stays OPEN by
  recorded disposition (18-file contract churn vs release integrity).
- The Internal.33 installed campaign re-verifies the wave rows on the founder
  install (voice gestures, attachments, link previews, turn signals,
  pin/mute/archive, feedback loop); the retained #306 logout row executes
  LAST, after every other row is green. The Founder rotates the
  screenshot-exposed Gemini key before real AI usage.
- No customer-online, Beta, Stable or paid-deployment authority is created.
  #230 and the zero-budget boundary are unaffected.

## Change control

A Founder decision can be changed only by a new numbered decision that states
exactly what it supersedes. Engineering documents, code comments, agents, tests,
issues and external research cannot silently amend this register.
