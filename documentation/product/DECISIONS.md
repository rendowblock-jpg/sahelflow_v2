# SahelFlow 1.0 — Consolidated Founder Decisions

> **Status:** Authoritative Founder-approved register
> **Consolidated:** 2026-07-29
> **Supersedes:** scattered Excellence Reset addenda, conflicting provisional product policies and obsolete execution overlays

This register consolidates approved product and execution decisions. Engineering
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

---

## Change control

A Founder decision can be changed only by a new numbered decision that states
exactly what it supersedes. Engineering documents, code comments, agents, tests,
issues and external research cannot silently amend this register.
