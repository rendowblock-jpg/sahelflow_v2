# SahelFlow 1.0 Engineering Authority

**Status:** Active architecture and delivery authority  
**Audit baseline:** `03f0d48436b42788e463bbd1d74a388b2da22294` (`main`, 2026-07-15)  
**Product authority:** `documentation/product/`  
**Vision authority:** `documentation/vision/`

This directory supersedes the historical architecture, planning, readiness, and release claims elsewhere in the repository. Historical documents remain useful evidence, but they are not implementation authority.

The architecture package defines safety, authority, protocol, dependency and evidence. The vision package defines the complete product, functional, journey and experience coverage that must be delivered through those safe foundations. Scope Governance prevents recovered historical depth from silently expanding the frozen launch. Neither package is complete without the other.

## Read order

1. [`../product/README.md`](../product/README.md)
2. [`../product/LAUNCH_CONSTITUTION.md`](../product/LAUNCH_CONSTITUTION.md)
3. [`../product/FOUNDER_DECISIONS.md`](../product/FOUNDER_DECISIONS.md)
4. [`../product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md`](../product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md)
5. [`../vision/README.md`](../vision/README.md)
6. [`../vision/UNIFIED_PRODUCT_VISION.md`](../vision/UNIFIED_PRODUCT_VISION.md)
7. [`../vision/SCOPE_GOVERNANCE.md`](../vision/SCOPE_GOVERNANCE.md)
8. [`../vision/FUNCTIONAL_CAPABILITY_ATLAS.md`](../vision/FUNCTIONAL_CAPABILITY_ATLAS.md)
9. [`../vision/EXPERIENCE_FRONTEND_CONSTITUTION.md`](../vision/EXPERIENCE_FRONTEND_CONSTITUTION.md)
10. [`../vision/JOURNEY_STATE_ATLAS.md`](../vision/JOURNEY_STATE_ATLAS.md)
11. [`../vision/MASTER_EXECUTION_PLAN.md`](../vision/MASTER_EXECUTION_PLAN.md)
12. [`../vision/TRACEABILITY_MATRIX.md`](../vision/TRACEABILITY_MATRIX.md)
13. [`../vision/HISTORICAL_RECONCILIATION.md`](../vision/HISTORICAL_RECONCILIATION.md)
14. [`ENGINEERING_SPECIFICATION.md`](ENGINEERING_SPECIFICATION.md)
15. [`ADR_INDEX.md`](ADR_INDEX.md)
16. [`SUPERSEDING_ADRS.md`](SUPERSEDING_ADRS.md)
17. [`REPOSITORY_MAP.md`](REPOSITORY_MAP.md)
18. [`EVIDENCE_LEDGER.md`](EVIDENCE_LEDGER.md)
19. [`REUSE_MIGRATION_DELETION_PLAN.md`](REUSE_MIGRATION_DELETION_PLAN.md)
20. [`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md)
21. [`CODING_WORKFLOW.md`](CODING_WORKFLOW.md)
22. [`PROVIDER_CONTRACT_REGISTRY.md`](PROVIDER_CONTRACT_REGISTRY.md)
23. [`RUNBOOK_INDEX.md`](RUNBOOK_INDEX.md)
24. [`DOCUMENTATION_INVENTORY.md`](DOCUMENTATION_INVENTORY.md)

## Authority rules

- Product choices are fixed by the Constitution and founder decisions.
- The vision package is the active authority for product coverage, functions, journeys, surfaces and experience standards.
- Scope Governance classifies vision detail as founder-required, necessary launch depth, recovered candidate or post-1.0/excluded.
- Engineering choices are fixed by the active ADR set in this directory.
- A later decision supersedes an earlier one only through a new ADR that names the prior record and migration consequence.
- A feature is not launch-ready because code exists. Launch readiness requires the evidence defined in the Engineering Specification and Evidence Ledger.
- A milestone cannot be called complete if its architecture exits pass while its mapped product journeys, states or experience obligations remain uncovered.
- Claims in root or historical documentation that conflict with this package are obsolete.

## Audit method and limits

The audit pinned `main` to the commit above, read the complete authoritative product set in its required order, inspected the repository configuration, schema, runtime, security, licensing, backup, synchronization, storefront, PWA, provider, AI, automation, test, CI, release, and historical planning surfaces, and traced implementation claims to source files or commit history.

The repository's GitHub Actions jobs failed before executing any workflow step during this audit, including an audit-only export job. Therefore no new runtime, test, packaged-app, or provider result is asserted by this package. Existing implementation claims are classified conservatively until reproducible evidence is attached.

A subsequent history recovery reviewed the Maze Map, Session 40 research/validation, Excellence Reset, Session 22/23 plans and earlier UI/UX work. Durable product and experience requirements were extracted into `documentation/vision/`; superseded mechanics remain historical.

## Current conclusion

The existing application contains substantial reusable domain and UI work, but its launch architecture is not a hardening-only exercise. The current local-only, single-user, self-issued-license, polling-watermark, local-copy-backup, local-storefront, and shell-only-PWA foundations conflict with SahelFlow 1.0. The implementation roadmap deliberately preserves useful code while replacing the authorities and boundaries that cannot safely support the approved product.

Implementation must now preserve both the architecture dependency order and the complete vision coverage. UI/UX, onboarding, support, marketing, founder administration and page depth are horizontal product tracks—not a late cosmetic phase.
