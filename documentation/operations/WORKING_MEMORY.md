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
> **Published release:** `1.0.0-internal.14` — source `2d60e2e74109b6e03626a5ccdff727c029a34591`, signed run `31388777098`
> **Retained open evidence:** #221, #226, #230

**Active resume companion:** [`WAVE3_SESSION_HANDOFF_2026-08-13.md`](WAVE3_SESSION_HANDOFF_2026-08-13.md).

Live GitHub is authority. At the start of the next session, re-fetch protected `main`, PR #250, its current head/checks/review threads, and retained issues before any application write. Do **not** repeat the whole-repository audit or Founder screenshot discovery.

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
- API token + user GUID credential contract;
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
- update extraction/key-verification tests accordingly:
  - success/default model => `3.5`;
  - 3.5 unavailable => fallback `3.6`;
- reconcile any chat/provider tests that assume the opposite order.

Do not silently change model authority in documentation just to match implementation.

### Outdated review threads

- EcoTrack `non livré` classification P1: **fixed at `df84f3d4...`**, thread is outdated but still unresolved in GitHub.
- Wave 3 chat runtime not wired P1: **already fixed by later PR commits**, thread is outdated but still unresolved.

Resolve outdated threads only after re-fetching and confirming the current diff still proves the fixes.

## Current exact-head certification on `df84f3d4...`

### Passing evidence

- **Phase 5 Experience Gate:** full workflow success, run `31711261468`.
- **Phase 6–7 static localization/RTL/accessibility contract:** success.
- **Phase 6–7 AR/FR/EN accessibility, reflow and performance browser evidence:** success.
- TypeScript: success.
- ESLint: success (warnings only; no errors).
- production dependency audit: success / no vulnerabilities.
- migration status: success / schema up to date.
- EcoTrack adapter suite including `non livré` regression: success.
- Gemini extraction suite on the current head: success.
- chat agent suite on the current head: success.

### Blocking source-quality failure

Both CI Required PR gate and Phase 6–7 required aggregator are red because the complete Vitest run has **one stale Settings source-contract failure**:

`src/components/settings/__tests__/settings-workspace-contract.test.ts`

Failing assertion still reads:

`src/components/settings/delivery-credentials-panel.tsx`

That file is now only a compatibility re-export of:

`src/components/settings/delivery-credentials-panel-wave3.tsx`

So the source-contract incorrectly searches the wrapper for `"verification-required"` / authority-state copy.

Observed complete test result at `df84f3d4...`:

- **305 test files passed, 1 failed**;
- **2396 tests passed, 1 failed**.

Required repair intent:

- point the source-contract at the active Wave 3 panel and assert the current state vocabulary actually used there;
- do not change Settings runtime behavior just to satisfy the old test;
- rerun full source-quality after repair.

Relevant exact-head workflow runs:

- CI: `31711261720` — failure only through the source-quality/Test gate and required aggregator;
- Phase 5: `31711261468` — success;
- Phase 6–7: `31711261477` — browser/static success, final required aggregator red because source-quality is red;
- Integration source checkpoint: `31711261543` — skipped as expected.

## Connector/tooling limitation encountered in this session

The GitHub connector safety layer blocked writes/ref moves involving several guard-sensitive files, including provider-secret verification, courier booking surfaces, and a Settings test file containing unrelated destructive-reset assertions.

Important consequences:

- **do not assume the staged/unattached Git objects created during failed attempts are on the branch**;
- live PR/branch refs are the only authority;
- the only additional repair actually moved onto the branch after the earlier `10cc4a48...` state is the EcoTrack negative-status fix at `df84f3d4...`;
- next session should re-attempt the remaining fixes through an available normal repository editing workflow/checkout if the connector still blocks those paths;
- never bypass safety controls or force-move the branch.

## Exact next-session order

1. Re-fetch protected `main`; expected current value at this handoff is `5a8d5e3c042abbcee001a68a7168d3c679f6e541`.
2. Re-fetch PR #250 current head, status, changed files, review threads and exact-head workflow runs. Do not assume the docs-only handoff head equals application evidence head `df84f3d4...`.
3. Read `AGENTS.md`, `documentation/README.md`, `documentation/operations/WORKING_MEMORY.md`, `documentation/operations/WAVE3_SESSION_HANDOFF_2026-08-13.md`, `documentation/system/CURRENT_STATE.md`, `documentation/system/ROADMAP.md`, and `documentation/operations/WORKFLOW.md`.
4. Treat stale pre-Wave-1/2 execution-frontier sentences in CURRENT_STATE/ROADMAP as historical until post-Wave-3 reconciliation; do not restart completed Waves 1–2.
5. Confirm no other agent/user moved `agent/internal-16-wave-3` unexpectedly.
6. Repair the stale Settings source-contract first because it is deterministic and non-runtime.
7. Repair P1 A: historical `noest` delivery normalization/credential compatibility in canonical tracking, with focused regression.
8. Repair P1 B: canonical courier picker + AI provider vocabularies from `noest` to `ecotrack`.
9. Repair P1 C: restore Gemini 3.5-first authority and align provider/extraction/chat tests.
10. Re-fetch review threads; resolve only findings actually proven fixed/current.
11. Freeze the repaired application head.
12. Run exact-head CI + Phase 5 + Phase 6–7. Do not merge on wrapper-green/skipped evidence.
13. Require at minimum:
    - Required PR gate green;
    - complete source-quality green;
    - dependency audit and migrations green;
    - complete Phase 5 green;
    - Phase 6–7 static + source-quality + browser + required gate green;
    - no unresolved current P1 review finding.
14. Update PR #250 body to final exact head/evidence and correct any stale wording such as “opened as a draft”.
15. Merge #250 only through expected-head protected merge discipline after every required exact-head condition is green.
16. Re-fetch resulting protected `main`, then perform a docs-only reconciliation if needed before starting Wave 4.

## After Wave 3 merges

The next application boundary remains:

- **Wave 4:** connected Phase 8 platform / Cloudflare control plane / authenticated encrypted remote projection + commands / hosted storefront / PWA/browser companion / zero-knowledge backup transport / Founder Console / outage-replay-isolation proof.
- **Wave 5:** startup/performance/reliability, issue #230 customer-online/public-trial proof, security/privacy closure, installed #221/#226 reconciliation, zero known P0/P1, and signed Internal.16 release proof if earned.

Do not pull Wave 4/5 implementation into PR #250 unless a proven blocker requires a minimal boundary repair.

## Protected boundaries / hard rules

- one active application writer;
- no direct protected-main application edits;
- no force pushes/ref rewrites;
- no Phase 1–4 Golden COD/identity/PII/accounting/provider/native authority weakening;
- no guessed provider endpoints/capabilities;
- no fake AI/provider/cloud success;
- no NOEST runtime resurrection: historical compatibility only;
- no Gemini model-policy drift without governing authority + revalidation;
- no gate/threshold weakening for schedule;
- no heavy certification loop after every tiny edit;
- no customer-online claim from provider hostnames/mocks;
- no Internal.16/Beta/Stable claim until the applicable exact evidence exists;
- #221, #226 and #230 remain open until stronger evidence explicitly closes them.
