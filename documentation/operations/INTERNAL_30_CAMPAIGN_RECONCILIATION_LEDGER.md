# Internal.30 installed-campaign reconciliation ledger

> **Status:** Active FD-051 campaign reconciliation ledger
> **Scope:** Exact reconciliation between the latest signed/published package (Internal.30) and protected `main` after the PR #359 merge, plus the installed-campaign re-verification rows the Founder executes
> **Snapshot date:** 2026-08-31
> **Published side:** Internal.30 / FD-051 — release PR #357, source `2eb8a33749118e233240019bf2df9a47d586a04d`, tag `sahelflow-v1.0.0-internal.30-2eb8a33749118e233240019bf2df9a47d586a04d`, MSI digest `sha256:bef15026fc3f7394f2b10d15a809229418c585191509c78941a27461fbc8210e` (Founder installation pending; Internal.29 remains latest installed)
> **Protected-main side:** `324719ff999565967e2939a5eacc82539ae86cbc` — PR #359 squash-merge (branch head `e468adca11df286907bf3b54895e657a213d6e2c`, 21/21 checks green) on top of docs-only #358/#360
> **Disposition authority:** Founder directive 2026-08-31 (option B): repair PR #359's two gate blockers in-branch, land it green, merge, then run the Internal.30 checklist. This directive set the merge timing; FD-051's evidence rules remain fully binding.

## Why this ledger exists

Internal.30 was published from source `2eb8a337…` while protected `main` still equaled it. The Founder then directed PR #359 (frontend Class-AAA remediation, six waves) to be repaired in-branch and merged. Protected `main` and the published package have therefore diverged for the first time in this campaign. Every installed-evidence statement made during the FD-051 campaign applies to the **published Internal.30 package**, not to the current `main` tree; every source statement applies to **main `324719ff…`**, not to the package. This ledger keeps both sides exactly reconciled so the next package candidate is cut from a precise delta and no evidence claim crosses the boundary.

## Baseline pairs

| Side | Ref | Tree content |
|---|---|---|
| Latest signed/published package | Internal.30 / `1.0.0-internal.30` / MSI `1.0.0.30` | source `2eb8a337…` (FD-050 repair line #346–#353 + deep-audit register #355); NOT containing PR #359 |
| Latest Founder-installed checkpoint | Internal.29 / `1.0.0-internal.29` | source `a34917e5…`; retains retained-publication facts (dispatcher `33212635887`, signed run `33212648778`, observer `33212661580`, digest `sha256:c3afdadc…`) |
| Protected `main` | `324719ff…` | Internal.30 source + docs-only #358 (`2f9847ea…`) + docs-only #360 (`3c61cffc…`) + PR #359 six waves |

## Exact delta: `2eb8a337… → 324719ff…`

| Commit | PR | Class | Content |
|---|---|---|---|
| `2f9847ea…` | #358 | docs-only | reconcile active authority to published Internal.30 / FD-051 truth |
| `3c61cffc…` | #360 | docs-only | reconcile agent entrypoints (root README, AGENTS.md, Working Memory next-session) to Internal.30 / FD-051 truth |
| `324719ff…` | #359 | source | frontend Class-AAA remediation, six waves (squash of branch head `e468adca…`) |

Volume: 251 files changed, +24,544 / −8,430. Distribution: 231 under `src/`, 7 under `documentation/`, 5 root, 5 under `data/`, 1 `e2e/`, 1 `scripts/`, 1 `src-tauri/`. Deleted files: 11 (dead-code waves, zero remaining importers, verified at audit).

### The six waves (PR #359)

| Wave | Content |
|---|---|
| W1 | phone-number bidi isolation (`src/lib/validation/phone.ts`), CSS token authority (−368 lines of duplicated tokens), notification-center workspace refactor, ~5,000-line dead-code removal (11 files) |
| W2 | list enhancements: URL-persisted filters, CSV export (OWASP formula-injection guard, RFC4180 quoting, UTF-8 BOM, server-side ≤5k cap), confirmation queue, async combobox |
| W3 | single order lifecycle rail (replaces per-status action cards; governed Confirm became single-click with direct stock deduction), A5 delivery note, wa.me deep links (0→213 normalization) |
| W4 | onboarding wizard + keyboard command palette |
| W5 | `e.code` keyboard shortcuts (Arabic-keyboard safe), WCAG AA contrast contract tests (real luminance/OKLab math), server-locale truth, voice-note player |
| W6 | hover tokens + feedback semantics |

### Gate repairs merged inside #359 (both PR-authored surfaces)

- `scripts/verify-installed-windows-ui.ps1` — the PR's original anonymous server-locale HTTP probe could never pass the installed runtime boundary (`src/proxy.ts` answers 401 `RUNTIME_SESSION_REQUIRED` to anonymous page requests whenever `SF_RUNTIME_APP_TOKEN` is set, and the single-consumption bootstrap handshake cannot be replayed from outside the app). Replaced by `Assert-InstalledServerLocaleDictionaries`: a filesystem proof at the exact runtime-resolved standalone path (`<installRoot>\standalone\src\lib\i18n\locales\<locale>.json`), byte-comparing metadata against the exact-head repository dictionaries with dotted-key rejection, Arabic-script and FR/EN distinctness checks; evidence recorded per launch as `serverLocaleDictionaries`.
- `e2e/phase6-7-completion.spec.ts` — governed-confirm browser evidence aligned to the rail authority model: single-click commit asserted through the post-commit action surface (confirm action consumed, "Mark packed" becomes the available next action); the former `alertdialog` and canonical-fulfillment-badge assertions were stale after Wave 3 and were removed with the UX they described.

### Non-`src` files in the delta (complete list)

`.sahelflow-test-sandbox`; `AGENTS.md`; `README.md`; `next.config.ts`; `playwright.config.ts`; `data/shop-registry.json`; `data/system/connected-installation-authority-v2.json`; `data/system/connected-installation-authority-v2.lock`; `data/system/identity-authority.initialized.json`; `data/system/identity-authority.json`; `documentation/README.md`; `documentation/operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md`; `documentation/operations/WHATSAPP_INBOX_CAPABILITY_LEDGER.md`; `documentation/operations/WORKFLOW.md`; `documentation/operations/WORKING_MEMORY.md`; `documentation/system/CURRENT_STATE.md`; `documentation/system/ROADMAP.md`; `e2e/phase6-7-completion.spec.ts`; `scripts/verify-installed-windows-ui.ps1`; `src-tauri/build-frontend.ts`.

## Installed-campaign re-verification rows (Founder executes on installed Internal.30)

These rows execute on the **published Internal.30 package**, exactly as ordered in `operations/WORKING_MEMORY.md` "Exact next-session order" steps 2–4. State vocabulary: `pending` / `passed` / `reproduced` (defect observed) / `blocked`. Rows convert only on the Founder's installed observation; source/CI confidence never converts them.

| Row | Campaign item (per Working Memory steps 2–4) | State |
|---|---|---|
| R1 | In-place Internal.30 update through the normal updater with installation, shop and WhatsApp state preserved (no logout, no AppData reset) | passed (Founder, 2026-08-31) |
| R2 | B1/B2 — quote chips persist across chat switches and restarts | passed (Founder, 2026-08-31) |
| R3 | B3 — outbound document/audio local ready state with coded outbox errors | reproduced → repaired on main (#362); re-verified on installed Internal.31 (2026-09-01): the rejection SURFACING chain was still lossy — the sidecar's named failing rule and the durable-effect pipeline discarded the reason before display — repaired on main (#372); final re-verification rides Internal.32 |
| R4 | B4 — in-composer voice recording through the WebM→OGG remux path (Opus TOC exact) | reproduced → mic confirmed alive at driver/BIOS; distinct-cause diagnostics landed (#365); re-verified on installed Internal.31 (2026-09-01): the raw `DOMException.name` was still dropped from the named-cause banner — repaired on main (#370); final re-verification rides Internal.32 |
| R5 | B5 — permanent chat deletion with no resurrection | reproduced → repaired on main (#364, coded `INVALID_DELETE_REQUEST` + shape logging); re-verified on installed Internal.31 (2026-09-01): server-side shapes are now fully coded (#371) but the client still discarded the server's human-readable rejection reason (dead-end `(HTTP_400)` toast) — repaired on main (#375); final re-verification rides Internal.32 |
| R6 | D1 — AI-key action resume after PIN with localized coded errors | reproduced → root cause pinned: the `AIza`-prefix gate rejected the new Google AI Studio key format (Founder key AUTHENTICATED against Google); repaired on main (#363); re-verified on installed Internal.31 (2026-09-01) as a FOUR-round causal chain, each round proven against the SAME valid key: (1) format gate (#363), (2) PII-free probe diagnostics + truthful settings display, (3) the `x-goog-api-key` header carriage rejected the new-format `AQ.` key that Google's own `?key=` parameter accepts → every Gemini call now carries the key as the URL-encoded `?key=` parameter (#373), (4) verify-then-store boundary: a whitespace-padded key passed verify then crashed `setSecret`'s no-whitespace invariant → the save schema now trims/bounds/rejects control bytes so verify and storage observe the same clean string (#373). Final re-verification rides Internal.32 |
| R7 | Delivery-receipt enum truth on a real outbound | passed (Founder, 2026-08-31): sent/delivered/read states observed on a real outbound through the truthful #350 mapper on installed Internal.30 |
| R8 | C1 — sleep/wake auto-receive (60s watchdog, 1:1 JID ingress scoping) | passed (Founder, 2026-08-31): inbox recovered on its own after sleep/wake with no manual reconnect; no broadcast/status pollution observed |
| R9 | Retained #306 rows — automatic no-refresh inbound, reopen persistence, governed status, logout last | passed for automatic no-refresh inbound, reopen persistence and governed status (Founder, 2026-08-31); **logout row remains pending and stays LAST** until the Internal.31 campaign closes |
| R10 | Deep-audit register's audit-affected rows (order PATCH money lock, refund/stock/COD truth, wilaya canonicalization, redaction authority) | passed (Founder, 2026-08-31) |
| R11 | FRC-2 Founder-performable rows — key lifecycle in Settings → AI, one reviewed extraction to exactly-one canonical order, one proposal approval/replay observation | pending — key lifecycle is gated by the R6 repair (#363) and becomes performable on Internal.31; extraction/proposal rows ride the same package |
| R12 | Applicable #316/#317 native rows on the installed build | passed (Founder, 2026-08-31) |

## Campaign repair line (reproduced failures → bounded repairs, merged 2026-08-31)

One bounded repair root per reproduced failure, per Working Memory step 6. All five merged to protected `main` by squash with expected-head discipline, each head green on the full Required battery:

| PR | Root | Squash on main |
|---|---|---|
| #362 | B3 — sidecar Bun multipart parse dropped part Content-Type → `File.type=""` failed the outbound allowlist for ALL media types; explicit `mimeType` form field now carried and validated on all four media senders + pure `outbound-media-mime.ts` helper with tests | `f39ad83666490b6dc2dfb95f7e89b01d78ab005f` |
| #363 | D1 — Gemini key-format gate; `verifyGeminiKey` accepts legacy `AIza` + new AI Studio formats; live probe stays the validator; `GEMINI_LOCATION_UNSUPPORTED` coded mapping ("key is valid, Google does not allow Gemini from your country/region") for the per-network egress condition | `60bfba6520e29f033c817499d0111118457b85b8` |
| #364 | B5 — chat-delete validation rejections now coded `INVALID_DELETE_REQUEST` with PII-free shape logging + `@lid`-source integration test | `5f00c54` |
| #365 | B4 — `getUserMedia` rejections mapped to three distinct localized causes (permission / no device / generic) + always-on `DOMException.name` logging, ar/fr/en | `851b94d` |
| #366 | FD-052 option A — demo coexists with real operations: blanket `DEMO_MUTATION_BLOCKED` freeze removed, courier effect boundary narrowed to `assertNonDemoCourierIdentity` at the four real-effect entries; demo- id tagging intact; demo removal still blocks once seller state exists (one-way door; removal-strategy decision candidate for a future FD) | `f0fca29` |

Two test-infrastructure latency repairs rode the affected heads (both reds reproduced in CI full gates, neither an assertion failure, neither a product change): (1) governed-confirm e2e pinned `not.toBeEnabled()` (action contract) instead of refresh-latency-coupled `toBeHidden()`; (2) the demo clock-normalizer rebase test received an explicit 90s budget after its second documented 15s timeout (first occurrence recorded in the #359 D1 row).

### D1 region correction (evidence discipline)

The earlier statement "Gemini free tier is geo-blocked from Algeria; Algeria not included in the available-regions list" was **overturned by live re-verification** (2026-08-31, `ai.google.dev/gemini-api/docs/available-regions` fetched directly): Algeria IS on the official available-regions list and no free-tier regional carve-out applies. The FAILED_PRECONDITION "User location is not supported" observed during the sandbox live probe came from the **sandbox's own egress location**, not from the key (auth passed) and not from any Algeria policy. A region-pinned relay (Cloudflare AI Gateway / Vertex / reseller) is therefore **parked**: no evidence currently justifies building it; the runtime `GEMINI_LOCATION_UNSUPPORTED` mapping remains as the per-network safety net (fires only if a specific seller's egress actually exits an unsupported region, e.g. VPN).

## Internal.31 installed campaign — round 2 (2026-09-01)

The Founder installed Internal.31 in place through the normal updater
(preserving installation/shop/WhatsApp state) and executed its campaign.
The round-1 repairs packaged in Internal.31 behaved; the campaign exposed a
bounded round-2 class: several failure paths still discarded the decisive
diagnostic BEFORE the operator (the sidecar named its failing rule but the
effect pipeline dropped it; the mic banner dropped the raw `DOMException.name`;
the chat-delete client dropped the server's human-readable reason; the Gemini
auth carriage rejected the valid new-format key that Google's own documented
parameter accepts). One Founder product decision also landed.

Round-2 repair line (one bounded root per finding, adversarially reviewed
without the external Codex reviewer, every head green on the Required PR gate,
squash-merged with expected-head discipline):

| PR | Root | Squash on main |
|---|---|---|
| #370 | R4/B4 round 2 — raw mic `DOMException.name` surfaced in named-cause voice banners | `d63660f` |
| #371 | B5 round 2 — the two anonymous shape-level 400 branches coded (`REQUEST_VALIDATION_FAILED` / `INVALID_REQUEST_JSON`) so every 400 body carries both `code` and a readable message | `401b5a8` |
| #372 | B3 round 2+3 — every document-send rejection names its own machine-readable `reason` in the sidecar; `SidecarRequestError` carries `reason`; `failureDisposition` composes `code:reason` into `lastErrorCode` so the installed UI shows WHICH rule failed; real-sidecar probe matrix proves every realistic composer shape passes validation | `9e8b6d1` |
| #373 | D1 rounds 2–4 — PII-free probe diagnostics + truthful settings display; the documented `?key=` query-parameter carriage replaces the header (new-format `AQ.` keys are the demonstrated header-failure class); verify-then-store boundary trims/bounds/rejects control bytes so a pasted whitespace-padded key can never again pass verify then crash `setSecret` | `c8529fe` |
| #374 | FD-054 — Founder directive 2026-09-01 ("yes i want the demo data even if there is real data there"): demo workspace loads alongside real seller data; removal deletes only the demo-tagged/derived graph and fails closed with coded 409 `DEMO_REMOVAL_BLOCKED_BY_REFERENCES` on enforced real→demo foreign keys; supersedes FD-052's empty-shop-only boundary and resolves its deferred removal one-way-door | `af6e070` |
| #375 | B5 round 2 (client) — `DeleteChatsOutcome` carries `errorDetail`; the confirm dialog + toast show the server reason + code in en/fr/ar | `43a2386` |

Housekeeping recorded on #373: the Founder's Gemini key was visible in a
screenshot URL bar — rotate it after verification.

The Internal.32 signed successor (FD-055) packages this round-2 line. Its
installed campaign re-verifies the affected rows (R3/R4/R5/R6 surfacing
behavior, R11 FRC-2 key lifecycle now performable end-to-end, D3 six-wave
first observations if not yet recorded on Internal.31), with the retained
#306 logout row LAST.

## Internal.32 installed campaign — round 3 (2026-09-02)

The Founder installed Internal.32 in place through the normal updater
(preserving installation/shop/WhatsApp state) and executed its campaign,
providing installed screenshots as evidence. Founder verdict: B3 and B4 now
pass; B5 and D1 remain reproduced; the remaining re-verified rows behaved.
The #306 logout row was correctly NOT executed (it stays LAST).

| Row | Item | State (round 3) |
|---|---|---|
| R1 (equiv) | In-place Internal.32 update, state preserved | passed (Founder, 2026-09-02) |
| R3 | B3 — document/audio local ready + named rejections | **passed**: outbound PDF shows the verified-before-open local-ready state; audio ready (Founder screenshot) |
| R4 | B4 — voice recording through the WebM→OGG remux | **passed**: voice note recorded and playable in-thread (Founder screenshot) |
| R5 | B5 — permanent chat deletion | **reproduced (round 3)**: server still rejects with `INVALID_DELETE_REQUEST`; the round-2 surfacing repair works (dialog + toast show the reason + code) — the remaining opacity is the SHAPE verdict (which schema path / id count / id lengths), which only reached a server log line that installed builds cannot show (runtime stderr suppressed by native containment) |
| R6 | D1 — AI-key test/save | **reproduced (round 5 of the chain)**: valid-format `AQ.` key (53 chars) now passes the format gate and the `?key=` carriage reaches Google (auth layers fixed in rounds 1–4), but the probe answers «Gemini غير متاح مؤقتًا / فحص: HTTP n/a — المفتاح: AQ…، 53 حرفًا» — the no-visible-text branch of `verifyGeminiKey`: Google returned **200** and the thinking model spent the 8-token visible budget on internal thought (`finishReason: MAX_TOKENS`, empty visible parts), misread as "provider unavailable" |
| R11 | FRC-2 Founder rows | pending — key lifecycle is gated by the D1 probe above; extraction/proposal rows ride the same package |
| D3 | #359 six-wave first installed observations | passed per Founder verdict ("the others are good"); formal ledger rows recorded with this round |
| R9 (logout) | Retained #306 logout row | still pending, stays LAST |

Round-3 causal findings (both pinned to exact code paths this time, not
surfacing-only):

1. **D1 root**: `verifyGeminiKey` treated every 200 body without visible text
   as `GEMINI_PROVIDER_UNAVAILABLE` with no HTTP status — the anonymous
   «HTTP n/a» signature. A thinking-model response with a candidate
   `finishReason` proves the key authenticated and the model generated; a
   non-JSON 200 (intercepting middlebox) was equally indistinguishable; a
   401 `UNAUTHENTICATED` verdict mapped to "provider unavailable"; and
   transport failures discarded `error.cause` (DNS/TLS/proxy/reset named
   only in Node internals).
2. **B5 root (observability)**: the delete request contract is verifiably
   correct for canonical conversation ids (client sends `{ids:[cuid]}`;
   tests pass at domain and route level; the failure reproduced across
   Internal.29/30/31/32). The decisive shape evidence (failing schema path,
   id count/lengths) was written only to a log line that installed builds
   suppress. Candidate root classes: a selection id violating the 1..64
   contract (e.g. a deep-link pinned row carries ids up to 160 chars while
   the server contract allows 64) or an environment-level body difference.

Round-3 repair line (one bounded root per finding; branches opened for the
campaign's audit/review/merge discipline):

| Branch | Root |
|---|---|
| `fix/campaign-r3-d1-transport-named-causes` | D1 — probe verifies any 200 with a candidate `finishReason` (incl. MAX_TOKENS), names blockReason/jsonParseFailed shapes, maps 401 UNAUTHENTICATED to the key verdict, raises the probe budget 8→256, and carries a PII-free named transport cause (`error.cause` code + localized dns/tls/blocked/reset/timeout family) through diagnostics and the settings panel; per-attempt logs record `transportCode` |
| `fix/campaign-r3-b5-self-diagnosing-delete` | B5 — the delete route's 400s carry the shape verdict (reason, schema paths, id count/lengths, body size) in the response body; the client pre-flights the exact contract (naming offending id lengths locally, e.g. the deep-link 160-vs-64 class) and renders the verdict in the dialog + toast (en/fr/ar) |

Expected conversions on the next installed observation: D1's probe either
verifies the founder's valid key outright (thinking-budget root) or names
the exact transport/response cause; B5's dialog shows the exact failing
schema condition (or the local contract violation names the offending id
before any request). Either outcome closes its row or opens the next
bounded micro-repair with the root named.

Housekeeping remains open: rotate the Founder's Gemini key (screenshot-
exposed per #373) — rotate BEFORE the next D1 verification.

## Release-freeze quality line — AAA batches (2026-09-02)

Founder directive (2026-09-02), after the installed round-3 verdict: the
next release is NOT cut yet — "there is more problems and things i don't
like and are not top tier class AAA in the app". The release train is
FROZEN: no Internal.33 authority, no tag, no publication. Protected
`main` accumulates source-quality work only, and the Founder's own
findings list arrives next session as the second input to one triage
ledger.

### Red-gate repair (round-3 PRs to green)

| PR | Blocker | Repair |
|---|---|---|
| #380 (B5) + all code PRs | `bun audit --production` failed on fresh browserslist advisories GHSA-c83g-rgw3-j3cx / GHSA-73wf-gq98-2v4g (2 high, transitive via `@babel/core`) | #382 pinned `browserslist` 4.28.8 through the existing overrides block (squash `bff3d13…`) |
| #379 (D1) | `sf-verify` single TS error: `provider-verify.test.ts` helper typed `code?: string` vs `GeminiTransportCause.code: string \| null` | helper widened on-branch, rebased onto `bff3d13…`, all lanes green → squash `e9eee78…` |
| #380 (B5) | (after #382/#379) stale base | rebased, all lanes green → squash `c8f8be3…` |
| #381 (docs) | stale base | rebased, green → squash `c4e5621…` |

### AAA source-quality audits (read-only, file:line-cited)

Two parallel sweeps of protected `main` at the round-3 state:

- **UI audit**: 26 findings (S1=4, S2=11, S3=11) — raw i18n keys at five
  surfaces, `translateServerError` wired into only 10/46 toast files,
  contradictory delete contracts + dead pending spinner (missing
  `preventDefault`), `window.confirm` where `ConfirmDialog` exists,
  inbox search failing silently as "no results", non-URL-persisted
  inbox filters, demo panel carrying 112 lines of inline copy outside
  the i18n authority. i18n key parity itself was perfect (2826×3).
- **API audit**: 25 findings (S1=4, S2=8, S3=12) — raw `new Error` 500s
  on wrong import file type, raw Prisma/SQLite text echoed per commit
  row, `error.message` leaked over SSE after the 200, sidecar REST
  token resolved once at module load (cold-start race permanently
  degrading to unauthenticated), uncoded English-prose auth bodies,
  three 403/429 dialects in one AI file, non-transactional multi-write
  in `integrations/connect`, uncoded storefront post-publish invariant,
  google-sheets export pulling full Order rows per batch. Structural
  verdict: handler coverage 178/185, zero N+1, all lists paginated —
  the debt is typological, not systemic.

### AAA batch line (all merged under Required-battery green + expected-head squash discipline)

| PR | Scope |
|---|---|
| #383 `4579e69…` | UI polish batch (33 files +2 new): localized errors at every audited surface (translator adopted across the remaining toast/error files), truthful delete contracts (order delete rewritten to the soft-delete + undo contract, `preventDefault` fixed, copy unified), i18n authority restored (all raw keys; parity 2834×3), destructive `alert-dialog` variant, danger-zone type-to-confirm, demo panel migrated to the dictionaries, `ConfirmDialog` swap, locale-stable rejection reasons. Implements audit F1–F7 + F14–F26 |
| #385 `95dd9d3…` | Inbox polish batch: delete errors through the translator (F8), retryable search-error row (F9), URL-persisted desk filters via nuqs (F10), ticking timestamps on a shared cadence (F11), segmented workflow pills (F12), theme-token priorities (F13), double-submit guard in `useUndoableDelete`, all-status pill disambiguated from the desk-queue All pill, `notFoundIds` client surfacing (S3-20 client half). 3 dictionary keys ×3 locales |
| #384 `420b379…` | API contract batch (40 files): every non-2xx carries a `code`, no internal leaks reach the client, mutation races closed. S1: import 415 `IMPORT_SOURCE_UNSUPPORTED` + coded per-row rejections via `codedRowError`, SSE failure events classified (`AI_INTERNAL_ERROR`), sidecar token lazy per-call with 401 retry. S2: coded auth family, extraction `AI_CONSENT_REQUIRED`/`AI_RATE_LIMITED` + bounded body, one 403/429 dialect, integrations row-first writes with compensating cleanup, coded 4xx pockets, `STOREFRONT_POST_PUBLISH_MISSING`, sheets export select-pruned to the 8 exported fields. S3: length/count caps, transactional CAS guard on order DELETE, no fabricated `createdAt`, `notFoundIds` (S3-20 server half). Follow-ups: shared import-engine coded rejections (products/customers/expenses), coded `auth/invitations/accept`, danger-zone confirm token accepts the shop name server-side (F19 alias, historical `RESET` still accepted). Implements audit S1-1..4 + S2-5..12 + S3-13..24 |

### Conversion status and residuals

- Round-3 B5/D1 source repairs are now **canonical on protected `main`**
  (self-diagnosing delete + transport-named D1 probe), together with the
  full AAA quality line. Installed conversion of the B5/D1 rows still
  requires: Founder rotates the screenshot-exposed Gemini key FIRST,
  then a signed successor under explicit release authority (FROZEN until
  the Founder's own quality list is triaged), installed in place with
  state preserved.
- The 26+25 audit findings are fully assigned to the batch line above;
  no finding is parked. Deferred CI-only residue: none open.
- The #306 logout row stays LAST; FRC-3 stays parked until the quality
  line + Founder's own list close.

## #359 delta rows (NOT part of the installed campaign)

These rows reconcile the source delta that rides protected `main` but is **not** inside the published Internal.30 package. They do not block or change the campaign above.

| Row | Item | State |
|---|---|---|
| D1 | CI on merge head `e468adca…`: all 21 checks green, including installed-MSI lanes and both Required gates; source diagnostics tsc/ESLint/Vitest 3482/3482. One documented flake: Quality Gate re-run (attempt 2) after a 15s Vitest timeout in `src/lib/demo/__tests__/algerian-demo-clock-normalizer.test.ts` — a file PR #359 never touched; flake did not reproduce. Update 2026-08-31: the same timeout signature recurred on the B4 diagnostics head (second occurrence) and received an explicit 90s budget in the repair line below | done 2026-08-31 |
| D2 | Governed Confirm lost its AlertDialog by design (single-click commit with direct stock deduction, authority expressed by action gating). This is a deliberate UX change awaiting explicit Founder acknowledgment | acknowledged-by-directive 2026-08-31 — the change was explicitly disclosed to the Founder with the campaign checklist; the Founder reported the listed rows pass and directed continuation to the next signed release without objection; a further one-line explicit confirmation remains welcome but is not blocking |
| D3 | Six-wave surfaces receive their first installed/Founder observation on the **next** signed package after Internal.30 (not on Internal.30 itself) | pending next package (Internal.31) |

## Reconciliation history

| Date | Event |
|---|---|
| 2026-08-31 | Ledger created. PR #359 repaired in-branch (two gate blockers: installed server-locale proof moved behind the runtime-session boundary; governed-confirm evidence aligned to the rail authority model), branch updated with main, 21/21 checks green at `e468adca…`, squash-merged with expected-head discipline → protected `main` `324719ff…`. Branch `agent/frontend-ux-remediation` deleted. Internal.30 publication facts unchanged; campaign rows above remain pending. |
| 2026-08-31 | FD-051 installed campaign executed on the Founder machine: R1/R2/R7/R8/R10/R12 passed; automatic no-refresh inbound, reopen persistence and governed status passed (logout row stays last); R3/R4/R5/R6 reproduced and root-caused. Repairs #362–#366 built per one-bounded-root discipline (each head green on the full Required battery; two documented CI-latency repairs rode affected heads) and squash-merged with expected-head discipline → protected `main` `f0fca29…`. D1 region claim corrected against Google's live available-regions page; relay options parked. D2 acknowledged-by-directive. Next signed package Internal.31 carries the repair line + the #359 six-wave delta; its installed campaign re-verifies R3–R6, R11 and D3, with logout last. |
| 2026-09-01 | Internal.31 installed in place by the Founder; its campaign produced the round-2 findings recorded above. Repairs #370–#375 merged to protected `main` per one-bounded-root discipline (adversarial review performed by the implementation agent without the external Codex reviewer; every head green on the Required PR gate; expected-head squash merges). FD-054 recorded in `documentation/product/DECISIONS.md` through #374. Next signed package Internal.32 / FD-055 carries the round-2 line; its installed campaign re-verifies the affected rows with logout LAST. |
