# SahelFlow v3.1.0 — Professional Audit Findings (v3)

> **Generated:** 2026-06-30 (Session 19, Phase 0)
> **Audited commit:** `8ab25de` (main, v3.1.0)
> **Method:** 6 parallel deep-audit tracks (SEC, CODE, PERF, UX, TEST, PROD), each citing real `path:line`.
> **Purpose:** Input to `MASTER_PLAN.md`. Every finding drives a phased work item.
> **Prior audit:** `AUDIT_FINDINGS_v2.md` (Session 13) — do not re-report fixed issues.

---

## Executive Summary

| Track | Findings | P0 | P1 | P2 | P3 | P4 | Grade |
|---|---|---|---|---|---|---|---|
| SEC — Security & Data Integrity | 35 | 1 | 12 | 12 | 7 | 3 | C+ |
| CODE — Code Quality & Architecture | 41 | 0 | 6 | 11 | 15 | 9 | B- |
| PERF — Performance & Reliability | 26 | 0 | 6 | 12 | 6 | 2 | B- |
| UX — UX/Responsive/RTL/i18n/a11y | 45 | 4 | 13 | 13 | 10 | 5 | C+ |
| TEST — Test Coverage & Quality | 17 | 2 | 3 | 6 | 5 | 1 | D overall |
| PROD — Production Readiness & DX | 28 | 2 | 9 | 10 | 5 | 2 | D+ |
| **Raw total** | **192** | **9** | **49** | **64** | **48** | **22** | - |
| **Deduplicated** | **~150** | **9** | **~40** | **~55** | **~35** | **~15** | - |

**One-line verdict:** A strong MVP (~90% to production-grade) with a mature PII-encryption + risk-engine core, but real security holes, silent data-corruption bugs, a broken production upgrade path, mobile-broken core pages, and dangerously thin test coverage on critical paths. The gap to "market-killer" is ~6 weeks of focused engineering rigor - not new features.

---

## P0 - Critical (ship-blockers / security holes / data loss / broken core flows)

### P0-1 . SEC-001 . No rate limiting on `/api/auth/login` + 4-char PIN = brute-forceable
- **Loc:** `src/app/api/auth/login/route.ts:11-57`, `src/app/api/auth/setup/route.ts:7` (`pin.min(4)`), `src/lib/auth/crypto.ts:147` (`iterations: 100_000`)
- **Impact:** 4-digit PIN cracked in ~8 min; 6-digit in ~17 min. No lockout, no captcha, no delay.
- **Fix:** Per-IP rate limit (5/min, backoff after 3 fails, 15-min lockout after 10); raise PIN min to 8; raise PBKDF2 to 600k (OWASP 2023); constant 1s delay per attempt.
- **Effort:** M

### P0-2 . SEC-002 . `PUT /api/settings` accepts ANY key -> auth takeover via `auth_pin_hash` overwrite
- **Loc:** `src/app/api/settings/route.ts:14-33` (no key allowlist), `src/lib/settings/index.ts:48-55`
- **Impact:** Attacker with one stolen session (or middleware bypass) overwrites the PIN hash -> full account takeover.
- **Fix:** Key allowlist in `setSetting` (reject `auth_*`); move auth secrets out of `Setting` table; require current PIN verification for PIN changes; add `POST /api/auth/change-pin`.
- **Effort:** M

### P0-3 . SEC-009 . Customer/order search silently broken on encrypted fields (phone, name)
- **Loc:** `src/lib/data/extensions/customer-extensions.ts:50-56` (`contains` on encrypted `name`/`phone`), `order-extensions.ts:37-44`, `crypto/customer-encryption.ts:196-222` (`rewriteCustomerWhere` only handles top-level `where.phone`, not `OR[]`)
- **Impact:** Primary UI search feature returns ZERO results for any phone or customer-name query. Sellers conclude the app is broken.
- **Fix:** Add blind indexes for `Customer.name` + `Order.phone`; change phone search to exact-match (blind index); document search limitations in UI.
- **Effort:** M

### P0-4 . UX-001 . Missing i18n key `storefront.view.cart` on PUBLIC storefront
- **Loc:** `src/components/storefront/storefront-view.tsx:222`; key absent from all 3 locale files
- **Impact:** Every customer who adds an item to cart sees the literal string "storefront.view.cart" as the cart header. Customer-facing trust destruction.
- **Fix:** Add key x 3 locales. 3-line fix.
- **Effort:** S (5 min)

### P0-5 . UX-002 . Storefront not-found page is 100% hardcoded English (customer-facing)
- **Loc:** `src/app/storefront/[slug]/not-found.tsx:7-13`
- **Impact:** Arabic/French customers see English-only when they typo a storefront URL.
- **Fix:** `getI18n()` + 3 keys x 3 locales; fix "Go home" link (currently goes to `/dashboard` - a private page).
- **Effort:** S (15 min)

### P0-6 . UX-003 . Inbox unusable on mobile (fixed 320px sidebar -> 55px thread)
- **Loc:** `src/components/inbox/inbox-live.tsx:321` (`w-80` fixed)
- **Impact:** Core daily-use page broken on the primary device (phones) for the target market (Algerian sellers).
- **Fix:** Mobile drill-down pattern (list -> thread via Sheet/overlay); keep desktop split.
- **Effort:** M (2-3 hrs)

### P0-7 . UX-004 . AI Chat (agents page) unusable on mobile (fixed 288px sidebar -> 87px chat)
- **Loc:** `src/components/ai/ai-chat.tsx:339` (`w-72` fixed)
- **Impact:** Flagship AI feature unusable on mobile.
- **Fix:** Same drill-down pattern as P0-6.
- **Effort:** M (2-3 hrs)

### P0-8 . PROD-001 + PROD-004 . ProductVariant missing from migration.sql + Tauri doesn't run migrations on startup
- **Loc:** `prisma/migrations/20260624000000_init/migration.sql` (24 tables, missing ProductVariant), `src-tauri/src/lib.rs:97-130` (no migration runner)
- **Impact:** Every existing user updating to the next schema-evolving release hits "no such table" crashes with no recovery path. Production upgrade path is broken.
- **Fix:** Generate proper migration; wire `prisma migrate deploy` into Tauri setup hook (before Next.js spawn); add migration test; integrity check + backup-on-migration safety net.
- **Effort:** L (2-3 days)

### P0-9 . TEST-002 + TEST-003 . ZERO tests for 83 API routes (incl. PUBLIC storefront submit) + 30 AI tools
- **Loc:** All `src/app/api/**/route.ts`; `src/lib/ai/chat/agent.ts` + `tools/*` (2,428 LOC at 0%)
- **Impact:** Public storefront submit (unauthenticated, writes PII + creates orders) has no regression net. AI agent loop (MAX_ITERATIONS, model fallback, tool dispatch, SSE) is high-churn and untested.
- **Fix:** Integration tests for top-10 routes (storefront/submit, auth setup/login/logout, orders create/status, backup/restore, delivery/create, extraction); agent.ts mock tests + per-tool tests.
- **Effort:** L (1-2 sprints for top routes; 3-5 days for AI)

---

## P1 - High (correctness bugs, significant UX failures, major gaps)

### Security & Data Integrity
- **SEC-003** Storefront config `[id]` route (GET/PUT/DELETE) publicly accessible via trailing-slash `startsWith` match. `src/lib/auth/config.ts:32,50-52`. Fix: exact + method-aware match, or move public GET to `/api/storefront/public/[slug]`. Effort: S.
- **SEC-004** No session revocation/rotation/audit; 7-day TTL stateless tokens. `src/lib/auth/crypto.ts:63-81`, `server.ts:87-107`. Stolen token = 7 days access, no recourse. Fix: `Session` table + JTI + revoked-set + 24h rotation + `AuditLog`. Effort: M.
- **SEC-005** `isLicenseValid()` fail-opens when cache empty (fresh server start). `license-service.ts:318-334`. Fix: fail-closed; persist last status to Setting; Tauri validates before spawning Next.js. Effort: M.
- **SEC-006** Setup-mode middleware bypass: `AUTH_SECRET` env unset -> all requests allowed, even after DB has secret. `middleware.ts:21-26`. Fix: Tauri injects `AUTH_SECRET` env on spawn; startup health check refuses if unset-but-DB-has-secret. Effort: M.
- **SEC-007** Machine ID is single-signal (OS UUID only); 5-signal fingerprint is fake. `license/index.ts:68-80`, `machine-id.ts`, `lib.rs:23-95`. Fix: real multi-signal collection in Rust (CPU/mobo/disk/MAC/OS); remove `"DEV-MOCK-MACHINE-ID-FALLBACK"`; Stronghold trial counter. Effort: L.
- **SEC-008** Trial exploitation via localStorage deletion = infinite 7-day trials. `license/index.ts:107-116,150-214`. Fix: Stronghold-backed trial counter + `firstTrialIssuedAt`. Effort: M.
- **SEC-010** CSV formula injection (regression of v2 S15). `src/lib/import/export.ts:22-27` (`escapeField` doesn't sanitize `=+-@\t\r`). Malicious customer name -> code execution when seller opens CSV in Excel. Fix: prefix `'` to formula chars. Effort: S.
- **SEC-011** Upload route: path traversal via extension + stored XSS via `.html`/`.svg`. `src/app/api/upload/route.ts:56-66`. Fix: strict extension allowlist; derive ext from verified MIME; `path.basename` + resolved-path check; serve uploads with `nosniff` + `Content-Disposition: attachment`. Effort: S.
- **SEC-012** AI chat has no rate limiting -> Gemini quota exhaustion + prompt-injection exposure. `ai/sessions/[id]/messages/stream/route.ts:36-159`, `agent.ts:70-199`. Fix: per-session rate limit (20/min, 100/hr); daily Gemini budget; confirmation for destructive tools. Effort: M.
- **SEC-013 / PROD-011** 48 of 56 mutating API routes have NO `requireAuth()` defense-in-depth. Only 8 routes call it. Fix: `await requireAuth()` as first line of every mutating handler; consider `withAuth()` HOF. Effort: M (~96 lines mechanical).
- **SEC-014** `POST /api/delivery/create` non-transactional + provider enum omits `"dhd"`. `delivery/create/route.ts:78-108,11`. DHD shipments can't be created. Fix: `$transaction`; use `deliveryProviderSchema`. Effort: S.
- **SEC-016** `PATCH /api/orders/[id]` item sync non-transactional (race + partial failure). `order-service.ts:209-250`. Fix: wrap in `$transaction`; optimistic concurrency via `updatedAt`. Effort: M.
- **SEC-017** Import insert loops non-transactional (partial imports on failure, no idempotency). `api/import/{orders,products,customers,expenses}/route.ts`. Fix: per-batch `$transaction`; idempotency key for orders; `batchId` for retry. Effort: M.
- **SEC-018** `DELETE /api/orders/[id]` 500s on orders with returns (comment claims cascade, schema defaults to Restrict). `orders/[id]/route.ts:37-38`, `schema.prisma:231`. Fix: pre-check for returns -> 409; or `onDelete: Cascade`. Effort: S.
- **SEC-021** Risk blacklist + rules routes use `as` type assertions instead of Zod. `risk/blacklist/route.ts:15`, `risk/rules/route.ts:16`. Arbitrary rule injection -> 500s on every assessment. Fix: Zod schemas. Effort: S.
- **SEC-022** XFF-spoofable rate limit on storefront submit. `storefront/submit/route.ts:73-75`. Fix: socket remote address (Tauri) or `CF-Connecting-IP` (Cloudflare); per-storefront limit. Effort: S.

### Code Quality & Architecture
- **CODE-001** N+1 in `risk-engine/analytics.ts:105-117` (sequential per-order, 600-800 queries for 200 orders). Fix: `Promise.all` like `batchAssessOrders`; long-term persist `RiskAssessment` per order. Effort: S.
- **CODE-002** `Customer.riskScore` never updated by app code - UI always shows "Low . 0". `schema:107`, `customers/page.tsx:127,144`. Fix: `customerService.refreshRiskScore()` after every status transition; single 0-100 scale. Effort: M.
- **CODE-003** `orderService.update` non-transactional item sync. `order-service.ts:202-253`. Fix: `$transaction` + `tx.*`. Effort: S.
- **CODE-004** `customerService.create` TOCTOU race on phone uniqueness (P2002 not mapped to 409). `customer-service.ts:37-50`. Fix: `upsert` or catch P2002 -> `ConflictError`. Effort: S.
- **CODE-005** `StorefrontConfig` JSON columns parsed without try/catch -> one malformed row locks seller out of all storefronts. `storefront/service.ts:61-63`. Fix: try/catch + Zod on read. Effort: S.
- **CODE-006** `Order.source` type/code drift: schema type defines 7 values, runtime writes 9 (`"storefront"`, `"ai_chat"` via bypass paths; `"webstore"` in type but never written). `schema:133`, `domain.ts:23`, `validation:46-54`, bypass: `storefront/submit:169`, `core-tools.ts:253`. Fix: add 2 values to enum + remove `"webstore"`; route bypass paths through `orderService.create`. Effort: M.
- **CODE-013** `returns/[id]` PATCH has no side effects (stock never restored, customer stats never adjusted) - regression of v2 W12. `returns/[id]/route.ts:50-53`. Fix: `returnService.updateStatus()` in `$transaction` mirroring `orderService.updateStatus`. Effort: M.

### Performance & Reliability
- **PERF-001** SSE agent loop doesn't abort on client disconnect -> orphaned Gemini calls + DB work (up to 150s). `ai/sessions/[id]/messages/stream/route.ts:99-147`, `agent.ts:231-418`. Fix: check `req.signal.aborted`; pass signal to `fetch`; `cancel()` handler. Effort: S.
- **PERF-002** `db` Proxy does sync `readFileSync` on every property access (~800 sync reads for 200-order page). `db.ts:511-565`. Fix: in-memory cache with 1-2s TTL or mtime check; invalidate on shop-switch. Effort: S.
- **PERF-003** N+1 in `batchAssessOrders` (orders page) - 200 orders x 4 queries = 800 serialized SQLite round trips per page load. `risk-engine/service.ts:214-239`. Fix: batch the 4 lookups (`findMany` + `groupBy`). Effort: M.
- **PERF-004** Missing `@@index([customerId])` on Order model (hot path full scan). `schema:144-148`. Fix: add index + migration. Effort: S.
- **PERF-005** DHD delivery adapter: no timeout, no retry (can hang indefinitely). `dhd.ts:68,128,206,263`. Fix: wrap in `retryFetch`. Effort: S.
- **PERF-006** Shop-switch leaks Prisma clients (no disconnect; no LRU). `db.ts:603-613`, only called from `restoreBackup`. Fix: disconnect on shop-switch; `process.on("beforeExit")` hook; LRU(3). Effort: S.

### UX / Responsive / RTL / i18n / a11y
- **UX-005** `OrderStatusBadge` optimistic update silently fails (error swallowed by `startTransition`). `order-status-badge.tsx:89-122`. Fix: move fetch outside `startTransition` or add inner `.catch()`. Effort: S.
- **UX-006** 11 of 12 directional arrows don't flip in RTL. Multiple files. Fix: `rtl:rotate-180` or `icon-rtl-flip` class. Effort: S.
- **UX-007** `formatDZD` ignores locale (always French formatting + "DA"). `utils.ts:18-23`. Fix: add `locale` param; `ar` -> "دج". Effort: S.
- **UX-008** Arabic pluralization broken (no CLDR support; 6 forms needed). `use-i18n.ts:70-81`. Fix: CLDR plural support in `t()`. Effort: M.
- **UX-009** Order edit panel has no unsaved-changes warning. `order-edit-panel.tsx`. Fix: dirty-state tracking + `beforeunload` + confirm dialog. Effort: S.
- **UX-010** Sortable table headers not keyboard accessible (no `role="button"`, no `aria-sort`). `orders-table-client.tsx:203,207,213,219`. Effort: S.
- **UX-011** Clickable order rows not keyboard accessible. `orders-table-client.tsx:242-253`. Effort: S.
- **UX-012** No `prefers-reduced-motion` support (40+ animations). `globals.css:334-357`. Fix: 1 `@media` block. Effort: S (5 min).
- **UX-013** `customers/[id]` + `products/[id]` tables overflow on mobile (base `<Table>`, no `overflow-x-auto`). Fix: migrate to `<PremiumTable>` or wrap. Effort: S.
- **UX-014** Settings tabs lack ARIA tab semantics (no `role="tab"`, no arrow nav). `settings-tabs.tsx:33-59`. Fix: use Radix `Tabs` (already a dep). Effort: S.
- **UX-015** Command palette trigger invisible on mobile (`hidden sm:flex`). `topbar.tsx:171`. Fix: mobile-visible search icon. Effort: S.
- **UX-016** Storefront cart buttons 24px (below 44px touch minimum). `storefront-view.tsx:241,245,248`. Fix: `h-11 w-11`. Effort: S.
- **UX-017** Project "no indigo/blue" rule violated in 5 files. Fix: replace `blue-*` with `sky-*`/`cyan-*`/`teal-*`; Shopify -> `emerald-*`. Effort: S.

### Production Readiness & DX
- **PROD-002** Docs claim macOS CI builds that don't exist + list 3 implemented features as NOT done. `UPDATES.md:53-54`, `DESKTOP_BUILD.md:174-177`. Fix: delete false claims or add real macOS job. Effort: S (docs) / L (macOS CI).
- **PROD-003** License feature-gating is dead code (`hasFeature`/`requireLicense`/`FEATURE_KEYS` never called from src/). `license-service.ts:318-376`. Every user gets all features. Fix: wire `requireLicense()` into `withErrorHandler`; build `<FeatureGate>`; gate premium UI. Effort: M.
- **PROD-005** Triple version drift: `Cargo.toml` stuck at 3.0.0, `package.json`/`tauri.conf.json` at 3.1.0, `env.ts`/`health`/`.env.example` fallback to 3.0.0. `release.ts:105-115` only bumps 2 files. Fix: release.ts bumps all; derive APP_VERSION from `npm_package_version`. Effort: S.
- **PROD-006** Backup restore UNTESTED, no auto-backup, no retention, no `PRAGMA integrity_check`. `backup/index.ts`, `backup-restore-panel.tsx:101-128`. Fix: round-trip test; daily auto-backup; 7d/4w/3m retention; integrity check post-restore; restart server on restore. Effort: L.
- **PROD-007** Logger writes to stdout that Tauri doesn't persist; "78+ calls replaced" claim is false (only 6 logger.* vs 19 console.*). `logger.ts`, `lib.rs:148-156`. Fix: Rust captures sidecar stdout -> `data/logs/` with rotation; "Export logs" button; replace 19 console.*; fix comment. Effort: M.
- **PROD-008** No Sentry/PostHog/metrics - zero production visibility. Fix: `@sentry/nextjs` + `@sentry/bun` + Tauri Rust Sentry; PostHog events (signup, first order, retention); `Metric` model for extraction accuracy/sync latency. Effort: L.
- **PROD-009** Onboarding is PIN-only; no guided setup; dashboard has no empty-state guidance. `setup/page.tsx`, `dashboard/page.tsx`. Fix: 4-step wizard (business profile -> delivery -> AI key -> first product); empty-state CTAs. Effort: L.
- **PROD-010** Health endpoint not a real launch probe (Tauri does raw TCP, not HTTP); no deep health check. `lib.rs:217-228`, `health/route.ts`. Fix: poll `GET /api/health` until 200; add `/api/health/deep` (DB + Gemini + sidecar + delivery providers); topbar status dot. Effort: M.

### Test Coverage & Quality (P1)
- **TEST-001** Coverage threshold (60%) not enforced in CI (runs `vitest run` without `--coverage`). `ci.yml:62`. Actual coverage 30.9% statements - below floor - ships undetected. Effort: S.
- **TEST-004** License trial validation flow (376 LOC) at 0% - fail-closed policy untested. `license-service.ts:1-376`. Fix: generate Ed25519 keypair in setup; test 8 cases (valid/tampered/trial invariants/expired/dev bypass). Effort: M.
- **TEST-005** Auth flow (setup -> login -> session -> logout) at 0%. `auth/server.ts:1-142`. Fix: integration test with real PrismaClient + mocked `cookies()`. Effort: S.

---

## P2 - Medium (grouped by theme)

### Transactions & data integrity
SEC-015 (`updateMany`/`count` not intercepted by PII extension - latent), SEC-019 (`ReturnNote` no relation -> orphaned on Return delete), SEC-020 (expense category mismatch import vs schema), SEC-023 (XFF-spoofable rate limit), SEC-024 (logger doesn't redact PII), SEC-025 (`db push` not `migrate deploy`; `--accept-data-loss` dangerous), SEC-026 (setup secret write can fail silently), CODE-012 (`incrementRuleTriggers` TOCTOU on Setting JSON blob), CODE-029 (return update + note not transactional).

### Code quality / DRY
CODE-007 (14 GET routes bypass `withErrorHandler` - inconsistent error shapes), CODE-008 (30+ mixed-language hardcoded error strings in API routes), CODE-009 (`force-dynamic` overrides `revalidate=30` - dead ISR config), CODE-010 (prop-drilling ALL customers/products to client components - over-fetching PII), CODE-011 (fat routes bypass service layer - storefront/submit, AI tool, returns has no service), CODE-014 (missing `@@index([customerId])` on Order), CODE-015 (3 near-identical `StatusBadge` components with duplicate maps), CODE-016 (2 parallel `assessOrderRisk` functions - different signatures, one with hardcoded French), CODE-017 (delivery/create Zod excludes `"dhd"`), CODE-018 (8+ dead exports; some tested = tautological tests), CODE-019 (duplicated formatters - `formatDate` has 2 DIFFERENT implementations, dangerous), CODE-020 (`products/[id]` local `statusLabels` + `statusBadgeVariant` maps - handoff #15), CODE-021 (hardcoded `"600"` delivery cost in 3 files with 3 meanings), CODE-024 (Return state machine defined in 2 places - no `return-transitions.ts`), CODE-025 (blacklist stored as `[BLACKLISTED]` text tag in encrypted `notes` - `listBlacklistedCustomers` queries ciphertext, returns 0 rows), CODE-026 (`Return` model has no items - `itemCount` stringified into notes), CODE-031 (inconsistent dynamic imports of `storefront/service`), CODE-032 (`service-base.ts` uses `console.error` not `logger`).

### Performance
PERF-007 (orders page over-fetches PII - 200 AES decryptions per load), PERF-008 (orders page double-fetches allOrders + filteredOrders), PERF-009 (no real pagination - `take: 200` hard cap, silent truncation), PERF-010 (analytics fetches all period orders in memory - O(n) aggregation), PERF-011 (no `next/dynamic` lazy loading - all client components eager, 3.4M initial JS), PERF-012 (dead deps: `@tanstack/react-query` installed unused, `react-syntax-highlighter` in optimizePackageImports but not installed), PERF-013 (restore is non-atomic - interruption corrupts DB; no temp-file-then-rename), PERF-014 (no retry on Gemini agent calls - 502/503 = full agent failure), PERF-015 (e-commerce adapters + sidecar client: no retry), PERF-016 (WhatsApp socket: no max reconnect attempts - infinite 15s loop if sidecar dead), PERF-017 (no backup rotation policy - disk fills silently), PERF-018 (import engine/export missing `server-only` guard).

### UX / i18n / a11y
UX-018 (11 hardcoded English fallback strings in 8 files), UX-019 (4 hardcoded English aria-labels), UX-020 (skip-to-content link not rendered - key exists, WCAG 2.4.1), UX-021 (zero `role="status"`/`aria-live` for dynamic content - WCAG 4.1.3), UX-022 (`flex-row-reverse` still in sidebar - handoff claim inaccurate), UX-023 (shadcn UI components use physical spacing `pl-8`/`pr-2` - RTL bugs), UX-024 (`products/[id]` rebuilds statusLabels per render - handoff #15), UX-025 (`orders/[id]` inconsistent padding - bypasses design system), UX-026 (storefront missing product images + hardcoded bg), UX-027 (storefront COD form no client-side validation), UX-028 (storefront loading state uses dashboard skeleton - mismatched), UX-029 (storefront hardcodes "DA" + `fr-DZ` - bypasses `formatDZD`), UX-030 (automations page uses plain Card not StatCard).

### Production readiness
PROD-012 (GitHub Actions "broken-runner" claim unverifiable - workflows look correct), PROD-013 (`.env.example` documents 3 of ~17 env vars; `data/auth-secret` written but never read), PROD-014 (no runtime feature flags independent of license), PROD-015 (`release.ts` uses fragile curl-based upload; no retry; `latest.json` uploaded before assets verified), PROD-016 (no changelog; release notes default to "SahelFlow update"), PROD-017 (no rollback mechanism; no beta channel), PROD-018 (19 remaining bare `console.*` calls; logger header false), PROD-019 (`data/app-meta.json` committed to git), PROD-020 (DHD adapter has no env.ts entry for API base URL).

### Test coverage (P2)
TEST-006 (risk service + analytics 579 LOC at 0%), TEST-007 (3 of 4 delivery adapters only metadata-tested ~4%), TEST-008 (import engine 212 LOC at 0%), TEST-009 (e-commerce sync + 3 adapters 918 LOC at 0%), TEST-010 (backup/restore 219 LOC at 0%), TEST-011 (multi-shop routing 223 LOC at 0%).

---

## P3 - Low / P4 - Enhancement (summarized)

**P3 (35):** SEC-027 (6 dev-dep vulns, all dev-only), SEC-028 (Stronghold registered but master key in keyfile), SEC-029 (sidecar token in `/tmp`), SEC-030 (money as Int - overflow at ~2.1B DZD), SEC-031 (no optimistic concurrency on order updates), SEC-032 (AI agent error messages leaked to client), SEC-034 (Cargo.toml version mismatch), CODE-022 (4 sites use base `<Table>` not `<PremiumTable>`), CODE-023 (N+1 in `seedWilayaRiskProfiles`), CODE-027 (hardcoded English strings in client components), CODE-028 (hardcoded French in AI agent system prompt), CODE-029, CODE-030 (409 doesn't include existing customer -> N+1-by-API), PERF-019 (dead `revalidate=30` exports), PERF-020 (withErrorHandler logs to stdout only), PERF-021 (no Suspense boundaries), PERF-022 (topbar polls notifications 60s/tab), PERF-023 (standalone bundles 33M Sharp - unused), PERF-024 (no `beforeExit` hook for clean SQLite shutdown), PERF-025 (no backpressure on SSE), UX-031->040 (dashboard raw enum fallback, dialog `right-4` physical, grid `grid-cols-1` inconsistency, raw `green-*`/`blue-*`, storefront no add-to-cart feedback, dead English fallback, storefront icon buttons `title=` not `aria-label`, generic sr-only labels, mismatched empty-state keys), PROD-021 (bun audit 6 dev vulns), PROD-022 (5 major version bumps available), PROD-023 (`googleapis@173` 140MB for one API), PROD-024 (no macOS builds), PROD-025 (Tauri capabilities missing `updater:default`), PROD-026 (CI doesn't run sf-verify/audit), TEST-012->016.

**P4 (15):** CODE-033->041 (redundant `revalidate=0`+`force-dynamic`, vestigial `_encryptionKey` param, dead `if(!all)` branch, `as` cast bypass, 4 OrderStatus definitions, 36 `as unknown as` casts, `SETTING_KEYS` only 3 keys, misleading `source:"seeded"`, swallowed setup file-write errors), PERF-026 (materialize risk assessments), UX-041->045 (login no lang switcher, PIN no maxLength/strength, `formatDZDShort` not localized, subtle page transition, generic PageLoading), PROD-027->028 (`.env.example` APP_VERSION drift, baileys maintenance uncertain).

---

## The 10 "Known" Items - Re-validation

| # | Item | Status | Severity | Owner track |
|---|------|--------|----------|-------------|
| 1 | Test coverage ~10% | CONFIRMED (30.9% stmts on src/lib; 0/83 API routes; 0/30 AI tools) | P0/P1 | TEST |
| 2 | Auth hardening (rate limit/session/audit/reset) | CONFIRMED (all 4 absent) | P0/P1 | SEC |
| 3 | WhatsApp inbox basic | CONFIRMED (UI exists; no search/media/template/broadcast) | P1 | (Phase 4) |
| 4 | Integration testing (YouCan/ZR/DHD) | CONFIRMED (only DHD unit-tested; 0 e-commerce tests) | P1 | TEST |
| 5 | AI extraction (no metrics/fallback/HITL) | CONFIRMED (smart-router + confidence exist; no metrics/HITL) | P1 | (Phase 4) |
| 6 | No monitoring | CONFIRMED (no Sentry/PostHog/metrics; logger lost in Tauri) | P1 | PROD |
| 7 | No feature flags | CONFIRMED IN PRACTICE (`hasFeature`/`requireLicense` defined but never called - dead code) | P1 | PROD |
| 8 | No DB migrations strategy | CONFIRMED + ESCALATED to P0 (ProductVariant missing from migration.sql; Tauri has no migration runner) | P0 | PROD |
| 9 | GitHub Actions broken | UNVERIFIABLE (workflows look correct; "billing issue" claim needs GH Actions access to confirm) | P2 | PROD |
| 10 | macOS builds missing | CONFIRMED (no macOS CI job; UPDATES.md falsely claims it exists) | P2 | PROD |

**New findings beyond the 10:** the audit surfaced ~140 additional issues not in the handoff's known list - including the P0 storefront i18n key, P0 mobile-broken inbox/AI-chat, P0 migration drift, P0 search-broken-on-encrypted-fields, and 40+ P1 correctness/security/UX bugs.

---

## Micro-improvements (small, high-leverage - batch into a "polish sweep" PR)

- Add `requireAuth()` to 48 unprotected mutating routes (~96 lines mechanical).
- Sanitize CSV export fields (prefix `'` to `=+-@\t\r`).
- Validate upload extension against allowlist (MIME->ext map).
- Add login rate limiter (copy storefront submit pattern).
- Raise PBKDF2 to 600k (one constant).
- Raise PIN minimum to 8 chars.
- Fix expense category mismatch (delete local `VALID_CATEGORIES`).
- Add `onDelete: Cascade` to `ReturnNote.return`.
- Add Zod validation to `risk/blacklist` + `risk/rules`.
- Wrap `delivery/create` in `$transaction`.
- Use `deliveryProviderSchema` everywhere (remove 3 local enums).
- Add `@@index([customerId])` to Order + `@@index([createdAt])` to Customer.
- Add `prefers-reduced-motion` `@media` block (1 block, affects 40+ animations).
- Add `storefront.view.cart` key x 3 locales (3 lines).
- Add skip-to-content link (key exists, not rendered).
- Fix `formatDate` dual-implementation hazard (delete one).
- Add `server-only` to `import/engine.ts` + `export.ts`.
- Move `retryFetch` to shared `lib/integrations/http.ts`; use in Gemini + e-commerce + sidecar.
- Replace `googleapis@173` with `google-auth-library` + `fetch()` (saves ~135MB).
- Add `data/app-meta.json` to `.gitignore` + create `.example`.

---

_Generated by 6 parallel deep-audit agents (Task IDs AUDIT-SEC/CODE/PERF/UX/TEST/PROD). Full per-finding detail in `/home/z/my-project/worklog.md`. This document is the canonical index; `MASTER_PLAN.md` is the execution roadmap._
