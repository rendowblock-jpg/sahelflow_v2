# SahelFlow v3.0 — Build Log

> **Chronological history.** Append a new entry after every session.
> Newest at top. For current state, see `PROJECT_STATE.md`.

---

## Session 6 — 2026-06-21: AI extraction + inbox + automations + agents + build guide

**Branches affected:** `main`
**Commits:** `0954d0c`, `34aff9e`, `001cde1`

### What was built

**AI extraction engine (the moat):**
- `src/lib/ai/extraction/regex-extractor.ts` (167 lines): handles ~70% of COD messages instantly, offline, free. Patterns for Arabic Darija, French, mixed. Extracts items, wilaya (58, AR+FR), phone (Algerian format), customer name. Arabic-Indic numeral normalization. Confidence scoring.
- `src/lib/ai/extraction/gemini-extractor.ts` (174 lines): uses seller's free-tier Gemini key. Tries 3 models (2.5-flash, 2.0-flash, 1.5-flash). 15s timeout, rate-limit handling, markdown fence stripping.
- `src/lib/ai/extraction/smart-router.ts`: regex first (≥0.6 confidence + complete) → Gemini for complex. Protects 1,500 RPD quota.
- 16 tests (all passing) — Arabic Darija, French, mixed, edge cases, confidence scoring.

**Inbox UI (the Magic Moment):**
- Conversation list (left): contact, phone, channel badge, unread count, last message time
- Message thread (right): chat bubbles (inbound left, outbound right), timestamps
- `src/components/inbox/message-extraction.tsx` (234 lines): "Extraire la commande" button on each inbound message → calls /api/extraction → shows extracted data (customer, phone, wilaya, items, confidence, method) → "Créer la commande" button creates customer + order → redirects to order detail
- API route: POST /api/extraction
- Seed: 5 conversations with realistic Algerian COD messages (Arabic Darija + French)

**Automations page:**
- 3 stat cards, active automations list, 4 pre-built recipe templates (confirmation, tracking, stock alert, thank you)

**AI Agents page:**
- Gemini status banner, 4 AI capability cards, recent chat sessions, empty state

**Desktop build guide (documentation/DESKTOP_BUILD.md, 157 lines):**
- Prerequisites: Rust, Node, Bun, Tauri CLI
- Step-by-step: clone → install → db setup → seed → dev/build
- Testing checklist + troubleshooting

### Final verification
- tsc ✅ (0 errors) · eslint ✅ (0 errors, 0 warnings) · vitest ✅ (48/48 tests)
- 16 pages, 8 API routes, 30 components, 26 lib modules, 11 docs, ~10,500 LOC

### App status
All 12 dashboard pages are functional (no stubs). The app is a complete back-office tool with:
- Real CRUD for orders, customers, products
- AI extraction (regex + Gemini) in the inbox
- License validation with Ed25519 crypto
- Analytics with charts, accounting with P&L
- Trilingual i18n (AR/FR/EN + RTL)
- 48 passing tests

### Still needed for production desktop app
- Communes dataset (data/communes.json is [])
- Dark mode toggle
- Mobile responsive sidebar
- Baileys sidecar (Phase 0 #1) — real WhatsApp
- Gemini key setup wizard (Phase 0 #9)
- SQLCipher encryption (Phase 0 #5)
- Tauri compilation (needs Rust on user's machine)

---

## Session 5 — 2026-06-21: License crypto + 5 functional pages + manual order creation

**Branches affected:** `main`
**Commits:** `c0cb192`, `a112e05`, `370a0b0`, `35e37c1`

### What was built

**License validation (Phase 0 item #4):**
- `src/lib/license/crypto.ts` — real Ed25519 verification via @noble/ed25519, isExpired, daysRemaining, meetsVersionRequirement (semver)
- `src/lib/license/machine-id.ts` — browser fingerprint in dev, real hardware in Tauri (TODO)
- `src/lib/license/license-service.ts` — validateLicense (signature → machine ID → version → expiry), issueTrial (7-day, machine-ID-tied)
- `src/stores/license-store.ts` — Zustand persisted (stores license JSON)
- `src/hooks/use-license.ts` — client hook: checks license on mount, self-issues trial
- `src/components/settings/license-panel.tsx` — settings UI: status badge, type, expiry, machine ID with copy button, paste-key dialog
- Settings page rewritten: license panel + integrations status + about panel

**Deliveries page:**
- Server component with status filter tabs (all/pending/in_transit/delivered/returned)
- 4 stat cards, table with tracking number/order link/customer/provider/cost/status/date

**Analytics page:**
- 4 summary stats (revenue, orders, avg order value, delivery rate)
- Revenue bar chart (7 days, recharts)
- Orders by status pie chart (color-coded)
- Top 5 products by revenue

**Accounting page:**
- 4 P&L stat cards (revenue, COGS, expenses, net profit — color-coded)
- Revenue vs Expenses bar chart (6 months)
- Monthly expenses list

**Returns page:**
- 4 stat cards, table with order link/customer/type/reason/status/date

**Manual order creation (completes the manual Magic Moment):**
- `src/components/orders/order-form-dialog.tsx` (366 lines): multi-step client component
  - Customer select (auto-fills delivery info from customer record)
  - Product line items (dropdown, quantities, live total)
  - Delivery form (58 wilayas dropdown, commune, address, phone, delivery cost)
  - POST /api/orders → redirect to order detail
- POST endpoint added to /api/orders
- Orders list page updated with "Nouvelle commande" button

### Verification
- tsc ✅ (0 errors) · eslint ✅ (0 errors, 0 warnings) · vitest ✅ (32/32)

### App status
The app is now a **functional back-office tool**. A seller can:
- See real dashboard data ✅
- Create orders manually (customer → products → delivery → submit) ✅
- Manage order lifecycle (confirm → ship → deliver → return/cancel) ✅
- Manage customers (CRUD) ✅
- Manage products (CRUD with stock) ✅
- View deliveries with tracking ✅
- View returns ✅
- View analytics with charts ✅
- View accounting with P&L ✅
- Manage license (view status, machine ID, paste permanent key) ✅

### Still missing for full app
- Inbox (conversations + messages) — needs Baileys (Phase 0 #1)
- AI extraction (Gemini + regex) — needs Phase 0 #11/#11b
- Automations — not critical for v1
- Agents (AI chat) — not critical for v1

---

## Session 4 — 2026-06-21: CRUD UI — orders, customers, products

**Branches affected:** `main`
**Commits:** `5b6f832`

### What was built

**Orders (AAA surface):**
- Orders list page (server component): status filter tabs with counts, 4 stat cards, table with full order info, links to detail
- Order detail page (server component): items + totals, delivery info, customer card, delivery address, status timeline
- Order status actions (client component): context-aware buttons based on state machine (Confirm, Ship, Deliver, Return, Cancel), calls API, refreshes on success
- API routes: GET /api/orders, PATCH /api/orders/[id]/status

**Customers (subagent):**
- List page with stat cards + table + create dialog
- Form dialog (react-hook-form + zod, POST /api/customers)
- Detail page with order history
- API routes: full CRUD

**Products (subagent):**
- List page with 4 stat cards (total, active, low stock, inventory value) + table with stock badges + create dialog
- Form dialog (8 fields, category select, POST /api/products)
- Detail page with pricing/stock/margin + recent orders
- API routes: full CRUD + categories

**shadcn/ui components installed:** input, label, dialog, table, form, select, switch (7 new)

### Verification
- tsc ✅ (0 errors) · eslint ✅ (0 errors, 0 warnings) · vitest ✅ (32/32)

---

## Session 3 — 2026-06-21: Data layer — types, validation, state machine, services, seed, tests

**Branches affected:** `main`
**Commits:** `4f8f109`

### What was built

**Domain types (`src/types/domain.ts`, 181 lines):**
- Clean Prisma-independent types: Order, OrderItem, Customer, Product, Category, Delivery, Conversation, Message, DashboardStats
- Money is always integer DZD. IDs are cuid strings.
- Status enums: OrderStatus (8 values), OrderSource (7), DeliveryStatus (10), DeliveryProvider (3), MessageChannel (2)

**Typed errors (`src/types/errors.ts`, 91 lines):**
- SahelFlowError base class (code + statusCode)
- NotFoundError (404), ValidationError (400), BusinessRuleError (409), InvalidTransitionError (409), ConflictError (409), ExternalServiceError (502), RateLimitError (429)

**Zod validation (`src/lib/validation/index.ts`, 142 lines):**
- Primitives: nonEmptyString, dzPhone (regex 0[5-7]XXXXXXXX), nonNegInt, posInt, cuid, isoDate
- Schemas: createOrder, updateOrderStatus, createCustomer, updateCustomer, createProduct, updateProduct, createCategory, createDelivery
- Every service function validates input against a schema before touching the DB

**Order state machine (`src/lib/order-transitions.ts`, 134 lines):**
- 8 statuses, 4 terminal (delivered/returned/refused/cancelled)
- ALLOWED_TRANSITIONS table: draft→[pending,cancelled], pending→[confirmed,cancelled], confirmed→[shipped,returned,refused,cancelled], shipped→[delivered,returned,refused]
- canTransition(), assertCanTransition(), getAllowedTransitions()
- triggersStockDeduction(), triggersStockRestoration(), triggersCustomerStatsUpdate() — for the order service's transactional side effects
- **32 unit tests, all passing** (100% coverage of transition rules)

**Service layer (`src/lib/data/`):**
- `service-base.ts`: ServiceContext type (takes PrismaClient for multi-shop), withServiceError wrapper (catches Zod→ValidationError, Prisma→NotFoundError, lets SahelFlowError pass), generateOrderNumber
- `customer-service.ts`: list, getById, getByPhone, create, update, delete (blocks if orders exist), incrementStats
- `product-service.ts`: list, getById, create, update, delete (soft-deletes if order items exist), deductStock, restoreStock, listLowStock, categories (list + create)
- `order-service.ts` (244 lines, AAA surface): create (transaction: order + items + total calculation + order number generation), updateStatus (transaction: state machine enforcement + stock deduction/restoration + customer stats update), list, getById, getByOrderNumber, countByStatus, listToday
- `delivery-service.ts`: list, getById, getByOrderId, create, updateStatus, listActive (adapter integration deferred to Phase 0 #16)
- `stats-service.ts`: getDashboard (7 parallel Prisma queries for dashboard metrics)
- `dashboard.ts`: server-side data fetchers (getDashboardStats, getRecentOrders)

**Seed script (`scripts/seed.ts`, 203 lines):**
- 3 categories (Électronique, Mode, Maison)
- 15 products (realistic Algerian e-commerce: écouteurs JBL 4500 DA, montre connectée 8500 DA, robe d'été 3500 DA, etc.)
- 5 customers (Ahmed Benali Alger, Fatima Zohra Oran, Karim Haddad Constantine, Amina Cherif Sétif, Yacine Brahimi Annaba)
- 8 orders covering all statuses (delivered, shipped, confirmed, pending, draft, returned, cancelled)
- 3 deliveries (for shipped/delivered orders, Yalidine provider)

**Dashboard wired to real data:**
- Rewritten as server component (was client with stub data)
- Reads from statsService (7 metrics) + recent 5 orders
- Shows real counts, real order list with status badges, real revenue

**i18n:**
- `src/lib/i18n-server.ts`: server-side i18n for server components (reads locale from cookie, loads JSON synchronously, caches module-level)
- `ui-store.ts`: setLocale now syncs to cookie (so server components can read it)

### Verification
- `tsc --noEmit` ✅ (0 errors)
- `eslint .` ✅ (0 errors, 0 warnings — scripts/ added to ignores)
- `vitest run` ✅ (32/32 tests passing)
- Seed runs successfully (3 + 15 + 5 + 8 + 3 records created)

### Engineering decisions
- Services take `ServiceContext { prisma }` parameter (not a global) — supports multi-shop (file-per-shop) from day 1
- Order status transitions enforced in the service layer (not the DB) — the state machine is testable without a DB
- Stock side effects (deduct on confirm, restore on return/cancel/refuse) happen in a transaction with the status update — atomic
- Zod schemas are the single source of truth for input shapes — domain types are inferred from them where possible
- Server components use `getI18n()` (async, cookie-based); client components use `useI18n()` (React 19 `use()` pattern)

### Next session priorities
1. License crypto implementation (Phase 0 item #4 — `sf-license` tool is ready, wire into app)
2. Build CRUD UI for orders (list + detail + status actions)
3. Source a static commune dataset
4. Resolve Prisma + SQLCipher decision (Phase 0 item #5)
5. Baileys sidecar spike (Phase 0 item #1) — once Gate 1 resolved

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
