# SahelFlow documentation

> **Status:** Active documentation entry point
> **Last reconciled:** 2026-08-11
> **Protected `main` at handoff:** `04adb20fb5846499039eda61a9b765deb9c622e6` — PR #236
> **Latest application-changing protected merge:** PR #236
> **Published executable source:** `2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Published release:** `1.0.0-internal.14`, protected signed run `31388777098`
> **Founder-installed release:** Internal.14
> **Founder-accepted baseline:** Internal.5
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Active implementation PR:** #237 — Inbox operational workspace redesign
> **PR #237 exact handoff head:** `cf84491cfd7613728a86dc9157da3fc4631e9105`
> **Mandatory gate before Phase 8:** whole-product frontend adoption + installed Phase 6/7 closure + live #230 + explicit Founder acceptance
> **Open retained issues:** #221, #226, #230
> **Execution epic:** #164

Live protected `main`, releases, open PRs/issues and current Actions must be read
before implementation. Chat history and archived reports are context/evidence only.

## Active authority chain

SahelFlow uses ten active Markdown authorities:

1. [`product/PRODUCT.md`](product/PRODUCT.md) — seller, jobs, outcomes, tiers and acceptance.
2. [`product/EXPERIENCE.md`](product/EXPERIENCE.md) — interaction, visual, RTL and accessibility requirements.
3. [`product/DECISIONS.md`](product/DECISIONS.md) — Founder/product decision log.
4. [`system/ARCHITECTURE.md`](system/ARCHITECTURE.md) — technical invariants and canonical ownership.
5. [`system/CURRENT_STATE.md`](system/CURRENT_STATE.md) — merged truth and named evidence only.
6. [`system/ROADMAP.md`](system/ROADMAP.md) — binding Phase 0–9 order and exit criteria.
7. [`operations/WORKFLOW.md`](operations/WORKFLOW.md) — development, research, review, CI and merge process.
8. [`operations/WORKING_MEMORY.md`](operations/WORKING_MEMORY.md) — compact resumable execution frontier and the single session-resume owner.
9. [`research/RESEARCH.md`](research/RESEARCH.md) — adopted primary-source research and implications.
10. This file — navigation and authority order.

Repository `AGENTS.md` is the coding-agent entry point. Issue #164 is the execution
dashboard; it cannot silently weaken a higher authority. Do not create a parallel
permanent handoff/plan surface; fold resumable context into Working Memory and
source-grounded truth into Current State/Roadmap.

## Current product truth

Phases 0–4 remain protected under their documented canonical boundaries. PR #220
remains the earlier Phase 5 controlled-browser checkpoint and PR #223 the earlier
Phase 6 source/browser + Phase 7 measurement checkpoint. Those exact-head proofs
remain valid for what they established.

Internal.14 installed use changed the acceptance picture: the Founder values the
backend/engine but rejects the published frontend as the whole-product quality
baseline. The installed rejection is systemic across typography/density,
locale/RTL transitions, themes, motion, navigation, warnings, charts, Inbox, AI
Agents, Settings and route-wide coherence. The implementation team owns the
root-cause route/component audit rather than using the Founder as manual pixel QA.

## Shared frontend foundation now protected

**PR #236** / `04adb20fb5846499039eda61a9b765deb9c622e6` protects the
shared source/browser foundation before route-level redesign:

- Noto Sans Arabic application typography paired with Inter;
- atomic AR/FR/EN server-tree locale and document-direction transitions;
- one custom theme authority with coordinated accent families;
- one hydration-safe persisted density authority;
- shallow navigation and shared semantic notices/charts/motion;
- logical mixed-direction/RTL primitives;
- resilient preference storage;
- independent coarse-pointer target sizing through ordinary, slotted, portaled and
  command-palette controls.

Frozen head `7d0b01a9f1989ad7e2cae25c3b0d39d6e92a64d8` passed CI
`31497523385`, Phase 5 `31497523052` and Phase 6–7 `31497523030`, then a fresh
Codex review reported no major issue and all material threads were resolved before
merge.

This is not installed Founder acceptance. #221/#226/#230 remain open.

## Active implementation frontier — PR #237 Inbox

PR #237 is the only active implementation package at this handoff. It is open,
mergeable and **red**, therefore unmerged.

The Inbox package is intentionally a product-workspace redesign, not a backend
rewrite. It makes the shop database the visible inbox/history/workflow authority,
keeps WhatsApp connection as separate transport health, introduces task-shaped
queues plus durable thread/composer and context/team rail, compacts pairing and
ingress recovery, preserves message extraction/outbox/assignment/collaboration
boundaries, and carries the #236 AR/FR/EN/RTL foundation into a real operational
route.

Exact handoff head: `cf84491cfd7613728a86dc9157da3fc4631e9105`.
The current red evidence is fully classified in Working Memory. The repair batch
for the next session is bounded:

- three new ESLint `react-hooks/set-state-in-effect` errors;
- one Phase 5 Inbox browser assertion sequenced before selecting a conversation;
- one Phase 6 static localization failure from hard-coded `: Enter · Shift+Enter`;
- one Phase 7 controlled-browser p95 route tripwire failure at 8.3s / 9.514s
  versus the 8s clean-CI threshold.

Do not merge #237 until the exact current head passes selected CI/Phase 5/Phase
6–7 evidence and one fresh adversarial review with no unresolved material finding.
After Inbox, the adoption order is **AI Agents → Settings → remaining production
route inventory**.

## Stabilization progress protected after Internal.14

- **PR #231** records the mandatory pre-Phase-8 stabilization program.
- **PR #232** retires historical PR #200/#207 CI evidence bypass mechanisms.
- **PR #233** fixes successful license activation → blank workspace/restart behavior.
- **PR #234** protects resilient customer-trial source architecture and Worker readiness.
- **PR #236** protects the shared frontend foundation used by the active Inbox redesign.

Exact #234 installed evidence satisfied and closed historical issues **#201** and
**#214**. Current retained issue truth is:

- **#221 — open:** repaired coherent installed visual/accessibility + Founder acceptance.
- **#226 — open:** installed Phase 7 performance/reliability certification.
- **#230 — open P1:** live resilient customer-trial activation on representative Algerian networks.

Issue #230 cannot close from source/CI alone; owned production DNS, sufficiently
independent recovery routing, protected production bindings and signed installed
network evidence remain required.

## Published Internal.14 checkpoint

Internal.14 remains the published Internal release from application source
`2d60e2e74109b6e03626a5ccdff727c029a34591`, protected signed run
`31388777098`. Later protected source/documentation merges do not change that
published executable until a new release is explicitly built and published.

FD-031 remains a one-time PR #228/Internal.14 exception and does not weaken later
gates. Internal.14 remains Founder-installed but not Founder-accepted; no Beta or
Stable claim exists.

## Resume context

`operations/WORKING_MEMORY.md` is the single detailed session-resume owner. It
contains the exact #236 closure, PR #237 WIP head, current failed run/job evidence,
the connector-SHA anomaly warning, protected backend boundaries and exact
next-session order. `system/CURRENT_STATE.md` owns merged evidence truth and
`system/ROADMAP.md` owns dependency/exit order.

Supporting primary-source frontend research remains at
[`archive/research/PRE_PHASE8_FRONTEND_STABILIZATION_RESEARCH-2026-08-10.md`](archive/research/PRE_PHASE8_FRONTEND_STABILIZATION_RESEARCH-2026-08-10.md).
Archived research is supporting evidence only, not another handoff authority.