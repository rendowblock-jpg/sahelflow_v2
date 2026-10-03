# SahelFlow documentation authority

> **Status:** Active non-archive documentation entry point
> **Last reconciled:** 2026-10-03 (protected `main` `0c15e77a…` after PR #483; re-resolve live before acting)
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Live protected main:** `0c15e77a04c9de52247afeac258b365b14a55928` / #483. Always re-resolve GitHub `main` before a write, review, merge, release or evidence claim
> **Published signed package:** Internal.40 / `1.0.0-internal.40` / MSI `1.0.0.40` / FD-066 / `customer-online` — tag `sahelflow-v1.0.0-internal.40-6e96dafca29f1d11260286196888d54332b1ca0c`, published 2026-10-02T15:05:29Z. Founder-authorized launch candidate, not Stable
> **Retained published source:** Internal.39 / FD-065 tag `sahelflow-v1.0.0-internal.39-ac4fe24c…`; Internal.38 / FD-062 `9bf899274074f6f20935d224b96e8b1d14fc9690`
> **Latest recorded installed checkpoint:** Internal.40 / FD-066 (Founder-installed 2026-10-03, AppData preserved). Campaign rows convert only on named observation
> **Current next outcome:** merge the Internal.40 installed-campaign repair line, then a separate Internal.41 release-authority PR. Campaign rules stay: one preserved in-place update, convert only proved rows, #306 logout LAST, then FRC-3 in order A→D→C→B

This directory is the active documentation authority for SahelFlow. `documentation/archive/**` is historical evidence/context only and must not be treated as the current execution frontier.

## Mandatory reading order

1. `system/CURRENT_STATE.md` — exact merged/released/installed/provider truth and current non-claims.
2. `system/ROADMAP.md` — First Revenue Certification dependency/completion order.
3. `operations/WORKFLOW.md` — research, implementation, review, CI, installed/provider evidence and release process.
4. `operations/WORKING_MEMORY.md` — single compact resumable frontier, and **the authority for what is installed**.
5. `operations/WHATSAPP_INBOX_CAPABILITY_LEDGER.md` — active issue #317 message/media evidence ledger when Inbox or provider work is in scope.
6. `operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md` — active FRC-2 AI/tools/order-extraction evidence ledger when AI work is in scope.
7. `operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md` — the exact Internal.30 ↔ protected-`main` reconciliation (PR #359 delta) and the FD-051 installed-campaign rows when packaging, releasing or executing the campaign.
8. `product/PRODUCT.md` — product promise, seller jobs, commercial boundaries and entitlements.
9. `product/EXPERIENCE.md` — Class-AAA experience, capabilities and Required journeys.
10. `product/DECISIONS.md` — consolidated Founder decisions, including FD-045 First Revenue Certification.
11. `system/ARCHITECTURE.md` — canonical authority, provider, AI, native, security and recovery invariants.
12. `research/RESEARCH.md` plus privacy/security inventories when relevant.
13. `operations/FRC3_REQUIRED_CAPABILITY_JOURNEY_LEDGER.md` — the FRC-3 Required capability/journey assurance ledger (19 capabilities / 27 journeys / page-completion surface / INV-001..044 mapped to exact evidence) when FRC classification, installed-campaign conversion or launch-readiness evidence is in scope.
14. `product/INTERFACE_SYSTEM.md`, `operations/TRANSFORMATION_REGISTER.md` and `operations/TRANSFORMATION_HANDOFF.md` — the interface system and the transformation program's row states and resume procedure, when source-level transformation work is in scope. Read the register's CORRECTED rows before "fixing" anything they cover.

Reading order does not change authority precedence. A newer explicit Founder decision outranks lower execution documents for the choice it changes. Protected GitHub source, exact Actions evidence and signed releases outrank stale chat summaries.

## Security-evidence authority (single interpretation)

`security/phase4-vulnerability-triage.json` is the live accepted-disposition authority (CycloneDX VEX input) only: it records accepted exceptions, mitigations and not-affected verdicts, and it never asserts that any exact head is vulnerability-free — an empty findings array means no disposition was accepted, nothing more. The only machine-proven exact-head audit truth is the blocking `bun audit --production` GitHub Actions check executed at the exact audited commit (`.github/workflows/ci.yml`, `.github/workflows/phase6-7-completion.yml`); the triage file does not duplicate or restate that run result. SBOM/VEX artifacts and their authority digests are generated deterministically by `scripts/generate-phase4-evidence.ts` and re-verified by `scripts/verify-phase4-closure.ts`; Rust advisory coverage rides the CycloneDX SBOM (resolved Cargo.lock components) under the explicit policy in the triage file. Historical Phase 4 material stays in `documentation/archive/phase4/` and is never promoted back into authority.

## Current protected and signed truth

The paragraph below is the 2026-09-16 publication snapshot (best-known then **`486e0163…`** after PR #452), not the live head. Live head is `bc840ca7…` / #464. Snapshot text: protected `main` was **`486e0163…`** after PR #452 (the Internal.38 / FD-062 publication record — README/CURRENT_STATE/WORKING_MEMORY/CHANGELOG re-anchored to the published facts), on top of #451 (Internal.38 / FD-062 release authority) and #450 (STR-01 slice 3: the thread header cluster extracted verbatim into `inbox-thread-header.tsx`, 1,544 → 1,283), on top of #449 (the EX-6 control-plane deployment playbook recorded at §8 feeding #230; the FD-061 CodFlow extraction register is fully terminal) and #448 (the EX-5 MCP agentic surface study recorded at `research/CODFLOW_EXTRACTION.md` §7 and the EX-5 register flip), on top of #447 (the EX-4 → DONE (source) docs flip), on top of #446 (EX-4 slice 6: Turnstile + WhatsApp OTP checkout gates — the final EX-4 slice; storefront enrichment complete), on top of #445 (the EX-4 slice-5 docs flip), #444 (EX-4 slice 5: per-product landing pages — LandingPage/LandingPageImage models, landing-page-service with lifecycle + guarded delete + duplicate zeroing + ref-counted image deletes, public `/storefront/[slug]/lp/[page]` RSC with the buyer COD form and `landingPageSlug` attribution, failure-isolated views counter, seller manager with sibling comparison), on top of #442 (EX-4 slice 4: the WebP image pipeline — 8 MB cap, sniff-equals-claim, transcode-with-fail-open, immutable upload caching), on top of #441 (the EX-4 slice-3 docs flip), #440 (EX-4 slice 3: quantity-tier offers — highest trigger wins, live reward-stock check, pre-command application through the kernel's unitPrice: 0 channel), on top of #439 (the EX-4 slice-2 docs flip), #438 (EX-4 slice 2: order-verified reviews — one review per real order, server-side (orderNumber, phone) verification, seller moderation, order-identity-free public display), on top of #437 (the EX-4 → IN PROGRESS docs flip), #436 (EX-4 slice 1: the abandoned-cart recovery ledger — first slice of the storefront-enrichment row), on top of #435 (the EX-3 → DONE (source) docs flip), #434 (EX-3: the Meta Pixel + Conversions API engine extracted onto the desktop), on top of #433 (the EX-3 in-progress frontier + resume order), #432 (EX-2: ZR Express + EcoTrack reconciled to the live-proven CodFlow contracts), #431 (EX-1 → DONE (source) flip) and #430 (EX-1: the Yalidine adapter repaired to the live-proven CodFlow contract), on top of #429 (FD-061 CodFlow extraction program adoption), #428 (frontier reconcile to the Internal.37 / FD-060 reality), #427/#426 (STR-01 thread slices 2/1), #425 (canonical formatters + Settings authority surfaces) and #424 (the Internal.37 F-14/F-15 visual repairs), on top of #414 (whole-app transformation W1–W6), #413 (Internal.36 publication record), #412 (**Internal.36 / FD-059** release authority), #411 (behavioural UI evidence), #410 (delta reconcile) and #409 (Phase 4 closure authority). Revalidate live state before every write/merge.

**Internal.38 / FD-062 is the latest signed/published package** (release PR #451 / protected source `9bf899274074f6f20935d224b96e8b1d14fc9690`, app `1.0.0-internal.38` / MSI `1.0.0.38`, published 2026-09-16T20:25:03Z at tag `sahelflow-v1.0.0-internal.38-9bf899274074f6f20935d224b96e8b1d14fc9690`; the updater `latest.json` serves `1.0.0-internal.38` to the installed Internal.37; the Founder has not yet installed it — see the header above, `system/CURRENT_STATE.md` and `operations/WORKING_MEMORY.md`). Retained Internal.37 record (installed 2026-09-11 and visually rejected before campaign conversion — F-14/F-15, repaired at source by #424): app `1.0.0-internal.37` / MSI `1.0.0.37` / FD-060 / release PR #423 / protected source `cd1114defc59852a8f4a2258147dbe57b7fa4050` / tag `sahelflow-v1.0.0-internal.37-cd1114de…` / publication record PR #452. Retained Internal.36 record:

- app `1.0.0-internal.36`;
- MSI `1.0.0.36`;
- authority FD-059; mode `founder-offline-only`;
- release PR #412 / protected source `4e527f0549674789b4f679ae7c2368d2520ccb44`;
- tag `sahelflow-v1.0.0-internal.36-4e527f0549674789b4f679ae7c2368d2520ccb44`;
- MSI digest `sha256:5d5b03e284327dd2bc9fb4be674719bba8022506a46a7d3518236dc2700ab243`;
- signed run `34281216710`; publication record PR #413.

Retained signed-checkpoint history (superseded as latest — see `operations/WORKING_MEMORY.md` and `system/CURRENT_STATE.md`):

- Internal.35: app `1.0.0-internal.35` / MSI `1.0.0.35` / FD-058 / PR #398 / source `f45e6e1c9ece903623dcbe71a22b6806b0562cde` / digest `sha256:97bcd5dc…`;
- Internal.34: source `0cdd5ce2…` / digest `sha256:dc3d3771…` / FD-057 — superseded as latest installed by Internal.37 / FD-060 (2026-09-11);
- Internal.30: app `1.0.0-internal.30` / MSI `1.0.0.30` / FD-051 / PR #357 / head `aa4a632a9269ac2318bbf414611cf0e75cb97f5c`; dispatcher `33292273959`, signed run `33292278832`, observer `33292285084`; tag `sahelflow-v1.0.0-internal.30-2eb8a33749118e233240019bf2df9a47d586a04d`; digest `sha256:bef15026fc3f7394f2b10d15a809229418c585191509c78941a27461fbc8210e`; the full Required battery passed on the exact head (21 checks: 20 success / 1 skipped / 0 failed, including installed-MSI evidence);
- Internal.29: dispatcher `33212635887`, signed run `33212648778`, observer `33212661580`, tag `sahelflow-v1.0.0-internal.29-a34917e582c4806aee35ad5aca12aaea82a0ddcf`, digest `sha256:c3afdadc8a3f457826f37bd45084d2647a65d9a79f51b71d0d68f86d068aa50f`.

The signed workflow proved exact protected-source and reviewed-tree binding, Required PR success, signed MSI/updater build, staged runtime readiness, local signature verification, signed install/launch/reopen, authenticated hydrated WebView twice, deterministic rewrites, evidence manifest, `latest.json`, exact tag and publication.

### Installed truth (read before converting any ledger row)

**Published is not installed.** The FD-058 installed campaign has produced no converting installed observation on any candidate after Internal.34 — the Internal.37 observation (2026-09-11) was a visual rejection (F-14/F-15) that preceded campaign conversion — so **no ledger row converts from Internal.35, Internal.36 or Internal.37**. The latest recorded Founder-installed checkpoint is **Internal.37 / FD-060** (installed in place 2026-09-11); the published Internal.38 / FD-062 awaits the Founder's in-place update, then the once-only campaign.

The formerly-unresolved contradiction is closed (2026-09-16): `operations/TRANSFORMATION_REGISTER.md`'s header asserted a Founder-installed Internal.36 that was never recorded — the register header was corrected in the conservative direction, matching `operations/WORKING_MEMORY.md`, which remains the installed authority. Only the Founder, who owns the observation, can convert installed truth.

## Parallel source-level transformation track

The whole-app transformation program (merged through #414, continued in #416 and its successors) is a **source-level track**. It carries **no release authority**, converts **no installed row** and produces **no provider or customer evidence**. Its row states live in `operations/TRANSFORMATION_REGISTER.md`; its resume procedure and local test setup live in `operations/TRANSFORMATION_HANDOFF.md`.

Two standing rules the program learned the hard way, both now enforced in `AGENTS.md`:

- CI triggers only on pull requests targeting `main` (`.github/workflows/ci.yml`, `on: pull_request: branches: [main]`). A stacked PR onto a feature branch receives **zero check runs** and can never be verified. Retargeting its base afterwards does not help, because `edited` is not in the workflow's `types`.
- `concurrency: cancel-in-progress: true` discards an in-flight run when the same branch is pushed again, so never push more than one slice ahead of CI.

Rows marked **CORRECTED by evidence** (IA-02, IA-03, IA-04, IA-05b, UI-07, FN-02) must not be reopened or "fixed"; they were closed by evidence showing the original finding was wrong, not by a repair.

## Product line now packaged

The lines below are retained Internal.28/Internal.29-era packaging history, superseded as *latest* by Internal.30 through Internal.36 but retained for audit continuity.

Internal.29 retains the completed product/security line through Internal.28 and adds:

- #335 — quoted replies resolve both provider/message id spaces with a persisted canonical target, confining ambiguous provider ids to the quoting conversation (repairs the received-message 409);
- #336 — OOXML documents dispatch under their declared Office mimetype across the sealed attachment, effect payload, sidecar allowlist and authenticated reads (repairs real PDF/Word arriving as zip);
- #337 — in-composer voice recording: bounded MediaRecorder take through the same durable outbound voice/PTT path with WebView2 media browser args (repairs the voice button opening the file dialog);
- #338 — permanent multi-select chat deletion;
- #339 — compacted composer attach menu with a bottom-anchored history closing message-list dead space;
- #340 — installed-e2e evidence MSI injection preserves checked-in browser args;
- #342/#343 — FRC-2 freeze: `frc2-1.0.0` extraction corpus (40 cases, 56/56 tests) reconciled into `operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md`;
- #344 — Internal.29 / FD-050 release authority only.

Internal.28's direct package (#315 CSP/loopback repair, #319 Notification Center, #324/#325/#327/#329 outbound image/video/document/voice, #331 interaction parity, #333 authority) remains inside Internal.29.

Internal.27 had added #312 provenance-bound individual `numeric@lid` replies, Arabic empty-composer RTL, governed status control and reviewed thread-header extraction, plus #313 release authority; that line remains inside Internal.28.

#309/#310/#311 remain the retained Internal.26 callback, resizable-Inbox and release foundation; #300/#304/#305/#307 remain the earlier security/provider foundation.

Earlier current foundations remain protected: #273–#276 shared semantic RTL, #278 Inbox, #279 AI Agents, #280 Settings/Internal.21, #281 analytics, #282 Inbox V3/WhatsApp recovery, #283 Universal Search, #286 sleep/resume/Search, #287 Risk, #289 dashboard/delivery, #290 RTL/navigation/demo, #293 charts, #294 Automations V2 and #295 durable Wait/recheck/Bell.

Do not restart those programs without direct regression evidence.

## Evidence boundary

- **#221 — closed/completed:** Founder accepted installed Internal.24 for the retained whole-product visual/product gate. That acceptance remains valid for Internal.24 and does not fabricate provider/customer proof.
- **#226 — closed/completed:** retain its performance/reliability budgets as regression criteria.
- **#306 — open:** Internal.27 passed preserved update/reopen, exactly-one real `numeric-id@lid` outbound with provider receipt/delivery, and exact-once durable inbound from a new number. The new inbound required manual Inbox refresh. PR #315 is now protected source for loopback dynamic-port live push, durable polling/retry fallback and receipt/outbox identity races; automatic arrival and remaining UI/extraction/logout rows are not yet signed/installed proof.
- **#316 — open:** Class-AAA durable Notification Center and WhatsApp attention routing is source-merged through PR #319; signed/installed/native evidence is pending.
- **#317 — open:** professional WhatsApp Inbox capability ledger and certified message/media operational parity.
- **#230 — open/reopened P1:** no owned production domain exists; customer-online trial/network readiness remains blocked.
- **#164 — open.**
- Real commerce/courier account certification, representative beta, independent review and Stable remain unproven.

The current package is Founder-offline-only. It is not customer-online, Beta or Stable.

## FD-045 — First Revenue Certification strategy

The Founder’s 2026-08-25 direction is to obtain fast, honest first revenue with no paid infrastructure before revenue while reaching the highest defensible confidence across all publicly promised functionality.

The binding interpretation is:

- “100% functional” means every publicly promised Required capability and journey has current evidence and zero known P0/P1; it does not promise that unknown defects cannot exist.
- “99.99% sure” retains FD-033’s evidence definition: execute every defined Required matrix at the applicable layer on an exact candidate, disclose residual external risks and never convert confidence into a mathematical warranty.
- Publicly promise only exact live-certified provider actions. Unverified adapters remain hidden, disabled or conditional.
- Zero budget changes sequencing, never security, privacy, durability, customer truth or launch gates.
- No first customer becomes an undisclosed provider experiment.

### FRC execution packages

1. **FRC-1 — WhatsApp installed/provider proof (#306).** Retain PR #315 as source-merged repair and preserve the Internal.27 real-phone evidence. Do not open a successor yet; after #316/#317 and FRC-2–5 source work, separately authorize one combined signed candidate and prove no-refresh new inbound plus persistence/reopen, representative EN/AR Inbox, governed status/reviewed extraction and logout.
2. **FRC-2 — AI/tools/order extraction.** Freeze a tool/corpus matrix; test seller-owned Gemini setup, every model-exposed tool, proposal/permission/current-state checks, stop/retry/quota/offline/malformed behavior, privacy minimization and AR/FR/EN/Darija/mixed extraction. Core work and manual fallback remain functional without AI.
3. **FRC-3 — complete-product assurance.** Map the Product Stable capability table, Experience page-completion contract and 27 Required journeys to source, automated, signed/installed, Founder and external evidence. Repair only demonstrated shared roots in one bounded batch.
4. **FRC-4 — commerce live certification.** Use official Shopify/YouCan development environments and a controlled WooCommerce store. Prove authentication, webhook signatures, duplicates/order, pagination, reconciliation, conflicts, rate limits, revoked credentials, outage and recovery.
5. **FRC-5 — courier live certification.** For every public courier/action require current provider-issued contract plus sandbox/demo or explicitly authorized real-account evidence for credential test, service areas/fees, create, label, track, status map, edit/cancel/return where supported, idempotency, ambiguity, rate limit, outage and reconciliation.
6. **FRC-6 — first paid assisted deployment.** Scope the first seller to a certified commerce/courier combination. Do not authorize customer distribution, public trial, Beta or Stable until customer-access authority and all applicable gates pass or a newer explicit Founder decision defines a transparent bounded exception.

## FD-048 — source-first batch before one installed successor

The Founder’s 2026-08-26 sequencing decision defers the next signed/installed
FRC-1 successor until one coherent source frontier is ready:

```text
PR #315 source merge
→ active documentation reconciliation
→ #316 durable Class-AAA Notifications
→ #317 professional WhatsApp Inbox parity/certification ledger
→ FRC-2 AI/tools/extraction source and evidence matrix
→ FRC-3 Required capability/journey ledger and demonstrated repairs
→ FRC-4 commerce official dev/test certification work
→ FRC-5 courier contract/sandbox or authorized-account certification work
→ freeze one exact protected-main candidate
→ separate release authority
→ one signed successor, one preserved in-place update and one installed/live campaign
```

FD-049 (2026-08-27) later fixed one more cadence point: after #317 completes,
one signed successor (Internal.28) is authorized for Founder-installed testing
before FRC-2–5 resume. That successor and seven further checkpoints have since
been published; the cadence rule, not its Internal.28 example, is what remains
binding.

This batching changes cadence, not evidence. #315 remains source-complete only;
#306 remains open. Source/mock/CI rows may be closed before release, while
installed Windows, real-phone and live-provider rows remain pending until the
exact eventual candidate is observed. No release, first customer, online trial,
Beta or Stable is authorized by FD-048.

## Zero-budget and external-service rules

- Use this machine only for lightweight inspection/edits and real installed/provider observation. Heavy tests, Rust, MSI and complete gates run in GitHub Actions.
- Real-phone WhatsApp and synthetic/redacted Gemini testing can begin without a domain.
- The free Gemini tier may not silently receive raw client PII or full WhatsApp histories; production remains seller-owned-key and privacy-contract bound.
- `workers.dev` may be used for technical development/testing but not treated as the sole business-critical customer authority.
- #230 remains open until a SahelFlow-owned production hostname, resilient ingress/recovery and representative Algerian-network installed evidence exist.
- Provider credentials never enter chat, source, issues or evidence artifacts; authorized operators enter them only through SahelFlow’s protected interface.

## Historical continuity retained for audit

- **Phase 5 closure:** PR #220 remains the historical application-changing protected baseline `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`.
- Historical Internal.15 is `1.0.0-internal.15`; signed run `31657621918` remains evidence.
- PR #250, PR #251 and `agent/internal-16-wave-4` remain Wave 4 history, not active implementation.
- Historical sentence retained for marker continuity: **Issues #221, #226 and #230 remain open**. Current truth supersedes it: #221/#226 are closed/completed, and the live open set is #164, #230, #306, #316, #317.
- The historical evidence set included issues #201, #214, #221, #226 and #230.
- The active product phase label remains **Phase 6 — Arabic, RTL and accessibility parity** for semantic continuity while First Revenue Certification closes Phase 9-adjacent external evidence.

## Exact resume path

1. Resolve live protected `main`, open PRs, and #164/#230/#306/#316/#317. Ignore #457; it is a stale handoff. #456 is optional CI hygiene and is not the product frontier.
2. Read the header of this file. Internal.38 / FD-062 is the latest signed package. Internal.37 is the latest installed build and converted nothing. #464 is the source head and is not in Internal.38.
3. Do not run the FD-058 campaign on Internal.38 if the goal is to observe F-16…F-33. That observation needs a later signed candidate containing `bc840ca7…`. The Founder makes that packaging decision. This documentation change is not a release.
4. When a candidate is installed, with AppData preserved, execute the rows that candidate contains. Use the capability ledgers. #306 logout is LAST. Convert nothing the observation did not prove.
5. Then continue FRC-3 in order A→D→C→B. Keep FRC-4/FRC-5 external blockers explicit.
6. Source-level transformation work (`operations/TRANSFORMATION_REGISTER.md`, handoff §4) may proceed in parallel. It never converts an installed row and never carries release authority.
7. Do not expose or market an integration/action before its live certification record exists.
8. Keep #306 installed proof, #230/customer-online, commercial deployment, Beta and Stable as separate explicit gates.

Acceptance hierarchy for whole-product experience remains:

**Founder-installed visual judgment > side-by-side screenshot comparison > real interaction behavior > automated technical gates.**
