# SahelFlow v3.0 — Project State

> **Living document.** Updated after every session. This is the "where are we right now" file.
> For the plan, see `full_build.md`. For history, see `BUILD_LOG.md`.

**Last updated:** 2026-06-21 (session 8)
**Main HEAD:** `54b11bf`
**Design system version:** v2.2

---

## At a Glance

| Metric | Value |
|---|---|
| Phase | Phase 0 (core features ~80% done; remaining = polish + founder gates) |
| LOC | ~22,600 (src/ + sidecars/) |
| Pages | 17 (dashboard, inbox, orders, customers, products, deliveries, returns, analytics, accounting, automations, agents, settings, imports, + order/customer detail + public storefront) |
| API routes | 34 (orders, customers, products, categories, extraction, whatsapp/*, conversations, secrets, delivery/*, import/*, export/*, ai/sessions, storefront, wilaya-risk, notifications) |
| Tests | 81 (order state machine 32 + regex extractor 16 + field-crypto 21 + customer-PII-encryption 12) |
| Prisma models | 21 (19 original + Secret + StorefrontConfig) |
| i18n keys | 1,092 × 3 locales (AR/FR/EN + RTL) |
| ADRs | 10 accepted, 0 open |
| Quality gate | ✅ tsc + eslint + 81/81 tests green |

---

## ✅ Done (sessions 1-8)

### Foundation (sessions 1-7)
- ✅ Tauri + Next.js 16 + Prisma + shadcn/ui scaffold
- ✅ Data: 58 wilayas, 1,541 communes, 1,092 i18n keys × 3 locales
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
- ✅ **Delivery integrations (Phase 0 #16)** — Yalidine fully implemented (create/sync/estimate); Maystro + ZR Express structural stubs; credentials in Secret store; UI in Settings + order detail
- ✅ **CSV/XLSX import + export** — import engine (parse, column-map, validate, batch-insert); products + customers import; CSV export for orders/customers/products; /imports page
- ✅ **AI chat agent (Phase 0 #19)** — 6 tools (search products/customers, create order, get stats, update status, estimate delivery); Gemini function-calling loop; sessions API; Agents page is now live chat
- ✅ **COD landing page builder foundation (Phase 0 #14)** — StorefrontConfig model, public storefront page (/storefront/[slug]), COD order-placement API, cart + checkout UI
- ✅ **Wilaya risk engine (Phase 0 #17)** — 58 risk profiles seeded, zone-based defaults, assessOrderRisk(), /api/wilaya-risk
- ✅ **Notifications API** — list, mark-read, delete; model already existed

---

## 🟡 Partially done (foundation laid, needs completion)

| Feature | What's done | What's missing |
|---|---|---|
| Delivery integrations | Yalidine full; Maystro/ZR Express stubs | Fill in Maystro + ZR Express API endpoints (need their API docs) |
| COD storefront | Config model + public page + order API | Storefront management UI (create/edit in Settings); Cloudflare deploy button; 2 more templates |
| AI chat | 6 tools + agent loop | 24 more tools (design system spec = 30); streaming responses |
| Multi-shop | `getShopClient()` + file-per-shop schema | Shop selector UI, shop management |
| License hardening | Ed25519 + trial | Hardened machine ID, 2-machine activation, feature flags |
| Auto-updater | Tauri plugin wired | Not configured (needs signed GitHub Releases) |
| Order.phone encryption | Customer PII done | Order.phone + Conversation.contactPhone (same pattern, next PR) |

---

## ⏳ Not started

| Feature | Effort | Notes |
|---|---|---|
| TikTok DM integration | ~1 week | Phase 0 #8; needs TikTok Business API access |
| E-commerce sync (Shopify/Woo/YouCan) | ~1 week | Phase 0 #16b; polling-based |
| Marketing site + download | ~1 week | Phase 0 #15; Cloudflare Pages |
| PWA for Android | 3-5 days | Phase 0 #13 |
| Daily WhatsApp reports | 2-3 days | v2 had a cron route |
| Bundled Bun runtime | 2-3 days | ADR-010 follow-up |
| Tauri Stronghold (OS keychain) | 3-5 days | Master key → Stronghold (ADR-004 production target) |

---

## 🚫 Founder-action gates (Phase −1, BLOCKING)

| Gate | Description | Status |
|---|---|---|
| 1 | Real Darija validation (50 real WhatsApp messages → Gemini ≥85%) | ⏳ Needs founder action |
| 2 | Meta business verification decision (commit or kill) | ⏳ Needs founder decision |
| 3 | Marketing strategy section in design system | ⏳ Needs founder input |

---

## Branch Map

| Branch | HEAD | Purpose |
|---|---|---|
| `main` | `54b11bf` | v3.0 + Phase 0 core + delivery + import/export + AI chat + storefront + risk engine |
| `v2-legacy` | `1ffd327` | Old v2 code (reference only — do NOT merge) |
| `agent-handoff` | (latest) | Agent metadata + toolkit (orphan branch) |

---

## Verification

- ✅ `tsc --noEmit` — 0 errors
- ✅ `eslint .` — 0 errors (warnings: non-null assertions in adapters, acceptable)
- ✅ `vitest run` — 81/81 tests pass
- ✅ `bun run build` — standalone build succeeds (verified session 8)
- ✅ WhatsApp sidecar — compiles to 95MB binary, boots, serves QR
- ✅ Delivery adapter — Yalidine API calls untested (needs real credentials)
- ✅ AI chat — agent loop untested against live Gemini (needs real API key)

---

_Last updated: 2026-06-21 (session 8). Main = 54b11bf. 81 tests green. 34 API routes, 17 pages, 21 models, ~22,600 LOC. Next priorities: storefront management UI, Maystro/ZR Express adapters, e-commerce sync, marketing site._
