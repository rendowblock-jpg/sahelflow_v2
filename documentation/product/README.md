# SahelFlow 1.0 — Product Authority

> **Status:** Founder-approved product baseline  
> **Applies to:** SahelFlow major release 1

This directory contains the complete product contract. It intentionally excludes temporary current-state reports, implementation handoffs and architecture-phase records.

## Read order

1. [`LAUNCH_CONSTITUTION.md`](LAUNCH_CONSTITUTION.md) — product identity, market, commercial contract and non-negotiable standards.
2. [`FOUNDER_DECISIONS.md`](FOUNDER_DECISIONS.md) — explicit numbered Founder-approved choices and change control.
3. [`LAUNCH_SCOPE_AND_ENTITLEMENTS.md`](LAUNCH_SCOPE_AND_ENTITLEMENTS.md) — launch systems, conditional capabilities, exclusions, limits, resource entitlements, performance targets and evidence gates.

## Conflict rule

- A newer numbered Founder decision wins only for the choice it explicitly says it changes or supersedes.
- Otherwise the Launch Constitution governs the product promise, and Launch Scope/Entitlements applies that promise to Stable inclusion, conditional capability, exclusions, limits and gates.
- No lower documentation layer, code path, test result or implementation convenience may silently weaken this package.
- When an ambiguity affects price, inclusion, exclusion, entitlement, support, authority or public claims, record an explicit Founder decision before implementation relies on an interpretation.

## Product-experience relationship

The product contract states **what SahelFlow must be**. The active experience package defines the required depth and quality of how included product capabilities are experienced:

- [`../experience/EXPERIENCE_FRONTEND_CONSTITUTION.md`](../experience/EXPERIENCE_FRONTEND_CONSTITUTION.md) — UI/UX, frontend, design-system, typography, spacing, density, motion, Arabic/RTL, accessibility and page-completion authority.
- [`../experience/FUNCTIONAL_CAPABILITY_ATLAS.md`](../experience/FUNCTIONAL_CAPABILITY_ATLAS.md) — detailed intended capability depth across all surfaces and domains.
- [`../experience/JOURNEY_STATE_ATLAS.md`](../experience/JOURNEY_STATE_ATLAS.md) — shared operational states and complete end-to-end behavior, including interruption, denial, degradation and recovery.

The Launch Scope and explicit exclusions remain superior. Rich capability documentation cannot silently expand Stable scope or restore superseded Maze Map assumptions. A capability not clearly required or conditional by this product package is treated as a candidate until the Founder classifies it.

## Engineering relationship

- [`../architecture/ENGINEERING_SPECIFICATION.md`](../architecture/ENGINEERING_SPECIFICATION.md) translates the product and experience contract into target system boundaries and invariants.
- [`../architecture/CURRENT_TO_TARGET_ANALYSIS.md`](../architecture/CURRENT_TO_TARGET_ANALYSIS.md) compares the real codebase with the finished product and experience.
- [`../architecture/IMPLEMENTATION_ROADMAP.md`](../architecture/IMPLEMENTATION_ROADMAP.md) defines the dependency-correct work path.
- Evidence proves implementation; it does not redefine the product contract or experience requirements.

## Rules

- A feature is not complete because a page, schema, adapter, test or document exists.
- Founder choices are not silently reduced to fit current code.
- Happy-path UI alone does not satisfy a capability or journey.
- Historical v3/v4 labels, session numbers, percentages, test counts and “production hardened” claims are not public product versions or readiness evidence.
- The first public Stable product is **SahelFlow 1.0**.
- Product choices may be reopened only through an explicit Founder decision after a proven critical impossibility, legal issue or unsustainable economics.
- Current-state and implementation progress belong in the architecture analysis, roadmap, pull requests and working memory—not new product-status documents.