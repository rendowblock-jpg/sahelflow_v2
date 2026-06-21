# SahelFlow v3.0 — Technical Architecture

> **The technical blueprint.** How the pieces fit together.
> For decisions + rationale, see `DECISIONS.md`. For the build plan, see `full_build.md`.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  SahelFlow Desktop App (Tauri)                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Tauri Shell (Rust)                                       │  │
│  │  ├── Window management                                    │  │
│  │  ├── Auto-updater (signed GitHub Releases)                │  │
│  │  ├── OS keychain access (credentials)                     │  │
│  │  ├── Machine-ID fingerprinting (5 signals)                │  │
│  │  ├── License validation on launch                         │  │
│  │  └── Baileys sidecar process management (spawn/kill)      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │ IPC (Tauri commands)             │
│  ┌───────────────────────────▼───────────────────────────────┐  │
│  │  Next.js 16 Webview (the UI + most logic)                 │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │  │
│  │  │  React UI   │  │  Data Layer │  │  AI Layer   │        │  │
│  │  │  (shadcn/ui)│  │  (Prisma)   │  │  (Gemini +  │        │  │
│  │  │             │  │  + Services │  │   regex)    │        │  │
│  │  └─────────────┘  └──────┬──────┘  └──────┬──────┘        │  │
│  │                          │                 │               │  │
│  │                   ┌──────▼──────┐  ┌───────▼───────┐       │  │
│  │                   │  SQLite     │  │  Gemini API   │       │  │
│  │                   │  (SQLCipher)│  │  (seller's    │       │  │
│  │                   │  per shop   │  │   free key)   │       │  │
│  │                   └─────────────┘  └───────────────┘       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │ stdio / WebSocket                 │
│  ┌───────────────────────────▼───────────────────────────────┐  │
│  │  Baileys Sidecar (Node process)                           │  │
│  │  ├── WhatsApp connection (QR auth)                        │  │
│  │  ├── Message send/receive                                 │  │
│  │  └── Auth state in SQLite (b3s-baileys)                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTPS (polling, not webhooks)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  External Services                                              │
│  ├── WhatsApp (via Baileys, unofficial)                         │
│  ├── TikTok Business API (DMs, polling)                         │
│  ├── Shopify / WooCommerce / YouCan (order sync, polling)       │
│  ├── Yalidine / Maystro / ZR Express (delivery, direct API)     │
│  └── Google AI Studio (Gemini 3.5 Flash, seller's free key)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Version | Why |
|---|---|---|---|
| **Desktop shell** | Tauri | 2.x | $0, native feel, Rust security, small binary |
| **UI framework** | Next.js | 16.x | App Router, React 19, the codebase the founder knows |
| **Language** | TypeScript | 5.x (strict) | Type safety, zero `any` |
| **Styling** | Tailwind CSS | 4.x | Utility-first, consistent |
| **Component library** | shadcn/ui (New York) | latest | Composable, accessible, themeable |
| **Database** | SQLite | 3.46 (bundled) | Local, $0, file-per-shop |
| **ORM** | Prisma | 6.x | Type-safe, schema-first (see ADR-002) |
| **Encryption** | SQLCipher | (Phase 0 #5) | At-rest encryption, key from machine ID |
| **State (client)** | Zustand | 5.x | Simple, no boilerplate |
| **State (server)** | TanStack Query | 5.x | Caching, invalidation |
| **Forms** | React Hook Form + Zod | latest | Type-safe validation |
| **WhatsApp** | Baileys + b3s-baileys | latest | Unofficial, local, SQLite auth state |
| **AI** | Google Gemini 3.5 Flash | (seller's key) | Free tier, 1,500 RPD, best Darija |
| **License crypto** | @noble/ed25519 | 2.x | Audited Ed25519 (see ADR-006) |
| **Testing** | Vitest + Playwright | latest | Unit/integration + E2E |
| **Package manager** | Bun | 1.x | Fast, reliable |

---

## 3. Project Structure

```
sahelflow_v2/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx            # Root layout (font, metadata)
│   │   ├── page.tsx              # Home / dashboard entry
│   │   ├── globals.css           # Tailwind + CSS variables (light/dark)
│   │   └── (dashboard)/          # Route group: authenticated app
│   │       ├── inbox/
│   │       ├── orders/
│   │       ├── customers/
│   │       ├── products/
│   │       ├── deliveries/
│   │       ├── analytics/
│   │       ├── accounting/
│   │       ├── returns/
│   │       ├── automations/
│   │       └── settings/
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives (button, card, dialog, etc.)
│   │   ├── dashboard/            # Dashboard-specific components
│   │   └── shared/               # Cross-cutting components
│   ├── lib/
│   │   ├── db.ts                 # Prisma client factory (multi-shop: getShopClient)
│   │   ├── env.ts                # Centralized config (no scattered process.env)
│   │   ├── utils.ts              # Pure helpers (cn, formatDZD, formatDate, etc.)
│   │   ├── data/                 # Service layer (one file per domain)
│   │   │   ├── order-service.ts
│   │   │   ├── customer-service.ts
│   │   │   ├── product-service.ts
│   │   │   ├── delivery-service.ts
│   │   │   └── ...
│   │   ├── ai/                   # AI layer
│   │   │   ├── extraction.ts     # Regex + Gemini smart routing
│   │   │   ├── gemini-client.ts  # Gemini API wrapper
│   │   │   ├── prompts/          # Extraction + chat prompts
│   │   │   └── tools/            # 30-tool agentic system
│   │   ├── delivery/             # Delivery adapters (rebuilt fresh)
│   │   │   ├── adapters.ts       # Yalidine, ZR Express, Maystro
│   │   │   └── shipment-service.ts
│   │   ├── integrations/         # E-commerce polling (Shopify/Woo/YouCan)
│   │   ├── license/              # License validation (types + crypto)
│   │   ├── i18n/                 # AR/FR/EN + RTL
│   │   │   ├── index.ts
│   │   │   └── locales/          # JSON files (ar.json, fr.json, en.json)
│   │   └── automation/           # Trigger/action engine
│   ├── types/                    # TypeScript types (domain models)
│   ├── hooks/                    # React hooks
│   └── stores/                   # Zustand stores
├── src-tauri/                    # Tauri shell (Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   ├── src/
│   │   ├── main.rs               # Entry point
│   │   └── lib.rs                # Tauri builder + command handlers
│   └── icons/
├── prisma/
│   └── schema.prisma             # 19 models, local-first redesign
├── data/                         # Runtime data (gitignored)
│   ├── wilayas.json              # 58 wilayas (ported from v2)
│   ├── communes.json             # 1,541 communes (ported from v2)
│   └── shops/                    # Per-shop SQLite files (gitignored)
│       └── dev.db
├── documentation/
│   ├── ultimate-design-system.md # The spec (v2.2)
│   ├── full_build.md             # The execution plan
│   ├── PROJECT_STATE.md          # Live status tracker
│   ├── BUILD_LOG.md              # Session history
│   ├── DECISIONS.md              # Architectural decisions (ADRs)
│   ├── PRE_FLIGHT_CHECKLIST.md   # v2 lessons to not repeat
│   ├── ARCHITECTURE.md           # This file
│   ├── VISION.md                 # Business context (from v2)
│   ├── AUDIT_FINDINGS_v2.md      # v2 audit (reference)
│   └── COMPETITOR_RESEARCH_v2.md # v2 competitor research (reference)
├── tests/                        # E2E tests (Playwright)
├── package.json
├── tsconfig.json
├── eslint.config.mjs
├── vitest.config.ts
├── components.json               # shadcn/ui config
└── next.config.ts
```

---

## 4. Data Flow: The Magic Moment (AAA Surface)

```
1. Customer sends WhatsApp message
   │
   ▼
2. Baileys sidecar receives message
   │ (stdio/WebSocket to Tauri)
   ▼
3. Message stored in SQLite (Message table)
   │
   ▼
4. Smart router: regex extractor first
   │
   ├── regex hits (≥60% of messages) ──→ extracted JSON (instant, offline, free)
   │
   └── regex misses ──→ Gemini 3.5 Flash API
                          │ (seller's key from OS keychain)
                          ▼
                        extracted JSON
   │
   ▼
5. Draft order created (Order table, status="draft")
   │
   ▼
6. Seller sees draft in inbox (UI)
   │
   ▼
7. Seller confirms order (status="confirmed", stock decremented)
   │
   ▼
8. Customer notified via WhatsApp (if connected)
   │
   ▼
9. Delivery dispatched (Delivery table, adapter.createShipment)
   │
   ▼
10. Tracking syncs (local polling loop, status updates)
```

**AAA-grade requirements for this flow:**
- 100% test coverage (unit + integration + E2E)
- Works offline (regex path needs no network)
- Graceful degradation (AI missing → manual mode, WhatsApp down → clear error)
- No data loss (messages persisted before processing)

---

## 5. Multi-Shop Architecture

```
App launch
  │
  ▼
Shop selector (from app-meta store)
  │
  ├── Shop A → /data/shops/shop-a.db (SQLCipher key derived from machineId + shopA-id)
  │            └── PrismaClient instance A
  │
  ├── Shop B → /data/shops/shop-b.db (SQLCipher key derived from machineId + shopB-id)
  │            └── PrismaClient instance B
  │
  └── ... (up to 10 shops)
```

- Shop metadata (name, icon, file path, encryption key reference) stored in app-meta store (NOT in a shop DB)
- Switching shops = close current PrismaClient, open new one
- Data never crosses shop boundaries (different files, different keys)
- Max 10 shops enforced at app level

---

## 6. Security Architecture (Layer 4-local)

```
┌─────────────────────────────────────────────┐
│  OS Keychain (all secrets)                  │
│  ├── Gemini API keys (per shop)             │
│  ├── Delivery provider tokens               │
│  │   (Yalidine, ZR Express, Maystro)        │
│  ├── E-commerce integration tokens          │
│  │   (Shopify, WooCommerce, YouCan)         │
│  └── License key (trial or permanent)       │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  SQLite (SQLCipher encrypted)               │
│  ├── Key derived from machine ID            │
│  │   (5 hardware signals, SHA-256)          │
│  ├── File is unreadable on another machine  │
│  └── Protects against theft, not drive fail │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  License Validation (on every launch)       │
│  ├── Ed25519 signature verification         │
│  ├── Machine ID fingerprint check           │
│  ├── 2-machine activation limit             │
│  ├── Version-gating (minAppVersion)         │
│  ├── Trial expiry check                     │
│  └── No valid license = app refuses launch  │
└─────────────────────────────────────────────┘
```

**Threat model:**
- **Stolen laptop:** SQLCipher protects DB. Keychain protects secrets. License is machine-tied (won't work on another machine). ✅
- **Hard drive failure:** Data is gone. No cloud backup (would require server). Seller accepts this risk. Documented in design system. ⚠️
- **License piracy:** Ed25519 signing + obfuscation + version-gating. Realistic piracy 5-15%. Acceptable. ✅
- **WhatsApp ban:** Rate-limit outgoing (max 1 msg/3s, burst ≤5). Inherent to unofficial libs. ⚠️

---

## 7. AI Architecture (Smart Routing)

```
Incoming message
  │
  ▼
┌─────────────────────┐
│  Regex Extractor    │
│  (instant, offline) │
│  - Arabic numerals  │
│  - Wilaya dict (58) │
│  - Currency parser  │
│  - Product patterns │
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    │ confidence│
    │  ≥80%?    │
    └─────┬─────┘
     yes  │  no
    ┌────┴────┐
    ▼         ▼
┌────────┐  ┌──────────────────┐
│ Return │  │ Gemini 3.5 Flash │
│ result │  │ (seller's key)   │
│        │  │ - Full Darija    │
│        │  │ - Complex orders │
│        │  │ - Ambiguous      │
└────────┘  └──────────────────┘
                │
                ▼
            ┌────────┐
            │ Return │
            │ result │
            └────────┘
```

**Quota math (1,500 RPD Gemini):**
- Regex handles ~70% → ~1,050 messages/day need no Gemini call
- Gemini handles ~30% → ~450 calls/day for extraction
- AI chat + agentic tools: remaining ~1,050 calls/day
- Power users (>50 chat questions/day) may approach limit — acceptable for v1

---

## 8. Testing Strategy (C100-AAA)

| Layer | Framework | Coverage Target | What to test |
|---|---|---|---|
| AAA surface (license, extraction, orders, Magic Moment) | Vitest | **100%** | Every path, every edge case |
| Dashboard/components | @testing-library/react + Vitest | 80% | Rendering, interactions, a11y |
| Utilities/helpers | Vitest | 60% | Pure functions |
| Database | Vitest + in-memory SQLite | 100% on data layer | CRUD, multi-shop isolation, migrations |
| E2E critical flows | Playwright (web) + Tauri test driver | Magic Moment: 100% | Full message → order → delivery flow |

**Enforcement:** `sf-verify` runs `vitest run` on every change. CI gate on AAA surface coverage.

---

## 9. Deployment & Distribution

```
Founder's machine:
  bun run tauri:build
    │
    ├── Windows .exe / .msi (signed)
    ├── macOS .dmg (signed + notarized) — Phase 2+
    └── Linux .AppImage — Phase 2+
    │
    ▼
GitHub Releases (signed, auto-update feed)
    │
    ▼
Marketing site (Cloudflare Pages)
  ├── Download page
  └── Storefronts ([seller].sahelflow.app)
    │
    ▼
Seller downloads + installs
  ├── App self-issues 7-day trial license
  ├── Guided wizard: WhatsApp QR + Gemini API key
  ├── Magic Moment (first AI extraction)
  └── Day 7: pay 25K DZD → founder emails signed license → seller pastes → unlocked
```

**Cost: $0/month** (Cloudflare Pages free, GitHub Releases free, no VPS, no server).

---

_Last updated: 2026-06-21 — v3.0 architecture. Foundation scaffold done. Most layers not yet implemented._
