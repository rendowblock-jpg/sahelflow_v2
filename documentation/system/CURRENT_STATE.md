# SahelFlow — Current state

> **Authority:** protected source + exact release artifacts + Founder-installed observation
> **Last assessed:** 2026-08-16
> **Live protected main:** resolve GitHub `main` before every write/review/release action
> **Current protected-main SHA at this handoff:** `c8a8155079260dc4065ff30767c45cde95c266d2` / PR #269
> **Latest published checkpoint:** Internal.20 / `1.0.0-internal.20` / MSI `1.0.0.20` / FD-039
> **Founder-installed Internal.20 result:** **REJECTED**
> **Founder-requested comparison/baseline:** Internal.19 / `1.0.0-internal.19` / MSI `1.0.0.19`
> **Source rollback status:** **COMPLETE** — affected application/experience layer restored to Internal.19 baseline; Internal.20 release authority preserved
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Active product mode:** design reset before further implementation
> **Retained evidence/issues:** #221, #226, #230

## Installed/product authority

Internal.20 was successfully published from protected-main source `7c794f72a545313a0cf6fe34c2fabd9c583357ec` after the reviewed Internal.20 product/release convergence in PR #267. Its signed/runtime/install evidence remains valid for the technical properties it proved.

The Founder then installed Internal.20 and explicitly rejected the visual/product result. The stated outcome is that the requested RTL/Arabic experience, Inbox, AI Agents, Settings and overall product quality were not delivered and the result was worse than Internal.19. Therefore Internal.20 is **not an accepted product baseline** and must not be represented as UX closure merely because automated gates passed.

PR #269 completed the requested **source/application rollback**. Protected `main` now carries the affected application/experience files from the exact Internal.19 product baseline while retaining Internal.20 package/version/release/native authority and the historical fact that Internal.20 was published and rejected. The rollback PR was green on Phase 5, Phase 6-7 and Required PR/CI before squash merge; it did not request or dispatch a new signed release.

The actual Founder Windows installation remains a separate evidence surface. Verify the installed version before assuming the machine has been rolled back. Internal.19 is the intended comparison/design baseline during the reset.

## Release identities

### Internal.20 — published but Founder rejected

- Published source: `7c794f72a545313a0cf6fe34c2fabd9c583357ec`.
- Product certification SHA: `2af1f7f2b432e55df5e7a36ecaeda9662be65b14`.
- Reviewed PR #267 final head: `f2d6bc684907eacb003608a45cb6f219e16a3bd4`.
- Version: `1.0.0-internal.20`; MSI `1.0.0.20`; FD-039; `founder-offline-only`.
- Tag: `sahelflow-v1.0.0-internal.20-7c794f72a545313a0cf6fe34c2fabd9c583357ec`.
- Final published MSI SHA-256: `40f654145ffb548c7d9a43d2557d39d52bdecf6c240eb1a458c0c09bd8c7136d`.
- Publication required manual draft publication after the first workflow attempt created the exact tag but failed during immediate tag re-read. Attempt 2 was later cancelled after publication.

### Internal.19 — restored source/product comparison baseline

- Protected release source: `42e50f22f45bd524725300b3973ac45caffb6711`.
- Version: `1.0.0-internal.19`; MSI `1.0.0.19`; FD-038; `founder-offline-only`.
- Tag: `sahelflow-v1.0.0-internal.19-42e50f22f45bd524725300b3973ac45caffb6711`.
- MSI SHA-256: `044475e079a37f37319a77d6ee42821074e197b9ca5fac9abaea62b6b86f753e`.
- Protected source rollback anchor: `c8a8155079260dc4065ff30767c45cde95c266d2` / PR #269. This restores the affected application/experience layer to Internal.19 product blobs without pretending the published package sequence went backward.
- During any installed rollback preserve `%APPDATA%\com.sahelflow.desktop` and `%LOCALAPPDATA%\com.sahelflow.desktop`; do not delete local shop databases.

Internal.20 remains the newest published updater release, so Internal.19 may offer it again after an installed rollback. Do not re-accept Internal.20 during the design-reset period.

## Product conclusion from Internal.20

The failure was not primarily missing technical RTL mechanics. The repeated loop came from solving the wrong class of problem:

- engineering correctness was over-weighted against product-design quality;
- RTL was approached too much as direction/mirroring/geometry rather than Arabic-native visual composition;
- Inbox, AI Agents and Settings were patched/evolved instead of redesigned as complete workspaces;
- the visual direction was frozen before Founder approval;
- broad convergence changed too many surfaces at once;
- screenshot/installed visual review occurred too late;
- automated gates proved behavior but could not certify typography, balance, hierarchy, coherence or visual taste.

## Active product frontier

Do not begin another production implementation wave immediately.

The next frontier is a **design-first reset** around four separate product-design projects:

1. Global shell + true Arabic RTL.
2. Inbox.
3. AI Agents.
4. Settings.

Each must establish an approved English + Arabic desktop target first. Use the real Internal.19 installed screen as the baseline and define typography, spacing, density, pane proportions, navigation geometry, surfaces, controls, information architecture, interactions and motion before production code changes.

The acceptance hierarchy is now explicit:

**Founder-installed visual judgment > screenshot comparison > interaction testing > automated gates.**

Automated gates remain mandatory for correctness/regression protection after implementation, but they do not substitute for Founder visual acceptance.

## Next-session order

1. Resolve live protected `main`.
2. Read `documentation/operations/WORKING_MEMORY.md`.
3. Verify actual Founder-installed version and complete/confirm the **installed** rollback to Internal.19 if necessary.
4. Capture paired English/Arabic Internal.19 screenshots for the shell, Inbox, AI Agents and Settings at the same desktop resolution.
5. Build one concise shared-root visual diagnosis.
6. Produce/approve the replacement visual direction before editing production UI.
7. After approval, implement coherently on one branch with one writer and targeted checks.
8. Freeze/certify/release only after the approved visual system exists in the product.
9. Founder-installed outcome remains final truth.

## Protected canonical boundaries

The design reset must not weaken Golden COD transitions/idempotency/audit/event/outbox authority; identity/shop/session/permission boundaries; append-only inventory/money truth; provider durability/reconciliation; proposal-bound AI actions; native containment; licensing/key authority; migrations/backup/recovery; Storefront durable publish/checkout/receipt semantics; updater signing/version protections.

## Historical authority continuity

The **Phase 5 merged result and evidence** remain part of protected product history. The Phase 5 application-changing protected baseline is `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734` / PR #220. That evidence is technical continuity only and does not override later Founder-installed rejection.

The **Active Phase 6 frontier** was originally entered after **Internal.14 publication evidence** and the **FD-031 exception boundary**, then continued through the **FD-032 Founder-only offline checkpoint boundary** and **issue #214**. PR #269 is the protected source rollback anchor from rejected Internal.20 presentation back to the Internal.19 product baseline. These anchors remain audit continuity only, not instructions to restart the old implementation loop.

SahelFlow is **not yet a commercially certified Stable release**. Founder visual acceptance, #226 installed performance/reliability, #230 customer-network/licensing and later launch evidence remain separate authorities.
