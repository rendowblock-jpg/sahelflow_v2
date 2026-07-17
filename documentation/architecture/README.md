# SahelFlow 1.0 — Engineering Authority

> **Status:** Active  
> **Current code baseline:** `fd9fa97dfcf96e08ffa1273070e74c4bb6db980e`  
> **Product authority:** `../product/`

This directory holds one target architecture, one current-to-target model and one execution path. It replaces the former collection of overlapping current-state, contradiction, evidence, repository, reuse and session-handoff documents.

## Read order

1. [`../product/README.md`](../product/README.md)
2. [`ENGINEERING_SPECIFICATION.md`](ENGINEERING_SPECIFICATION.md) — finished-system boundaries and invariants.
3. [`CURRENT_TO_TARGET_ANALYSIS.md`](CURRENT_TO_TARGET_ANALYSIS.md) — real codebase, gaps, metrics and migration disposition.
4. [`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md) — dependency-correct program path.
5. [`CODING_WORKFLOW.md`](CODING_WORKFLOW.md) — lightweight work, review and evidence rules.
6. [`SUPERSEDING_ADRS.md`](SUPERSEDING_ADRS.md) — rationale and rejected alternatives when a decision needs deeper context.
7. [`PROVIDER_CONTRACT_REGISTRY.md`](PROVIDER_CONTRACT_REGISTRY.md) when work touches external-provider claims or live certification.

Operational drills are indexed in `CODING_WORKFLOW.md` and become separate runbooks only when implemented.

## Authority rules

- Founder product choices are governed by the product package.
- The Engineering Specification defines the target system and invariants.
- The current-to-target analysis defines the latest source-grounded implementation model.
- The roadmap defines sequencing, not permission or ceremony.
- A superseding ADR is needed only when an accepted architecture decision is reopened.
- Source inspection can classify implementation, but packaged/provider/device/recovery/security/user verification requires the appropriate evidence.
- Historical files and git history are context, not current authority.
- Do not create a second status ledger, contradiction register, repository map, reuse plan or session handoff. Update the active document that owns the information.

## Current conclusion

The application contains substantial reusable product and engineering work. It must be migrated through trusted local context, identity/entitlement/key authority, durable event/effect records, bounded connected planes and artifact-level verification before Stable.

The first implementation wave is **Proven Canonical Windows Desktop**.
