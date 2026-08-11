# SahelFlow

SahelFlow is a **Windows-first, local-first operations system for Algerian COD sellers**.

It combines governed COD order intake, customer/product operations, delivery and
returns, COD collection/remittance, inbox/WhatsApp, automations, AI, analytics,
settings, licensing, multi-shop and recovery under one protected authority model.

## Current repository truth

- Protected `main` after the Inbox merge: `4d5d5946e7a47e6d9bbe8c13b92c8f6b92e34400` — PR #237.
- Latest application-changing protected merge: **PR #237 — Inbox operational workspace redesign**.
- Shared frontend foundation remains protected by **PR #236**.
- Published executable remains **Internal.14**, application source `2d60e2e74109b6e03626a5ccdff727c029a34591`, signed publication run `31388777098`.
- Published release remains **`1.0.0-internal.14`** / MSI `1.0.0.14`.
- Founder-installed release remains **Internal.14**; Founder-accepted baseline remains **Internal.5**.
- Active product phase remains **Phase 6 — Arabic, RTL and accessibility parity**.
- Open retained issues remain **#221, #226 and #230**.
- Phase 8 implementation remains frozen behind whole-product frontend adoption,
  installed Phase 6/7 closure, live #230 certification and explicit Founder acceptance.

Documentation-only commits may advance protected `main` without changing the
published executable or the latest application-changing protected merge.

## Historical Phase 5 closure continuity

The earlier **Phase 5 closure** source/browser checkpoint remains **PR #220** and
continues to be valid for exactly what its frozen head proved. The documentation
audit lineage tracks **issues #201, #214, #221, #226 and #230**; #201 and #214 are
now closed by stronger later evidence, while #221/#226/#230 remain retained.
**Published release: `1.0.0-internal.14`**. **Founder acceptance remains open**.

## Protected frontend adoption

PR #236 protects the shared source/browser frontend roots:

- application-oriented Noto Sans Arabic paired with Inter;
- atomic server-tree locale + document-direction commits across AR/FR/EN;
- one theme authority with coordinated Sahel/Atlas/Oasis/Dune families;
- one hydration-safe persisted density authority;
- shallow primary navigation, governed notices/charts/motion, mixed-direction and
  focus/accessibility primitives;
- resilient preference storage and coarse-pointer target authority.

PR #237 now protects the first product-workspace adoption package on top of those
roots. Inbox is database-authoritative even when WhatsApp transport is degraded,
uses task-shaped All/Unread/Open/Pending/Resolved queues, a durable thread/composer
and workflow/team context, keeps recovery visible, reconciles workflow mutations,
batches assignment-version projection and preserves provider ingress/outbox,
collaboration, permission and message-extraction authority.

The final pre-merge #237 head `8e9d5aa365f0c5873909c1c8517f88519d743b9d`
was updated onto the then-current protected `main`, all review threads were
resolved, and CI, Phase 5 Experience and Phase 6–7 Completion passed before the
protected squash merge to `4d5d5946e7a47e6d9bbe8c13b92c8f6b92e34400`.
This is source/browser evidence, not installed Founder acceptance.

## Next implementation frontier — AI Agents

The next product workspace is **AI Agents**, followed by **Settings**, then the
remaining production route inventory.

The AI package must consume rather than rewrite protected AI authority. Sensitive
model-suggested actions remain persisted proposals bound to exact tool/arguments,
permissions, shop/identity, target state and proposal digest; execution remains a
server-authorized approval ceremony. The frontend work should make sessions,
typed tool results, pending/failed/completed proposals, degraded AI/consent/key
states and recovery understandable without exposing raw JSON or inventing model
autonomy.

Current reconnaissance starts from `src/app/(dashboard)/agents/page.tsx`, the
existing monolithic `src/components/ai/ai-chat.tsx`, session/message streaming APIs
and `src/lib/ai/actions/*`. AR/FR/EN and RTL must consume the shared #236 authority.

## Retained acceptance boundaries

- **#221 — OPEN:** installed Founder Phase 5/6 visual/accessibility acceptance on a coherent repaired candidate.
- **#226 — OPEN:** installed Phase 7 performance/reliability certification on T470/floor hardware.
- **#230 — OPEN P1:** live resilient customer-trial production/network certification.

Historical #201 and #214 are closed by stronger exact #234 installed evidence.
Internal.14 remains Founder-installed but not Founder-accepted. No Beta or Stable
claim exists.

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
parallel authority or handoff system. Do not rerun the historical PR #228/Internal.14
publication workflow.