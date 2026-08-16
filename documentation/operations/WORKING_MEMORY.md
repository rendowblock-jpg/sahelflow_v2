# SahelFlow working memory

> **Purpose:** Compact resumable execution frontier; never product/architecture/roadmap authority
> **Last updated:** 2026-08-16
> **Live protected main:** resolve GitHub `main` before every write/review/release action
> **Current protected-main SHA at this handoff:** `c8a8155079260dc4065ff30767c45cde95c266d2` / PR #269
> **Latest published release:** Internal.20 / `1.0.0-internal.20` / MSI `1.0.0.20` / FD-039
> **Founder-installed Internal.20 result:** **REJECTED — WORSE THAN INTERNAL.19 FOR THE REQUESTED EXPERIENCE**
> **Founder-requested product baseline:** Internal.19 / `1.0.0-internal.19` / MSI `1.0.0.19`
> **Source rollback status:** **COMPLETE** — affected application/experience layer restored to Internal.19 product baseline; Internal.20 release authority preserved
> **Internal.19 protected release source:** `42e50f22f45bd524725300b3973ac45caffb6711`
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Next-session mode:** design-first reset; no production UI implementation until visual direction is approved
> **Retained evidence/issues:** #221, #226, #230

## Current truth

Internal.20 is published and technically valid as a signed Founder/internal-lab package, but it is **not Founder-accepted product evidence**. The Founder installed it and explicitly rejected the result: the requested Arabic/RTL experience, Inbox, AI Agents, Settings and overall visual/product quality were not delivered, and the update was judged worse than Internal.19.

Do not reinterpret green CI, Phase 5/6-7, native, MSI, signed-install or authenticated-WebView evidence as UX acceptance. Those gates remain valid only for the technical properties they proved.

PR #269 completed the **source/application rollback** on protected `main`: the affected Internal.20 application/experience delta was restored to the exact Internal.19 product baseline while package/version/release/native authority remained Internal.20. The rollback PR passed Phase 5, Phase 6-7 and Required PR/CI on exact head before squash merge, and no new signed release was dispatched.

The Founder Windows installation is a separate evidence surface. At the start of the next session, verify the actual installed version; do not infer installed rollback from source state. The intended comparison/design baseline is Internal.19.

### Internal.20 publication facts

- Published protected-main source: `7c794f72a545313a0cf6fe34c2fabd9c583357ec`.
- Reviewed PR: #267; final reviewed head `f2d6bc684907eacb003608a45cb6f219e16a3bd4`.
- Product certification SHA: `2af1f7f2b432e55df5e7a36ecaeda9662be65b14`.
- Release: `1.0.0-internal.20`; MSI `1.0.0.20`; FD-039; `founder-offline-only`.
- Published tag: `sahelflow-v1.0.0-internal.20-7c794f72a545313a0cf6fe34c2fabd9c583357ec`.
- Final published MSI: `SahelFlow_1.0.0-internal.20_x64_en-US.msi`.
- Final published MSI SHA-256: `40f654145ffb548c7d9a43d2557d39d52bdecf6c240eb1a458c0c09bd8c7136d`.
- The first signed-release attempt created the tag but failed while immediately reading it back before publication. The tag later resolved correctly to the exact source commit. Attempt 2 was started, the draft was manually published while that rerun was active, and the rerun was later cancelled. This was release plumbing, not a product-code defect.

### Internal.19 rollback facts

- Published release source: `42e50f22f45bd524725300b3973ac45caffb6711`.
- Tag: `sahelflow-v1.0.0-internal.19-42e50f22f45bd524725300b3973ac45caffb6711`.
- MSI: `SahelFlow_1.0.0-internal.19_x64_en-US.msi`.
- MSI SHA-256: `044475e079a37f37319a77d6ee42821074e197b9ca5fac9abaea62b6b86f753e`.
- Protected source after PR #269: `c8a8155079260dc4065ff30767c45cde95c266d2`, with the affected application/experience files restored to their Internal.19 product blobs and Internal.20 release/version/native authority intentionally retained.
- Preserve `%APPDATA%\com.sahelflow.desktop` and `%LOCALAPPDATA%\com.sahelflow.desktop`; do not delete local shop databases during any installed rollback.
- Internal.20 remains the newest updater release, so a rolled-back Internal.19 install may offer Internal.20 again. Do not accept that update during the design-reset period.

## Why the previous approach failed

The repeated RTL/Inbox/AI/Settings loop was caused by working at the wrong abstraction level:

1. Engineering correctness was treated as evidence of product-design quality.
2. RTL was handled too much as mirroring/direction/overflow/layout mechanics instead of Arabic-native composition, typography, hierarchy and information architecture.
3. Inbox, AI Agents and Settings were iteratively patched rather than redesigned as complete workspaces.
4. The visual direction was frozen before Founder approval.
5. Too many surfaces moved in one convergence wave, creating corrective CSS/layout loops without producing coherent visual quality.
6. Screenshot/installed visual acceptance came too late; automated gates became over-weighted.
7. “Top-tier SaaS / AAA” was not converted into an explicit enough visual contract before implementation.

## Binding next-session strategy

Do **not** start Internal.21 by editing production UI. Do not begin another generic RTL fix wave. Do not add another `rtl-fix.css`-style patch layer.

The four design projects are:

1. Global shell + true Arabic RTL.
2. Inbox.
3. AI Agents.
4. Settings.

For each area, establish an approved English + Arabic desktop design first, using the Founder-installed Internal.19 screen as the comparison baseline. Specify actual typography, line heights, spacing, panel proportions, navigation geometry, icon/control sizing, surfaces, information architecture, interactions and motion before implementation.

Acceptance hierarchy for this reset:

**Founder-installed visual judgment > direct screenshot comparison > interaction testing > automated gates.**

Automated gates protect correctness and regressions; they do not certify visual taste or product quality.

## Exact next actions

1. Resolve live protected `main` from GitHub.
2. Verify which version is actually installed on the Founder machine and complete/confirm the **installed** Internal.19 rollback if still needed.
3. Collect paired Internal.19 screenshots at the same desktop resolution for English and Arabic: global shell, Inbox, AI Agents and Settings.
4. Build a concise visual root-cause register from those real screens; do not patch production code yet.
5. Establish and obtain Founder approval for the replacement visual direction for each area.
6. Only after approval, create one product branch/one writer and implement the approved system coherently.
7. Use targeted checks while implementing; no release/version churn and no repeated Phase 5/6-7/MSI loop after tiny edits.
8. Freeze one product SHA only after visual direction is materially implemented and inspected.
9. Certify the affected technical lanes, then produce the next signed internal checkpoint.
10. Founder-installed result remains the final product truth.

## Hard rules

- Internal.20 is **Founder rejected**, regardless of its technical certification.
- Internal.19 is the requested visual/product comparison baseline; source rollback is complete, installed state must still be verified.
- No Internal.21 release until Founder approves the visual direction first.
- One branch, one writer for the eventual implementation wave.
- No screenshot-local patching; fix shared design-system/information-architecture roots.
- No CI-green argument against a Founder visual rejection.
- Preserve canonical business/data/native/licensing/recovery boundaries while redesigning presentation.
- No customer-online/Beta/Stable claim from Founder-only internal packages.
- Do not restart generic codebase reconnaissance; use the existing architecture/docs and inspect only what the approved design work requires.

## Wave 4 — what is implemented

Wave 4 remains protected historical continuity behind the current product line. Connected/storefront/backup work from that wave is not generically reopened by this visual reset. The design reset may change presentation and interaction architecture, but it must not weaken protected provider, storefront, backup/recovery, canonical data or native boundaries.

## Historical continuity required by active authority

- Phase 5 application-changing protected baseline: `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734` / PR #220.
- The **Phase 5 merged result and evidence** remain historical technical continuity; they do not override later Founder-installed rejection.
- Internal.15 signed run `31657621918` remains audit continuity only.
- The **Active Phase 6 frontier** remains `Phase 6 — Arabic, RTL and accessibility parity`, but its current execution mode is design-first because source/browser parity did not produce Founder-approved visual quality.
- PR #269 is the protected source rollback anchor from rejected Internal.20 product presentation back to the Internal.19 product baseline, without rewriting release history.
- Issues #221, #226, #230 remain independent acceptance/performance/customer-network authorities.

## Exact next-session order

Resolve live protected `main`, confirm the actual installed Founder version, complete/confirm the installed Internal.19 rollback if needed, capture paired English/Arabic screens for shell + Inbox + AI Agents + Settings, produce one shared-root design diagnosis, obtain Founder approval for the replacement visual direction, and only then begin a new implementation wave. Do not restart historical phases or treat Internal.20 technical certification as visual acceptance.
