# SahelFlow — Master Plan to "Market-Killer" Ship (v2)

> **Created:** 2026-06-30 (Session 19, Phase 0 complete)
> **Audited state:** `main` @ `8ab25de` (v3.1.0), 391 tests green, ~47K LOC, **192 findings** (9 P0, 49 P1, 64 P2, 48 P3, 22 P4) — see `AUDIT_FINDINGS_v3.md`
> **Goal:** Ship a perfect, flawless, market-killer product — a top-tier company-grade COD platform for Algerian sellers.
> **Method:** Engineering loops on a 6-phase roadmap. No phase starts until the prior exits. No "it compiles" as done. Frontend & UI/UX is a dedicated key phase with the same rigor as every other.
> **Input:** `documentation/AUDIT_FINDINGS_v3.md` (canonical findings index — ALL 192 findings with tasks). Every work item below references a finding ID.

---

## 0. Operating Model (how we execute)

### The Engineering Loop (per finding-cluster, per PR)
```
Audit → Spec → Implement → Verify → PR → Merge → Retro
```
- **Audit:** findings already exist (AUDIT_FINDINGS_v3.md). New findings get appended.
- **Spec:** 1-paragraph PR description: what finding(s), what fix, what test, what exit criteria.
- **Implement:** on a feature branch `agent/<phase>-<slug>`. Small scope per PR (1-3 findings).
- **Verify:** `sf-verify` (tsc + eslint + vitest + prisma) MUST pass. Then **Agent Browser** MUST confirm the golden path works in the actual rendered app. No exceptions.
- **PR:** open against `main`. Founder merges.
- **Retro:** update `BUILD_LOG.md` + this plan's checklist after each PR.

### Non-negotiables
1. **Green main only.** Never merge red. `sf-verify` + Agent Browser both pass.
2. **Small PRs.** 1-3 findings per PR. Reviewable in 10 minutes.
3. **Tests follow code.** Every P0/P1 fix ships with a regression test. No test = no merge.
4. **Docs stay live.** `PROJECT_STATE.md`, `BUILD_LOG.md`, this plan update after each PR.
5. **No new features until Phase 5.** Phases 1-4 are hardening + polish + depth. The feature set is frozen.
6. **Frontend & UI/UX is Phase 3.** A dedicated key phase — not an afterthought folded into other phases. It gets the same Audit→Spec→Implement→Verify→PR→Merge→Retro discipline, the same "small PRs" rule, the same Agent Browser verification at every viewport.

### Branch + commit convention
- Branch: `agent/<phase>-<slug>` (e.g. `agent/p1-login-rate-limit`)
- Commit: `<type>(<scope>): <message> (FINDING-ID)` (e.g. `fix(auth): add rate limiting to login (SEC-001)`)
- PR title: `[P1] SEC-001: login rate limiting + PBKDF2 600k`

---

## 1. Phase Overview

| Phase | Name | Goal | Duration | PRs (est) | Exit criteria |
|---|---|---|---|---|---|
| **0** | Audit + Plan | Deep professional audit + master plan | DONE | 1 | AUDIT_FINDINGS_v3.md + MASTER_PLAN.md merged |
| **1** | Stop the Bleeding | Fix all P0 + critical P1 security/data/migration + mobile-broken core pages | ~1 week | 8-10 | 0 P0 findings. App upgrades cleanly. Mobile inbox+AI+storefront usable. |
| **2** | Foundation for Scale | Tests on critical paths, observability, auth hardening, license gating, migration runner, backup confidence | ~1.5 weeks | 6-8 | Critical-path coverage >70%. Sentry+PostHog live. Rate limit + session revocation + audit log. License gates premium. Tauri runs migrations. Backup restore verified. |
| **3** | Frontend & UI/UX Perfection | Mobile-first + RTL completion + a11y + i18n completeness across all 25 pages. Storefront polish. Design-system consistency. Micro-interactions. | ~1.5 weeks | 8-10 | All 25 pages A-grade responsive at 375/768/1280/1920. RTL arrows+formatDZD+plurals fixed. WCAG AA on critical paths. Storefront customer-facing polish done. 0 P0/P1 UX findings. |
| **4** | Performance & Reliability | N+1, SSE abort, materialize risk, lazy load, retries, atomic ops, bounded reconnect | ~1 week | 5-7 | Orders page <200ms at 10K orders. SSE aborts on disconnect. Risk analytics <100ms. All external calls have timeout+retry. Restore atomic. |
| **5** | Feature Depth | WhatsApp inbox v2, AI extraction moat, adapter integration testing | ~1.5 weeks | 5-7 | WhatsApp search+media+templates+broadcast. AI extraction metrics+HITL+fallback chain. All 7 adapters tested against mock servers in CI. |
| **6** | Market-Killer Ship | Onboarding wizard, macOS builds, CI fix, e2e, release flow, docs sync, supply chain | ~1 week | 5-7 | 5-min onboarding to first order. macOS signed+notarized. CI green on every PR. E2E covers 10 golden paths. All docs accurate. `bun run release` one command. |

**Total: ~7.5 weeks, ~37-49 PRs.** Each PR ships through the engineering loop.

### Why this sequencing
- **Phase 1 before Phase 2:** P0s are actively harming users/security *now*. We can't wait 1.5 weeks for a test suite before fixing a brute-forceable login. Phase 1 PRs ship with their own regression tests; Phase 2 builds the systematic net.
- **Phase 2 before Phase 3:** The UI perfection sweep needs the safety net (tests + observability) so we don't polish a broken app. If Phase 3 introduces a regression, Phase 2's tests + Sentry catch it.
- **Phase 3 (Frontend) as a dedicated key phase:** The honest assessment said the gap to market-killer is "engineering rigor + UX polish, not features." Frontend/UI/UX is ~45 of the 192 findings — it deserves its own phase, not to be sprinkled across others. This is where the app goes from "works" to "feels like Linear/Stripe/Notion."
- **Phase 4 (Perf) before Phase 5 (Feature Depth):** A fast app with shallow features beats a slow app with deep features. Fix the perf landmines (N+1, SSE leak) before adding WhatsApp depth + AI metrics that would compound them.
- **Phase 5 (Feature Depth) before Phase 6 (Ship):** WhatsApp inbox v2 + AI extraction moat are the product-depth differentiators. They must exist before the launch activities (onboarding, macOS, e2e) which assume the feature set is final.
- **Phase 6 last:** Onboarding, macOS, e2e, release flow are launch activities. They need the app correct (1-2), polished (3), fast (4), and deep (5) first.

---

## Phase 1 — Stop the Bleeding (~1 week, 8-10 PRs)

**Goal:** Eliminate every P0 and every P1 that could corrupt data, breach security, or break the production upgrade path. By end of Phase 1, the app is *safe* to ship to existing users.

### 1A. Security criticals (PRs 1-3)
- **PR 1 — Login hardening (SEC-001, SEC-002):** per-IP rate limit on `/api/auth/login` (5/min, backoff after 3, 15-min lockout after 10); PBKDF2 600k (re-hash on next login detecting old iteration count); PIN min 8 chars; 1s constant delay; `setSetting` key allowlist (reject `auth_*`); `POST /api/auth/change-pin` (verifies current PIN); move `auth_pin_hash` + `auth_secret` out of Setting into dedicated `AuthSecret` table. + tests.
- **PR 2 — Defense-in-depth (SEC-013):** `await requireAuth()` on all 48 unprotected mutating routes; introduce `withAuth()` HOF wrapping `withErrorHandler`. + integration test that unauthenticated POST returns 401 on 5 sample routes.
- **PR 3 — Setup-mode + session + audit (SEC-006, SEC-004):** Tauri injects `AUTH_SECRET` env on spawn; startup health check refuses if unset-but-DB-has-secret; `Session` Prisma model (sessionId, issuedAt, lastSeenAt, revokedAt); 24h token rotation; `AuditLog` model; log login/logout/failed-attempt/PIN-change/backup-restore/license-activate.

### 1B. Data integrity criticals (PRs 4-6)
- **PR 4 — Search on encrypted fields + blacklist (SEC-009, CODE-025):** add `nameBlindIndex` to Customer + `phoneBlindIndex` to Order; migrate existing rows (decrypt + re-index); rewrite `customer-extensions.search` + `order-extensions.search` to use blind indexes (exact for phone, prefix for name); add `isBlacklisted Boolean` + `blacklistReason String?` + `blacklistedAt DateTime?` to Customer; migrate `[BLACKLISTED]` tags; update risk-engine service. + tests.
- **PR 5 — Transactional correctness (SEC-016, SEC-017, SEC-018, CODE-003, CODE-013, CODE-029):** wrap `orderService.update` item sync in `$transaction`; wrap import routes in per-batch `$transaction` + idempotency key for orders; `DELETE /api/orders/[id]` pre-check for returns → 409; `returnService.updateStatus()` in `$transaction` (restore stock, adjust customer stats, emit notification, create note) — mirrors `orderService.updateStatus`. + tests.
- **PR 6 — Schema/type drift + validation (CODE-006, SEC-014, SEC-019, SEC-020, SEC-021):** add `"storefront"` + `"ai_chat"` to `OrderSource` enum, remove unused `"webstore"`; route storefront/submit + AI tool through `orderService.create`; add `"dhd"` to delivery/create Zod; add `onDelete: Cascade` to `ReturnNote.return`; delete local `VALID_CATEGORIES` in import/expenses (use `expenseCategorySchema`); Zod schemas for risk/blacklist + risk/rules. + tests.

### 1C. Production upgrade path (PR 7)
- **PR 7 — Migration runner + version sync (PROD-001, PROD-004, PROD-005, SEC-025):** generate proper `prisma migrate dev --name add_product_variants` migration; wire `prisma migrate deploy` into Tauri `setup` hook (before Next.js spawn) — locates active shop SQLite via `app-meta.json`, runs migrations, `PRAGMA integrity_check` first, on failure blocks startup + shows recovery UI; switch shop-creation from `db push --accept-data-loss` to `migrate deploy`; `release.ts` bumps `Cargo.toml` + `package.json` + `tauri.conf.json` atomically; derive `APP_VERSION` from `npm_package_version`; sync `Cargo.toml` to 3.1.0. + migration test (snapshot v3.0 DB → run migration → assert v3.1 schema).

### 1D. Mobile-broken core pages (PR 8)
- **PR 8 — Inbox + AI chat mobile (UX-003, UX-004):** `useMediaQuery` + drill-down pattern (list full-width on mobile → tap → thread slides in via Sheet with back button); keep desktop split. Verify with Agent Browser at 375px.

### 1E. Storefront customer-facing criticals (PR 9)
- **PR 9 — Storefront P0s (UX-001, UX-002, UX-016):** add `storefront.view.cart` key × 3 locales; `storefront/[slug]/not-found.tsx` → `getI18n()` + 3 keys × 3 locales + fix "Go home" link; cart buttons → `h-11 w-11`. Verify storefront flow end-to-end in Agent Browser (AR + FR + EN).

### 1F. Security regressions from v2 (PR 10)
- **PR 10 — v2 regression fixes (SEC-010, SEC-011, SEC-022, SEC-003):** `escapeField` sanitizes formula chars (prefix `'` to `=+-@\t\r`); upload route strict extension allowlist + MIME→ext map + `path.basename` + resolved-path check + serve with `nosniff` + `Content-Disposition: attachment`; storefront rate limit keys on socket remote address (Tauri) or `CF-Connecting-IP` (Cloudflare) + per-storefront limit; fix storefront config `[id]` public-route trailing-slash bypass (exact + method-aware match). + tests.

### Phase 1 Exit Criteria
- [ ] 0 P0 findings remain (9 → 0)
- [ ] All P1 security + data-integrity findings closed (SEC-001/002/003/004/006/009/010/011/013/014/016/017/018/021/022, CODE-002/003/004/005/006/013/029, SEC-019/020/025)
- [ ] Tauri runs migrations on startup; v3.0 DB upgrades to v3.1 cleanly
- [ ] Inbox + AI chat usable at 375px (Agent Browser verified)
- [ ] Storefront customer flow works in AR + FR + EN (Agent Browser verified)
- [ ] `sf-verify` green; new tests cover every fix
- [ ] `PROJECT_STATE.md` + `BUILD_LOG.md` updated

---

## Phase 2 — Foundation for Scale (~1.5 weeks, 6-8 PRs)

**Goal:** Build the safety net + observability + commercial enforcement so the app can be operated and monetized at scale. By end of Phase 2, we have regression confidence, production visibility, and a working license model.

### 2A. Test foundation (PRs 11-13)
- **PR 11 — API route integration tests (TEST-002):** `src/app/api/__tests__/` harness. Top-10 routes: storefront/submit (public, rate limit, transactional), auth setup/login/logout, orders create/status/bulk, backup/restore, delivery/create, extraction. Real PrismaClient + mocked cookies.
- **PR 12 — AI agent + license + auth tests (TEST-003, TEST-004, TEST-005):** `agent.ts` mock-fetch tests (MAX_ITERATIONS, model fallback, timeout, no-key, unknown tool, SSE sequencing); per-tool tests against real DB; license trial invariant tests (8 cases with real Ed25519 keypair); auth flow integration test (setup → login → requireAuth → logout).
- **PR 13 — CI enforcement (TEST-001, PROD-026, PROD-012):** CI runs `sf-verify` + `--coverage` (threshold enforced) + `bun audit` + `prisma migrate status`. Add `lcov` reporter for Codecov. Paths filter to skip docs-only. Diagnose GitHub Actions "broken" claim (check Actions run history).

### 2B. Observability (PRs 14-15)
- **PR 14 — Logging that survives (PROD-007, SEC-024, PROD-018):** Rust captures Next.js + sidecar stdout → `data/logs/sahelflow-YYYY-MM-DD.log` with 7-day rotation + 5MB cap; replace 19 `console.*` with `logger.*`; add PII redaction layer in `formatMessage`; "Export logs" button in Settings (sanitized zip); fix logger header comment.
- **PR 15 — Sentry + PostHog + health (PROD-008, PROD-010, PERF-020):** `@sentry/nextjs` (Next surface) + `@sentry/bun` (sidecar) + Tauri Rust Sentry SDK; `beforeSend` scrubs PII; PostHog events (app_launched, setup_completed, first_order, first_delivery, first_ai_extraction, first_whatsapp_connect, license_activated, day_1/7_retention) with "Send usage data" toggle (off by default); `/api/health/deep` (DB + Gemini test + sidecar ping + delivery providers); topbar health dot; Tauri `wait_for_port` polls `GET /api/health` not raw TCP.

### 2C. Commercial enforcement + backup confidence (PRs 16-17)
- **PR 16 — License + feature gating (PROD-003, PROD-014, SEC-005, SEC-007, SEC-008):** wire `requireLicense()` into `withErrorHandler` (every protected route); fail-closed `isLicenseValid` (persist last status to Setting; Tauri validates before spawning Next.js); real 5-signal machine fingerprint in Rust (CPU/mobo/disk/MAC/OS); remove `"DEV-MOCK-MACHINE-ID-FALLBACK"`; Stronghold-backed trial counter + `firstTrialIssuedAt`; `<FeatureGate feature="...">` component; gate premium UI (agents, storefronts, multi-shop, daily reports, Google Sheets); `FeatureFlag` Prisma model (key, enabled, rolloutPercentage) + `isFlagEnabled(key)` (machine-id hash for % rollout); `/admin/flags` page (founder-only).
- **PR 17 — Backup confidence (PROD-006, PERF-013, PERF-017):** round-trip test (backup → mutate → restore → byte+query equality); daily auto-backup via Tauri Rust timer at configurable time; retention (7 daily + 4 weekly + 3 monthly, auto-prune); `PRAGMA integrity_check` after restore (auto-rollback on fail); restore uses temp-file-then-rename (atomic); restore restarts Next.js server (calls `disconnectAllShops()` + fresh client).

### Phase 2 Exit Criteria
- [ ] Critical-path test coverage >70% (storefront/submit, auth, orders, backup, delivery, extraction, AI agent, license, multi-shop)
- [ ] CI green on every PR with `sf-verify` + coverage threshold + `bun audit`
- [ ] Sentry captures errors on all 3 surfaces; PostHog fires key funnel events
- [ ] `/api/health/deep` works; topbar shows health dot
- [ ] `requireLicense()` enforces on every protected route; `<FeatureGate>` hides premium UI for basic license; trials can't be reset via localStorage deletion
- [ ] Backup restore verified by automated test; auto-backup scheduled; retention enforced; restore is atomic
- [ ] Logs persist to file with rotation; PII redacted; "Export logs" works

---

## Phase 3 — Frontend & UI/UX Perfection (~1.5 weeks, 8-10 PRs)

**Goal:** Every page looks and feels like Linear/Stripe/Notion. Mobile-first, RTL-correct, accessible, fully translated. By end of Phase 3, the app is *beautiful* on every device in every locale. This is the dedicated key phase for frontend — it follows the same engineering loop as every other phase.

### 3A. Mobile + responsive sweep (PRs 18-19)
- **PR 18 — Detail pages + tables to PremiumTable (UX-013, CODE-022, UX-025):** migrate `customers/[id]`, `products/[id]`, `import-panel`, `backup-restore-panel` to `<PremiumTable>`; add `overflow-x-auto` wrappers; responsive column hiding via `hideOn`; fix `orders/[id]` inconsistent padding → `app-content page-sections`.
- **PR 19 — Topbar + command palette + grids + stat cards (UX-015, UX-030, UX-034, UX-040):** mobile-visible search icon opens command palette; automations page uses `<StatCard>`; consistent `grid-cols-1` mobile fallback across all grids; stat-card grids on small screens; fix orders page empty-state mismatched i18n keys (dedicated `orders.empty.highRiskTitle/Desc`).

### 3B. RTL completion (PR 20)
- **PR 20 — RTL arrows + logical props + formatDZD (UX-006, UX-007, UX-022, UX-023, UX-033):** `rtl:rotate-180` on all 11 directional arrows; migrate shadcn UI components to logical props (`pl-8`→`ps-8`, `pr-8`→`pe-8`, `text-left`→`text-start`); clarify/remove `flex-row-reverse` in sidebar (migrate to logical props or fix comment); `formatDZD(amount, locale)` — `ar`→"دج", `fr`→"DA", `en`→"DZD"; `formatDZDShort` localized; update ~30 call sites; dialog close `right-4`→`end-4`; dialog sr-only "Close" → `t("common.close")`.

### 3C. i18n completeness (PR 21)
- **PR 21 — Arabic plurals + hardcoded strings + aria-labels (UX-008, UX-018, UX-019, UX-024, UX-028, CODE-008, CODE-027, CODE-028):** CLDR plural support in `t()` (`key_zero/one/two/few/many/other` via `Intl.PluralRules("ar")`); migrate 8 count-based strings to 6-form keys; replace 11 hardcoded English fallbacks in client components + 4 aria-labels with `t()`; delete `products/[id]` local `statusLabels`/`statusBadgeVariant` (use `orderStatusStyles` + `statusI18nKey`); storefront loading skeleton matches product grid; all API route error strings → i18n keys; AI agent system prompt locale-aware; AI stream route error fallbacks i18n'd.

### 3D. Accessibility (PR 22)
- **PR 22 — a11y WCAG AA (UX-010, UX-011, UX-012, UX-014, UX-020, UX-021, UX-038, UX-039):** `prefers-reduced-motion` `@media` block (affects 40+ animations); sortable `<th>` keyboard-accessible (`role="button"`, `tabIndex`, `onKeyDown`, `aria-sort`); clickable `<tr>` keyboard-accessible (sr-only `<Link>` or `role="link"`); settings tabs → Radix `Tabs`; skip-to-content link rendered (key exists); `role="status"`/`aria-live` on cart count, status badges, AI chat message list, inbox unread count; storefronts list icon buttons `aria-label` (not just `title`); products list sr-only → `t("products.viewDetails", { name })`.

### 3E. Storefront customer-facing polish (PR 23)
- **PR 23 — Storefront perfection (UX-005, UX-009, UX-016, UX-026, UX-027, UX-029, UX-036, UX-037):** `OrderStatusBadge` optimistic-update fix (rollback + toast on error); order edit panel unsaved-changes warning (dirty state + `beforeunload` + confirm); storefront product images rendered (`<img>` with `loading="lazy"` + placeholder); COD form client-side Zod validation (inline errors, `aria-describedby`, `pattern` on phone, disable submit until valid); storefront uses `formatDZD(price, locale)`; "Add to cart" success feedback (button state + cart badge); cart buttons `h-11 w-11`; remove dead English "Address" fallback.

### 3F. Design-system consistency + micro-interactions (PR 24)
- **PR 24 — Polish sweep (UX-017, UX-030, UX-031, UX-032, UX-035, UX-034, UX-044, CODE-015, CODE-016, CODE-020):** replace all `blue-*` with `sky-*`/`cyan-*`/`teal-*`; Shopify → `emerald-*`; inbox `green-*`→`emerald-*`, `blue-*`→`sky-*`; extract generic `StatusBadge<Status>` (dedupe delivery/return status maps to `shared.ts`); rename `wilaya-risk/engine.ts:assessOrderRisk` → `getWilayaRiskSummary` (or delete — proper engine incorporates wilaya); dashboard raw enum fallback → `t(statusI18nKey(...))`; orders detail raw source fallback → `t("orders.source.unknown")`; consistent `grid-cols-1` everywhere; optional staggered list-item enter animations.

### 3G. Color-rule enforcement + viewport verification (PR 25)
- **PR 25 — No-blue rule + per-page viewport verification (UX-017, CODE-022, CODE-024):** grep-verify zero `indigo`/`blue` in components; verify all 25 pages at 375/768/1280/1920 via Agent Browser (capture per-page grade); fix any remaining base-`<Table>` sites; fix `products/[id]` statusLabels dedup; update `status.*` i18n namespace consolidation.

### Phase 3 Exit Criteria
- [ ] All 25 pages A-grade responsive at 375/768/1280/1920 (Agent Browser verified per page)
- [ ] RTL: every directional arrow flips; `formatDZD` + `formatDZDShort` localized; shadcn components use logical props; dialog close on correct side
- [ ] Arabic plurals correct (6 CLDR forms) on all count strings
- [ ] 0 hardcoded user-facing English strings in src/ (client + API + AI prompt)
- [ ] WCAG AA: skip-link, keyboard nav on all interactive elements, `aria-sort`/`aria-live`/`role="status"` where needed, `prefers-reduced-motion` respected, settings tabs ARIA-compliant
- [ ] Storefront: product images, inline form validation, localized currency, add-to-cart feedback, 44px touch targets, localized loading skeleton
- [ ] 0 `indigo`/`blue` color-rule violations
- [ ] Status badges: single shared component, single status-styles source, single i18n namespace

---

## Phase 4 — Performance & Reliability (~1 week, 5-7 PRs)

**Goal:** The app is fast at scale and resilient to failure. By end of Phase 4, there are no perf landmines and every external call is bounded.

### 4A. Orders page + risk N+1 (PR 26)
- **PR 26 — Orders page + risk N+1 + SSE abort (PERF-001, PERF-003, PERF-007, PERF-008):** SSE agent aborts on client disconnect (`req.signal` + `cancel()` handler); `batchAssessOrders` batches the 4 lookups (`findMany` + `groupBy`) — 800 queries → ~4; orders page `select` only rendered fields (eliminate 200 PII decryptions); dedupe `allOrders`/`filteredOrders` when no filter.

### 4B. DB hygiene + indexes + pagination (PR 27)
- **PR 27 — DB Proxy cache + indexes + pagination + shop-switch leak (PERF-002, PERF-004, PERF-006, PERF-009, CODE-001, CODE-014, CODE-023):** `db` Proxy caches `app-meta.json` (1-2s TTL or mtime); `@@index([customerId])` on Order + `@@index([createdAt])` on Customer; shop-switch disconnects old Prisma client + LRU(3) + `process.on("beforeExit")` hook; orders page cursor pagination (`where: { createdAt: { lt: cursor } }`) + "Showing N of M" count; `risk-engine/analytics.ts` N+1 → `Promise.all`; `seedWilayaRiskProfiles` → `createMany({ skipDuplicates: true })`.

### 4C. Materialize risk + lazy load (PR 28)
- **PR 28 — Materialize risk + lazy load + dead deps + Sharp (PERF-011, PERF-026, PERF-012, PERF-023):** persist `RiskAssessment` per Order (score + level + triggeredRules) at creation + on status change; analytics reads pre-computed; `next/dynamic` lazy-load AiChat + chart components + import panel; remove dead deps (`@tanstack/react-query`, `react-syntax-highlighter` config); `images: { unoptimized: true }` to drop 33M Sharp from standalone.

### 4D. Reliability hardening (PR 29)
- **PR 29 — Retries + atomic restore + reconnect bounds + Suspense (PERF-005, PERF-013, PERF-014, PERF-015, PERF-016, PERF-018, PERF-021):** move `retryFetch` to `lib/integrations/http.ts`; wrap DHD + Gemini + e-commerce adapters + sidecar client; restore uses temp-file-then-rename (atomic); WhatsApp socket `MAX_RECONNECT_ATTEMPTS=20` + UI "WhatsApp unavailable — retry" state; `server-only` guard on import engine/export; Suspense boundaries on slow pages (analytics: KPI cards first, charts stream in).

### 4E. Concurrency + notifications + clean shutdown (PR 30)
- **PR 30 — Optimistic concurrency + notification polling + clean shutdown (SEC-030, PERF-022, PERF-024, CODE-012):** optimistic concurrency on order updates (`updatedAt` in `where` → 409 on mismatch); topbar notification polling 60s→5min or Page Visibility API; Tauri `RunEvent::Exit` → `POST /api/shutdown` → `disconnectAllShops()`; `incrementRuleTriggers` → atomic `RiskRuleTriggerCount` table.

### Phase 4 Exit Criteria
- [ ] Orders page <200ms at 10K orders (Agent Browser perf trace)
- [ ] Risk analytics page <100ms at 50K orders
- [ ] SSE agent aborts within 1s of client disconnect
- [ ] Shop-switch leaks 0 Prisma clients; clean shutdown WAL-checkpoints
- [ ] All external calls (Gemini, delivery, e-commerce, sidecar) have timeout + retry
- [ ] Restore is atomic (temp-file-then-rename)
- [ ] WhatsApp reconnect bounded (20 attempts → UI failure state)
- [ ] Standalone bundle drops 33M Sharp; initial JS reduced by lazy-loading

---

## Phase 5 — Feature Depth (~1.5 weeks, 5-7 PRs)

**Goal:** The WhatsApp inbox is deep enough to replace WhatsApp for the seller, and the AI extraction moat is measured + hardened. By end of Phase 5, the product *depth* matches a top-tier company.

### 5A. WhatsApp inbox depth (PR 31)
- **PR 31 — Inbox v2 (handoff #3):** message search (full-text on decrypted `Message.body` via `bodyBlindIndex` or in-memory index for small shops); media sending (image/voice note via sidecar); message templates (CRUD UI + insert-into-composer); broadcast (send template to N contacts); contact sync (sidecar → Conversation upsert). Verify with Agent Browser.

### 5B. AI extraction moat (PR 32)
- **PR 32 — Extraction metrics + HITL + fallback chain (handoff #5):** `ExtractionMetric` Prisma model (messageId, method, confidence, fieldAccuracy JSON, latencyMs, modelVersion); `/analytics/extraction` dashboard (accuracy over time, by method, by field, fallback rate); human-in-the-loop review queue for low-confidence (<0.6) extractions; fallback chain (regex → Gemini 2.5 → Gemini 2.0 → manual draft); confidence calibration UI.

### 5C. Integration testing (PRs 33-34)
- **PR 33 — Delivery adapter mock servers (TEST-007, handoff #4):** mock HTTP servers for Yalidine/Maystro/ZR Express/DHD; per-adapter test suite (estimate/create/sync/cancel success + error + timeout); run in CI.
- **PR 34 — E-commerce adapter mock servers + sync dedup (TEST-009, handoff #4):** mock servers for Shopify/WooCommerce/YouCan; per-adapter test suite; sync-engine dedup test (sync → re-sync → 0 duplicates); deleted-on-source behavior.

### 5D. Remaining service-layer + code-hygiene debt (PR 35)
- **PR 35 — Service-layer + DRY + dead code (CODE-011, CODE-015, CODE-018, CODE-019, CODE-026, CODE-030, CODE-031, CODE-032, CODE-037, CODE-038, CODE-039, CODE-040):** add `orderService.createFromStorefront` + `createFromAiChat`; refactor storefront/submit + AI tool through services; `returnService` (create, updateStatus, list); delete dead exports (CODE-018); consolidate `formatDate` to one location; add `ReturnItem` model; 409 includes existing customer; static imports for storefront/service; `service-base` uses logger; derive `OrderStatus` enum from single source; replace `as unknown as` with `Prisma.GetPayload`; centralize `SETTING_KEYS`; fix misleading `source: "seeded"`.

### Phase 5 Exit Criteria
- [ ] WhatsApp inbox: search + media + templates + broadcast work (Agent Browser verified)
- [ ] AI extraction: accuracy dashboard live; HITL queue processes low-confidence; fallback chain tested
- [ ] All 7 adapters tested against mock servers in CI; sync dedup verified
- [ ] Service layer owns all business logic (no fat routes); returns have a service; dead code removed

---

## Phase 6 — Market-Killer Ship (~1 week, 5-7 PRs)

**Goal:** Everything a top-tier company does to *launch*. Onboarding, macOS, CI, release flow, e2e, docs, supply chain. By end of Phase 6, the app is *shippable* to the first paying customers.

### 6A. Onboarding (PR 36)
- **PR 36 — 5-minute wizard (PROD-009):** 4-step setup (business profile → delivery provider + test → AI key + test → first product); skip-to-dashboard; empty-state CTAs on dashboard ("Create your first product", "Connect WhatsApp"); wizard state persisted (resume on refresh). Verify with Agent Browser (fresh DB → first order in <5 min).

### 6B. macOS + release flow (PRs 37-38)
- **PR 37 — macOS builds + updater capability (PROD-024, PROD-025, PROD-002):** Apple Developer cert + notarization; `build-macos` job in `release.yml` (`macos-latest`, universal binary `aarch64-apple-darwin` + `x86_64-apple-darwin`); `macos.signingIdentity` + `entitlements` in `tauri.conf.json`; add `updater:default` to capabilities; delete false macOS claims from `UPDATES.md` + fix `DESKTOP_BUILD.md` "NOT implemented" section.
- **PR 38 — Release flow hardening (PROD-015, PROD-016, PROD-017):** `release.ts` uses `@octokit/rest` (retries + rate limits + progress); `uploadAsset` retries 3x; `latest.json` uploaded only after all assets verified; `CHANGELOG.md` (Keep-a-Changelog format); release notes read from CHANGELOG; beta channel (`latest-beta.json` + Settings toggle); `--dry-run` flag; rollback docs.

### 6C. E2E (PR 39)
- **PR 39 — E2E golden paths (TEST-e2e):** Playwright config + 10 golden-path e2e tests (setup → login → create order → confirm → ship → deliver; storefront submit; import CSV; backup+restore; license trial; multi-shop switch; RTL switch; AI chat tool call; WhatsApp connect). Run in CI.

### 6D. Supply chain + env + docs (PRs 40-41)
- **PR 40 — Deps + env + gitignore (PROD-013, PROD-019, PROD-020, PROD-021, PROD-023, PROD-027, SEC-034):** bump vitest/vite/esbuild/postcss (fix 6 dev vulns); replace `googleapis@173` with `google-auth-library` + `fetch()`; add DHD_API_BASE to env.ts; expand `.env.example` (17 vars); `.gitignore` `data/app-meta.json` + create `.example`; remove APP_VERSION from `.env.example`; `save-exact=true` in `.npmrc`.
- **PR 41 — Docs sync (PROD-002, all docs):** sync `PROJECT_STATE.md`/`BUILD_LOG.md`/`DECISIONS.md`/`NEXT_SESSION_PREP.md`/`HONEST_ASSESSMENT.md` to current state; delete false claims in `UPDATES.md` + `DESKTOP_BUILD.md`; update `AGENT_HANDOFF.md` "Current State" for Session 19; add Session 19 ADRs to `DECISIONS.md`.

### Phase 6 Exit Criteria
- [ ] New seller onboards to first order in <5 minutes (Agent Browser verified on fresh DB)
- [ ] macOS: signed + notarized DMG builds in CI; auto-update works on macOS
- [ ] CI: green on every PR; runs sf-verify + coverage(70%+) + audit + e2e
- [ ] E2E: 10 golden paths pass in CI
- [ ] `bun run release` produces signed installers for Windows + macOS + Linux with changelog
- [ ] 0 known vulnerabilities in production deps; dev deps current
- [ ] All 15 docs accurate to current state; no false claims

---

## Founder Parallel Actions (not blocking, but high-leverage)

These should happen in parallel with the engineering phases:

1. **Apple Developer Program enrollment ($99/year)** — needed for Phase 6 macOS builds. Start NOW (approval takes days).
2. **GitHub Actions run history access** — check the actual failure message for the "broken" claim (Phase 2 PR 13). May be fixable in 1 hour.
3. **Real Darija WhatsApp messages (50+)** — validate AI extraction accuracy (Phase 5 PR 32). This is the load-bearing assumption for the AI moat.
4. **DHD API token** — email commercialedhb@gmail.com (needed for Phase 5 PR 33 integration tests against real DHD).
5. **YouCan Partner App credentials** — https://partners.youcan.shop (Phase 5 PR 34).
6. **Google Sheets Service Account JSON** — create GCP project (for live Google Sheets testing in Phase 5).
7. **Sentry + PostHog accounts** — free tiers suffice (Phase 2 PR 15). Get DSNs ready.
8. **Cloudflare Pages account** — for public storefront hosting (future, post-Phase 6).

---

## Progress Tracking

This plan is the canonical checklist. After each PR:
1. Update `BUILD_LOG.md` with the PR summary.
2. Update `PROJECT_STATE.md` metrics (tests, LOC, findings closed).
3. Tick the exit-criteria box here.
4. Update `AGENT_HANDOFF.md` "Current State" section if session ends.

At the end of each phase, the founder signs off on exit criteria before the next phase begins.

---

## Finding → Phase Coverage Matrix (verification that ALL 192 findings map to a phase)

| Phase | Finding IDs covered |
|---|---|
| **1** | SEC-001, SEC-002, SEC-003, SEC-004, SEC-006, SEC-009, SEC-010, SEC-011, SEC-013, SEC-014, SEC-016, SEC-017, SEC-018, SEC-019, SEC-020, SEC-021, SEC-022, SEC-025, CODE-002, CODE-003, CODE-004, CODE-005, CODE-006, CODE-013, CODE-029, UX-001, UX-002, UX-003, UX-004, UX-016, PROD-001, PROD-004, PROD-005, TEST-002, TEST-003 |
| **2** | SEC-005, SEC-007, SEC-008, SEC-024, SEC-026, SEC-027, PROD-003, PROD-006, PROD-007, PROD-008, PROD-010, PROD-012, PROD-014, PROD-018, PROD-026, PERF-013, PERF-017, PERF-020, TEST-001, TEST-004, TEST-005 |
| **3** | UX-005, UX-006, UX-007, UX-008, UX-009, UX-010, UX-011, UX-012, UX-013, UX-014, UX-015, UX-017, UX-018, UX-019, UX-020, UX-021, UX-022, UX-023, UX-024, UX-025, UX-026, UX-027, UX-028, UX-029, UX-030, UX-031, UX-032, UX-033, UX-034, UX-035, UX-036, UX-037, UX-038, UX-039, UX-040, UX-044, CODE-008, CODE-015, CODE-016, CODE-020, CODE-022, CODE-024, CODE-027, CODE-028 |
| **4** | PERF-001, PERF-002, PERF-003, PERF-004, PERF-005, PERF-006, PERF-007, PERF-008, PERF-009, PERF-011, PERF-012, PERF-014, PERF-015, PERF-016, PERF-018, PERF-021, PERF-022, PERF-023, PERF-024, PERF-026, SEC-030, CODE-001, CODE-012, CODE-014, CODE-023 |
| **5** | TEST-007, TEST-009, CODE-011, CODE-018, CODE-019, CODE-026, CODE-030, CODE-031, CODE-032, CODE-037, CODE-038, CODE-039, CODE-040 + handoff #3 (WhatsApp depth) + handoff #5 (AI extraction) |
| **6** | PROD-002, PROD-009, PROD-013, PROD-015, PROD-016, PROD-017, PROD-019, PROD-020, PROD-021, PROD-023, PROD-024, PROD-025, PROD-027, SEC-028, SEC-034, SEC-035 + TEST-e2e + docs sync |
| **Cross** (small, batched) | SEC-015, SEC-023, SEC-029, SEC-031, SEC-032, SEC-033, CODE-009, CODE-017, CODE-021, CODE-033, CODE-034, CODE-035, CODE-036, CODE-041, PERF-010, PERF-019, PERF-025, UX-041, UX-042, UX-043, UX-045, PROD-022, PROD-028, TEST-006, TEST-008, TEST-010, TEST-011, TEST-012, TEST-013, TEST-014, TEST-015, TEST-016 |

Every finding ID appears exactly once. No finding is orphaned. The "Cross" row covers P2/P3/P4 items that get batched into polish-sweep PRs within whichever phase is active when they're convenient (they're not phase-blockers).

---

_Last updated: 2026-06-30 (Session 19, Phase 0). Plan authored by Z.ai Coding Agent based on AUDIT_FINDINGS_v3.md. Total estimated effort: ~7.5 weeks, ~37-49 PRs across 6 phases. The goal is not "done" — the goal is "market-killer."_
