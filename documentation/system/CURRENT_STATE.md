# SahelFlow — Current state

> **Authority:** protected source + exact release artifacts + Founder-installed/screenshot observation + newer explicit Founder decisions
> **Last assessed:** 2026-08-16
> **Live protected main:** resolve GitHub `main` before every write/review/release action
> **Protected post-rollback product/source anchor:** `c8a8155079260dc4065ff30767c45cde95c266d2` / PR #269
> **Completed RTL product/source anchor:** `133b9cf555e2250781bd5abbb53083e25314c185` / PR #276; later docs-only commits may advance live `main` without changing this product tree
> **Latest published checkpoint:** Internal.20 / `1.0.0-internal.20` / MSI `1.0.0.20` / FD-039
> **Founder-installed Internal.20 result:** **REJECTED**
> **Founder-requested comparison/baseline:** Internal.19 / `1.0.0-internal.19` / MSI `1.0.0.19`
> **Source rollback status:** **COMPLETE**
> **Structural/semantic RTL wave:** **COMPLETE FOR CURRENT SOURCE SCOPE**
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Current execution frontier:** Class-AAA workspace replacement program
> **Retained evidence/issues:** #221, #226, #230

## Installed/product authority

Internal.20 was successfully signed and published from protected source `7c794f72a545313a0cf6fe34c2fabd9c583357ec`. Its source/runtime/install evidence remains valid only for the technical properties it measured. The Founder installed Internal.20 and explicitly rejected the product result: the requested Arabic/RTL experience, Inbox, AI Agents, Settings and overall product quality were not delivered and the result was judged worse than Internal.19.

PR #269 completed the requested **source/application rollback** to the Internal.19 product presentation while preserving Internal.20 package/version/release/native authority. The actual Founder Windows installation remains an independent evidence surface; GitHub cannot prove which package is currently installed.

The Founder then supplied representative English/Arabic screenshots and identified that the remaining Arabic problem was deeper than shell placement: navigation children, portal content, technical values and analytical chrome could retain LTR assumptions inside an otherwise right-side shell. That explicit diagnosis authorized the structural/semantic RTL repair now completed through PRs #273–#276.

## Structural/semantic RTL closure — 2026-08-16

The current source-level RTL wave is closed. Do **not** interpret this as a promise that future code can never introduce an RTL regression; it means the Founder-authorized systemic wave has been implemented, reviewed and regression-protected on the current product tree.

Serial closure chain:

- PR #273 → `1579d456816ac297a992a9cd90d678589d93fc05`: one reactive direction authority across shell/shared primitives/portals, reactive toast direction, direct Arabic sidebar/Notifications/chart runtime evidence and explicit chart chrome-vs-coordinate direction domains.
- PR #274 → `8e3be74b0ccff1780e4300cdae186648fadca8f9`: logical `start`/`end` panel geometry, semantic Sheet/EntityInspector placement, directional control cleanup and first bidi boundaries.
- PR #275 → `bb9a792d53f71c80e6c919b8cd67072da3b43569`: shared `TechnicalValue` bidi isolation for order numbers, phones, delivery tracking references, return references and SKUs without forcing surrounding workbenches LTR.
- PR #276 → `133b9cf555e2250781bd5abbb53083e25314c185`: Topbar mobile navigation uses semantic inline-start geometry through shared Sheet authority and is covered by real Arabic 640×768 runtime direction/right-edge evidence.

Final #276 reviewed head: `3ded626b2e43aa29ce530430580a0f2681edebc6`.

Exact-head evidence:

- Phase 5 Experience Gate `31956729571` — success.
- CI / Required PR gate `31956729669` — success.
- Phase 6-7 Completion Gate `31956729576` — success.

The first mobile-sheet runtime attempt on superseded head `220e2a33fa3c268bd736e88c1099835aea6d6110` sampled the 500ms entrance animation and measured an intermediate translated position. Final evidence polls the settled panel edge and passes. There is no remaining known right-edge placement defect from that obsolete run.

At application-wave closure there were no open application PRs and no active application writer. Re-resolve live GitHub state before the next write.

## What is now protected by the RTL foundation

Current source/regression authority includes:

- reactive document/shell/primitive/portal direction;
- correct Arabic sidebar child ordering, not merely sidebar edge placement;
- Notifications portal direction;
- semantic start/end placement for directional panels;
- directional control/breadcrumb handling;
- bidi isolation of technical identifiers and phone/order/tracking/SKU values;
- explicit Arabic analytical UI chrome versus intentionally non-mirrored Cartesian/time/quantitative geometry;
- direct computed-direction and rendered-geometry checks, including Arabic mobile Sheet placement.

A future feature that touches these areas must preserve those contracts. `html[dir="rtl"]` or a right-side sidebar alone is not sufficient evidence.

## Active product frontier — Class-AAA replacement workspaces

The next product work is no longer a generic RTL sweep. Inbox, AI Agents and Settings remain explicitly rejected as workspace concepts and require **full product/UX replacement**, not another styling pass.

Required order:

1. Inbox.
2. AI Agents.
3. Settings.

For each workspace:

1. Map the protected jobs/actions/data/provider/AI authority that the presentation must preserve.
2. Discard rejected layout assumptions rather than cosmetically preserving them.
3. Define a concrete Class-AAA information architecture and interaction model in paired **English + Arabic** states, including pane hierarchy, navigation, primary actions, secondary actions, empty/loading/error states, typography/density, motion and RTL behavior.
4. Founder approves the target direction before broad production reconstruction.
5. Reconstruct serially with one application writer and inspect paired EN/AR states repeatedly during implementation.

The acceptance hierarchy remains:

**Founder-installed visual judgment > side-by-side screenshot comparison > real interaction behavior > automated technical gates.**

Automated gates remain mandatory correctness/regression evidence after implementation but do not substitute for Founder visual acceptance.

## Release identities — unchanged by RTL wave

### Internal.20 — published but Founder rejected

- Published source: `7c794f72a545313a0cf6fe34c2fabd9c583357ec`.
- Product certification SHA: `2af1f7f2b432e55df5e7a36ecaeda9662be65b14`.
- Reviewed PR #267 final head: `f2d6bc684907eacb003608a45cb6f219e16a3bd4`.
- Version: `1.0.0-internal.20`; MSI `1.0.0.20`; FD-039; `founder-offline-only`.
- Tag: `sahelflow-v1.0.0-internal.20-7c794f72a545313a0cf6fe34c2fabd9c583357ec`.
- Final MSI SHA-256: `40f654145ffb548c7d9a43d2557d39d52bdecf6c240eb1a458c0c09bd8c7136d`.

### Internal.19 — requested comparison baseline

- Published source: `42e50f22f45bd524725300b3973ac45caffb6711`.
- Version: `1.0.0-internal.19`; MSI `1.0.0.19`; FD-038; `founder-offline-only`.
- Tag: `sahelflow-v1.0.0-internal.19-42e50f22f45bd524725300b3973ac45caffb6711`.
- MSI SHA-256: `044475e079a37f37319a77d6ee42821074e197b9ca5fac9abaea62b6b86f753e`.
- Protected rollback anchor: `c8a8155079260dc4065ff30767c45cde95c266d2` / PR #269.

No Internal.21 was requested or created by PRs #273–#276. No signed MSI was built from the completed RTL source wave. Version, release, native, licensing, database, migration and customer-network authority remained unchanged.

## Next-session/order of execution

1. Resolve live protected `main` and confirm there is no active application writer.
2. Read the active authority/handoff documents; **do not restart generic codebase or RTL reconnaissance**.
3. Treat `133b9cf555e2250781bd5abbb53083e25314c185` / PR #276 as the completed RTL product/source anchor unless newer application source supersedes it.
4. Begin the Inbox replacement program: map protected jobs/actions/data authority, then produce a concrete paired English + Arabic Class-AAA target.
5. Obtain Founder approval before broad Inbox production reconstruction.
6. Reconstruct Inbox serially and inspect EN/AR repeatedly while preserving the completed RTL contracts.
7. Repeat the same target-approval/reconstruction process for AI Agents, then Settings.
8. Do not create release/version churn while replacement product direction is still exploratory.
9. Freeze/certify one product SHA only after approved direction is materially present and visually inspected.
10. Request/build the next signed Founder-only internal checkpoint only when separately authorized; verify the actual Founder-installed version/state before any installed acceptance claim.

## Protected canonical boundaries

The workspace replacement program must not weaken Golden COD transitions/idempotency/audit/event/outbox authority; identity/shop/session/permission boundaries; inventory/money truth; provider durability/reconciliation; proposal-bound AI actions; native containment; licensing/key authority; migrations/backup/recovery; Storefront durable publish/checkout/receipt semantics; updater signing/version protections.

Issues #221, #226 and #230 remain independent authorities. #226 installed performance/reliability and #230 customer-network/licensing are not closed by the RTL source wave.

## Historical authority continuity

The **Phase 5 merged result and evidence** remain historical technical continuity. The Phase 5 application-changing protected baseline is PR #220 / `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`; later Founder rejection changes product acceptance, not historical evidence.

The **Active Phase 6 frontier** remains `Phase 6 — Arabic, RTL and accessibility parity`. Historical entry into this frontier followed **Internal.14 publication evidence**, the **FD-031 exception boundary**, the **FD-032 Founder-only offline checkpoint boundary**, and **issue #214**. These are continuity anchors only; they do not instruct the next session to reopen the completed RTL wave.

- **Phase 5 closure** remains historical technical continuity; application-changing protected baseline PR #220 / `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`.
- The Phase 5 continuity register included issues #201, #214, #221, #226 and #230.
- The Founder-only `1.0.0-internal.15` checkpoint and signed run `31657621918` remain historical audit continuity.
- PR #269 remains the rollback anchor from rejected Internal.20 presentation back to the Internal.19 product baseline.
- PRs #273–#276 are the completed RTL structural/semantic repair line.
- **Founder acceptance remains open** on the current product-reset path. No later signed package has superseded the Founder-rejected Internal.20 result.

SahelFlow is **not yet a commercially certified Stable release**.