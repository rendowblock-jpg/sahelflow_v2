# SahelFlow 1.0 — Authoritative Product Documentation

> **Status:** Founder-approved product baseline  
> **Prepared:** 2026-07-15  
> **Applies to:** SahelFlow 1.0 / major release 1

This directory is the authoritative product package produced by the Excellence Reset. It exists to stop historical visions, internal version labels, provisional ADRs, and implementation claims from being treated as equally valid.

## Authority order

When documents conflict, use this order:

1. `LAUNCH_CONSTITUTION.md` — product identity, commercial contract, non-negotiable launch standards.
2. `FOUNDER_DECISIONS.md` — founder-approved decisions and exact product policies.
3. `LAUNCH_SCOPE_AND_ENTITLEMENTS.md` — included systems, exclusions, limits, expansion rights, and launch gates.
4. `ARCHITECTURE_RESET_BRIEF.md` — required next-phase analysis and architecture deliverables.
5. `VERIFIED_CURRENT_STATE.md` — what the current codebase is actually known to implement or fail at the stated baseline.
6. `CONTRADICTION_REGISTER.md` — unresolved drift and required closure work.
7. `NEXT_SESSION_HANDOFF.md` — reading order and exact resume prompt.
8. Superseding ADRs, engineering specifications, provider contracts, runbooks, and evidence ledgers created after the Architecture Reset.
9. All older documents are historical reference only unless explicitly revalidated and linked by a current authoritative document.

## Rules

- A feature is not complete because a screen, schema, adapter, test, or document exists.
- Claims such as `secure`, `hardened`, `AAA`, `real-time`, `offline`, `zero data loss`, or `best` require evidence linked to a commit and acceptance gate.
- Founder decisions define the product contract. Engineering specifications define how the contract is implemented. Evidence ledgers define what is proven.
- Historical internal labels such as v3, v4.1, v4.2, session numbers, design-system generations, and Maze Map phases are not public product versions.
- The first public stable product is **SahelFlow 1.0**.

## Next-session objective

The next session must not begin feature coding. It must first read this entire directory, inspect the complete current codebase, reconcile every implementation assumption against the approved product contract, consolidate the final engineering specification and ADRs, remove or archive obsolete documentation, and produce a dependency-correct coding workflow.