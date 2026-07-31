# SahelFlow — Final completion roadmap

> **Status:** Binding dependency and completion order
> **Governing decision:** FD-028 — Final Completion Program and Research-First Quality Protocol
> **Phase 0 closeout base:** `18c45e474f58744b6f837372509154ca500044b0`
> **Protected main:** `522ab1642545803c7a9b6c320fe72cceb320e558`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13`, run `30366866703`
> **Founder-accepted baseline:** Internal.5
> **Phase 0 status:** Complete through PR #179
> **Active phase:** Phase 2A — durable local identity and session authority
> **Active package:** Phase 2A.3 — revocation, policy freshness and identity administration
> **Execution epic:** issue #164
> **Last consolidated:** 2026-07-31

This document owns the dependency-correct Phase 0–9 order, phase outcomes and exit
gates for SahelFlow 1.0. Product detail remains owned by `../product/PRODUCT.md`
and `../product/EXPERIENCE.md`; technical invariants remain owned by
`ARCHITECTURE.md`. No lower document, issue, branch or agent may silently weaken a
Founder, product, experience or architecture requirement.

## Binding outcome

SahelFlow is complete only when it is one coherent, installed, production-quality
Windows-first operations system for Algerian COD sellers.

Completion requires:

- every Required seller journey works end to end;
- every canonical mutation derives verified workspace, member, device, session,
  installation and exact shop authority as applicable;
- money, inventory, delivery and compensation remain correct under duplicate
  input, concurrency, restart, update, interruption and recovery;
- every Required route uses real data and complete operational states;
- Arabic, French and English have equivalent capability depth;
- RTL, accessibility, keyboard operation, zoom and responsive behavior are proven;
- provider capabilities are exposed only after capability-specific certification;
- T470 and declared floor-device targets pass with representative data;
- signed installed behavior matches exact source and preserves Founder data;
- documentation and public claims match exact evidence;
- no unresolved P0 or P1 remains.

A model, page, route, adapter, screenshot, mock, test count or artifact does not by
itself complete a capability.

## Completion boundaries

### Founder AAA Candidate

Requires all Required local code, pages, journeys and installed behavior,
including Golden COD, identity/team/licensing/multi-shop, whole-product AAA UI,
Arabic/RTL/accessibility parity, provider candidates, Windows lifecycle,
performance evidence and zero known P0/P1.

### Public Stable

Additionally requires representative Algerian seller beta, live provider
certification, independent security/privacy/Law 18-07 review, recovery and
incident drills, compatibility evidence, support/rollout readiness and explicit
Founder promotion.

## Program rules

1. Complete coherent seller outcomes, not disconnected foundations.
2. Freeze shared contracts briefly and adopt them immediately in production.
3. Remove or disable competing legacy mutation paths only after parity and
   recovery proof.
4. Research, UX, Arabic/RTL, accessibility, performance, security, migration,
   recovery, diagnostics and evidence travel with each phase.
5. Every material package begins with the research gate in
   `../operations/WORKFLOW.md`.
6. Current primary standards and official platform/provider documentation govern
   time-sensitive choices.
7. P0/P1 block the affected outcome; P2/P3 receive owned follow-up.
8. Routine packages do not bump the application version.
9. At most one frozen signed candidate is in flight.
10. Beta and Stable require explicit Founder promotion.
11. With one coding agent, a separated frozen-head adversarial pass replaces the
    internal second-agent gate but is never called independent review.

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
7. Performance and reliability certification
        ↓
8. Connected SahelFlow platform
        ↓
9. Certification, representative beta and Stable
```

Phases 5–7 run continuously where contracts permit, but cannot be declared
complete before real business behavior exists.

---

# Phase 0 — Authority freeze and execution reset

## Objective

Establish one authority chain, one roadmap, one execution epic and a resumable
frontier.

## Exit gate

- one authority chain and one final roadmap;
- no contradictory active next action;
- no unowned Required capability;
- documentation audit passes;
- a fresh session can reconstruct the exact next package without chat.

## Result — complete

PR #179 adopted FD-028 and the Phase 0–9 program. Phase 0 remains protected truth.

---

# Phase 1 — Canonical Golden COD business core

## Objective

Make the canonical business foundation the real operating path of the app.

## Golden COD slice

```text
product / variant
→ customer / risk
→ order intake
→ confirmation or rejection
→ stock reservation
→ fulfillment / shipment
→ delivery, failure or refusal
→ COD receivable / collection / remittance
→ discrepancy reconciliation
→ return / exchange / refund
→ inventory and financial compensation
→ analytics / audit
→ restart / in-place update
→ backup-compatible canonical facts
```

## Required authority

- trusted principal and exact shop context;
- optimistic aggregate version and exact idempotency;
- atomic audit, events, outbox, reservations and movements;
- durable provider effects, receipts and reconciliation;
- append-only or compensating stock and financial facts;
- one governed revenue, COGS and profitability definition;
- canonical source intake without legacy mutation bypass.

## Exit gate

The representative Golden COD order passes happy, validation, permission,
duplicate, concurrency, interruption, stale, conflict, provider-failure,
cancellation, return, restart, update and interrupted-command recovery in
AR/FR/EN. Disposable backup/restore compatibility preserves exact canonical facts.
Production native all-shop restore remains Phase 4.

## Result — source-closed on draft PR #195

Draft PR #195 integrates canonical manual, storefront, import, commerce,
WhatsApp and proposal-bound AI intake; confirmation/reservation; fulfillment and
courier lifecycle; COD settlement; returns/refunds/compensation; governed
profitability; restart/update preservation; backup compatibility; seller controls;
and adopted-source bypass protection.

A separated sole-agent adversarial review found and closed later booking and
reconciliation generations, unreadable post-effect recovery and pre-query
authority ordering defects. It was not called independent review.

Exact closure evidence:

- source head: `3783028396f3b0c4afa43f33fdd3c1c6cc51789f`;
- normal CI: `30652282305` — success;
- Integration source checkpoint: `30652282191` — success.

Phase 1 is not a protected merge, release, installed-MSI result or Founder
acceptance. Do not reopen it absent new concrete P0/P1 evidence.

---

# Phase 2 — Identity, authorization, licensing and multi-shop

## Objective

Replace process-local compatibility authority with the real commercial identity,
permission, licensing and native shop-lifecycle model.

## Research gate

Use current primary sources for:

- local-first identity and device trust;
- session management, reauthentication, revocation and recovery;
- action- and field-level authorization;
- signed machine-bound licensing and entitlements;
- Windows-protected secret storage;
- high-risk approval and recovery ceremonies;
- native multi-shop lifecycle.

## Phase 2A — durable local identity and session authority

### Package 2A.1 — setup and session authority — closed

Closed boundaries:

- setup is onboarding only, never authenticated authority;
- public auth routes are exact and administration is protected;
- 24-hour overall and one-hour inactivity limits;
- five-minute throttled, fail-closed activity persistence;
- malformed, future-dated, expired, inactive, revoked, missing and unreadable
  session authority fails closed;
- successful PIN reauthentication rotates the session ID;
- recent PIN proof is available for high-risk actions;
- PIN change revokes all active sessions and creates one replacement;
- logout does not claim success when durable revocation cannot be committed.

Exact evidence:

- source head: `ad3987e934c1e42706cf7f29010cd96dc534f290`;
- normal CI: `30656307152` — success;
- Integration source checkpoint: `30656308867` — success.

### Package 2A.2 — durable owner identity kernel — closed

Closed boundaries:

- HMAC-authenticated installation-level Workspace and Installation authority;
- durable Person, owner WorkspaceMember and enrolled Device;
- exact session-to-person/member/device bindings;
- per-shop grants, policy version and revocation snapshots;
- real person trusted actors and durable business audit identity;
- cross-shop denial, tamper detection, restart and concurrency behavior;
- missing-authority and database-backed anti-reinitialization barriers;
- installation-root rotation continuity and interrupted resume;
- generic Settings isolation for identity authority evidence;
- consequential commands resolve identity read-only and cannot bootstrap it.

PIN remains local unlock and reauthentication, never durable person identity.

Exact evidence:

- source head: `5190e792121dd6c1c9d2c1bd452db7b37ebb0b2e`;
- normal CI: `30660637916` — success;
- Integration source checkpoint: `30660637617` — success.

### Package 2A.3 — revocation and policy freshness — active

Required contract:

1. Every configured authenticated request validates both its database session and
   durable identity binding.
2. Revoked or stale session/member/device/workspace authority fails before route
   parsing or effects.
3. Owners can inspect exact-installation sessions and devices without exposing
   secrets or cross-shop data.
4. Owners can revoke another session immediately after recent PIN proof; ordinary
   administration cannot silently remove the current authority.
5. Control authority denies first. Database and audit catch-up is transactional,
   retryable and never restores access after partial failure.
6. Policy/member/device mutations advance durable versions or revocation epochs;
   stale bindings regain authority only through successful PIN reauthentication
   and a fresh session binding.
7. Duplicate/concurrent revoke, restart, database failure, same-shop and cross-shop
   behavior are proven.
8. Seller-facing security administration is complete in Arabic, French and
   English with loading, empty, error, reauthentication and recovery states.

Current assembled source includes generic-request identity validation,
owner-only session/device inventory, control-first other-session revocation,
database/audit catch-up, route-ordering tests and an AR/FR/EN Settings security
panel. The package remains active until exact-head authority, TypeScript, ESLint,
full tests and migration status pass and policy freshness is closed.

## Teams and permissions

After 2A is stable, implement owner/manager/operator/viewer presets, custom action
and field permissions, per-shop memberships, invitations, assignments, queues,
workgroups, comments, mentions and handovers. UI visibility is never authorization.

## Licensing and entitlements

Replace self-issued production trial behavior with signed online trial issuance,
exact machine-bound duration, reinstall recovery, full expiry lockout with data
preserved, offline permanent signing, explicit entitlements, transfer/recovery,
revocation epoch and key rotation. Remove production localStorage fallback and
client-authoritative license status.

## Native multi-shop

Move create, switch, archive, recover and delete operations to the native
supervisor with process relaunch, per-shop membership/provider/health authority,
slot accounting, safe archive/recovery and owner reauthentication for deletion.

## Phase 2 exit gate

Every request and command derives verified workspace, member, device, session,
installation and exact shop context. Revocation is immediate. Licensing cannot be
forged through browser or mutable database state. Production shop lifecycle works
through native authority and preserves data.

## Current result — active

Packages 2A.1 and 2A.2 are source-closed on draft PR #195. Package 2A.3 is active.
Teams/invitations, licensing/entitlements and native multi-shop remain open.
PR #186 is obsolete/diverged source and must never be merged wholesale.

---

# Phase 3 — Durable providers, inbox, AI and automations

## Objective

Make every external input and effect durable, replayable, observable and safe.

## Required protocol

```text
authenticated ingress
→ durable inbox
→ validation / deduplication
→ canonical command
→ committed result
→ durable outbox
→ external effect
→ receipt
→ reconciliation
```

Implement provider IDs, stable effect keys, attempts, rate-limit handling,
ambiguous outcomes, health, degraded states, dead letter, manual reconciliation
and kill switches. WhatsApp requires encrypted durable history and send receipts.
Automations require durable executions and per-step receipts. AI requires
allowlisted data, redaction, typed tools, exact permissions, proposal identity,
explicit approval and current-state recheck.

## Exit gate

Outage, retry, duplicate, rate limit, restart, timeout and partial failure cannot
silently lose or duplicate a canonical effect. Every action has a durable receipt,
visible state and recovery path. Public provider capabilities are live-certified.

---

# Phase 4 — Data protection, recovery, migrations and security

## Objective

Make seller data survivable and the product commercially defensible.

## Required outcomes

- Windows-protected installation root and per-shop keys;
- purpose-separated secret and backup keys;
- resumable key rotation and lost-device/transfer behavior;
- verified encrypted all-shop backups and authenticated manifests;
- independent recovery kit and replacement-install restore;
- atomic restore preserving current data after failure;
- clean/mixed/interrupted/low-disk/corrupt migration matrix;
- threat models, minimization, diagnostics, retention and deletion behavior;
- Law 18-07 mapping, SBOM and independent security/privacy review.

## Exit gate

A full installation can be backed up, corrupted, replaced and restored without
silent loss, authority confusion or key compromise. Migration and restore drills
pass and independent review has no unresolved P0/P1.

## Current result — partial

PR #184 proves the Windows-protected installation root and resumable rotation.
Full all-shop backup/restore, recovery, migration certification and independent
security/privacy/legal work remain open.

---

# Phase 5 — Whole-product AAA UI/UX

## Objective

Transform the product into one coherent top-tier operational system without
cosmetic AI slop.

## Required outcomes

- command-center information architecture around real seller work;
- shared typography, spacing, status, motion, forms, tables, dialogs, timelines,
  charts, loading and recovery contracts;
- complete happy, empty, loading, validation, permission, offline, stale,
  conflict, error, recovery, history, bulk and keyboard states;
- indexed search, filters, saved views, grouping, pagination or virtualization,
  selection, bulk actions, detail/history and export;
- route-by-route authority, real data, AR/FR/EN, accessibility, responsive,
  performance and installed evidence.

## Exit gate

Every Required route passes the page-completion contract with representative real
data and no mocked happy-path dependency.

---

# Phase 6 — Arabic, RTL and accessibility parity

## Objective

Make Arabic and accessibility equivalent behavior, not final polish.

## Required outcomes

- native Arabic copy and typography;
- mixed Arabic/Latin isolation and correct phone/SKU/date/DZD formatting;
- logical RTL navigation, forms, tables, charts, dialogs and focus order;
- WCAG 2.2 AA on critical journeys;
- keyboard-only completion, visible focus, semantics, announcements, contrast,
  reduced motion, 200% zoom and predictable focus restoration.

## Exit gate

Every Required journey works in Arabic RTL, French LTR and English LTR with
equivalent capability and accessibility.

---

# Phase 7 — Performance and reliability

## Objective

Meet declared low-end targets with representative data.

## T470 targets

- cold launch no slower than 8 seconds p95;
- authenticated workspace first visible on normal launch;
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

## Exit gate

Targets pass on the Founder T470 and declared floor profile. Architecture changes
when necessary; hardware requirements are not raised for convenience.

---

# Phase 8 — Connected SahelFlow platform

## Objective

Complete remote work, hosted storefront, licensing/control and zero-knowledge
recovery without weakening desktop authority.

## Required outcomes

- isolated multi-tenant hosted storefront with durable COD receipt, releases,
  preview, publish, history and rollback;
- remote PWA with enrollment, permission-filtered encrypted projections, signed
  commands, conflict states and revocation purge;
- cloud control for identity/licensing/entitlements/routing metadata and encrypted
  relay without seller operational plaintext;
- strongly authenticated, immutably audited Founder Console;
- client-encrypted zero-knowledge backup with independent recovery;
- measured economics and outage survival for permanent local operation.

## Exit gate

Cloud outage cannot corrupt or block permanent local work. Remote success appears
only after desktop commit. Storefront success has a durable receipt. Cross-tenant
leakage and duplicate effects are zero in certification. Cloudflare or SahelFlow
alone cannot decrypt backups.

---

# Phase 9 — Certification, representative beta and Stable

## Objective

Convert the complete Founder candidate into an evidence-defensible public product.

## Required certification

- clean install, upgrade, reopen and in-app update;
- migration, backup, restore and replacement installation;
- identity, permissions, revocation and shop lifecycle;
- trial expiry and permanent activation;
- Golden COD and provider reconciliation;
- storefront checkout and remote command;
- Arabic/RTL and accessibility;
- T470/floor performance and eight-hour stability;
- security, privacy and incident response.

## Controlled beta

Use representative Algerian COD sellers across volume, hardware, Arabic/French,
WhatsApp, couriers, commerce/storefront and real support/recovery cases.

## Stable gate

- every Required capability Proven at its required layer;
- zero unresolved P0/P1;
- no known stock, money, identity or recovery discontinuity;
- provider launch set live-certified;
- recovery and incident drills pass;
- independent security/privacy/Law 18-07 review passes;
- performance, Arabic/RTL and accessibility targets pass;
- representative beta exit accepted;
- public claims link current exact evidence;
- signed Windows Stable artifact and immutable manifest pass;
- Founder explicitly promotes Stable.

---

# Definition of done

A phase is complete only when its exit gate has objective evidence and every known
P0/P1 is closed.

“100% sure” is not mathematical perfection. The professional standard is that all
defined gates pass, known critical findings are closed, representative evidence
exists at the required layer and no contradiction remains between product promise,
source, installed behavior and public claim.
