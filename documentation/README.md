# SahelFlow documentation

> **Status:** Active documentation entry point
> **Governing decisions:** FD-028 — Final Completion Program; FD-029 — Uncompromised AAA completion and disciplined delivery
> **Governance reset base:** `d3747f18f6a6e9e976dfb076d2b274bc21c3eca8`
> **Latest application-changing protected merge:** `04d4c51831c6e043ab39a614a7e947e6b27d01e6`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13`, protected run `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Active product phase:** Phase 2 — identity, authorization, licensing and multi-shop
> **Execution mode:** single-agent, audit-first, batch remediation and tiered CI
> **Next implementation outcome:** native multi-shop after governance closure
> **Execution epic:** issue #164
> **Last updated:** 2026-08-02

Live protected `main` must be re-read directly from GitHub before every session.
The governance base above records the exact source inspected to create this
package; it is not a permanent substitute for live repository state.

This directory is the durable shared brain for SahelFlow. It defines the finished
product, required experience, engineering invariants, merged-source truth, final
dependency order, research/delivery process and exact execution frontier.

The active authority remains intentionally limited to ten Markdown documents.
Issue #164 tracks execution but is not an eleventh product or architecture
authority. Historical reports under `archive/` are context only until revalidated
and adopted by an active owner.

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
   execution frontier and exact next outcome.
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

| Reality | Authority |
|---|---|
| Integrated source | live protected `main` and exact commit |
| Latest application-changing source | exact protected merge that changed product behavior |
| Signed distributable | exact-source signed Internal/Beta/Stable artifact |
| Founder-observed app | exact installed version and recorded machine result |
| Founder AAA Candidate | all Required internal implementation/evidence gates |
| Public Stable | representative beta plus provider, security, privacy, legal, recovery, compatibility and rollout evidence |

A lower reality cannot claim a higher one.

## Current protected truth

- PR #195 merged the repaired Phase 1 Golden COD boundary and Phase 2A
  identity/Teams source at
  `a3d53cdd21afa8f4d03eefa7088304a9f728e2a0`.
- PR #197 merged signed licensing authority at
  `04d4c51831c6e043ab39a614a7e947e6b27d01e6`.
- Licensing implementation head
  `25abbedd176429cf25e657217726d833e3c62a10` passed CI `30744598944`; all review
  threads were resolved.
- PR #198 merged the previous documentation frontier at
  `d3747f18f6a6e9e976dfb076d2b274bc21c3eca8`.
- No version bump, signed Phase 2 candidate or new installed claim accompanied
  those source merges.
- Native multi-shop remains the final Phase 2 implementation outcome.
- Complete Windows/Rust/signed-MSI/install/reopen/preserved-data proof remains the
  Phase 2 exit checkpoint.

## Current execution model

The Founder selected the following permanent operating pattern:

- one active implementation agent at a time;
- complete phase/package audit before production edits;
- one consolidated Problem Register grouped by root cause;
- coherent batch remediation rather than drip-fed one-problem loops;
- Level 1 Task Gate after every coherent completed task;
- Level 2 Phase Checkpoint before phase closure;
- Level 3 Major Full Checkpoint after every two phases by default, or earlier for
  high-risk native/security/data/recovery/provider authority;
- complete full-app AAA frontend transformation as a Stable requirement.

This executes FD-028 and FD-029 without reducing Required scope.

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

A phase closes only after its Level 2 checkpoint. High-risk phase groups also pass
the Level 3 checkpoint. Public Stable additionally requires real external and
representative evidence.

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
