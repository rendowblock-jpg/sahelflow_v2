# SahelFlow — Working Memory

> **Purpose:** Single compact resumable handoff. Read after Current State, Roadmap and Workflow.
> **Last updated:** 2026-08-31
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Do not use this file as a live branch pointer:** resolve protected `main` from GitHub at action time.

## Current truth

- Protected `main` at handoff: `38c95aa8…` — the Internal.31 release-authority squash (#368) on top of docs reconciliation `2208d31…` (#367) and the FD-051 repair line: #362 `f39ad836…` (B3 sidecar media MIME), #363 `60bfba65…` (D1 Gemini key format + region mapping), #364 `5f00c54…` (B5 coded delete errors), #365 `851b94d…` (B4 mic-failure diagnostics), #366 `f0fca29…` (FD-052 demo coexist). Live GitHub wins if moved.
- Latest signed/published checkpoint: **Internal.31** — published 2026-08-31 (Founder installation pending). It packages the FD-051 repair line (#362–#366) AND the #359 six-wave frontend remediation delta under **FD-053**; the exact delta and campaign rows: `operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md`.
- App `1.0.0-internal.31`; MSI `1.0.0.31`; authority **FD-053**; mode `founder-offline-only`.
- Release PR #368 (squash `38c95aa8…`); reviewed release head `a1b4d56e5f723bbd3cacae104939ba668998e38b`; the full Required battery passed on the exact head (21 checks: 20 success / 1 skipped / 0 failed, including installed-MSI evidence) — certification cited product head `569e921…` (tree-identical to `f0fca29…`; CI `33368228685`, Phase 5 `33368228409`, Phase 6-7 `33368228448`).
- Release PR #357; reviewed release head `aa4a632a9269ac2318bbf414611cf0e75cb97f5c`; the full Required battery passed on the exact head (21 checks: 20 success / 1 skipped / 0 failed, including installed-MSI evidence) — certification cited product head `40f53860` (tree-identical to squash `14c059b7`; CI `33287186297`, Phase 5 `33287186245`, Phase 6-7 `33287186170`).
- Internal.29's certification cited corpus head `4921f34eb87369384d7cd09d92064a69b11cbac9` (CI `33207445430`, Phase 5 `33207445134`, Phase 6-7 `33207445070`), the last product-tree change before the documentation-only #343.
- Dispatcher `33373167723`; signed updater/publication `33373176435`; release observer `33373187695` — all success. Internal.30's `33292273959`/`33292278832`/`33292285084` and Internal.29's `33212635887`/`33212648778`/`33212661580` remain retained evidence.
- Internal.31 updater artifact digest `sha256:f4e5abbd13c080080f7bdb88345df9b84ee1d7ee0bb1c7fce320fab490729297`; release tag `sahelflow-v1.0.0-internal.31-38c95aa8f5e1f3d44326c727efd0d8fd54cba20a` (verified pointing at the merged release commit). Internal.30 MSI digest `sha256:bef15026fc3f7394f2b10d15a809229418c585191509c78941a27461fbc8210e`; release tag `sahelflow-v1.0.0-internal.30-2eb8a33749118e233240019bf2df9a47d586a04d`; Internal.29 digest `sha256:c3afdadc8a3f457826f37bd45084d2647a65d9a79f51b71d0d68f86d068aa50f` retained.
- #221 closed/completed after Founder acceptance of installed Internal.24.
- #226 closed/completed; retain its budgets.
- #306 open — real-phone WhatsApp installed/provider certification; published Internal.31 is awaiting the in-place update.
- #316 open — Class-AAA durable Notification Center (PR #319) is packaged in published Internal.30; installed/native/real-phone evidence is pending.
- #317 open — professional WhatsApp Inbox parity is source-complete and packaged in published Internal.30; installed/real-phone evidence is pending.
- #230 open/reopened P1 — customer-online trial/network blocker; no owned production domain.
- FRC-2 is source-complete: capability ledger + frozen corpus `frc2-1.0.0` (#342/#343) merged; live-key, installed-observation and T470 rows remain external-blocked in the AI ledger. No open PR existed immediately after #344 merged.
- FD-051 installed campaign evidence (Founder, 2026-08-31): R1/R2/R7/R8/R10/R12 passed on installed Internal.30; automatic no-refresh inbound, reopen persistence and governed status passed (logout row stays LAST); R3/R4/R5/R6 reproduced → repaired by #362–#365 above; D1 region claim corrected (Algeria IS on Google's available-regions list; the probe error was the sandbox's own egress; relay parked); D2 acknowledged-by-directive; R11 (FRC-2 key lifecycle) gated on Internal.31 via #363. Exact rows: `operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md`.
- Current sequencing decision: **Internal.31 published under FD-053** (FD-051 repair line + #359 six-wave delta); its installed campaign re-verifies R3–R6, R11 and D3, then logout last, then FRC-3 resumes. FD-052 recorded (demo coexist, option A).
- FD-050 campaign repair line on main (all adversarially audited, packaged in published Internal.30): #346 `7d97a69f` voice-note WebM→OGG remux (B4); #347 `4ffc06a9` chat-delete ingress tombstone (B5); #350 `d67f3d0c` Baileys status-enum truth (audit); #348 `baf33711` AI-key PIN resume + coded errors (D1); #353 `547c5ded` RFC 6716 Opus TOC exactness (audit repair of #346); #352 `4cc9573b` auto-receive watchdog + 1:1 JID scope (C1 audit); #351 `5114c1c5` quote-chip persistence (B1/B2); #349 `b1b5a033` document/audio local-ready projection + outbox error codes (B3).
- Deep-audit remediation register on main (PR #355, squash `14c059b7`, every Actions gate green at head `40f53860`, packaged in published Internal.30): zod `.partial()` default-backfill data-loss repair (P1, contract-pinned); Batch A route guard/coded-error/idempotency/bounds (F1–F15); Batch D PII OrThrow sealing, dual blind-index, pinHash at-rest, registry fsync, log retention; Batch B domain truth — order PATCH server-derived money + post-confirmation edit lock `ORDER_EDIT_LOCKED_POST_CONFIRMATION` (B7-1), refund stats revenue truth (B7-2), return completion requires the governed refund fact `RETURN_COMPLETION_REQUIRES_REFUND_FACT` (B7-3), partitioned per-product stock transitions (B7-4), timeline coded errors (B7-5), single-order COD remittance honors the quarantine (B7-6), `Order.returnState`/`refundState` schema-drift reconciliation, partial-refund money-only + full-settlement stock truth, COD quarantine on returned/refused/cancelled/voided orders, wilaya canonicalization, automation outbox-marker bridge; storefront poison-receipt intake contract (C1); Sheets export + risk config/rules audited + strict risk-config zod (A1–A3); remote worker classified failure logs + escalation and inbox connect/logout error surfacing (C2/B1); Unix process-group containment, `RegFlushKey` license-clock anchors, orphan-recovery quarantine/unblocking (R1–R3); redaction authority kept strict — audit digests ride the machine-code suffix convention.

## What Internal.29 adds

- #335 — quoted replies resolve both provider/message id spaces with a persisted canonical target, confining ambiguous provider ids to the quoting conversation (repairs the received-message 409).
- #336 — OOXML documents dispatch under their declared Office mimetype across attachment/payload/sidecar/read layers (repairs real PDF/Word arriving as zip).
- #337 — in-composer voice recording: bounded MediaRecorder take through the durable outbound voice/PTT path with WebView2 media browser args (repairs the voice button opening the file dialog).
- #338 — permanent multi-select chat deletion.
- #339 — compacted composer attach menu with a bottom-anchored history closing message-list dead space.
- #340 — installed-e2e evidence MSI injection preserves checked-in browser args.
- #342/#343 — FRC-2 freeze: `frc2-1.0.0` extraction corpus (40 cases, 56/56 tests) reconciled into `operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md`.
- #344 — Internal.29 / FD-050 release authority only.

Internal.29 retains the complete prior product/security line, including Internal.28's #315/#319/#324/#325/#327/#329/#331 package, #312, #309/#310/#311 and #300/#304/#305/#307. Do not restart #273–#295 programs without direct regression evidence.

## What Internal.28 adds (retained history; Founder-installed)

- #315 — response CSP aligned with Tauri's loopback-only ephemeral-port policy, three-second durable-projection fallback and real socket retry for the demonstrated live-push root.
- #319 — #316 Class-AAA durable Notification Center and WhatsApp attention routing.
- #324/#325/#327/#329 — durable outbound image, MP4 video, document and voice/PTT sending with encrypted staging, canonical Message authority and deterministic account-bound receipts.
- #331 — professional Inbox interaction parity: durable quoted replies with queue-time provenance resolution, safe message copy, truthful upload progress with in-flight cancellation, JPEG thumbnails with fail-closed fallback, and paste/drop composition.
- #333 — Internal.28 / FD-049 release authority only.

## What Internal.27 adds (retained history)

- #312 — provenance-bound individual WhatsApp `numeric@lid` replies, Arabic empty-composer RTL with automatic entered-content direction, direct governed status control and reviewed AI order extraction from the thread header.
- #313 — Internal.27 / FD-047 release authority only.

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

- Internal.27 was installed through the normal updater at exact app
  `1.0.0-internal.27` / MSI `1.0.0.27`; installation/shop/WhatsApp state was
  preserved and both real conversations survived a normal close/reopen.
- The retained provenance-bound individual `@lid` reply passed exactly once:
  one outbound Message, one WhatsApp OutboxIntent, attempt count one, provider
  receipt present, succeeded state and linked-phone delivery with no duplicate.
- A new real number produced one new conversation and one exact-once inbound
  Message. All three installed ingress events/attempts were applied/succeeded
  once and the encrypted spool was empty.
- The new inbound did **not** project into the open Inbox automatically; the
  Founder used the header refresh action. Durable ingestion/persistence passed,
  while browser live push failed.
- Installed diagnosis proved the shared root. Next and the sidecar use protected
  ephemeral loopback ports (`65335`/`65336` in the observed launch), the installed
  route minted the correct signed short-lived WebSocket grant, Node/sidecar token
  fingerprints matched and a direct grant probe was accepted. The HTTP CSP still
  allowed only WebSocket port `3001`, so WebView blocked the actual sidecar port.
- PR #315 aligns response CSP with Tauri's loopback-only ephemeral-port policy,
  adds a three-second visible-window durable projection fallback and real socket
  retry, and reconciles projection/outbox/receipt races through durable identity.
  Exact head `ad9e00680f3690861ec9f6ade81e2eb616ac08b8` passed CI, Phase 5 and Phase 6–7,
  clean exact-head review and zero unresolved threads before merge.
- The same package makes the thread AI-order trigger stars-only with localized
  hover/focus copy while retaining its accessible name and reviewed extraction
  sheet. It introduces no silent order mutation.
- **Remove demo data** temporarily appeared frozen before completing. That is a
  separate demonstrated UI defect and is not silently treated as WhatsApp failure.
- Do not logout, reset AppData or clear protected auth before the published
  Internal.31 is installed in place and re-proves the FD-051 repair rows
  (R3–R6), the applicable FRC-2 rows (R11) and the remaining FRC-1 rows.

## Exact next-session order — Internal.31 installed campaign

The Internal.31 release and signed publication completed 2026-08-31: release PR #368 merged (squash `38c95aa8…`), dispatcher `33373167723`, signed publication `33373176435`, observer `33373187695`, tag `sahelflow-v1.0.0-internal.31-38c95aa8f5e1f3d44326c727efd0d8fd54cba20a`, updater artifact digest `sha256:f4e5abbd13c080080f7bdb88345df9b84ee1d7ee0bb1c7fce320fab490729297`. Remaining order:

1. Re-resolve protected `main`, open PRs and #306/#316/#317/#230. The FD-051
   installed campaign on Internal.30 is closed except the logout row; the
   Internal.31 package is published and awaiting the in-place update.
2. The Founder applies the in-place Internal.31 update through the normal
   updater, preserving installation, shop and WhatsApp state (no logout, no
   AppData reset).
3. On the installed Internal.31, re-verify the repair rows: B3 (document/
   audio ready state + coded outbox errors), B4 (voice recording with the
   new named-cause copy; record the exact surfaced cause), B5 (permanent
   delete), D1 (AI-key test/save with the new-format key; key lifecycle is
   now performable end-to-end — and per the corrected D1 record Algeria IS
   a supported region, so expect success from the seller's network); plus
   the #359 six-wave first observations (D3) and the applicable FRC-2 rows
   (R11: key lifecycle, one reviewed extraction to exactly-one canonical
   order, one proposal approval/replay).
4. Record results in `operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md`,
   `operations/WHATSAPP_INBOX_CAPABILITY_LEDGER.md` and current-state
   documentation; convert rows only where installed evidence exists.
5. Any reproduced failure opens exactly one bounded repair root plus affected
   siblings per the audit/review/merge discipline; nothing else moves.
6. Execute the retained #306 logout row LAST (only after every other row is
   green), then resume FRC-3 (Required capability/journey assurance ledger)
   in dependency order; preserve external blockers.

## Following FRC packages

- **FRC-2 (frozen 2026-08-28, packaged in published Internal.29):** `operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md` freezes the 30-tool registry, proposal/approval authority, failure matrix, #305 privacy minimization and the `frc2-1.0.0` AR/FR/EN/Darija/mixed corpus; live-key, installed-observation and T470 rows remain external-blocked. The Founder-performable rows are step 3 of the campaign above.
- **FRC-3:** finite ledger mapping Product Stable capabilities, 27 Required journeys, page-completion and architecture invariants to source/test/installed/Founder/external evidence.
- **FRC-4:** Shopify/YouCan official development environments and controlled WooCommerce live contract/reconciliation evidence.
- **FRC-5:** capability-specific courier certification from provider-issued contract plus sandbox/demo or protected authorized real-account evidence.
- **FRC-6:** explicit decision for a certified first paid assisted deployment; no customer access exception is currently implied.
- **#316:** one canonical per-actor notification domain with exact-once WhatsApp
  attention routing, privacy-safe Windows delivery and database fallback.
- **#317:** capability-specific WhatsApp message/media parity; provider-library
  API presence never equals certification.

## Current hard blockers and dependencies

- WhatsApp FRC-1 requires the Founder’s retained real phone/account/session.
  The exact signed successor (Internal.31) is published; it must now be
  installed in place with state preserved to re-verify the FD-051 repair
  rows (R3–R6), the six-wave first observations (D3), the applicable FRC-2
  rows (R11) and the remaining FRC-1 rows.
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
- No customer-online/Beta/Stable claim from Founder-offline Internal.31 or any internal checkpoint.
- No first customer as an undisclosed experiment.
- Use selected Level 1/2/3 gates and expected-head merge for any repair.

## Hard non-claims

- Internal.31 is signed/published but not yet Founder-installed. Internal.30
  was installed in place during its FD-051 campaign and verified R1/R2/R7/
  R8/R10/R12 and the retained #306 rows, but reproduced R3–R6 (B3/B4/B5/D1),
  repaired on protected main as #362–#365 and packaged in published
  Internal.31; WhatsApp certification remains open until the installed
  Internal.31 campaign re-verifies those repair rows and the logout row
  executes LAST.
- Complete AI/tools/order-extraction certification is open; the FRC-2 source
  frontier is frozen and packaged, while live-key, installed-observation and
  T470 rows remain external-blocked.
- Class-AAA Notifications and professional WhatsApp message/media parity are open.
- Public commerce/courier live certification is not established by adapter source alone.
- Customer-online trial readiness remains open under #230.
- First paid assisted deployment is not yet authorized.
- Beta is not established.
- Stable is not established.
