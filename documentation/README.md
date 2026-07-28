# SahelFlow documentation

> **Status:** Active documentation entry point
> **Documentation-reset merge:** PR #154 at `5e0527289d7cc3ff06a0e6d4307f6fb125f358ae`
> **Protected-main Internal.11 signed checkpoint:**
> `1b9c52235a37d4593c2fffa3c397b85498aba7fd`
> **Protected-main combined source checkpoint:** PR #170 at
> `6cd1103b55c905d26492ecf5436e644d377ce557`
> **Milestone source request:** `1.0.0-internal.13` / MSI `1.0.0.13`; not signed
> or published until the exact protected-main release workflow passes
> **Accepted installed release:** `1.0.0-internal.5`
> **Current installation:** Founder reports `1.0.0-internal.11` installed, not
> Founder-accepted because first and subsequent launches remain materially slow
> and exact post-install preservation/lifecycle evidence is open
> **Latest signed candidate:** `1.0.0-internal.11`, run `30244003253`
> **Operating model:** FD-027 / SahelFlow Completion Operating Model v2
> **Execution epic:** issue #164
> **Last updated:** 2026-07-28

This directory is the durable shared brain for SahelFlow. It defines the finished
product, records source-grounded current state, orders the work, and lets the Web
Agent and Desktop Agent continue through GitHub without depending on chat.

The active authority is intentionally limited to ten documents. Historical
research may remain under `archive/`, but it is evidence and context—not current
product or implementation truth. Issue #164 tracks execution but does not become
an eleventh documentation authority.

## Read order

1. [`product/PRODUCT.md`](product/PRODUCT.md) — public promise, launch scope,
   commercial boundaries and Stable gate.
2. [`product/EXPERIENCE.md`](product/EXPERIENCE.md) — capabilities, journeys,
   operational states and AAA experience standard.
3. [`product/DECISIONS.md`](product/DECISIONS.md) — numbered Founder decisions;
   FD-027 governs the compressed multi-phase program.
4. [`system/ARCHITECTURE.md`](system/ARCHITECTURE.md) — target system,
   invariants, security and data authority.
5. [`system/CURRENT_STATE.md`](system/CURRENT_STATE.md) — what merged `main`
   implements and what exact evidence exists.
6. [`system/ROADMAP.md`](system/ROADMAP.md) — dependency order plus the four-session
   execution overlay.
7. [`operations/WORKFLOW.md`](operations/WORKFLOW.md) — Operating Model v2,
   lanes, WIP, review, CI, milestone release and evidence rules.
8. [`operations/WORKING_MEMORY.md`](operations/WORKING_MEMORY.md) — compact
   execution frontier and exact Session 1 start.
9. [`research/RESEARCH.md`](research/RESEARCH.md) — adopted research findings and
   retained research index.

This file is the tenth active document.

## Authority and precedence

When statements overlap, use this order:

1. newer numbered Founder decision for the choice it explicitly changes;
2. `PRODUCT.md` for public promise, scope, price, entitlements and Stable;
3. `EXPERIENCE.md` for capability depth, journeys, states and user quality;
4. `ARCHITECTURE.md` for boundaries, invariants and technical safety;
5. `CURRENT_STATE.md` for merged implementation and evidence;
6. `ROADMAP.md` for dependency and multi-session order;
7. `WORKFLOW.md` for execution, review, CI, release and evidence;
8. `WORKING_MEMORY.md` for the current execution frontier;
9. `RESEARCH.md` and `archive/` for non-authoritative evidence/context.

A lower layer cannot silently weaken a higher one. Code, tests, research,
historical plans and agent preferences do not override an explicit Founder
decision. Reconcile contradictions in the owning document before dependent work.

## Truth model

SahelFlow tracks separate realities:

| Reality | Authority |
|---|---|
| Integrated source | protected `main` and exact commit |
| Signed distributable | exact-source signed Internal/Beta/Stable artifact |
| Founder-observed app | installed version and recorded reference-machine result |
| Public Stable | representative beta plus external/security/legal/rollout gates |

`CURRENT_STATE.md` describes merged source and names its evidence.
`WORKING_MEMORY.md` describes the active frontier and next execution.

## Completion Operating Model v2

FD-027 supersedes the old one-version-per-work-package cadence:

- ordinary source-complete packages may merge without app-version bumps;
- one coherent milestone/session receives the unique immutable Internal version;
- at most one frozen signed candidate is in flight while independent work
  continues;
- shared contracts remain dependency-serialized;
- sessions advance multiple phases through bounded lanes;
- Arabic/RTL, accessibility, complete page states and performance are blocking
  continuous requirements;
- P0/P1 block; P2/P3 become focused follow-ups;
- routine Internal drafts auto-publish only after every protected release gate;
- Beta and Stable require explicit Founder approval.

The four sessions target a complete Founder AAA candidate. They cannot fabricate
representative seller beta, live provider certification, independent
security/privacy/Law 18-07 review, restore/incident drills, compatibility matrix
or Stable promotion.

## Status vocabulary

- **Implemented** — coherent source exists and stated source-level checks pass.
- **Proven** — required named environment, artifact or real-machine evidence
  exists.
- **Partial** — useful implementation exists but depth, authority, recovery or
  proof is incomplete.
- **Unsafe** — current behavior can violate a target invariant.
- **Missing** — target capability is not meaningfully implemented.
- **Unverified** — source exists but required external/installed proof does not.
- **Conditional** — may be public only after certification.

The dispositions are **keep**, **harden**, **migrate**, **replace**, **retire
after proof**, and **defer**.

## Update rules

- Merged implementation/evidence changes update `CURRENT_STATE.md`.
- Direction, lane ownership or next action updates `WORKING_MEMORY.md`.
- Founder decisions update `DECISIONS.md` and the affected owner.
- Architecture, product, experience, roadmap and workflow changes update their
  existing owner; they do not create another permanent plan or handoff.
- Generated inventories remain generated evidence rather than permanent docs.
- Ordinary chronology belongs in commits, PRs, Actions runs, releases and issue
  #164 comments.

## Archive policy

`archive/` may retain valuable dated research, design or engineering evidence.
Archived material:

- is never active authority;
- must be revalidated before adoption;
- may contain obsolete implementation claims;
- does not need copying into Working Memory;
- may be removed when Git history is sufficient.

Credentials, signing material, private seller data and secret values never
belong in documentation, prompts, commits, PRs or evidence artifacts.
