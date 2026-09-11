# SahelFlow — Working Memory

> **Purpose:** Single compact resumable handoff. Read after Current State, Roadmap and Workflow.
> **Last updated:** 2026-09-11
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Do not use this file as a live branch pointer:** resolve protected `main` from GitHub at action time.

## Current truth

- **Internal.37 Founder-installed visual rejection (2026-09-11, latest):** the Founder installed Internal.37 / FD-060 in place (AppData preserved; `runtime-ui-ready.json` `1.0.0-internal.37`, locale `ar`) and rejected the package visually before any campaign-row conversion. Screenshots: Inbox queue bigger/messy + Latin names on the timestamp side (`Screenshot 2026-09-11 160658.png`); Agents not a Class-AAA workspace in any layer (`Screenshot 2026-09-11 161704.png`). Repair is source-only on branch `fix/internal37-inbox-agents-aaa` (F-14 / F-15) — not a release-authority PR; converts on the next installed observation. Do not restore the visible workspace `PageHeader` or the empty Agents review column.
- **Transformation source frontier (2026-09-10 — source-level only, no release authority):** protected `main` is best-known **`730641b7fe4304691e43ae6138ec3e278516183a`**, the squash of **PR #416** (STR-01 slice 1: `AiComposerDeck` extracted from `ai-decision-canvas.tsx`, 964 → ~620 lines; 19 checks, 15 success / 4 risk-classified skips / 0 failed), on top of **PR #414** (whole-app transformation W1–W6, squash `29987b0f020fe0713dd790d9fdee519ba2506e8e`). Open: **PR #415** (docs-only frontier reconcile — `AGENTS.md`, `system/ROADMAP.md`, this file and `documentation/README.md`) and **PR #418** (STR-01 slice 2: the conversation log extracted into `ai-message-log.tsx`, canvas → ~430 lines). **STR-01 stays OPEN** — the canvas is not yet under the 400-line budget, so a third slice (canvas header or the shortcut hook) is owed, followed by the same decomposition for `inbox-v3-thread` (2,235), `storefront-studio` (1,752) and `inbox-v3-queue` (1,325). Row states live in `operations/TRANSFORMATION_REGISTER.md`; resume procedure and local test setup in `operations/TRANSFORMATION_HANDOFF.md`. **This entire track is source-level: it carries no release authority, is inside no signed package, and converts no installed, provider or customer row.** Two CI facts this program established by evidence and that must not be relearned: (1) `.github/workflows/ci.yml` triggers only on `pull_request` with `branches: [main]`, so a PR stacked onto a feature branch receives **zero check runs** and can never be verified — PR #417 lived its whole life at `total_count: 0` and was closed and replayed onto `main` as #418; retargeting the base afterwards does not help, because `edited` is not in the workflow's `types`; (2) `concurrency: cancel-in-progress: true` discards an in-flight run when the same branch is pushed again, so never push a second slice ahead of CI. Also recorded: `prettier --check` is not enforced over `src/components`, and this repo publishes **check runs**, not commit statuses (read CI with check-runs, not commit-status APIs).
- **Internal.36 FD-059 published (2026-09-08, latest):** the Founder adopted FD-059 ("continue and complete the work fully") and the signed successor shipped the same day. Release PR **#412** (branch `internal-36-fd059-release`, commits `e29814c…` prepare + `43af229…` adoption) merged by expected-head squash as **`4e527f05…`** — release-authority files only: `.github/release-requests/internal-36-fd059-signed-successor.json`, release.yml founder-offline allowlist +1 pair, DECISIONS.md FD-059 (ADOPTED, sequencing (b) resolved: one combined FD-058 campaign on the installed Internal.36 candidate; FD-058 publication facts remain retained evidence), version pins `1.0.0-internal.36`/MSI `1.0.0.36` across package.json/sahelflow.version.json/tauri.conf.json/Cargo.toml/build.rs/sf-version.ts/install-founder-windows.ps1, and the license-production-boundary pin test. Certification: product head `7052db9e…` (tree `1214fe83…` = reviewed PR #411 head `72cbef96…`) with CI 34271651655, Phase 5 34271651439, Phase 6-7 34271651432 green at that exact head; the release-PR battery went green at `43af229…` (CI + Phase 5 + Phase 6-7 + Native; Integration risk-classified skip — identical shape to PR #398) with one recorded transient: ready-battery Phase 5 run 34277049132 attempt 1 failed `ai-workspace.spec.ts:98` (`[data-ai-start-state]` visibility — session-creation propagation race) and the failed-jobs-only re-run passed; evidence comment recorded on PR #412 before any retry. Signed build: run **34281216710** success 36/36 (dispatched by `release-on-version-authority` automation on the release-authority merge; the duplicate manual dispatch 34281272230 was cancelled pre-start), tag **`sahelflow-v1.0.0-internal.36-4e527f0549674789b4f679ae7c2368d2520ccb44`**, MSI `SahelFlow_1.0.0-internal.36_x64_en-US.msi` digest **`sha256:5d5b03e284327dd2bc9fb4be674719bba8022506a46a7d3518236dc2700ab243`** (computed from the published asset), updater `latest.json` serves `1.0.0-internal.36`, observers 34281232614 + 34281432828 success. **Next: the Founder applies the in-place Internal.36 update through the normal updater (no logout, no AppData reset, no protected-auth clearing) and executes the FD-058 campaign rows once on the installed Internal.36 candidate — F-05 residual (chat must stream), F-09..F-13, retained FD-050 rows (B1–B5, D1, delivery-receipt enum truth, C1 sleep/wake auto-receive), D3 waves, applicable #316/#317 native rows, retained #306 rows — #306 logout executes LAST; ledger rows convert only on that installed observation; the Founder rotates the chat-transited GitHub PAT after this merge window; then resume FRC-3 in dependency order (A→D→C→B).**
- **Phase 4 closure authority green + security-disposition merges (2026-09-08):** issues **#303** and **#407** are both CLOSED on protected `main` `9f3704f…`. **PR #408** (docs(security), merged by expected-head squash `b2db189…`) resolved #303: `documentation/security/phase4-vulnerability-triage.json` is the LIVE accepted-disposition authority (CycloneDX VEX input) — the stale manual `status: "pending-exact-head-audit"` claim was removed and replaced by the `authorityScope` / `exactHeadAuditAuthority` / `evidenceGeneration` policy contract (the only machine-proven exact-head audit truth remains the blocking `bun audit --production` GitHub Actions check at the exact audited commit: ci.yml + phase6-7-completion.yml); `sf-audit` now requires the file and enforces its contract markers; `documentation/README.md` gained the single "Security-evidence authority" interpretation section. **PR #409** (fix(privacy), merged by expected-head squash `9f3704f…` — full hosted battery 15 success / 5 risk-classified skips / 0 failed incl. Quality Gate, DPAPI authority, fresh-install browser lane) resolved #407: the 8 previously unclassified Prisma models are classified in `documentation/privacy/phase4-data-inventory.json` (7 into `operational-security-metadata`: AiMessageFeedback with a child-first deleteMany, the PII-free notification-center quadrant, SearchProjectionDirty/SearchProjectionToken wiped after the canonical deletes fire their projection triggers; SearchProjectionRevision RETAINED in a new `search-projection-watermark` group — it is migration-seeded, trigger-advanced counters, and deleting it would silently no-op the triggers and throw in `committedRevision()`), and `vitest.config.ts` now INCLUDES `scripts/__tests__/phase4-closure-authority.test.ts` so the Phase 4 closure gate is CI-gated for the first time. `verify-phase4-closure` is green at the merged head. Frontier docs re-anchored to best-known `9f3704f…`.

- **Phase 4 security-disposition reconciliation + #404–#406 frontier delta (2026-09-08):** issue **#303** resolved — `documentation/security/phase4-vulnerability-triage.json` is now explicitly DEFINED as the **live accepted-disposition authority** (CycloneDX VEX input), not a historical checkpoint: the ambiguous manual `status: "pending-exact-head-audit"` claim (stale since the blocking audit became CI authority) was REMOVED and replaced by an explicit policy contract — `authorityScope` (dispositions only; never an exact-head vulnerability-free claim), `exactHeadAuditAuthority` (the only machine-proven exact-head audit truth is the blocking `bun audit --production` GitHub Actions check at the exact audited commit: `.github/workflows/ci.yml` + `.github/workflows/phase6-7-completion.yml`) and `evidenceGeneration` (SBOM/VEX + authority SHA-256 digests stay deterministically generated by `scripts/generate-phase4-evidence.ts` and re-verified by `scripts/verify-phase4-closure.ts`; generated artifacts are never hand-edited). `emptyFindingsMeaning` (empty findings never mean vulnerability-free), the Rust/Cargo SBOM policy, block-merge rules and exception requirements are preserved unchanged; `scripts/sf-audit.ts` now REQUIRES the triage file and enforces its contract markers, so the status-claim drift cannot silently return; `documentation/README.md` gained the single "Security-evidence authority" interpretation section; historical Phase 4 material stays in `documentation/archive/phase4/` (nothing promoted back). Frontier docs (AGENTS/README/docs headers) re-anchored to best-known `origin/main` `c50f297…` — PR #406 (FRC-3 ledger adoption) on top of #405 (P3 micro-repairs `c32b857…`) and docs-only #404 (delta reconcile `9b4f67d…`).

- **FRC-3 Required capability/journey assurance ledger adopted (2026-09-08 — founder-directed order A→D→C→B):** `operations/FRC3_REQUIRED_CAPABILITY_JOURNEY_LEDGER.md` maps the PRODUCT §18 capability table (19 systems), the 27 EXPERIENCE §25 Required journeys (J-01..J-27 assigned for addressability), the 30-route page-completion surface and ARCHITECTURE INV-001..INV-044 to exact, existence-verified evidence pointers, with an open register (demonstrated defects + externally blocked rows) and 8 conversion rules. Classification is deliberately conservative: only "Updates and migrations" carries proven (source+installed) from retained Founder in-place observations; installed conversions stay gated on the FD-058 campaign. PR #405 (P3 micro-repair batch) merged `c32b857…` in the same session: F-2 comments, F-3 namespace pin test, AI-17/AI-23 row conversions; F-1 still awaits a recorded Founder decision. The reported `branches: ain]` CI-trigger defect was disproven byte-level (exploration-tool display artifact; all five workflows already read `branches: [main]`) — no repo change.

- **P3 AI micro-repair batch + exploration corrections (2026-09-08):** branch `fix/p3-ai-ledger-micro-repairs` — **F-2** stale quota comments re-anchored to the real limiter truth (`rate-limit.ts` / `smart-router.ts` / extraction route; comments only), **F-3** legacy `ai-order:` idempotency namespace pinned disjoint from the canonical `ai-action:` namespace by contract test (`legacy-idempotency-namespace.test.ts`; the legacy body stays deliberately Vitest-only per the registry's registered test-compatibility decision), UI/UX ledger **AI-17 char-counter + AI-23 two-step-delete-announce residuals converted to DONE (source, PR #391)** — both were already repaired in the F-06 wave and pinned by `f06-page-completion-contract.test.ts`; only the rows were stale. **F-1 (extraction `requireLicense()`) remains untouched pending a recorded Founder decision.** Source-only delta; NOT inside any signed package; rows convert on the next installed observation.

- **Protected-main delta after the Internal.35 publication (2026-09-08):** PRs **#401** (docs: frontier reconcile to Internal.35 + missing App Router boundaries — `join/error.tsx`, storefronts `history`/`studio` dedicated error+loading), **#402** (chore(eslint): AAA gates tightened — api `no-console` → error, exhaustive-deps → warn) and **#403** (fix(i18n): phone/license/shop-lifecycle server-error rules trilingually, `translate-server-error.ts` + 63-line rule test) merged on top of #400/#399; best-known `origin/main` `418d665…`. This delta is NOT inside published Internal.35; it rides protected `main` ahead of the next signed package and receives its first installed/Founder observation there. Protected `main` was resolved live from GitHub at this reconciliation (successor machine, live fetch reachable). The docs-only #404 reconciliation (branch `docs/frontier-reconcile-401-403`, merged `9b4f67d…`) re-anchored the active docs to that same truth and repaired the duplicated heading fragment below.
- **Internal.35 / FD-058 publication (2026-09-06 — supersedes the release-await and merge-sequencing claims of the bullets below; their evidence claims remain retained)**: under the Founder's directive ("go with 1 then 2" — merge both campaign PRs, then cut the signed successor), both campaign lines and the signed successor were executed the same day. **PR #396** (Internal.34 installed-campaign AI line) merged to protected `main` by squash `dcd82f8…` — F-09 truthful coded verdicts, F-10 busy-retry delete, F-11 wrapping no-overlap toolbar, F-12 Class-AAA agents, plus the F-05 residual ROOT CAUSE (Gemini `alt=sse` CRLF framing blindness — every real chat turn parsed bare-empty while the verify probe succeeded; per-chunk CR-strip + `stream_empty_turn` evidence log + CRLF fixtures) and the CI-repair `6ceb79e` (the F-10 delay index violated `noUncheckedIndexedAccess`; 4 red lanes, one root cause, one bounded fix). **PR #397** (F-13 notifications show-all workspace: N-1 pagination wipe, N-2 duplicate-id rendering, N-3 per-row mark-read, N-4 preferences skeleton, N-5 unread surfacing, N-6 preference-state chips, N-7 semantic day headers, N-8 inbox-v3 grammar) merged by squash `d83bd8e…` after the predicted UI_UX_TRIAGE_LEDGER adjacency conflict was resolved by merge `ccded6a…` (CI re-ran green at that head: 14 success / 5 risk-classified skips / 0 failed). Release-authority PR **#398** (FD-058 — version authority `1.0.0-internal.35` / MSI `1.0.0.35` / `founder-offline-only`, release request `internal-35-fd058-signed-successor.json`, founder-offline checkpoint arms extended in `sf-version.ts`/`build.rs`/`release.yml`, installer expected versions, license authority inventory test) merged by expected-head squash `f45e6e1…` after its head passed the FULL release battery (20 success / 1 risk-classified skip / 0 failed incl. installed-MSI evidence + lifecycle gates). Certification cites product head `d83bd8e…` (tree-identical to the reviewed PR #397 head `ccded6a…`, tree `a29d4d7b…`; CI `34016720713`, Phase 5 `34016720554`, Phase 6-7 `34016720602` — all success). On merge the push auto-fired the release train: dispatcher `34019675230` → **signed publication `34019683179` (success)** → observer `34019691336` (success); release tag `sahelflow-v1.0.0-internal.35-f45e6e1c9ece903623dcbe71a22b6806b0562cde` verified pointing at the merge commit; published release "SahelFlow Internal 1.0.0-internal.35" (2026-09-06T08:03:22Z) with assets `SahelFlow_1.0.0-internal.35_x64_en-US.msi` digest `sha256:97bcd5dccd486e9a212dd04b37e22c3d29ccdeb9685e4ea1e6b0d6e845dca502`, `.msi.sig` and updater `latest.json` (pub_date 2026-09-06T07:59:43Z; `windows-x86_64` + `windows-x86_64-msi` both signed). Sidecar rows (INB-13/14/19/32) stay BLOCKED; #230 unaffected.

- **Internal.34 installed campaign executed + PR #396 repairs (2026-09-05 — its "Next: the Founder merges PR #396" sequencing claim is superseded by the Internal.35 publication bullet above; evidence claims retained)**: the Founder installed Internal.34 and reported the round: F-04 partial (256 bound works; first-attempt intermittent delete error), F-05 not converted as observed (banner title "مزود الذكاء الاصطناعي غير متاح حالياً" regardless of cause), F-06 re-rejected ("top tier class AAA redesign" directive), F-08 not converted (RTL pills row clipped ~430px), F-07 + B3/B4 green. Source-read pinned the roots: F-09 client SSE-error collapse (every event → AI_PROVIDER_UNAVAILABLE, hiding geminiErrorMessage + agent.ts truthful verdicts), F-10 SQLite write-lock contention on the multi-statement deletion transaction, F-11 non-wrapping toolbar with a zero-collapsing count pill, F-12 the AAA redesign directive. The Founder also rotated the Gemini key live on the installed build (#373 precondition MET). PR #396 (branch `internal-34-campaign-repairs`, commits `8b60388` + docs) repairs all four: F-09 coded error events (`AI_PROVIDER_EMPTY_RESPONSE`) + provider usage proof + client `AI_PROVIDER_REPORTED` verbatim verdict rendering; F-10 bounded busy-retry (2 re-issues 150/450ms, retry-safe atomic tx); F-11 `flex-wrap` + 8rem pill minimum + icon-only delete <480px; F-12 Class-AAA presentation overhaul (flat assistant turns, start hero, rebuilt rail, polished composer/evidence cards; engine + data-* contracts untouched). Verification: eslint 0 errors on touched files; targeted suites 162 green (chat-delete 16, agent 27, stream 2, inbox contracts 32, AI contracts 75, motion/source 10).
- **Internal.34 / FD-057 publication (2026-09-05)**: under the Founder's directive ("Release Internal.34"), the signed successor was authorized, built and published the same day. Release-authority PR **#394** (FD-057 — version authority `1.0.0-internal.34` / MSI `1.0.0.34` / `founder-offline-only`, release request `internal-34-fd057-signed-successor.json`, founder-offline checkpoint arms extended in `sf-version.ts`/`build.rs`/`release.yml`, installer expected versions, license authority inventory test) was merged to protected `main` by expected-head squash `0cdd5ce2…` after its head `2ac661e2…` passed the FULL Required battery with zero failed checks (19 checks — Quality Gate, Fast authority, Phase 5, Phase 6-7, Native source contract, Tauri Rust smoke, Windows database+standalone, Windows Rust release parity, installed-MSI evidence build + install/launch/close/teardown/reopen lifecycle gates all success; 1 risk-classified skip). Certification cites product head `9dc8e74…` (tree-identical to the reviewed PR #392 head `80395e2…`, tree `ce742113…`; CI `33961402161`, Phase 5 `33961402071`, Phase 6-7 `33961402075` — all success); the docs-only #393 delta carries zero source change. On merge the push auto-fired the release train: dispatcher `33966937514` → **signed publication `33966945628` (success)** → observer `33966952222` (success); release tag `sahelflow-v1.0.0-internal.34-0cdd5ce2b96f22bfebcd63a5103e89ac8d68b2c3` verified pointing at the merge commit; published release "SahelFlow Internal 1.0.0-internal.34" (published 2026-09-05T13:06:44Z) with assets `SahelFlow_1.0.0-internal.34_x64_en-US.msi` digest `sha256:dc3d37717b034d707f29c2fa46bb15a6d73eb2dd642a31ec8ccf907145fa8cca`, `.msi.sig` and updater `latest.json` (pub_date 2026-09-05T13:04:24Z; `windows-x86_64` + `windows-x86_64-msi` both signed). **Internal.34 / FD-057 remains the latest checkpoint with a recorded Founder in-place installation (2026-09-05).** Sidecar rows (INB-13/14/19/32) stay BLOCKED; #230 unaffected.

- **INB-27 merge reconciliation (2026-09-05 — release-await claim superseded by the Internal.34 publication bullet above; merge and evidence claims retained)**: under the Founder's directive ("go with A professionally"), **PR #392 was merged** to protected `main` by expected-head squash `9dc8e74…` immediately after a live re-resolution (base `1847396…` equal to protected `main`; head `80395e2c…`; mergeable state clean; hosted Required battery at the exact head 14 success / 5 risk-classified skips / 0 failed; the API merge call pinned the expected head SHA). Branch `refactor/inb-27-inbox-god-hook-split` deleted per repo convention; the durable tree was verified (all seven `src/hooks/inbox/` concern hooks present, facade `use-inbox-workspace.ts` at 458 lines). The INB-27 row is source-closed: the UI/UX triage ledger now has ZERO open source rows (sidecar rows INB-13/14/19/32 stay BLOCKED; AI-17/AI-23 residuals stay pinned).

- **INB-27 CI-green close-out (2026-09-05 — merge-state superseded by the merge-reconciliation bullet above; evidence and gate claims retained)**: the two stacked gates resolved in sequence — **PR #391 was merged** to protected `main` by expected-head squash `1847396…` (F-04..F-08 repair line), then PR #392 was rebased onto the new `main` (`git rebase --onto` of only the two INB-27 commits → `c65c69c` code + `e9a590b` docs; force-push with lease; tip tree verified identical to the tested state). The first hosted CI battery on `e9a590b` failed 5 lanes, all one root cause: the rebase replay dropped `useRef` from the facade's React import while `deepLinkAttemptRef` composition stayed — `TS2552` in the Quality Gate TypeScript lane and a runtime `ReferenceError: useRef is not defined` crash of the inbox page in the LTR/RTL workbenches, cascading into both Required gates. **This also corrects the 2026-09-03 evidence claim below: the local "full-project tsc 0 errors" was unreliable** (the project-wide check needs >3GB heap and cannot complete in a 4GB sandbox). Fix `af99798` restores the import (1 file, +1/−1). Verified before push: `tsc --noEmit` over the facade's full transitive import graph exit 0, all 12 inbox hook-family test files 94/94 in a fresh sandbox, `eslint .` 0 errors. **Hosted CI @ `af99798`: 14 success / 5 risk-classified skips / 0 failed.** Sandbox discipline recorded: verify locally with facade-graph tsc + targeted suites, and treat the hosted CI battery as the only full-project type gate.

- **INB-27 executed (2026-09-03 — evidence and gate-state claims superseded by the 2026-09-05 bullet above)**: the deliberately deferred god-hook split is done at source: `src/hooks/inbox/` now holds `inbox-workspace-shared.ts` (bounded constants, INB-28 media-send specs, pure projections, B5 delete-rejection summarizer), `use-inbox-shared-refs.ts` (the seven cross-concern refs injected from the composition root), `use-inbox-chat-queue.ts` (canonical load + durable fallback, authority flags, read-state writes, INB-12 state mirror, queue projections), `use-inbox-drafts.ts` (revisioned draft queue, retrying loader, autosave, lifecycle flush), `use-inbox-thread.ts` (generation-guarded loads, additive history paging, selection, WhatsApp-class tail anchoring), `use-inbox-outbox.ts` (shared send gate, INB-28 factory, durable effect monitor, INB-29 retry, truthful uploads) and `use-inbox-transport.ts` (socket handlers, bounded live-recovery poll, connect/logout, QR refresh); `use-inbox-workspace.ts` remains the composition root with the exact historical return shape — zero component-consumer changes, every function body moved verbatim (F-04's 256-char delete bound ported onto the shared layer). The 10 source-pin contract files are re-anchored to their canonical modules with identical invariants. Evidence: targeted suite 203/203 across 26 files in a fresh sandbox, ESLint 0 errors — the "full-project `tsc --noEmit` 0 errors" recorded here at the time was unreliable (see the 2026-09-05 bullet above).

- **Session close-out (2026-09-03)**: the Founder installed Internal.33 in place through the normal updater (installation/shop/WhatsApp state preserved) and reported five installed findings; each registered as its own row in `operations/UI_UX_TRIAGE_LEDGER.md` with a confirmed root and repaired at source on PR **#391**: **F-04** chat-delete contract follows the projection's real id space (bound 64→256 matching sibling provider-shape contracts; tests pin 69-char deletion + 300-char rejection); **F-05** chat token budget 2048→8192 for thinking-enabled flash models with a truthful coded empty-shape verdict (thought-budget exhaustion / policy refusal with blockReason / empty) replacing the gaslighting "rephrase" copy, stream + non-stream, AR/FR/EN; **F-07/F-08** queue header owns its rows (search-row action cluster, full-width pills, shrink-proof select toolbar; all `data-inbox-*`/aria contracts preserved 130/130); **F-06** executed as FUNCTIONAL completion after the Founder's explicit scope correction ("NOT colors/motion/CSS — see what's wrong and missing from that page"): `GET /api/ai/capabilities` projects the SAME central policy map the registry/proposal runtime enforces (fail-closed `AI_CAPABILITY_GROUP_*` on drift, 6 job groups — orders/customers/products/delivery/insights/conversations, blocked tools omitted, sensitive abilities marked "needs approval"), an Abilities workforce panel + honest 5-count shop briefing on the start surface (pendingOrders, ordersToday, lowStockProducts, pendingDeliveries, pendingProposals — independently nullable; failures render nothing, never a fabricated zero), the approval loop surfaced shop-wide at every width (pending strip + header badge beyond session scope), a presentation-only read-only shop-context system instruction (date + counts, non-blocking, declared non-authority) in both message routes, the stale capability sentence replaced in AR/FR/EN, 2 pre-existing canvas type errors fixed, and 10 new tests. Explicitly out of F-06 scope by the correction: any visual/motion/CSS pass; sidecar rows (INB-13/14/19/32) stay BLOCKED; AI-17/AI-23 residuals remain pinned.

- **Session close-out (2026-09-02)**: Founder's AAA quality-line directive executed — the full Inbox/AI UI-UX audit plus the Founder's 3 findings (F-01 document cards, F-02 bubble side under RTL, F-03 select-mode transition) are triaged into the single ledger `operations/UI_UX_TRIAGE_LEDGER.md` and executed to source level on PR **#387**: WhatsApp-parity inbox waves (media previews + emoji picker + scroll-FAB/divider/grouping/localized dates/lightbox/in-thread search/quote-jump/keyboard nav/bulk ops/cursor pagination/memoized bubbles/accessible confirm) + AI trust killers (demo honesty with drift contract test, message copy, proposal DENY route, stop-keeps-partial, settings deep-link) + AI parity (tool-card args, history search, IME guard). **Wave 10 continuation (2026-09-02, resumed session)**: INB-30 + AI-25 executed to source on the same PR — assignment-UI copy (13 labels + 5 activity strings) migrated verbatim into the locale authority ×3 with `common.refresh` reuse, and the unconfigured AI start surface now explains its capabilities (seller-owned-key truth + settings deep-link) while all 37 dead legacy `ai.*` locale keys are retired (parity 2826×3); 130/130 + 174/174 targeted tests green in fresh sandboxes. Durable handoff: issue **#388**.

- **Waves 11–15 continuation (2026-09-02, resumed session, Founder directive "complete all the work professionally and flawlessly then make the update")**: the remaining un-gated ledger rows PLUS the authorized schema wave were executed to source on PR #387 — INB-24 (WhatsApp voice gestures: hold-to-record, slide-up lock, slide-to-cancel, review-before-send through the shared player; contract revised with disposition), AI-21 (visual screenshot extraction bridged to the composer: shared bounded schema, sniffed bytes, consent+rate gates, review-first draft insert, never auto-sends), INB-16 (link previews with SSRF discipline and honest absence), AI-26 (truthful provider signal: done-event `signal` from the provider's own usageMetadata + served model, malformed shapes dropped, cost estimation still forbidden; the blanket no-usage contract deliberately superseded), INB-28 (one media-send factory + spec table replacing four ~200-line copies), INB-11 (render-window virtualization, bottom-anchored with scroll-true anchoring and jump expansion), AI-13 + INB-12 (authorized schema wave: additive `AiMessageFeedback` table and Conversation pin/mute/archive columns with hand-written migrations, gated routes, queue UI). B5/D1 still convert ONLY on Founder-installed observation.

- **Release train FROZEN by Founder directive (2026-09-02)**: "we are not making the next release yet, there is more problems and things i don't like and are not top tier class AAA in the app". **SUPERSEDED the same day (2026-09-02)**: the Founder directive "complete all the work professionally and flawlessly then make the update" closed the quality line and authorized the Internal.33/FD-056 update.
- Protected `main` at the AAA-line handoff: #382 `bff3d13…` (browserslist 4.28.8 override pin, red-gate unblock), #379 `e9eee78…` (D1 round 3: probe verifies thinking-model 200s + names transport causes), #381 `c4e5621…` (round-3 ledger record), #380 `c8f8be3…` (B5 round 3: self-diagnosing delete — shape verdict in body + client pre-flight), #383 `4579e69…` (UI AAA batch: localized errors everywhere, truthful delete contracts, i18n authority restored — audit F1–F7+F14–F26), #385 `95dd9d3…` (inbox AAA batch: F8–F13 + double-submit guard + notFoundIds client half), #384 `420b379…` (API AAA contract batch: every non-2xx carries a code, no internal leaks, races closed — audit S1-1..4+S2-5..12+S3-13..24). Live GitHub wins if moved.
- Two parallel read-only AAA audits (file:line-cited): 26 UI findings + 25 API findings; ALL assigned to the batch line above — none parked. Exact rows: `operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md` (release-freeze quality line section).
- Internal.31 was **installed in place by the Founder** (2026-09-01); its campaign re-verified the FD-051 repairs and produced the bounded round-2 findings above. Exact rows: `operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md` (round-2 section).
- FD-054 recorded (demo data loads alongside real seller data; removal deletes only the demo-tagged graph and fails closed with `DEMO_REMOVAL_BLOCKED_BY_REFERENCES`).
- **Internal.33 / FD-056 published**: the Founder directive 2026-09-02 lifted the freeze after the triage quality line closed; PR #387 merged by squash `1cb5cef7…` (29 commits; tree `c06bd9ed…` identical to reviewed head `92c35bc…`); release PR #389 merged by squash `cc081c86…`, dispatcher `33704527056`, signed publication `33704536249` (success), observer `33704547389` (success), release tag `sahelflow-v1.0.0-internal.33-cc081c8687a17620c8bd0d9c4bb416da71fdb3f5`, published MSI digest `sha256:16a8ce71e2694671cfe267d6fde84635973e254ae0fd1fc25d35fc6662afafe2`, `latest.json` published 2026-09-03T02:00:42Z. Certification cited product head `92c35bc…` (CI `33699338361`, Phase 5 `33699338132`, Phase 6-7 `33699338129`). The prior Internal.32/FD-055 publication (tag `sahelflow-v1.0.0-internal.32-677dc463…`, digest `sha256:34417299…`) and its installed round-3 campaign remain recorded in `operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md`.
- **Current version authority: app `1.0.0-internal.36`; MSI `1.0.0.36`; authority FD-059; mode `founder-offline-only`** (published 2026-09-08; pinned across package.json / sahelflow.version.json / tauri.conf.json / Cargo.toml / build.rs / sf-version.ts / install-founder-windows.ps1). **Installed truth is NOT the same as this:** neither Internal.35 nor Internal.36 has a recorded installed observation, so the latest recorded Founder-installed checkpoint remains **Internal.34 / FD-057**. Known unresolved contradiction: `operations/TRANSFORMATION_REGISTER.md` asserts a Founder-installed Internal.36 in its header while this file still lists the in-place update as the next Founder action — both cannot be true; this file stays conservative (no installed claim) and only the Founder, who owns the observation, can close it.
- Release PR #368 (squash `38c95aa8…`); reviewed release head `a1b4d56e5f723bbd3cacae104939ba668998e38b`; the full Required battery passed on the exact head (21 checks: 20 success / 1 skipped / 0 failed, including installed-MSI evidence) — certification cited product head `569e921…` (tree-identical to `f0fca29…`; CI `33368228685`, Phase 5 `33368228409`, Phase 6-7 `33368228448`).
- Release PR #357; reviewed release head `aa4a632a9269ac2318bbf414611cf0e75cb97f5c`; the full Required battery passed on the exact head (21 checks: 20 success / 1 skipped / 0 failed, including installed-MSI evidence) — certification cited product head `40f53860` (tree-identical to squash `14c059b7`; CI `33287186297`, Phase 5 `33287186245`, Phase 6-7 `33287186170`).
- Internal.29's certification cited corpus head `4921f34eb87369384d7cd09d92064a69b11cbac9` (CI `33207445430`, Phase 5 `33207445134`, Phase 6-7 `33207445070`), the last product-tree change before the documentation-only #343.
- Dispatcher `33373167723`; signed updater/publication `33373176435`; release observer `33373187695` — all success. Internal.30's `33292273959`/`33292278832`/`33292285084` and Internal.29's `33212635887`/`33212648778`/`33212661580` remain retained evidence.
- Internal.31 updater artifact digest `sha256:f4e5abbd13c080080f7bdb88345df9b84ee1d7ee0bb1c7fce320fab490729297`; release tag `sahelflow-v1.0.0-internal.31-38c95aa8f5e1f3d44326c727efd0d8fd54cba20a` (verified pointing at the merged release commit). Internal.30 MSI digest `sha256:bef15026fc3f7394f2b10d15a809229418c585191509c78941a27461fbc8210e`; release tag `sahelflow-v1.0.0-internal.30-2eb8a33749118e233240019bf2df9a47d586a04d`; Internal.29 digest `sha256:c3afdadc8a3f457826f37bd45084d2647a65d9a79f51b71d0d68f86d068aa50f` retained.
- #221 closed/completed after Founder acceptance of installed Internal.24.
- #226 closed/completed; retain its budgets.
- #306 open — real-phone WhatsApp installed/provider certification; the published successor is awaiting the in-place update.
- #316 open — Class-AAA durable Notification Center (PR #319) is packaged in published Internal.30; installed/native/real-phone evidence is pending.
- #317 open — professional WhatsApp Inbox parity is source-complete and packaged in published Internal.30; installed/real-phone evidence is pending.
- #230 open/reopened P1 — customer-online trial/network blocker; no owned production domain.
- #164 open.
- FRC-2 is source-complete: capability ledger + frozen corpus `frc2-1.0.0` (#342/#343) merged; live-key, installed-observation and T470 rows remain external-blocked in the AI ledger.
- FD-051 installed campaign evidence (Founder, 2026-08-31): R1/R2/R7/R8/R10/R12 passed on installed Internal.30; automatic no-refresh inbound, reopen persistence and governed status passed (logout row stays LAST); R3/R4/R5/R6 reproduced → repaired by #362–#365 above; D1 region claim corrected (Algeria IS on Google's available-regions list; the probe error was the sandbox's own egress; relay parked); D2 acknowledged-by-directive; R11 (FRC-2 key lifecycle) gated on Internal.31 via #363. Exact rows: `operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md`.
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
- Do not logout, reset AppData or clear protected auth before the current
  repair line is installed in place and re-proves the B5/D1 rows, the
  applicable FRC-2 rows (R11) and the remaining FRC-1 rows.

## Exact next-session order

Protected `main` carries the Internal.36 release authority plus the merged
transformation delta (#414, #416). No implementation PR is blocking except the
open docs #415 and STR-01 slice #418. Remaining order:

1. Re-resolve protected `main`, open PRs and #164/#230/#306/#316/#317. The
   Internal.32–Internal.36 campaigns stay open except the logout row; sidecar
   rows (INB-13/14/19/32) stay BLOCKED. The UI/UX triage ledger has zero open
   source rows after the INB-27 merge.
2. The Founder applies the in-place Internal.36 update through the normal
   updater (no logout, no AppData reset, no protected-auth clearing) and runs
   the FD-058 campaign once on that installed candidate. Publication alone
   converts nothing.
3. On that installed build: convert F-04..F-13 on Founder observation (delete
   works including 69-char ids; AI chat streams instead of the dead-end copy;
   queue header/select toolbar hold at narrow widths; the AI agents page
   presents capability truth, workforce groups, real shop counts and the
   shop-wide approval loop; notifications show-all behaves) AND re-verify the
   wave rows — INB-24 voice gestures (hold-to-record, slide lock/cancel,
   review-before-send), AI-21 composer screenshot extraction (consent-gated,
   review-first, never auto-sends), INB-16 link previews, AI-26 truthful turn
   signals (real usage metadata only), INB-28 unified media sends, INB-11
   virtualized list behavior, AI-13 thumbs feedback, INB-12 pin/mute/archive
   — plus the D3 six-wave observations; B5/D1 convert on this observation.
4. Record results in `operations/UI_UX_TRIAGE_LEDGER.md`,
   `operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md`,
   `operations/WHATSAPP_INBOX_CAPABILITY_LEDGER.md` and current-state
   documentation; convert rows only where installed evidence exists. A named
   root that is not yet repaired opens exactly one bounded micro-repair —
   nothing else moves. Resolve the installed-Internal.36 contradiction between
   this file and `operations/TRANSFORMATION_REGISTER.md` from the observation.
5. Founder-side preconditions: rotate the chat-transited GitHub PAT, and
   record the SEC-01 VEX disposition for `GHSA-p293-qw3h-jr36`.
6. Execute the retained #306 logout row LAST (only after every other row is
   green), then resume FRC-3 (Required capability/journey assurance ledger)
   in dependency order; preserve external blockers.
7. Source-level transformation work may proceed in parallel at any time under
   `operations/TRANSFORMATION_REGISTER.md` — next owed: the third STR-01 slice
   to bring `ai-decision-canvas.tsx` under 400 lines, then TEST-01 (P0),
   L10N-01, STR-02/STR-03 and SYS-04. It never converts an installed row and
   is never presented as campaign progress.

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
  The exact signed successor (Internal.36) must be installed in place with
  state preserved to re-verify the affected rows, the six-wave first
  observations (D3), the applicable FRC-2 rows (R11) and the remaining FRC-1
  rows.
- Real Gemini minimal inference requires a seller-owned key; free-tier work uses synthetic/redacted inputs only.
- Commerce requires development/test environments and HTTPS ingress for webhook tests.
- Courier live certification requires provider sandbox/demo or authorized seller credentials.
- #230 requires an owned production domain and representative Algerian-network evidence; `workers.dev` is development-only for this authority.
- This sandbox cannot run `bun`, `vitest` or a full-project `tsc` (the project-wide type check needs >3GB heap). Hosted GitHub Actions is the ONLY complete gate; verify locally with import-graph tsc plus targeted suites where a local runtime exists.

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
- No customer-online/Beta/Stable claim from any Founder-offline internal checkpoint.
- No first customer as an undisclosed experiment.
- Use selected Level 1/2/3 gates and expected-head merge for any repair.
- Never open a pull request against anything but `main`: CI triggers only on `pull_request` with `branches: [main]`, so a stacked PR is unverifiable and must be replayed onto `main`.
- Never push a second slice to a branch whose CI run is still in flight: `cancel-in-progress: true` discards it.

## Hard non-claims

- Internal.36 (FD-059) is signed and published but has **no recorded installed
  observation**; Internal.35 has none either. The latest recorded
  Founder-installed checkpoint is Internal.34 / FD-057. The merged repair and
  transformation lines on protected `main` are source evidence only. Installed
  conversion of the rows happens on the next installed observation.
  Internal.30's FD-051 campaign rows R1/R2/R7/R8/R10/R12 and the retained #306
  rows passed; the logout row executes LAST.
- Complete AI/tools/order-extraction certification is open; the FRC-2 source
  frontier is frozen and packaged, while live-key, installed-observation and
  T470 rows remain external-blocked.
- Class-AAA Notifications and professional WhatsApp message/media parity are open.
- Public commerce/courier live certification is not established by adapter source alone.
- Customer-online trial readiness remains open under #230.
- The transformation program's row states are source claims only; no STR/TEST/L10N/SYS row implies installed, provider or customer evidence.
- First paid assisted deployment is not yet authorized.
- Beta is not established.
- Stable is not established.
