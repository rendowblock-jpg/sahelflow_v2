# SahelFlow 1.0 — Consolidated Founder Decisions

> **Status:** Authoritative founder-approved register  
> **Consolidated:** 2026-07-15  
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

---

## Change control

A founder decision can be changed only by a new numbered decision that states exactly what it supersedes. Engineering documents, code comments, agents, tests, and provider research cannot silently amend this register.