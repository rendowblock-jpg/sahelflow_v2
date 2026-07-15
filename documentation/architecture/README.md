# SahelFlow 1.0 Engineering Authority

**Status:** Active architecture and delivery authority  
**Audit baseline:** `03f0d48436b42788e463bbd1d74a388b2da22294` (`main`, 2026-07-15)  
**Product authority:** `documentation/product/`

This directory supersedes the historical architecture, planning, readiness, and release claims elsewhere in the repository. Historical documents remain useful evidence, but they are not implementation authority.

## Read order

1. [`../product/README.md`](../product/README.md)
2. [`../product/LAUNCH_CONSTITUTION.md`](../product/LAUNCH_CONSTITUTION.md)
3. [`../product/FOUNDER_DECISIONS.md`](../product/FOUNDER_DECISIONS.md)
4. [`../product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md`](../product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md)
5. [`ENGINEERING_SPECIFICATION.md`](ENGINEERING_SPECIFICATION.md)
6. [`ADR_INDEX.md`](ADR_INDEX.md)
7. [`SUPERSEDING_ADRS.md`](SUPERSEDING_ADRS.md)
8. [`REPOSITORY_MAP.md`](REPOSITORY_MAP.md)
9. [`EVIDENCE_LEDGER.md`](EVIDENCE_LEDGER.md)
10. [`REUSE_MIGRATION_DELETION_PLAN.md`](REUSE_MIGRATION_DELETION_PLAN.md)
11. [`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md)
12. [`CODING_WORKFLOW.md`](CODING_WORKFLOW.md)
13. [`PROVIDER_CONTRACT_REGISTRY.md`](PROVIDER_CONTRACT_REGISTRY.md)
14. [`RUNBOOK_INDEX.md`](RUNBOOK_INDEX.md)
15. [`DOCUMENTATION_INVENTORY.md`](DOCUMENTATION_INVENTORY.md)

## Authority rules

- Product choices are fixed by the Constitution and founder decisions.
- Engineering choices are fixed by the active ADR set in this directory.
- A later decision supersedes an earlier one only through a new ADR that names the prior record and migration consequence.
- A feature is not launch-ready because code exists. Launch readiness requires the evidence defined in the Engineering Specification and Evidence Ledger.
- Claims in root or historical documentation that conflict with this package are obsolete.
- Feature implementation must not begin until this package is merged into `main`.

## Audit method and limits

The audit pinned `main` to the commit above, read the complete authoritative product set in its required order, inspected the repository configuration, schema, runtime, security, licensing, backup, synchronization, storefront, PWA, provider, AI, automation, test, CI, release, and historical planning surfaces, and traced implementation claims to source files or commit history.

The repository's GitHub Actions jobs failed before executing any workflow step during this audit, including an audit-only export job. Therefore no new runtime, test, packaged-app, or provider result is asserted by this package. Existing implementation claims are classified conservatively until reproducible evidence is attached.

## Current conclusion

The existing application contains substantial reusable domain and UI work, but its launch architecture is not a hardening-only exercise. The current local-only, single-user, self-issued-license, polling-watermark, local-copy-backup, local-storefront, and shell-only-PWA foundations conflict with SahelFlow 1.0. The implementation roadmap deliberately preserves useful code while replacing the authorities and boundaries that cannot safely support the approved product.
