# SahelFlow v3.0 — Project State

> **Living document.** Updated after every session. This is the "where are we right now" file.
> For the plan, see `full_build.md`. For history, see `BUILD_LOG.md`.

**Last updated:** 2026-06-21
**Main HEAD:** `4f8f109` (data layer)
**Design system version:** v2.2

---

## At a Glance

| Metric | Value |
|---|---|
| Phase | Phase −1 (pre-Phase-0 gates) — BLOCKING |
| Foundation scaffold | ✅ Done (tsc + eslint green) |
| UI shell | ✅ Done (sidebar, topbar, dashboard, 12 pages) |
| Data layer | ✅ Done (6 services, Zod validation, order state machine) |
| Tests | 32 (order state machine — 100% coverage) |
| i18n | ✅ 1,092 keys × 3 locales (AR/FR/EN, RTL) |
| Wilaya data | ✅ 58 wilayas ported (communes = known gap) |
| Prisma models | 19 (schema designed, not yet used) |
| LOC | ~6,000 (config + schema + UI shell + data layer + ported data) |
| Open blocking decisions | 3 (Gates 1-3) + 1 technical (Prisma + SQLCipher) |

---

## Phase −1: Pre-Phase-0 Gates (BLOCKING)

| Gate | Description | Status | Blocks |
|---|---|---|---|
| 1 | Real Darija validation (50 real messages → Gemini ≥85%) | ⏳ Not started — needs founder action | Phase 0 items #11, #11b |
| 2 | Meta business verification decision (commit or kill) | ⏳ Needs founder decision | Positioning, market cap |
| 3 | Marketing strategy section in design system | ⏳ Needs founder input | Go-to-market plan |

---

## Phase 0: The Tauri Pivot

### Phase 0.1: De-risking Spikes

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Baileys sidecar spike (5 days) | ⏳ Not started | Load-bearing. Fallback: $2-5/mo VPS |
| 11 | Local regex extractor prototype (4-5 days) | ⏳ Not started | Depends on Gate 1 |
| 11b | Gemini 3.5 Flash integration (3-4 days) | ⏳ Not started | Depends on Gate 1 |

### Phase 0.2: Core Infrastructure

| # | Item | Status | Notes |
|---|---|---|---|
| 2 | Tauri shell wrapping Next.js | 🟡 Config scaffolded | Not compiled (needs Rust toolchain) |
| 3 | Local SQLite data layer | 🟡 Schema done | 19 models, file-per-shop. Data services not built. |
| 4 | License validation (Layer 4-local) | 🟡 Skeleton + types done | `sf-license` tool ✅ works. App-side crypto not implemented. |
| 5 | SQLCipher encrypted SQLite | ⏳ Not started | ⚠️ Open decision: Prisma vs Drizzle vs raw |
| 6 | Automatic update system | ⏳ Plugin wired | Not configured |

### Phase 0.3: AI + Extraction Layer

| # | Item | Status | Notes |
|---|---|---|---|
| 9 | Guided AI key setup wizard | ⏳ Not started | |
| 10 | Manual mode (no AI keys) | ⏳ Not started | |

### Phase 0.4: Integrations

| # | Item | Status | Notes |
|---|---|---|---|
| 8 | TikTok DM integration (polling) | ⏳ Not started | Needs TikTok Business API access |
| 16 | Polling integrations (Shopify/Woo/YouCan) | ⏳ Not started | Delivery adapters rebuilt fresh |
| 17 | Wilaya risk engine activation | 🟡 Schema ready | Data not ported from v2 yet |

### Phase 0.5: UI + UX

| # | Item | Status | Notes |
|---|---|---|---|
| — | UI shell (sidebar, topbar, dashboard) | ⏳ Not started | shadcn/ui not installed yet |
| 14 | COD landing page builder v1 | ⏳ Not started | 2-3 weeks |
| 13 | PWA for Android | ⏳ Not started | |
| 15 | Marketing site + download | ⏳ Not started | |

### Phase 0.6: Polish + Ship

| # | Item | Status | Notes |
|---|---|---|---|
| 12 | Multi-shop support | 🟡 Schema ready | UI not built |
| 18 | Remove dead code | ✅ N/A | Greenfield — nothing to remove |
| 19 | AI support chatbot | ⏳ Not started | |
| — | Feature flags in license | ⏳ Not started | Types defined |

---

## What's Done (Foundation Scaffold — commit `ad26caf`)

### Code
- ✅ **UI shell** (sidebar + topbar + dashboard layout, 12 pages, i18n + RTL)
- ✅ **i18n** (1,092 keys × AR/FR/EN, React 19 use() pattern, RTL auto-flip)
- ✅ **State stores** (Zustand: ui-store for locale/sidebar, shop-store for multi-shop)
- ✅ **Ported data** (58 wilayas with Arabic names + zones; communes = known gap)
- ✅ Tauri shell config (`src-tauri/` — Cargo.toml, tauri.conf.json, lib.rs, capabilities)
- ✅ Next.js 16 + TypeScript strict + Tailwind 4 + shadcn-ready CSS
- ✅ Prisma schema (19 models, local-first redesign — `prisma/schema.prisma`)
- ✅ License validation skeleton (types + stubs — `src/lib/license/`)
- ✅ i18n scaffold (AR/FR/EN + RTL — `src/lib/i18n/`)
- ✅ Lib foundation (`src/lib/env.ts`, `src/lib/db.ts`, `src/lib/utils.ts`)
- ✅ Minimal app shell (`src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`)
- ✅ shadcn/ui components (11): button, card, dropdown-menu, avatar, separator, tabs, tooltip, scroll-area, sheet, skeleton, badge

### Config
- ✅ `package.json` (deps: Next 16, React 19, Prisma 6, Zod 4, Zustand 5, TanStack Query 5, shadcn-ready)
- ✅ `tsconfig.json` (strict, noUncheckedIndexedAccess, noUnusedLocals/Params)
- ✅ `eslint.config.mjs` (zero `any`, no console.log, prefer-const)
- ✅ `vitest.config.ts` (C100-AAA coverage targets)
- ✅ `components.json` (shadcn/ui New York, neutral base)
- ✅ `next.config.ts`, `postcss.config.mjs`

### Verification
- ✅ `tsc --noEmit` — 0 errors
- ✅ `eslint .` — 0 errors, 0 warnings
- ✅ `prisma generate` — client generated
- ✅ `prisma db push` — schema pushed to dev SQLite (20 tables created)

---

## What's NOT Done (next sessions)

### Immediate next steps (after Phase −1 gates)
1. ~~Port wilaya/commune data~~ ✅ (58 wilayas done; communes = known gap)
2. ~~Port full i18n translations~~ ✅ (1,092 keys × 3 locales)
3. ~~Install shadcn/ui components~~ ✅ (11 components)
4. ~~Build UI shell~~ ✅ (sidebar + topbar + dashboard + 12 pages)
5. Source a static commune dataset (known gap — v2 fetched from Yalidine API at runtime)
6. Build the data layer (Prisma services for orders, customers, products, deliveries)
7. Implement license crypto (Phase 0 item #4 — `sf-license` tool is ready)
8. Resolve Prisma + SQLCipher decision (Phase 0 item #5)
9. Baileys sidecar spike (Phase 0 item #1)
10. Regex + Gemini prototypes (Phase 0 items #11, #11b — needs Gate 1)

### Open decisions (documented in `DECISIONS.md`)
- ⚠️ Prisma + SQLCipher: (a) Prisma custom engine, (b) Drizzle + better-sqlite3, (c) raw better-sqlite3
- ⚠️ Meta business verification: commit by client #30, or kill permanently
- ✅ Credential storage: OS keychain for ALL secrets (locked v2.2)

---

## Branch Map

| Branch | HEAD | Purpose |
|---|---|---|
| `main` | `ad26caf` | v3.0 greenfield (active work) |
| `v2-legacy` | `1ffd327` | Old v2 code (reference only — do NOT merge) |
| `agent-handoff` | `415cf9a` | Agent metadata + toolkit (orphan branch) |

---

## Security Debt

| # | Item | Status | Owner |
|---|---|---|---|
| 1 | Rotate v2 Supabase demo password (plaintext in v2-legacy history) | ⏳ Not done | Founder |
| 2 | BFG/filter-repo v2-legacy history (optional) | ⏳ Low priority | Founder |
| 3 | v2 CI secrets (E2E_LOGIN_*) | ✅ N/A for v3 | — |

---

_Last updated: 2026-06-21 — Data layer done (services + state machine + tests + seed). Dashboard shows real data. Next: license crypto or Baileys spike._
