# SahelFlow documentation

> **Status:** Active documentation entry point
> **Governing decision:** FD-028 — Final Completion Program and Research-First Quality Protocol
> **Protected-main baseline:** `b2776bd3ea8d879a475c26af9d0c720d666671a9`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13`, protected run `30366866703`
> **Founder-installed release:** Internal.11 reported installed; complete identity/lifecycle evidence open
> **Founder-accepted baseline:** Internal.5
> **Active phase:** Phase 0 — authority freeze and execution reset
> **Execution epic:** issue #164
> **Last updated:** 2026-07-29

This directory is the durable shared brain for SahelFlow. It defines the finished
product, the required experience and engineering invariants, what merged source
actually proves, the final dependency order, the research and delivery process,
and the exact current execution frontier.

The active authority remains intentionally limited to ten Markdown documents.
Issue #164 tracks execution but is not an eleventh documentation authority.
Historical reports under `archive/` are context only until revalidated and
adopted by an active owner.

## Read order

1. [`product/PRODUCT.md`](product/PRODUCT.md) — public promise, Stable scope,
   commercial boundaries, entitlements and exclusions.
2. [`product/EXPERIENCE.md`](product/EXPERIENCE.md) — capabilities, journeys,
   operational states, page completion and AAA experience standard.
3. [`product/DECISIONS.md`](product/DECISIONS.md) — numbered Founder decisions;
   FD-028 governs final completion and research-first implementation.
4. [`system/ARCHITECTURE.md`](system/ARCHITECTURE.md) — target system, data
   authority, protocols, invariants, security and recovery.
5. [`system/CURRENT_STATE.md`](system/CURRENT_STATE.md) — merged implementation,
   named evidence and exact known discontinuities.
6. [`system/ROADMAP.md`](system/ROADMAP.md) — final Phase 0–9 dependency order,
   research requirements and objective exit gates.
7. [`operations/WORKFLOW.md`](operations/WORKFLOW.md) — research gate, work
   packages, lanes, review, CI, release, evidence and anti-drift rules.
8. [`operations/WORKING_MEMORY.md`](operations/WORKING_MEMORY.md) — compact
   current frontier and exact next outcome.
9. [`research/RESEARCH.md`](research/RESEARCH.md) — research protocol, adopted
   findings, phase questions and source index.
10. This file — documentation map and authority rules.

## Authority and precedence

When statements overlap, use this order:

1. newer numbered Founder decision for the choice it explicitly changes;
2. `PRODUCT.md` for public promise, scope, price, entitlements and Stable;
3. `EXPERIENCE.md` for capability, journey, state and user-quality requirements;
4. `ARCHITECTURE.md` for technical authority, invariants and safety;
5. `CURRENT_STATE.md` for merged implementation and evidence;
6. `ROADMAP.md` for dependency and completion order;
7. `WORKFLOW.md` for research, execution, review, CI and release;
8. `WORKING_MEMORY.md` for the current frontier;
9. `RESEARCH.md` and archive for evidence and context.

A lower layer cannot silently weaken a higher layer. Code, tests, external
research, issues and agent preference do not override Founder/product authority.
Reconcile contradictions in the owning document before dependent work continues.

## Truth model

SahelFlow separates these realities:

| Reality | Authority |
|---|---|
| Integrated source | protected `main` and exact commit |
| Signed distributable | exact-source signed Internal/Beta/Stable artifact |
| Founder-observed app | exact installed version and recorded machine result |
| Founder AAA Candidate | all Required internal implementation/evidence gates |
| Public Stable | representative beta plus provider, security, privacy, legal, recovery, compatibility and rollout evidence |

A lower reality cannot claim a higher one.

Internal.13 is published and passed the protected signed workflow. It is not yet
Founder-installed or accepted on the T470, and publication does not prove the
full Golden COD Journey, whole-route AAA quality, provider certification or
Stable readiness.

## Final completion model

The obsolete four-session overlay is replaced by the final roadmap:

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

Experience, Arabic/RTL, accessibility, performance, security, migration,
recovery and evidence are continuous tracks across the functional phases.

## Research-first rule

Every major phase and material implementation begins by:

- inspecting exact current SahelFlow source and tests;
- researching current primary standards and official documentation;
- evaluating production implementations and relevant best-in-class products;
- considering Algerian COD, Windows, Arabic/French and constrained-network reality;
- comparing alternatives;
- adopting a SahelFlow-specific measurable standard.

Generic AI advice, visual trends, screenshots, adapter existence and unsourced
claims are not implementation authority.

## Completion rule

A capability or page is complete only when its real journey and every applicable
happy, validation, permission, duplicate, concurrency, loading, empty, offline,
stale, conflict, failure, retry, recovery, audit, Arabic/RTL, accessibility,
performance and preservation behavior pass at the required evidence layers.

Public Stable additionally requires real external and representative evidence.

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
- Execution status → issue #164.

Update an existing owner. Do not create another permanent masterplan, gap report,
wave, prompt, status or handoff document.

## Archive policy

Archived material:

- is never active authority;
- may contain stale versions, provider claims and implementation judgments;
- must be revalidated before adoption;
- need not be copied into Working Memory;
- may be removed when Git history is sufficient.

Credentials, signing material, private seller data and secret values never belong
in documentation, prompts, commits, PRs, logs or evidence.
