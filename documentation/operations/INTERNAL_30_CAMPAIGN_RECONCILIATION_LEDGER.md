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
| R3 | B3 — outbound document/audio local ready state with coded outbox errors | reproduced → repaired on main (#362); re-verification rides Internal.31 |
| R4 | B4 — in-composer voice recording through the WebM→OGG remux path (Opus TOC exact) | reproduced → mic confirmed alive at driver/BIOS; distinct-cause diagnostics + `DOMException.name` logging landed (#365); suspected layer is Windows Settings > Privacy > Microphone > "Let desktop apps access"; re-verification with named-cause copy rides Internal.31 |
| R5 | B5 — permanent chat deletion with no resurrection | reproduced → repaired on main (#364, coded `INVALID_DELETE_REQUEST` + shape logging); re-verification rides Internal.31 |
| R6 | D1 — AI-key action resume after PIN with localized coded errors | reproduced → root cause pinned: the `AIza`-prefix gate rejected the new Google AI Studio key format (Founder key AUTHENTICATED against Google — auth passed, not a quota/billing/region verdict on the key itself); repaired on main (#363: accepts legacy `AIza` and new AI Studio formats, live probe stays the validator, `GEMINI_LOCATION_UNSUPPORTED` mapping added); re-verification rides Internal.31 |
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
