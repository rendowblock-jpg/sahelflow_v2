# Next session handoff — post-Internal.20 Founder rejection

> **Date:** 2026-08-16
> **Scope:** Product/experience reset only; no new release authority
> **Start from:** live GitHub `main` plus the Founder-installed Internal.19 comparison baseline

## What happened

Internal.20 was built, certified, merged and published correctly from protected main. The Founder installed it and rejected the result. The requested RTL/Arabic quality, Inbox, AI Agents, Settings and overall SaaS-level visual experience were not achieved; the Founder judged Internal.20 worse than Internal.19.

This is a product-design rejection, not a claim that the technical certification was fabricated. The technical gates remain evidence for the properties they measured, but they do not override the installed visual verdict.

The Founder requested rollback to Internal.19. Confirm the actual installed version at the beginning of the next session; do not assume the rollback completed.

## Do not repeat the previous loop

Do not begin by searching for more RTL CSS bugs or by launching another broad implementation wave.

Do not treat these as four ordinary bug fixes:

- RTL/Arabic shell
- Inbox
- AI Agents
- Settings

Treat them as four product-design projects.

The previous loop failed because engineering correctness, mirroring, pane geometry and automated browser evidence were repeatedly improved without first locking an approved visual/product direction. Inbox/AI/Settings were evolved from weak information architecture instead of being redesigned as complete workspaces. Too many surfaces changed together, and Founder visual review happened after large implementation/certification cost had already accumulated.

## Binding workflow for the next session

### 1. Verify baseline

- Resolve current protected `main` from GitHub.
- Verify the version installed on the Founder machine.
- If Internal.20 is still installed, complete/confirm rollback to the published Internal.19 MSI while preserving SahelFlow AppData.
- Do not accept another Internal.20 updater prompt during this reset.

### 2. Capture the real Internal.19 baseline

Use the same desktop resolution for paired screenshots.

Capture English + Arabic for:

1. Global shell/navigation and one representative dashboard/workspace.
2. Inbox with a loaded conversation.
3. AI Agents with a loaded session/tool context.
4. Settings with representative categories/details.

Do not use placeholders/spinners as visual evidence.

### 3. Produce one visual root-cause register

Diagnose shared causes, not screenshot-local symptoms. Cover at minimum:

- Arabic font choice and weight behavior;
- type scale, line height and microcopy sizing;
- density and spacing rhythm;
- LTR/RTL composition differences;
- navigation/sidebar geometry;
- pane widths and dominant-workspace hierarchy;
- surface/background/border/elevation treatment;
- control/icon sizing;
- information architecture;
- empty/loading/error states;
- transition/motion language;
- theme warmth/contrast;
- places where Arabic needs different composition rather than simple mirroring.

### 4. Design before production code

For each of the four projects, establish a concrete target for English and Arabic before implementation.

The target must specify actual visual values/patterns rather than vague words such as “premium” or “SaaS-like”. Include typography, dimensions, spacing, pane proportions, hierarchy, interactions and motion.

The Founder must approve the visual direction before the implementation wave expands.

### 5. Implement coherently

Only after approval:

- one branch;
- one writer;
- shared design-system/root fixes before page-local overrides;
- no new `rtl-fix.css` patch layer;
- targeted checks during implementation;
- no release/version bump during visual exploration;
- inspect paired English/Arabic screens repeatedly before certification.

### 6. Certify only after visual approval

After the approved design is materially implemented:

- freeze one product SHA;
- run only the technical lanes affected by the change;
- preserve existing evidence when source identity/risk rules allow;
- create release identity after product freeze, not during design iteration;
- produce one signed internal checkpoint;
- Founder-installed result is final acceptance truth.

## Acceptance hierarchy

For this experience reset:

1. Founder-installed visual judgment.
2. Side-by-side screenshot comparison against the approved design.
3. Real interaction behavior and responsiveness.
4. Automated technical gates.

Automated gates are required but cannot certify visual quality.

## Exact release anchors

### Internal.20 — published, Founder rejected

- source: `7c794f72a545313a0cf6fe34c2fabd9c583357ec`
- PR #267 final reviewed head: `f2d6bc684907eacb003608a45cb6f219e16a3bd4`
- product certification SHA: `2af1f7f2b432e55df5e7a36ecaeda9662be65b14`
- tag: `sahelflow-v1.0.0-internal.20-7c794f72a545313a0cf6fe34c2fabd9c583357ec`
- final published MSI SHA-256: `40f654145ffb548c7d9a43d2557d39d52bdecf6c240eb1a458c0c09bd8c7136d`
- FD-039 / founder-offline-only

### Internal.19 — rollback/comparison baseline

- source: `42e50f22f45bd524725300b3973ac45caffb6711`
- tag: `sahelflow-v1.0.0-internal.19-42e50f22f45bd524725300b3973ac45caffb6711`
- MSI SHA-256: `044475e079a37f37319a77d6ee42821074e197b9ca5fac9abaea62b6b86f753e`
- FD-038 / founder-offline-only

## Product constraints that remain protected

This visual reset does not reopen or weaken canonical order/COD transitions, audit/idempotency, inventory/money ledgers, identity/permissions, provider durability, AI authority boundaries, native containment, licensing/key authority, migration/backup/recovery, Storefront release/receipt semantics or updater signing/version controls.

## Definition of a good next session

A good next session does **not** end with another release number. It ends with a Founder-approved visual direction for the four rejected areas, backed by concrete English/Arabic screen targets that can be implemented without guessing.
