# SahelFlow v3.0 — Project State

> **Living document.** Updated after every session. This is the "where are we right now" file.
> For the plan, see `full_build.md`. For history, see `BUILD_LOG.md`. For honest evaluation, see `HONEST_ASSESSMENT.md`.

**Last updated:** 2026-06-26 (session 16 + design transformations)
**Main HEAD:** `d8cfd50`
**Design system version:** v3.0 (premium patterns from shadcn v4, Dub, Cal.com, Trigger.dev)

---

## At a Glance

| Metric | Value |
|---|---|
| Phase | Phase 0 complete + Session 16 (auth, integrations, design transformation) |
| LOC | ~38,000 (src/ + sidecars/) |
| Pages | 24 (dashboard, inbox, orders, orders/[id], customers, customers/[id], products, products/[id], deliveries, returns, analytics, accounting, automations, agents, settings, imports, storefronts list/new/edit, profile, + login, setup, public storefront) |
| API routes | 70 (orders + [id] + [id]/status + [id]/bulk + search, customers + [id] + [id]/stats + search, products + [id] + search, expenses + [id], analytics, deliveries + sync/credentials/estimate/create, returns, categories, communes, extraction, whatsapp/*, conversations, secrets, ai/sessions + stream, storefront + [id], wilaya-risk, notifications, reports/daily, settings, integrations/sync + connect, integrations/google-sheets/*, backup/*, auth/*, shops, health, export/*, import/*, upload, profile) |
| Tests | 134 (order state machine 32 + regex extractor 16 + field-crypto 21 + customer-PII-encryption 12 + order-conversation-PII-encryption 12 + pii-nested-includes 3 + analytics 13 + auth crypto 15 + DHD adapter 10) |
| Prisma models | 24 |
| i18n keys | 1,938 × 3 locales (AR/FR/EN + RTL) |
| AI tools | 30 (6 core + 12 extended + 12 advanced) |
| Delivery adapters | 4 (Yalidine + Maystro + ZR Express + DHD) |
| E-commerce adapters | 3 (Shopify + WooCommerce + YouCan) |
| Other integrations | Google Sheets (Service Account), WhatsApp (Baileys sidecar), Gemini AI |
| ADRs | 12 accepted, 0 open |
| Quality gate | ✅ tsc + eslint + 134/134 tests green |
| CI | ✅ GitHub Actions (lint + tsc + vitest on every push/PR) |
| Auth | ✅ Local-first PIN (Web Crypto API, middleware, httpOnly cookies) |
| Encryption | ✅ AES-256-GCM PII (Customer + Order + Conversation + Message.body) |

---

## ✅ Done (sessions 1-16)

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

**PR #43 — Phase A foundation + auth:**
- ✅ Design system foundation (spacing scale, typography scale, RTL utilities, AppShell helpers)
- ✅ RTL-first shell (sidebar, topbar, dashboard-layout — logical properties)
- ✅ Theme-toggle fix (useSyncExternalStore)
- ✅ **Local-first PIN auth system** (#1 production blocker — Web Crypto API, middleware, 4 API routes, login/setup pages)
- ✅ Polish: 3× confirm()→AlertDialog, withErrorHandler on 11 routes, ConfirmDialog component
- ✅ Profile page + photo upload + Upload API
- ✅ Orders table row actions (View/Edit/Delete dropdown)
- ✅ **RTL sweep: 28 files** (zero physical properties remaining)
- ✅ Responsive sweep: 9 pages with app-content wrapper
- ✅ 10 brand SVG icons
- ✅ DHD delivery adapter (new integration — EcoTrack platform)
- ✅ Integration research doc (1,022 lines)

**PR #44 — Phases B-E:**
- ✅ Dashboard rebuilt (dedup charts), delivery page rebuilt, settings IntegrationsPanel (10 cards)
- ✅ Google Sheets integration (Service Account)
- ✅ Product photos upload, print labels, backup/restore
- ✅ **Message.body encryption (S-010)** — WhatsApp history encrypted at rest
- ✅ WooCommerce SSRF fix, license enforcement (requireLicense + hasFeature)
- ✅ 25 new tests (134 total)

**PR #45 — Design transformation iteration 1 (research-backed):**
- ✅ Deep audit of 5 top-tier open-source dashboards (1,534-line report)
- ✅ Named shadow system (Cal.com): btn-rested/hover/active/focused + dropdown + popover
- ✅ Sidebar: tinted active state (bg-primary → bg-sidebar-accent), left bar indicator, tooltips when collapsed
- ✅ Topbar: h-12, backdrop-blur, Live pill, shadow-dropdown menus
- ✅ AppShell: floating content panel (Dub), grid layout (Trigger.dev)
- ✅ StatCard: gradient tint, container-query numbers, trend badge, footer sparkline
- ✅ EmptyState: dashed border, square icon, min-h-[400px], text-balance
- ✅ All charts: gradient fills, cursor=false, indicator=dot, natural curves
- ✅ Orders table: rounded border, sticky header, hover:bg-muted/50
- ✅ Login + Setup: centered cards, gradient bg, shield icon
- ✅ Button: Cal.com tactile shadows

**PR #46 — Design iteration 2:**
- ✅ All 5 chart components upgraded to consistent premium standard
- ✅ Inbox rebuilt: premium message bubbles (rounded-2xl with tails), conversation list (rounded-lg cards)
- ✅ AI chat rebuilt with matching premium patterns
- ✅ Settings tabs: tinted active state
- ✅ Modal component (Dialog→Drawer swap, Dub pattern) + useMediaQuery hook
- ✅ Stagger animations on stat card grids

**PR #47 — Full engineering loop (navigation + experience + functionality):**
- ✅ Command palette: 5 missing pages added (now covers ALL 16 pages)
- ✅ Breadcrumbs component: RTL-aware, on order/customer/product detail
- ✅ Keyboard shortcuts: Gmail-style g+letter navigation
- ✅ Page transitions: template.tsx with fadeIn animation
- ✅ Per-page loading states: 5 page-specific skeletons
- ✅ Per-page error boundaries: 4 error.tsx files with PageError component
- ✅ Topbar: Help/Support, Logout, Notifications all functional
- ✅ Export buttons: customers + products pages
- ✅ All pages: app-content wrapper (consistency)

---

## 🔴 Known Issues (carry forward)

### Production blockers
1. **Test coverage ~0.35%** — 134 tests for ~38K LOC. Need integration tests for API routes, AI agent, adapters, auth flows
2. **Auth hardening** — no rate limiting on PIN, no session revocation, no audit logs, no password reset
3. **Integration testing** — YouCan/ZR/DHD adapters untested against real APIs
4. **No monitoring** — no Sentry, no PostHog, no uptime monitoring
5. **No database migrations strategy** — using prisma db push (wrong for production)

### Polish items
6. **3 remaining confirm() calls** in orders-table-client (delete action)
7. **withErrorHandler on 6 routes** with custom error shapes
8. **YouCan OAuth** — no refresh token flow (tokens expire after ~15 days)
9. **WhatsApp inbox** — basic UI, needs: search, media, voice notes, templates, broadcast
10. **AI extraction** — needs accuracy metrics, A/B testing, fallback chains

### See also
- `HONEST_ASSESSMENT.md` — candid evaluation of app vs top-tier company product
- `INTEGRATION_RESEARCH.md` — credentials needed for each integration
- `RESEARCH_REPORT.md` (root) — premium UI patterns from 5 top-tier dashboards

---

## 📊 Branch Map

| Branch | HEAD | Purpose |
|---|---|---|
| `main` | `d8cfd50` | v3.0 + Session 16 + design transformations. sf-verify green. 134 tests. |
| `v2-legacy` | `1ffd327` | Old v2 code (reference only, do NOT merge) |
| `agent-handoff` | `64720ff` | Agent metadata: AGENT_HANDOFF.md + bootstrap.sh + toolkit + HONEST_ASSESSMENT.md |
