# SahelFlow working memory

> **Purpose:** Compact resumable execution frontier; never product/architecture/roadmap authority
> **Last updated:** 2026-08-13
> **Protected `main`:** `5a8d5e3c042abbcee001a68a7168d3c679f6e541` — PR #248 / Internal.16 Wave 2 merged
> **Protected Wave 1 merge:** `9d69958d3dd9658ace192ccc70c9a43d5d815ee1` — PR #247
> **Active implementation PR:** #250 — `Internal.16 Wave 3 — EcoTrack + Gemini provider truth`
> **Active branch:** `agent/internal-16-wave-3`
> **Last application-changing Wave 3 head before this docs handoff:** `df84f3d4e78a982695b5883c98a15ac145604b49`
> **Current branch head after documentation-only handoff commits:** re-fetch PR #250; docs-only heads are not application evidence
> **PR state at handoff:** OPEN, non-draft, UNMERGED
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Current source/release authority:** `1.0.0-internal.15` / MSI `1.0.0.15`, FD-032 Founder-offline-only
> **Published release:** `1.0.0-internal.15` — source `371aebc2be3bf0abb1bbe7fe91c035d962fc86a9`, signed run `31657621918`
> **Retained open evidence:** #221, #226, #230

Live GitHub is authority. At the start of the next session, re-fetch protected `main`, PR #250, its current head/checks/review threads, and retained issues before any application write. Do **not** repeat the whole-repository audit or Founder screenshot discovery.

Historical continuity: Phase 5 remains protected at PR #220 /
`cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`; the evidence lineage remains issues
#201, #214, #221, #226 and #230, with #221/#226/#230 still open.

## Session closure — 2026-08-13

Internal.16 Waves 1 and 2 are already protected on `main`.

- **Wave 1 / PR #247** merged as `9d69958d3dd9658ace192ccc70c9a43d5d815ee1`.
- **Wave 2 / PR #248** merged as current protected main `5a8d5e3c042abbcee001a68a7168d3c679f6e541`.
- Wave 2 protected exact-head evidence included Required PR gate, CI quality/coverage/audit/migrations, Phase 5 Experience, and Phase 6–7 AR/FR/EN accessibility/reflow/performance browser evidence.

Wave 3 is **not finished** and PR #250 must not be merged yet.

The last application-changing branch head before this documentation handoff is:

`df84f3d4e78a982695b5883c98a15ac145604b49`

That head contains the Wave 3 implementation accumulated during this session plus one additional safety repair: EcoTrack negative/non-delivery statuses are evaluated before generic delivered matching, with a regression proving `non livré` cannot become `delivered`.

Any documentation commits after `df84f3d4...` are handoff-only. They do not constitute new application evidence.

## Wave 3 — what is already implemented

### EcoTrack provider/product truth

The branch already contains the major EcoTrack replacement package:

- canonical `ecotrack` delivery provider identity;
- EcoTrack Pro adapter and configured merchant/courier identity projection;
- explicit HTTPS endpoint contract rather than guessed endpoints;
- fees, create + validate, tracking and connection verification behavior;
- `noest` retained only as a historical compatibility/migration alias in provider/credential support code;
- durable canonical booking/reconciliation/provider-capability boundaries preserved;
- Wave 3 Settings delivery-credential surface and delivery contract tests.

Latest landed safety repair at `df84f3d4...`:

- EcoTrack tracking checks refusal / `non livré` before delivered;
- regression test: `non_livre` / `Non livré` resolves to `refused`, never `delivered`.

### Gemini / extraction / chat truth already on branch

Wave 3 already includes:

- shared Gemini provider module with stable provider error taxonomy and localized FR/AR/EN failure copy;
- structured extraction output path;
- key verification requiring actual non-empty model output;
- quota exhaustion no longer treated as successful key verification;
- current 3.x model fallback mechanism;
- Wave 3 chat runtime/provider handling wired into the production chat path from earlier commits in PR #250;
- proposal-bound sensitive-action behavior and streaming/cancellation coverage preserved;
- legacy chat tests aligned to stable localized provider failures and the current two-model runtime.

Do not redo the chat-route wiring review finding: its review thread is now outdated because later PR commits already wired the Wave 3 runtime into production chat.

## Current blocking review findings on PR #250

Re-fetch review threads before editing. At handoff there are three **active, non-outdated P1s** plus two outdated unresolved threads.

### P1 A — historical `noest` tracking rows must normalize before canonical validation

Current failure class:

- a persisted Delivery row may still contain provider `noest`;
- `synchronizeCanonicalCourierTracking` validates the stored value against canonical `DELIVERY_PROVIDERS` before normalization;
- historical rows can therefore fail before reaching the new EcoTrack compatibility bridge.

Required repair intent:

- normalize historical stored provider identity to canonical `ecotrack` for authority/execution decisions;
- preserve the persisted historical row value unless an explicit migration owns rewriting it;
- use the legacy credential bridge for historical `noest` secrets until migrated;
- canonical audit/event/provider principal should use `ecotrack`;
- update/compare the Delivery row using its persisted provider value so historical rows can still be safely mutated;
- add a focused regression proving a stored `noest` delivery can synchronize through canonical EcoTrack authority without resurrecting NOEST as a selectable runtime provider.

Do not weaken provider validation or invent a second NOEST adapter.

### P1 B — shipment clients still submit `noest`

The canonical API/provider schema now expects `ecotrack`, but remaining production consumers still expose or submit `noest`.

Known stale callers found in this session:

- `src/components/orders/canonical-courier-actions.tsx` provider picker;
- `src/lib/ai/chat/tools/core-tools.ts` `estimate_delivery_cost` schema/description;
- `src/lib/ai/chat/tools/advanced-tools-legacy.ts` `assign_order_to_delivery` provider schema/JSON schema;
- same advanced tool file `get_delivery_cost_comparison` provider list.

Required repair intent:

- replace selectable/caller vocabulary with `ecotrack`;
- display `EcoTrack Pro` to sellers;
- do not re-enable blocked/legacy mutation authority merely to make a test pass;
- preserve historical `noest` only in explicit compatibility/migration seams.

### P1 C — approved Gemini model precedence is wrong

Current branch provider order is:

`gemini-3.6-flash` → `gemini-3.5-flash`

But current governing product/architecture authority still names **`gemini-3.5-flash` as the approved launch default**.

Required repair intent:

- restore `gemini-3.5-flash` as first model;
- retain `gemini-3.6-flash` only as fallback unless governing authority is explicitly changed and revalidated;
- update extraction/key-verification tests accordingly;
- reconcile any chat/provider tests that assume the opposite order.

Do not silently change model authority in documentation just to match implementation.

### Outdated review threads

- EcoTrack `non livré` classification P1: **fixed at `df84f3d4...`**, thread is outdated but still unresolved in GitHub.
- Wave 3 chat runtime not wired P1: **already fixed by later PR commits**, thread is outdated but still unresolved.

Resolve outdated threads only after re-fetching and confirming the current diff still proves the fixes.

## Current exact-head certification on `df84f3d4...`

Passing evidence:

- Phase 5 Experience Gate — run `31711261468`;
- Phase 6–7 static localization/RTL/accessibility contract;
- Phase 6–7 AR/FR/EN accessibility, reflow and performance browser evidence;
- TypeScript;
- ESLint;
- production dependency audit;
- migration status;
- EcoTrack adapter suite including `non livré` regression;
- Gemini extraction suite;
- chat agent suite.

Blocking source-quality failure:

- `src/components/settings/__tests__/settings-workspace-contract.test.ts` still reads `src/components/settings/delivery-credentials-panel.tsx`, now a compatibility re-export, instead of the active `delivery-credentials-panel-wave3.tsx` source.
- observed complete result: **305 test files passed, 1 failed; 2396 tests passed, 1 failed**.

Relevant exact-head workflow runs:

- CI `31711261720` — red only through the source-quality/Test gate and required aggregator;
- Phase 5 `31711261468` — success;
- Phase 6–7 `31711261477` — browser/static success, final required aggregator red because source-quality is red;
- Integration source checkpoint `31711261543` — skipped as expected.

## Exact next-session order

1. Re-fetch protected `main` and PR #250 current head/status/checks/review threads.
2. Read `AGENTS.md`, `documentation/README.md`, this file, `WAVE3_SESSION_HANDOFF_2026-08-13.md`, product/architecture authority and workflow.
3. Do not restart Waves 1–2; they are already protected.
4. Repair the stale Settings source-contract first.
5. Repair P1 A historical `noest` tracking normalization/compatibility.
6. Repair P1 B remaining shipment/AI provider vocabulary to `ecotrack`.
7. Repair P1 C Gemini 3.5-first authority and tests.
8. Re-fetch review threads; resolve only findings actually proven fixed/current.
9. Freeze the repaired application head.
10. Run exact-head CI + Phase 5 + Phase 6–7.
11. Require Required PR gate, complete source-quality, dependency audit/migrations, Phase 5, complete Phase 6–7 and zero unresolved current P1 review finding.
12. Update PR #250 body to final exact head/evidence.
13. Merge #250 only through expected-head protected merge discipline.
14. Reconcile long-form docs after Wave 3 lands, then start Wave 4.

## Documentation note

`CURRENT_STATE.md` and `ROADMAP.md` still contain older execution-frontier prose because whole-file connector rewrites were safety-blocked during this session. Treat those old frontier sentences as historical only; product/architecture authority remains binding. Until Wave 3 closes, live GitHub + `documentation/README.md` + this file + the Wave 3 handoff own the active resume position.

## Hard rules

- one active application writer;
- no direct protected-main application edits;
- no force pushes/ref rewrites;
- no Phase 1–4 authority weakening;
- no guessed provider endpoints/capabilities;
- no fake AI/provider/cloud success;
- no NOEST runtime resurrection: historical compatibility only;
- no Gemini model-policy drift without governing authority + revalidation;
- no gate/threshold weakening;
- no Internal.16/Beta/Stable claim until applicable exact evidence exists;
- #221, #226 and #230 remain open until stronger evidence explicitly closes them.
