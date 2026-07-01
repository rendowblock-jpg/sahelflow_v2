# SahelFlow v3.0 — Project State

> **Living document.** Updated after every session. This is the "where are we right now" file.
> For the plan, see `full_build.md`. For history, see `BUILD_LOG.md`. For honest evaluation, see `HONEST_ASSESSMENT.md`.

**Last updated:** 2026-07-01 (Session 19 complete)
**Main HEAD:** `8228176`
**Version:** `3.1.0`
**Design system version:** v3.0 (premium patterns from shadcn v4, Dub, Cal.com, Trigger.dev)

---

## At a Glance

| Metric | Value |
|---|---|
| Phase | Sessions 1-19 complete (47 PRs merged in Session 19) |
| LOC | ~48,500 (src/ + sidecars/) |
| Pages | 27 (added onboarding, analytics/extraction) |
| API routes | 85 (+license/sync, +conversations/search, +analytics/extraction) |
| Tests | 457 (up from 391 at Session 18 start) |
| Prisma models | 29 (added AuthSecret, Session, AuditLog, ExtractionMetric) |
| i18n keys | ~2,250 × 3 locales (AR/FR/EN + RTL) |
| AI tools | 30 (6 core + 12 extended + 12 advanced) |
| Delivery adapters | 4 (Yalidine + Maystro + ZR Express + DHD) |
| E-commerce adapters | 3 (Shopify + WooCommerce + YouCan) |
| Risk engine | ✅ 7 factors, weighted scoring, rules, blacklist (uses isBlacklisted column), analysis dashboard |
| ADRs | 12 accepted, 0 open |
| Quality gate | ✅ tsc + eslint + 457/457 tests green |
| Auth | ✅ PIN PBKDF2 600k + rate limiting + Session revocation + AuditLog + CSRF (sameSite=strict) |
| Encryption | ✅ AES-256-GCM PII (Customer + Order + OrderItem + Conversation + Message) + blind indexes for search |
| Desktop app | ✅ Tauri + auto-updater (updater:default capability) + migration runner in Rust setup hook |
| Release flow | ✅ One-command: `bun run release` (builds + signs + publishes + auto-updates) |
| License | ✅ Ed25519 + server-side enforcement (DB-synced validation) + FeatureGate component |
| Onboarding | ✅ 4-step wizard (business → delivery → AI key → first product) |
| E2E | ✅ Playwright config + 4 golden-path test files (unverified — needs browser install) |
| Sentry | ✅ Env-gated, zero-overhead (code ready, needs @sentry/nextjs install + DSN) |

---

## ✅ Done (sessions 1-19)

### Foundation (sessions 1-7)
- ✅ Tauri + Next.js 16 + Prisma + shadcn/ui scaffold
- ✅ Data: 58 wilayas, 1,541 communes, i18n keys × 3 locales
- ✅ UI shell (sidebar, topbar, dashboard, dark mode, mobile responsive)
- ✅ Data layer (6 services, Zod validation, order state machine)
- ✅ CRUD UI (orders, customers, products, deliveries, returns, analytics, accounting)
- ✅ License validation (Ed25519 crypto, trial self-issuance, settings UI)
- ✅ AI extraction (regex + Gemini smart router, 16 tests)
- ✅ Inbox UI (conversations, messages, "Extraire la commande" → draft order)
- ✅ Automations + AI agents pages
- ✅ Loading/error/404 pages
- ✅ Tauri CLI + icons (desktop-ready)
- ✅ Encryption foundation (AES-256-GCM + blind index) + Secret model
- ✅ Gemini AI key wizard
- ✅ Baileys WhatsApp sidecar (port 3001, loopback + bearer token)
- ✅ Tauri production build config (ADR-010)
- ✅ Customer PII field encryption (transparent Prisma extension)
- ✅ Delivery integrations (Yalidine full + Maystro + ZR Express + DHD)
- ✅ CSV/XLSX import + CSV export
- ✅ AI chat agent (30 tools, SSE streaming)
- ✅ COD storefront (builder + public page + rate-limited submit)
- ✅ Wilaya risk engine (58 profiles seeded)
- ✅ Notifications API
- ✅ Order + Conversation PII encryption
- ✅ Storefront management UI
- ✅ E-commerce sync (Shopify/WooCommerce/YouCan)
- ✅ Multi-shop (registry + selector + DB routing)
- ✅ PWA (manifest + service worker + icon)
- ✅ Auto-updater (signed GitHub Releases)
- ✅ Stronghold master key (Tauri plugin)

### Sessions 13-18 (prior sessions)
- ✅ AAA audit (6-dimension, ~254 findings)
- ✅ Premium chart library (7 components)
- ✅ Risk engine (7 factors, rules, blacklist, analytics)
- ✅ RTL sidebar definitive fix
- ✅ Test expansion (134 → 391 tests)

### Session 19 — Market-Killer Engineering Sprint (47 PRs)

**Session 19 was a comprehensive audit + fix + perfection sprint.** The founder requested a full professional audit, multi-phase master plan, and continuous engineering loop until the app is flawless.

#### Phase 0: Audit + Plan (1 PR)
- ✅ 6-track professional audit (SEC/CODE/PERF/UX/TEST/PROD) → 192 findings
- ✅ AUDIT_FINDINGS_v3.md (all 192 findings fully expanded)
- ✅ MASTER_PLAN.md (6-phase roadmap with exit criteria)

#### Phase 1: Stop the Bleeding (10 PRs)
- ✅ Login rate limiting + PBKDF2 600k + PIN min 8 + setSetting allowlist + change-pin route
- ✅ requireAuth() defense-in-depth on all 45 mutating routes (was 7)
- ✅ Session revocation (Session table) + AuditLog + AuthSecret table
- ✅ Blind indexes for encrypted field search + isBlacklisted column
- ✅ Transactional correctness (order update, returns with stock restoration, delete pre-check)
- ✅ Schema drift fix (OrderSource enum, delivery $transaction, ReturnNote relation, Zod validation)
- ✅ Migration SQL + migration runner script + version sync (Cargo.toml 3.1.0)
- ✅ Mobile drill-down for inbox + AI chat
- ✅ Storefront P0s (missing i18n key, localized 404, 44px touch targets)
- ✅ v2 security regressions (CSV injection, upload traversal/XSS, XFF spoof, public route)

#### Phase 2: Foundation for Scale (5 PRs)
- ✅ API integration test harness + 6 storefront submit tests
- ✅ 13 license validation tests (trial invariants + Ed25519 signatures)
- ✅ CI: sf-verify + coverage enforcement + bun audit
- ✅ FeatureGate component + requireLicense fix
- ✅ 5 backup round-trip tests

#### Phase 3: Frontend & UI/UX Perfection (6+ PRs)
- ✅ Table overflow-x-auto + padding consistency
- ✅ prefers-reduced-motion + skip-to-content + no-blue rule
- ✅ RTL arrows flip + formatDZD locale + dialog logical positioning
- ✅ 15+ hardcoded English strings → t() × 3 locales
- ✅ a11y keyboard nav (sortable headers, clickable rows, settings tabs)
- ✅ Optimistic update fix + add-to-cart feedback
- ✅ Comprehensive RTL sweep (62 fixes: sidebar, charts, icons, shadcn logical props, switch, toggle, toaster)
- ✅ Comprehensive UI sweep (dark mode, colors, loading states, onboarding validation)

#### Phase 4: Performance & Reliability (5 PRs)
- ✅ db Proxy 2s cache + invalidateMetaCache on shop switch
- ✅ SSE abort on client disconnect
- ✅ Orders page select+dedupe (50% fewer DB calls, 200 fewer PII decryptions)
- ✅ Gemini API retry on 502/503/504
- ✅ WhatsApp reconnect bounds + indexes + shop-switch disconnect

#### Phase 5: Feature Depth (2 PRs)
- ✅ Delivery adapter tests (Yalidine + Maystro + ZR Express)
- ✅ ExtractionMetric model + sync dedup tests + extraction analytics API + dashboard

#### Phase 6: Market-Killer Ship (1+ PRs, skip macOS)
- ✅ CHANGELOG.md + .npmrc + .gitignore + DHD_API_BASE + .env.example
- ✅ False claims fixed in UPDATES.md + DESKTOP_BUILD.md

#### Wave 2: Close Critical Gaps (9 PRs)
- ✅ Tauri migration runner wired into Rust setup hook
- ✅ Tauri updater:default capability added
- ✅ CSRF protection (sameSite=strict, removed broken custom-header check)
- ✅ Arabic CLDR plural support in t()
- ✅ shadcn UI logical properties migration (8 components)
- ✅ Storefront product images rendered
- ✅ AI extraction analytics API + dashboard page
- ✅ Server-side license enforcement (DB-synced validation, fail-closed)
- ✅ Onboarding wizard (4-step: business → delivery → AI key → first product)
- ✅ WhatsApp inbox search
- ✅ Sentry integration (env-gated, zero-overhead)
- ✅ Playwright e2e config + 4 golden-path test files

#### Final Bug Fix Sprints (8+ PRs)
- ✅ CSRF middleware fix (was blocking ALL mutations — app was non-functional)
- ✅ Blacklist uses isBlacklisted column (was: searched encrypted notes → always empty)
- ✅ Storefront images JSON.parse (was: split(",") → broken URL)
- ✅ Orders phone column populated (was: blank)
- ✅ Customer sort by createdAt (was: encrypted name → random order)
- ✅ DHD credentials/estimate enum fix
- ✅ metaCache invalidation on shop switch
- ✅ Delivery PATCH uses orderService.updateStatus (was: bypassed state machine)
- ✅ Import orders status validation
- ✅ withErrorHandler: SyntaxError → 400 (was: 500)
- ✅ requireAuth on 10 GET routes (defense-in-depth)
- ✅ Loading state variants (ChatLoading, FormLoading — was: table skeleton everywhere)
- ✅ generateMetadata for 3 pages
- ✅ Delivery sync nested $transaction deadlock fix
- ✅ Font consistency (font-bold → font-semibold across 5 pages)
- ✅ 24 directional icons icon-rtl-flip
- ✅ 12 shadcn primitives physical → logical properties
- ✅ Switch RTL thumb transform
- ✅ API error strings → English (was: mixed FR/EN)
- ✅ Dark mode gaps fixed (10+ files)
- ✅ Rich seed data (30 customers, 55 orders, 20 products with variants, 40 deliveries, 15 returns, 20 expenses, 10 conversations, AI chat sessions, extraction metrics, audit logs, wilaya risk profiles, storefront config, notifications, automations, WhatsApp templates)
- ✅ Definitive DB path fix (absolute path in scripts/db.ts + src/lib/db.ts — Prisma CLI vs Client path resolution mismatch on Windows)
- ✅ Window height fix (h-dvh → h-screen for WebView2 compatibility)
- ✅ RTL root dir attribute (dir={dir} on root div — explicit, not inheritance)

---

## 🔴 Known Issues (carry forward)

### Production blockers
1. **Test coverage ~15%** — 457 tests for ~48K LOC. API routes, AI agent, adapters still need more integration tests
2. **Sentry not installed** — code is ready (src/lib/monitoring/sentry.ts) but @sentry/nextjs not installed. Founder action: `bun add @sentry/nextjs` + set SENTRY_DSN
3. **E2E unverified** — Playwright config + 4 test files exist but not verified (needs `bunx playwright install chromium` + run)
4. **Tauri migration runner unverified** — Rust code is in lib.rs but not compiled/tested on a real Tauri build
5. **macOS builds** — skipped per founder instruction (needs Apple Developer cert)
6. **No professional pen test** — security is hardened but not externally audited
7. **No real user testing** — needs 3-5 Algerian COD sellers for beta

### Polish items
8. **WhatsApp inbox** — has search, but no media sending, voice notes, templates UI, broadcast
9. **AI extraction** — metrics recorded + dashboard exists, but no HITL review queue
10. **Chart locale** — chart formatters use default "fr" locale (documented limitation)
11. **Backup restore** — round-trip test exists but atomic restore (temp-file-then-rename) not implemented
12. **GitHub Actions** — CI workflow updated but unverified (founder needs to check Actions run history)

### See also
- `HONEST_ASSESSMENT.md` — candid evaluation of app vs top-tier company product
- `HONEST_ASSESSMENT_WAVE2.md` — post-Wave 1 assessment + Wave 2 plan
- `AUDIT_FINDINGS_v3.md` — all 192 audit findings (fully expanded)
- `MASTER_PLAN.md` — 6-phase roadmap with exit criteria
- `INTEGRATION_RESEARCH.md` — credentials needed for each integration
- `UPDATES.md` — how to publish signed auto-updates

---

## 📊 Branch Map

| Branch | HEAD | Purpose |
|---|---|---|
| `main` | `8228176` | v3.0 + Session 19 (47 PRs). sf-verify green. 457 tests. Version 3.1.0. |
| `v2-legacy` | `1ffd327` | Old v2 code (reference only, do NOT merge) |
| `agent-handoff` | `adbeead` | Agent metadata: AGENT_HANDOFF.md + bootstrap.sh + toolkit (needs update) |
