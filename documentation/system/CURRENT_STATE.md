# SahelFlow — Current State

> **Status:** Source/evidence/release/provider truth for the current execution frontier
> **Last assessed:** 2026-08-28
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Live protected main:** resolve from GitHub before every action; at reconciliation `d104da72dcfb7950df0b437ce279377b28e7df4b` after release PR #333
> **Current signed release:** Internal.28 / `1.0.0-internal.28` / MSI `1.0.0.28` / FD-049 (published; Founder installation pending)
> **Reviewed release head:** `d48cd1cf26110743b44a72dff734dd7f4bcbc637`
> **Signed publication run:** `33136814065` — success
> **Current execution:** FD-049 installed Founder campaign — the Founder applies the in-place Internal.28 update, executes the retained #306 real-phone rows plus applicable #316/#317 native rows, evidence is reconciled, then FRC-2–5 resume

This document distinguishes protected source, automated evidence, signed publication, CI-installed evidence, Founder-installed judgment, live-provider certification, customer-online readiness, paid deployment, Beta and Stable. A lower evidence level never claims a higher one.

## 1. Exact release authority

Internal.28 is the latest signed/published artifact:

- protected release source `d104da72dcfb7950df0b437ce279377b28e7df4b` / release PR #333 (equals protected `main`);
- app `1.0.0-internal.28`;
- MSI `1.0.0.28`;
- channel `internal`;
- authority FD-049;
- mode `founder-offline-only`;
- owned host suffix `null`;
- customer-online licensing disabled.

PR #333 reviewed head `d48cd1cf26110743b44a72dff734dd7f4bcbc637` passed all 21 Required checks with zero failed and zero unresolved review threads. Its release tree packages the product source through #331 from protected source; the certified product head is `9ed2fa15c2a9571d8a7f0c1f02e39052f18a0f80` (CI `33132059574`, Phase 5 `33132059464`, Phase 6-7 `33132059457`), product-tree-equivalent to the pre-release protected main.

After expected-head merge, dispatcher `33136807451`, signed updater/publication run `33136814065` and release observer `33136822222` succeeded on exact protected main. The release was published at tag `sahelflow-v1.0.0-internal.28-d104da72dcfb7950df0b437ce279377b28e7df4b`.

Published MSI:

- `SahelFlow_1.0.0-internal.28_x64_en-US.msi`;
- digest `sha256:004ce6e3ebdde04f268cbc09d17f7787741ed877e65e61c1aa59d04d9edb1a64`.

The Founder has **not yet installed** Internal.28; the latest Founder-installed checkpoint remains Internal.27 (dispatcher `32913436865`, signed run `32913445791`, tag `sahelflow-v1.0.0-internal.27-4e395b0149da447daab37ad2d01be5c8bf1d6bce`, MSI digest `sha256:64865032b4a59b8cf4f36d1e6b23e6251e817044c90f78ee3bc673822b803756`). Preserve that installation state until the in-place update and campaign.

## 2. Product/security line packaged in Internal.28

Internal.28 retains the accepted Internal.24 product line and the Internal.25/26/27 security/provider/product foundation. Its direct package includes:

- **#315** — response CSP aligned with Tauri's loopback-only ephemeral-port policy, durable-projection fallback and socket retry for the demonstrated live-push root;
- **#319** — #316 Class-AAA durable Notification Center and WhatsApp attention routing;
- **#324/#325/#327/#329** — durable outbound image, MP4 video, document and voice/PTT sending with encrypted staging, canonical Message/outbox authority and deterministic account-bound receipts;
- **#331** — professional Inbox interaction parity: durable quoted replies with queue-time provenance resolution, safe message copy, upload progress with in-flight cancellation, JPEG thumbnails with fail-closed fallback, and paste/drop composition;
- **#333** — version/release/licensing authority only for Internal.28 / FD-049.

## 2a. Product/security line packaged in Internal.27 (retained history)

Internal.27's direct package was #312 individual WhatsApp `numeric@lid` replies with persisted inbound provenance, Arabic empty-composer RTL with automatic entered-content direction, governed status control and reviewed AI order extraction, plus #313 version/release/licensing authority for Internal.27 / FD-047. That line remains inside Internal.28.

#309/#310/#311 remain the protected Internal.26 callback, resizable-Inbox and release foundation. #300/#304/#305/#307 remain the protected Internal.25 security/provider prerequisites.

Earlier integrated product packages are not future work: #273–#276, #278–#284, #286/#287/#289/#290 and #293–#295 remain protected foundations.

## 3. Founder-installed truth

Issue #221 is **closed/completed**. On 2026-08-25 the Founder recorded installed Internal.24 / MSI 1.0.0.24 as accepted for the retained whole-product visual/product gate.

That acceptance:

- is real Founder human evidence for Internal.24;
- does not imply that later #300/#304/#305 source was inside Internal.24;
- does not prove real-phone WhatsApp, live commerce/couriers, customer-online licensing, Beta or Stable;
- does not itself accept Internal.27 or close FRC-1.

## 4. Current live issue and provider boundary

- **#221 — CLOSED/completed:** Founder-installed whole-product visual/product gate accepted on Internal.24.
- **#226 — CLOSED/completed:** performance/reliability budgets retained as regression authority.
- **#306 — OPEN:** real-phone WhatsApp installed/provider proof.
- **#316 — OPEN:** Class-AAA durable Notification Center and WhatsApp attention routing is source-merged through PR #319; signed/installed/native evidence is pending.
- **#317 — OPEN:** WhatsApp Inbox operational parity and certified message/media matrix.
- **#230 — OPEN/reopened P1:** resilient customer trial activation on representative Algerian networks; no owned production domain exists.
- PR #315 remains protected source; PR #319 merged the #316 Notification Center to protected `main` as `a3216a63b74ca2c33713f95f85df4ed6e2717567`. No open PR existed immediately after #319.

Source conformance and signed Windows proof do not close #306 or #230.

## 5. First Revenue Certification decision

FD-045 establishes the current execution program. The Founder has no paid-infrastructure budget before first revenue and wants the strongest defensible assurance before a first customer.

The adopted interpretation is:

- every publicly promised Required feature/journey must have current applicable evidence;
- zero known P0/P1 is mandatory for the promised exact candidate;
- residual third-party risks must be disclosed;
- no claim of literal mathematical certainty or permanent third-party availability;
- only exact live-certified provider actions may be public;
- unverified provider actions remain hidden, disabled or conditional;
- no customer is used as an undisclosed provider experiment.

### FD-048 batching boundary

The Founder explicitly changed the immediate execution order after PR #315:
reconcile documentation, implement #316, implement #317, complete FRC-2–5
source/contract/mock/official development-or-sandbox/available CI work, then
freeze one combined protected-main candidate. A new signed successor and one
preserved in-place Founder update require separate release authority and happen
only after that source frontier is assembled.

FD-049 (2026-08-27) supersedes FD-048's timing for the next checkpoint: once #317 completes on protected `main`, one signed successor (Internal.28) is authorized for Founder-installed testing before FRC-2–5 resume.

FD-048 does not close #306, convert source evidence into live certification,
authorize a release/customer/Beta/Stable, or weaken #230. It reduces repeated
build/install cycles while preserving one exact-candidate evidence chain.

## 6. WhatsApp current boundary — FRC-1

Internal.27 is installed in place and preserves the linked-device state. The
authenticated callback repair is now demonstrated in the real installed path:
after the Founder used the supported **Remove demo data** operation, the two
encrypted retained inbound records replayed exactly once, the spool emptied,
both `ProviderIngressAttempt` rows succeeded, and one canonical Inbox
conversation with two inbound Message rows appeared. Arabic/RTL presentation
was visibly usable. The removal operation temporarily appeared frozen before
completing; that UI symptom remains a separate demonstrated defect and is not
silently treated as a WhatsApp failure.

The first outbound reply then exposed the next concrete FRC-1 blocker. The real
conversation uses WhatsApp's privacy-preserving individual identifier
`numeric-id@lid`. SahelFlow persisted that identifier correctly on inbound, but
its durable outbound normalizer accepted only Algerian phone numbers or
`@s.whatsapp.net`, so the reply was rejected before Message, effect or OutboxIntent
commit. The UI correctly showed failure; database inspection confirmed zero
outbound durable rows and therefore no duplicate/provider-effect risk.

Protected product repair PR #312 and signed Internal.27 permit a
syntactically valid individual `@lid` only when
the exact WhatsApp conversation contains a persisted inbound Message, preserves
it end to end for Baileys, and continues rejecting
groups, broadcasts, arbitrary JID domains and unbound opaque LIDs. Source and CI
cannot prove live delivery. The same real conversation was retested exactly once
on Internal.27 and passed with one outbound Message, one succeeded WhatsApp
OutboxIntent, attempt count one, provider receipt/delivery state and no duplicate.

The installed Internal.27 Arabic Inbox shows the empty composer RTL from first
render while retaining automatic entered-content direction. The thread-header
status and AI-order entry points are visibly present; their governed interactions
remain in the physical FRC-1 matrix.

Founder direction also makes the thread-header status badge invoke the existing
authorized workflow-status control and adds a professional AI-order entry point
there. The AI action previews the selected inbound candidate and reuses the
existing reviewed extraction/order flow; it does not introduce a second action
path or silently create a canonical order.

A new real phone number then produced a second conversation and one exact-once
inbound Message. Ingress events and attempts were applied/succeeded once and the
encrypted spool was empty, but the Inbox did not update until the Founder pressed
refresh. Installed diagnosis proved that the signed grant route and sidecar grant
verifier are healthy while the HTTP CSP permits only WebSocket port `3001`; the
installed sidecar uses a protected ephemeral port (`65336` in the observed launch).
WebView therefore blocks live push before the sidecar connection is established.
PR #315 merged the bounded root repair to protected `main`: response CSP now
matches Tauri's loopback-only dynamic-port policy; the Inbox has a
database-authoritative visible-window polling fallback and real socket retry;
message projections and durable outbox/receipt transitions reconcile by client
ID, provider ID or stable effect key without delivery-state downgrade. Exact
head `ad9e00680f3690861ec9f6ade81e2eb616ac08b8` passed CI, Phase 5 and Phase 6–7,
received a clean exact-head Codex review and had zero unresolved threads before
guarded squash merge. This remains source evidence, not installed proof.

Required #306 evidence:

1. retain PR #315 as merged source evidence while FD-048 assembles #316/#317 and
   FRC-2–5 source/evidence work;
2. under later separate authority, sign one combined exact successor and update
   in place while preserving the demonstrated QR/link/session/outbound/inbound state;
3. receive one new inbound and prove automatic Inbox arrival without refresh,
   durable exact-once persistence and normal reopen;
4. complete representative EN plus Arabic/RTL Inbox observation;
5. exercise the direct governed status control and safe reviewed extraction flow;
6. perform normal disconnect/logout and local session retirement last.

WhatsApp is implemented through an unofficial WhatsApp Web library. Passing FRC-1 proves the named current installed journey; it cannot warrant that Meta will never change or block the protocol.

## 7. AI/tools/order-extraction boundary — FRC-2

Protected source includes seller-owned Gemini, proposal-bound actions, deterministic/manual fallback and #305 field-aware tool-result minimization. Complete certification still requires:

- current official model/key verification and immediate minimal inference;
- inventory of every model-exposed tool and its exact schema/permission/commit authority;
- success, denial, stale/conflict, duplicate/idempotency, partial, stop/retry, timeout, quota, offline and malformed-result cases;
- frozen synthetic/redacted AR/FR/EN/Darija/mixed extraction corpus;
- field-level accuracy/confidence and low-confidence human review;
- message → extraction → correction → explicit approval → exactly-one canonical order evidence;
- no raw PII, secrets, sensitive finance or full histories silently sent in privacy-safe mode;
- core non-AI journeys fully operable during provider failure.

Free-tier testing never authorizes silent real-client PII processing.

**FRC-2 source frontier frozen (2026-08-28).** The required evidence matrix now
lives in `operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md`: the 30-tool
registry with exact schema/permission/commit authority, the proposal-bound
approval/replay chain, the streaming/failure matrix, #305 field-aware privacy
minimization for live and replayed tool results, and the frozen
`frc2-1.0.0` synthetic/redacted AR/FR/EN/Darija/mixed extraction corpus with its
56-test contract suite. Remaining rows are external-blocked (seller-owned live
key, installed observation, T470 runs). Open findings are recorded in the ledger
(extraction route license gate question, stale quota comments, legacy tool body
note). Per FD-050 the next checkpoint is one signed successor (Internal.29)
before FRC-3.

## 8. Complete-product assurance boundary — FRC-3

FRC-3 is not a generic codebase audit. It is a finite evidence ledger mapping:

- Product Stable capability table;
- Experience page-completion contract;
- all 27 Required journeys;
- protected architecture invariants;
- source, test, signed/installed, Founder and external evidence;
- missing evidence versus demonstrated defect.

Only demonstrated P0/P1 roots open repair scope. Related failures are batched once, one exact head is frozen, selected consequence gates run in GitHub Actions, and no deterministic red is retried away.

## 9. Commerce and courier boundary — FRC-4/FRC-5

Shopify, WooCommerce and YouCan remain conditional until official development/test or authorized real-account evidence covers authentication, signatures, pagination, duplicates/order, reconciliation, conflicts, rate limits, revocation, outage and recovery.

Each courier action is certified independently. Provider-issued contracts and sandbox/demo or authorized real-account credentials are required for the public action set. Open-source wrappers are useful comparison evidence but never live certification.

If authoritative access is unavailable, the affected integration/action remains disabled or unpromised. A provider can be certified for tracking while creation, edit or cancel remains unsupported.

## 10. Zero-budget/customer-online boundary

- A domain is not required to start FRC-1, FRC-2 or local/source portions of FRC-3.
- Development endpoints may support technical webhook tests.
- `workers.dev` is not accepted as the sole business-critical customer authority.
- #230 requires an owned production hostname, resilient ingress/recovery, representative Algerian-network checks and exact installed evidence.
- No customer distribution, public trial or paid assisted deployment is authorized by FD-045 alone.
- A future offline-customer exception or funding arrangement requires a newer explicit Founder decision and truthful commercial terms.

## 11. Current non-claims

- Real-phone WhatsApp/provider certification is not established.
- AI/tool/order-extraction complete matrix is not yet executed on Internal.27.
- #316 Notification Center is source-merged through PR #319 but remains open for
  signed/installed/native evidence. #317 WhatsApp message/media parity remains
  incomplete; its capability ledger cannot promote missing media/provider proof.
- Live Shopify, WooCommerce, YouCan and courier action certification is not established merely by adapter/source tests.
- Customer-online licensing/network readiness remains open under #230.
- A first paid assisted deployment is not yet authorized.
- Beta is not established.
- Stable is not established.

SahelFlow is **not yet a commercially certified Stable release**. Internal.28 is the current Internal Founder-offline checkpoint (published, not yet Founder-installed); Internal.27 remains a retained prior checkpoint.

## 12. Historical continuity required by active authority

### Phase 5 merged result and evidence

PR #220 remains the historical application-changing protected baseline `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`. Later product work supersedes it as current source without erasing its evidence.

### Active Phase 6 frontier

The active semantic phase label remains Phase 6 — Arabic, RTL and accessibility parity. #221 human closure is retained; FRC now closes external/provider/customer evidence without reopening generic Phase 6 work.

### Internal.14 publication evidence

Internal.14 remains historical signed/installed evidence. It does not override Internal.27 or current issue states.

### FD-031 exception boundary

FD-031 was a one-time Internal.14 exception and is not reusable for FRC, provider or customer evidence.

### FD-032 Founder-only offline checkpoint boundary

FD-032 established the historical Founder-offline distinction. Internal.27 independently retains that separation under FD-047; customer release still requires #230 and applicable gates.

The historical evidence set included **issue #214** and issues #201/#221/#226/#230. Current truth is #221/#226 completed, #230 open, plus #306 open.
