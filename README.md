# SahelFlow

SahelFlow is a **Windows-first, local-first operations system for Algerian COD sellers**.

It combines governed COD order intake, customer/product operations, delivery and
returns, COD collection/remittance, inbox/WhatsApp, automations, AI, analytics,
settings, licensing, multi-shop and recovery under one protected authority model.

## Current repository truth

- Protected `main` at this 2026-08-11 handoff: `04adb20fb5846499039eda61a9b765deb9c622e6` — PR #236.
- Latest application-changing protected merge: **PR #236 — shared frontend foundation authority**.
- Published executable remains **Internal.14**, application source `2d60e2e74109b6e03626a5ccdff727c029a34591`, signed publication run `31388777098`.
- Published release remains **`1.0.0-internal.14`** / MSI `1.0.0.14`.
- Founder-installed release remains **Internal.14**; Founder-accepted baseline remains **Internal.5**.
- Active product phase remains **Phase 6 — Arabic, RTL and accessibility parity**.
- Open retained issues remain **#221, #226 and #230**.
- Phase 8 implementation remains frozen behind whole-product frontend adoption,
  installed Phase 6/7 closure, live #230 certification and explicit Founder acceptance.

Documentation-only commits may advance protected `main` without changing the
published executable or the latest application-changing protected merge.

## Protected frontend foundation

PR #236 protects the shared source/browser foundation required by the
Founder-installed Internal.14 rejection:

- application-oriented Noto Sans Arabic paired with Inter;
- atomic server-tree locale + document-direction commits across AR/FR/EN;
- one theme authority with coordinated Sahel/Atlas/Oasis/Dune accent families;
- one hydration-safe persisted density authority;
- shallow primary navigation with only genuine subflows visually nested;
- compact contextual notices instead of dominant routine warnings;
- governed chart, motion, mixed-direction and focus/accessibility primitives;
- resilient preference storage behavior;
- independent coarse-pointer touch-target authority across ordinary, slotted,
  portaled and command-palette controls.

The exact frozen #236 head `7d0b01a9f1989ad7e2cae25c3b0d39d6e92a64d8`
passed CI `31497523385`, Phase 5 Experience `31497523052`, Phase 6–7 Completion
`31497523030`, then received a clean fresh Codex review with zero unresolved
material review threads before squash merge to `04adb20fb5846499039eda61a9b765deb9c622e6`.

This is **source/browser foundation evidence**, not installed Founder acceptance.
Issues #221/#226/#230 therefore remain open.

## Active implementation frontier — Inbox

The only active implementation PR at this handoff is **PR #237 —
`feat(inbox): rebuild operational workspace`**, branch
`agent/inbox-product-workspace-redesign`, based on protected #236.

Exact handoff head: `cf84491cfd7613728a86dc9157da3fc4631e9105`.
The PR is open and mergeable but **not green and must not be merged yet**.

The package changes Inbox from a provider/demo-mode screen into a task-shaped
operational workspace where the shop database remains visible history/workflow
authority and WhatsApp connection is a separate transport state. It introduces
All/Unread/Open/Pending/Resolved queues, a durable thread/composer, contextual
workflow/team rail, bounded pairing/recovery surfaces and explicit responsive/RTL
behavior while preserving provider ingress, outbox, assignment, collaboration,
permission and message-extraction authority.

Current exact-head evidence has already isolated a small, concrete repair batch:
three ESLint `react-hooks/set-state-in-effect` errors, one Phase 5 Inbox evidence
sequencing error, one Phase 6 static hard-coded-copy failure, and a Phase 7
controlled-browser route-p95 regression/tripwire failure. Exact details and run/job
IDs are retained in
[`documentation/operations/WORKING_MEMORY.md`](documentation/operations/WORKING_MEMORY.md).

The next session resumes **PR #237**, fixes that batch, completes coherent Inbox
audit/evidence, then performs one fresh exact-head adversarial review and merges
only when all selected gates are green. **AI Agents follows Inbox; Settings follows
AI Agents.**

## Stabilization work protected before #236

- **PR #231** records the binding pre-Phase-8 Founder stabilization program.
- **PR #232** retires historical PR #200/#207 CI exception mechanisms as live bypasses.
- **PR #233** fixes successful-license-activation blank-workspace/restart behavior.
- **PR #234** protects resilient primary/recovery customer-trial source architecture.
- Exact #234 installed evidence satisfied and closed historical issues **#201** and **#214**.

Issue **#230** remains an external/live P1 certification boundary: source/CI cannot
prove the required SahelFlow-owned production DNS, independent recovery path,
protected production bindings, representative Algerian fixed/mobile reachability
or exact signed installed customer trial/recovery journey.

## Documentation and session resume

Start with [`AGENTS.md`](AGENTS.md), then
[`documentation/README.md`](documentation/README.md). The single durable session
resume owner is
[`documentation/operations/WORKING_MEMORY.md`](documentation/operations/WORKING_MEMORY.md),
reconciled against
[`documentation/system/CURRENT_STATE.md`](documentation/system/CURRENT_STATE.md)
and [`documentation/system/ROADMAP.md`](documentation/system/ROADMAP.md).

Supporting primary-source frontend research remains under
`documentation/archive/research/`. Archived material is evidence/context, never a
parallel authority or handoff system.

No Beta or Stable claim exists. Do not rerun the historical PR #228/Internal.14
publication workflow.