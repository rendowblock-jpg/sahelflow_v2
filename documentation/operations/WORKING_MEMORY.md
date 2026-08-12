# SahelFlow working memory

> **Purpose:** Compact resumable execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-12
> **Protected main:** `52ea0c79b3dddfcc569dbf2ab690747381f85d6a` — PR #243 docs reconciliation
> **Latest protected application merge:** `6e4477198f33344cd48c9230b32ff726079cd64d` — PR #242 Settings workspace
> **Active implementation PR:** #244 — `feat(orders): rebuild operational order workspace`
> **Active branch:** `agent/orders-product-workspace-redesign`
> **Latest application-changing checkpoint:** `0c36128a9fb161ae21f9e3a1f5750f2bada02745`
> **Published release:** `1.0.0-internal.14` / MSI `1.0.0.14`
> **Founder-installed release:** Internal.14
> **Founder-accepted baseline:** Internal.5
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Retained open issues:** #221, #226, #230
> **Phase 8:** frozen

Live GitHub is authority. Re-fetch protected `main`, PR #244 head, review threads and
Actions before any write. Keep one active implementation PR at a time. Source/browser
evidence is not installed Founder acceptance.

## Binding product truth

The Founder values the backend/engine and rejects Internal.14 as the frontend product
quality baseline. The systemic frontend problem register remains Arabic typography,
comfortable density, atomic locale/direction switching, warmer coherent themes,
restrained motion, RTL geometry, shallow navigation, warning hierarchy, useful
charts and route-wide workflow quality.

The protected route-adoption baseline is:

- PR #236 shared frontend foundation;
- PR #237 Inbox operational workspace;
- PR #240 AI Agents operational workspace;
- PR #242 Settings operational workspace;
- PR #244 Orders + confirmation queue is the active package.

None of those source/browser packages closes installed #221/#226, live #230 or the
Founder acceptance gate.

## Protected backend/business boundaries

Do not rewrite these for frontend convenience:

1. Golden COD command-kernel transaction/idempotency/version/audit/event/outbox authority.
2. Canonical source/manual order pricing, decision, expected-version and idempotency authority.
3. Canonical fulfillment/inventory/COD transitions and recovery semantics.
4. Trusted identity, exact-shop and action-permission boundaries.
5. Protected customer/order field projection and encrypted DB authority.
6. Provider courier capability/effect authority and durable effects.
7. Risk config/rules/scoring semantics and computational/audit payloads.
8. Licensing/trial authority; #230 live external certification remains open.
9. AI proposal-bound execution and automation durable recovery semantics.
10. WhatsApp ingress/account/idempotency/encrypted-event authority.
11. Native runtime supervisor/backup/recovery/installation identity.
12. Consequence-selected CI/evidence gates; never weaken them to land UI work.

Avoid schema, migration, licensing, provider or native changes inside #244 unless a
concrete bounded defect proves them necessary and consequence selection expands.

## PR #244 Orders + confirmation queue — active implementation frontier

PR #244 is open on `agent/orders-product-workspace-redesign`, based on protected
`main` `52ea0c79...`. It is currently ready-for-review so the real heavy gates run;
that status does **not** mean the package is merge-ready.

### Application checkpoint 1 — repaired review blockers

`9f6e96eca1f673edf2bbcc0e63b18c95877b2ffd` —
`fix(orders): repair hydration freshness contracts`

- Replaced brittle whole-file helper-name matching with semantic TypeScript AST
  import/call checks.
- Replaced formatter-sensitive fallback assertions with bounded semantic regexes.
- Corrected `useOrders()` SWR freshness semantics: exact server fallback skips the
  redundant first-hydration request only when that key has no older cached data;
  revisits with cached data revalidate so stale client cache cannot shadow fresh RSC
  truth.
- Preserved the batched Orders risk projector and exact permission-before-risk-read
  boundary.

Exact-head evidence: CI, Phase 5 and Phase 6–7 all passed.

The original three review threads (`PRRT_kwDOShPGIM6Yaxhl`,
`PRRT_kwDOShPGIM6Yaxhp`, `PRRT_kwDOShPGIM6Yaxhu`) are now outdated because their
code findings were repaired. They remain operationally unresolved only because no
explicit thread-resolution action has been taken.

### Application checkpoint 2 — review-first confirmation queue

`05d4dc92bb51f3c55693f0edb64f9b4147050595` —
`feat(orders): make confirmation queue review-first`

- Added one Orders runtime AR/FR/EN presentation-copy authority at
  `src/lib/i18n/orders-workspace.ts` and wired it through the shared server/client
  runtime translation resolver.
- Removed inline status mutation controls from the confirmation queue.
- Pending rows now open the order review; canonical mutation remains in existing
  `OrderStatusActions` on detail.
- Main `/orders` now exposes the confirmation queue as a visible pending-work action.
- Governed bulk-selection copy moved out of the table-local locale branch.
- Added source/runtime contracts for the review-first flow and localized copy.

Exact-head evidence:

- CI `31554348981`: PASS.
- Phase 5 `31554348863`: PASS.
- Phase 6–7 `31554348885`: PASS, including AR/FR/EN accessibility, RTL/reflow and
  performance browser job `93984302397`.

### Application checkpoint 3 — task-shaped governed review + localized risk presentation

`0c36128a9fb161ae21f9e3a1f5750f2bada02745` —
`feat(orders): shape governed confirmation review`

- Pending order detail now presents an explicit confirmation-review consequence
  zone and a route back to the queue.
- Existing `OrderStatusActions` receives the same order ID, current version and
  mutation authority; canonical decision semantics were not duplicated or changed.
- Added `src/lib/orders/order-risk-presentation.ts` as presentation-only mapping
  from deterministic risk factor IDs/values to localized copy parameters.
- Raw English `factor.explanation` is no longer rendered on order detail.
- Raw machine rule IDs are no longer rendered; only known localized rule labels are
  presented. Unknown rule IDs stay hidden from operator copy rather than leaking
  implementation strings.
- Risk config, rules, score calculation and audit/computational payloads are unchanged.
- Added unit/source contracts for localized factor presentation and authority reuse.

Exact-head evidence for `0c36128a...`:

- CI `31554885587`: PASS.
- Phase 5 `31554885427`: PASS.
- Phase 6–7 `31554885422`: PASS.
- Phase 6–7 source diagnostics `93985149185`: PASS — migrations, TypeScript,
  ESLint, full Vitest, dependency audit and migration status.
- Phase 6–7 rendered browser job `93985801155`: PASS — representative Algerian COD
  seed, hot-query/index checks, AR/FR/EN accessibility, RTL/reflow and controlled
  performance evidence.

No schema, migration, native, licensing, provider, Golden COD command kernel or risk
scoring source changed in these three checkpoints.

## Review status after the repaired application checkpoint

A fresh review re-fetch after `0c36128a...` found one valid current documentation
finding: the prior Working Memory still described the three already-repaired
blockers as active and instructed a future agent to redo them. This reconciliation
replaces that stale session-resume state with the proven frontier above.

Do not infer thread resolution from this edit. Re-fetch review threads before any
merge decision; thread state is separate from whether the underlying finding is
fixed.

## Remaining #244 frontier

Keep the next work inside the same Orders package:

1. **Governed operational copy**
   - `OrderStatusActions` still contains a component-local AR/FR/EN `DECISION_COPY`.
   - Consolidate that decision copy into the Orders runtime presentation catalog
     without changing command URLs, payloads, versions, idempotency keys or error
     authority.
   - Inspect fulfillment copy before changing it; only consolidate if a real local
     presentation split remains.

2. **Focused Orders journey evidence**
   - Add a dedicated browser journey for list → confirmation queue → order review →
     governed decision/detail using deterministic seeded authority.
   - Prove AR/FR/EN, RTL geometry, 1366×768 containment, 200%-equivalent reflow,
     keyboard/focus behavior and accessible names for the task flow.
   - Reuse canonical decision/fulfillment/courier/COD/return/refund/recovery paths.

3. **Performance re-measurement**
   - Re-measure `/orders` after batched risk and corrected SWR hydration/cache logic.
   - Keep the existing Phase 7 `<8000ms` controlled CI route tripwire unchanged.
   - The page still eagerly loads customer + active product/variant creation context
     for actors allowed to create orders. Add a narrow lazy create-context endpoint
     only if exact measurement still shows the route materially near/failing the
     unchanged tripwire, and preserve the exact existing `orders.create`, customer
     contact, order financial and `products.read` permissions.

4. **Final package review**
   - Self-review the complete #244 diff on the exact head.
   - Re-fetch review threads and perform fresh adversarial review.
   - Run fresh exact-head CI + Phase 5 + Phase 6–7 after the final material code
     change.
   - Do not resolve review threads, merge, or claim installed acceptance merely from
     green source/browser gates.

## Retained issue truth

- **#221 OPEN:** coherent repaired installed visual/accessibility + explicit Founder acceptance.
- **#226 OPEN:** installed Phase 7 performance/reliability certification.
- **#230 OPEN P1:** live resilient customer-trial production/network certification.
- Internal.14 remains Founder-installed but Founder-rejected.
- Internal.5 remains the Founder-accepted baseline.
- Phase 8 implementation remains frozen.

## Exact next-session order

1. Re-fetch protected `main`, #244 head, Actions and review threads; audit any delta.
2. Continue on the same `agent/orders-product-workspace-redesign` branch only.
3. Centralize remaining decision presentation copy without changing canonical order
   authority.
4. Add the dedicated Orders task-flow browser evidence.
5. Re-measure `/orders`; add lazy create context only if the unchanged tripwire/data
   proves it necessary.
6. Run focused tests, then exact-head CI + Phase 5 + Phase 6–7.
7. Fresh self-review/adversarial review before any merge discussion.
8. Keep #221/#226/#230 and the Phase 8 freeze intact until their installed/live/
   Founder gates are actually satisfied.
