# SahelFlow v3 — Pre-Flight Checklist

> **Origin:** Derived from `AUDIT_FINDINGS_v2.md` (135 findings, B1-B13 / F1-F12 / S1-S18 / D1-D12 / W1-W22 / H1-H9 / T1-T12 / DOC1-9 / TD1-5 / M1-M20 / L1-L15).
> **Purpose:** The "lessons learned" that travel from v2 to v3. **Zero v2 code carries over** — but every mistake does. This is the contract that prevents us from re-shipping the same bugs in a new stack.
> **Scope:** Local-first Tauri + Next.js + Prisma/SQLite. Items that were web-app-specific (RLS, multi-tenant, server-side rate limits) are marked **N/A in v3** rather than removed, so the historical record stays complete.
> **Use:** Run this list against every PR. A rule that fails = PR is blocked. No exceptions, no "I'll fix it later."

---

## How to read each entry

```
- [ ] RULE: <one-line "DO NOT" or "ALWAYS" directive>
      Why: <v2 finding(s) it prevents — ID + one-sentence cause>
```

---

## 1. Security

- [ ] **ALWAYS** encrypt the local SQLite database with SQLCipher. License unlocks the key on launch.
      Why: v2 stored credentials in plaintext (`integrations/service.ts` did `select("*")` exposing API tokens to the browser — S14). v3 has no server; the DB file *is* the data, so encryption is non-negotiable.
- [ ] **DO NOT** parse untrusted request bodies before verifying signatures (webhook HMAC, license payloads, file imports).
      Why: v2's `webhooks/evolution/route.ts:45` parsed JSON before checking the secret — cheap DoS amplifier (S5).
- [ ] **ALWAYS** compare secrets with timing-safe equality (`crypto.timingSafeEqual` / Rust equivalent).
      Why: v2 used `===` for `CRON_SECRET` (S6) — timing-attack-friendly.
- [ ] **DO NOT** allow state-changing operations on GET routes (no prefetch-able side effects).
      Why: v2's `cron/daily-report` was a GET that UPSERTed rows and sent WhatsApp messages (S7).
- [ ] **ALWAYS** validate uploads: MIME sniff (not just extension) + size cap + magic-bytes check.
      Why: v2's `uploadProductImage` accepted 100MB `.exe` renamed `.jpg` (S16).
- [ ] **DO NOT** store third-party API credentials in plaintext in the DB or in source.
      Why: S14 again. v3 must use OS keychain (Tauri `keytar`/secure storage) for Yalidine/Maystro/ZR Express/Gemini keys.
- [ ] **DO NOT** commit real-looking phone numbers, emails, or passwords in seeds, placeholders, or tests.
      Why: v2 i18n placeholder `0791999157` looked like a real DZ number (H5); v2 E2E tests committed plaintext Supabase credentials (T10).
- [ ] **ALWAYS** run `bun audit` / `npm audit` + Dependabot before release. Pin or replace any HIGH/CRITICAL advisory.
      Why: v2 shipped `xlsx@0.18.5` (Prototype Pollution + ReDoS) and `next@16.2.4` (13 HIGH advisories) — S18.
- [ ] **DO NOT** allow license validation to be bypassed in dev/preview builds without a flag that ships disabled.
      Why: v2's `NODE_ENV=development` bypass opened preview deploys to unauthenticated cron (S6).
- [ ] **N/A in v3** — Row-Level Security, multi-seller `seller_id` scoping, team-member RBAC, public-anon endpoint hardening, XFF-spoofable IP rate limits.
      Why: v3 is single-user, local-first. There is no RLS layer, no team feature (explicitly dropped per design system §13), no public anon API. These 9 findings (S1, S3, S4, S8-S13, S20) stay in the record but don't apply.

---

## 2. Data Integrity

- [ ] **ALWAYS** APPEND to existing free-text fields (notes, descriptions, logs). Never overwrite with a fresh string.
      Why: v2 `order-agent.ts:303,334,364` did `.update({ notes: "[AI Agent] ..." })` — wiped seller's manual notes, customer notes, and prior AI notes (B10).
- [ ] **DO NOT** let `findOrCreateCustomer` overwrite existing customer data on a re-order.
      Why: v2 used wrong `ignoreDuplicates` setting — typos in a 2nd order overwrote the good name/address from the 1st (B12).
- [ ] **ALWAYS** return a meaningful error from cost/price calculators when input lookup fails. Never return `0`.
      Why: v2 `computeDeliveryCost` returned 0 on failure → customers got free shipping silently (B11).
- [ ] **DO NOT** run a "clear test data" routine without a guardrail, soft-delete window, and audit log.
      Why: v2 `clearTestData` was a destructive nuke with no confirmation, no undo, and incomplete (FK violations on returns/expenses/automations) — W18.
- [ ] **ALWAYS** parse CSV with a spec-compliant parser that handles quoted fields, embedded newlines, and escaped quotes.
      Why: v2's hand-rolled parser split quoted fields with newlines across two rows (B13) — silent data corruption on imports.
- [ ] **DO NOT** sanitize CSV/form input only for SQL — also escape formula injection (`=`, `+`, `-`, `@`, tab, CR) on export.
      Why: v2 `lib/data/export.ts` allowed `=cmd|'/c calc'!A1` in customer names — Excel execution on open (S15).
- [ ] **ALWAYS** use atomic upserts (`INSERT ... ON CONFLICT`) for idempotent writes. Never read-then-write counters.
      Why: v2 `run_count` was read-then-write (W2); `ensureRecipesExist` was TOCTOU (W3); exchange-order creation raced and produced 2 exchange orders (W4).
- [ ] **DO NOT** blend fabricated "national average" data into real seller metrics.
      Why: v2 `risk-engine.ts` mixed made-up wilaya stats at 40% weight into real risk scores, presented as insight (H1).
- [ ] **ALWAYS** derive capacity/storage warnings from real measurements (disk free, row count actual), not hardcoded thresholds.
      Why: v2 dashboard warned "Database almost full" at hardcoded 12,750 / 14,250 / 15,000 orders (H2).
- [ ] **ALWAYS** seed reference data (templates, wilayas, etc.) via a versioned Prisma seed script, not inline constants.
      Why: v2 hard-coded 4 WhatsApp templates in TS source even though a SQL seed file existed (H3).
- [ ] **DO NOT** ship a migration that the runtime query client cannot call.
      Why: v2 `get_pnl_summary` / `get_product_profitability` RPCs were GRANTed only to `service_role` but routes used the `authenticated` client → always 500 (B2).
- [ ] **N/A in v3** — RLS policy bugs (team_members self-read, escalation to `owner`, retry queue access). v3 has no RLS. Recorded for completeness (M4, S8-S11).

---

## 3. Business Logic

- [ ] **DO NOT** pass `risk_score: 0` (or any sentinel default) into automation evaluation. Always compute and pass the real score.
      Why: v2 `updateOrderStatus` hardcoded `risk_score: 0` → `auto_confirm_safe` (threshold ≤20) fired on every order, bypassing all risk gating (B9).
- [ ] **DO NOT** fail-open on unknown trigger/action types. Default to **no-op + log**, not "match everything."
      Why: v2 `evaluateConditions` returned `true` by default → unknown trigger types always matched (W1).
- [ ] **ALWAYS** map every status enum value to a trigger. Unknown statuses must throw, not silently call `executeRecipes(undefined)`.
      Why: v2 had an incomplete status→trigger map — unknown statuses called executor with `undefined` type (W13).
- [ ] **DO NOT** implement return/exchange/refund side-effects as empty stubs. A return must update the original order, post an accounting entry, and notify.
      Why: v2 `returns-service.ts:166-169` was an empty stub — returns didn't update orders, didn't account, didn't notify (W12).
- [ ] **ALWAYS** include `customer_id` in duplicate-detection queries, not just "recent orders."
      Why: v2 AI duplicate-detector flagged EVERY order after the first daily one as `doublon` because it didn't filter by customer (B5).
- [ ] **DO NOT** use substring matching for place/wilaya name normalization.
      Why: v2 `normalizeWilayaName` matched "tam" → Tamanrasset (W22) — wrong wilaya → wrong delivery pricing.
- [ ] **ALWAYS** implement retry with exponential backoff for shipment creation (transient 5xx must not strand an order).
      Why: v2 `delivery/adapters.ts` had NO retry on shipment creation — a transient 502 meant the order was permanently stuck unshipped (W8).
- [ ] **DO NOT** retry non-retryable errors (4xx). Only retry 5xx and network errors.
      Why: v2 `groq.ts` retried 400/401 three times = 90s wasted latency per bad request (W7).
- [ ] **ALWAYS** bound cart quantities (max items per product, max total) and validate price server-side (or, in v3, at the Tauri command boundary).
      Why: v2 `cart.ts` had no upper bound on quantity and no price validation (W19).
- [ ] **ALWAYS** treat AI recommendations as authoritative input to automations, or remove the AI feature. Don't compute them and discard.
      Why: v2 `order-agent.ts` computed AI recommendations then ignored them, only using `risk_score` thresholds (W11) — dead feature weight.

---

## 4. AI / Extraction

- [ ] **DO NOT** let the AI agent fall back to an elevated/admin DB client when the user-context lookup fails. Fail the request instead.
      Why: v2 `agent.ts:55-68` silently fell back to `service_role` if `auth.getUser()` failed → all 30 AI tools ran as root with only `sellerId` scoping (S2).
- [ ] **ALWAYS** handle every enum value the system prompt advertises to the model (`'7d'`, `'30d'`, `'90d'`, `'year'`, …).
      Why: v2 `getPeriodFilter` didn't handle `'90d'`/`'year'` → AI said "90-day P&L" but returned lifetime totals (B6).
- [ ] **DO NOT** reference tools in the system prompt that don't exist in the tool registry.
      Why: v2 prompt mentioned `update_store_info` which didn't exist — model called it, hit "Tool not found," silently failed (B7).
- [ ] **ALWAYS** double-escape regex metacharacters in sanitizer/PII filters. Test with both MSA and Darija corpuses.
      Why: v2 Darija sanitizer used `'\s'` instead of `'\\s'` — matched literal `s`, never fired (B8). Worse, when fixed it would have falsely flagged valid MSA words `اليوم`/`بصراحة` as Darija leaks (W15).
- [ ] **DO NOT** show AI/model attribution badges before the first AI call has actually been made.
      Why: v2 `AIAssistant.tsx:554-556` rendered "⚡ Sahara-Brain" badge before any call — misleading (F12).
- [ ] **DO NOT** fabricate a draft order when extraction fails. Surface the error and let the user retry or edit manually.
      Why: v2 inbox fallback inserted a draft with placeholder item "Extracted Item" on extraction failure (F11) — fake data in the seller's order list.
- [ ] **ALWAYS** add an iteration cap / max-steps guard to the AI agent loop.
      Why: v2 `agent.ts:1296-1450` was single-pass only with no infinite-loop protection (W21).
- [ ] **DO NOT** share model-health state across users via a module-level variable.
      Why: v2 `lib/ai/models/health.ts:34` — seller A's failures marked models unhealthy for seller B (W10). In v3 this maps to "don't share AI health state across multiple open windows/profiles."
- [ ] **ALWAYS** validate AI output with a Zod schema before persisting. Treat the model as hostile input.
      Why: design-system §12.2 mandates Zod on all input boundaries including AI responses. v2's TD1 (two shapes for `OrderItem`) was downstream of unvalidated AI output.

---

## 5. Testing

- [ ] **ALWAYS** write tests for the actual RPC/command payload, not a mock of it.
      Why: v2 `atomic_create_order` had ZERO tests (T1); `webhooks/store/[token]` tests mocked `crypto.subtle.verify` then asserted on the mock (T7) — tautological, caught nothing.
- [ ] **DO NOT** write tests that assert against their own hardcoded copy of the system under test.
      Why: v2 `agent-tools.test.ts` tested its own mock array (T3); `order-transitions.test.ts` asserted against its own hardcoded `VALID_TRANSITIONS` map and even missed `'cancelled'` (T6); 2 magic-moment tests asserted on object literals (T8).
- [ ] **ALWAYS** include `expect()` calls with concrete expected values, not just "does it run without throwing."
      Why: v2 had 10 customer risk-score test cases with no `expect()` (T5) — they passed for any output.
- [ ] **ALWAYS** mock at module boundaries, not at the function under test. Mocks must cover BOTH legacy and modern code paths.
      Why: v2 `src/test/setup.ts` mocked `lib/agents/groq` but NOT `lib/ai/service` — modern path ran unmocked (T11).
- [ ] **DO NOT** commit credentials in test files. Use env vars, fail-closed if missing.
      Why: v2 `magic-moment.spec.ts:115-116` shipped plaintext Supabase password (T10).
- [ ] **ALWAYS** run every Playwright/E2E project in CI (chromium, mobile-chrome, mobile-safari). Don't silently skip projects.
      Why: v2 CI never ran mobile projects (T12) — mobile-only regressions shipped to prod undetected.
- [ ] **ALWAYS** test HMAC/signature verification with real crypto, not mocked verify functions.
      Why: T4/T7 — v2 had ZERO tests for `verifyShopifyHmac` / `verifyWooCommerceHmac` until PR #11.
- [ ] **DO NOT** leave executor/automation code untested because "it's just glue."
      Why: v2 `executor.ts` (516 lines) had no test file (T2) — W1/W2/W3 race conditions all shipped.

---

## 6. Code Quality

- [ ] **DO NOT** leave dead code (exported-but-unimported functions, orphan routes, unreachable branches) in the tree. CI must fail on it.
      Why: v2 had 9 dead-code findings (D1-D9): an entire 335-line smart-confirmation engine never wired in (D1), 3 unused AI executor functions (D2), an empty health stub (D3), a 289-line modal never imported (D4), a duplicated `forceRoute` with different behavior (D7), unused env exports (D8), tautological `style={x ? undefined : undefined}` (D9).
- [ ] **DO NOT** keep two parallel implementations of the same concept (legacy + modern) "coexisting" without an explicit migration plan and a sunset date.
      Why: v2 had `lib/agents/` (legacy) AND `lib/ai/` (modern) both actively called (D6), plus a third entry point `lib/ai/service.ts` duplicating `agent.ts` (D5). Pick one in v3.
- [ ] **ALWAYS** keep TS types in sync with the Prisma schema. Generate types via `prisma generate`; do not hand-write DB interfaces.
      Why: v2 had 5 type-drift findings (TD1-TD5): two shapes for `OrderItem` JSONB (TD1), 5 fields wrong nullability on `Seller` (TD2), 7 fields marked required but DB-nullable (TD3), 6 of 25 tables had no TS interface (TD4), 18 `as unknown as` chains (TD5).
- [ ] **DO NOT** use `any`, `// @ts-ignore`, or `as unknown as` to silence type errors. Fix the type or write a narrow branded type.
      Why: design-system §12.2 forbids `any` in production. v2 had 18 `as unknown as` casts (TD5).
- [ ] **DO NOT** ship `console.log` / `console.error` in production paths. Use structured logging to a rotating local file.
      Why: design-system §12.2 mandates this. v2's W14 was worse: bad find-and-replace stripped `"[Tool h"` globally → truncated log prefixes like `andleUpdateOrderStatus]` — useless in incident response.
- [ ] **DO NOT** re-implement a constant that already lives elsewhere. Centralize config.
      Why: v2 had 9 hardcoded-value findings (H1-H9): shipping cost `400` magic number (H4), 3 hardcoded delivery API URLs (H7), Groq URL + Referer (H6), hardcoded WhatsApp templates (H3).
- [ ] **ALWAYS** remove orphan routes / orphan nav items together. A route without a link, or a link without a route, is a bug.
      Why: v2 `/dashboard/risk` was fully implemented but unreachable (F8); CommandPalette exposed only 7 of 21 routes (F10); "Open Store" went to `/` not `/form/[sellerSlug]` (F9).
- [ ] **DO NOT** shadow a type with a re-export of the same name.
      Why: v2 `types/database.ts:135-143` defined `ReturnReason` locally then re-exported it from `./returns` (D11) — ambiguous import resolution.

---

## 7. UX / UI

- [ ] **DO NOT** ship a "Coming Soon" disabled button without a tracked ticket and a sunset date. Either build the feature or remove the button.
      Why: v2 had 6 fake/coming-soon findings (F1-F5, F3): Billing tab (F1), Channels tab (F2), DeliverySettings tab (F3), Security 2FA (F4), Integrations grid (F5) — all decorative, eroded user trust.
- [ ] **DO NOT** render a UI badge (Pro, Premium, AI model) that isn't backed by real state.
      Why: v2 Sidebar always rendered `<div>Pro</div>` while Billing tab said user was on "Starter" (F6).
- [ ] **DO NOT** fabricate data viz. If there's no real sparkline data, render empty state — not a decorative bar.
      Why: v2 `AnimatedStatCard` computed `Math.min(100, (num / num*1.2) * 100)` → always ~83% (F7). Every stat card showed identical meaningless bars.
- [ ] **ALWAYS** verify locale accessors exist on the object you're calling them on. `t.locale` is not the same as `locale` from context.
      Why: v2 `TeamInviteModal.tsx:66` called `t.locale` which doesn't exist → always `undefined` → always English (B4). 5 call sites, all broken.
- [ ] **DO NOT** keep server and client i18n defaults inconsistent.
      Why: v2 server defaulted to `"en"`, client to `"ar"` (W16) — first paint flicker + wrong-locale SSR.
- [ ] **DO NOT** write inline ternary dictionaries (`isAr ? "..." : isFr ? "..." : "..."`). Every user-visible string goes through `t()`.
      Why: v2 had ~150 strings in 5 files (H8) that translators couldn't find, plus 5 more files with hardcoded English (H9).
- [ ] **ALWAYS** default placeholders to obviously-fake values (`0555 00 00 00`, `example@darija.dz`), never real-looking numbers.
      Why: H5 — `0791999157` looked like a real subscriber line.
- [ ] **DO NOT** let `hasPermission(role, action)` return `true` for the owner on ANY string. Typos in action names must fail loudly for everyone.
      Why: v2 `permissions.ts:66` returned `true` for owner on any string (W17) — typo'd action names were silently allowed for the primary user, masking bugs.

---

## 8. i18n

- [ ] **DO NOT** ship Arabic-only seed data. Every seed (templates, default categories, status labels) must exist in AR / FR / EN.
      Why: v2 `seeds/whatsapp_templates.sql` was Arabic-only (M3) in a trilingual app.
- [ ] **DO NOT** mix `isAr ? ... : isFr ? ... : ...` ternaries — use the `t()` function exclusively.
      Why: H8 again — translators can't extract inline ternaries.
- [ ] **DO NOT** hardcode English strings in error boundaries, toasts, or empty states.
      Why: H9 — `error.tsx`, `ChatMessage.tsx`, `orders/page.tsx`, `AIAssistant.tsx` all had raw English.
- [ ] **ALWAYS** run `scripts/check-translations.ts` (or v3 equivalent) in CI. Missing keys = build failure.
      Why: design-system §12.2 mandates this; v2's H8/H9 wouldn't have shipped with such a gate.
- [ ] **ALWAYS** support RTL at the layout level, not per-component. Set `dir` once at the root.
      Why: design-system §12.2 mandates RTL support; v2's B4 (broken locale accessor) hid the fact that several components never actually flipped.
- [ ] **DO NOT** list valid MSA Arabic words (`اليوم`, `بصراحة`, `شكرا`, …) as "Darija leaks" in sanitizers.
      Why: W15 — v2's sanitizer word-list would have corrupted valid Arabic had the regex actually worked.

---

## 9. Performance

- [ ] **DO NOT** block the UI on a network call without an offline fallback or a "loading..." that actually resolves.
      Why: design-system §12.2 — v2 had phantom spinners; v3 is local-first so the bar is higher: the app must launch and show data even when AI/WhatsApp/TikTok are unreachable.
- [ ] **ALWAYS** degrade gracefully: AI keys missing → manual mode; WhatsApp disconnected → reconnection flow; SQLite corrupted → restore prompt. The app must ALWAYS launch.
      Why: design-system §12.4 item 9. v2's B1 (server crash on `client-only` lib) was the same failure mode in a different stack.
- [ ] **DO NOT** retry 4xx errors. Wasted latency compounds across the AI tool fan-out.
      Why: W7 — v2 wasted 90s per malformed AI request.
- [ ] **ALWAYS** scope every DB query explicitly. Don't rely on an implicit filter (RLS in v2, nothing in v3) to limit rows.
      Why: W5 — v2 `getSessionMessages`/`addMessage` had no explicit `seller_id` filter; anyone with a session UUID could read/write. In v3 single-user this is less catastrophic but the discipline of explicit scoping still prevents "load everything then filter" perf traps.
- [ ] **DO NOT** silently fall back to `localhost` when an env var is missing. Fail loud in dev, fail soft in prod with a clear "not configured" state.
      Why: W9 — v2 `evolution-api.ts` fell back to `localhost:8080` silently.
- [ ] **ALWAYS** batch AI calls and cache model health decisions per-session, not per-request.
      Why: W10 — module-level shared state in v2 caused cross-tenant interference; the perf lesson (don't re-check health per call) still applies.

---

## 10. Documentation (cross-cutting)

- [ ] **DO NOT** claim "Production Hardened" / "Client-Ready" in docs while audit findings remain open.
      Why: DOC8 — v2 README/PROJECT_STATE/VISION all overstated status.
- [ ] **ALWAYS** update test counts, finding counts, framework versions, and phase numbers in docs as part of the PR that changes them.
      Why: DOC1/DOC4/DOC5 — v2 README said "Next.js 15" (was 16), "P9" (was Phase 6), stale test counts in 4 files.
- [ ] **DO NOT** reference a `docs/` directory that doesn't exist, or a GitHub repo that does.
      Why: DOC2/DOC6 — v2 claimed "no GitHub repo" falsely and had 5 dead `docs/` links.
- [ ] **ALWAYS** make migration instructions match reality. If migrations are squashed, say "apply only the baseline" — don't list archived files as a sequence.
      Why: DOC3 — v2 migration docs misled new contributors into applying already-archived migrations.
- [ ] **DO NOT** leave duplicate migration numbers in the tree.
      Why: M2 — v2 had two parallel squashed series with duplicated numbers (002, 006, 007, 009, 011, 020, 021, 023, 024).

---

## 11. N/A in v3 (Record Only)

These v2 findings have no direct v3 equivalent because v3 is local-first, single-user, Tauri-based. They are recorded here so the audit lineage is complete. **Do not re-introduce the underlying anti-pattern if v3 ever regains the relevant capability.**

| v2 Finding | Why N/A in v3 |
|------------|---------------|
| S1 (RLS leaks `webhook_token` to anon) | No public anon API in v3. License-gated local app. |
| S2 (AI service-role fallback) | No service-role concept. All DB access is the local user. |
| S3 (RBAC on only 2 of 30 routes) | Team feature explicitly dropped (design-system §13). Single user. |
| S4 (Multi-seller attribution) | Single-seller per install. |
| S8-S11 (team_members RLS policies) | No team feature. |
| S13 (XFF-spoofable IP rate limits) | No public endpoints. AI rate limits are per-key, not per-IP. |
| S20 (rate-limit key omits HTTP method) | No HTTP rate limiter. (Still: if you build one, include method.) |
| W6 (invited members treated as active) | No invitations. |
| B3 (Vercel Cron sends GET, retry route is POST) | No Vercel Cron. Local scheduler. |
| B4 (t.locale accessor broken) | Still relevant — see §7. Listed here only for the team-page-specific call sites. |
| M1 (RPC JWT setting name wrong) | No RPCs / no JWTs in v3. Prisma + local SQLite. |

---

## Review this checklist before every PR

> Before you open a PR, scan this whole document. For each rule, ask: *"Does my change violate this?"* If yes → fix it before requesting review. If a rule is **N/A in v3** → note why in the PR description.
>
> A reviewer should be able to point at any line in this file and ask "is this still true for the code in this PR?" — and get a yes.
>
> This list is **alive**. When v3 introduces a new class of bug, add a row. When a rule becomes impossible to violate because of an architectural decision, move it to §11 with a note. Never silently delete a rule.

---

*Derived from `AUDIT_FINDINGS_v2.md` (commit `674e722`, 2026-06-19). Maintained alongside the v3 codebase. Last reviewed: see git log of this file.*
