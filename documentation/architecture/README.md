# SahelFlow 1.0 — Engineering Authority

> **Status:** Active  
> **Current source-code baseline:** `fd9fa97dfcf96e08ffa1273070e74c4bb6db980e`  
> **Product authority:** `../product/`  
> **Experience authority:** `../experience/`

The source-code baseline above remains valid because the later merges through the documentation consistency work change documentation only. Every implementation wave must refresh the baseline after executable source changes.

This directory holds one target architecture, one current-to-target model and one execution path. It replaces the former collection of overlapping current-state, contradiction, evidence, repository, reuse and session-handoff documents.

The experience package is a separate, complementary authority: it preserves the complete capability depth, journey/state behavior and frontend/UI/UX quality required by the product contract.

## Read order

1. [`../product/README.md`](../product/README.md)
2. [`../experience/README.md`](../experience/README.md) — experience, frontend, capability and journey authority.
3. [`ENGINEERING_SPECIFICATION.md`](ENGINEERING_SPECIFICATION.md) — finished-system boundaries and invariants.
4. [`SUPERSEDING_ADRS.md`](SUPERSEDING_ADRS.md) — accepted rationale and rejected alternatives when deeper context is needed.
5. [`CURRENT_TO_TARGET_ANALYSIS.md`](CURRENT_TO_TARGET_ANALYSIS.md) — real codebase, gaps, metrics and migration disposition.
6. [`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md) — dependency-correct program path.
7. [`CODING_WORKFLOW.md`](CODING_WORKFLOW.md) — lightweight work, review and evidence rules.
8. [`PROVIDER_CONTRACT_REGISTRY.md`](PROVIDER_CONTRACT_REGISTRY.md) when work touches an external-provider claim or live certification.

Operational drills are indexed in `CODING_WORKFLOW.md` and become separate runbooks only when implemented and exercised.

## Authority and conflict rules

- A newer explicit numbered Founder decision governs the product choice it expressly changes.
- Founder product choices and Stable scope are governed by the product package.
- The Experience and Frontend Constitution governs page/workflow/frontend quality, design-system behavior, Arabic/RTL, accessibility and page-completion requirements for included scope.
- The Functional Capability Atlas preserves detailed intended depth; Launch Scope still governs mandatory inclusion, conditional capability and exclusions.
- The Journey and State Atlas governs complete end-to-end behavior and the shared operational state vocabulary.
- The Engineering Specification defines the target system and invariants.
- Accepted ADRs explain or supersede engineering decisions; they cannot silently amend the product contract.
- The Current-to-Target Analysis defines the latest source-grounded implementation model.
- The roadmap defines sequencing, not product permission.
- Source inspection can classify implementation, but packaged/provider/device/recovery/security/user verification requires the appropriate evidence.
- Historical files, the legacy changelog and research are context, not current authority.
- When two active documents appear inconsistent, stop, apply the precedence above and update every owning document before implementation proceeds.
- Do not create a second status ledger, contradiction register, repository map, reuse plan, experience constitution, capability atlas, journey atlas or session handoff. Update the active document that owns the information.

## Current conclusion

The application contains substantial reusable product, frontend and engineering work. It must be migrated through trusted local context, identity/entitlement/key authority, durable event/effect records, bounded connected planes, page-complete experience behavior and artifact-level verification before Stable.

The first implementation wave is **Proven Canonical Windows Desktop**.