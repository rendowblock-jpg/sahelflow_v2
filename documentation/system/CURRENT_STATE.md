# SahelFlow — Current state

> **Authority:** merged protected source and named evidence only
> **Last assessed:** 2026-08-11
> **Protected `main` at this handoff:** `bbfdc92e7b1845cd7cc4e2fd04c7ae5a2c7ab647` — PR #234
> **Latest application-changing protected merge:** PR #234
> **Published executable source:** `2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Published release:** `1.0.0-internal.14` / MSI `1.0.0.14`
> **Protected signed publication run:** `31388777098`
> **Founder-installed release:** Internal.14
> **Founder-accepted baseline:** Internal.5
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Mandatory gate before Phase 8:** shared-root frontend stabilization + installed Phase 6/7 evidence + explicit Founder acceptance
> **Open retained issues:** #221, #226, #230
> **Closed retained evidence in this handoff:** #201, #214
> **Execution epic:** #164
> **Full handoff context:** `documentation/archive/handoffs/PRE_PHASE8_SESSION_HANDOFF-2026-08-11.md`

Live protected `main`, release state, open pull requests, issues and current Actions
are authority. Documentation-only commits may advance `main` without changing the
published executable source.

## Executive truth

SahelFlow is a Windows-first, local-first operations system for Algerian COD
sellers with substantial protected business, identity, licensing, provider,
recovery and desktop authority. The backend/engine is the asset to preserve.

Internal.14 is published and installed on the Founder T470. A matching permanent
offline entitlement activated and survived close/reopen. Internal.14 is **not**
Founder-accepted and is not a Beta or Stable release.

The Founder-installed use session rejected the current frontend as a whole-product
quality baseline. The problem is systemic, not a short list of isolated visual
bugs. The mandatory pre-Phase-8 program therefore combines existing Phase 5
experience, Phase 6 Arabic/accessibility and Phase 7 performance obligations into
one cross-phase stabilization gate. It is not a new numbered phase.

## Founder-installed frontend problem register

The shared-root repair program must address the following installed observations
without requiring the Founder to enumerate every small defect manually:

- Arabic typography/font quality is not professional enough;
- text and controls are frequently too small for comfortable operational reading;
- AR/FR/EN and LTR/RTL switching is non-atomic, with stale text/geometry and
  wrong-side navigation possible until refresh/restart;
- light/dark switching feels glitchy and the current visual treatment feels cold;
- motion/micro-interaction language is weak or absent;
- RTL geometry and direction-sensitive icons are inconsistent;
- primary navigation is over-nested;
- routine warnings are too visually dominant;
- charts are sparse and low-information rather than decision-oriented;
- Inbox, AI Agents and Settings require product-level workflow redesign;
- the complete route/component inventory must be self-audited by implementation.

The supporting research packet remains
`documentation/archive/research/PRE_PHASE8_FRONTEND_STABILIZATION_RESEARCH-2026-08-10.md`.

## Protected stabilization work completed after Internal.14

### PR #231 — stabilization authority

Protected merge `bac258e4e8c44e730fe96a72e8adbac5f45a43ab` records the
mandatory pre-Phase-8 Founder stabilization program and research basis.

### PR #232 — CI authority hardening

Protected merge `876b0acdd2528df52ec106c22f231edf0b590739` retires the historical
PR #200 installed-UI waiver and PR #207 Phase 4 closure override as live
lane-suppression authority. Anti-bypass regression tests protect current evidence
classification.

This closes the first deep-audit P1 finding.

### PR #233 — activation continuity

Protected merge `b91fd2a9008f529a5df3000d99bf426094f9daa9` repairs the demonstrated
successful license-activation blank workspace. Valid permanent/trial entitlement
transitions refresh the server-authorized dashboard tree instead of leaving the
invalid-license server layout's `null` children visible until restart.

This closes the second deep-audit P1 finding.

### PR #234 — resilient customer-trial source architecture

Protected merge `bbfdc92e7b1845cd7cc4e2fd04c7ae5a2c7ab647` replaces the single
client trial route with a bounded primary/recovery source contract while preserving
one canonical trial issuer/signing authority and local fail-closed commercial
truth.

Protected source now includes:

- bounded primary/recovery trial ingress;
- current-v2 schema + Ed25519/keyring + exact workspace/installation/device/product
  validation before a route response ends failover;
- no failover around HTTP 429, canonical Worker input rejection, expiry,
  revocation, transfer or clock authority;
- privacy-safe DNS/connect/TLS/timeout/HTTP/invalid-response/invalid-entitlement
  diagnostic classes;
- customer/signed release validation requiring two distinct reviewed owned HTTPS
  origins and rejecting direct `workers.dev`, IP literals and reserved/private
  destinations;
- Worker readiness that proves trial schema/uniqueness, bounded issuer
  configuration, D1 write capability, shared-keyring signer identity and the
  rate-limiter binding;
- an isolated health limiter enforced before expensive D1/crypto readiness work;
- blocking Worker tests in canonical Vitest;
- permanent offline activation preserved independently.

`licensing.ownedHostSuffix` intentionally remains unprovisioned in reviewed source,
so customer/signed production builds remain fail-closed until the real owned zone
and protected route values are supplied.

## Issue #230 — still an open P1 external-certification boundary

PR #234 is the source half only. It does **not** certify customer trial onboarding
on Algerian networks.

Issue #230 requires real external evidence before closure:

- an actual SahelFlow-owned primary production hostname;
- a sufficiently independent recovery path, not merely a second label over the
  same failure domain;
- protected production route/keyring/schema deployment;
- representative Algerian fixed/mobile reachability and forced-recovery checks;
- an exact signed installed customer trial/recovery journey with no restart;
- retained privacy-safe diagnostics for the failing network/HTTP/entitlement stage.

GitHub auto-closed #230 when #234 merged despite the issue's explicit CI-only
non-closure rule. It was intentionally reopened on 2026-08-11 and remains open.

## Exact #234 validation checkpoint

PR #234 exact head `04b04bbbc20124ccbee790b47855056155a1cc29` passed CI run
`31442156721`.

The exact head passed:

- Required PR Gate;
- full Quality authority;
- Tauri release smoke;
- Windows standalone/contained runtime;
- Windows Rust release parity;
- exact evidence MSI build;
- installed runtime launch and close/reopen;
- authenticated hydrated WebView UI proof twice;
- replacement-install backup/restore/identity/rollback drill;
- Native source contract;
- Phase 5 Experience Gate;
- Phase 6–7 Completion Gate;
- fresh final-head Codex review with no major issue and all addressed review
  threads resolved before merge.

An earlier installed attempt had a WebView/CDP transport failure during the
post-restore acceptance client after the restore itself had committed. A retry on
the same older product head passed that step before the run became stale, and the
final exact head later passed the entire installed run. The evidence supports a
transient harness transport failure, not a product restore regression.

## Retained issue reconciliation

### Issue #201 — CLOSED

The exact #234 installed run satisfies the retained hydrated-WebView/startup proof:
installed launch/reopen passed and authenticated hydrated WebView UI proof passed
twice on the exact MSI. PR #232 had already retired the PR #200 waiver. Closing
#201 does not imply Founder acceptance or Stable.

### Issue #214 — CLOSED

The exact #234 installed run satisfies the stronger replacement-install evidence
that #214 retained. The governed installed drill passed interruption, rollback and
committed two-shop restore plus:

- durable-data parity;
- protected-key rewrap;
- replacement installation identity retained without source installation/session
  cloning;
- owner re-enrollment in the installed WebView;
- restored protected-customer blind-index search;
- restored protected-secret readback;
- committed restore receipt binding with no failure code.

PR #232 had already retired the PR #207 override. Replacement-install recovery can
now be described as exact-source installed certified for this evidence boundary.
This is not a Beta/Stable or frontend-acceptance claim.

### Issue #221 — OPEN

Installed Founder Phase 5/6 visual/accessibility acceptance remains open. The
current Internal.14 rejection is the reason the frontend program exists. Re-run
#221 only on a coherent repaired signed candidate after shared-root adoption.

### Issue #226 — OPEN

Installed Phase 7 performance/reliability certification remains open. Ordinary
Internal.14 startup was observed as taking many minutes. Measure exact cold-start
stages first; then fix measured bottlenecks and certify T470/floor/eight-hour
budgets. Do not trade away accessibility, durability, recovery or required
background work just to improve timing.

## Protected source/browser checkpoints that remain valid

PR #220 remains the Phase 5 protected source/browser checkpoint and PR #223 remains
the Phase 6 protected source/browser + Phase 7 measurement checkpoint. Their green
evidence remains valid for the exact thing each head proved.

The later Founder-installed rejection shows that those browser/source checks were
not sufficient whole-product experience acceptance. It does not erase the
checkpoints and it does not reopen proven Phase 1–4 engines generically.

## NEXT implementation dependency — frontend foundation authority

The next coherent implementation package begins from then-current protected
`main`, after confirming no other implementation PR/agent is active.

Do not start broad route styling first. Complete the shared-root audit and freeze
one foundation contract covering:

- Arabic/Latin typography and readable density;
- semantic tokens for surfaces, spacing, borders, radius/elevation, semantic
  status, focus, charts and motion;
- excellent light/dark foundations plus coordinated theme/accent families;
- restrained reduced-motion-safe motion;
- atomic locale/direction switching;
- logical RTL/mixed-direction geometry;
- application shell and shallow task-shaped navigation;
- shared notices/warnings, tables/lists, forms, KPI/status, charts, overlays,
  loading/empty/degraded/recovery states.

### Reconnaissance already proven

The current locale/direction architecture has a concrete cross-boundary mismatch:

- `src/stores/ui-store.ts` updates the cookie/client locale;
- `src/hooks/use-i18n.ts` switches client translations and mutates `<html lang>` /
  `<html dir>` after mount;
- `src/app/(dashboard)/layout.tsx` derives locale/direction on the server and
  passes `serverDir` to the client shell;
- `src/components/layout/sidebar.tsx` derives its `isRtl` state from that server
  prop.

A client locale switch can therefore change text/document direction while the
sidebar still holds stale server-direction state. Fix locale, document direction
and server-derived shell direction as one coherent transition rather than adding
route-local RTL workarounds.

Theme reconnaissance found the pre-hydration script and custom `ThemeProvider`
sharing `localStorage('theme')`; every additional theme mutator/selector must be
inventoried before freezing one authority. `globals.css` also contains accumulated
older animation/status/hover layers plus a later “Foundation v2” spacing/type
section. Normalize the existing layers rather than append another disconnected
system.

## Mandatory order from here

1. finish frontend foundation reconnaissance and contract;
2. adopt the shared roots in production, prioritizing Inbox, AI Agents and
   Settings and then the complete route inventory;
3. rerun installed Phase 6 AR/FR/EN, Arabic joining/reading, RTL geometry,
   1366×768/zoom, keyboard/focus/semantics and reduced-motion evidence;
4. measure/fix/certify Phase 7 under #226;
5. finish live #230 production/network trial certification;
6. build/install one coherent signed candidate on the Founder T470;
7. obtain explicit whole-product Founder acceptance;
8. only then begin Phase 8 implementation.

Phase 8 research/read-only planning may continue when it helps prepare the next
dependency.

## Lower-priority debt

Bounded stale source comments and legacy compatibility seams remain. Do not mix
those into the frontend-foundation PR unless a concrete defect/contract requires
it. Canonical parity and recovery evidence are mandatory for compatibility
retirement.

## Non-claims

- Internal.14 is not Founder-accepted.
- Founder-accepted truth remains Internal.5.
- Issue #230 is not production-certified.
- Issue #221 and #226 remain open.
- No Beta or Stable release exists.
- Phase 8 implementation has not begun.
