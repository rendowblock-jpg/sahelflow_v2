# SahelFlow documentation

> **Status:** Active documentation entry point
> **Governing decisions:** FD-028 — Final Completion Program; FD-029 — Uncompromised AAA completion and disciplined delivery; FD-030 — Phase 3 provider-certification boundary
> **Live protected main:** `8ebf78ddbbfcbdc5a61c607b591dc9d3beb4a59f`
> **Latest application-changing protected merge:** PR #207 at `8ebf78ddbbfcbdc5a61c607b591dc9d3beb4a59f`
> **Latest protected authority merge:** PR #207 at `8ebf78ddbbfcbdc5a61c607b591dc9d3beb4a59f`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13`, protected run `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Active product phase:** Phase 5 — whole-product AAA UI/UX
> **Execution mode:** single-agent, audit-first, batch remediation and tiered CI
> **Active implementation outcome:** Phase 5 package not yet opened; begin from protected `main`
> **Active product branch/PR:** none
> **Phase 4 closure:** PR #207 merged; issue #204 completed
> **Retained installed evidence:** issues #201 and #214
> **Execution epic:** issue #164
> **Last updated:** 2026-08-07

Live protected `main` must be re-read directly from GitHub before every session.
The commit above is the exact protected source frontier at this update; it is not a
permanent substitute for live repository state.

Phase 4 — data protection, recovery, migrations and security — is now
**protected-source closed** through PR #207. The complete P4-A…P4-F source package
is on protected `main`, and issue #204 is closed. The final product head before the
closure-control commits had green source quality, documentation audit, coverage,
production dependency audit, Tauri release smoke, Windows standalone and Windows
Rust parity. Its exact MSI also built, installed, launched, closed/reopened and
passed authenticated hydrated WebView UI proof twice.

One evidence boundary is deliberately retained rather than misrepresented as
passing: the installed replacement-install drill did not reach backup/restore
because disposable CI trial activation returned HTTP 503 with
`LICENSE_TRIAL_SERVICE_UNAVAILABLE`. Issue #214 owns that post-Phase 4
release/certification proof. It does not reopen Phase 4 or block Phase 5, but it
still blocks any claim that replacement-install recovery is installed/certified.

This directory is the durable shared brain for SahelFlow. It defines the finished
product, required experience, engineering invariants, merged-source truth, final
dependency order, research/delivery process and exact execution frontier.

The active authority remains intentionally limited to ten Markdown documents.
Issue #164 tracks execution but is not an eleventh product or architecture
authority. Historical Phase 4 issue #204 records the completed phase; issues #201
and #214 retain later installed-evidence obligations. Reports under `archive/` are
context only until revalidated and adopted by an active owner.

## Read order

1. [`product/PRODUCT.md`](product/PRODUCT.md) — public promise, Stable scope,
   commercial boundaries, entitlements and exclusions.
2. [`product/EXPERIENCE.md`](product/EXPERIENCE.md) — capabilities, journeys,
   operational states, page completion and AAA experience standard.
3. [`product/DECISIONS.md`](product/DECISIONS.md) — numbered Founder decisions;
   FD-028 owns the final program and FD-029 owns uncompromised AAA delivery.
4. [`system/ARCHITECTURE.md`](system/ARCHITECTURE.md) — target system, data
   authority, protocols, invariants, security and recovery.
5. [`system/CURRENT_STATE.md`](system/CURRENT_STATE.md) — merged implementation,
   named evidence and current discontinuities.
6. [`system/ROADMAP.md`](system/ROADMAP.md) — Phase 0–9 dependency order and exit
   gates.
7. [`operations/WORKFLOW.md`](operations/WORKFLOW.md) — single-agent execution,
   audit-first planning, Problem Register, tiered CI, review, release and evidence.
8. [`operations/WORKING_MEMORY.md`](operations/WORKING_MEMORY.md) — compact live
   Phase 5 frontier, retained evidence and exact next task.
9. [`research/RESEARCH.md`](research/RESEARCH.md) — research protocol, adopted
   findings and revalidation triggers.
10. This file — documentation map and authority rules.

## Authority precedence

When statements overlap, use this order:

1. newer numbered Founder decision for the exact choice it changes;
2. `PRODUCT.md` for public promise, scope, price, entitlements and Stable;
3. `EXPERIENCE.md` for capability, journey, state and user-quality requirements;
4. `ARCHITECTURE.md` for technical authority, invariants and safety;
5. `CURRENT_STATE.md` for merged implementation and evidence;
6. `ROADMAP.md` for dependency and completion order;
7. `WORKFLOW.md` for research, execution, review, CI and release;
8. `WORKING_MEMORY.md` for the current frontier;
9. `RESEARCH.md` and archive for evidence and context.

A lower layer cannot silently weaken a higher layer. Code, tests, issues, external
research and agent preference do not override Founder/product authority.
Contradictions are reconciled in the owning document before dependent work.

## Truth model

SahelFlow separates these realities:

| Reality                            | Authority                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Integrated source                  | live protected `main` and exact commit                                                                    |
| Proposed source                    | exact branch and PR head                                                                                  |
| Latest application-changing source | exact protected merge that changed product behavior                                                       |
| Signed distributable               | exact-source signed Internal/Beta/Stable artifact                                                         |
| Founder-observed app               | exact installed version and recorded machine result                                                       |
| Founder AAA Candidate              | all Required internal implementation/evidence gates                                                       |
| Public Stable                      | representative beta plus provider, security, privacy, legal, recovery, compatibility and rollout evidence |

A lower reality cannot claim a higher one.

## Current protected truth

- PR #195 protected the repaired Golden COD and durable identity/Teams boundary.
- PR #197 protected signed installation-level licensing.
- PR #199 protected the single-agent AAA execution model.
- PR #200 protected Tauri-owned native multi-shop lifecycle authority; issue #201
  retains its bounded installed-evidence/waiver-cleanup obligation.
- PR #203 merged Phase 3 at `aa4ca0758fd696f4b02fc1975629ac698f9349c3`
  from validated head `f0db4116874238d0c415b4725cd2c5f3ef6201da`.
- Final required Phase 3 run `30901725446` passed source/database/migration tests,
  TypeScript, ESLint, 80%+ coverage and a zero-vulnerability production audit.
- Issue #202 is closed and no known Phase 3 P0/P1 remains.
- FD-030 retains real provider certification for Phase 9 representative beta.
- PR #206 protected the Phase 4 exhaustive audit and contract freeze, including
  the P4-001…P4-013 Problem Register and consequence-based risk lanes.
- PR #207 protected the complete Phase 4 implementation at
  `8ebf78ddbbfcbdc5a61c607b591dc9d3beb4a59f`; issue #204 is completed.
- Issue #214 retains the unproven installed replacement-install recovery drill.
- Internal.13 remains the published and Founder-installed executable; no Phase 4
  version bump, new signed MSI, Founder acceptance, Beta or Stable claim followed.

## Current execution model

The Founder-selected permanent operating pattern remains:

- one active implementation agent at a time;
- complete phase/package audit before production edits;
- one consolidated Problem Register grouped by root cause;
- coherent batch remediation rather than drip-fed loops;
- Level 1 Task Gate after every coherent task;
- Level 2 Phase Checkpoint before closure, except for an explicit scoped Founder
  closure exception that carries named unproven evidence forward;
- Level 3 Major Full Checkpoint after two phases by default or earlier for
  security, data, recovery, migration, native and irreversible-provider risk;
- complete whole-product AAA frontend, multilingual, accessibility, performance,
  recovery and evidence obligations.

The PR #207 exception is narrow and historical: it closed Phase 4 at the
protected-source program layer while preserving installed replacement proof in
#214. It is not passing certification evidence and must never be used to support a
release, Beta, Stable or installed-recovery claim.

## Final completion model

0. authority freeze and execution reset;
1. canonical Golden COD business core;
2. identity, authorization, licensing and multi-shop;
3. durable providers, inbox, AI and automations;
4. data protection, recovery, migrations and security;
5. whole-product AAA UI/UX and frontend redesign;
6. Arabic, RTL and accessibility parity;
7. performance and reliability;
8. connected SahelFlow platform;
9. certification, representative beta and Stable.

Experience, Arabic/RTL, accessibility, performance, security, migration, recovery
and evidence travel continuously across functional phases.

## Active Phase 5 contract

Phase 5 transforms the complete application into one coherent top-tier
operational system. Before broad production edits, the active agent must inspect
the exact protected frontend and real authority paths, group defects by root cause
and freeze one coherent AAA implementation package.

The complete whole-product AAA frontend target includes:

- one SahelFlow-owned design system and governed chart foundation;
- professional information architecture, navigation and operational density;
- complete tables, filters, forms, bulk work and destructive ceremonies;
- complete happy, loading, empty, validation, permission, offline, pending, stale,
  conflict, error, retry, recovery and history states;
- every Required page using real authority and data;
- route-by-route visual regression and Founder visual acceptance.

Phase 5 must not reopen Phase 4 implementation. If work encounters the retained
installed replacement proof, reference issue #214 and keep it in its evidence
lane unless a Phase 5 change materially affects that boundary.

## AAA frontend rule

Every Required route and journey must converge on one SahelFlow-owned design
system and one governed chart foundation, with:

- professional information architecture and operational density;
- complete loading, empty, validation, permission, offline, pending, stale,
  conflict, error, retry, recovery, history and bulk states;
- Arabic, French and English parity;
- real RTL and mixed-direction handling;
- keyboard, focus, screen-reader, contrast, zoom and reduced motion;
- 1366×768 and responsive containment;
- low-end rendering and interaction budgets;
- visual regression and Founder visual acceptance.

Existing library presence or a screenshot does not prove AAA completion.

## Research-first rule

Every major phase and material implementation begins by:

- inspecting exact current SahelFlow source, tests and migrations;
- researching current primary standards and official documentation;
- evaluating mature implementations and relevant best-in-class operational
  products;
- considering Algerian COD, Windows, Arabic/French and constrained-network
  reality;
- comparing alternatives;
- adopting one measurable SahelFlow-specific standard with a revalidation trigger.

Research is bounded and does not become another roadmap.

## Completion rule

A capability or page is complete only when its real journey and every applicable
happy, validation, permission, duplicate, concurrency, loading, empty, offline,
stale, conflict, failure, retry, recovery, audit, Arabic/RTL, accessibility,
performance and preservation behavior pass at the required evidence layers.

A phase normally closes after its Level 2 checkpoint. A named Founder-directed
scoped exception may close protected-source phase status only when its unproven
evidence is explicitly retained and cannot be represented as passed. Public
Stable additionally requires real external and representative evidence.

## Update ownership

- Founder choice → `product/DECISIONS.md` and affected owner.
- Scope/public promise → `product/PRODUCT.md`.
- Capability/journey/UI standard → `product/EXPERIENCE.md`.
- Target invariant/protocol → `system/ARCHITECTURE.md`.
- Merged implementation/evidence → `system/CURRENT_STATE.md`.
- Phase/dependency order → `system/ROADMAP.md`.
- Research procedure/findings → `research/RESEARCH.md`.
- Delivery process → `operations/WORKFLOW.md`.
- Current frontier → `operations/WORKING_MEMORY.md`.
- Execution links/status → issue #164.

Update an existing owner. Do not create another permanent masterplan, gap report,
wave, prompt, status or handoff document.

## Archive policy

Archived material:

- is never active authority;
- may contain stale versions, claims and implementation judgments;
- must be revalidated before adoption;
- need not be copied into Working Memory;
- may be removed when Git history is sufficient.

Credentials, signing material, private seller data and secret values never belong
in documentation, prompts, commits, PRs, logs or evidence.
