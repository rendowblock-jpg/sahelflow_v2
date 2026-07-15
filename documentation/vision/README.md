# SahelFlow 1.0 — Unified Vision Authority

> **Status:** Active product-experience and delivery authority  
> **Created:** 2026-07-15  
> **Applies to:** SahelFlow 1.0 / major release 1  
> **Authority relationship:** subordinate to `documentation/product/`, complementary to `documentation/architecture/`

This package restores the complete SahelFlow vision that became fragmented across early build plans, Session 22/23 masterplans, the Session 40 Maze Map, branch-only research and validation, and the Excellence Reset.

It does **not** reopen final founder decisions. It translates those decisions into a complete product, functional, experience, surface, journey and execution map so implementation cannot preserve the architecture while accidentally losing the product.

## Authority order

When documents conflict:

1. `documentation/product/LAUNCH_CONSTITUTION.md`
2. `documentation/product/FOUNDER_DECISIONS.md`
3. `documentation/product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md`
4. active architecture ADRs and `ENGINEERING_SPECIFICATION.md`
5. this vision package
6. historical plans, research, audits and branch-only documents

Historical content may supply a useful requirement, interaction pattern, validation method or implementation idea. It may not override a later founder decision, product boundary, security invariant or evidence requirement.

## Read order

1. [`UNIFIED_PRODUCT_VISION.md`](UNIFIED_PRODUCT_VISION.md) — north star, customer outcome and complete product shape.
2. [`FUNCTIONAL_CAPABILITY_ATLAS.md`](FUNCTIONAL_CAPABILITY_ATLAS.md) — every launch domain, function and surface.
3. [`EXPERIENCE_FRONTEND_CONSTITUTION.md`](EXPERIENCE_FRONTEND_CONSTITUTION.md) — UX, UI, frontend, accessibility, RTL and low-end standards.
4. [`JOURNEY_STATE_ATLAS.md`](JOURNEY_STATE_ATLAS.md) — end-to-end journeys and required operational states.
5. [`MASTER_EXECUTION_PLAN.md`](MASTER_EXECUTION_PLAN.md) — how the full vision overlays M0–M14 without violating dependencies.
6. [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md) — decision → capability → milestone → evidence.
7. [`HISTORICAL_RECONCILIATION.md`](HISTORICAL_RECONCILIATION.md) — what was recovered, modified, superseded or rejected.

Then read the engineering authority:

8. `documentation/architecture/ENGINEERING_SPECIFICATION.md`
9. `documentation/architecture/IMPLEMENTATION_ROADMAP.md`
10. `documentation/architecture/CODING_WORKFLOW.md`
11. `documentation/architecture/EVIDENCE_LEDGER.md`

## The anti-context-loss rule

A product idea is not safely preserved merely because it appears in an old document or source file. It is preserved only when it has:

- an authority source;
- a current decision status;
- a named capability or journey;
- a roadmap milestone and dependency;
- acceptance criteria;
- evidence requirements;
- an owner for implementation and verification.

No implementation issue is ready until those links exist.

## Change control

- Founder policy changes require a new numbered founder decision.
- Architecture changes require a superseding ADR.
- Experience principles may be refined only if the refinement preserves the product contract and does not weaken accessibility, Arabic/RTL, low-end parity, trust or evidence gates.
- A historical feature or mechanism may return only through explicit reconciliation in `HISTORICAL_RECONCILIATION.md`.
- This package must be updated whenever scope, journeys, surfaces or milestone coverage changes.
