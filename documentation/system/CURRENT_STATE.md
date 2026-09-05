# SahelFlow — Current State

> **Status:** Source/evidence/release/provider truth for the current execution frontier
> **Last assessed:** 2026-09-05
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Live protected main:** resolve from GitHub before every action; at this reconciliation protected `main` is `0cdd5ce…` after the Internal.34 release-authority PR #394 squash (FD-057; on top of the docs-only #393 `8ec2c88…`, the INB-27 split PR #392 squash `9dc8e74…`, and the PR #391 F-04..F-08 repair line squash `1847396…`); this docs-only PR re-anchors the handover
> **Current signed release:** Internal.34 / `1.0.0-internal.34` / MSI `1.0.0.34` / FD-057 (published 2026-09-05; tag `sahelflow-v1.0.0-internal.34-0cdd5ce2b96f22bfebcd63a5103e89ac8d68b2c3`; MSI digest `sha256:dc3d3771…`)
> **Latest Founder-installed checkpoint:** Internal.33 / FD-056 (installed in place 2026-09-03; its campaign findings F-04..F-08 are repaired at source on protected `main` via PR #391 and the updater channel now serves Internal.34 — rows convert only on the next installed observation)
> **Current execution:** the release freeze was lifted by the Founder directive 2026-09-02 ("complete all the work professionally and flawlessly then make the update") — the consolidated UI/UX triage line was executed on PR #387 (AAA message-surface waves F-01..F-03, ledger completion waves, INB-24 voice gestures, AI-21 screenshot extraction, INB-16 link previews, AI-26 truthful turn signals, INB-28 sender factory, INB-11 virtualization, AI-13 feedback loop, INB-12 pin/mute/archive, qs 6.16.0 security pin, archive-queue type truth), certified at product head `92c35bc…` (tree-identical to the #387 squash; 20 success / 3 risk-classified skips / 0 failed incl. installed-MSI evidence + gates) and packaged/published as Internal.33 under FD-056 (dispatcher `33704527056`, signed publication `33704536249`, observer `33704547389` — all success). Next: **PR #391 was merged** to protected `main` by expected-head squash `1847396…`, repairing all five installed findings: F-04 delete-contract id space (64→256), F-05 thinking-model chat budget (2048→8192) + truthful empty-shape verdicts, F-06 agents-page functional completion executed after the Founder's scope correction (functional, NOT colors/motion/CSS — capability truth via `GET /api/ai/capabilities`, Abilities workforce panel, honest 5-count shop briefing, shop-wide approval loop, presentation-only shop context), F-07/F-08 queue header row ownership + shrink-proof select toolbar. In the same session the Founder authorized and the agent executed **INB-27** (the deliberately deferred god-hook split) at source on the stacked branch `refactor/inb-27-inbox-god-hook-split` — `src/hooks/inbox/` concern hooks (chat queue, drafts, thread, outbox, transport, shared refs + shared pure layer) composed by the unchanged `use-inbox-workspace.ts` facade; 10 source-pin contract files re-anchored with identical invariants; targeted 203/203 in a fresh sandbox, ESLint 0 errors; the first hosted CI battery on the rebased head then caught a single rebase-replay defect (missing `useRef` import in the facade — `TS2552` plus an inbox-page runtime crash; the local full-project tsc claim was unreliable at sandbox memory limits), fixed at `af99798`. **PR #392 was then MERGED** to protected `main` by expected-head squash `9dc8e74…` under the Founder's directive 2026-09-05 (live re-resolution before the write: base `1847396…` equal to main, head `80395e2c…`, mergeable clean, hosted Required battery at the exact head 14 success / 5 risk-classified skips / 0 failed; the merge call pinned the expected head SHA; branch deleted; durable tree verified). The UI/UX triage ledger now has ZERO open source rows. Only an explicit Founder release directive packages the #391+#392 lines into the next signed successor; rows convert on the next installed observation, the wave rows + D3 six waves re-verify, the #306 logout row stays LAST, and the screenshot-exposed Gemini key (#373) is rotated before real AI usage. Sidecar rows (INB-13/14/19/32) stay BLOCKED. **That directive arrived and was executed the same day (2026-09-05): the Founder's "Release Internal.34" authorized FD-057 — release PR #394 merged by expected-head squash `0cdd5ce…` after its head `2ac661e…` passed the FULL Required battery (19 checks, 0 failed, incl. installed-MSI evidence + lifecycle gates); certification cited product head `9dc8e74…` (tree-identical to PR #392 head `80395e2…`; CI `33961402161`, Phase 5 `33961402071`, Phase 6-7 `33961402075`); dispatcher `33966937514`, signed publication `33966945628` and observer `33966952222` all succeeded; release tag `sahelflow-v1.0.0-internal.34-0cdd5ce…`; published MSI digest `sha256:dc3d3771…`; updater `latest.json` pub_date 2026-09-05T13:04:24Z serves Internal.34 to the installed Internal.33. Next: the Founder installs Internal.34 in place and its campaign re-verifies F-04..F-08 + the INB-27 concern-hook waves and continues the retained Internal.33 rows; #306 logout LAST; #373 Gemini key rotation before real AI usage.** Exact rows: `../operations/UI_UX_TRIAGE_LEDGER.md` + `../operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md`

This document distinguishes protected source, automated evidence, signed publication, CI-installed evidence, Founder-installed judgment, live-provider certification, customer-online readiness, paid deployment, Beta and Stable. A lower evidence level never claims a higher one.

## 1. Exact release authority

Internal.30 is the latest signed/published artifact:

- protected release source `2eb8a33749118e233240019bf2df9a47d586a04d` / release PR #357 (no longer equals protected `main`: PR #359 merged after publication — delta in `../operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md`);
- app `1.0.0-internal.30`;
- MSI `1.0.0.30`;
- channel `internal`;
- authority FD-051;
- mode `founder-offline-only`;
- owned host suffix `null`;
- customer-online licensing disabled.

PR #357 reviewed head `aa4a632a9269ac2318bbf414611cf0e75cb97f5c` passed the full Required battery (21 checks: 20 success / 1 skipped / 0 failed, including installed-MSI evidence, native source contract and Windows Rust release parity) with zero code deltas on the release-authority files. Certification cited product head `40f5386095e3a11b5f586673d3f6d0cc99956a66` — tree-identical to the #355 squash `14c059b7621d08a041830a626d5b3f2fb6fd75e6` (CI `33287186297`, Phase 5 `33287186245`, Phase 6-7 `33287186170`); #356 is documentation-only, so the packaged product tree is identical. PR #359 (frontend Class-AAA remediation, six waves) was merged to protected `main` `324719ff…` on 2026-08-31 (Founder option-B directive) and is NOT part of this package.

After expected-head merge, dispatcher `33292273959`, signed updater/publication run `33292278832` and release observer `33292285084` succeeded on exact protected main. The release was published at tag `sahelflow-v1.0.0-internal.30-2eb8a33749118e233240019bf2df9a47d586a04d`.

Published MSI:

- `SahelFlow_1.0.0-internal.30_x64_en-US.msi`;
- digest `sha256:bef15026fc3f7394f2b10d15a809229418c585191509c78941a27461fbc8210e`.

The Founder has **not yet installed** Internal.30; the latest Founder-installed checkpoint remains Internal.29 (FD-050, installed in place during its campaign — the campaign reproduced defects B1–B5 and D1, all repaired as #346–#353 and packaged here together with the deep-audit remediation register #355). Retained Internal.29 publication facts: dispatcher `33212635887`, signed run `33212648778`, observer `33212661580`, tag `sahelflow-v1.0.0-internal.29-a34917e582c4806aee35ad5aca12aaea82a0ddcf`, MSI digest `sha256:c3afdadc8a3f457826f37bd45084d2647a65d9a79f51b71d0d68f86d068aa50f`. Preserve the installed state through the Internal.30 in-place update and campaign. The frontend/UI stream PR #359 was not bundled (FD-051) and was merged to protected `main` `324719ff…` on 2026-08-31 after publication; its six waves receive their first installed/Founder observation on the next signed package.

## 2. Product/security line packaged in Internal.30

Internal.30 retains the accepted product line through Internal.29. Its direct
additions are the two previously unreleased repair lines, now packaged:

- **2c — FD-050 installed-campaign repair line** (#346–#353): the six campaign defects B1–B5 and D1 plus the #350 delivery-receipt enum truth and the #352 C1 auto-receive resilience hardening;
- **2d — deep-audit remediation register** (#355): zod `.partial()` data-loss repair, Batch A F1–F15 route guards, Batch D crypto/data truth, Batch B domain truth, storefront poison-receipt contract, audit/risk-config validation, worker/inbox failure visibility, native R1–R3, strict redaction authority.

## 2e. Product/security line packaged in Internal.29 (retained history)

Internal.29 retains the accepted Internal.24 product line, the Internal.25/26/27 security/provider/product foundation and the complete Internal.28 package. Its direct additions are:

- **#335** — quoted replies resolve both provider/message id spaces with a persisted canonical target, confining ambiguous provider ids to the quoting conversation (repairs the received-message 409);
- **#336** — OOXML documents dispatch under their declared Office mimetype across the sealed attachment, effect payload, sidecar allowlist and authenticated reads (repairs real PDF/Word arriving as zip);
- **#337** — in-composer voice recording: bounded MediaRecorder take through the durable outbound voice/PTT path with WebView2 media browser args (repairs the voice button opening the file dialog);
- **#338** — permanent multi-select chat deletion;
- **#339** — compacted composer attach menu with a bottom-anchored history closing message-list dead space;
- **#340** — installed-e2e evidence MSI injection preserves checked-in browser args;
- **#342/#343** — FRC-2 freeze: `frc2-1.0.0` extraction corpus plus the AI capability evidence ledger;
- **#344** — version/release/licensing authority only for Internal.29 / FD-050.

## 2c. FD-050 installed-campaign repair line (**packaged in published Internal.30**)

The Founder installed Internal.29 in place and the FD-050 campaign reproduced
six defects. Each was root-caused and repaired on protected main
(`a34917e5` → `b1b5a033`, eight guarded squash merges, every PR
adversarially audited before merge). These commits were outside the signed
Internal.29 artifact and are now packaged inside the signed Internal.30
successor under FD-051.

Campaign-observed defects:

- **B1/B2 quote chips** — quote chips vanished on chat switch/refresh/restart: `loadMessages` dropped `quotedMessageId`/`quoted` in the history mapping (**#351**, `5114c1c5`);
- **B3 document spinner** — outbound document/audio bubbles spun on `جارٍ حفظ الوسائط بشكل آمن…` forever even after delivery: the thread projection force-readied `localMedia` for image/video only (**#349**, `b1b5a033`, plus `OutboxIntent.lastErrorCode` surfaced to the retry UI);
- **B4 voice recording fail-closed** — WebView2/MediaRecorder never supports OGG/Opus (Chromium only offers `audio/webm;codecs=opus`), so the mic button always showed the unsupported strip: takes are now recorded WebM/Opus and remuxed to OGG/Opus in the renderer (**#346**, `7d97a69f`; RFC 6716 TOC accounting made spec-exact by **#353**, `547c5ded`);
- **B5 chat-delete resurrection** — hard-deleting `ProviderIngressEvent` rows destroyed the `ingressKey` replay barrier, so a sidecar retry re-created the deleted chat; and every server rejection collapsed to a silent `false` (**#347**, `4ffc06a9`: ingress events tombstoned, not deleted; coded delete failures surfaced);
- **D1 AI-key flow** — the 10-minute reauthentication window dropped the pending action after PIN, coded rejections reached the merchant untranslated, and failing verifies left no per-attempt log record (**#348**, `baf33711`: action resume after PIN, EN/FR/AR localized coded errors, secret-free provider logging).

Deep-audit repairs (not campaign-observed rows):

- **Delivery-receipt enum truth** — the installed Baileys 6.17.16 status enum is `{ERROR:0,PENDING:1,SERVER_ACK:2,DELIVERY_ACK:3,READ:4,PLAYED:5}`; the two legacy mappers built on the pre-6.7 layout lied on every outbound bubble (SERVER_ACK rendered "delivered", DELIVERY_ACK rendered "read", ERROR rendered "sending" forever). One canonical mapper pinned at runtime against the installed proto (**#350**, `d67f3d0c`). This **undermines the Internal.27 "delivery observed" certification**: what was observed as delivery was SERVER_ACK. The inbox ledger row is corrected accordingly and must be re-proven on an installed candidate.
- **C1 auto-receive resilience** — the sidecar gave up reconnecting permanently after ~40s and status/group broadcasts could pollute the queue: a 60s background watchdog (guarded, cleared on logout) and a pre-spool 1:1 JID scope filter (**#352**, `4cc9573b`).

## 2d. Deep-audit remediation register (**packaged in published Internal.30**)

The adversarial deep audit that followed the FD-050 repair line produced a full
remediation register (batches A, D and B plus a native Rust batch). It was
executed on `agent/deep-audit-remediation`, every Actions gate green at head
`40f53860` (21 checks: 20 success / 1 skipped / 0 failures), and squash-merged
into protected main as **#355, `14c059b7`** with explicit Founder merge
authority. The register was outside the signed Internal.29 artifact and is
now packaged inside the signed Internal.30 successor under FD-051 together
with the 2c repair line.

- **zod `.partial()` data-loss repair (P1)** — `updateCustomerSchema`/`updateProductSchema`/`updateExpenseSchema` no longer backfill create-time defaults over omitted PATCH fields; update schemas are explicit optionals with defaults preserved, contract-pinned in tests;
- **Batch A (F1–F15)** — route-surface guard/coded-error/idempotency/bounds remediation;
- **Batch D (crypto/data)** — PII OrThrow sealing, dual blind-index identity lookup, pinHash at-rest, registry fsync, log retention; key-authority client cast repaired at the seal/open sites;
- **Batch B (domain truth)** — legacy order PATCH money truth: item totals validated against `unitPrice × quantity`, order total server-derived, money-bearing edits on legacy orders past draft/pending refused with coded `ORDER_EDIT_LOCKED_POST_CONFIRMATION` (B7-1); refund `totalSpentAdjusted` derived from revenue truth so refunds on pending/confirmed/shipped/refused orders stay money-only (B7-2); refund-type return completion on a delivered order refused with coded `RETURN_COMPLETION_REQUIRES_REFUND_FACT` (B7-3); partitioned per-product stock transitions wired through refund restore/reversal, ending variantless clobber (B7-4); timeline read failures surface coded errors (B7-5); single-order COD remittance honors the quarantine (B7-6); `Order.returnState`/`refundState` schema drift reconciled into the prisma Order model; partial refunds are money-only with variant-aware full-settlement stock truth and explicit-only idempotency keys; COD cash collected on returned/refused/cancelled/voided orders is quarantined out of the legacy COD ledger; Arabic/diacritic/spacing/alias wilaya spellings resolve onto the seeded risk profiles; canonical lifecycle outbox markers drain into durable automation trigger intents;
- **C1 storefront ingestion truth** — poison receipts are classified (malformed / shop-mismatch / integrity / customer_payload / item_authority), rejected best-effort, the page cursor always advances and delegation is released only with full parsed items; whole-page decrypt failure is a systemic refusal with no data loss; the sync worker's silent catches became classified warnings;
- **A1–A3 (audit + validation truth)** — Sheets export and risk config/rules PUTs are audited (`export.orders` + destination id, `risk.config.update`, `risk.rules.replace`); the risk config PUT body is strictly zod-validated (weights 0–2, thresholds 0–100, ascending invariant);
- **C2/B1 (failure visibility)** — remote command/projection workers log classified failures with escalation after persistent failure streaks (12×5s commands, 3×8min projections) and per-device projection warnings; inbox connect/logout check `res.ok` and surface localized coded errors via `translateServerError` + toast;
- **Batch R (native)** — Unix child process-tree containment (`process_group(0)` + `killpg(SIGKILL)`, bounded group drain); `RegFlushKey` after both license-clock anchor writes so the offline license clock survives hard power loss; SQLite orphan-recovery cleanup replaces fire-and-forget removal with quarantine-or-coded-error so recovery cannot be silently blocked;
- **Redaction authority** — the strict redaction contract is re-affirmed: the `redact-pii` sha256-digest widening was refused and audit-trail digests ride the machine-code suffix convention (`beforeDigestCode`/`afterDigestCode`).

## 2b. Product/security line packaged in Internal.28 (retained history)

Internal.28's direct package — #315 response CSP/loopback repair, #319 Notification Center, #324/#325/#327/#329 outbound image/video/document/voice sending, #331 Inbox interaction parity, #333 release authority — remains inside Internal.29.

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

FD-049 (2026-08-27) superseded FD-048's timing for one checkpoint: once #317 completed on protected `main`, one signed successor (Internal.28) was authorized for Founder-installed testing before FRC-2–5 resume. FD-050 (2026-08-28) then authorized one signed successor (Internal.29) once the FRC-2 source frontier completed — satisfied and published through PR #344.

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
note). Per FD-050 the frozen frontier was packaged and published as one signed successor (Internal.29, PR #344, exact main `a34917e582c4806aee35ad5aca12aaea82a0ddcf`); the Founder in-place install and campaign are the current gate before FRC-3.

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

SahelFlow is **not yet a commercially certified Stable release**. Internal.29 is the current Internal Founder-offline checkpoint (published, not yet Founder-installed); Internal.28 (Founder-installed during its campaign) and Internal.27 remain retained prior checkpoints.

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
