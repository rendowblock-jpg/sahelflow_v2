# SahelFlow documentation

> **Status:** Active documentation entry point
> **Documentation-reset merge:** PR #154 at `5e0527289d7cc3ff06a0e6d4307f6fb125f358ae`
> **Protected-main Internal.9 checkpoint:** `d516e5fe3459f9e5efba15b6019f1e063a81c10c`
> **Accepted installed release:** `1.0.0-internal.5`
> **Current installation:** `1.0.0-internal.8`, not Founder-accepted
> **Latest signed release:** `1.0.0-internal.9`, updater bootstrap blocked
> **Last updated:** 2026-07-26

This directory is the durable shared brain for SahelFlow. It defines the finished
product, records the source-grounded current state, orders the work, and lets the
Web Agent and Desktop Agent continue through GitHub without depending on chat
history.

The active authority is intentionally limited to ten documents. Historical
research may remain under `archive/`, but archive material is evidence and
context—not current product or implementation truth.

## Read order

1. [`product/PRODUCT.md`](product/PRODUCT.md) — product promise, launch scope,
   commercial boundaries and Stable gate.
2. [`product/EXPERIENCE.md`](product/EXPERIENCE.md) — capabilities, journeys,
   operational states and AAA experience standard.
3. [`product/DECISIONS.md`](product/DECISIONS.md) — numbered Founder decisions.
4. [`system/ARCHITECTURE.md`](system/ARCHITECTURE.md) — target system,
   invariants, security and data authority.
5. [`system/CURRENT_STATE.md`](system/CURRENT_STATE.md) — what merged `main`
   actually implements and what evidence exists.
6. [`system/ROADMAP.md`](system/ROADMAP.md) — dependency-ordered path from the
   current baseline to Stable.
7. [`operations/WORKFLOW.md`](operations/WORKFLOW.md) — two-agent GitHub,
   review, evidence and continuous internal-update workflow.
8. [`operations/WORKING_MEMORY.md`](operations/WORKING_MEMORY.md) — compact
   in-progress checkpoint and exact next move.
9. [`research/RESEARCH.md`](research/RESEARCH.md) — adopted research findings
   and index of retained research evidence.

This file is the tenth active document.

## Authority and precedence

When statements overlap, use this order:

1. A newer numbered Founder decision for the choice it explicitly changes.
2. `PRODUCT.md` for the public promise, scope, price, entitlements and Stable
   boundaries.
3. `EXPERIENCE.md` for capability depth, journeys, states and user-facing
   quality.
4. `ARCHITECTURE.md` for system boundaries, invariants and technical safety.
5. `CURRENT_STATE.md` for implementation and evidence claims about merged
   `main`.
6. `ROADMAP.md` for dependency order.
7. `WORKFLOW.md` for execution, review, release and evidence.
8. `WORKING_MEMORY.md` for unmerged work only.
9. `RESEARCH.md` and `archive/` for non-authoritative evidence and context.

A lower layer cannot silently weaken a higher one. Code, tests, research,
historical plans and agent preferences do not override an explicit Founder
decision. Apparent contradictions are reconciled in the owning active document
before dependent implementation continues.

## Truth model

SahelFlow tracks three different realities and never conflates them:

| Reality | Authority |
|---|---|
| Integrated source | protected `main` and its exact commit |
| Signed distributable | exact-source signed internal/beta/stable artifact |
| Founder-observed app | latest version installed and accepted on the Founder machine |

`CURRENT_STATE.md` describes merged source and names its evidence. Its header
also records the latest signed and Founder-accepted installed versions.
`WORKING_MEMORY.md` records branches, PRs, builds or update candidates that have
not completed the whole chain.

## Status vocabulary

- **Implemented** — coherent source exists and the stated source-level checks
  pass.
- **Proven** — the required named environment, artifact or real-machine
  evidence exists.
- **Partial** — useful implementation exists but required depth, authority,
  recovery or proof is incomplete.
- **Unsafe** — the current behavior can violate a target invariant.
- **Missing** — the target capability is not meaningfully implemented.
- **Unverified** — source exists but the required external or installed proof
  does not.
- **Conditional** — may be public only after its certification gate passes.

The corresponding dispositions are **keep**, **harden**, **migrate**,
**replace**, **retire after proof**, and **defer**.

## Update rules

- A state-changing PR updates `CURRENT_STATE.md`.
- A direction, priority or in-flight handoff change updates
  `WORKING_MEMORY.md`.
- A Founder product decision updates `DECISIONS.md` and the affected owning
  document.
- Architecture, scope and workflow changes update their existing owner; they
  do not create another plan, gap report, wave document or handoff file.
- Generated route, API, model, migration, test and component inventories remain
  generated evidence rather than manually copied permanent documents.
- Ordinary chronology belongs in Git commits, PRs, Actions runs and releases.

## Archive policy

`archive/` may retain a small number of valuable dated research, design or
engineering-evidence snapshots whose full detail remains useful. The reset
retains five research reports, two experience source atlases, the superseding
ADR rationale, the Internal.5-era updater trust contract and a detailed
pre-Stable provider-certification template. Archived material:

- is never an active authority;
- must be revalidated before adoption;
- may contain historical implementation claims that are no longer true;
- does not need to be copied into Working Memory;
- may be removed later when Git history is sufficient.

Credentials, signing material, private seller data and secret values never
belong in documentation, prompts, commits, PRs or evidence artifacts.
