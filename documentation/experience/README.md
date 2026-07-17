# SahelFlow 1.0 — Experience Authority

> **Status:** Active product-experience authority  
> **Product authority:** `../product/`  
> **Engineering authority:** `../architecture/`

This directory preserves the unique durable product-experience content recovered from the Session 40 Maze Map and its later vision-recovery work. It sits between the Founder-approved product contract and the engineering architecture.

This package is the focused correction to the documentation structure merged in PR #95. Where the documentation-system description in `../architecture/CURRENT_TO_TARGET_ANALYSIS.md` omits a separate experience layer, this later package and the current root/product/architecture indexes govern the read order.

It answers three different questions:

1. **How must SahelFlow feel and behave?** — the Experience and Frontend Constitution.
2. **What complete capabilities and operational depth are intended?** — the Functional Capability Atlas.
3. **How do real users move through the system, including failure and recovery?** — the Journey and State Atlas.

## Read order

1. [`EXPERIENCE_FRONTEND_CONSTITUTION.md`](EXPERIENCE_FRONTEND_CONSTITUTION.md) — UI/UX, frontend state authority, design-system layers, typography, spacing, density, motion, Arabic/RTL, accessibility, low-end behavior and page-completion rules.
2. [`FUNCTIONAL_CAPABILITY_ATLAS.md`](FUNCTIONAL_CAPABILITY_ATLAS.md) — detailed capability depth across every product surface and domain.
3. [`JOURNEY_STATE_ATLAS.md`](JOURNEY_STATE_ATLAS.md) — shared operational state vocabulary and complete end-to-end journeys, including interruption, denial, degradation and recovery.

## Authority and scope rules

- The Product Constitution, Founder Decisions and Launch Scope/Entitlements remain superior product authority.
- The Capability Atlas preserves intended product depth; it is not permission to silently add excluded or post-1.0 scope.
- The Experience Constitution is binding for any page, workflow, shared component, PWA, storefront or founder-admin implementation unless a newer Founder decision or accepted ADR explicitly supersedes a rule.
- The Journey Atlas defines required behavioral completeness. A happy path alone does not complete a journey.
- The Engineering Specification defines system boundaries and invariants.
- The Current-to-Target Analysis determines what exists now, what is missing and whether implementation should be kept, hardened, migrated, replaced or retired.
- The Implementation Roadmap controls dependency order.

## Completion rule

A feature is not complete merely because its data model or main screen exists. Its relevant capability, journey states, permission behavior, Arabic/RTL behavior, accessibility, low-end behavior, failure recovery and evidence must all be addressed.

These documents preserve the Maze Map's durable richness without restoring its superseded pricing, single-user, local-only, polling-only, backup, licensing, platform or release assumptions.