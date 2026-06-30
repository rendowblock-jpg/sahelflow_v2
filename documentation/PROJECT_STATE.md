# SahelFlow v3.0 — Project State

> **Living document.** Updated after every session. This is the "where are we right now" file.
> For the plan, see `full_build.md`. For history, see `BUILD_LOG.md`. For honest evaluation, see `HONEST_ASSESSMENT.md`.

**Last updated:** 2026-06-29 (Session 18 complete)
**Main HEAD:** `84fcf2d`
**Version:** `3.1.0`
**Design system version:** v3.0 (premium patterns from shadcn v4, Dub, Cal.com, Trigger.dev)

---

## At a Glance

| Metric | Value |
|---|---|
| Phase | Phase 0 complete + Sessions 16-18 (auth + integrations + UX + risk engine + AAA audit) |
| LOC | ~47,700 (src/ + sidecars/) |
| Pages | 25 (dashboard, inbox, orders, orders/[id], customers, customers/[id], products, products/[id], deliveries, returns, analytics, accounting, automations, agents, settings, imports, risk, storefronts list/new/edit, profile, + login, setup, public storefront) |
| API routes | 83 (+6 risk routes: assess/[orderId], config, rules, analytics, blacklist, blacklist/[customerId]) |
| Tests | 391 (risk engine 50 + services 124 + auth/API/license 41 + adapters/import 49 + order state machine 40 + regex extractor 20 + field-crypto 25 + customer-PII 18 + order-conversation-PII 19 + pii-nested 4 + analytics 20 + auth crypto 19 + DHD adapter 16) |
| Prisma models | 25 (ProductVariant added Session 17) |
| i18n keys | 2,120 × 3 locales (AR/FR/EN + RTL) |
| AI tools | 30 (6 core + 12 extended + 12 advanced) |
| Delivery adapters | 4 (Yalidine + Maystro + ZR Express + DHD) |
| E-commerce adapters | 3 (Shopify + WooCommerce + YouCan) |
| Other integrations | Google Sheets (Service Account), WhatsApp (Baileys sidecar), Gemini AI |
| Risk engine | ✅ 7 factors, weighted scoring, rules, blacklist, analysis dashboard |
| ADRs | 12 accepted, 0 open |
| Quality gate | ✅ tsc + eslint + 391/391 tests green |
| CI | ⚠️ GitHub Actions (broken — runner provisioning fails on free tier; use `bun run release` locally) |
| Auth | ✅ Local-first PIN (Web Crypto API, middleware, httpOnly cookies) |
| Encryption | ✅ AES-256-GCM PII (Customer + Order + OrderItem.variantName + Conversation + Message.body) |
| Desktop app | ✅ Tauri + auto-updater (signed Ed25519, GitHub Releases) |
| Release flow | ✅ One-command: `bun run release` (builds + signs + publishes + auto-updates all installed apps) |

---

## ✅ Done (sessions 1-18)

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
- ✅ Delivery integrations (Yalidine full + Maystro + ZR Express)
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

### Session 13 — AAA audit (2026-06-24)
- ✅ Systematic 6-dimension audit (~254 findings)
- ✅ 12 P0 bugs fixed (data corruption, security holes, PII bypass, UI font system, hydration)
- ✅ 20+ P1 issues fixed (server-only guards, order-number race, storefront rate limit, formatDZD consolidation, structured logger, health endpoint, fail-closed license, Baileys auth folder chmod, Tauri capabilities stripped)

### Session 14 — UI/UX perfection + backend feature completeness (2026-06-24)
- ✅ Premium chart library (7 components: area/line/composed/donut/h-bar/radial/sparkline, OKLCH tokens)
- ✅ World-class dashboard + deep analytics suite
- ✅ Customer 360 page
- ✅ Orders bulk operations
- ✅ Service extensions (search, stats, bulk ops)
- ✅ withErrorHandler on 37 routes
- ✅ Complete i18n (1,677 keys × 3 locales)
- ✅ GitHub Actions CI

### Session 15 — UI polish from screenshot review (2026-06-24)
- ✅ Dark theme contrast fix, sidebar RTL fix, PII decryption fix
- ✅ Full CRUD on customers/products/orders/returns/expenses/deliveries
- ✅ Animated stat cards, tabbed settings UI, empty states

### Session 16 — Foundation + Auth + Integrations + Design Transformation (2026-06-26)
- ✅ Design system foundation (spacing, typography, RTL utilities, AppShell helpers)
- ✅ Local-first PIN auth system (#1 production blocker)
- ✅ Google Sheets integration (Service Account)
- ✅ DHD delivery adapter (EcoTrack platform)
- ✅ Premium UI patterns (Cal.com shadows, Dub floating panel, Trigger.dev grid)
- ✅ All charts upgraded, inbox rebuilt, AI chat rebuilt
- ✅ Breadcrumbs, keyboard shortcuts, page transitions, per-page loading/error states

### Session 17 — Founder-driven UX + production-readiness sprint (2026-06-29)
- ✅ 14 PRs merged (8 feature + 6 fix)
- ✅ Product variants, inline status editing, order detail edit mode
- ✅ Import/Export with XLSX on all 6 data pages + ECOMANAGER migration preset
- ✅ Loading/error states on ALL 20 dashboard pages
- ✅ One-command release flow (`bun run release`)
- ✅ Installable desktop app with signed auto-updates

### Session 18 — Bug fixes + Risk engine + Test coverage + AAA audit (2026-06-29)

**11 PRs merged (#63–#73). ~5,700 LOC added. 2 critical security holes fixed. 391 tests (3× expansion).**

**Bug fixes:**
- ✅ PR #63: RTL sidebar + PremiumTable crash on 5 RSC pages
- ✅ PR #65: Hydration mismatch + next-themes script tag error
- ✅ PR #66: Hydration root cause — useI18n() server/client locale mismatch (ServerLocaleContext)
- ✅ PR #67: server-only import error in Client Components (risk-engine barrel)
- ✅ PR #68: RTL sidebar — explicit conditional classes (not CSS dir)
- ✅ PR #72: Sidebar position + risk page crash + orders table upgrade

**Risk engine:**
- ✅ PR #64: Top-tier risk engine (4-layer architecture: types/scoring/service/analytics)
- ✅ 6 API routes + /risk dashboard page with 5 tabs
- ✅ Order integration: auto-assess on creation, risk badge in orders table, high-risk review queue, risk breakdown card on order detail
- ✅ +108 i18n keys × 3 locales

**Test coverage:**
- ✅ PR #64: 134 → 391 tests (+257, +192%)
- ✅ Risk engine scoring: 50 tests
- ✅ Service layer: 124 tests
- ✅ Auth + API + License: 41 tests
- ✅ Adapters + Import/Export: 49 tests

**AAA audit + fixes:**
- ✅ PR #69: 2 CRITICAL security holes (storefront config + qr-image typo), StatCard parseNumeric, navigation duplicate icon, dhd enum, 99 i18n keys, PageHeader consistency, missing loading/error states
- ✅ PR #70: StatCard trend misuse (deliveries + returns)
- ✅ PR #71: CommandPalette native arrow-key navigation (cmdk sub-components)
- ✅ PR #73: Analytics page responsive grid

---

## 🔴 Known Issues (carry forward)

### Production blockers
1. **Test coverage ~10%** — 391 tests for ~47K LOC (up from 0.3%, but still need more integration tests)
2. **Auth hardening** — no rate limiting on PIN, no session revocation, no audit logs, no password reset
3. **Integration testing** — YouCan/ZR/DHD adapters untested against real APIs
4. **No monitoring** — no Sentry, no PostHog, no uptime monitoring
5. **No database migrations strategy** — using prisma db push (wrong for production)
6. **GitHub Actions broken** — workflows fail to provision runners (account billing issue). Use `bun run release` locally.
7. **requireAuth() defense-in-depth** — only middleware protects API routes; most routes don't call requireAuth()

### Polish items
8. **WhatsApp inbox** — basic UI, needs: search, media, voice notes, templates, broadcast
9. **AI extraction** — needs accuracy metrics, A/B testing, fallback chains
10. **macOS builds** — release workflow only builds Windows + Linux (needs Apple Developer cert)
11. **Onboarding flow** — no guided setup for new sellers
12. **No accessibility audit** — keyboard nav, screen readers, color contrast untested
13. **Hardcoded strings** — login/setup/profile pages still have some hardcoded English
14. **`customers/[id]` page** — uses base `<Table>` not `<PremiumTable>`
15. **`products/[id]` page** — has duplicated `statusLabels` (should use shared `lib/shared/status-colors`)
16. **Responsive sweep** — more pages need responsive improvements (Topbar mobile, stat card grids, tables on small screens)

### See also
- `HONEST_ASSESSMENT.md` — candid evaluation of app vs top-tier company product
- `INTEGRATION_RESEARCH.md` — credentials needed for each integration
- `RESEARCH_REPORT.md` (root) — premium UI patterns from 5 top-tier dashboards
- `UPDATES.md` — how to publish signed auto-updates

---

## 📊 Branch Map

| Branch | HEAD | Purpose |
|---|---|---|
| `main` | `84fcf2d` | v3.0 + Sessions 16-18. sf-verify green. 391 tests. Version 3.1.0. Risk engine + AAA audit fixes. |
| `v2-legacy` | `1ffd327` | Old v2 code (reference only, do NOT merge) |
| `agent-handoff` | `adbeead` | Agent metadata: AGENT_HANDOFF.md v6.0 + bootstrap.sh + toolkit |
