# SahelFlow 1.0 — Experience Authority

> **Status:** Active product-experience authority  
> **Product authority:** `../product/`  
> **Engineering authority:** `../architecture/`

This directory preserves the unique durable product-experience content recovered from the Session 40 Maze Map and its later vision-recovery work. It sits between the Founder-approved product contract and the engineering architecture.

It answers three different questions:

1. **How must SahelFlow feel and behave?** — the Experience and Frontend Constitution.
2. **What complete capabilities and operational depth are intended?** — the Functional Capability Atlas.
3. **How do real users move through the system, including failure and recovery?** — the Journey and State Atlas.

## Read order

1. [`EXPERIENCE_FRONTEND_CONSTITUTION.md`](EXPERIENCE_FRONTEND_CONSTITUTION.md) — UI/UX, frontend state authority, design-system layers, typography, spacing, density, motion, Arabic/RTL, accessibility, low-end behavior and page-completion rules.
2. [`FUNCTIONAL_CAPABILITY_ATLAS.md`](FUNCTIONAL_CAPABILITY_ATLAS.md) — detailed capability depth across every product surface and domain.
3. [`JOURNEY_STATE_ATLAS.md`](JOURNEY_STATE_ATLAS.md) — shared operational state vocabulary and complete end-to-end journeys, including interruption, denial, degradation and recovery.

## Scope classes

Every capability or journey is interpreted through the Founder product package:

- **Required** — explicitly required by the Launch Constitution, a Founder Decision or Launch Scope. It must be complete for Stable.
- **Conditional** — named by the product package but public only after its certification gate. It remains hidden, experimental or narrowly described until certified.
- **Depth requirement** — interaction, state, recovery or data-UX depth needed to make a required capability complete; it does not create a new commercial surface by itself.
- **Candidate** — useful recovered or planned capability not clearly required by the product package. It is not automatic Stable scope and needs Founder classification before it becomes a commitment.
- **Excluded** — prohibited for SahelFlow 1.0 by the product package.

When classification is unclear, treat the item as **Candidate**, not Required.

## Authority and conflict rules

- The Product Constitution, numbered Founder Decisions and Launch Scope/Entitlements remain superior product authority.
- The Capability Atlas preserves intended product depth; it cannot add an excluded or post-1.0 commitment.
- The Experience Constitution is binding for included pages, workflows, shared components, PWA, storefront and founder-admin behavior.
- An ADR may refine how an experience requirement is implemented, but it cannot weaken a Founder/product requirement without an explicit Founder decision.
- The Journey Atlas defines behavioral completeness. A happy path alone does not complete a journey.
- The Engineering Specification defines system boundaries and invariants.
- The Current-to-Target Analysis determines what exists now and whether implementation should be kept, hardened, migrated, replaced or retired.
- The Implementation Roadmap controls dependency order.
- An apparent experience/engineering conflict must be reconciled in the owning documents before coding continues; preserve product intent, security, data integrity, accessibility and recovery.

## Completion rule

A feature is not complete merely because its data model or main screen exists. Its scope class, capability depth, journey states, permission behavior, Arabic/RTL behavior, accessibility, low-end behavior, failure recovery and evidence must all be addressed.

These documents preserve the Maze Map's durable richness without restoring its superseded pricing, single-user, local-only, polling-only, backup, licensing, platform or release assumptions.