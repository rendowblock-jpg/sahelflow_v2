# SahelFlow — Working Memory

> **Purpose:** Single compact resumable handoff. Read after Current State, Roadmap and Workflow.
> **Last updated:** 2026-08-30
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Do not use this file as a live branch pointer:** resolve protected `main` from GitHub at action time.

## Current truth

- Protected `main` at handoff: `14c059b7` (after the deep-audit remediation register #355, which contains the FD-050 installed-campaign repair series #346–#353); live GitHub wins if moved.
- Latest signed/published checkpoint: **Internal.29** — now **Founder-installed** (the FD-050 campaign ran on it and reproduced defects B1–B5 and D1). All six are repaired on protected main but are NOT inside the signed Internal.29 artifact; a successor release requires separate Founder authority.
- App `1.0.0-internal.29`; MSI `1.0.0.29`; authority **FD-050**; mode `founder-offline-only`.
- Release PR #344; reviewed release head `dd4888d6366cf48ccca05563bedb7e502e5662ce`; the full Required battery passed on the exact head — two CI load-flake failures (sf-verify demo-seeding timeouts, AI-workspace Prisma transaction timeout) re-ran green with zero code deltas.
- Certification cited corpus head `4921f34eb87369384d7cd09d92064a69b11cbac9` (CI `33207445430`, Phase 5 `33207445134`, Phase 6-7 `33207445070`), the last product-tree change before the documentation-only #343.
- Dispatcher `33212635887`; signed updater/publication `33212648778`; release observer `33212661580` — all success. Internal.28's `33136807451`/`33136814065`/`33136822222` remain retained evidence.
- Internal.29 MSI digest `sha256:c3afdadc8a3f457826f37bd45084d2647a65d9a79f51b71d0d68f86d068aa50f`; release tag `sahelflow-v1.0.0-internal.29-a34917e582c4806aee35ad5aca12aaea82a0ddcf`; Internal.28 digest `sha256:004ce6e3ebdde04f268cbc09d17f7787741ed877e65e61c1aa59d04d9edb1a64` retained.
- #221 closed/completed after Founder acceptance of installed Internal.24.
- #226 closed/completed; retain its budgets.
- #306 open — real-phone WhatsApp installed/provider certification; the FD-050 candidate is published and awaiting the in-place update.
- #316 open — Class-AAA durable Notification Center (PR #319) is packaged in published Internal.29; installed/native/real-phone evidence is pending.
- #317 open — professional WhatsApp Inbox parity is source-complete and packaged in published Internal.29; installed/real-phone evidence is pending.
- #230 open/reopened P1 — customer-online trial/network blocker; no owned production domain.
- FRC-2 is source-complete: capability ledger + frozen corpus `frc2-1.0.0` (#342/#343) merged; live-key, installed-observation and T470 rows remain external-blocked in the AI ledger. No open PR existed immediately after #344 merged.
- Current sequencing decision: **FD-050 satisfied in publication** — Internal.29 packages the Internal.28 campaign repairs/extensions (#335–#341) plus the FRC-2 freeze.
- Exact next outcome: **obtain separate release authority for one signed successor that packages the FD-050 campaign repair line (#346–#353) AND the deep-audit remediation register (#355, `14c059b7`), the Founder re-verifies the repaired rows (B1–B5, D1, delivery-receipt enum truth on a real outbound, C1 sleep/wake auto-receive) plus the register's audit-affected rows, the retained FRC-2 repair rows, the #306 real-phone rows and the applicable matrix rows on that successor — then FRC-3 resumes**.
- FD-050 campaign repair line on main (all adversarially audited, all unreleased): #346 `7d97a69f` voice-note WebM→OGG remux (B4); #347 `4ffc06a9` chat-delete ingress tombstone (B5); #350 `d67f3d0c` Baileys status-enum truth (audit); #348 `baf33711` AI-key PIN resume + coded errors (D1); #353 `547c5ded` RFC 6716 Opus TOC exactness (audit repair of #346); #352 `4cc9573b` auto-receive watchdog + 1:1 JID scope (C1 audit); #351 `5114c1c5` quote-chip persistence (B1/B2); #349 `b1b5a033` document/audio local-ready projection + outbox error codes (B3).
- Deep-audit remediation register on main (PR #355, squash `14c059b7`, every Actions gate green at head `40f53860`, unreleased): zod `.partial()` default-backfill data-loss repair (P1, contract-pinned); Batch A route guard/coded-error/idempotency/bounds (F1–F15); Batch D PII OrThrow sealing, dual blind-index, pinHash at-rest, registry fsync, log retention; Batch B domain truth — order PATCH server-derived money + post-confirmation edit lock `ORDER_EDIT_LOCKED_POST_CONFIRMATION` (B7-1), refund stats revenue truth (B7-2), return completion requires the governed refund fact `RETURN_COMPLETION_REQUIRES_REFUND_FACT` (B7-3), partitioned per-product stock transitions (B7-4), timeline coded errors (B7-5), single-order COD remittance honors the quarantine (B7-6), `Order.returnState`/`refundState` schema-drift reconciliation, partial-refund money-only + full-settlement stock truth, COD quarantine on returned/refused/cancelled/voided orders, wilaya canonicalization, automation outbox-marker bridge; storefront poison-receipt intake contract (C1); Sheets export + risk config/rules audited + strict risk-config zod (A1–A3); remote worker classified failure logs + escalation and inbox connect/logout error surfacing (C2/B1); Unix process-group containment, `RegFlushKey` license-clock anchors, orphan-recovery quarantine/unblocking (R1–R3); redaction authority kept strict — audit digests ride the machine-code suffix convention.

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
  Internal.29 is installed in place and re-proves automatic inbound and the
  remaining FRC-1 rows.

## Exact next-session order — Internal.29 installed campaign and FRC-3 entry

1. Re-resolve protected `main`, open PRs and #306/#316/#317/#230; confirm
   Internal.29 is published (tag `sahelflow-v1.0.0-internal.29-a34917e582c4806aee35ad5aca12aaea82a0ddcf`)
   and that no repair PR is open. Expect no source work before the campaign.
2. The Founder applies the in-place Internal.29 update through the normal
   updater, preserving installation, shop and WhatsApp state (no logout, no
   AppData reset).
3. On the installed candidate, re-verify the FRC-2 repair rows: quoted replies
   to received AND sent messages, real PDF/Word document delivery, voice
   recording send/PTT, permanent multi-select chat delete, compacted composer
   EN/AR; plus the retained #306 rows (automatic no-refresh inbound, reopen
   persistence, governed status, logout last).
4. Exercise the applicable FRC-2 matrix rows the Founder can perform: key
   lifecycle in Settings → AI (test/save/rotate/disconnect), one reviewed
   extraction from the thread header through exactly-one canonical order, one
   proposal approval/replay observation.
5. Record results in `operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md`,
   `operations/WHATSAPP_INBOX_CAPABILITY_LEDGER.md` and current-state
   documentation; convert rows only where installed evidence exists.
6. Any reproduced failure opens exactly one bounded repair root plus affected
   siblings per the audit/review/merge discipline; nothing else moves.
7. Resume FRC-3 (Required capability/journey assurance ledger) in dependency
   order; preserve external blockers.

## Following FRC packages

- **FRC-2 (frozen 2026-08-28, packaged in published Internal.29):** `operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md` freezes the 30-tool registry, proposal/approval authority, failure matrix, #305 privacy minimization and the `frc2-1.0.0` AR/FR/EN/Darija/mixed corpus; live-key, installed-observation and T470 rows remain external-blocked. The Founder-performable rows are step 4 of the campaign above.
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
  The exact signed successor (Internal.29) is published; it must now be
  installed in place with state preserved to re-verify the repair rows and the
  remaining FRC-1 rows.
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
- No customer-online/Beta/Stable claim from Founder-offline Internal.29 or any internal checkpoint.
- No first customer as an undisclosed experiment.
- Use selected Level 1/2/3 gates and expected-head merge for any repair.

## Hard non-claims

- Internal.29 is signed/published but not yet Founder-installed. Internal.28's
  installed campaign verified text/image/video send, automatic no-refresh
  inbound and reopen, but reproduced three regressions repaired as #335/#336/#337;
  WhatsApp certification remains open until the installed Internal.29 campaign
  re-verifies the repair rows and the remaining #306 rows.
- Complete AI/tools/order-extraction certification is open; the FRC-2 source
  frontier is frozen and packaged, while live-key, installed-observation and
  T470 rows remain external-blocked.
- Class-AAA Notifications and professional WhatsApp message/media parity are open.
- Public commerce/courier live certification is not established by adapter source alone.
- Customer-online trial readiness remains open under #230.
- First paid assisted deployment is not yet authorized.
- Beta is not established.
- Stable is not established.
