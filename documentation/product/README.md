# SahelFlow 1.0 — Authoritative Product Documentation

> **Status:** Founder-approved product baseline  
> **Prepared:** 2026-07-15  
> **Applies to:** SahelFlow 1.0 / major release 1

This directory is the authoritative product package produced by the Excellence Reset. It prevents historical visions, internal version labels, provisional ADRs and implementation claims from being treated as equally valid.

## Product authority order

When product documents conflict, use this order:

1. [`LAUNCH_CONSTITUTION.md`](LAUNCH_CONSTITUTION.md) — identity, commercial contract and non-negotiable launch standards.
2. [`FOUNDER_DECISIONS.md`](FOUNDER_DECISIONS.md) — founder-approved policies and choices.
3. [`LAUNCH_SCOPE_AND_ENTITLEMENTS.md`](LAUNCH_SCOPE_AND_ENTITLEMENTS.md) — included systems, exclusions, limits, expansion rights and launch gates.
4. [`CONTRADICTION_REGISTER.md`](CONTRADICTION_REGISTER.md) — implementation/evidence/documentation drift against those choices.
5. [`VERIFIED_CURRENT_STATE.md`](VERIFIED_CURRENT_STATE.md) — the pre-architecture source-audit baseline at its stated commit.
6. [`NEXT_SESSION_HANDOFF.md`](NEXT_SESSION_HANDOFF.md) — current implementation-phase starting instructions.
7. [`ARCHITECTURE_RESET_BRIEF.md`](ARCHITECTURE_RESET_BRIEF.md) — completed architecture-phase acceptance brief, retained for traceability.

The complete founder-approved product is translated into surfaces, functions, journeys and experience requirements by [`../vision/README.md`](../vision/README.md). [`../vision/SCOPE_GOVERNANCE.md`](../vision/SCOPE_GOVERNANCE.md) prevents recovered historical richness from silently expanding the frozen launch scope. Engineering details are governed by [`../architecture/README.md`](../architecture/README.md), the final Engineering Specification and active superseding ADRs. Implementation status is governed by the commit-linked Evidence Ledger.

All older documents are historical reference only unless explicitly revalidated and linked by a current authoritative document.

## Required implementation read order

Before feature coding:

1. Read this entire product directory.
2. Read [`../vision/README.md`](../vision/README.md) and its full read order:
   - [`../vision/UNIFIED_PRODUCT_VISION.md`](../vision/UNIFIED_PRODUCT_VISION.md)
   - [`../vision/SCOPE_GOVERNANCE.md`](../vision/SCOPE_GOVERNANCE.md)
   - [`../vision/FUNCTIONAL_CAPABILITY_ATLAS.md`](../vision/FUNCTIONAL_CAPABILITY_ATLAS.md)
   - [`../vision/EXPERIENCE_FRONTEND_CONSTITUTION.md`](../vision/EXPERIENCE_FRONTEND_CONSTITUTION.md)
   - [`../vision/JOURNEY_STATE_ATLAS.md`](../vision/JOURNEY_STATE_ATLAS.md)
   - [`../vision/MASTER_EXECUTION_PLAN.md`](../vision/MASTER_EXECUTION_PLAN.md)
   - [`../vision/TRACEABILITY_MATRIX.md`](../vision/TRACEABILITY_MATRIX.md)
   - [`../vision/HISTORICAL_RECONCILIATION.md`](../vision/HISTORICAL_RECONCILIATION.md)
3. Read [`../architecture/ENGINEERING_SPECIFICATION.md`](../architecture/ENGINEERING_SPECIFICATION.md).
4. Read [`../architecture/ADR_INDEX.md`](../architecture/ADR_INDEX.md) and [`../architecture/SUPERSEDING_ADRS.md`](../architecture/SUPERSEDING_ADRS.md).
5. Read [`../architecture/EVIDENCE_LEDGER.md`](../architecture/EVIDENCE_LEDGER.md), [`../architecture/IMPLEMENTATION_ROADMAP.md`](../architecture/IMPLEMENTATION_ROADMAP.md) and [`../architecture/CODING_WORKFLOW.md`](../architecture/CODING_WORKFLOW.md).
6. Start with roadmap Milestone M0. Do not bypass authority, migration, security or durability dependencies to build visible features early.

## Rules

- A feature is not complete because a screen, schema, adapter, test or document exists.
- Claims such as `secure`, `hardened`, `AAA`, `real-time`, `offline`, `zero data loss`, `supported`, `Stable` or `best` require evidence linked to an exact commit/artifact and acceptance gate.
- Founder decisions define the product contract. The vision package defines complete coverage. Scope Governance classifies recovered detail. Engineering specifications and ADRs define how it is implemented. Evidence records define what is proven.
- Historical labels such as v3, v4.1, v4.2, session numbers, design-system generations and Maze Map phases are not public product versions.
- The first public stable product is **SahelFlow 1.0**.
- Founder choices may be reopened only for a proven critical impossibility, security/legal issue or unsustainable economics, through a superseding evidence-backed decision.
