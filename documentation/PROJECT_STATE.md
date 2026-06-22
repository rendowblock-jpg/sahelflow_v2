# SahelFlow v3.0 — Project State

> **Living document.** Updated after every session. This is the "where are we right now" file.
> For the plan, see `full_build.md`. For history, see `BUILD_LOG.md`. For next-session prep, see `NEXT_SESSION_PREP.md`.

**Last updated:** 2026-06-21 (session 10)
**Main HEAD:** `bffae33`
**Design system version:** v2.2

---

## At a Glance

| Metric | Value |
|---|---|
| Phase | Phase 0 ~99% done (core complete; remaining = 3 polish items + founder gates) |
| LOC | ~36,000 (src/ + sidecars/) |
| Pages | 20 (dashboard, inbox, orders, customers, products, deliveries, returns, analytics, accounting, automations, agents, settings, imports, storefronts list/new/edit, + order/customer detail + public storefront) |
| API routes | 46 (orders, customers, products, categories, extraction, whatsapp/*, conversations, secrets, delivery/*, import/*, export/*, ai/sessions + stream, storefront + [id], wilaya-risk, notifications, reports/daily, settings, integrations/sync, shops) |
| Tests | 93 (order state machine 32 + regex extractor 16 + field-crypto 21 + customer-PII-encryption 12 + order-conversation-PII-encryption 12) |
| Prisma models | 22 (19 original + Secret + StorefrontConfig + Setting) |
| i18n keys | 1,095 × 3 locales (AR/FR/EN + RTL) |
| AI tools | 30 (6 core + 12 extended + 12 advanced — spec target reached) |
| Delivery adapters | 3 fully implemented (Yalidine + Maystro + ZR Express) |
| E-commerce adapters | 3 fully implemented (Shopify + WooCommerce + YouCan) |
| ADRs | 12 accepted (10 original + ADR-011 TikTok kill + ADR-012 Meta kill), 0 open |
| Quality gate | ✅ tsc + eslint + 93/93 tests green |

---

## ✅ Done (sessions 1-10)

### Foundation (sessions 1-7)
- ✅ Tauri + Next.js 16 + Prisma + shadcn/ui scaffold
- ✅ Data: 58 wilayas, 1,541 communes, 1,095 i18n keys × 3 locales
- ✅ UI shell (sidebar, topbar, dashboard, dark mode, mobile responsive)
- ✅ Data layer (6 services, Zod validation, order state machine)
- ✅ CRUD UI (orders, customers, products, deliveries, returns, analytics, accounting)
- ✅ License validation (Ed25519 crypto, trial self-issuance, settings UI)
- ✅ AI extraction (regex + Gemini smart router, 16 tests)
- ✅ Inbox UI (conversations, messages, "Extraire la commande")
- ✅ Tauri CLI + icons

### Phase 0 core (session 8)
- ✅ **Encryption foundation (ADR-003)** — AES-256-GCM field crypto + Secret model + 21 tests
- ✅ **Gemini AI key wizard (Phase 0 #9)** — Settings → IA: test+save encrypted; server-side key loading
- ✅ **Baileys WhatsApp sidecar (Phase 0 #1)** — live inbox, QR pairing, WS push, replies, seeded fallback
- ✅ **Tauri production build config (ADR-010)** — standalone server + sidecar externalBin + Rust setup hook
- ✅ **Customer PII field encryption** — transparent Prisma $extends interceptor (name/phone/address/notes encrypted; phone = blind index)
- ✅ **Delivery integrations (Phase 0 #16)** — Yalidine fully implemented; Maystro + ZR Express structural stubs (now full — see session 9-10)
- ✅ **CSV/XLSX import + export** — import engine (parse, column-map, validate, batch-insert); products + customers import; CSV export for orders/customers/products; /imports page
- ✅ **AI chat agent (Phase 0 #19)** — 6 tools; Gemini function-calling loop; sessions API; Agents page is now live chat
- ✅ **COD landing page builder foundation (Phase 0 #14)** — StorefrontConfig model, public storefront page, COD order-placement API, cart + checkout UI
- ✅ **Wilaya risk engine (Phase 0 #17)** — 58 risk profiles seeded, zone-based defaults, assessOrderRisk(), /api/wilaya-risk
- ✅ **Notifications API** — list, mark-read, delete

### Phase 0 completion (sessions 9-10)
- ✅ **Order + Conversation PII encryption (PR #20)** — extended field crypto to Order (phone, address, notes) + Conversation (contactName, contactPhone). Non-searchable in-place pattern. 12 new tests.
- ✅ **Storefront management UI (PR #21)** — /storefronts (list with active/inactive badge, preview/edit/toggle/delete), /storefronts/new (auto-slugify), /storefronts/[id] (builder: searchable product picker, 3 templates + color picker, contact info). 3 new API routes.
- ✅ **AI chat SSE streaming (PR #22)** — runAgentStream() async generator using Gemini streamGenerateContent. 5 event types (tool_call/tool_result/text_delta/done/error). Client renders token-by-token with live tool indicators + cancel button.
- ✅ **Daily WhatsApp reports (PR #23)** — Setting model (non-secret config), report generator (yesterday stats), cron API route (POST /api/reports/daily, x-cron-secret auth), Settings API (GET/PUT /api/settings), DailyReportPanel in Settings.
- ✅ **12 new AI tools → 18 total (PR #24)** — get_order_details, list_recent_orders, get_customer_details, get_low_stock_products, get_revenue_report, get_delivery_status, search_conversations, get_pending_deliveries, get_top_products, update_product_stock, cancel_order, get_wilaya_risk.
- ✅ **E-commerce sync (PR #25)** — Shopify + WooCommerce + YouCan polling adapters. Full API research (Shopify since_id, WooCommerce modified_after, YouCan id-dedup). Sync engine with dedup by sourceOrderId. POST /api/integrations/sync.
- ✅ **Maystro + ZR Express adapters full (PR #26)** — Maystro (Token auth, product auto-create, 17 numeric status codes, cancel via PATCH). ZR Express (token+key headers, POST /tarification + /add_colis + /lire, 2-digit wilaya codes, French situation strings).
- ✅ **Multi-shop UI (PR #27)** — shop registry (data/app-meta.json with first-run bootstrap), createShop (slug ID + prisma db push to init SQLite), deleteShop (last-shop protection), setActiveShopId, 4 API routes, API-backed Zustand store, topbar loadShops on mount, CreateShopDialog.
- ✅ **PWA for Android (PR #28)** — manifest (name, icons, shortcuts, dir:auto for RTL), service worker (stale-while-revalidate shell, network-first nav, network-only /api/*), ServiceWorkerRegister component, AI-generated 1024x1024 icon.
- ✅ **Active-shop DB routing (PR #29)** — db is now a Proxy that resolves the active shop's client on every access (reads data/app-meta.json → gets dbPath → getShopClient). Zero call-site changes (all 52 files keep working). Completes multi-shop.
- ✅ **12 advanced AI tools → 30 total (PR #30)** — create_product, update_product_price, get_product_details, create_customer, update_customer_notes, get_customer_orders, assign_order_to_delivery (full shipment creation flow), get_delivery_cost_comparison (all 3 providers), get_returns_summary, get_sales_by_wilaya, get_conversation_messages, search_orders. Spec target reached.
- ✅ **Auto-updater (PR #31)** — tauri.conf.json updater config (endpoint + Ed25519 pubkey + passive installMode), UpdateChecker component (auto-check on launch + dialog with release notes + download progress + relaunch), generate-update-manifest.ts script, UPDATES.md founder guide.
- ✅ **Tauri Stronghold master key (PR #32)** — tauri-plugin-stronghold + hex crate, 2 Tauri commands (get/save master key), master-key.ts hybrid resolution (Stronghold → keyfile → env), getMasterKeyAsync() for await-able call sites. ADR-004 production target implemented.

### Founder decisions (session 10)
- ❌ **TikTok DM integration KILLED (PR #33)** — removed from Settings UI + user-facing strings. WhatsApp-first. Conversation.channel field kept for potential future use.
- ❌ **Meta business verification KILLED** — will NOT be pursued. Market capped at ~50-60% of Algerian COD sellers (Instagram-first out) but eliminates Meta uncertainty.

---

## 🟡 Partially done (foundation laid, needs completion)

| Feature | What's done | What's missing |
|---|---|---|
| Feature flags in license | `features[]` field in license type | No `hasFeature()` checker gating UI — all licenses get `["all"]` (Phase 0 #7, 1 day) |
| Support chatbot | AI agent exists (operations) | Separate support chatbot for common onboarding questions (Phase 0 #19, 1 week) |
| Manual mode (no AI keys) | Regex extractor works without AI | No explicit "you're in manual mode" UI flow when keys missing (Phase 0 #10, 2-3 days) |
| Bundled runtime | Tauri build config done | Production builds need bun/node on PATH — bundle Bun for non-technical sellers (ADR-010 follow-up) |

---

## ⏳ Not started

| Feature | Effort | Notes |
|---|---|---|
| Marketing site + download | ~1 week | Phase 0 #15; Cloudflare Pages. Founder action. |
| v2-legacy feature audit | 1-2 days | Compare v2 features vs v3 to find gaps. Next session. |

---

## 🚫 Founder-action gates (Phase −1, BLOCKING)

| Gate | Description | Status |
|---|---|---|
| 1 | Real Darija validation (50 real WhatsApp messages → Gemini ≥85%) | ⏳ Needs founder action — load-bearing assumption |
| 2 | ~~Meta business verification decision~~ | ❌ KILLED (2026-06-21) — WhatsApp-first, no Meta |
| 3 | Marketing strategy section in design system | ⏳ Needs founder input |

---

## Branch Map

| Branch | HEAD | Purpose |
|---|---|---|
| `main` | `bffae33` | v3.0 + Phase 0 ~99% done (13 PRs sessions 9-10: PII ext, storefront UI, AI streaming, reports, 30 AI tools, e-commerce sync, delivery adapters, multi-shop, PWA, active-shop DB, auto-updater, Stronghold, TikTok kill) |
| `v2-legacy` | `1ffd327` | Old v2 code (reference only — do NOT merge). Needs feature audit next session. |
| `agent-handoff` | `ff64b5e` | Agent metadata + toolkit + handoff doc (orphan branch). Updated with kill decisions. |

---

## Verification

- ✅ `tsc --noEmit` — 0 errors
- ✅ `eslint .` — 0 errors (warnings: non-null assertions in adapters, acceptable)
- ✅ `vitest run` — 93/93 tests pass
- ✅ `sf-verify --fast` — green
- ✅ WhatsApp sidecar — compiles to 95MB binary, boots, serves QR
- ⚠️ Full `tauri:build` — needs user's Rust toolchain (not verified in sandbox)
- ⚠️ Delivery adapters — Yalidine/Maystro/ZR Express API calls untested against live APIs (need real credentials)
- ⚠️ AI chat — agent loop untested against live Gemini (needs real API key)
- ⚠️ E-commerce sync — untested against live Shopify/Woo/YouCan APIs (need credentials)
- ⚠️ Auto-updater — config done but no signed release published yet to test against
- ⚠️ Stronghold — Rust code added but not compiled (needs `tauri:build`)

---

## What's left for launch (priority order)

1. **Darija validation** (founder) — 50 real WhatsApp messages through Gemini. If <85%, the moat is broken.
2. **3 missing Phase 0 items** (next session A) — feature flags, support chatbot, manual mode
3. **Bundled runtime** (next session C) — research how to bundle Bun with Tauri for non-technical sellers
4. **v2-legacy feature audit** (next session B) — find any gaps between v2 and v3
5. **Marketing site** — Cloudflare Pages site for self-serve download
6. **Marketing strategy** (founder) — FB/IG content, WhatsApp groups, referral program

---

_Last updated: 2026-06-21 (session 10). Main = bffae33. 93 tests green. 46 API routes, 20 pages, 22 models, ~36,000 LOC. Phase 0 ~99% done. TikTok + Meta killed. Next: 3 Phase 0 polish items + v2 audit + bundled runtime research._
