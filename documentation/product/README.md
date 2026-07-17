# SahelFlow 1.0 — Product Authority

> **Status:** Founder-approved product baseline  
> **Applies to:** SahelFlow major release 1

This directory contains the complete product contract. It intentionally excludes temporary current-state reports, implementation handoffs and architecture-phase records.

## Authority order

1. [`LAUNCH_CONSTITUTION.md`](LAUNCH_CONSTITUTION.md) — product identity, market, commercial contract and non-negotiable standards.
2. [`FOUNDER_DECISIONS.md`](FOUNDER_DECISIONS.md) — explicit Founder-approved choices.
3. [`LAUNCH_SCOPE_AND_ENTITLEMENTS.md`](LAUNCH_SCOPE_AND_ENTITLEMENTS.md) — launch systems, exclusions, limits, resource entitlements, performance targets and evidence gates.

When those documents conflict, the earlier item in this list wins unless the Founder records a newer explicit decision.

## Product-experience relationship

The product contract states **what SahelFlow must be**. The active experience package defines the required depth and quality of how that product is experienced:

- [`../experience/EXPERIENCE_FRONTEND_CONSTITUTION.md`](../experience/EXPERIENCE_FRONTEND_CONSTITUTION.md) — UI/UX, frontend, design-system, typography, spacing, density, motion, Arabic/RTL, accessibility and page-completion authority.
- [`../experience/FUNCTIONAL_CAPABILITY_ATLAS.md`](../experience/FUNCTIONAL_CAPABILITY_ATLAS.md) — detailed intended capability depth across all surfaces and domains.
- [`../experience/JOURNEY_STATE_ATLAS.md`](../experience/JOURNEY_STATE_ATLAS.md) — shared operational states and complete end-to-end behavior, including interruption, denial, degradation and recovery.

The Launch Scope and explicit exclusions remain superior. Rich capability documentation cannot silently expand Stable scope or restore superseded Maze Map assumptions.

## Engineering relationship

- [`../architecture/ENGINEERING_SPECIFICATION.md`](../architecture/ENGINEERING_SPECIFICATION.md) translates the product contract into target system boundaries and invariants.
- [`../architecture/CURRENT_TO_TARGET_ANALYSIS.md`](../architecture/CURRENT_TO_TARGET_ANALYSIS.md) compares the real codebase with the finished product and experience.
- [`../architecture/IMPLEMENTATION_ROADMAP.md`](../architecture/IMPLEMENTATION_ROADMAP.md) defines the work path.
- Evidence proves implementation; it does not redefine the product contract or experience requirements.

## Rules

- A feature is not complete because a page, schema, adapter, test or document exists.
- Founder choices are not silently reduced to fit current code.
- Happy-path UI alone does not satisfy a capability or journey.
- Historical v3/v4 labels, session numbers, percentages, test counts and “production hardened” claims are not public product versions or readiness evidence.
- The first public Stable product is **SahelFlow 1.0**.
- Product choices may be reopened only through an explicit Founder decision after a proven critical impossibility, security/legal issue or unsustainable economics.
- Current-state and implementation progress belong in the architecture analysis, roadmap, pull requests and working memory—not new product-status documents.