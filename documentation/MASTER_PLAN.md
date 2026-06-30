# SahelFlow — Master Plan to "Market-Killer" Ship

> **Created:** 2026-06-30 (Session 19, Phase 0 complete)
> **Audited state:** `main` @ `8ab25de` (v3.1.0), 391 tests green, ~47K LOC, ~150 audit findings (9 P0, ~40 P1)
> **Goal:** Ship a perfect, flawless, market-killer product - a top-tier company-grade COD platform for Algerian sellers.
> **Method:** Engineering loops on a phased roadmap. No phase starts until the prior exits. No "it compiles" as done.
> **Input:** `documentation/AUDIT_FINDINGS_v3.md` (canonical findings index). Every work item below references a finding ID.

---

## 0. Operating Model (how we execute)

### The Engineering Loop (per finding-cluster, per PR)
```
Audit -> Spec -> Implement -> Verify -> PR -> Merge -> Retro
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
5. **No new features until Phase 4.** Phase 1-3 are hardening + polish. The feature set is frozen.

### Branch + commit convention
- Branch: `agent/<phase>-<slug>` (e.g. `agent/p1-login-rate-limit`)
- Commit: `<type>(<scope>): <message>` (e.g. `fix(auth): add rate limiting to login (SEC-001)`)
- PR title: `[P1] SEC-001: login rate limiting + PBKDF2 600k`

---

## 1. Phase Overview

| Phase | Name | Goal | Duration | PRs (est) | Exit criteria |
|---|---|---|---|---|---|
| **0** | Audit + Plan | Deep professional audit + master plan | DONE | 1 (this doc) | AUDIT_FINDINGS_v3.md + MASTER_PLAN.md merged |
| **1** | Stop the Bleeding | Fix all P0 + critical P1 (security, data corruption, prod upgrade, mobile-broken) | ~1 week | 8-10 | 0 P0 findings. All P1 security/data findings closed. App upgrades cleanly. Mobile inbox+AI usable. |
| **2** | Foundation for Scale | Tests on critical paths, observability, auth hardening, license gating, migration runner | ~1.5 weeks | 6-8 | Critical-path test coverage >70%. Sentry + PostHog live. Rate limit + session revocation + audit log. License gates premium features. Tauri runs migrations on startup. |
| **3** | Perfection Sweep | Mobile + RTL + a11y + i18n completeness across all 25 pages. Storefront polish. Micro-interactions. | ~1 week | 5-7 | 0 P0/P1 UX findings. All 25 pages A-grade responsive. RTL arrows + formatDZD + plurals fixed. WCAG AA on critical paths. Storefront customer-facing polish done. |
| **4** | Scale + Depth | Performance (N+1, SSE abort, materialize risk), WhatsApp inbox depth, AI extraction moat, integration testing | ~1.5 weeks | 6-8 | Orders page <200ms at 10K orders. SSE aborts on disconnect. Risk analytics <100ms. WhatsApp search+media+templates. AI extraction metrics dashboard. Adapters tested against mock servers. |
| **5** | Market-Killer Ship | Onboarding wizard, macOS builds + notarization, CI fix, release flow hardening, e2e tests, supply chain, docs sync | ~1 week | 5-7 | 5-min onboarding to first order. macOS signed+notarized DMG. CI green on every PR. E2E covers 10 golden paths. All docs accurate. `bun run release` is one command. |

**Total: ~6 weeks, ~30-40 PRs.** Each PR ships through the engineering loop.

---

## Phase 1 - Stop the Bleeding (~1 week, 8-10 PRs)

**Goal:** Eliminate every P0 and every P1 that could corrupt data, breach security, or break the production upgrade path. By end of Phase 1, the app is *safe* to ship to existing users.

### 1A. Security criticals (PRs 1-3)
- **PR 1 - Login hardening (SEC-001, SEC-002):** per-IP rate limit on `/api/auth/login` (5/min, backoff, lockout); PBKDF2 600k; PIN min 8 chars; 1s constant delay; `setSetting` key allowlist (reject `auth_*`); `POST /api/auth/change-pin` (verifies current PIN). + tests.
- **PR 2 - Defense-in-depth (SEC-013/PROD-011):** `await requireAuth()` on all 48 unprotected mutating routes; introduce `withAuth()` HOF wrapping `withErrorHandler`. + integration test that unauthenticated POST returns 401 on 5 sample routes.
- **PR 3 - Setup-mode + session (SEC-006, SEC-004):** Tauri injects `AUTH_SECRET` env on spawn; startup health check refuses if unset-but-DB-has-secret; `Session` Prisma model (sessionId, issuedAt, lastSeenAt, revokedAt); 24h token rotation; `AuditLog` model; log login/logout/failed-attempt/PIN-change/backup-restore/license-activate.

### 1B. Data integrity criticals (PRs 4-6)
- **PR 4 - Search on encrypted fields (SEC-009, CODE-025):** add `nameBlindIndex` to Customer + `phoneBlindIndex` to Order; migrate existing rows (decrypt + re-index); rewrite `customer-extensions.search` + `order-extensions.search` to use blind indexes (exact match for phone, prefix for name); add `isBlacklisted Boolean` + `blacklistReason String?` + `blacklistedAt DateTime?` to Customer; migrate `[BLACKLISTED]` tags; update risk-engine service. + tests.
- **PR 5 - Transactional correctness (SEC-016, SEC-017, SEC-018, CODE-003, CODE-013):** wrap `orderService.update` item sync in `$transaction`; wrap import routes in per-batch `$transaction` + idempotency key for orders; `DELETE /api/orders/[id]` pre-check for returns -> 409; `returnService.updateStatus()` in `$transaction` (restore stock, adjust customer stats, emit notification) - mirrors `orderService.updateStatus`. + tests.
- **PR 6 - Schema/type drift (CODE-006, SEC-014, SEC-019, SEC-020, SEC-021):** add `"storefront"` + `"ai_chat"` to `OrderSource` enum, remove unused `"webstore"`; route storefront/submit + AI tool through `orderService.create`; add `"dhd"` to delivery/create Zod; add `onDelete: Cascade` to `ReturnNote.return`; delete local `VALID_CATEGORIES` in import/expenses (use `expenseCategorySchema`); Zod schemas for risk/blacklist + risk/rules. + tests.

### 1C. Production upgrade path (PR 7)
- **PR 7 - Migration runner (PROD-001, PROD-004, PROD-005):** generate proper `prisma migrate dev --name add_product_variants` migration; wire `prisma migrate deploy` into Tauri `setup` hook (before Next.js spawn) - locates active shop SQLite via `app-meta.json`, runs migrations, `PRAGMA integrity_check` first, on failure blocks startup + shows recovery UI; `release.ts` bumps `Cargo.toml` + `package.json` + `tauri.conf.json` atomically; derive `APP_VERSION` from `npm_package_version`; sync `Cargo.toml` to 3.1.0. + migration test (snapshot v3.0 DB -> run migration -> assert v3.1 schema).

### 1D. Mobile-broken core pages (PR 8)
- **PR 8 - Inbox + AI chat mobile (UX-003, UX-004):** `useMediaQuery` + drill-down pattern (list full-width on mobile -> tap -> thread slides in via Sheet with back button); keep desktop split. Verify with Agent Browser at 375px.

### 1E. Storefront customer-facing criticals (PR 9)
- **PR 9 - Storefront P0s (UX-001, UX-002, UX-016):** add `storefront.view.cart` key x 3 locales; `storefront/[slug]/not-found.tsx` -> `getI18n()` + 3 keys x 3 locales + fix "Go home" link; cart buttons -> `h-11 w-11`. Verify storefront flow end-to-end in Agent Browser.

### 1F. Security regressions from v2 (PR 10)
- **PR 10 - v2 regression fixes (SEC-010, SEC-011, SEC-022):** `escapeField` sanitizes formula chars (prefix `'` to `=+-@\t\r`); upload route strict extension allowlist + MIME->ext map + `path.basename` + resolved-path check + serve with `nosniff` + `Content-Disposition: attachment`; storefront rate limit keys on socket remote address (Tauri) or `CF-Connecting-IP` (Cloudflare) + per-storefront limit. + tests.

### Phase 1 Exit Criteria
- [ ] 0 P0 findings remain (9 -> 0)
- [ ] All P1 security + data-integrity findings closed (SEC-001/002/003/004/006/009/010/011/013/014/016/017/018/021/022, CODE-002/003/004/005/006/013)
- [ ] Tauri runs migrations on startup; v3.0 DB upgrades to v3.1 cleanly
- [ ] Inbox + AI chat usable at 375px (Agent Browser verified)
- [ ] Storefront customer flow works in AR + FR + EN (Agent Browser verified)
- [ ] `sf-verify` green; new tests cover every fix
- [ ] `PROJECT_STATE.md` + `BUILD_LOG.md` updated

---

## Phase 2 - Foundation for Scale (~1.5 weeks, 6-8 PRs)

**Goal:** Build the safety net + observability + commercial enforcement so the app can be operated and monetized at scale. By end of Phase 2, we have regression confidence, production visibility, and a working license model.

### 2A. Test foundation (PRs 11-13)
- **PR 11 - API route integration tests (TEST-002):** `src/app/api/__tests__/` harness. Top-10 routes: storefront/submit (public, rate limit, transactional), auth setup/login/logout, orders create/status/bulk, backup/restore, delivery/create, extraction. Real PrismaClient + mocked cookies.
- **PR 12 - AI agent + license + auth tests (TEST-003, TEST-004, TEST-005):** `agent.ts` mock-fetch tests (MAX_ITERATIONS, model fallback, timeout, no-key, unknown tool, SSE sequencing); per-tool tests against real DB; license trial invariant tests (8 cases with real Ed25519 keypair); auth flow integration test (setup -> login -> requireAuth -> logout).
- **PR 13 - CI enforcement (TEST-001, PROD-026):** CI runs `sf-verify` + `--coverage` (threshold enforced) + `bun audit` + `prisma migrate status`. Add `lcov` reporter for Codecov. Paths filter to skip docs-only.

### 2B. Observability (PRs 14-15)
- **PR 14 - Logging that survives (PROD-007):** Rust captures Next.js + sidecar stdout -> `data/logs/sahelflow-YYYY-MM-DD.log` with 7-day rotation + 5MB cap; replace 19 `console.*` with `logger.*`; add PII redaction layer in `formatMessage`; "Export logs" button in Settings (sanitized zip); fix logger header comment.
- **PR 15 - Sentry + PostHog + health (PROD-008, PROD-010):** `@sentry/nextjs` (Next surface) + `@sentry/bun` (sidecar) + Tauri Rust Sentry SDK; `beforeSend` scrubs PII; PostHog events (app_launched, setup_completed, first_order, first_delivery, first_ai_extraction, first_whatsapp_connect, license_activated, day_1/7_retention) with "Send usage data" toggle (off by default); `/api/health/deep` (DB + Gemini test + sidecar ping + delivery providers); topbar health dot; Tauri `wait_for_port` polls `GET /api/health` not raw TCP.

### 2C. Commercial enforcement + migrations cleanup (PRs 16-17)
- **PR 16 - License + feature gating (PROD-003, PROD-014):** wire `requireLicense()` into `withErrorHandler` (every protected route); `<FeatureGate feature="...">` component; gate premium UI (agents, storefronts, multi-shop, daily reports, Google Sheets); `FeatureFlag` Prisma model (key, enabled, rolloutPercentage) + `isFlagEnabled(key)` (machine-id hash for % rollout); `/admin/flags` page (founder-only).
- **PR 17 - Backup confidence (PROD-006):** round-trip test (backup -> mutate -> restore -> byte+query equality); daily auto-backup via Tauri Rust timer at configurable time; retention (7 daily + 4 weekly + 3 monthly, auto-prune); `PRAGMA integrity_check` after restore (auto-rollback on fail); restore restarts Next.js server (calls `disconnectAllShops()`).

### Phase 2 Exit Criteria
- [ ] Critical-path test coverage >70% (storefront/submit, auth, orders, backup, delivery, extraction, AI agent, license, multi-shop)
- [ ] CI green on every PR with `sf-verify` + coverage threshold + `bun audit`
- [ ] Sentry captures errors on all 3 surfaces; PostHog fires key funnel events
- [ ] `/api/health/deep` works; topbar shows health dot
- [ ] `requireLicense()` enforces on every protected route; `<FeatureGate>` hides premium UI for basic license
- [ ] Backup restore verified by automated test; auto-backup scheduled; retention enforced
- [ ] Logs persist to file with rotation; "Export logs" works

---

## Phase 3 - Perfection Sweep (~1 week, 5-7 PRs)

**Goal:** Every page looks and feels like Linear/Stripe/Notion. Mobile-first, RTL-correct, accessible, fully translated. By end of Phase 3, the app is *beautiful* on every device in every locale.

### 3A. Mobile + responsive sweep (PRs 18-19)
- **PR 18 - Detail pages + tables (UX-013, CODE-022):** migrate `customers/[id]`, `products/[id]`, `import-panel`, `backup-restore-panel` to `<PremiumTable>`; add `overflow-x-auto` wrappers; responsive column hiding via `hideOn`.
- **PR 19 - Topbar + command palette + grids (UX-015, UX-030, UX-034):** mobile-visible search icon opens command palette; automations page uses `<StatCard>`; consistent `grid-cols-1` mobile fallback across all grids; stat-card grids on small screens.

### 3B. RTL completion (PR 20)
- **PR 20 - RTL arrows + logical props + formatDZD (UX-006, UX-007, UX-022, UX-023):** `rtl:rotate-180` on all 11 directional arrows; migrate shadcn UI components to logical props (`pl-8`->`ps-8` etc.); clarify/remove `flex-row-reverse` in sidebar; `formatDZD(amount, locale)` - `ar`->"دج", `fr`->"DA", `en`->"DZD"; update ~30 call sites.

### 3C. i18n + a11y (PRs 21-22)
- **PR 21 - Arabic plurals + hardcoded strings (UX-008, UX-018, UX-019, UX-028):** CLDR plural support in `t()` (`key_zero/one/two/few/many/other` via `Intl.PluralRules("ar")`); migrate 8 count-based strings; replace 11 hardcoded English fallbacks + 4 aria-labels with `t()`; storefront loading skeleton matches product grid.
- **PR 22 - a11y (UX-010, UX-011, UX-012, UX-014, UX-020, UX-021):** `prefers-reduced-motion` `@media` block; sortable `<th>` + clickable `<tr>` keyboard-accessible (`role="button"`, `tabIndex`, `onKeyDown`, `aria-sort`); settings tabs -> Radix `Tabs`; skip-to-content link rendered; `role="status"`/`aria-live` on cart count, status badges, AI chat message list, inbox unread count.

### 3D. Storefront + micro-interactions polish (PR 23)
- **PR 23 - Storefront perfection (UX-005, UX-009, UX-016, UX-026, UX-027, UX-029, UX-036):** `OrderStatusBadge` optimistic-update fix (rollback + toast on error); order edit panel unsaved-changes warning; storefront product images rendered; COD form client-side Zod validation (inline errors, `aria-describedby`); storefront uses `formatDZD(price, locale)`; "Add to cart" success feedback (button state + cart badge); cart buttons `h-11 w-11`.

### Phase 3 Exit Criteria
- [ ] All 25 pages A-grade responsive at 375/768/1280/1920 (Agent Browser verified per page)
- [ ] RTL: every directional arrow flips; `formatDZD` localized; shadcn components use logical props
- [ ] Arabic plurals correct (6 CLDR forms) on all count strings
- [ ] 0 hardcoded user-facing English strings in src/
- [ ] WCAG AA: skip-link, keyboard nav on all interactive elements, `aria-sort`/`aria-live`/`role="status"` where needed, `prefers-reduced-motion` respected
- [ ] Storefront: product images, inline form validation, localized currency, add-to-cart feedback, 44px touch targets

---

## Phase 4 - Scale + Depth (~1.5 weeks, 6-8 PRs)

**Goal:** The app is fast at scale, the WhatsApp inbox is deep enough to replace WhatsApp for the seller, and the AI extraction moat is measured + hardened. By end of Phase 4, the product *depth* matches a top-tier company.

### 4A. Performance (PRs 24-26)
- **PR 24 - Orders page + risk N+1 (PERF-001, PERF-003, PERF-007, PERF-008):** SSE agent aborts on client disconnect (`req.signal` + `cancel()` handler); `batchAssessOrders` batches the 4 lookups (`findMany` + `groupBy`) - 800 queries -> ~4; orders page `select` only rendered fields (eliminate 200 PII decryptions); dedupe `allOrders`/`filteredOrders` when no filter.
- **PR 25 - DB hygiene + indexes + pagination (PERF-002, PERF-004, PERF-006, PERF-009):** `db` Proxy caches `app-meta.json` (1-2s TTL or mtime); `@@index([customerId])` on Order + `@@index([createdAt])` on Customer; shop-switch disconnects old Prisma client + LRU(3); orders page cursor pagination (`where: { createdAt: { lt: cursor } }`) + "Showing N of M" count.
- **PR 26 - Materialize risk + lazy load (PERF-011, PERF-026, CODE-001):** persist `RiskAssessment` per Order (score + level + triggeredRules) at creation + on status change; analytics reads pre-computed; `next/dynamic` lazy-load AiChat + chart components + import panel; remove dead deps (`@tanstack/react-query`, `react-syntax-highlighter` config).

### 4B. WhatsApp inbox depth (PR 27)
- **PR 27 - Inbox v2 (handoff #3):** message search (full-text on decrypted `Message.body` via a `bodyBlindIndex` or in-memory index for small shops); media sending (image/voice note via sidecar); message templates (CRUD UI + insert-into-composer); broadcast (send template to N contacts); contact sync (sidecar -> Conversation upsert). Verify with Agent Browser.

### 4C. AI extraction moat (PR 28)
- **PR 28 - Extraction metrics + HITL (handoff #5):** `ExtractionMetric` Prisma model (messageId, method, confidence, fieldAccuracy JSON, latencyMs, modelVersion); `/analytics/extraction` dashboard (accuracy over time, by method, by field, fallback rate); human-in-the-loop review queue for low-confidence (<0.6) extractions; fallback chain (regex -> Gemini 2.5 -> Gemini 2.0 -> manual draft); confidence calibration UI.

### 4D. Integration testing (PR 29)
- **PR 29 - Adapter mock servers (TEST-007, TEST-009, handoff #4):** mock HTTP servers for Yalidine/Maystro/ZR Express/DHD/Shopify/WooCommerce/YouCan; per-adapter test suite (estimate/create/sync/cancel success + error + timeout); sync-engine dedup test (sync -> re-sync -> 0 duplicates); run in CI.

### 4E. Reliability hardening (PR 30)
- **PR 30 - Retries + atomic restore + reconnect bounds (PERF-005, PERF-013, PERF-014, PERF-015, PERF-016):** move `retryFetch` to `lib/integrations/http.ts`; wrap DHD + Gemini + e-commerce adapters + sidecar client; restore uses temp-file-then-rename (atomic); WhatsApp socket `MAX_RECONNECT_ATTEMPTS=20` + UI "WhatsApp unavailable - retry" state.

### Phase 4 Exit Criteria
- [ ] Orders page <200ms at 10K orders (Agent Browser perf trace)
- [ ] Risk analytics page <100ms at 50K orders
- [ ] SSE agent aborts within 1s of client disconnect
- [ ] Shop-switch leaks 0 Prisma clients
- [ ] WhatsApp inbox: search + media + templates + broadcast work (Agent Browser verified)
- [ ] AI extraction: accuracy dashboard live; HITL queue processes low-confidence; fallback chain tested
- [ ] All 7 adapters tested against mock servers in CI; sync dedup verified
- [ ] All external calls have timeout + retry; restore is atomic; WhatsApp reconnect bounded

---

## Phase 5 - Market-Killer Ship (~1 week, 5-7 PRs)

**Goal:** Everything a top-tier company does to *launch*. Onboarding, macOS, CI, release flow, e2e, docs, supply chain. By end of Phase 5, the app is *shippable* to the first paying customers.

### 5A. Onboarding (PR 31)
- **PR 31 - 5-minute wizard (PROD-009):** 4-step setup (business profile -> delivery provider + test -> AI key + test -> first product); skip-to-dashboard; empty-state CTAs on dashboard ("Create your first product", "Connect WhatsApp"); wizard state persisted (resume on refresh). Verify with Agent Browser (fresh DB -> first order in <5 min).

### 5B. macOS + release flow (PRs 32-33)
- **PR 32 - macOS builds (PROD-024, PROD-025):** Apple Developer cert + notarization; `build-macos` job in `release.yml` (`macos-latest`, universal binary `aarch64-apple-darwin` + `x86_64-apple-darwin`); `macos.signingIdentity` + `entitlements` in `tauri.conf.json`; add `updater:default` to capabilities.
- **PR 33 - Release flow hardening (PROD-015, PROD-016, PROD-017):** `release.ts` uses `@octokit/rest` (retries + rate limits + progress); `uploadAsset` retries 3x; `latest.json` uploaded only after all assets verified; `CHANGELOG.md` (Keep-a-Changelog format); release notes read from CHANGELOG; beta channel (`latest-beta.json` + Settings toggle); `--dry-run` flag.

### 5C. E2E + CI fix (PR 34)
- **PR 34 - E2E + CI (TEST-e2e, PROD-012, PROD-026):** Playwright config + 10 golden-path e2e tests (setup -> login -> create order -> confirm -> ship -> deliver; storefront submit; import CSV; backup+restore; license trial; multi-shop switch; RTL switch; AI chat tool call; WhatsApp connect); diagnose GitHub Actions "broken" claim (check Actions run history); CI runs sf-verify + coverage + audit + e2e.

### 5D. Supply chain + docs (PR 35)
- **PR 35 - Deps + docs sync (PROD-002, PROD-013, PROD-019, PROD-020, PROD-021, PROD-023, PROD-027):** bump vitest/vite/esbuild/postcss (fix 6 dev vulns); replace `googleapis@173` with `google-auth-library` + `fetch()`; add DHD_API_BASE to env.ts; expand `.env.example` (17 vars); `.gitignore` `data/app-meta.json` + create `.example`; delete false claims in `UPDATES.md` + `DESKTOP_BUILD.md`; sync `PROJECT_STATE.md`/`BUILD_LOG.md`/`DECISIONS.md`/`NEXT_SESSION_PREP.md` to current state; add `save-exact=true` to `.npmrc`.

### Phase 5 Exit Criteria
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

1. **Apple Developer Program enrollment ($99/year)** - needed for Phase 5 macOS builds. Start NOW (approval takes days).
2. **GitHub Actions run history access** - check the actual failure message for the "broken" claim (Phase 5 PR 34). May be fixable in 1 hour.
3. **Real Darija WhatsApp messages (50+)** - validate AI extraction accuracy (Phase 4 PR 28). This is the load-bearing assumption for the AI moat.
4. **DHD API token** - email commercialedhd@gmail.com (needed for Phase 4 PR 29 integration tests against real DHD).
5. **YouCan Partner App credentials** - https://partners.youcan.shop (Phase 4 PR 29).
6. **Google Sheets Service Account JSON** - create GCP project (for live Google Sheets testing in Phase 4).
7. **Sentry + PostHog accounts** - free tiers suffice (Phase 2 PR 15). Get DSNs ready.
8. **Cloudflare Pages account** - for public storefront hosting (future, post-Phase 5).

---

## Sequencing Rationale

**Why Phase 1 before Phase 2 (tests first)?** Because Phase 1 fixes are P0 - they're actively harming users/security *now*. We can't wait 1.5 weeks for a test suite before fixing a brute-forceable login. Phase 1 PRs ship with their own regression tests (per-PR), then Phase 2 builds the systematic net.

**Why Phase 3 (perfection) before Phase 4 (depth)?** Because a beautiful app with shallow features beats an ugly app with deep features for *first impression*. Phase 3 makes the app look like Linear; Phase 4 makes it work like Stripe. Sellers sign up for the look, stay for the depth.

**Why Phase 5 last?** Onboarding, macOS, e2e, and release flow are launch activities. They need the app to be correct (Phase 1-2), polished (Phase 3), and deep (Phase 4) first. Shipping onboarding for a broken app = wasted work.

**Why no new features in Phase 1-3?** The honest assessment (Session 18) said: "Stop adding features. Freeze the feature set." The gap to market-killer is engineering rigor + UX polish, not features. The only "new" work is WhatsApp inbox depth (Phase 4) and onboarding (Phase 5) - both of which close existing gaps, not add net-new surface area.

---

## Progress Tracking

This plan is the canonical checklist. After each PR:
1. Update `BUILD_LOG.md` with the PR summary.
2. Update `PROJECT_STATE.md` metrics (tests, LOC, findings closed).
3. Tick the exit-criteria box here.
4. Update `AGENT_HANDOFF.md` "Current State" section if session ends.

At the end of each phase, the founder signs off on exit criteria before the next phase begins.

---

_Last updated: 2026-06-30 (Session 19, Phase 0). Plan authored by Z.ai Coding Agent based on AUDIT_FINDINGS_v3.md. Total estimated effort: ~6 weeks, ~30-40 PRs. The goal is not "done" - the goal is "market-killer."_
