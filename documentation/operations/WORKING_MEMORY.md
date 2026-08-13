# SahelFlow working memory

> **Purpose:** Compact resumable execution frontier; never product/architecture/roadmap authority
> **Last updated:** 2026-08-13
> **Protected main:** `371aebc2be3bf0abb1bbe7fe91c035d962fc86a9` — PR #245 merged
> **Latest application-changing protected merge:** PR #244 — Orders + confirmation operational workspace
> **Application-changing protected baseline:** `856f58126327797b467938390586a04f185e70f6`
> **Phase 5 application-changing protected baseline:** `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734` — PR #220
> **Published release:** `1.0.0-internal.14` — source `2d60e2e74109b6e03626a5ccdff727c029a34591`, signed run `31388777098`
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Documentation branch:** `agent/internal-16-completion-authority`
> **Next application milestone:** `1.0.0-internal.16` / MSI `1.0.0.16`
> **Governing directive:** FD-033 — Internal.16 completion convergence
> **Installed inspection:** CLOSED 2026-08-13; Parts 1–3 frozen at 17 P1 findings
> **Retained open evidence:** #221, #226, #230

Live GitHub is authority. Re-fetch protected `main`, releases, installed evidence, issues and Actions before application writes or release claims.

## Founder directive

Internal.16 is intended to be the complete application candidate, not another partial checkpoint. The Founder has a 24-hour completion/first-revenue constraint, zero paid marketing/infrastructure budget before first revenue, and a near-term objective of at least USD 100 equivalent collected revenue. Urgency does not lower the product/evidence bar.

Internal.16 must complete remaining Phase 5/6/7 work, implement Phase 8, remove NOEST/Nord et Ouest and add first-class EcoTrack Pro, harden AI/extraction/tools, then freeze and certify the whole product with zero known P0/P1 before a user-ready claim.

## Installed Internal.15 discovery closure

The Founder explicitly closed the installed Internal.15 inspection on 2026-08-13 after Parts 1–3. The 17 findings below are now the **frozen Founder-installed acceptance input** for Internal.16.

Do not spend the next session repeating screenshot discovery. Screenshots remain evidence samples, not an exhaustive route list. The implementation agent owns one exact-source whole-product reconnaissance for every established defect class plus hidden dependencies, then freezes the combined source+installed Problem Register before broad implementation.

New material P0/P1 facts discovered during source reconnaissance may be added because they are newly proven product truth; do not reopen Founder discovery merely to enumerate another sibling manifestation of an already-frozen class.

## Frozen installed findings — Parts 1–3

### Cross-product UI/localization

- **SF16-UI-001 P1:** systemic Arabic/RTL geometry and bidi wrong-side defects across shell/routes/panes/tables/charts/menus/dialogs/command palette. Fix semantically across the whole app; no route-local `dir` patch campaign.
- **SF16-UI-002 P1:** Risk Engine KPI hierarchy overloaded/unbalanced; redesign primary vs supporting signals.
- **SF16-UI-003 P1:** shared stat cards need deliberate passive/actionable/selected hover/focus/touch semantics with accented icon/surface/border feedback.
- **SF16-I18N-004 P1:** locale-sensitive money/date/number/chart formatting can leak French defaults into Arabic; audit all callers.
- **SF16-I18N-007 P1:** zero unresolved translation keys or unintended foreign system/server copy. `auth.pinPlaceholder` was visible installed; Gemini paths include French strings. Demo/system content localizes; seller-entered names remain exact.
- **SF16-RESP-011 P1:** deterministic responsive composition; eliminate normal-window `4 → 3+1` and other orphan layouts.
- **SF16-LAYOUT-012 P1:** remove low-information dead space/stretched panels. Dashboard Delivery currently stretches beside taller Recent Orders; chart canvases also waste space. Panel/chart height must follow information and hierarchy.
- **SF16-THEME-015 P1:** light/dark/preset switch must be atomic and visually smooth with no mixed-token flicker frame.
- **SF16-I18N-016 P1:** locale switching must be atomic across current **and subsequently navigated** routes; no stale old-locale RSC/cache/prefetch frame after commit.

### Workspaces and data UX

- **SF16-INBOX-005 P1:** final AAA Inbox convergence—adaptive/resizable panes, complete communication/workflow/extraction/collaboration behavior, degraded-transport recovery and large-history performance.
- **SF16-AI-006 P1:** final AAA AI workbench—dominant thread, adaptive rails, polished sessions/composer/tool/proposal flows, locale/RTL parity and long-session performance.
- **SF16-PRODUCTS-008 P1:** render compact primary product thumbnail from existing `images` projection with intentional fallback and low-end-safe loading.
- **SF16-SEARCH-009 P1:** universal, ranked, permission/shop-aware topbar search across approved words/numbers/identifiers/entities, not only navigation + orders/customers/products.
- **SF16-CHART-013 P1:** rebuild charts into a top-tier decision-support system: correct chart type, rich but restrained visuals, comparison/context, selective annotations, professional tooltips/legends, drill-down where authoritative, accessible text/table alternative, responsive height/density, RTL/locale correctness and low-end performance.
- **SF16-NAV-017 P1:** smarter default sidebar ordering plus small pencil/edit control for user reorder. Canonical navigation registry remains route/permission authority; custom order is a separate UI preference with drag + keyboard reorder, save/cancel/reset, safe migration and RTL parity.

### AI/provider and performance

- **SF16-AI-010 P1:** Gemini key entered installed but AI did not become usable. Certify recent reauth → official provider/model verification → encrypted save → configured/verified state → immediate readiness refresh → real minimal inference/extraction, with localized stable error taxonomy.
- **SF16-PERF-014 P1:** installed startup/first post-update launch still feels slow. Measure exact startup stages and close the bottleneck without weakening recovery/migration/licensing/runtime readiness. Preserve T470 cold launch ≤8s p95 and declared floor ≤15s SSD / ≤25s HDD usable shell.

## Source clues retained for the implementation reconnaissance

- Dashboard Recent Orders + Delivery share one grid row; default stretch makes the shorter Delivery panel match the taller orders panel while its content remains at the top.
- Shared `ChartCard` defaults to a fixed 300px plot; donut uses fixed radius inside that canvas; Analytics passes `accent` but the current `ChartCard` does not consume it.
- Theme authority has a broad 220ms switching window; installed evidence still shows visual glitching.
- Locale request writes the cookie then `router.refresh()` for the current server tree; installed evidence proves the next-route cache/navigation boundary can still surface stale prior-locale content.
- `navigationDomains` is a static canonical order today and Sidebar renders it directly.
- Current command palette searches navigation plus orders/customers/products only.
- Product workbench records already carry `images`.
- `.card-grid-4` currently uses `auto-fit/minmax(240px)`.
- AI XL workspace uses fixed side rails; Inbox queue uses fixed desktop width.
- Gemini key setup requires recent reauth; provider/verifier strings/model policy require current official revalidation.

These are root-cause clues, not a list of files to patch blindly.

## Internal.16 execution style

```text
exact documentation-merged authority
→ one exact-source whole-product reconnaissance
→ merge source findings with frozen 17 installed findings
→ freeze one consolidated Problem Register
→ freeze contracts/non-goals/acceptance matrix
→ one large dependency-correct implementation wave
→ targeted cheap checks while coding
→ freeze complete Internal.16
→ one deep whole-product certification + adversarial review
→ one consolidated repair batch
→ affected reruns + one final complete certification
→ signed updater if evidence passes
```

No full MSI/replacement-install/eight-hour run after every tiny change. No weakening gates. No ritual rerun of unchanged passing heads.

## Completion scope

Remaining desktop routes; shared RTL/interaction/responsive/theme/locale/chart/navigation/search roots; Inbox/AI/product table; Gemini key lifecycle; EcoTrack; AI extraction/tools; full Phase 8 remote/storefront/PWA/control-plane/zero-knowledge backup/Founder Console; security/privacy; install/update/recovery; T470/floor/eight-hour evidence.

Cloudflare Free may bootstrap first-buyer capacity when measured sufficient, but provider hostnames do not satisfy #230. EcoTrack endpoints/capabilities may not be guessed. Phase 1–4 authorities remain protected.

## Protected route/release continuity snapshot

- PR #244 remains the latest route-level application-changing protected merge at `856f58126327797b467938390586a04f185e70f6`; PR #245 is the later FD-032 release/checkpoint merge.
- **PR #237 Inbox operational workspace — CLOSED** at final exact head `8e9d5aa365f0c5873909c1c8517f88519d743b9d`.
- **PR #240 AI Agents operational workspace — CLOSED** at final exact head `6355cc4c797a597af52c90decfe7727e405749be`.
- **PR #242 Settings operational workspace — CLOSED** at final exact head `e749b0af05741ee45b16c349750d44092bd3beb9`; exact evidence runs `31546488691`, `31546488465`, `31546488422`.
- The previous publication remains source `2d60e2e74109b6e03626a5ccdff727c029a34591`, **Published release:** `1.0.0-internal.14`, signed run `31388777098` until a newer signed release is actually proven.

### Post-Settings documentation reconciliation

The protected Settings evidence above remains part of the durable chain; later route and release work did not erase it.

### Next product package selection — remaining route inventory

This historical selection step is now superseded operationally by FD-033’s frozen 17 installed findings plus one exact-source whole-product reconnaissance. It remains named so the prior route-adoption lineage is not lost.

### FD-032 licensing / Cloudflare release boundary

FD-032 remains exact to Internal.15. Cloudflare/provider-host bootstrap does not satisfy #230’s owned-domain/public customer-trial boundary, and FD-033 does not retroactively convert Internal.15 into a customer release.

Retained issue status entering Internal.16: **#221 OPEN**, **#226 OPEN**, **#230 OPEN P1**.

## Phase 5 closure snapshot

The historical Phase 5 source/browser checkpoint remains PR #220 at `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`; later frontend merges improved selected surfaces, but installed Founder acceptance remained open. The frozen Internal.15 findings are now the exact installed input that Internal.16 must close rather than evidence that Phase 5 was already complete.

## Phase 6 next action

The formal **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity remains current. The next action under FD-033 is not another isolated RTL patch: perform the one exact-source whole-product reconnaissance, freeze the combined Internal.16 Problem Register, then close Phase 6 requirements inside the large completion wave alongside the other approved Internal.16 work. Retained **issue #221** remains part of installed visual/accessibility reconciliation until superseded by stronger exact Internal.16 evidence.

## Exact next-session order

1. Re-fetch protected `main`, releases, Actions and retained #221/#226/#230 truth; read FD-033/Current State/Roadmap/Workflow/Working Memory.
2. Ensure this documentation authority is merged to protected `main`.
3. Create/use the single `agent/internal-16-completion` application branch from that exact protected main.
4. Perform one exact-source whole-product reconnaissance for sibling manifestations and root dependencies of the frozen 17 findings plus the defined Phase 8/EcoTrack/AI/release scope.
5. Freeze the combined source+installed Problem Register, contracts/non-goals and acceptance matrix. Do not return to broad design/discovery after this freeze unless new P0/P1 evidence appears.
6. Execute the large dependency-correct implementation wave with targeted local checks only.
7. Freeze one complete Internal.16 head.
8. Run the full certification matrix and one complete adversarial review.
9. Repair one consolidated finding set; rerun affected + final complete proof.
10. Publish/deliver only to the evidence level actually achieved.

## Hard rules

- one active application writer;
- no direct protected-main application edits;
- no Phase 1–4 authority weakening;
- no guessed EcoTrack/provider capability;
- no fake tool/cloud/provider success;
- no low-confidence AI extraction promoted as canonical order truth;
- no gate/threshold weakening for schedule;
- no repeated heavy certification on unchanged passing heads;
- no customer-online claim from provider hostnames/mocks;
- no Stable claim from internal confidence alone.
