# SahelFlow — Final completion roadmap

> **Status:** Binding dependency and completion order
> **Governing decision:** FD-028 — Final Completion Program and Research-First Quality Protocol
> **Protected main:** `522ab1642545803c7a9b6c320fe72cceb320e558`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13`, run `30366866703`
> **Founder-accepted baseline:** Internal.5
> **Phase 0 status:** Complete through PR #179
> **Active phase:** Phase 2A — durable local identity and session authority
> **Active package:** Teams and permissions completion
> **Execution epic:** issue #164
> **Last consolidated:** 2026-08-01

This document owns Phase 0–9 dependency order, outcomes and exit gates. Product
detail remains owned by `../product/PRODUCT.md` and
`../product/EXPERIENCE.md`; technical invariants remain owned by
`ARCHITECTURE.md`. No lower document, issue, branch or agent may silently weaken a
Founder, product, experience or architecture requirement.

## Binding completion rule

SahelFlow is complete only when it is one coherent, installed,
production-quality Windows-first operations system for Algerian COD sellers.
Every Required journey must work end to end; money, stock, identity, provider
effects and recovery must remain correct under duplicate input, concurrency,
restart, update, interruption and failure; AR/FR/EN, RTL, accessibility,
performance, security and public claims must match exact evidence; and no known
P0/P1 may remain.

A model, page, route, adapter, screenshot, mock, test count or artifact does not
alone complete a capability.

## Program rules

1. Complete coherent seller outcomes, not disconnected foundations.
2. Research, UX, Arabic/RTL, accessibility, performance, security, migration,
   recovery, diagnostics and evidence travel with each package.
3. Use current primary standards and official platform/provider documentation.
4. P0/P1 block the affected outcome; P2/P3 receive owned follow-up.
5. Routine source packages remain version-neutral.
6. With one coding agent, use a separated frozen-head adversarial pass but never
   call it independent review.
7. Protected merge, release, Beta, Stable and Founder acceptance remain explicit
   decisions.

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

## Result — complete

FD-028 and PR #179 established the Phase 0–9 program.

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

## Result — reopened on draft PR #195 for concrete P1 replay repair

- head `3783028396f3b0c4afa43f33fdd3c1c6cc51789f`;
- normal CI `30652282305` — success;
- checkpoint `30652282191` — success.

A separated sole-agent adversarial pass found and closed later courier booking and
reconciliation generations, unreadable post-effect recovery and pre-query
authority ordering. It was not independent review. On 2026-08-01, later Teams
review found concrete P1 evidence: the default command replay rule did not
distinguish durable people represented inside the legacy authenticated-owner
principal kind. Phase 1 remains reopened until same-person replay and affected
route boundaries pass one new exact-head checkpoint.

---

# Phase 2 — Identity, authorization, licensing and multi-shop

## Objective

Deliver durable commercial identity, permissions, entitlement and native shop
lifecycle authority without making mutable browser or shop-database state the
source of truth.

## Phase 2A — durable local identity and session authority

### Package 2A.1 — setup and session authority — closed

- setup is onboarding only;
- database sessions enforce overall/inactivity limits and revocation;
- activity persistence is throttled and fail-closed;
- PIN reauthentication rotates session identity;
- recent proof, PIN-change revocation and durable logout are proven.

Evidence: head `ad3987e934c1e42706cf7f29010cd96dc534f290`, CI
`30656307152`, checkpoint `30656308867`.

### Package 2A.2 — durable owner identity kernel — closed

- HMAC-authenticated Workspace and Installation authority outside shop DBs;
- durable Person, owner WorkspaceMember, Device and session binding;
- real person actors, exact shop grants and policy/revocation snapshots;
- tamper, restart, concurrency, cross-shop, root rotation and
  anti-reinitialization proof.

Evidence: head `5190e792121dd6c1c9d2c1bd452db7b37ebb0b2e`, CI
`30660637916`, checkpoint `30660637617`.

### Package 2A.3 — revocation and policy freshness — closed

- every configured authenticated request validates durable identity;
- owner-only exact-installation session/device inventory;
- control-first revocation of another session after recent PIN proof;
- transactional, retryable database/audit catch-up;
- current-session, duplicate/concurrent revoke and failure recovery;
- AR/FR/EN security administration;
- policy-stale bindings fail ordinary access but may enter only the rate-limited
  PIN reauthentication ceremony, which rotates into a fresh binding;
- missing, revoked, cross-shop or unavailable authority remains blocked.

Evidence: head `56df880bbe2233bf081119fa535e30713d9c6051`, CI
`30665009016`, checkpoint `30665009255`.

### Package 2A.4 — multi-member roles, invitations and per-shop permissions — closed

- authenticated, expiring and single-use invitations with replay-safe recovery;
- exactly one accepted Person, WorkspaceMember, Device and session per valid
  invitation and local PIN ceremony;
- individual member login and member-owned reauthentication without owner-PIN
  fallback;
- owner, manager, operator and viewer presets plus deny-by-default custom
  allowlists bounded by role ceilings;
- exact shop grants enforced on protected access, credential creation and
  non-owner member inventory;
- control-first member revocation immediately invalidating every indexed session;
- transactional, retryable SQLite/audit catch-up without restoring access;
- owner administration and member self-view in AR/FR/EN;
- installation-root rotation across owner, invitation, member and revocation
  authorities;
- duplicate/concurrent invitation, acceptance and revocation, restart, expiry,
  replay, stale-policy, recovery and cross-shop proof.

Evidence: head `3266dc03994ffcb1672256465624ea715f0cf317`, CI
`30681155150`, checkpoint `30681155099`.

The frozen sole-agent adversarial pass found and closed revoked-login disclosure,
stale-owner queue authorization, cross-shop inventory exposure and wrong-shop
login false-success. It found no remaining P0/P1 and was not an independent
review. The sole core owner is outside accepted-member removal/demotion APIs; any
future multi-owner last-owner recovery remains an explicit separate ceremony.

## Teams and permissions completion — active

Complete authoritative assignments, workgroups, queues, internal comments,
mentions, handovers and field-level permissions where Required. Extend the action
vocabulary to operational domains while preserving exact shop scope,
least-privilege role ceilings, custom deny-by-default behavior, trusted actor
audit attribution, idempotency, concurrency, revocation and recovery. UI
visibility is never authorization.

The representative first vertical must prove one assignment/handover lifecycle for
owner, manager and operator under happy, validation, permission, duplicate,
concurrent, stale-policy, revoked, cross-shop, restart and recovery behavior in
Arabic, French and English.

## Licensing and entitlements

Replace self-issued production trial behavior with signed machine-bound issuance,
reinstall recovery, expiry lockout with data preserved, offline permanent signing,
explicit entitlements, transfer/recovery, revocation epoch and key rotation.
Browser or mutable database state cannot forge production entitlement.

## Native multi-shop

Move create, switch, archive, recover and delete to the native supervisor with
process relaunch, membership and licence-slot authority, per-shop provider/health
state, safe archive/recovery and owner reauthentication for deletion.

## Phase 2 exit gate

Every request and command derives verified workspace, member, device, session,
installation and exact shop context. Revocation is immediate. Permissions and
licensing cannot be forged through browser or mutable shop state. Production shop
lifecycle works through native authority and preserves data.

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

## Exit gate

Outage, retry, duplicate, rate limit, restart, timeout and partial failure cannot
silently lose or duplicate a canonical effect. Every action has a durable receipt,
visible state and recovery path. Public provider capabilities are live-certified.

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

---

# Phase 5 — Whole-product AAA UI/UX

## Objective

Deliver one coherent operational system with complete happy, empty, loading,
validation, permission, offline, stale, conflict, error, recovery, history, bulk
and keyboard states, using real data and shared interaction contracts.

## Exit gate

Every Required route passes the page-completion contract with representative real
data and no mocked happy-path dependency.

---

# Phase 6 — Arabic, RTL and accessibility parity

## Objective

Make Arabic and accessibility equivalent behavior, including native copy,
typography, mixed-direction isolation, logical RTL, WCAG 2.2 AA, keyboard-only
completion, focus, semantics, announcements, contrast, reduced motion and zoom.

## Exit gate

Every Required journey works in Arabic RTL, French LTR and English LTR with
equivalent capability and accessibility.

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

## Exit gate

Targets pass on the Founder T470 and declared floor profile.

---

# Phase 8 — Connected SahelFlow platform

## Objective

Complete remote work, hosted storefront, licensing/control and zero-knowledge
recovery without weakening desktop canonical authority.

## Exit gate

Cloud outage cannot corrupt or block permanent local work. Remote success appears
only after desktop commit. Storefront success has a durable receipt. Cross-tenant
leakage and duplicate effects are zero in certification. SahelFlow alone cannot
decrypt backups.

---

# Phase 9 — Certification, representative beta and Stable

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

## Stable gate

Every Required capability is Proven at its required layer; zero P0/P1 remains;
provider, recovery, security/privacy/Law 18-07, performance, Arabic/RTL,
accessibility and representative beta gates pass; a signed Windows artifact and
immutable manifest pass; and the Founder explicitly promotes Stable.

---

# Definition of done

A phase is complete only when its exit gate has objective evidence and every known
P0/P1 is closed. “100% sure” means all defined gates pass, representative evidence
exists at the required layer and no contradiction remains between product promise,
source, installed behavior and public claim.
