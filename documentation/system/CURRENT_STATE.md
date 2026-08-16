# SahelFlow — Current state

> **Authority:** protected source + exact release artifacts + Founder-installed/screenshot observation + newer explicit Founder decisions
> **Last assessed:** 2026-08-16
> **Live protected main:** resolve GitHub `main` before every write/review/release action
> **Protected post-rollback product/source anchor:** `c8a8155079260dc4065ff30767c45cde95c266d2` / PR #269; later docs-only commits may advance live `main` without changing this product tree
> **Latest published checkpoint:** Internal.20 / `1.0.0-internal.20` / MSI `1.0.0.20` / FD-039
> **Founder-installed Internal.20 result:** **REJECTED**
> **Founder-requested comparison/baseline:** Internal.19 / `1.0.0-internal.19` / MSI `1.0.0.19`
> **Source rollback status:** **COMPLETE** — affected application/experience layer restored to Internal.19 baseline; Internal.20 release authority preserved
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Active product mode:** Founder-authorized structural RTL repair now; design-first full rebuild targets for Inbox, AI Agents and Settings
> **Retained evidence/issues:** #221, #226, #230

## Installed/product authority

Internal.20 was successfully published from protected-main source `7c794f72a545313a0cf6fe34c2fabd9c583357ec` after the reviewed Internal.20 product/release convergence in PR #267. Its signed/runtime/install evidence remains valid for the technical properties it proved.

The Founder then installed Internal.20 and explicitly rejected the visual/product result. The stated outcome is that the requested RTL/Arabic experience, Inbox, AI Agents, Settings and overall product quality were not delivered and the result was worse than Internal.19. Therefore Internal.20 is **not an accepted product baseline** and must not be represented as UX closure merely because automated gates passed.

PR #269 completed the requested **source/application rollback**. Protected `main` now carries the affected application/experience files from the exact Internal.19 product baseline while retaining Internal.20 package/version/release/native authority and the historical fact that Internal.20 was published and rejected. The rollback PR was green on Phase 5, Phase 6-7 and Required PR/CI before squash merge; it did not request or dispatch a new signed release.

The actual Founder Windows installation remains a separate evidence surface. Verify the installed version before any installed/package acceptance claim. Internal.19 remains the intended comparison baseline during the reset.

## Newest Founder decision — 2026-08-16

The Founder supplied a representative English/Arabic screenshot set and then explicitly identified the defect class that prior work had underweighted:

- the Arabic shell/sidebar can be physically on the right while the **icon/label child order inside navigation remains LTR**;
- the Notifications popover/portal can open on the Arabic side while its **internal title/count/icon/copy ordering remains LTR or mixed**;
- analytical cards/charts can mix Arabic RTL chrome with LTR child ordering, tooltip/legend alignment or data labels;
- the same partial-RTL defect is expected across shared primitives and pages, including defects hidden among regions that already appear on the correct side;
- Inbox, AI Agents and Settings are not candidates for another cosmetic pass: they require complete Class-AAA product/UX reconstruction rather than preserving the rejected workspace concepts.

After that diagnosis the Founder explicitly authorized starting the work and getting it right “once and for all.” Under the repository authority order, that newer decision **supersedes the earlier blanket sequencing rule that prohibited all production RTL correction until another baseline screenshot cycle was completed**.

The authorization is deliberately bounded:

1. **Structural app-wide RTL foundation is authorized immediately.** Shared direction authority, Radix/portal behavior, logical start/end geometry, directional primitives, chart chrome domains, bidi isolation and runtime RTL regression evidence may be implemented now from the supplied evidence.
2. **Inbox, AI Agents and Settings remain design-first full rebuilds.** Their current information architecture is rejected. Source mapping and replacement target design may proceed, but broad production reconstruction of those three workspaces still requires a concrete English + Arabic target and Founder approval.
3. This decision does not authorize Internal.21, release/version churn, native/business/data changes or any weakening of protected canonical boundaries.

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

The previous loop came from solving the wrong class of problem and from measuring the wrong thing:

- engineering correctness was over-weighted against product-design quality;
- page/shell direction was mistaken for complete component-level RTL behavior;
- shared primitives and portal content could retain LTR internals even when the page moved correctly;
- charts need distinct direction domains instead of either leaving mixed behavior or blindly mirroring mathematical geometry;
- Inbox, AI Agents and Settings were patched/evolved instead of redesigned as complete workspaces;
- the visual direction was frozen before Founder approval;
- broad convergence changed too many surfaces at once;
- screenshot/installed visual review occurred too late;
- automated gates proved behavior but did not directly verify primitive child geometry, typography, balance, hierarchy, coherence or visual taste.

## Active product frontier

The current frontier contains **two deliberately separate workstreams**.

### A. App-wide structural RTL authority — implementation authorized

Start at shared roots, not screenshots or route-local overrides:

- one reactive locale/direction authority for the document shell and shared primitive libraries/portals;
- logical inline start/end geometry in directional UI;
- correct icon/label/control ordering in Arabic navigation, menus, popovers, sheets, dialogs, tables, filters and other compound components;
- explicit bidi isolation for technical/mixed-script values such as order IDs, SKUs, phone numbers, French/English product names and currency/value strings;
- explicit analytical domains: card chrome/copy/legend/tooltip follows Arabic RTL while Cartesian/time/quantitative coordinate geometry is not blindly mirrored;
- runtime regression tests that assert computed direction and actual child geometry inside representative Arabic primitives.

A right-side sidebar or `html[dir="rtl"]` alone is **not** completion evidence.

### B. Inbox + AI Agents + Settings — full replacement design

These are not “restyle” projects. Preserve protected business/provider/AI authority, but treat the rejected workspace layout/interaction concepts as replaceable. Map the jobs and canonical actions, define a clear Class-AAA information architecture and interaction model, produce concrete English + Arabic target designs, obtain Founder approval, then reconstruct production UI coherently.

The acceptance hierarchy remains:

**Founder-installed visual judgment > screenshot comparison > interaction testing > automated gates.**

Automated gates remain mandatory for correctness/regression protection after implementation, but they do not substitute for Founder visual acceptance.

## Next-session/order of execution

1. Resolve live protected `main` and keep one active application writer.
2. Complete the shared RTL direction foundation and direct regression evidence from the Founder-reported sidebar, Notifications and chart cases.
3. Perform a wider semantic RTL sweep across shared primitives and route dependency graphs; replace accidental physical-side layout with logical geometry where direction is semantic, and preserve explicitly non-directional analytical geometry.
4. Audit mixed-script/bidi data paths and SVG/chart label/value behavior.
5. Separately map Inbox, AI Agents and Settings jobs/authority and produce replacement English + Arabic Class-AAA target designs instead of polishing the rejected layouts.
6. Obtain Founder approval of those replacement targets before broad production reconstruction of the three workspaces.
7. Inspect paired English/Arabic screens repeatedly while implementing; do not wait until release time to discover direction defects.
8. Verify the actual Founder-installed version/state before any new package/installed acceptance claim. Preserve Founder AppData and shop databases.
9. Freeze/certify/release only after the approved product direction is materially present and inspected. No Internal.21 has been authorized merely by this RTL work.
10. Founder-installed outcome remains final truth; #226 and #230 remain independent.

## Protected canonical boundaries

The design reset must not weaken Golden COD transitions/idempotency/audit/event/outbox authority; identity/shop/session/permission boundaries; append-only inventory/money truth; provider durability/reconciliation; proposal-bound AI actions; native containment; licensing/key authority; migrations/backup/recovery; Storefront durable publish/checkout/receipt semantics; updater signing/version protections.

## Historical authority continuity

The **Phase 5 merged result and evidence** remain part of protected product history. The Phase 5 application-changing protected baseline is `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734` / PR #220. That evidence is technical continuity only and does not override later Founder-installed rejection.

The **Active Phase 6 frontier** was originally entered after **Internal.14 publication evidence** and the **FD-031 exception boundary**, then continued through the **FD-032 Founder-only offline checkpoint boundary** and **issue #214**. PR #269 is the protected source rollback anchor from rejected Internal.20 presentation back to the Internal.19 product baseline. These anchors remain audit continuity only, not instructions to restart the old implementation loop.

SahelFlow is **not yet a commercially certified Stable release**. Founder visual acceptance, #226 installed performance/reliability, #230 customer-network/licensing and later launch evidence remain separate authorities.