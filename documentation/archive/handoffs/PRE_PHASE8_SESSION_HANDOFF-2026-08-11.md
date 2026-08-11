# SahelFlow — Pre-Phase-8 session handoff

> **Date:** 2026-08-11
> **Status:** Archived handoff evidence; active authority remains the ten documentation authorities
> **Protected source at handoff start:** `bbfdc92e7b1845cd7cc4e2fd04c7ae5a2c7ab647` — PR #234
> **Published executable remains:** Internal.14 / application source `2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Purpose:** Preserve the full reasoning/context needed to resume the Founder-directed pre-Phase-8 stabilization program without relying on chat history.

## 1. Why this stabilization program exists

The Founder installed and used Internal.14 on the ThinkPad T470. The important conclusion was **not** that a few screens need polish. The Founder explicitly values the backend/engine and rejects the current installed frontend as the product-quality baseline.

The correct program is therefore a root-cause whole-product stabilization checkpoint before Phase 8. Phase 8 research/read-only planning may continue, but Phase 8 implementation remains frozen until the repaired product has installed Phase 6/7 evidence and explicit Founder acceptance.

The protected Phase 1–4 business, identity, licensing, provider, backup/recovery and audit engines are assets to preserve. Frontend work must consume those authorities; it must not rewrite them for visual convenience.

## 2. Founder-installed frontend problem context

The installed Internal.14 experience established a systemic frontend-quality problem. The Founder should not need to enumerate every margin or label. The implementation team owns the route/component audit.

Observed/rejected themes from the installed use session:

- Arabic typography/font treatment does not feel like a professional modern operational product;
- text and controls are often too small for comfortable daily reading;
- AR/FR/EN switching and LTR/RTL switching are not atomic: text/layout can update progressively and the sidebar can remain on the stale side until refresh/restart;
- light/dark switching feels glitchy and the current palette feels cold; the target is a coherent semantic theme system rather than page-local overrides;
- motion/micro-interaction language is weak or absent;
- RTL geometry and direction-sensitive icons are inconsistent;
- primary navigation is over-nested; primary seller destinations should be visible directly and only genuine child workspaces should nest;
- large warning banners dominate routine states that should be compact/contextual;
- charts are visually sparse/low-information instead of decision-oriented;
- Inbox, AI Agents and Settings require product-level workflow redesign, not cosmetic restyling;
- the remaining route inventory must be audited proactively so Founder acceptance is not turned into manual pixel-by-pixel QA.

Supporting research remains in `documentation/archive/research/PRE_PHASE8_FRONTEND_STABILIZATION_RESEARCH-2026-08-10.md`.

## 3. Seven technical findings from the deep audit — current disposition

### Finding 1 — historical CI exception bypasses

**Status: CLOSED in protected source.**

PR #232 merged as `876b0acdd2528df52ec106c22f231edf0b590739` and retired the PR #200 installed-UI waiver and PR #207 Phase 4 closure override as live lane-suppression mechanisms. Anti-bypass tests now prove historical exception records cannot suppress current consequence-selected evidence.

### Finding 2 — blank workspace after successful license activation

**Status: CLOSED in protected source.**

PR #233 merged as `b91fd2a9008f529a5df3000d99bf426094f9daa9`. The client entitlement transition now refreshes the server-authorized dashboard tree, so permanent/trial activation does not rely on close/reopen to replace the server-supplied `null` dashboard children.

### Finding 3 — single-route customer trial resilience / issue #230

**Status: SOURCE HALF PROTECTED; LIVE EXTERNAL CERTIFICATION STILL OPEN P1.**

PR #234 merged as `bbfdc92e7b1845cd7cc4e2fd04c7ae5a2c7ab647` after extensive adversarial review. It adds bounded primary/recovery ingress, authoritative signed/bound response selection, privacy-safe failure classification, owned-host release authority, Worker readiness, D1 write/schema/signer/keyring checks, early health throttling, and blocking Worker coverage.

Do **not** close #230 from this source/CI work. Remaining evidence requires real SahelFlow-owned DNS, a sufficiently independent recovery path, protected deployment/keyring/route bindings, representative Algerian fixed/mobile reachability and forced-recovery checks, and an exact signed installed customer trial/recovery journey. GitHub auto-closed #230 when #234 merged; it was intentionally reopened during this handoff because that contradicted the issue acceptance rule.

### Finding 4 — startup/performance / issue #226

**Status: OPEN.**

Internal.14 ordinary startup was observed as taking many minutes. Phase 7 optimization remains measurement-driven. Measure exact cold-start stages and then certify T470/floor navigation/search/mutation/resource/eight-hour budgets. Do not speculate or remove required work just to improve a stopwatch number.

### Finding 5 — replacement-install recovery / issue #214

**Status: CLOSED with stronger exact installed evidence.**

The exact PR #234 head `04b04bbbc20124ccbee790b47855056155a1cc29` passed CI run `31442156721`. Installed job `93632210059` passed the full replacement-install backup → interruption → rollback → committed restore drill in the actual installed WebView, including owner re-enrollment, protected-customer blind-index search, protected-secret readback, installation/session non-cloning, protected-key rewrap and a committed receipt. PR #232 had already retired the PR #207 override. Issue #214 was closed during this handoff.

### Finding 6 — documentation/source-authority drift

**Status: DOCUMENTATION RECONCILIATION IN THIS HANDOFF; bounded source-comment debt remains.**

The previous active docs still described #232/#233 as future work and #214 as retained. This handoff updates current-state/working-memory truth. Legacy/stale source comments (including historical schema commentary) may be cleaned later in a bounded low-risk package; do not mix comment cleanup into consequential schema/native changes merely for aesthetics.

### Finding 7 — legacy compatibility seams

**Status: OPEN LOWER-PRIORITY DEBT.**

Canonical order/business fences are strong, but legacy compatibility pathways remain. Do not broaden the next frontend package into a compatibility rewrite. Revisit only after higher-risk stabilization work, with canonical parity/recovery proof and a specific migration/removal plan.

## 4. Additional retained evidence reconciled this session

Issue #201 is now **closed**. The exact #234 installed job passed authenticated hydrated WebView UI proof twice, exact MSI launch/reopen and the downstream recovery drill, while PR #232 had already retired the PR #200 waiver.

Issue #214 is now **closed** as described above.

Issue #221 remains **open** because the Founder has not accepted the installed Phase 5/6 frontend. It becomes meaningful only after shared-root frontend repairs and a coherent signed candidate.

Issue #226 remains **open** for installed Phase 7 performance/reliability certification.

Issue #230 remains **open P1** for the real production/network trial certification boundary.

## 5. Work merged during this stabilization session

- PR #231 — `bac258e4e8c44e730fe96a72e8adbac5f45a43ab`: records the mandatory pre-Phase-8 Founder stabilization program and research basis.
- PR #232 — `876b0acdd2528df52ec106c22f231edf0b590739`: retires historical CI exception bypass authority.
- PR #233 — `b91fd2a9008f529a5df3000d99bf426094f9daa9`: fixes successful activation → blank dashboard/restart behavior.
- PR #234 — `bbfdc92e7b1845cd7cc4e2fd04c7ae5a2c7ab647`: protects resilient customer-trial source architecture and readiness/diagnostic boundaries.

PR #234 exact head `04b04bbbc20124ccbee790b47855056155a1cc29` passed:

- Required PR Gate;
- full Quality authority (`tsc`, ESLint, Vitest, Prisma, audit/dependency/migration checks);
- Tauri release smoke;
- Windows standalone/contained runtime;
- Windows Rust release parity;
- exact evidence MSI build;
- installed launch/reopen;
- authenticated hydrated WebView UI twice;
- exact replacement-install backup/restore/identity/rollback drill;
- Native source contract;
- Phase 5 Experience Gate;
- Phase 6–7 Completion Gate;
- fresh Codex review with no major issue on the final head;
- zero unresolved addressed review threads before merge.

The first #234 installed attempt had a transient WebView/CDP transport failure after the restore itself committed. A retry on the same older product head passed that exact acceptance step before being cancelled as stale, and the final exact head later passed the entire installed run. Treat this as diagnosed evidence flake, not a product restore regression.

## 6. Exact next implementation dependency

The next implementation package is **Frontend foundation authority**, not random page redesign.

Start from then-current protected `main` after re-fetching live PR/issue state. There should be one active implementation agent and one coherent branch/PR.

### Reconnaissance already established

The current locale/direction path has an exact shared-root mismatch worth solving first:

- `src/stores/ui-store.ts` treats the `sahelflow-locale` cookie as the locale source of truth and updates the client store immediately;
- `src/hooks/use-i18n.ts` switches to the client store after mount and mutates `<html lang>` / `<html dir>` in an effect;
- `src/app/(dashboard)/layout.tsx` reads locale/direction on the server and passes `serverDir` into the client dashboard shell;
- `src/components/layout/sidebar.tsx` derives `isRtl` from that **serverDir prop**, not from the newly changed client locale.

Therefore a client locale change can update text/document direction while the sidebar keeps stale server-direction state until the server component tree is refreshed. This matches the installed wrong-side/stale-direction symptom. The fix should make locale + document direction + server-derived shell direction one coherent transition rather than layering more local RTL patches.

Theme reconnaissance also found a custom `ThemeProvider` plus an inline pre-hydration theme script in `src/app/layout.tsx`, both bound to the same `localStorage('theme')` key. The next package should audit every additional theme mutator/selector before deciding whether the authority is truly singular; do not assume the visual glitch is solved by changing colors alone.

`globals.css` already contains a later “Foundation v2” spacing/type section plus older hover/keyframe/status sections. Treat that as evidence of accumulated layers, not as the final design-token authority. The next package should inventory/normalize rather than append another disconnected layer.

### Foundation outcome to freeze before broad adoption

- Arabic/Latin typography stack and readable density;
- semantic design tokens for surfaces, borders, radius/elevation, status, focus, charts and motion;
- excellent light/dark foundations plus coordinated accent/theme families without semantic drift;
- restrained reduced-motion-safe motion;
- atomic locale/direction transition contract;
- logical RTL and mixed-direction primitives;
- application shell/navigation contract with shallow task-shaped IA;
- shared warning/notices, tables/lists, forms, KPI/status, charts, overlays, loading/empty/degraded/recovery patterns.

Then adopt those roots in real product verticals. Inbox, AI Agents and Settings are priority redesign workspaces, followed by the whole route inventory.

## 7. What must not happen next session

- Do not start Phase 8 implementation.
- Do not reopen protected Phase 1–4 engines without a demonstrated defect/contract need.
- Do not patch screenshots one margin at a time.
- Do not create a parallel demo design system that production routes do not use.
- Do not copy another SaaS visual identity wholesale.
- Do not hide #230 behind permanent offline activation or CI mocks.
- Do not optimize startup without measurements.
- Do not describe Internal.14 as Founder-accepted; Founder-accepted baseline remains Internal.5.
- Do not claim Beta or Stable.

## 8. Next-session resume checklist

1. Read `AGENTS.md`, `documentation/README.md`, `CURRENT_STATE.md`, `ROADMAP.md`, `WORKFLOW.md`, `WORKING_MEMORY.md` and this handoff packet.
2. Re-fetch live protected `main`, open PRs and issues #164/#221/#226/#230 before any write.
3. Confirm there is no other active implementation PR/agent.
4. Start the frontend-foundation package from current protected `main`.
5. Complete source reconnaissance before freezing implementation choices.
6. Open a draft PR early once material work exists; keep review/CI exact-head discipline.
7. Preserve the full Founder problem context above as acceptance input; do not reduce the program to the first defect encountered.
