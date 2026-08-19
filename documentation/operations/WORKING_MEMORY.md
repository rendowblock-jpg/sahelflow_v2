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
- Current protected product source after the completed Founder repair batch: `39ffcc5d58e13699f74475579cd88bc511bceec4` / PR #290.
- Current durable product tree: `d9866c210c13267608120eb85eede4efbcf82637`.
- PR #290 frozen certified head: `997ebb96b28d4d222bc9c1ca9a56148562ef874a`; its tree is the same `d9866c210c13267608120eb85eede4efbcf82637`.
- Exact-head #290 evidence: CI `32307890772` — success; Phase 5 Experience `32307890579` — success; Phase 6-7 Completion `32307890634` — success.
- No open PR existed after #290 merged at this handoff. Recheck live GitHub state at the start of the next session.
- **Critical boundary:** protected `main` is newer than signed Internal.22. PRs #286, #287, #289 and #290 are source-complete on `main` but are **not contained in the currently published Internal.22 installer**.
- The Founder has now said this repair session is sufficient and wants the **next session to make the update**. That is the next observable outcome. Do not continue generic defect hunting before the release-authority step unless a release gate exposes a concrete deterministic defect.

## Founder repair batch completed after Internal.22

### Problems 1–2 — Windows sleep/resume, locale convergence and Universal Search

Source repair: **PR #286** `fix: harden desktop resume and universal search`.

- Frozen reviewed head: `46e94fc9f0cc00a65ec4bbfb3101f47221f9a68f`.
- Protected merge: `34213d77e4fa3aee2f3ae38cd4d600e0f8adde67`.
- Repairs desktop sleep/resume recovery, stale service-worker ownership, locale/direction convergence, visible page-error retry, Search warmup/coalescing/parallelization and command-center presentation.
- Protected permissions, stale-request cancellation, search authority and bidi isolation remain intact.
- Source/browser evidence was green before merge.
- Installed acceptance remains pending because Internal.22 predates this repair.

### Problem 3 — Risk Engine seller UX

Source repair: **PR #287** `feat: rebuild Risk Engine as seller decision workspace`.

- Frozen reviewed head: `e27c6ce884529cbc60e9bd69a261a1e8b114b41d`.
- Protected merge: `fbc6cf386ec11f178a930116b39705079c01e89d`.
- Exact-head evidence: CI `32276464061` — success; Phase 5 `32276463348` — success; Phase 6-7 `32276463184` — success.
- Final shape: calm KPI strip, dominant full-width Risk Trend, seller-attention signals, exact impact ranking and localized count-aware copy with risk-scoring/permission authority preserved.
- Installed visual acceptance remains pending because Internal.22 predates #287.

### Problem 4 — dashboard operations surfaces and delivery detail

Source repair: **PR #289** `Founder.4: repair dashboard ops surfaces and delivery detail`.

- Frozen head: `4f27c1712d72074b27a4f665d30b50de8d295a3f`.
- Protected merge: `0b090a0306d6f35c2721651365fde5b8b6b77a25`.
- Durable tree: `56bcda2c1a2e02f1421e62732f5744429023453c`, identical to the frozen head tree.
- Exact-head evidence: CI `32297928096` — success; Phase 5 `32297927912` — success; Phase 6-7 `32297927906` — success.
- Repairs the delivery detail RSC serialization crash, queue age presentation, RTL/LTR stock alignment/state treatment, and fills the dashboard operational column with a permission-gated 30-day Risk Watch using existing Risk Engine authority.
- No version/release change and no installed claim were made.

### Problem 5 — Arabic compact values, RTL controls, sidebar/Profile IA and annual demo

Source repair: **PR #290** `Founder.5: repair RTL controls, navigation IA and annual demo`.

- Frozen certified head: `997ebb96b28d4d222bc9c1ca9a56148562ef874a`.
- Protected merge: `39ffcc5d58e13699f74475579cd88bc511bceec4`.
- Frozen and merged tree: `d9866c210c13267608120eb85eede4efbcf82637`.
- Final exact-head evidence: CI `32307890772` — success; Phase 5 `32307890579` — success; Phase 6-7 `32307890634` — success.
- Both Codex P2 findings were repaired and review threads resolved before merge.
- Product result:
  - centralized Arabic compact numeric/bidi formatting for Accounting chart values;
  - shared Input/Textarea/Select and scoped legacy native-control RTL empty-state behavior;
  - Profile consolidated into Settings with `/profile` only as a compatibility alias;
  - stable seller-priority sidebar IA with manual persisted ordering removed;
  - one rolling deterministic 365-day Algerian demo workspace with coherent frozen clock authority and annual history.
- No version/release change and no installed acceptance claim were made.

PR #288 was a docs-only handoff between #287 and #289. It is historical continuity, not a product package.

## What is already finished — do not reopen generically

Do **not** restart these programs or re-audit the whole repository without a concrete release failure or direct regression:

- structural/semantic RTL foundation — PRs #273–#276;
- Inbox Class-AAA reconstruction — #278;
- AI Agents decision-workspace reconstruction — #279;
- Settings control-center reconstruction + Internal.21/FD-040 — #280;
- Class-AAA analytics/ECharts reconstruction — #281;
- Inbox V3 + WhatsApp pairing/recovery hardening — #282;
- original Universal Search / Command Center reconstruction — #283;
- Internal.22 release authority + signed publication — #284;
- sleep/resume + locale convergence + Search reliability/presentation repair — #286;
- Risk Engine seller-workspace reconstruction — #287;
- dashboard operations + delivery detail repair — #289;
- RTL controls/navigation IA/annual demo repair — #290.

Internal.20 rejection and the Internal.19 rollback remain historical evidence, not the active frontier.

## Current open evidence boundaries

- **#221 OPEN:** Founder-installed whole-product visual/accessibility/interaction acceptance. Source repair closure does not close this human gate.
- **#230 OPEN P1:** resilient customer trial activation on representative Algerian networks. It independently blocks customer-online/public-trial readiness.
- **#226 CLOSED/completed:** retain its performance budgets as regression criteria; do not list it as an active blocker.
- Real-phone WhatsApp QR/link/reopen/outbound/inbound persistence evidence remains separate from source certification.

## Historical continuity anchors

### Wave 4 — what is implemented

The historical Wave 4 / Internal.16 Storefront line remains implemented history and must not be treated as a future task. Its downstream product evolution is already carried by later protected product source.

- **Phase 5 application-changing protected baseline:** `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734` / PR #220.
- Historical Internal.15 signed run: `31657621918`.
- Historical retained issue tuple: **#221, #226, #230**. Current truth supersedes the old all-open interpretation: #226 is completed; #221 and #230 remain open.

These markers preserve semantic/audit continuity only. They do not change the next-session update order below.

## Exact next-session order — make the update

The Founder has explicitly chosen the **release/update path** for the next session. Start here; do not resume Problem #6 and do not start a generic audit first.

1. Re-resolve live protected `main`, open PRs, #221 and #230. Expected source checkpoint at this handoff is `39ffcc5d58e13699f74475579cd88bc511bceec4`; live GitHub truth wins if it moved.
2. Confirm there is still no unmerged application work and verify the protected tree still contains #286/#287/#289/#290.
3. Read the current release authority from `sahelflow.version.json`. At this handoff it is still Internal.22 / FD-041; **no next version exists yet**.
4. Create one bounded **release-authority-only** branch from exact protected `main`, using PR #284 as the release template. Do not mix new product/application changes into that PR.
5. Reconcile the next sequential Founder-offline version consistently across the version authority surface. At minimum inspect/update the authority and all files enforced by `bun run sf-version`, including:
   - `sahelflow.version.json`;
   - `package.json`;
   - `src-tauri/Cargo.toml`;
   - `src-tauri/tauri.conf.json` app + WiX MSI versions;
   - `scripts/sf-version.ts` Founder-offline version/decision allowlist;
   - any other release/version source identified by `sf-version` / updater-contract checks.
6. Do **not** invent or claim a new FD number merely from this handoff prose. The release-authority PR must explicitly bind the new version and its Founder decision/authority as one reviewed envelope. Do not reuse FD-041 for a different version.
7. Keep release mode `founder-offline-only`, channel `internal`, `ownedHostSuffix: null`, current updater key/endpoint/install mode, runtime protocol and shop-registry formats unless a separate proven release consequence requires a change.
8. Run the normal release-authority consequence gates on one exact frozen head: `sf-version`, updater contract, complete source quality, native/Rust release parity, Windows/MSI/install/reopen/preservation consequences and Required PR gate as selected by the repository workflows. Do not retry deterministic red without fixing its cause.
9. Perform adversarial review on that same exact head. Repair all actionable P0/P1 and any relevant release P2 before merge.
10. Merge with `expected_head_sha`, then re-fetch protected `main` and verify the durable source/tree before any signed publication claim.
11. Allow/trigger only the protected-main release dispatcher required by the repository’s release authority. Build/sign/publish from **exact protected main**, never the branch head.
12. Verify the signed update proves signature, staged runtime, exact source binding, MSI/updater install/reopen, authenticated hydrated UI, deterministic source rewrites, evidence manifest, `latest.json`, exact tag and publication target before calling the new Internal published.
13. Update/install that exact signed checkpoint on the Founder Windows machine **in place**. Preserve AppData, registry/install identity, keys and shop databases.
14. Retest the repaired Founder batch on the installed update: sleep/resume + EN/AR convergence, Search feel/latency, Risk Engine seller UX, dashboard/queue/product/delivery details, Arabic compact values, empty RTL controls, sidebar/Profile IA and the annual demo workspace.
15. Keep #230 and real-phone WhatsApp evidence independent. A successful Founder-offline update does not establish customer-online, Beta or Stable.

## Protected invariants

Never weaken these to accelerate the update or make a release lane green:

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

- One active application/release writer at a time.
- No generic codebase audit before the next release-authority step.
- No generic RTL sweep unless direct regression evidence reopens a specific contract.
- No cross-SHA evidence mixing.
- No retry-away of deterministic red.
- No branch-only signed release.
- No product changes hidden inside the release-authority PR.
- No reuse of FD-041 for a different version.
- No release claim before protected-main signed publication succeeds.
- Founder-installed visual judgment outranks automation for whole-product acceptance.
- Customer-online/Beta/Stable claims require their own evidence and explicit authority.

## Hard non-claims at this handoff

- Internal.22 does **not** contain PR #286, #287, #289 or #290.
- Source certification for those PRs is **not** Founder-installed certification.
- No new signed checkpoint has been created or published after Internal.22.
- No next Internal version/FD pair is established merely by this handoff.
- Founder whole-product acceptance remains open under #221.
- Real-phone WhatsApp provider certification remains open.
- Customer-online trial certification remains open under #230.
- Beta is not established.
- Stable is not established.
