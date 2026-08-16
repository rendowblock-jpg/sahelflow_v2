# SahelFlow — Final completion roadmap

> **Status:** Binding dependency/completion order
> **Last reconciled:** 2026-08-16
> **Live protected main:** resolve GitHub `main` before every write/review/release action
> **Current protected-main SHA at this handoff:** `c8a8155079260dc4065ff30767c45cde95c266d2` / PR #269
> **Latest published checkpoint:** Internal.20 / FD-039
> **Founder-installed Internal.20 result:** **REJECTED**
> **Founder-requested visual/comparison baseline:** Internal.19 / FD-038
> **Source rollback status:** **COMPLETE** — affected application/experience layer restored to Internal.19 product baseline; release authority remains Internal.20
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Current execution mode:** design-first reset before further production UI implementation
> **Open retained issues:** #221, #226, #230

Internal.20 is the latest published technical checkpoint, but it is not the accepted product baseline. The Founder installed it and rejected the requested RTL/Arabic, Inbox, AI Agents, Settings and overall visual/product result, judging it worse than Internal.19. PR #269 restored the affected application/experience layer on protected `main` to the exact Internal.19 product baseline without rolling back package/release identity. Internal.19 is therefore the requested visual comparison baseline while the next direction is redesigned.

## Current dependency order

```text
protected canonical engine + protected connected/storefront platform
→ Internal.19 published Founder checkpoint
→ Internal.20 product/release convergence and technical certification
→ protected-main merge 7c794f72...
→ signed/published Internal.20 / FD-039
→ Founder installs Internal.20
→ REJECTED
→ PR #269 source/application rollback to Internal.19 product baseline
→ protected main c8a81550... with Internal.20 release authority preserved
→ verify/complete installed Internal.19 rollback on Founder machine
→ paired English/Arabic baseline screenshots
→ one shared-root visual diagnosis
→ Founder-approved target designs for shell/RTL + Inbox + AI Agents + Settings
→ one coherent implementation branch / one writer
→ repeated installed/screenshot visual inspection during implementation
→ freeze one product SHA only after approved visual direction is present
→ affected technical certification lanes
→ next signed Founder-only internal checkpoint
→ Founder-installed accept/reject
→ #226 installed performance/reliability
→ #230 owned licensing ingress + Algerian network trial/recovery evidence
→ remaining release-readiness evidence
→ explicit Beta/Stable promotion only when separately authorized
```

## Phase 0–4 — protected canonical foundation

Governance, Golden COD, identity/licensing/multi-shop, provider durability, protected data, migrations, backup/recovery, connected-platform and Storefront durable authority remain protected. Experience redesign may not weaken them for convenience.

## Phase 3 — providers, inbox, AI and automations

This historical phase completed **complete reconnaissance** and protected source/effect authority before later experience work. Provider durability/reconciliation, Inbox/AI authority boundaries and automation recovery remain protected during the design reset; the current work may redesign presentation and information architecture but may not weaken those canonical contracts.

## Phase 5 — whole-product AAA desktop experience

Historical Phase 5 application-changing protected baseline: PR #220 at `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`.

Later internal checkpoints proved that source/browser completion alone is insufficient for Founder visual acceptance. Phase 5 automation remains regression evidence, not a substitute for installed visual judgment.

## Phase 6 — Arabic, RTL and accessibility parity

The active product phase remains **Phase 6 — Arabic, RTL and accessibility parity**, but the execution method changes after the Internal.20 rejection.

Do not restart another generic RTL correction wave. The next work begins with approved product design.

The four design projects are:

1. Global shell + true Arabic RTL.
2. Inbox.
3. AI Agents.
4. Settings.

Each project must define a concrete English + Arabic target before broad implementation: Arabic/Latin typography, line heights, density, spacing, navigation geometry, pane dominance/proportions, surfaces, control/icon sizing, information architecture, state design, interactions and motion.

Arabic parity does not mean mechanical mirroring. Arabic may require different composition, grouping and rhythm while preserving the same product capability and authority.

## Internal.19 baseline checkpoint

Internal.19 remains published and available as the requested installed rollback/comparison baseline:

- published source `42e50f22f45bd524725300b3973ac45caffb6711`;
- `1.0.0-internal.19` / MSI `1.0.0.19`;
- FD-038 / `founder-offline-only`;
- MSI SHA-256 `044475e079a37f37319a77d6ee42821074e197b9ca5fac9abaea62b6b86f753e`.

PR #269 restored the affected application/experience layer on protected `main` to Internal.19 product blobs. That source rollback does not prove the Founder machine has been rolled back. Verify the actual installed version and preserve SahelFlow AppData/shop databases during any installed rollback. Internal.20 is still the newest updater release, so do not accept another Internal.20 prompt during the design reset.

## Internal.20 checkpoint — technical success, product rejection

Internal.20 was built from protected-main source `7c794f72a545313a0cf6fe34c2fabd9c583357ec`, reviewed through PR #267, technically certified, signed and published under FD-039.

Its technical evidence remains valid for the things actually measured: source checks, Phase 5/6-7 behavior, native/runtime contracts, signed MSI, install/reopen and authenticated hydrated WebView proof.

It does **not** establish Founder visual acceptance. The Founder installed Internal.20 and rejected the product result.

That rejection is binding for product direction. PR #269 does not erase or rewrite this publication/rejection history; it only restores the affected product presentation source to the requested Internal.19 baseline.

## Design-first reset gate

Before production implementation expands:

1. Verify/complete the installed Internal.19 rollback on the Founder machine.
2. Capture paired English/Arabic Internal.19 screenshots at the same desktop resolution for shell, Inbox, AI Agents and Settings.
3. Produce one concise shared-root diagnosis. Avoid screenshot-local CSS fixes.
4. Establish explicit target designs for English and Arabic.
5. Founder approves the visual direction.

A good design-reset checkpoint is not another release number. It is a Founder-approved target that is concrete enough to implement without guessing.

## Implementation gate after approval

After visual approval:

- one branch;
- one writer;
- shared design-system/information-architecture roots before page-local overrides;
- no new `rtl-fix.css` patch layer;
- targeted checks while implementing;
- no version/release churn during visual exploration;
- inspect paired English/Arabic screens repeatedly;
- preserve canonical behavior and durable data authority.

Only freeze the product SHA when the approved design is materially present and visually inspected. Preserve **expected-head merge** discipline whenever a certified implementation PR is merged; if the reviewed head moves, prior exact-head evidence becomes historical.

## Certification gate after product freeze

Run only technical lanes affected by the frozen source. Preserve existing evidence when exact identity/risk rules allow. Do not replay browser/native/MSI programs solely because documentation or release metadata changed.

Then create one coherent signed Founder-only internal checkpoint and judge the installed result.

Acceptance hierarchy for this reset:

**Founder-installed visual judgment > side-by-side screenshot comparison > real interaction behavior > automated technical gates.**

## Phase 7 — installed performance and reliability

#226 remains independent. T470/declared-floor performance and extended reliability evidence are not closed by browser timings, visual acceptance or signed MSI success.

## Customer licensing/network gate

#230 remains independent. Customer-online/public-trial claims still require owned licensing ingress, recovery path, representative Algerian fixed/mobile reachability and exact signed installed trial/recovery/outage/key-rotation evidence.

## Phase 9 — release certification and launch readiness

Stable/customer readiness requires coherent Founder product acceptance plus applicable installed performance/reliability, customer-network/licensing, provider, security/privacy/legal, rollout/support and representative seller-beta evidence, followed by explicit Founder promotion.

A green source tree is not a signed release. A signed release is not Founder acceptance. Founder acceptance is not installed performance or network certification.
