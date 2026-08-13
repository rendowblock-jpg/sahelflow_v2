# Wave 3 session handoff — 2026-08-13

> **Active PR:** #250 — `Internal.16 Wave 3 — EcoTrack + Gemini provider truth`
> **Active branch:** `agent/internal-16-wave-3`
> **Protected base:** `5a8d5e3c042abbcee001a68a7168d3c679f6e541` — Internal.16 Wave 2
> **Last application-changing Wave 3 head before documentation-only handoff:** `df84f3d4e78a982695b5883c98a15ac145604b49`
> **State:** OPEN / non-draft / UNMERGED

This file is a compact session-resume companion to `WORKING_MEMORY.md`. Re-fetch live GitHub before writing because documentation-only handoff commits move the branch head without adding new application evidence.

## What is already done in Wave 3

- EcoTrack Pro is the canonical EcoTrack-backed delivery transport in the active implementation.
- NOEST is no longer intended as a first-class/selectable runtime provider; `noest` remains only in explicit historical compatibility seams.
- EcoTrack configuration, fee lookup, create/validate shipment handling, tracking, certification and Settings integration are present.
- Durable canonical courier booking/reconciliation/provider-capability boundaries remain protected.
- Shared Gemini provider handling, structured extraction, stable error taxonomy, real-output key verification and chat runtime convergence are present.
- Quota exhaustion does not count as successful Gemini key verification.
- Proposal-bound AI action safety and streaming behavior remain covered.
- `df84f3d4...` fixed the dangerous EcoTrack status precedence bug so `non livré` cannot become `delivered`; the regression passes.

## Remaining application blockers

Re-fetch PR #250 review threads first. At session close the active P1s were:

1. **Historical `noest` delivery tracking compatibility** — normalize stored `noest` to canonical `ecotrack` before canonical provider validation, while preserving the persisted historical row value until a dedicated migration owns rewriting it.
2. **Stale shipment/AI provider vocabularies** — canonical courier picker and remaining AI delivery schemas/lists must submit/select `ecotrack`, not `noest`, and seller display should say `EcoTrack Pro`.
3. **Gemini model authority** — repository authority still approves `gemini-3.5-flash` as launch default, so provider order must be 3.5 first and 3.6 fallback unless governing authority is explicitly changed and revalidated.

Two unresolved threads were already outdated at handoff:

- EcoTrack `non livré` classification — fixed at `df84f3d4...`;
- Wave 3 chat runtime not wired — fixed by later commits in #250.

Resolve them only after re-fetching and confirming the current diff.

## Exact source-quality state at `df84f3d4...`

Passing:

- Phase 5 Experience Gate;
- Phase 6–7 static localization/RTL/accessibility contract;
- Phase 6–7 AR/FR/EN accessibility/reflow/performance browser evidence;
- TypeScript;
- ESLint;
- production dependency audit;
- migration status;
- EcoTrack adapter tests including `non livré`;
- Gemini extraction tests;
- AI chat agent tests.

Only known source-quality test failure:

- `src/components/settings/__tests__/settings-workspace-contract.test.ts` still reads the delivery-credentials re-export wrapper instead of the active Wave 3 panel. Update the test to follow `delivery-credentials-panel-wave3.tsx`; do not change Settings runtime behavior merely to satisfy the stale source-contract.

Observed full Vitest result:

- 305 test files passed / 1 failed;
- 2396 tests passed / 1 failed.

Relevant runs on `df84f3d4...`:

- CI `31711261720` — red because complete test gate has the single stale Settings source-contract failure;
- Phase 5 `31711261468` — green;
- Phase 6–7 `31711261477` — static/browser green; final required aggregator red because source-quality is red;
- Integration source checkpoint `31711261543` — skipped as expected.

## Known stale callers to repair

- `src/components/orders/canonical-courier-actions.tsx`;
- `src/lib/ai/chat/tools/core-tools.ts`;
- `src/lib/ai/chat/tools/advanced-tools-legacy.ts` assignment provider vocabulary;
- same advanced tool file cost-comparison provider list.

## Next-session sequence

1. Re-fetch protected `main`, PR #250 head/status/checks/review threads.
2. Read `AGENTS.md`, `documentation/README.md`, `documentation/operations/WORKING_MEMORY.md`, this file, product/architecture decisions and workflow.
3. Do not restart Waves 1–2; they are already protected on main.
4. Repair the stale Settings source-contract.
5. Repair historical `noest` delivery normalization before canonical tracking validation.
6. Migrate all remaining shipment/AI callers to `ecotrack` vocabulary without resurrecting NOEST runtime authority.
7. Restore Gemini 3.5-first model authority and align extraction/chat/provider tests.
8. Re-fetch and resolve only review threads that are actually fixed.
9. Freeze one repaired application head.
10. Run exact-head CI + Phase 5 + Phase 6–7.
11. Merge #250 only when Required PR gate, complete source-quality, Phase 5, complete Phase 6–7 and current P1 review state are all green.
12. Reconcile long-form documentation after Wave 3 lands, then begin Wave 4.

## Tooling note

During this session the GitHub connector safety layer rejected some whole-file writes touching guard-sensitive provider/courier/Settings-test surfaces. Do not assume any unattached Git object from a rejected attempt is part of the branch. Live PR refs are authority. Use only a normal supported repository edit path; do not bypass safety or force refs.
