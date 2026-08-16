# SahelFlow documentation

> **Status:** Active documentation entry point; FD-038 and FD-039 Founder-only internal authority retained
> **Last reconciled:** 2026-08-16
> **Live protected main:** resolve GitHub `main` before every write/review/release action; do not treat a documentation SHA as the permanent branch head
> **Current protected-main SHA at this handoff:** `7c794f72a545313a0cf6fe34c2fabd9c583357ec`
> **Latest published checkpoint:** Internal.20 / `1.0.0-internal.20` / MSI `1.0.0.20` / FD-039
> **Founder-installed Internal.20 result:** **REJECTED**
> **Founder-requested visual/comparison baseline:** Internal.19 / `1.0.0-internal.19` / MSI `1.0.0.19` / FD-038
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Current execution mode:** design-first reset before further production UI implementation
> **Retained open evidence/issues:** #221, #226, #230

Live protected GitHub state is authority. Internal.20 was technically certified, merged and published, but the Founder installed it and rejected the visual/product result. Green CI/native/MSI/install evidence remains valid only for the properties it proved and does not override the Founder-installed rejection.

The Founder requested a rollback to Internal.19 and wants Internal.19 used as the comparison/design baseline. The next session must verify the actual installed version rather than assume rollback completion.

## Active resume path

Read in this order:

1. `operations/WORKING_MEMORY.md` — single compact resumable frontier.
2. `system/CURRENT_STATE.md` — current protected/release/installed truth.
3. `system/ROADMAP.md` — binding dependency order from design reset forward.
4. `product/PRODUCT.md` — seller/jobs/outcomes/tier authority.
5. `product/EXPERIENCE.md` — interaction/visual/RTL/accessibility requirements.
6. `product/DECISIONS.md` — consolidated Founder decisions; later release addenda remain represented by exact release authority and current docs.
7. `system/ARCHITECTURE.md` — technical invariants and canonical ownership.
8. `operations/WORKFLOW.md` — implementation/review/certification process.
9. `research/RESEARCH.md` — evidence and revalidation triggers.

Repository `AGENTS.md` is the coding-agent entry point. Archive material is evidence/context only. Do not restart generic reconnaissance.

## Current release truth

### Internal.20 — published, technically certified, Founder rejected

- Source: `7c794f72a545313a0cf6fe34c2fabd9c583357ec`.
- Reviewed PR #267 final head: `f2d6bc684907eacb003608a45cb6f219e16a3bd4`.
- Product certification SHA: `2af1f7f2b432e55df5e7a36ecaeda9662be65b14`.
- Version: `1.0.0-internal.20`; MSI `1.0.0.20`; FD-039; `founder-offline-only`.
- Tag: `sahelflow-v1.0.0-internal.20-7c794f72a545313a0cf6fe34c2fabd9c583357ec`.
- Final published MSI SHA-256: `40f654145ffb548c7d9a43d2557d39d52bdecf6c240eb1a458c0c09bd8c7136d`.
- Human verdict: **REJECTED**. The requested RTL/Arabic quality, Inbox, AI Agents, Settings and overall visual/product quality were not delivered to Founder expectation; Internal.20 was judged worse than Internal.19.

The first signed-release run created the exact tag but failed during an immediate tag re-read before publication. The tag later resolved correctly to the exact source commit. A second attempt started, the existing draft was manually published, and the rerun was later cancelled. This was release plumbing, not a new product defect.

### Internal.19 — requested rollback/comparison baseline

- Source: `42e50f22f45bd524725300b3973ac45caffb6711`.
- Version: `1.0.0-internal.19`; MSI `1.0.0.19`; FD-038; `founder-offline-only`.
- Tag: `sahelflow-v1.0.0-internal.19-42e50f22f45bd524725300b3973ac45caffb6711`.
- MSI SHA-256: `044475e079a37f37319a77d6ee42821074e197b9ca5fac9abaea62b6b86f753e`.
- Preserve `%APPDATA%\com.sahelflow.desktop` and `%LOCALAPPDATA%\com.sahelflow.desktop` during rollback.
- Internal.20 remains the newest published updater release; do not re-accept it during the design-reset period.

## Product conclusion after Internal.20

The repeated RTL/Inbox/AI/Settings loop failed because the work was performed at the wrong abstraction level. Engineering correctness, direction/mirroring, pane geometry and automated browser evidence were repeatedly improved without first establishing a Founder-approved visual/product direction. Inbox, AI Agents and Settings were evolved from weak information architecture rather than redesigned as complete workspaces. Too many surfaces moved together and installed visual review happened after large implementation/certification cost had already accumulated.

The next product work therefore starts with a **design-first reset**, not another code-first correction wave.

The four design projects are:

1. Global shell + true Arabic RTL.
2. Inbox.
3. AI Agents.
4. Settings.

For each area, establish a concrete English + Arabic desktop target first: typography, line heights, density, spacing, pane proportions, navigation geometry, surfaces, control/icon sizing, information architecture, interactions and motion. Founder approval of the visual direction comes before broad production implementation.

Acceptance hierarchy for this reset:

**Founder-installed visual judgment > side-by-side screenshot comparison > real interaction behavior > automated technical gates.**

Automated gates remain required for correctness; they cannot certify visual taste or product quality.

## Exact next-session order

1. Resolve live protected `main`.
2. Verify the actual Founder-installed version and complete/confirm rollback to Internal.19 if needed.
3. Capture paired English/Arabic Internal.19 screenshots at the same desktop resolution for shell, loaded Inbox, loaded AI Agents and Settings.
4. Produce one concise shared-root visual diagnosis; no screenshot-local patching.
5. Produce and obtain Founder approval for replacement visual targets.
6. Only then create one product branch/one writer and implement shared design-system/information-architecture roots.
7. Use targeted checks during implementation; do not churn release identity or replay full certification after tiny edits.
8. Freeze one product SHA only after the approved visual system is materially implemented and visually inspected.
9. Run only affected technical lanes, produce the next signed internal checkpoint, then judge the installed result again.
10. Keep #226 installed performance/reliability and #230 customer-network/licensing independent from visual acceptance.

## Protected continuity

The historical Phase 5 application-changing protected baseline remains PR #220 at `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`. PR #262 established the Internal.19 application/source baseline `8448c47123290f2e1af702ff24a427cc11c4781c`. These are audit/source continuity anchors, not instructions to restart old implementation phases.

Experience work must not weaken Golden COD command/idempotency/version/audit/event/outbox authority; identity/shop/session/permission boundaries; append-only money/inventory truth; provider durability/reconciliation; proposal-bound AI actions; native containment; installation/key/licensing authority; migrations/backup/recovery; Storefront durable publish/checkout/receipt semantics; updater signing/version/release-source protections.

Internal releases remain Founder/internal-lab checkpoints. Customer-online, Beta and Stable require their own explicit authority and coherent acceptance evidence. SahelFlow is not yet commercially certified Stable.

## Historical release continuity retained

- PR #250 carried the historical Internal.15 Founder checkpoint: `1.0.0-internal.15`; signed run `31657621918`.
- PR #251 / `agent/internal-16-wave-4` carried the historical Internal.16 Wave 4 continuity behind the current product line.
- These anchors are audit continuity only and do not supersede the current Internal.20 rejection/design-reset frontier.
- **Issues #221, #226 and #230 remain open.**
