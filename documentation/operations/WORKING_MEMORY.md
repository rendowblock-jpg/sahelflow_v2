# SahelFlow — Working Memory

> **Purpose:** Single compact resumable handoff. Read after Current State, Roadmap and Workflow.
> **Last updated:** 2026-09-03
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Do not use this file as a live branch pointer:** resolve protected `main` from GitHub at action time.

## Current truth

- **INB-27 executed (2026-09-03, latest session — supersedes nothing below, stacks on PR #391)**: the deliberately deferred god-hook split is done at source on open **PR #392** (branch `refactor/inb-27-inbox-god-hook-split`, based on #391's branch — merge #391 first, then #392 retargets to `main`): `src/hooks/inbox/` now holds `inbox-workspace-shared.ts` (bounded constants, INB-28 media-send specs, pure projections, B5 delete-rejection summarizer), `use-inbox-shared-refs.ts` (the seven cross-concern refs injected from the composition root), `use-inbox-chat-queue.ts` (canonical load + durable fallback, authority flags, read-state writes, INB-12 state mirror, queue projections), `use-inbox-drafts.ts` (revisioned draft queue, retrying loader, autosave, lifecycle flush), `use-inbox-thread.ts` (generation-guarded loads, additive history paging, selection, WhatsApp-class tail anchoring), `use-inbox-outbox.ts` (shared send gate, INB-28 factory, durable effect monitor, INB-29 retry, truthful uploads) and `use-inbox-transport.ts` (socket handlers, bounded live-recovery poll, connect/logout, QR refresh); `use-inbox-workspace.ts` remains the composition root with the exact historical return shape — zero component-consumer changes, every function body moved verbatim (F-04's 256-char delete bound ported onto the shared layer). The 10 source-pin contract files are re-anchored to their canonical modules with identical invariants. Evidence: targeted suite 203/203 across 26 files in a fresh sandbox, full-project `tsc --noEmit` 0 errors, ESLint 0 errors. NOT merged — rides the same Founder gates as PR #391 (review/merge, then the explicit release directive for the next signed successor); converts with the next installed observation.

- **Session close-out (2026-09-03, latest — supersedes the 2026-09-02 close-out below)**: the Founder installed Internal.33 in place through the normal updater (installation/shop/WhatsApp state preserved) and reported five installed findings; each registered as its own row in `operations/UI_UX_TRIAGE_LEDGER.md` with a confirmed root and repaired at source on open **PR #391** (branch `fix/internal33-founder-findings-r1` @ `8bd9a25`, six commits, 25 files +1733/−311): **F-04** chat-delete contract follows the projection's real id space (bound 64→256 matching sibling provider-shape contracts; tests pin 69-char deletion + 300-char rejection); **F-05** chat token budget 2048→8192 for thinking-enabled flash models with a truthful coded empty-shape verdict (thought-budget exhaustion / policy refusal with blockReason / empty) replacing the gaslighting "rephrase" copy, stream + non-stream, AR/FR/EN; **F-07/F-08** queue header owns its rows (search-row action cluster, full-width pills, shrink-proof select toolbar; all `data-inbox-*`/aria contracts preserved 130/130); **F-06** executed as FUNCTIONAL completion after the Founder's explicit scope correction ("NOT colors/motion/CSS — see what's wrong and missing from that page"): `GET /api/ai/capabilities` projects the SAME central policy map the registry/proposal runtime enforces (fail-closed `AI_CAPABILITY_GROUP_*` on drift, 6 job groups — orders/customers/products/delivery/insights/conversations, blocked tools omitted, sensitive abilities marked "needs approval"), an Abilities workforce panel + honest 5-count shop briefing on the start surface (pendingOrders, ordersToday, lowStockProducts, pendingDeliveries, pendingProposals — independently nullable; failures render nothing, never a fabricated zero), the approval loop surfaced shop-wide at every width (pending strip + header badge beyond session scope), a presentation-only read-only shop-context system instruction (date + counts, non-blocking, declared non-authority) in both message routes, the stale capability sentence replaced in AR/FR/EN, 2 pre-existing canvas type errors fixed, and 10 new tests (4 capability-group coverage + 6 F-06 functional contract pins; suites covering all touched modules 42/42 green in the prepared sandbox; ESLint 0 errors). Evidence: the full Required battery is GREEN at PR head `8bd9a25` (Required PR gate, Phase 5 Experience, Phase 6-7 completion, Quality Gate, source diagnostics, static route matrix, localization/RTL/a11y contract — 14 success / 5 risk-classified skips / 0 failed). NOT merged — awaiting Founder gates: (1) review/merge PR #391, (2) an explicit Founder release directive to package the repair line into the next signed successor; rows convert on the NEXT installed observation only. Still pending on the installed Internal.33: the wave-row + D3 six-wave re-verification (the Founder's observation so far covers only the five findings). #373 Gemini key rotation remains a Founder-side precondition for real AI usage; #306 logout row LAST. Explicitly out of F-06 scope by the correction: any visual/motion/CSS pass; sidecar rows (INB-13/14/19/32) stay BLOCKED; AI-17/AI-23 residuals remain pinned.

- **Session close-out (2026-09-02)**: Founder's AAA quality-line directive executed — the full Inbox/AI UI-UX audit plus the Founder's 3 findings (F-01 document cards, F-02 bubble side under RTL, F-03 select-mode transition) are triaged into the single ledger `operations/UI_UX_TRIAGE_LEDGER.md` and executed to source level on open **PR #387** (`fix/aaa-inbox-message-surface-polish` @ `6fb7e01`, 14 commits/36 files): WhatsApp-parity inbox waves (media previews + emoji picker + scroll-FAB/divider/grouping/localized dates/lightbox/in-thread search/quote-jump/keyboard nav/bulk ops/cursor pagination/memoized bubbles/accessible confirm) + AI trust killers (demo honesty with drift contract test, message copy, proposal DENY route, stop-keeps-partial, settings deep-link) + AI parity (tool-card args, history search, IME guard). Required PR gate GREEN at head (Quality Gate + diagnostics + RTL/accessibility contracts success). NOT merged — awaiting Founder gates: (1) review/merge #387, (2) rotate the Gemini key (#373) → D1 precondition, (3) authorize schema wave (INB-12) and/or sidecar probes (INB-13/14/19), (4) Internal.33 dispatch only after merge (release.yml pins the protected-main SHA). Remaining ledger rows: INB-11 partial (virtualization), INB-16/24/27/28 + AI-21/26 open, INB-13/14/19 sidecar-blocked. **Wave 10 continuation (2026-09-02, resumed session)**: INB-30 + AI-25 executed to source on the same PR (head `8dfa2f9`) — assignment-UI copy (13 labels + 5 activity strings) migrated verbatim into the locale authority ×3 with `common.refresh` reuse, and the unconfigured AI start surface now explains its capabilities (seller-owned-key truth + settings deep-link) while all 37 dead legacy `ai.*` locale keys are retired (parity 2826×3); the flaked FR workbench lane at `7f8dd17` was diagnosed as a documented load-flake (docs-only delta, spec untouched, Prisma transaction-timeout signature) and re-run; 130/130 + 174/174 targeted tests green in fresh sandboxes. B5/D1 stay repaired-in-source; convert on installed Internal.33 observation only. Durable handoff: issue **#388**.

- **Waves 11–15 continuation (2026-09-02, resumed session, Founder directive "complete all the work professionally and flawlessly then make the update")**: the remaining un-gated ledger rows PLUS the authorized schema wave were executed to source on PR #387 — INB-24 (WhatsApp voice gestures: hold-to-record, slide-up lock, slide-to-cancel, review-before-send through the shared player; contract revised with disposition), AI-21 (visual screenshot extraction bridged to the composer: shared bounded schema, sniffed bytes, consent+rate gates, review-first draft insert, never auto-sends), INB-16 (link previews with SSRF discipline and honest absence), AI-26 (truthful provider signal: done-event `signal` from the provider's own usageMetadata + served model, malformed shapes dropped, cost estimation still forbidden; the blanket no-usage contract deliberately superseded), INB-28 (one media-send factory + spec table replacing four ~200-line copies), INB-11 (render-window virtualization, bottom-anchored with scroll-true anchoring and jump expansion), AI-13 + INB-12 (authorized schema wave: additive `AiMessageFeedback` table and Conversation pin/mute/archive columns with hand-written migrations, gated routes, queue UI). INB-27 is the single remaining OPEN source row, deferred deliberately (18-file contract churn vs release integrity). Founder gates executed under the directive: PR #387 merge and the Internal.33 line follow this commit; B5/D1 still convert ONLY on Founder-installed observation; the Gemini key rotation (#373) remains a Founder-side action.

- **Release train FROZEN by Founder directive (2026-09-02)**: "we are not making the next release yet, there is more problems and things i don't like and are not top tier class AAA in the app". **SUPERSEDED the same day (2026-09-02)**: the Founder directive "complete all the work professionally and flawlessly then make the update" closed the quality line and authorized the Internal.33/FD-056 update — see the Current sequencing decision below.
- Protected `main` at handoff: the round-3 repair line + the AAA quality line are merged — #382 `bff3d13…` (browserslist 4.28.8 override pin, red-gate unblock), #379 `e9eee78…` (D1 round 3: probe verifies thinking-model 200s + names transport causes), #381 `c4e5621…` (round-3 ledger record), #380 `c8f8be3…` (B5 round 3: self-diagnosing delete — shape verdict in body + client pre-flight), #383 `4579e69…` (UI AAA batch: localized errors everywhere, truthful delete contracts, i18n authority restored — audit F1–F7+F14–F26), #385 `95dd9d3…` (inbox AAA batch: F8–F13 + double-submit guard + notFoundIds client half), #384 `420b379…` (API AAA contract batch: every non-2xx carries a code, no internal leaks, races closed — audit S1-1..4+S2-5..12+S3-13..24). Live GitHub wins if moved.
- Two parallel read-only AAA audits (file:line-cited): 26 UI findings + 25 API findings; ALL assigned to the batch line above — none parked. Exact rows: `operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md` (release-freeze quality line section).
- Internal.31 was **installed in place by the Founder** (2026-09-01); its campaign re-verified the FD-051 repairs and produced the bounded round-2 findings above. Exact rows: `operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md` (round-2 section).
- FD-054 recorded (demo data loads alongside real seller data; removal deletes only the demo-tagged graph and fails closed with `DEMO_REMOVAL_BLOCKED_BY_REFERENCES`). Housekeeping: rotate the Founder's Gemini key (visible in a screenshot URL bar per #373).
- Current sequencing decision: **Internal.33 / FD-056 published** — the Founder directive 2026-09-02 ("complete all the work professionally and flawlessly then make the update") lifted the freeze after the triage quality line closed; PR #387 merged by squash `1cb5cef7…` (29 commits; tree `c06bd9ed…` identical to reviewed head `92c35bc…`); release PR #389 merged by squash `cc081c86…`, dispatcher `33704527056`, signed publication `33704536249` (success), observer `33704547389` (success), release tag `sahelflow-v1.0.0-internal.33-cc081c8687a17620c8bd0d9c4bb416da71fdb3f5`, published MSI `SahelFlow_1.0.0-internal.33_x64_en-US.msi` digest `sha256:16a8ce71e2694671cfe267d6fde84635973e254ae0fd1fc25d35fc6662afafe2`, `latest.json` published 2026-09-03T02:00:42Z. Certification cited product head `92c35bc…` (tree-identical to squash `1cb5cef…`; CI `33699338361`, Phase 5 `33699338132`, Phase 6-7 `33699338129`); the release-authority head passed the full Required battery (20 success / 1 skipped / 0 failed, incl. installed-MSI evidence + gates) before the expected-head merge. The Founder installed Internal.33 in place on 2026-09-03 — its installed campaign reported the five findings F-04..F-08, all repaired at source on open PR #391 (see the top Current-truth bullet) — while the wave-row (voice gestures, screenshot attachments, link previews, turn signals, pin/mute/archive, feedback loop) and D3 six-wave re-verification remains pending Founder observation, then the retained #306 logout row LAST; the Gemini key rotation (#373) remains a Founder-side precondition for real AI usage. The prior Internal.32/FD-055 publication (tag `sahelflow-v1.0.0-internal.32-677dc463…`, digest `sha256:34417299…`) and its installed round-3 campaign remain recorded in `operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md`.
- App `1.0.0-internal.33`; MSI `1.0.0.33`; authority **FD-056**; mode `founder-offline-only` (published; Founder-installed in place 2026-09-03 — see the top Current-truth bullet).
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
- Do not logout, reset AppData or clear protected auth before the round-3
  repair line is installed in place and re-proves the B5/D1 rows, the
  applicable FRC-2 rows (R11) and the remaining FRC-1 rows.

## Exact next-session order — installed-campaign conversion (post F-04..F-08 repair)

The Founder has installed Internal.33/FD-056 in place (2026-09-03); its
installed campaign produced the five findings F-04..F-08, all repaired at
source on open **PR #391** (branch `fix/internal33-founder-findings-r1` @
`8bd9a25`; full Required battery green at head). Remaining order:

1. Re-resolve protected `main`, open PRs and #306/#316/#317/#230. PR #391's
   state decides the entry point. The Internal.32/33 campaigns stay open
   except the logout row; sidecar rows (INB-13/14/19/32) stay BLOCKED.
   INB-27 is executed at source on stacked PR #392 — merge #391 first,
   then review/merge #392 (retargeted to `main` after #391 lands).
2. If PR #391 is unmerged: present it for Founder review/merge (Required
   battery green at head; no release authority implied). Only an explicit
   Founder directive packages the repair line into the next signed
   successor (release train per `WORKFLOW.md`).
3. On the next installed build: convert F-04..F-08 on Founder observation
   (delete works including 69-char ids; AI chat answers instead of the
   dead-end copy; queue header/select toolbar hold at narrow widths; the AI
   agents page presents capability truth, workforce groups, real shop
   counts and the shop-wide approval loop) AND re-verify the Internal.33
   wave rows — INB-24 voice gestures (hold-to-record, slide lock/cancel,
   review-before-send), AI-21 composer screenshot extraction
   (consent-gated, review-first, never auto-sends), INB-16 link previews,
   AI-26 truthful turn signals (real usage metadata only), INB-28 unified
   media sends, INB-11 virtualized list behavior, AI-13 thumbs feedback,
   INB-12 pin/mute/archive — plus D3 six-wave observations; B5/D1 convert
   on this installed observation.
4. Record results in `operations/UI_UX_TRIAGE_LEDGER.md`,
   `operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md`,
   `operations/WHATSAPP_INBOX_CAPABILITY_LEDGER.md` and current-state
   documentation; convert rows only where installed evidence exists. A named
   root that is not yet repaired opens exactly one bounded micro-repair —
   nothing else moves.
5. Founder-side precondition: rotate the screenshot-exposed Gemini key
   (#373) before real AI usage.
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
  The exact signed successor (Internal.32) packages the round-2 repair line;
  it must be installed in place with state preserved to re-verify the
  affected rows (R3–R6), the six-wave first observations (D3), the applicable
  FRC-2 rows (R11) and the remaining FRC-1 rows.
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

- Internal.32 (FD-055) is signed/published AND Founder-installed; its round-3
  campaign passed B3/B4 and the remaining rows (D3 included, per Founder
  verdict) but reproduced B5 and D1 with the roots pinned. Their round-3
  repairs (#379/#380) and the full AAA quality line (#382/#383/#384/#385)
  are merged source evidence on protected `main` only — still NOT packaged
  by any signed successor, and the release train is FROZEN by Founder
  directive until the Founder's own findings list is triaged and he
  explicitly authorizes release. Installed conversion of the rows happens
  on the next installed observation. Internal.30's FD-051 campaign
  rows R1/R2/R7/R8/R10/R12 and the retained #306 rows passed; the logout row
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
