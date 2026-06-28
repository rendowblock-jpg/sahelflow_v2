# SahelFlow v3.0 — Project State

> **Living document.** Updated after every session. This is the "where are we right now" file.
> For the plan, see `full_build.md`. For history, see `BUILD_LOG.md`. For honest evaluation, see `HONEST_ASSESSMENT.md`.

**Last updated:** 2026-06-29 (Session 17 complete)
**Main HEAD:** `fc5f793`
**Version:** `3.1.0`
**Design system version:** v3.0 (premium patterns from shadcn v4, Dub, Cal.com, Trigger.dev)

---

## At a Glance

| Metric | Value |
|---|---|
| Phase | Phase 0 complete + Session 16 + Session 17 (founder-driven UX + production-readiness sprint) |
| LOC | ~42,000 (src/ + sidecars/) |
| Pages | 24 (dashboard, inbox, orders, orders/[id], customers, customers/[id], products, products/[id], deliveries, returns, analytics, accounting, automations, agents, settings, imports, storefronts list/new/edit, profile, + login, setup, public storefront) |
| API routes | 72 (+2 returns/[id], +2 delivery/[id], +2 import/orders, +2 import/expenses, +3 export routes) |
| Tests | 134 (order state machine 32 + regex extractor 16 + field-crypto 21 + customer-PII-encryption 12 + order-conversation-PII-encryption 12 + pii-nested-includes 3 + analytics 13 + auth crypto 15 + DHD adapter 10) |
| Prisma models | 25 (+1 ProductVariant) |
| i18n keys | 1,982 × 3 locales (AR/FR/EN + RTL) |
| AI tools | 30 (6 core + 12 extended + 12 advanced) |
| Delivery adapters | 4 (Yalidine + Maystro + ZR Express + DHD) |
| E-commerce adapters | 3 (Shopify + WooCommerce + YouCan) |
| Other integrations | Google Sheets (Service Account), WhatsApp (Baileys sidecar), Gemini AI |
| ADRs | 12 accepted, 0 open |
| Quality gate | ✅ tsc + eslint + 134/134 tests green |
| CI | ⚠️ GitHub Actions (broken — runner provisioning fails on free tier; use `bun run release` locally) |
| Auth | ✅ Local-first PIN (Web Crypto API, middleware, httpOnly cookies) |
| Encryption | ✅ AES-256-GCM PII (Customer + Order + OrderItem.variantName + Conversation + Message.body) |
| Desktop app | ✅ Tauri + auto-updater (signed Ed25519, GitHub Releases) |
| Release flow | ✅ One-command: `bun run release` (builds + signs + publishes + auto-updates all installed apps) |

---

## ✅ Done (sessions 1-17)

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

**14 PRs merged (8 feature + 6 fix). ~4,000 LOC added. All 15 founder-reported issues addressed.**

**Feature PRs:**
- ✅ PR #48: Critical fixes — breadcrumbs crash, wilaya i18n, sidebar RTL, expanded seed
- ✅ PR #49: Stat card consistency — sparkline fix, all pages use shared StatCard
- ✅ PR #50: Tables consistency — shared PremiumTable across all data pages
- ✅ PR #51: Product variants — schema migration + UI + order flow (biggest PR)
- ✅ PR #52: Orders UX — inline status editing + order detail edit mode
- ✅ PR #53: Delivery + Returns audit — inline status editing + complete flows
- ✅ PR #54: Import/Export everywhere — XLSX + ECOMANAGER migration preset
- ✅ PR #55: Full-app consistency — loading/error on all 20 pages + no more confirm()

**Fix PRs:**
- ✅ PR #56: Locale flash + sidebar RTL + Prisma auto-generate
- ✅ PR #57: Sidebar RTL hydration (proper fix — dir as server prop)
- ✅ PR #58: Fast Tauri dev mode (tauri:dev:fast)
- ✅ PR #59: Cross-platform tauri:dev:fast (Windows support)
- ✅ PR #60: Installable desktop app + CI auto-build + auto-update
- ✅ PR #61: Build OOM fix (4GB memory + skip type-checking)

**New features:**
- ✅ ProductVariant model + per-variant stock + variant picker in order form
- ✅ Inline customer create in order modal
- ✅ Inline status editing (orders + deliveries + returns — clickable badges)
- ✅ Order detail edit mode (Linear/Notion pattern — View ↔ Edit same page)
- ✅ Import/Export with XLSX support on all 6 data pages
- ✅ ECOMANAGER + Shopify migration presets
- ✅ Loading/error states on ALL 20 dashboard pages
- ✅ One-command release: `bun run release` (builds + signs + publishes + auto-updates)
- ✅ Installable desktop app (.msi/.dmg/.AppImage) with signed auto-updates
- ✅ Fast Tauri dev mode (`tauri:dev:fast` — pre-built frontend, instant page loads)
- ✅ Cross-platform build scripts (TypeScript, not bash — works on Windows)

---

## 🔴 Known Issues (carry forward)

### Production blockers
1. **Test coverage ~0.3%** — 134 tests for ~42K LOC. Need integration tests for API routes, AI agent, adapters, auth flows
2. **Auth hardening** — no rate limiting on PIN, no session revocation, no audit logs, no password reset
3. **Integration testing** — YouCan/ZR/DHD adapters untested against real APIs
4. **No monitoring** — no Sentry, no PostHog, no uptime monitoring
5. **No database migrations strategy** — using prisma db push (wrong for production)
6. **GitHub Actions broken** — workflows fail to provision runners (account billing issue). Use `bun run release` locally.

### Polish items
7. **WhatsApp inbox** — basic UI, needs: search, media, voice notes, templates, broadcast
8. **AI extraction** — needs accuracy metrics, A/B testing, fallback chains
9. **macOS builds** — release workflow only builds Windows + Linux (needs Apple Developer cert)
10. **Onboarding flow** — no guided setup for new sellers
11. **No accessibility audit** — keyboard nav, screen readers, color contrast untested

### See also
- `HONEST_ASSESSMENT.md` — candid evaluation of app vs top-tier company product
- `INTEGRATION_RESEARCH.md` — credentials needed for each integration
- `RESEARCH_REPORT.md` (root) — premium UI patterns from 5 top-tier dashboards
- `UPDATES.md` — how to publish signed auto-updates

---

## 📊 Branch Map

| Branch | HEAD | Purpose |
|---|---|---|
| `main` | `fc5f793` | v3.0 + Session 16 + Session 17. sf-verify green. 134 tests. Version 3.1.0. |
| `v2-legacy` | `1ffd327` | Old v2 code (reference only, do NOT merge) |
| `agent-handoff` | `ded95c5` | Agent metadata: AGENT_HANDOFF.md + bootstrap.sh + toolkit |
