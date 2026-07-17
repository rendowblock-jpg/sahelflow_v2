# SahelFlow 1.0 — Engineering Authority

> **Status:** Active  
> **Current code baseline:** `fd9fa97dfcf96e08ffa1273070e74c4bb6db980e`  
> **Product authority:** `../product/`  
> **Experience authority:** `../experience/`

This directory holds one target architecture, one current-to-target model and one execution path. It replaces the former collection of overlapping current-state, contradiction, evidence, repository, reuse and session-handoff documents.

The experience package is a separate, complementary authority: it preserves the complete capability depth, journey/state behavior and frontend/UI/UX quality required by the product contract.

## Read order

1. [`../product/README.md`](../product/README.md)
2. [`../experience/README.md`](../experience/README.md) — experience, frontend, capability and journey authority.
3. [`ENGINEERING_SPECIFICATION.md`](ENGINEERING_SPECIFICATION.md) — finished-system boundaries and invariants.
4. [`CURRENT_TO_TARGET_ANALYSIS.md`](CURRENT_TO_TARGET_ANALYSIS.md) — real codebase, gaps, metrics and migration disposition.
5. [`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md) — dependency-correct program path.
6. [`CODING_WORKFLOW.md`](CODING_WORKFLOW.md) — lightweight work, review and evidence rules.
7. [`SUPERSEDING_ADRS.md`](SUPERSEDING_ADRS.md) — rationale and rejected alternatives when a decision needs deeper context.
8. [`PROVIDER_CONTRACT_REGISTRY.md`](PROVIDER_CONTRACT_REGISTRY.md) when work touches external-provider claims or live certification.

Operational drills are indexed in `CODING_WORKFLOW.md` and become separate runbooks only when implemented.

## Authority rules

- Founder product choices are governed by the product package.
- The Experience and Frontend Constitution governs page/workflow/frontend quality, design-system behavior, Arabic/RTL, accessibility and page-completion requirements.
- The Functional Capability Atlas preserves detailed intended product depth; Launch Scope still governs mandatory Stable inclusion and exclusions.
- The Journey and State Atlas governs complete end-to-end behavior and the shared operational state vocabulary.
- The Engineering Specification defines the target system and invariants.
- The current-to-target analysis defines the latest source-grounded implementation model.
- The roadmap defines sequencing, not permission or ceremony.
- A superseding ADR is needed only when an accepted architecture decision is reopened.
- Source inspection can classify implementation, but packaged/provider/device/recovery/security/user verification requires the appropriate evidence.
- Historical files and git history are context, not current authority.
- Do not create a second status ledger, contradiction register, repository map, reuse plan, experience constitution, capability atlas, journey atlas or session handoff. Update the active document that owns the information.

## Current conclusion

The application contains substantial reusable product, frontend and engineering work. It must be migrated through trusted local context, identity/entitlement/key authority, durable event/effect records, bounded connected planes, page-complete experience behavior and artifact-level verification before Stable.

The first implementation wave is **Proven Canonical Windows Desktop**.