# SahelFlow 1.0 — Consolidated Founder Decisions

> **Status:** Authoritative founder-approved register
> **Consolidated:** 2026-07-27
> **Supersedes:** scattered Excellence Reset addenda and conflicting provisional product policies

This register consolidates the approved product decisions. Detailed engineering mechanisms remain subject to the Architecture Reset, security review, provider certification, and evidence gates, but engineering may not contradict these product policies without a new founder decision.

---

## FD-001 — One complete one-time edition

- Public price is governed by FD-012: **35,000 DZD one-time**.
- One complete edition; no subscription, feature tiers, team plan, per-seat fee, or mandatory recurring SahelFlow fee.
- Buyer receives perpetual local use of the purchased major release.
- Same-major security, compatibility, bug-fix, and quality updates are included under FD-013.
- Future major releases may be optional paid upgrades.
- No forced upgrade or silent cross-major migration.

## FD-002 — Complete lockout after trial expiry

- Trial lasts 7 days.
- Expiry blocks the entire operational product, including desktop, API, sidecars, background jobs, mobile, cached routes, integrations, storefront management, AI, and exports.
- Only the dedicated licensing/payment/extension/support/minimal-diagnostic shell remains.
- Data is preserved untouched and becomes accessible after valid activation.
- Paid permanent-license recovery is separate from unpaid trial lockout.

## FD-003 — Online machine-bound signed trial

- Initial trial issuance requires the minimal online licensing service.
- One trial per privacy-preserving recognized machine identity.
- Reinstall or local-state deletion recovers the original issue/expiry dates; it never creates a new trial.
- Trial/extension signing key is separate from the offline permanent-license key.
- Permanent licenses validate offline.
- Production license state uses a Tauri/OS-protected storage abstraction, not browser localStorage.
- Clock rollback, replay, key rotation, service outage, and false machine mismatch require tested recovery paths.

## FD-004 — Full operational Android/browser companion with limited administration

- Installable PWA and responsive browser product are first-class operational companions.
- Desktop remains canonical; remote clients receive minimized projections and submit authenticated, versioned, idempotent commands.
- Approved workflows include dashboards, orders, confirmation, AI-draft review, customer contact handoff, notes, customer risk/history, products/stock, delivery/returns, inbox preview, limited analytics, team queues, and command status.
- Licensing, key recovery, backup restore, secrets, destructive shop administration, advanced diagnostics, and other high-risk administration remain desktop-only until separately certified.

## FD-005 — Hybrid Cloudflare control plane and cost discipline

- Paid Cloudflare platform is used for Workers, D1, Queues, hibernating Durable Objects, R2, and approved custom-hostname infrastructure.
- Desktop remains the authoritative business database.
- Cloud must not become an undocumented full business-database replica.
- Queues and ephemeral Durable Object state are never the sole durable record.
- Private projections, commands, results, notifications, and backups use application-layer encryption.
- Valid permanent local desktop operation must survive cloud outage.
- 20% of every sale enters a continuity reserve; at 35,000 DZD this is 7,000 DZD.
- Maintain at least 24 months of forecast infrastructure coverage; revalidate provider pricing quarterly.

## FD-006 — Shared multi-tenant COD storefront and AAA standard

- One shared storefront platform, not one deployment/repository per seller.
- One hosted storefront per entitled shop with default `seller-slug.sahelflow.app` hostname and certified custom-subdomain capability.
- Immutable releases, private preview, atomic publish, history, and rollback.
- Desktop owns physical stock; cloud may consume only delegated storefront allocation.
- Checkout is durably accepted before customer success and remains pending until canonical desktop import.
- Three distinct launch templates: Minimal Conversion, Visual Editorial, Bold COD Landing.
- North-star metric: profitable confirmed and delivered COD orders per 1,000 qualified visitors.
- `Best` claims require comparative and production evidence.

## FD-007 — Zero-knowledge backup and disaster recovery

- Mandatory cloud backup for public launch.
- Encrypt on desktop before upload.
- Per-license Backup Root Key; unique key per backup; envelope encryption.
- Seller recovery kit enables independent restore.
- Optional assisted recovery requires both an enrolled-device share and separate founder offline share.
- Neither SahelFlow nor Cloudflare alone can decrypt backups.
- Normal retention: 7 daily, 4 weekly, 6 monthly, and up to 3 pinned points per shop.
- Base backup boundary: 20 GB actual encrypted storage shared across included shops.
- Trial receives one rolling encrypted cloud point, retained 30 days after expiry.
- Restore must be atomic, integrity-checked, migration-safe, and periodically tested.

## FD-008 — Hybrid commerce synchronization

- Webhooks/REST Hooks provide speed; scheduled reconciliation provides correctness.
- Webhooks are never the sole source of truth.
- Provider events are authenticated, deduplicated, durably stored before acknowledgement, encrypted before persistent private storage, and processed idempotently.
- Checkpoints cannot advance past uncommitted or untracked failures.
- Shopify and WooCommerce: full hybrid after certification.
- YouCan: conservative new-order hooks plus polling and wider reconciliation until update/cancellation hooks are proven.
- Target normal online event-to-desktop import p95 is 5 seconds; reconciliation must repair intentionally dropped events.
- No material incremental synchronization cost at launch scale beyond the existing Cloudflare budget.

## FD-009 — Professional manual BaridiMob/CCP verification

- No payment gateway/API, account scraping, OCR approval, SMS-reading bot, credential storage, or automatic permanent-license issuance.
- Payment request is structured, versioned, machine/license bound, and priced through one authority.
- Customer evidence is supporting information only.
- Founder verifies the actual receiving-account transaction.
- Payment verification and license issuance are separate durable state machines.
- Permanent private signing key remains offline.
- Fraud, duplicate payment, reused receipt, repeated approval, amount mismatch, interrupted issuance, and stale founder session require explicit controls.

## FD-010 — Low-end-first Windows performance and broad compatibility

- Same product capability on low-end systems; adaptive execution may change timing/batching, not feature ownership or correctness.
- Primary floor: x64 Windows, dual-core class CPU, 4 GB RAM, HDD or SSD, 1366×768, required runtime capabilities.
- Target functional compatibility for Windows 10 22H2, unsupported-CPU Windows 11, Tiny11/modified builds, HDD systems, VMs, and systems without TPM/Secure Boot where required components exist.
- Security certification remains distinct from functional compatibility.
- Founder ThinkPad T470 is a mandatory reference device; maintain a materially weaker 4 GB dual-core floor machine.
- Architecture must change if it cannot meet the envelope.
- Low-resource mode limits heavy concurrency, streams work, virtualizes tables, bounds sidecars/caches, and keeps UI responsive.

## FD-011 — Professional multi-user team operations

- One owner plus 10 active team members in the complete edition.
- Two personal devices per team member.
- Individual cryptographic identities; shared staff accounts prohibited.
- Per-shop roles, custom permissions, field-level access, workgroups, assignments, queues, comments, mentions, handovers, and optional high-risk approval workflows.
- Local profiles and secure remote browser/PWA access.
- Immediate revocation and complete trusted-actor audit.
- No client-only authorization or silent last-write-wins.
- Architecture must be tested for at least 25 active members.
- No new mandatory SMS/email/SSO provider or per-seat charge.

## FD-012 — 35,000 DZD launch price

- SahelFlow 1.0 costs **35,000 DZD one-time**.
- Includes all launch-approved systems and team functionality within published boundaries.
- 20% continuity reserve equals 7,000 DZD per base sale.
- Existing valid earlier licenses are not retroactively charged.
- Discounts or exceptional settlements require founder-authored adjustment records and audit reasons.
- Price comes from one versioned authority across UI, payment request, founder panel, license metadata, terms, and support material.

## FD-013 — Five-year maintenance and connected-service continuity

- Minimum five-year guarantee from the public Stable launch date of the purchased major release.
- Covers same-major security, compatibility, bug, quality, recovery, team, storefront, synchronization, licensing, and SahelFlow-controlled connected-service continuity.
- Local use remains perpetual after the guarantee.
- Exact support-end date is shown before payment and recorded in license/payment metadata.
- Planned material service discontinuation after the guarantee normally requires 12 months' notice and applicable exports/migration support.
- Must be financially validated before public payment.

## FD-014 — Complete-edition boundaries

Base license includes:

- 1 owner;
- 10 active team members;
- 2 devices per team member;
- 3 owner remote devices;
- 5 shops;
- 1 hosted storefront and default subdomain per shop;
- 1 certified custom subdomain per shop after certification;
- 20 GB backup storage;
- 2 GB media per storefront / 10 GB shared base media allowance.

- Initial maximum after expansions is 10 shops.
- Cloud fair-use targets include up to 250,000 remote commands, 100,000 notifications, 250,000 storefront sessions, and 25,000 durable COD submissions per month per license before capacity review.
- Boundaries do not authorize deletion, local lockout, or hidden recurring usage fees.

## FD-015 — Seller-owned Google AI Studio / Gemini model

- Seller supplies and owns the Google AI Studio Gemini API key.
- Launch default model: `gemini-3.5-flash`, subject to versioned provider-policy updates.
- SahelFlow does not fund normal inference or pool requests through a shared SahelFlow key.
- Free-tier availability and limits remain controlled by Google.
- Default `free_privacy_safe` mode does not silently send raw PII, confidential records, full WhatsApp histories, credentials, or sensitive finance data.
- Local redaction/tokenization and deterministic/manual fallback are mandatory.
- Professional AR/FR/EN wizard guides key creation, privacy, restrictions, secure storage, test, errors, quota, rotation, and disconnection.
- Key remains only in the authoritative protected desktop secret architecture.

## FD-016 — Permanent-license transfer and ownership recovery

- One authoritative Windows installation active at a time.
- Legitimate hardware replacement, loss, theft, upgrade, reinstall, or recovery is included without activation fee.
- Planned transfer uses backup verification, matching-code confirmation, cutover, old-machine revocation, and post-transfer health checks.
- Emergency recovery does not require the old device online.
- Business ownership transfer requires protected founder review, outgoing-owner approval where available, identity/business evidence, new recovery configuration, and complete revocation of old owner access.
- Repeated suspicious transfers may be investigated but cannot silently destroy data or strand a valid customer.

## FD-017 — 5,000 DZD one-time extra shop

- Each shop beyond the five included slots costs **5,000 DZD one-time**.
- No recurring shop fee.
- Initial maximum is 10 shops total.
- Each expansion includes one shop, complete features, storefront, default/custom-subdomain entitlements, 2 GB media, and 4 GB backup allowance.
- Expansion inherits the existing major release and support-end date.
- 20% continuity reserve equals 1,000 DZD per expansion.
- Uses manual payment verification and offline signed entitlement amendment.

## FD-018 — SahelFlow 1.0 public identity and version authority

- First public release: **SahelFlow 1.0**.
- First stable app version: `1.0.0`.
- Purchased major release identifier: `1`.
- Historical v3/v4/session/design-system labels are internal history only.
- Separate version dimensions exist for app, database schema, cloud API, mobile/team protocol, storefront engine, storefront data schema, backup format, license payload, provider contracts, entitlement policy, and support policy.
- Release channels: Internal, Beta, Stable.
- One generated version manifest feeds all official surfaces; CI fails on drift.
- Five-year support begins on the official Stable launch date, not internal or beta dates.

## FD-019 — Shared SahelFlow cloud; default seller BYOC rejected

- SahelFlow retains one shared, multi-tenant Cloudflare architecture for the
  control plane, relay, storefront and encrypted backup services.
- A separate seller-owned Cloudflare account/deployment is not the default
  product architecture.
- The BYOC alternative was examined and rejected because onboarding,
  cross-account routing, version drift, security authority and support cost
  would damage the seller experience and operational reliability.
- Shared connected services remain provisional until a unit-economics gate
  validates p50, p95 and maximum cost at 10, 100, 1,000 and 10,000 sellers.
- Every license requires metering, quotas, rate limits, storage ceilings,
  abuse controls and cost alarms before public connected entitlements are
  finalized.
- The 7,000 DZD base-sale continuity reserve must be validated against the
  five-year promise; product limits may not be invented merely to hide an
  unmeasured cost model.

This decision narrows the deployment choice in FD-005 without weakening its
desktop-authority, encryption, outage-survival or continuity requirements.

## FD-020 — Private Founder Console

- SahelFlow includes a separate private web control plane for seller accounts,
  signups, trials, payment review, licenses, entitlements, devices, transfers,
  usage, infrastructure cost, support, incidents, providers and releases.
- It is Founder-only at launch but its authorization model may support future
  trusted finance, support, release and audit roles.
- Every sensitive action is strongly authenticated and immutably audited.
- The console may access bounded control/support metadata only. It does not
  expose seller orders, customer messages, accounting records or decrypted
  backups.
- The permanent license-signing private key never enters the online console.
  The console records approval/authorization; permanent signing stays offline.
- The console cannot mutate canonical seller operations.

## FD-021 — Person, workspace and license are separate

- A person has one durable internal identity independent of changeable email,
  phone and device details.
- A seller workspace represents one independently licensed business and owns
  its shops, members, devices, entitlements, cloud limits and support history.
- A person may own multiple seller workspaces.
- Each workspace requires its own base license; ownership of several
  workspaces never turns one license into an unlimited multi-business license.
- Shops belong to a workspace, not directly to an email, device or Windows
  installation.

## FD-022 — Safe demo before the signed trial

- A prospective seller may explore an isolated sample-data demo without
  creating an account.
- The demo cannot become a real production workspace, accept real customer
  operations or bypass trial/licensing controls.
- A verified owner account and seller workspace are required to start the real
  seven-day signed trial.
- Trial and permanent activation do not make normal local desktop operation
  permanently internet-dependent.

## FD-023 — Founder continuous internal-update acceptance

- Every completed work package that changes the installed application receives
  a new immutable Internal version after merge to protected `main`.
- The exact-source signed artifact must pass automated release, signature,
  runtime and visible-UI gates before it reaches the Founder update channel.
- The Founder installs the update over the existing version without deleting
  AppData, reopens the real application and verifies the intended change.
- App-changing work is not finally complete until source integration, signed
  release and Founder-installed acceptance all pass.
- Documentation-only changes do not manufacture a pointless MSI unless they
  alter packaging, updater or release authority.
- Pilot and Stable channels remain separate from the frequent Founder-only
  Internal channel.

## FD-024 — Two coding agents with GitHub as durable truth

- The active coding system contains the ChatGPT Web Agentic Coding Agent and
  the Desktop Agent.
- GLM and Codex Cloud are removed from the active workflow and are not fallback
  authorities.
- Either active agent may implement; one agent owns each task/branch and the
  other reviews.
- Both agents branch, commit, push, test and review through GitHub. Neither
  works directly on protected `main`.
- The Desktop Agent codes in the local checkout and additionally owns
  installed-Windows, MSI, preservation, UI and reference-hardware evidence.
- GitHub Actions is infrastructure and clean-checkout/artifact authority, not
  a third coding agent.
- Heavy builds and repeated dependency caches remain off the storage-constrained
  Founder machine whenever GitHub Actions can perform them.

## FD-025 — Authenticated workspace is the first normal-launch window

- A successful desktop launch does not show a splash, startup shell, fake
  dashboard or intermediate window.
- The single main window remains non-visible only while the signed local runtime
  starts, the session is authenticated and the real workspace hydrates; the
  authenticated workspace is the first visible normal-launch surface.
- If startup is blocked, that same main window shows the bounded recovery surface
  and diagnostic code. No business workspace is exposed before readiness.
- Installed acceptance proves the workspace never becomes visible before
  matching authenticated readiness evidence, then proves visible responsive UI,
  normal close and reopen.
- This supersedes Internal.9's visible full-size startup-shell implementation;
  it does not weaken fail-closed startup, migration, runtime integrity or
  recovery requirements.

## FD-026 — One-month AAA completion program and fast agentic delivery

- The maximum target for a complete SahelFlow 1.0 AAA Stable candidate is
  **2026-08-27**.
- Work proceeds as dependency-correct vertical outcomes across product rules,
  data/domain authority, application code, UI states, localization,
  accessibility, security, migration/recovery, diagnostics, tests,
  documentation and installed evidence. It does not freeze completed layers or
  degrade into line-by-line task ceremony.
- Day-to-day feedback is path- and risk-aware: draft synchronization stays on
  the fast authority lane; selected heavy checks run once when a coherent head
  becomes reviewable; signed MSI production runs only for merged app-changing
  work or release-authority changes.
- Each app-changing package still receives one immutable Internal version and
  must pass exact-source, signed-release and Founder-installed acceptance. The
  deadline does not authorize skipped safety, data preservation, AAA depth or
  false readiness claims.
- If measured throughput or evidence makes the date materially at risk, agents
  surface the precise critical-path or scope decision immediately. They do not
  silently defer a Required capability, repeat known work or hide delay behind
  process.

---

## Change control

A founder decision can be changed only by a new numbered decision that states exactly what it supersedes. Engineering documents, code comments, agents, tests, and provider research cannot silently amend this register.
