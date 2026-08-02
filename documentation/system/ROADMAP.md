# SahelFlow — Final completion roadmap

> **Status:** Binding dependency and completion order
> **Governing decisions:** FD-028 — Final Completion Program; FD-029 — Uncompromised AAA completion and disciplined delivery
> **Governance reset base:** `d3747f18f6a6e9e976dfb076d2b274bc21c3eca8`
> **Latest application-changing protected merge:** `04d4c51831c6e043ab39a614a7e947e6b27d01e6`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13`, run `30366866703`
> **Founder-accepted baseline:** Internal.5
> **Phase 0 status:** Complete
> **Phase 1 status:** Protected-source closed through PR #195
> **Active product phase:** Phase 2 — identity, authorization, licensing and multi-shop
> **Current session:** governance reset; product implementation paused
> **Execution epic:** issue #164
> **Last consolidated:** 2026-08-02

Live protected `main` must be re-read directly from GitHub. The SHAs above record
the exact source frontier used for this consolidation and the latest protected
merge that changed application behavior.

This document owns Phase 0–9 dependency order and phase exit gates. Product detail
belongs to `../product/PRODUCT.md` and `../product/EXPERIENCE.md`; technical
invariants belong to `ARCHITECTURE.md`. No lower document, issue, branch or agent
may silently weaken a Founder, product, experience or architecture requirement.

## Binding completion rule

SahelFlow is complete only when it is one coherent, installed, production-quality
Windows-first operations system for Algerian COD sellers.

Every Required journey must work end to end. Money, stock, identity, provider
effects and recovery must remain correct under duplicate input, concurrency,
restart, update, interruption and failure. Arabic/French/English, RTL,
accessibility, performance, security and public claims must match exact evidence.
No known P0/P1 may remain.

A page, model, route, adapter, screenshot, mock, test count or artifact does not
alone complete a capability.

## Program execution rules

1. One active implementation agent at a time.
2. Every material phase/package begins with complete reconnaissance and one
   consolidated Problem Register.
3. Findings are grouped by root cause and repaired in coherent batches.
4. Work packages deliver observable seller/Founder outcomes across every
   applicable layer.
5. Shared contracts freeze before dependent implementation.
6. Level 1 Task Gate runs after every coherent completed task.
7. Level 2 Phase Checkpoint passes before a phase closes.
8. Level 3 Major Full Checkpoint runs after every two phases by default and
   earlier for high-risk native/security/data/recovery/provider authority.
9. Research, UX, Arabic/RTL, accessibility, performance, security, migration,
   recovery, diagnostics and evidence travel with each package.
10. P0/P1 block the affected outcome. P2/P3 receive an explicit owner and
    dependency position.
11. Routine source packages remain version-neutral.
12. Protected merge, release, Beta, Stable and Founder acceptance remain explicit
    decisions.
13. With one agent, frozen review is a separated adversarial pass, not independent
    review.
14. Competing legacy mutation paths are removed or made read-only after parity and
    recovery proof.

## Validation cadence

### Level 1 — Task Gate

After each coherent task: authority/docs, Prisma where applicable, TypeScript,
ESLint, full Vitest and risk-selected browser/provider/Rust/native checks.

### Level 2 — Phase Checkpoint

At every phase exit: clean complete source/database/migration suites, production
build, affected journeys, authorization/shop isolation, AR/FR/EN, RTL,
accessibility, performance, recovery, documentation and applicable native/Windows
evidence.

### Level 3 — Major Full Checkpoint

After two phases by default: exact-source Windows release, Rust parity, signed
MSI, clean install, upgrade, reopen, process cleanup, preserved data,
backup/restore/recovery, complete UI journeys, visual regression, security,
performance, stability and evidence bundle.

Run Level 3 immediately at the affected phase exit for licensing, identity,
cryptography, installer/updater, migrations, backup/restore, destructive shop/data
lifecycle or provider effects involving stock or money.

## Critical path

```text
0. Authority freeze and execution reset
        ↓
1. Canonical Golden COD business core
        ↓
2. Identity, authorization, licensing and multi-shop
        ↓
3. Durable providers, inbox, AI and automations
        ↓
4. Data protection, recovery, migrations and security
        ↓
5. Whole-product AAA UI/UX
        ↓
6. Arabic, RTL and accessibility parity
        ↓
7. Performance and reliability
        ↓
8. Connected SahelFlow platform
        ↓
9. Certification, representative beta and Stable
```

Phases 5–7 travel continuously where contracts permit, but cannot be declared
complete before real business behavior exists.

---

# Phase 0 — Authority freeze and execution reset

## Objective

Establish one authority chain, one roadmap, one execution epic and a resumable
frontier.

## Exit gate

- no contradictory active next action;
- no unowned Required capability;
- documentation audit passes;
- a fresh session reconstructs the exact next package without chat.

## Result

Complete through FD-028 and the Phase 0 closeout. This governance reset repairs
later drift without reopening the product scope.

---

# Phase 1 — Canonical Golden COD business core

## Objective

Make the canonical COD foundation the real operating path:

```text
product / customer / risk
→ order intake and confirmation
→ stock reservation and fulfillment
→ courier effect, tracking and reconciliation
→ COD receivable, collection and remittance
→ return, exchange, refund and compensation
→ governed profitability, audit and preservation
```

## Exit gate

The representative Golden COD journey passes happy, validation, permission,
duplicate, concurrency, interruption, stale, conflict, provider-failure,
cancellation, return, restart, update and interrupted-command recovery in
AR/FR/EN. Disposable backup/restore compatibility preserves exact facts.
Production native all-shop restore remains Phase 4.

## Result — protected-source closed through PR #195

PR #195 merged at `a3d53cdd21afa8f4d03eefa7088304a9f728e2a0`.
Implementation head `ddec67a36b8000be91562b33a2bd4d6aceb5e443` passed CI
`30734100436`.

Trusted manual intake, confirmation/rejection, reservation, fulfillment,
delivery, COD receivable, settlement/return/compensation source boundaries and
shared replay/authorization repairs are protected source. This is not current
installed-product or Stable proof.

---

# Phase 2 — Identity, authorization, licensing and multi-shop

## Objective

Deliver durable commercial identity, permissions, entitlement and native shop
lifecycle authority without making mutable browser or shop-database state the
source of truth.

## Closed source outcomes

### Setup, sessions and owner identity

- setup is onboarding only;
- sessions enforce overall/inactivity limits and revocation;
- PIN reauthentication rotates session identity;
- installation-owned Workspace, Installation, Person, Member, Device and session
  authority exists outside shop databases;
- exact shop grants, policy freshness, revocation, restart and recovery are
  source-proven.

### Members, roles, Teams and permissions

- authenticated invitations and individual credentials;
- owner, manager, operator, viewer and bounded custom policies;
- exact shop grants and protected-field projections;
- workgroups, queues, assignments, comments, mentions and handovers;
- immediate revocation, trusted audit and AR/FR/EN seller states.

Protected through PR #195.

### Signed licensing

PR #197 merged at `04d4c51831c6e043ab39a614a7e947e6b27d01e6`.
Exact implementation head `25abbedd176429cf25e657217726d833e3c62a10` passed CI
`30744598944`; all review threads were resolved.

Source-closed behavior:

- signed machine-bound online trial and offline permanent claims;
- separate signing authorities;
- one-device trial reissue/recovery;
- DPAPI-protected clock, revocation and recovery floors;
- transfer, recovery and revocation ceremonies;
- complete data-preserving lockout;
- AR/FR/EN recovery states;
- release builds fail closed when licensing configuration is absent.

Windows artifact and installed behavior remain Phase 2 exit evidence.

## Active outcome — native multi-shop

The native supervisor must own:

- create, rename, switch, archive, recover and delete;
- atomic registry revision and persistent shop incarnation;
- workspace, installation, license-slot and membership validation;
- exact database-file and migration-set identity;
- quiesce, target validation, process relaunch and authenticated readiness;
- interruption, restart, corruption and partial-failure recovery;
- owner reauthentication for destructive deletion;
- data-preserving archive/recovery;
- complete AR/FR/EN and RTL seller states;
- low-end and installed behavior.

Browser input, Zustand preference, request fields or mutable shop data cannot
become lifecycle authority.

## Phase 2 exit gate

- every request/command derives verified workspace, person/member, device,
  session, installation and exact shop context;
- revocation is immediate;
- permissions and licensing cannot be forged through browser or mutable shop
  state;
- production shop lifecycle works through native authority and preserves data;
- complete Phase 2 Level 2 checkpoint passes;
- Level 3 Windows/Rust/signed-MSI/install/reopen/preserved-data checkpoint passes;
- zero known P0/P1 remains.

---

# Phase 3 — Durable providers, inbox, AI and automations

## Objective

Make every external input and effect durable, replayable, observable and safe:

```text
authenticated ingress
→ durable inbox
→ validation / deduplication
→ canonical command
→ committed result
→ durable outbox
→ external effect
→ receipt and reconciliation
```

## Required outcomes

- one durable provider protocol for WhatsApp, courier and commerce effects;
- authenticated inbound persistence before acknowledgement;
- stable effect identity, leases, retries, ambiguity, receipts and dead letter;
- no provider effect inside a business transaction;
- checkpoints never advance past untracked work;
- automation steps report truthful partial state and recover safely;
- destructive AI actions use persisted proposal-bound confirmation or remain
  disabled;
- complete operator recovery and AR/FR/EN states;
- at least one live-certified courier and Required communication path.

## Exit gate

Outage, retry, duplicate, rate limit, restart, timeout and partial failure cannot
silently lose or duplicate a canonical effect. Every action has a durable receipt,
visible state and recovery path. Public provider claims match live certification.

---

# Phase 4 — Data protection, recovery, migrations and security

## Objective

Make seller data survivable and the product commercially defensible.

## Required outcomes

- Windows-protected installation root and purpose-separated keys;
- resumable rotation and lost-device/transfer behavior;
- verified encrypted all-shop backup and authenticated manifests;
- independent recovery kit and replacement-install restore;
- atomic restore preserving current data after failure;
- clean/mixed/interrupted/low-disk/corrupt migration matrix;
- threat models, minimization, retention, deletion and diagnostics;
- Law 18-07 mapping, SBOM and independent security/privacy review.

## Exit gate

A full installation can be backed up, corrupted, replaced and restored without
silent loss, authority confusion or key compromise. Migration/restore drills pass
and independent review has no unresolved P0/P1.

Phases 3–4 together normally trigger a Level 3 checkpoint; Phase 4 risk may require
it earlier for each recovery authority package.

---

# Phase 5 — Whole-product AAA UI/UX

## Objective

Transform the complete application into one coherent top-tier operational system.

## Required outcomes

- one SahelFlow-owned design system;
- one governed chart foundation selected through benchmark;
- complete information architecture and navigation;
- professional operational density, tables, filters, forms, bulk work and
  destructive ceremonies;
- complete happy/loading/empty/validation/permission/offline/pending/stale/
  conflict/error/retry/recovery/history states;
- every Required page uses real authority and data;
- route-by-route visual regression and Founder visual acceptance.

## Exit gate

Every Required route passes the page-completion matrix with representative real
data and no mocked happy-path dependency. No legacy-looking or state-incomplete
page remains.

---

# Phase 6 — Arabic, RTL and accessibility parity

## Objective

Make Arabic and accessibility equivalent behavior, not a visual afterthought.

## Required outcomes

- semantic AR/FR/EN copy and non-concatenated translations;
- Arabic joining and professional typography;
- logical RTL geometry and mixed-direction isolation;
- intentional directional icons and charts;
- WCAG 2.2 AA target;
- keyboard-only completion, focus management, semantics and announcements;
- contrast, reduced motion, 100–200% zoom and 1366×768 containment;
- equivalent error/recovery behavior in all languages.

## Exit gate

Every Required journey works in Arabic RTL, French LTR and English LTR with
equivalent capability and accessibility evidence.

Phases 5–6 normally trigger a Level 3 checkpoint focused on complete installed UI,
visual regression and accessibility evidence.

---

# Phase 7 — Performance and reliability

## T470 targets

- cold launch no slower than 8 seconds p95;
- ordinary navigation no slower than 700 ms p95;
- indexed search no slower than 350 ms p95;
- ordinary local mutation no slower than 500 ms p95.

## Floor targets

- usable shell within 15 seconds p95 on entry SSD and 25 seconds on HDD;
- input acknowledgement within 100 ms;
- navigation within 1.5 seconds p95;
- indexed search within 750 ms p95;
- local mutation within 1 second p95;
- no ordinary freeze over 200 ms;
- steady working set no greater than 750 MB with WhatsApp connected;
- no sustained memory growth across eight hours.

## Required outcomes

- cold/warm startup stage measurement;
- query/index and rendering budgets;
- virtualized large tables and bounded charts;
- low-resource scheduling and sidecar limits;
- clean close/reopen and crash-loop recovery;
- eight-hour stability and resource trend evidence;
- representative database scale.

## Exit gate

Targets pass on the Founder T470 and declared floor profile with no authority or
feature reduction.

---

# Phase 8 — Connected SahelFlow platform

## Objective

Complete remote work, hosted storefront, licensing/control and zero-knowledge
recovery without weakening desktop canonical authority.

## Required outcomes

- authenticated encrypted projection/command protocol;
- desktop-commit truth for remote success;
- shared multi-tenant Cloudflare control plane;
- hosted storefront with durable checkout receipt and atomic publish/rollback;
- PWA operational companion within desktop-owned authority;
- zero-knowledge encrypted backup transport and quotas;
- Founder Console with bounded metadata and offline permanent signing;
- outage, cost, abuse and cross-tenant controls.

## Exit gate

Cloud outage cannot corrupt or block permanent local work. Remote success appears
only after desktop commit. Storefront success has a durable receipt. Cross-tenant
leakage and duplicate effects are zero in certification. SahelFlow alone cannot
decrypt backups.

Phases 7–8 normally trigger a Level 3 checkpoint covering performance, remote
protocol, storefront, cloud outage and installed desktop integrity.

---

# Phase 9 — Certification, representative beta and Stable

## Required certification

- clean install, upgrade, reopen and in-app update;
- migration, backup, restore and replacement installation;
- identity, permissions, revocation and shop lifecycle;
- trial expiry, permanent activation, transfer and recovery;
- Golden COD and provider reconciliation;
- storefront checkout and remote command;
- complete AAA UI, Arabic/RTL and accessibility;
- T470/floor performance and eight-hour stability;
- independent security, privacy, legal and provider review;
- incident response, support and rollout readiness;
- representative Algerian seller beta.

## Stable gate

Every Required capability is proven at its required layer; zero P0/P1 remains;
provider, recovery, security/privacy/Law 18-07, performance, Arabic/RTL,
accessibility and representative beta gates pass; a signed Windows artifact and
immutable manifest pass; and the Founder explicitly promotes Stable.

---

# Definition of done

A phase is complete only when its exit gate has objective evidence, its Level 2
checkpoint passes and every known P0/P1 is closed. A major checkpoint is complete
only when all selected installed and external-risk evidence passes on one exact
source.

“100% sure” means every defined gate passes, representative evidence exists at the
required layer and no contradiction remains between product promise, source,
artifact, installed behavior and public claim.
