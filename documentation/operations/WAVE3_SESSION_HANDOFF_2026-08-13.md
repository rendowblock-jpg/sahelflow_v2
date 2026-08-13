# Internal.16 Wave 3 — session handoff

> **Date:** 2026-08-13
> **PR:** #250 — `Internal.16 Wave 3 — EcoTrack + Gemini provider truth`
> **Branch:** `agent/internal-16-wave-3`
> **Protected main at handoff:** `5a8d5e3c042abbcee001a68a7168d3c679f6e541`
> **Last application-changing Wave 3 head:** `df84f3d4e78a982695b5883c98a15ac145604b49`
> **Status:** PR open, non-draft, unmerged

This file is a compact session transfer. `documentation/operations/WORKING_MEMORY.md` remains the primary resume owner and contains the detailed repair intent, evidence and hard rules.

## What is already protected

- Wave 1 / PR #247 merged at `9d69958d3dd9658ace192ccc70c9a43d5d815ee1`.
- Wave 2 / PR #248 merged at current protected main `5a8d5e3c042abbcee001a68a7168d3c679f6e541`.
- Do not restart Wave 1, Wave 2, whole-repository audit or Founder screenshot discovery.

## Wave 3 state

Substantial EcoTrack + Gemini/provider + extraction/chat work is already on PR #250.

The last application change in this session, `df84f3d4...`, corrected EcoTrack status precedence so a non-delivery event such as `non livré` cannot be interpreted as delivered. Its focused regression passes.

Three current P1 review findings remain:

1. historical persisted `noest` delivery rows need normalization to canonical `ecotrack` before canonical tracking validation while preserving the historical compatibility seam;
2. remaining seller/AI shipment clients still use stale `noest` provider vocabulary and must submit canonical `ecotrack`;
3. Gemini provider order must keep the currently approved 3.5 Flash model first, with 3.6 only as fallback unless governing authority changes.

Two older review threads are outdated but still unresolved: the EcoTrack negative-status defect and the earlier chat-runtime-not-wired finding. Re-fetch before resolving them.

## Current evidence snapshot

At application head `df84f3d4...`:

- Phase 5 Experience: green;
- Phase 6–7 static localization/RTL/accessibility: green;
- Phase 6–7 AR/FR/EN browser accessibility/reflow/performance: green;
- TypeScript: green;
- ESLint: green with warnings only;
- production dependency audit: green;
- migrations: green;
- EcoTrack adapter/regression tests: green;
- Gemini extraction tests: green;
- chat agent tests: green.

CI and the final Phase 6–7 required aggregator remain red because one stale Settings source-contract fails. The complete Vitest result observed was 305 test files passed / 1 failed and 2396 tests passed / 1 failed.

The stale contract is `src/components/settings/__tests__/settings-workspace-contract.test.ts`; it reads the compatibility wrapper `delivery-credentials-panel.tsx` instead of the active Wave 3 panel implementation. Repair the test, not Settings runtime behavior.

## First actions next session

1. Re-fetch protected `main`, PR #250 current head, checks and review threads.
2. Read `WORKING_MEMORY.md` before writing code.
3. Repair the stale Settings source-contract.
4. Repair the three current Wave 3 P1s with focused regressions.
5. Reconcile review threads against the live diff.
6. Freeze one repaired application head.
7. Run exact-head CI + Phase 5 + Phase 6–7 until every selected required gate is green.
8. Update PR #250 body with final head/evidence and remove stale draft wording.
9. Merge only through expected-head protected discipline.
10. Re-fetch protected main before Wave 4.

## Do not do next session

- do not merge #250 while a current P1 or required gate is red;
- do not weaken tests/gates to make the branch green;
- do not resurrect NOEST as a selectable provider;
- do not change the approved Gemini default silently;
- do not start Wave 4/5 inside #250 unless a proven blocker requires a minimal boundary repair;
- do not treat documentation-only commits after `df84f3d4...` as new application evidence.

## Later boundary

After Wave 3 merges:

- Wave 4 = connected Phase 8 platform package;
- Wave 5 = startup/performance/reliability, retained issue evidence, final installed reconciliation and signed Internal.16 proof if earned.
