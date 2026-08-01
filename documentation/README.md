# SahelFlow documentation

> **Status:** Active documentation entry point
> **Governing decisions:** FD-028 — Final Completion Program; FD-029 — Uncompromised AAA completion and disciplined delivery
> **Phase 0 closeout base:** `18c45e474f58744b6f837372509154ca500044b0`
> **Current protected application baseline:** `731fb11528345354388b2716f3bd94f0fc73eafb`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13`, protected run `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Active phase:** Phase 2A — durable local identity and session authority
> **Active package:** Teams and permissions completion
> **Execution epic:** issue #164
> **Last updated:** 2026-08-01

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
   FD-028 governs final completion and FD-029 governs uncompromised AAA delivery
   without weakening the program.
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

Internal.13 is published, Founder-installed and exact-version confirmed on the
T470. The preserved AppData identity/database snapshot and authenticated Arabic
UI were observed, but startup remains over budget. Arabic chart visual behavior
and explicit Founder acceptance remain open. Neither publication nor installation
proves the full Golden COD Journey, whole-route AAA quality, provider
certification or Stable readiness.

Protected `main` contains the first production canonical Golden COD path: trusted
manual intake and confirmation/rejection through reservation and inventory
movement (PR #190), followed by packing, shipment, delivery and COD receivable
creation (PR #192). A narrow exact-process-shop authorization boundary (PR #191)
and the Windows-protected installation root with native rotation and installed-MSI
proof (PR #184) are merged supporting packages. These are partial protected phase
results.

Draft PR #195 assembled the intended Phase 1 source boundary at
`3783028396f3b0c4afa43f33fdd3c1c6cc51789f` with normal CI `30652282305`
and checkpoint `30652282191`. Concrete P1 evidence found during later Teams review
on 2026-08-01 reopened its shared command-replay boundary. Phase 1 remains
reopened on the integration branch until same-person replay and affected order
authorization pass a new exact-head checkpoint.

Phase 2A packages 2A.1–2A.4 retain their historical checkpoint evidence on the
draft integration branch, but the shared replay boundary is reopened.
The latest closed package, multi-member roles, invitations and per-shop
permissions, passed at exact source head
`3266dc03994ffcb1672256465624ea715f0cf317`, normal CI `30681155150` and
checkpoint `30681155099`. It establishes installation-level invitation,
accepted-member and revocation authority, individual member credentials and
sessions, exact shop grants, role-bounded custom permissions, member-owned
reauthentication, control-first member revocation, owner administration and
member self-view in Arabic, French and English.

The sole-agent frozen adversarial pass found and closed revoked-login disclosure,
stale-owner queue authorization, cross-shop inventory exposure and wrong-shop
login false-success. It found no remaining P0/P1 and was not an independent
review.

The active package is now Teams and permissions completion: authoritative
assignments, workgroups, queues, comments, mentions, handovers, operational
action permissions and required field-level restrictions. Licensing and native
multi-shop remain later Phase 2 dependencies.

Implementation is intentionally paused at the exact frontier recorded in
`operations/WORKING_MEMORY.md`. A future coding session resumes from live GitHub
truth; this planning session is not implementation evidence.

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
