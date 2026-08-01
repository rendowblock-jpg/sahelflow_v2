# Current session handoff

Date: 2026-08-01

This file is the exact resume point for the next SahelFlow coding session. It is
an execution handoff, not a claim that the active package or Phase 2 is closed.

## Protected truth

- Protected `main`: `522ab1642545803c7a9b6c320fe72cceb320e558`.
- Published executable source: `fb32faedc5ecfc1718e395824f437b805cbb9ef2`.
- Published release: `1.0.0-internal.13` / MSI `1.0.0.13`.
- Founder-accepted baseline: Internal.5.
- Working branch: `agent/phases1-4-completion-program`.
- Draft PR: #195 — open, draft, mergeable and unmerged.
- Do not modify, reset or delete the Founder-owned Windows checkout.
- Do not merge, mark ready, bump the version or publish a release from this
  checkpoint.

## Closed source packages

Phase 1 and Phase 2A.1–2A.4 remain source-closed. Do not reopen them without new
concrete P0/P1 evidence.

The active package remains **Teams and permissions completion**. Licensing and
native multi-shop remain later Phase 2 packages.

## Teams evidence already green

### Conversation assignment and handover vertical

- Exact head: `c72bf67afd954de3b51d473036adc47223b73d3e`.
- CI: `30683805165` — success.
- Integration checkpoint: `30683805097` — success.

This vertical replaced free-text assignment with exact durable members,
self-claim/release, manager/owner assignment and handover, optimistic versions,
idempotency, same-person replay, encrypted activity, trusted audit, current-shop
projection, revocation filtering and Arabic/French/English UI states.

### Shared collaboration foundation

- Exact head: `32566dd35759a8fc080538e58f802940dce05535`.
- CI: `30686712674` — success.
- Integration checkpoint: `30686712592` — success.

This foundation includes:

- shop-local workgroups and queues with governed command-kernel administration;
- generic conversation/order/confirmation routing;
- append-only encrypted internal comments and exact member mentions;
- explicit handover facts and collaboration projections;
- replay-safe mutable member resolution inside command handlers;
- optimistic concurrency, idempotency, revocation and archive blockers;
- Settings administration and migration/invariant tests.

## Current unclosed branch head

- Exact head: `34410a177ee98e320e7f922b89cc33a67c106a7b`.
- CI `30687975946` — success.
- Integration checkpoint `30687975865` — failure.
- TypeScript passed.
- ESLint passed.
- The first Vitest failure is a stale test fixture, not a known production
  failure.

The current head additionally contains:

- a server-driven invitation permission catalog and active Team Access editor;
- collaboration and field-level action vocabulary, including granular order
  create/update/delete actions;
- deny-by-default role ceilings and custom allowlists;
- permission-filtered order projections separating operational state, customer
  contact and financial fields;
- trusted-action enforcement on central order list/create/detail/update/delete
  routes;
- durable member attribution for manual-order commands through
  `businessPrincipalFromTrustedActor`;
- route and projection contract tests.

Do not describe this head as green or close Teams until its checkpoint passes.

## Exact current blocker

Failing file:

`src/app/api/__tests__/canonical-manual-order-boundaries.test.ts`

Failing test:

`canonical manual order API boundary > routes an omitted source through trusted intake and server pricing`

Observed result:

- expected HTTP 201;
- received HTTP 500.

Diagnosis:

The production `/api/orders` route now correctly requires
`requireTrustedAction("orders.create")`, binds the returned durable person to a
sealed business principal, and projects the response through trusted field
permissions. The old test still mocks only `requireTrustedActor()` for the
fulfillment routes and returns no trusted action context for order creation.
That stale harness reaches the new route with missing actor authority and is
classified as an unexpected 500.

No production permission weakening should be introduced to satisfy this test.

## First action next session

Make one test-only fixture repair in
`src/app/api/__tests__/canonical-manual-order-boundaries.test.ts`:

1. Add a durable owner `TrustedActorContext` fixture for the exact process shop.
2. Mock `requireTrustedAction` so order create/edit reads use that owner context.
3. Ensure the manual-order path receives a sealed test business principal. A
   partial mock may map `businessPrincipalFromTrustedActor` to
   `testAuthenticatedOwnerBusinessPrincipal(...)`.
4. Make `projectOrderForTrustedActor` operate with the fixture, either by
   partially mocking `isTrustedActorContext` as true in this isolated test or by
   using a pass-through projection mock.
5. Preserve the existing `requireTrustedActorMock` and its explicit rejection in
   the fulfillment authority-ordering test; do not collapse these two authority
   boundaries.
6. Rerun the exact-head CI and complete integration source checkpoint.

If another stale fixture appears, align only that fixture with the durable actor
contract. Do not restore setup-mode authentication, generic `requireAuth`, shared
owner PIN fallback or unfiltered order responses.

## Remaining Teams work after the checkpoint is green

1. Adopt generic queue routing and internal comments in two real operational
   surfaces: inbox and order detail.
2. Govern legacy conversation status, priority and labels mutations with explicit
   operational actions rather than generic authentication.
3. Confirm customer/contact and financial redaction across remaining material
   order/customer projections, not only the central order APIs.
4. Run a frozen exact-head adversarial pass covering replay, revocation,
   cross-shop scope, field leakage, concurrency, recovery and Arabic/French/
   English states.
5. Record exact green evidence and close Teams and permissions completion only if
   no P0/P1 remains.

After Teams closes, proceed in dependency order:

1. licensing and entitlements;
2. native multi-shop lifecycle;
3. Phase 2 frozen review and closure authority.

## Licensing orientation already established

The current license flow is not Phase 2-complete:

- the client self-issues a localStorage trial;
- a user can paste license JSON directly into client state;
- server sync is best-effort;
- durable protected-store activation, non-forgeable trials, entitlement limits,
  transfer/recovery and offline/expiry policy remain unimplemented.

Do not start licensing until Teams and permissions completion is exact-head green
and recorded closed.

## Resume checklist

1. Read `AGENTS.md`.
2. Read `documentation/README.md`.
3. Read `documentation/system/ROADMAP.md`.
4. Read `documentation/operations/WORKING_MEMORY.md`.
5. Read this file.
6. Inspect PR #195 and issue #164 live state.
7. Confirm branch head and check runs before writing.
8. Repair the one stale canonical-order fixture first.
