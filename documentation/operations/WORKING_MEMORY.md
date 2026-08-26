# SahelFlow — Working Memory

> **Purpose:** Single compact resumable handoff. Read after Current State, Roadmap and Workflow.
> **Last updated:** 2026-08-26
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Do not use this file as a live branch pointer:** resolve protected `main` from GitHub at action time.

## Current truth

- Protected `main` at handoff: `4e395b0149da447daab37ad2d01be5c8bf1d6bce`; live GitHub wins if moved.
- Latest signed/published checkpoint: **Internal.27**. Latest Founder-installed checkpoint remains **Internal.26** until the normal updater completes.
- App `1.0.0-internal.27`; MSI `1.0.0.27`; authority **FD-047**; mode `founder-offline-only`.
- Product repair PR #312; release PR #313; reviewed release head `ef6a06c3a1b24127eea9e635796c42818f4c7d4e`.
- All Required PR checks succeeded; exact-head Codex review found no major issue; unresolved threads zero.
- Dispatcher `32913436865`; signed updater/publication `32913445791` — success.
- MSI digest `sha256:64865032b4a59b8cf4f36d1e6b23e6251e817044c90f78ee3bc673822b803756`.
- #221 closed/completed after Founder acceptance of installed Internal.24.
- #226 closed/completed; retain its budgets.
- #306 open — real-phone WhatsApp installed/provider certification.
- #230 open/reopened P1 — customer-online trial/network blocker; no owned production domain.
- No open PR existed before the current bounded repair branch.
- Current decision: **FD-045 First Revenue Certification**.
- Exact next outcome: **update Internal.27 in place, reply exactly once in the retained real WhatsApp LID conversation, then complete FRC-1 / #306**.

## What Internal.27 adds

- #312 — provenance-bound individual WhatsApp `numeric@lid` replies, Arabic empty-composer RTL with automatic entered-content direction, direct governed status control and reviewed AI order extraction from the thread header.
- #313 — Internal.27 / FD-047 release authority only.

Internal.27 retains the complete prior product/security line, including #309/#310/#311 and #300/#304/#305/#307. Do not restart #273–#295 programs without direct regression evidence.

## FD-045 First Revenue Certification

Founder context: no paid-infrastructure budget before first revenue; fast revenue is required, but the first customer must not be an undisclosed experiment.

Binding rules:

- “99.99% sure” = every defined Required matrix executed at the applicable layer, exact-candidate evidence, zero known P0/P1 and disclosed residual risk; not a mathematical warranty.
- Public promise = exact live-certified provider/action only.
- Unverified integrations remain hidden, disabled or conditional.
- Official/provider-issued authority and live credentials outrank wrappers and remembered docs.
- Open-source integrations are research inputs, not certification.
- Zero budget changes order, never integrity/privacy/security/customer truth.
- No paid deployment, online trial, Beta or Stable is authorized by this documentation alone.

## Active FRC-1 evidence and bounded repair

- Internal.26 was installed through the normal updater and reopened at exact
  app `1.0.0-internal.26` / MSI `1.0.0.26`; app, runtime and contained sidecar
  remained healthy and the linked WhatsApp state persisted.
- The Founder-confirmed **Remove demo data** operation completed. It temporarily
  appeared frozen, which is a separate demonstrated UI defect; the demo marker
  and demo rows were removed without deleting installation or WhatsApp state.
- The two encrypted retained inbound records then replayed exactly once: spool
  empty, two successful `ProviderIngressAttempt` rows, two applied ingress
  events, one canonical conversation and two inbound Message rows. Arabic/RTL
  Inbox presentation was visibly usable.
- The first outbound reply failed before durable queueing. Its exact persisted
  provider identity is a WhatsApp privacy LID (`numeric-id@lid`), while
  `normalizeWhatsAppJid` accepted only Algerian phone numbers/PN JIDs. No
  outbound Message, WhatsApp effect or OutboxIntent exists, so there is no
  duplicate-provider-effect risk from the failed click.
- The bounded repair accepts a valid individual `@lid` only when the exact
  WhatsApp conversation contains a persisted inbound Message and preserves it into the durable
  effect/sidecar send. Unbound opaque LIDs and non-individual JID domains remain
  fail-closed.
- The same installed Inbox observation showed that an empty Arabic composer
  starts LTR and moves right only after Arabic input. The package makes the
  Arabic-locale empty composer RTL from first render while retaining `auto` for
  French/English and mixed-direction content.
- Founder direction adds two first-class thread-header entry points without new
  mutation authority: the visible status badge opens the existing governed
  Open/Pending/Resolved/Snoozed control, and a professional AI-order action
  opens the existing candidate preview plus reviewed `MessageExtraction` flow.
  Extraction never silently creates a canonical order.
- The repair is merged through PR #312 and signed/published through PR #313 on
  `main@4e395b0149da447daab37ad2d01be5c8bf1d6bce`. It is not yet
  Founder-installed or live-provider accepted.
- Do not reconnect, logout, reset AppData or clear protected auth before the
  installed successor completes outbound, new inbound and reopen evidence.

## Exact next-session order — FRC-1 WhatsApp

1. Re-resolve protected `main`, open PRs, #306 and #230.
2. Confirm Internal.27 / FD-047 remains the exact latest signed release and
   update the Founder installation once in place through the normal updater.
3. Verify app `1.0.0-internal.27`, MSI `1.0.0.27`, preserved installation/shop
   state and normal close/reopen.
4. Reply once in the same real LID conversation and prove durable/provider
   receipt plus delivery state. Do not repeat an ambiguous effect.
5. Complete a new inbound,
    EN and Arabic/RTL presentation, normal logout/session retirement and safe
    message-to-reviewed-order-draft observation.
6. Record redacted pass/fail under #306. Close only evidence actually observed.

## Following FRC packages

- **FRC-2:** seller-owned Gemini key, every exposed tool, privacy, proposal/permission/current-state authority, failures and AR/FR/EN/Darija/mixed extraction corpus through exactly-one reviewed order creation.
- **FRC-3:** finite ledger mapping Product Stable capabilities, 27 Required journeys, page-completion and architecture invariants to source/test/installed/Founder/external evidence.
- **FRC-4:** Shopify/YouCan official development environments and controlled WooCommerce live contract/reconciliation evidence.
- **FRC-5:** capability-specific courier certification from provider-issued contract plus sandbox/demo or protected authorized real-account evidence.
- **FRC-6:** explicit decision for a certified first paid assisted deployment; no customer access exception is currently implied.

## Current hard blockers and dependencies

- WhatsApp FRC-1 requires the Founder’s retained real phone/account/session and
  the next exact signed LID-reply repair checkpoint installed in place.
- Real Gemini minimal inference requires a seller-owned key; free-tier work uses synthetic/redacted inputs only.
- Commerce requires development/test environments and HTTPS ingress for webhook tests.
- Courier live certification requires provider sandbox/demo or authorized seller credentials.
- #230 requires an owned production domain and representative Algerian-network evidence; `workers.dev` is development-only for this authority.

## Wave 4 — what is implemented

Historical Wave 4 / Internal.16 Storefront work remains implemented. PR #250, PR #251 and `agent/internal-16-wave-4` are continuity anchors, not active work.

- Phase 5 historical baseline: `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734` / PR #220.
- Historical Internal.15 `1.0.0-internal.15`; signed run `31657621918`.
- Historical retained tuple: **#221, #226, #230**; current truth is #221/#226 completed and #230 open, with #306 now the provider gate.
- Historical broader evidence set included issues #201, #214, #221, #226 and #230.

## Protected invariants

Never weaken:

- Golden COD idempotency/version/audit/event/outbox;
- trusted actor/shop/session/permission boundaries;
- append-only inventory/money truth;
- provider durability/reconciliation;
- proposal-bound AI action/approval authority;
- per-shop database and protected-record encryption;
- installation identity/key/licensing authority;
- native process containment;
- migrations/backup/restore/replacement preservation;
- Storefront durable publish/pause/rollback and server-authoritative checkout;
- shared RTL primitive/portal direction, logical geometry and technical bidi isolation;
- updater signing/version/exact-source guards.

## Hard rules

- One active implementation writer.
- No generic codebase/RTL/provider reconstruction before the exact FRC package.
- Heavy builds, full tests, Rust, MSI and complete gates run in GitHub Actions.
- No cross-SHA evidence mixing or retry-away of deterministic red.
- No branch-only signed release or hidden product change in release authority.
- No live-provider claim from source, mock, wrapper or test count.
- No credential in chat/source/test/issues/evidence.
- No customer-online/Beta/Stable claim from Founder-offline Internal.27.
- No first customer as an undisclosed experiment.
- Use selected Level 1/2/3 gates and expected-head merge for any repair.

## Hard non-claims

- Internal.27 real-phone WhatsApp certification remains open until the installed LID reply and remaining #306 rows pass.
- Complete AI/tools/order-extraction certification is open.
- Public commerce/courier live certification is not established by adapter source alone.
- Customer-online trial readiness remains open under #230.
- First paid assisted deployment is not yet authorized.
- Beta is not established.
- Stable is not established.
