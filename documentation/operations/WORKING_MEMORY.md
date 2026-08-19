# SahelFlow — Working Memory

> **Purpose:** Single compact resumable handoff. Read after Current State, Roadmap and Workflow.
> **Last updated:** 2026-08-19
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Do not use this file as a live branch pointer:** resolve protected `main` from GitHub at action time.

## Current truth

- Latest signed/published Founder checkpoint: **Internal.22**.
- App: `1.0.0-internal.22`.
- MSI: `1.0.0.22`.
- Authority: **FD-041**.
- Release mode: `founder-offline-only`.
- Protected Internal.22 release source: `e1199a8e63af7e04d3ef3cf8f3e705dbfb0ea348` / PR #284.
- Signed updater run: `32205843573` — success.
- Current protected product source after today’s bounded Founder repairs: `fbc6cf386ec11f178a930116b39705079c01e89d` / PR #287, tree `6ee775680459ef457bca9da060a1310e4de5f0fd`.
- No open application PR existed before this docs-only reconciliation. Recheck live GitHub state at the start of the next session.
- **Critical boundary:** current protected `main` is newer than signed Internal.22. PRs #286 and #287 are source-complete on `main` but are **not contained in the currently published Internal.22 installer**. Do not claim installed validation for those repairs until a separately authorized signed checkpoint is built and installed.

## Founder problem register — this session

### Problem 1 — Windows sleep/resume + locale convergence

Observed on the installed app after leaving it open through Windows sleep:

- app resumed in Arabic mode but some routes initially rendered English until navigation away/back;
- some pages showed a load failure until manual Refresh;
- EN ↔ AR switching and returning did not feel atomic/smooth/professional.

Source repair: **PR #286** `fix: harden desktop resume and universal search`.

- Frozen reviewed head: `46e94fc9f0cc00a65ec4bbfb3101f47221f9a68f`.
- Protected merge: `34213d77e4fa3aee2f3ae38cd4d600e0f8adde67`.
- Root-cause package includes Tauri desktop service-worker retirement/narrowing, long-gap resume detection, local Next+SQLite health recovery with persistent bounded retry, locale/direction convergence, current-tree refresh and visible page-error retry.
- Source/browser evidence was green before merge.
- **Installed acceptance remains pending** because Internal.22 predates this repair.

### Problem 2 — Universal Search UI + latency

Founder judged the installed Search/Command Center visually below the Class-AAA bar and too slow to find results.

Also repaired in **PR #286**:

- immediate local page/workspace matching;
- shared projection warmup;
- coalesced protected record searching;
- parallel independent search families;
- bounded recent-message work;
- rebuilt RTL/LTR command-center hierarchy and interaction presentation;
- protected permissions, stale-request cancellation and technical-value bidi isolation preserved.

Source/browser evidence was green before merge. Installed feel/relevance/latency acceptance remains pending on a signed build containing #286.

### Problem 3 — Risk Engine seller UX

Founder rejected the installed Risk Engine overview because:

- six independently colored KPI cards were too noisy;
- the trend chart was cramped in a half-width layout and underused its container;
- the page felt widget-oriented rather than seller-friendly/actionable.

Source repair: **PR #287** `feat: rebuild Risk Engine as seller decision workspace`.

- Frozen reviewed head: `e27c6ce884529cbc60e9bd69a261a1e8b114b41d`.
- Protected merge: `fbc6cf386ec11f178a930116b39705079c01e89d`.
- Durable merge tree: `6ee775680459ef457bca9da060a1310e4de5f0fd`, identical to the frozen head tree.
- Final exact-head evidence:
  - CI `32276464061` — success;
  - Phase 5 Experience Gate `32276463348` — success;
  - Phase 6-7 Completion Gate `32276463184` — success.
- All review threads were resolved before merge.
- Final product shape: four calm neutral top KPIs; dominant full-width Risk Trend; restrained semantic escalation guides without colored bands; seller-attention panel; detailed confirmation table moved to Analysis; exact positive-impact ranking separated from historical frequency analytics; count-aware AR/FR/EN impact copy; Blacklist/Control/Rules permissions and risk-scoring authority preserved.
- **Installed visual acceptance remains pending** because Internal.22 predates #287.

## What is already finished — do not reopen generically

Do **not** restart these programs or re-audit the whole repository without a concrete reason:

- structural/semantic RTL foundation — PRs #273–#276;
- Inbox Class-AAA reconstruction — #278;
- AI Agents decision-workspace reconstruction — #279;
- Settings control-center reconstruction + Internal.21/FD-040 — #280;
- Class-AAA analytics/ECharts reconstruction — #281;
- Inbox V3 + WhatsApp pairing/recovery hardening — #282;
- original Universal Search / Command Center reconstruction — #283;
- Internal.22 release authority + signed publication — #284;
- sleep/resume + locale convergence + Search reliability/presentation repair — #286;
- Risk Engine seller-workspace reconstruction — #287.

Internal.20 rejection and the Internal.19 rollback remain historical evidence, not the active frontier.

## Current open evidence boundaries

- **#221 OPEN:** Founder-installed whole-product visual/accessibility/interaction acceptance. This remains the immediate human product gate and now also carries the post-Internal.22 source-repair handoff.
- **#230 OPEN P1:** resilient customer trial activation on representative Algerian networks. It independently blocks customer-online/public-trial readiness.
- **#226 CLOSED/completed:** retain its performance budgets as regression criteria; do not list it as an active blocker.
- Real-phone WhatsApp QR/link/reopen/outbound/inbound persistence evidence remains separate from source certification.

The historical retained issue tuple is **#221, #226, #230**. Current truth supersedes the old all-open interpretation: #226 is completed; #221 and #230 remain open.

## Exact next-session order

The Founder is currently enumerating installed-product problems one at a time. **Continue from Problem #4; do not restart from Problem #1, do not re-explore the whole codebase, and do not automatically begin a release.**

1. Resolve live protected `main`, open PRs and #221/#230 before writing. Expected handoff main is `fbc6cf386ec11f178a930116b39705079c01e89d`; treat it only as a checkpoint, never as a substitute for live GitHub truth.
2. Read this Working Memory plus Current State/Workflow. Remember that Current State’s signed-release sections still correctly describe Internal.22, while this file records the newer post-release product-source repairs.
3. If the Founder reports **Problem #4**, understand the observed installed behavior first, classify symptom vs likely root cause, inspect only the affected current-main layers, then create one bounded repair package if requested.
4. Preserve the already-merged #286/#287 fixes and their contracts; do not regress them while addressing later problems.
5. Continue collecting/repairing concrete Founder-installed defects against current `main` as bounded packages. Keep source/browser certification and installed acceptance distinct.
6. Do **not** tell the Founder that #286/#287 are visible in the current installed Internal.22 build. They are not.
7. When the Founder decides the current defect batch is sufficient, choose the next step explicitly:
   - either continue with another installed problem;
   - or, with explicit Founder authorization, reconcile release authority for a new signed Founder-offline checkpoint from exact protected `main` so #286/#287 and any later merged repairs can be tested on Windows.
8. A new signed checkpoint must preserve AppData, registry/install identity, keys and shop databases and must be built only from exact protected `main` under normal release authority/evidence rules.
9. Founder-installed acceptance after such a checkpoint should explicitly retest sleep/resume + EN/AR convergence, Universal Search real feel, Risk Engine seller UX, and any later repaired defects.
10. Keep #230 and real-phone WhatsApp evidence independent; neither is satisfied merely by the product UI repairs.

## Historical continuity anchors

### Wave 4 — what is implemented

The historical Wave 4 / Internal.16 Storefront line remains implemented history and must not be treated as a future task. Its downstream product evolution is already carried by later protected product source.

- **Phase 5 application-changing protected baseline:** `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734` / PR #220.
- Historical Internal.15 signed run: `31657621918`.
- Historical retained issue tuple: **#221, #226, #230**.

These markers preserve semantic/audit continuity only. They do not change the current post-Internal.22 execution order above.

## Protected invariants

Never weaken these to make an evidence lane green or to accelerate acceptance:

- Golden COD idempotency/version/audit/event/outbox authority;
- trusted actor/shop/session/permission boundaries;
- append-only inventory/money truth;
- provider durability/reconciliation;
- proposal-bound AI actions and approval authority;
- per-shop database and protected-record encryption boundaries;
- installation identity/key/licensing authority;
- native process containment;
- append-only migrations, backup/restore/replacement-install preservation;
- Storefront private draft → durable publish/pause/rollback and server-authoritative checkout;
- shared RTL primitive/portal direction, logical geometry and technical-value bidi isolation;
- updater signing/version/exact-protected-source guards.

## Hard rules

- One active application writer at a time.
- No generic codebase audit when a concrete Founder defect is already known.
- No generic RTL sweep unless direct regression evidence reopens a specific contract.
- No cross-SHA evidence mixing.
- No retry-away of deterministic red.
- No full MSI/release loop after every small edit.
- No release built from a branch-only source.
- No automatic Internal.23/version bump merely because post-Internal.22 repairs exist.
- Founder-installed visual judgment outranks automation for whole-product acceptance.
- Customer-online/Beta/Stable claims require their own evidence and explicit authority.

## Hard non-claims

At this handoff:

- Internal.22 does **not** contain PR #286 or PR #287;
- PR #286/#287 source certification is **not** Founder-installed certification;
- no new signed checkpoint has been authorized or published after Internal.22;
- Founder whole-product acceptance remains open;
- real-phone WhatsApp provider certification remains open;
- customer-online trial certification remains open;
- Beta is not established;
- Stable is not established.
