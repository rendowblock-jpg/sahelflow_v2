# SahelFlow — Working Memory

> **Purpose:** Single compact resumable handoff. Read after Current State, Roadmap and Workflow.
> **Last updated:** 2026-08-25
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Do not use this file as a live branch pointer:** resolve protected `main` from GitHub at action time.

## Current truth

- Protected `main` at handoff: `36dc7fb6d644814d0ab7a2b29c1d4ca4f8562b54`; live GitHub wins if moved.
- Latest signed/published checkpoint: **Internal.25**.
- App `1.0.0-internal.25`; MSI `1.0.0.25`; authority **FD-044**; mode `founder-offline-only`.
- Release PR #307; reviewed head `bb74cbb6c27932d5977c7a616c2ff214ae1f2bac`.
- CI `32792971378`, Phase 5 `32792971025`, Phase 6–7 `32792971024`, Native source `32792971023` — success.
- Dispatcher `32795149465`; signed updater/publication `32795159635` — success.
- MSI digest `sha256:9de9c18bde37ef026e7f72d2a371a8ff2a017a372efa5b3a3e70a7e3aa7e9265`.
- #221 closed/completed after Founder acceptance of installed Internal.24.
- #226 closed/completed; retain its budgets.
- #306 open — real-phone WhatsApp installed/provider certification.
- #230 open/reopened P1 — customer-online trial/network blocker; no owned production domain.
- No open PR existed at handoff.
- Current decision: **FD-045 First Revenue Certification**.
- Exact next outcome: **FRC-1 / #306 on signed Internal.25**.

## What Internal.25 adds

- #300 — encrypted connected-installation authority at rest plus bounded migration/rotation recovery.
- #304 — protected Windows DPAPI/AEAD custody for WhatsApp auth and inbound spool.
- #305 — field-aware, fail-closed minimization of Gemini-bound live/replayed AI tool results.
- #307 — Internal.25 / FD-044 release authority only.

Internal.25 retains the complete prior product line. Do not restart #273–#295 programs without direct regression evidence.

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

## Active FRC-1 failure and bounded repair

- On 2026-08-25 signed Founder-installed Internal.25 reached visible QR-linked
  state, then failed real inbound delivery.
- Two real inbound messages are retained in the encrypted sidecar spool. Each
  reached ten bounded retries with `RUNTIME_SESSION_REQUIRED`; zero provider
  ingress attempts or canonical Inbox rows were committed.
- Root: the packaged proxy applies the browser-only `sf_runtime` cookie boundary
  before `/api/whatsapp/inbound` can perform its private sidecar bearer-token
  authentication. The delivery-status callback is an affected sibling of the
  same boundary.
- Evidence is redacted under #306. Do not reconnect, logout, reset AppData,
  clear auth or delete the spool to simplify the repair.
- The active shop has exact annual-demo marker
  `demo_seed_version=algerian-cod-founder-v1`. Its read-only mutation policy
  would correctly block replay after the proxy repair. Do not allowlist or
  weaken that boundary. Preserve the shop, then use the supported
  Founder-confirmed **Remove demo data** operation or a separate empty non-demo
  shop before installed replay; retain the encrypted spool and installation
  identity.
- Active isolated branch: `codex/frc1-whatsapp-runtime-session`, based on
  `main@1380b00d788dc024d5ccbd8cbdd036f10b57dd7e`. The proposed source repair is
  not merged, signed, installed or live-provider accepted.
- Do not publish one update per symptom. Complete the demonstrated FRC-1 root
  and affected siblings with fast targeted feedback, freeze one exact repair
  head, run the consequence-selected GitHub gates, then create one separately
  reviewed signed checkpoint and perform one complete installed phone matrix.

## Exact next-session order — FRC-1 WhatsApp

1. Re-resolve protected `main`, open PRs, #306 and #230.
2. Resume the isolated repair branch and preserve the Founder installation plus
   the two encrypted pending messages unchanged.
3. Complete the exact loopback/bearer callback repair for inbound and delivery
   status without weakening browser runtime, seller-session or shop authority.
4. Inspect only directly affected reconnect, retained-spool replay, outbound
   receipt and close/reopen siblings; change them only from concrete evidence.
5. Run fast targeted TypeScript/lint/Vitest/provider checks during coding.
6. Freeze one exact repair head, open one PR and run selected Level 1/2/3 gates
   in GitHub Actions, including the packaged/installed callback consequence.
7. Perform adversarial review, resolve findings and merge with expected-head
   protection; verify protected source/tree.
8. Establish the next version/FD only through a separate reviewed
   release-authority envelope; do not rename Internal.25 evidence.
9. Before replay, preserve the Founder shop and use the supported confirmed demo
   removal or a separate empty non-demo shop. Do not delete the encrypted spool,
   reset AppData or weaken the demo mutation policy.
10. Build/sign/publish only from exact protected `main`, update the Founder
   installation once in place, and confirm the retained spool replays exactly
   once into the canonical Inbox.
11. Complete reopen persistence, outbound plus delivery state, a new inbound,
    EN and Arabic/RTL presentation, normal logout/session retirement and safe
    message-to-reviewed-order-draft observation.
12. Record redacted pass/fail under #306. Close only evidence actually observed.

## Following FRC packages

- **FRC-2:** seller-owned Gemini key, every exposed tool, privacy, proposal/permission/current-state authority, failures and AR/FR/EN/Darija/mixed extraction corpus through exactly-one reviewed order creation.
- **FRC-3:** finite ledger mapping Product Stable capabilities, 27 Required journeys, page-completion and architecture invariants to source/test/installed/Founder/external evidence.
- **FRC-4:** Shopify/YouCan official development environments and controlled WooCommerce live contract/reconciliation evidence.
- **FRC-5:** capability-specific courier certification from provider-issued contract plus sandbox/demo or protected authorized real-account evidence.
- **FRC-6:** explicit decision for a certified first paid assisted deployment; no customer access exception is currently implied.

## Current hard blockers and dependencies

- WhatsApp FRC-1 requires the Founder’s real phone/account, a non-demo test
  shop, and the next exact signed repair checkpoint installed in place.
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
- No customer-online/Beta/Stable claim from Founder-offline Internal.25.
- No first customer as an undisclosed experiment.
- Use selected Level 1/2/3 gates and expected-head merge for any repair.

## Hard non-claims

- Internal.25 real-phone WhatsApp certification is open.
- Complete AI/tools/order-extraction certification is open.
- Public commerce/courier live certification is not established by adapter source alone.
- Customer-online trial readiness remains open under #230.
- First paid assisted deployment is not yet authorized.
- Beta is not established.
- Stable is not established.
