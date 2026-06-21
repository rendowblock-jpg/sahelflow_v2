# SahelFlow v3.0 — Build Log

> **Chronological history.** Append a new entry after every session.
> Newest at top. For current state, see `PROJECT_STATE.md`.

---

## Session 2 — 2026-06-21: UI shell + ported data (wilayas + i18n)

**Branches affected:** `main`
**Commits:** `8c99299`

### What was built

**Data ported from v2-legacy (as raw JSON, not code):**
- `data/wilayas.json` — 58 wilayas with Arabic names + zones (north/east/west/center/highPlateaux/south)
- `data/communes.json` — `[]` (known gap: v2 fetched communes at runtime from Yalidine API; no static dataset exists. Flagged for founder.)
- `src/lib/i18n/locales/{ar,fr,en}.json` — 1,092 keys per locale (was 21 stubs). Full AR/FR/EN parity verified. Arabic RTL preserved.

**shadcn/ui components installed (11):**
- button, card, dropdown-menu, avatar, separator, tabs, tooltip, scroll-area, sheet, skeleton, badge

**UI shell built:**
- `src/components/layout/navigation.ts` — single source of truth (11 nav items, 3 groups: operations/insights/administration)
- `src/components/layout/sidebar.tsx` — collapsible sidebar, grouped nav, active-state highlighting, RTL-aware chevrons, keyboard accessible
- `src/components/layout/topbar.tsx` — shop selector dropdown, language switcher (AR/FR/EN with flags), AI status badge, avatar
- `src/components/layout/dashboard-layout.tsx` — sidebar + topbar + scrollable content area
- `src/app/(dashboard)/layout.tsx` — route group layout wrapping all dashboard pages
- `src/app/(dashboard)/dashboard/page.tsx` — dashboard home with 4 stats cards + 2 secondary cards + empty state (trilingual: AR/FR/EN)
- 11 stub pages for remaining nav routes (inbox, orders, customers, products, deliveries, returns, analytics, accounting, agents, automations, settings)

**State management:**
- `src/stores/ui-store.ts` — Zustand persisted (locale, sidebar collapsed state)
- `src/stores/shop-store.ts` — multi-shop state (stub dev shop, max 10 enforcement, active shop tracking)

**Hooks:**
- `src/hooks/use-i18n.ts` — React 19 `use()` pattern for translation loading (cached promises, zero setState-in-effect violations, automatic `<html lang/dir>` sync)
- `src/hooks/use-mobile.ts` — `useSyncExternalStore` (React 19 pattern, no setState-in-effect)

**Root layout updated:**
- Inter (latin) + Amiri (arabic) fonts via next/font
- TooltipProvider wrapper
- Default lang="fr", dir auto-set by useI18n

**Root page redirects to /dashboard.**

### Engineering notes
- React 19 + Next 16 ESLint rules are strict: `react-hooks/set-state-in-effect` flags any synchronous setState in effects. Solved by using `use()` for async translation loading and `useSyncExternalStore` for mobile detection.
- DOM mutations (html lang/dir) belong in `useEffect`, not `useMemo` (the rule correctly flags side-effects in useMemo).
- i18n uses the v2 key namespace (`nav.dashboard`, `nav.groupOperations`, `status.confirmed`) — NOT the v3 stub namespace (`orders.status.confirmed`). Any future code should use the v2 key names.

### Verification
- `tsc --noEmit` ✅ (0 errors)
- `eslint .` ✅ (0 errors, 0 warnings)
- Both green after refactoring use-i18n (3 iterations) and use-mobile (1 iteration)

### Known gaps flagged
1. **Communes dataset:** v2 fetched communes at runtime from Yalidine API. v3 needs either a static dataset or the same runtime-fetch pattern. Currently `data/communes.json` is `[]`.
2. **Runtime verification:** Could not run SahelFlow's dev server (port 3000 is occupied by the sandbox's own Next.js project). tsc + eslint pass, but browser-level rendering verification needs the user's machine or a different port.

### Open items carried forward
- Phase −1 Gate 1: Real Darija validation (needs founder action)
- Phase −1 Gate 2: Meta business verification decision
- Phase −1 Gate 3: Marketing strategy section
- Communes dataset (static source needed)
- Phase 0 item #5: Prisma + SQLCipher tension (open decision)
- Security: rotate v2 Supabase demo password (founder action)

### Next session priorities
1. Source a static commune dataset (or decide to use runtime fetch)
2. Build the data layer (Prisma services for orders, customers, products, deliveries)
3. Implement license crypto (Phase 0 item #4)
4. Resolve Prisma + SQLCipher decision (Phase 0 item #5)
5. Baileys sidecar spike (Phase 0 item #1) — once Gate 1 resolved

---

## Session 1 — 2026-06-21: Greenfield pivot + foundation scaffold + agent-handoff redesign

**Branches affected:** `main` (reset to fresh), `v2-legacy` (created), `agent-handoff` (redesigned)
**Commits:** `ad26caf` (main), `415cf9a` (agent-handoff)

### Decisions made
1. **Greenfield over migration.** v2 codebase (Next.js + Supabase web app) was the wrong shape for the v2.1 design system (Tauri local-first desktop). 61 files imported Supabase, 46 API routes, 39 auth-wrapped handlers — migration would produce a Frankenstein. Greenfield produces a clean Tauri app from line 1.
2. **Zero code copied from v2.** Schema *design*, audit *lessons*, and design system travel as reference. Wilaya/commune data + i18n translations to be ported as raw JSON (government data + linguistic work, not code).
3. **Repo strategy:** keep `sahelflow_v2` repo. Old main → `v2-legacy` branch (safety net). Fresh `main` = greenfield. `agent-handoff` untouched (cross-chat persistence intact).
4. **Credential storage:** all third-party credentials (AI keys + delivery tokens + e-commerce tokens) stored in OS keychain, never in SQLite. Locked as design system v2.2.

### What was built

**Foundation scaffold (`main` @ `ad26caf`):**
- Tauri shell config (`src-tauri/` — Cargo.toml, tauri.conf.json, lib.rs with shell/store/os/process/updater plugins)
- Next.js 16 + TypeScript strict + Tailwind 4 + shadcn-ready CSS variables (light/dark)
- Prisma schema — 19 models redesigned for local-first:
  - No `sellers` table (app owner = the seller)
  - No `team_members` (team feature dropped)
  - No RLS (local DB, single user)
  - No `seller_id` columns (file-per-shop — the file IS the shop)
  - Integer money (DZD) — never Float
  - Cuid IDs (no sequential integers)
  - `PollingEvent` replaces `webhook_events` (polling replaces webhooks)
  - Integration credentials deliberately absent (→ OS keychain)
- License validation skeleton (`src/lib/license/types.ts` + `index.ts`):
  - Full type definitions: `LicensePayload`, `SignedLicense`, `MachineFingerprint`, `LicenseValidationResult`
  - 5-signal machine ID type (CPU, motherboard, disk, MAC, OS GUID)
  - Stub functions (real crypto in Phase 0 item #4)
  - Dev mode bypass (returns "valid" in development)
- i18n scaffold (`src/lib/i18n/`):
  - AR/FR/EN + RTL infrastructure
  - 21 keys per locale (nav + order statuses) — stubs, real translations to be ported
- Lib foundation:
  - `src/lib/env.ts` — centralized config (no scattered `process.env.X!`)
  - `src/lib/db.ts` — Prisma client factory with multi-shop support (`getShopClient(shopFilePath)`)
  - `src/lib/utils.ts` — `cn()`, `formatDZD()`, `formatDate()`, `generateOrderNumber()`, `isValidDZPhone()`
- Engineering standards:
  - `tsconfig.json`: strict, noUncheckedIndexedAccess, noUnusedLocals/Params, noImplicitReturns
  - `eslint.config.mjs`: zero `any`, no console.log (warn), prefer-const, no-non-null-assertion (warn)
  - `vitest.config.ts`: C100-AAA coverage targets (60% global floor, 100% on AAA surface per-directory)

**Agent-handoff redesign (`agent-handoff` @ `415cf9a`):**
- Restructured `AGENT_HANDOFF.md` (617 lines): v3.0 front-and-center, v2 history archived
- New toolkit (4 tools):
  - `sf-verify` — quality gate (prisma generate → tsc → eslint → vitest). Tested: tsc + eslint PASS.
  - `sf-db` — local SQLite CLI (test, tables, schema, query, exec, count, reset, seed). Tested: connects, lists 20 tables.
  - `sf-license` — founder's offline Ed25519 license signer (keygen, sign, verify). Tested: full round-trip.
  - `sf-port` — v2→v3 data porter (wilayas, i18n). Tested: lists 4 v2 source files.
- `sb-db` kept as legacy (v2 Supabase reference access)
- `bootstrap.sh` updated for v3.0: Supabase optional, installs v3 deps + all tools, verifies local SQLite

**Documentation (`main`, this commit):**
- Brought reference docs from v2-legacy: `ultimate-design-system.md`, `AUDIT_FINDINGS_v2.md`, `COMPETITOR_RESEARCH_v2.md`, `VISION.md`
- Fixed 4 drifts in `ultimate-design-system.md` → v2.2:
  1. Title: v2.0 → v2.1
  2. Principle 3: removed stale Groq reference (Gemini-only)
  3. Risk #1: Groq/Gemini → Gemini; mitigation updated
  4. Success metrics: trial-to-paid >20% → >30%
- Added credential storage decision (OS keychain for all secrets) to Section 2.2
- Created: `full_build.md`, `PROJECT_STATE.md`, `BUILD_LOG.md` (this file), `DECISIONS.md`, `PRE_FLIGHT_CHECKLIST.md`, `ARCHITECTURE.md`

### Verification
- `tsc --noEmit` ✅ (0 errors)
- `eslint .` ✅ (0 errors, 0 warnings)
- `prisma generate` ✅
- `prisma db push` ✅ (20 tables created in dev SQLite)
- `sf-verify --fast` ✅ (ALL CHECKS PASSED)
- `sf-db test` ✅ (SQLite 3.46, 20 tables)
- `sf-license keygen → sign → verify` ✅ (Ed25519 round-trip)
- `sf-port list` ✅ (finds all 4 v2 source files)
- `sb-db test` ✅ (PostgreSQL 17.6, v2-legacy reference)

### Open items carried forward
- Phase −1 Gate 1: Real Darija validation (needs founder action — 50 real WhatsApp messages)
- Phase −1 Gate 2: Meta business verification decision (needs founder decision)
- Phase −1 Gate 3: Marketing strategy section (needs founder input)
- Phase 0 item #5: Prisma + SQLCipher tension (open decision — see `DECISIONS.md`)
- Security: rotate v2 Supabase demo password (founder action)

### Next session priorities
1. Resolve Phase −1 gates (founder decisions)
2. Port wilaya/commune data + i18n translations (`sf-port`)
3. Install shadcn/ui + build UI shell
4. Begin Phase 0 item #1 (Baileys sidecar spike) — once Gate 1 is resolved

---

_Last updated: 2026-06-21 — Session 1 complete. Foundation + agent-handoff + docs done. Awaiting founder decisions on Phase −1 gates._
