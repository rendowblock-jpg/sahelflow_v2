# Changelog

All notable changes to SahelFlow are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.1.0] — 2026-07-06

### Session 30 — 10-Phase Deep Wave

A 7-stream parallel deep audit (Session 29) found 475 issues across 7 layers: 44 ship-blockers (S1), 147 high (S2), 183 medium (S3), 101 polish (S4). Session 30 executed a 10-phase deep wave to address them. Every fix cites `file:line` evidence; every phase has a separate commit; sf-verify green between phases.

#### Added
- **PhoneReputation** Prisma model — proper phone-blacklist storage with HMAC blind index (was JSON blob in Setting, O(N) scan, race-prone)
- **Refund** model fields: `status`, `idempotencyKey` (@unique), `processedAt`, `reference` — enables idempotent refunds
- **Automation** model fields: `maxRetries`, `retryCount`, `retryDelayMs`, `lastError`, `nextRunAt` — enables retry loop in executor
- **`src/lib/redact-pii.ts`** — PII redaction helper for JSON snapshots (phones, addresses, names, notes) + 8 unit tests
- **`src/lib/ai/rate-limit.ts`** — in-memory token bucket (20 msgs/session/hour, 100/user/day) for AI routes
- **`ensureConversationForJid()`** helper — auto-creates Conversation row for live WhatsApp chats
- **"Sync now" button** in integrations panel — calls /api/integrations/sync with auth cookie
- **7 Darija few-shot examples** in the extraction prompt (Arabizi, Arabic script with Arabic-Indic digits, French+Darija mix, multiple items, wilaya numbers, exchange orders, number words)
- **58-wilaya enumeration + wilaya-number-to-name mapping** in extraction prompt
- **Arabic-Indic digit normalization table** in extraction prompt
- 16 i18n keys across en/fr/ar for danger-zone + appearance + sync panels
- New indexes on Order (wilaya, deliveredAt, confirmedAt) + PhoneReputation + Automation.nextRunAt

#### Changed
- **License server-side re-verification** now uses client-supplied machineId (was calling getMachineId() which returns "ssr-placeholder" server-side — AI chat was unusable in prod)
- **Refund service** now idempotent + status check + over-refund guard + delivered→returned transition + customer totalSpent reversal — all in $transaction
- **Order state machine**: 'delivered' is no longer terminal — can transition to 'returned' for post-delivery COD returns
- **productService.delete** always soft-deletes via deletedAt (was the ONLY hard-delete in the service layer)
- **COD service** idempotent (no-op if already collected/remitted) + bulk ledger only fires for actually-affected orderIds
- **Delivery create route** — order status update + ledger entry now inside same $transaction as delivery upsert
- **AI message routes** now require license + enforce rate limit
- **Gemini extraction response** now zod-validated (ExtractedOrderSchema) — hallucinated fields rejected
- **Tool results** now redacted via redactPii() before being persisted to AiChatMessage.toolCalls
- **WhatsApp sidecar** now emits REAL message-update payload with jid+id+fromMe+update (was hardcoded empty object)
- **/api/integrations/sync** accepts either auth cookie OR x-cron-secret (was requiring both)
- **/api/settings GET** now requires auth (was leaking license payload + PII)
- **All credential save/load paths** aligned on camelCase keys (was broken by camelCase/snake_case mismatch — every delivery + e-commerce adapter was non-functional in prod)
- **DHD adapter** checks "Non livré" before "Livré" (was marking failed deliveries as delivered)
- **executeSendWhatsapp** throws on send failures (was swallowing — retry loop never fired)
- **Extraction analytics dashboard** now actually receives data (recordExtractionMetric was dead code)
- **/customers stat cards** use db.customer.aggregate across ALL customers (was from first 25 on page 1)
- **/returns/[id]** filters deletedAt:null (was findUnique bypass)
- **All 6 export routes** filter deletedAt:null
- **/api/backup/restore** requires `confirm: "RESTORE"` body
- **/api/shops/[id] DELETE** requires `confirm: "DELETE"` + refuses active shop

#### Removed
- 6 dead component files (759 LOC): `form-field.tsx`, `customer-row-actions.tsx`, `ui/modal.tsx`, `ui/breadcrumb.tsx`, `ui/pagination.tsx`, `ui/toast.tsx`
- 123 occurrences of the `t(key) || "fallback"` anti-pattern across 21 files
- Dead `save()` function in LabelsControl (was PATCHing a PUT-only route)

#### Fixed
- License enforcement broken in production (getMachineId "ssr-placeholder" — AI chat was unusable)
- Every external integration broken in production (credential save/load key mismatch)
- DHD failed deliveries silently marked as delivered
- Refund double-charge on double-click
- Delivery create orphaned records on partial failure
- Inbox conversation-controls silently failing for live WhatsApp chats
- WhatsApp-style delivery receipts non-functional (hardcoded "sent")
- Extraction analytics dashboard permanently empty
- Onboarding wizard advancing with no profile / no AI key
- /customers stat cards lying (sample of 25, not aggregate)
- /returns/[id] leaking soft-deleted records via stale URLs
- AI search_orders returning nothing for phone queries (was searching AES-GCM ciphertext)
- WhatsApp automation retry never firing
- 123 instances of the t()||fallback anti-pattern masking real i18n bugs

#### Security
- `GET /api/settings` no longer leaks license payload + machine IDs + PII (added requireAuth)
- `GET /api/storefront/config` routes no longer expose inactive storefronts
- `POST /api/backup/restore` no longer single-click destructive
- `DELETE /api/shops/[id]` no longer single-click destructive + refuses active shop
- AI routes now license-gated
- Tool results no longer leak PII to the DB
- AuditLog + OrderChange JSON snapshots no longer contain plaintext PII

#### Test Stats
- **1209 tests pass | 0 skip | 0 fail** (up from 1201 — 8 new redact-pii tests)
- tsc + eslint clean
- sf-verify --fast: GREEN

#### Migration notes for the founder
1. `git pull origin main`
2. `bun install` (no new deps, but prisma generate will run)
3. `bunx prisma db push --accept-data-loss` (schema changed: +PhoneReputation, Refund +4 fields, Automation +5 fields, Order +3 indexes)
4. **Delete the old `phone_reputation_blacklist` Setting row** if it exists (the new PhoneReputation model replaces it; data doesn't auto-migrate)
5. `bun run dev:reset` (re-seed with the new schema)
6. `bun run tauri:dev` (or `bun run dev` for browser mode)
7. **Re-save your delivery + e-commerce credentials** in Settings → Integrations (the key naming changed to camelCase; old snake_case keys won't load)

---

## [4.0.0] — 2026-07-03

### The Prototype→Product Wave (Session 23)

A deep research wave + 10-phase masterplan execution that transforms SahelFlow
from a polished AI prototype into a real product with the depth to compete in
the Algerian COD market.

### Added — Foundation (Phase 0)
- `global-error.tsx` — self-contained last-resort error boundary (was missing)
- `lib/audit.ts` — entity-level audit logging with before/after snapshots
- `lib/toast.ts` — `showToast()` wrapper with consistent styling + data-testid
- `lib/env.ts` — Zod boot-validation for environment variables
- Prisma safety guards — refuses `deleteMany`/`updateMany` without a where clause
- `InfoHint` component — inline education affordance (info icon + popover)
- React `cache()` on auth session — dedupes per-request DB hits

### Added — Data Layer (Phase 1)
- SWR infrastructure — fetcher, `mutatePrefix`, `useApiMutation`
- `DataTable v2` — TanStack Table with pagination, URL-synced sort, density
  toggle, bulk selection, skeleton loading rows
- Orders page paginated (was `take:200` silent truncation)
- Optimistic bulk status updates (was `router.refresh()`)
- `SpeculationRules` hover-prerender on sidebar links

### Added — Interaction Polish (Phase 2)
- Framer Motion page transitions (fade+slide, reduced-motion-aware)
- Soft-delete + undo on 6 models (Order, Customer, Product, Delivery, Return,
  Automation) — `useUndoableDelete` hook with 6s undo toast
- Real command palette — fuzzy search actual records (orders/customers/products)
- Keyboard shortcuts — `o`/`c`/`p`/`/`/`?` + `g+letter` navigation
- Cheatsheet modal (opens on `?`)

### Added — Forms (Phase 3)
- Form primitives — `FormField`, `FormInput`, `FormTextarea` with inline
  validation + async status icons
- Phone input mask (Algerian `0X XX XX XX XX`)
- Dirty-guard (beforeunload warning on unsaved changes)
- localStorage draft persistence (restore on crash/refresh)
- Order form migrated to react-hook-form + zod

### Added — Commerce Engine (Phase 4)
- `OrderChange` ledger — append-only audit trail (Medusa pattern)
- `Refund` model — partial refunds with multiple methods
- `ReservationItem` — inventory soft-holds
- COD reconciliation fields on Order (`codCollected`, `codRemitted`,
  `codRemittanceRef`) — the killer feature for Algerian COD sellers
- Order versioning (`version` field)
- Order timeline component with action-type icons

### Added — Inbox (Phase 5)
- Conversation workflow — status (open/pending/resolved/snoozed), assignee,
  priority, labels, snooze, SLA tracking
- Message delivery receipts — WhatsApp-style (clock → check → double-check → blue)
- `CannedResponse` model + service + API — saved replies with `/short_code` trigger
- Activity messages — system events inline in the thread timeline

### Added — Automations v2 (Phase 6)
- Conditions engine — JSON-logic with 14 operators (equal, contains,
  greater_than, in, is_empty, etc.), AND/OR groups, dot notation
- Multi-step actions — JSON array of steps, runs in order
- Retry with exponential backoff (max 2 retries, 500ms/1000ms)

### Added — Analytics (Phase 7)
- Return-rate analytics by wilaya + by product (the killer COD metric)
- SKU P&L — per-product revenue, cost, margin, margin%
- Period-over-period comparison with % changes

### Added — COD Market Features (Phase 8)
- 2-hour confirmation call queue (cuts refusals 25-35%)
- Phone reputation registry (cross-store bad-phone blacklist)
- COD reconciliation API (collected vs remitted, bulk remittance)

### Added — Settings (Phase 9)
- Enhanced settings — 10-tab left-rail tree (was 6)
- Appearance panel (theme + density)
- Danger Zone panel (reset with type-RESET confirmation)
- Phone Reputation panel (CRUD for bad-phone blacklist)

### Added — States (Phase 10)
- Empty state catalog — 11 crafted empty states (illustrated + actionable)
- Full-page skeleton — mirrors loaded dashboard layout

### Changed — Visual System (Phase 11)
- Eliminated 33 arbitrary `text-[NNpx]` values → token-scale equivalents
- Added `formatDateTime` + `formatRelative` locale-aware helpers

### Changed
- Version: 3.5.1 → 4.0.0
- 1192 tests pass | 5 skip | 0 fail
- tsc + eslint clean

---

## [3.5.1] - 2026-07-03 (Session 22 redo — Phase 3+4+6 deep audit)

### Phase 3 REDO: RTL charts + typography
- **Charts:** 5 chart components got `YAxis orientation={isRtl ? "right" : "left"}` (Recharts defaults to left — YAxis was on wrong side in Arabic mode). Fixed: area, line, dual-bar, horizontal-bar, composed-trend.
- **DualBarChart:** Also fixed margin swap (was missing) + Legend `direction: rtl`.
- **Amiri font:** Was loaded via `next/font` but NEVER APPLIED. Arabic text was rendering in Inter's system fallback. Now `[dir="rtl"] { font-family: var(--font-arabic) }`.
- **Arabic line-height:** `[dir="rtl"] { line-height: 1.65 }` (was 1.5 — diacritics clipped). Headings 1.4.

### Phase 4 REDO: Responsive
- **Dashboard stat-card grid:** Was raw `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (fixed breakpoints). Now `.card-grid-4` (auto-fit `minmax` — adapts to any width).

### Phase 6 REDO: Visual polish
- **3 "configured" badges:** Fixed from `bg-emerald-600 text-white` to consistent `/10` opacity pattern with dark mode variants (`border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400`). Files: delivery-credentials-panel, import-panel, ai-key-panel.

## [3.5.0] - 2026-07-03 (Session 22 — Masterplan Phases 6-8)

### Phase 6: Visual Polish
- Loading skeletons for delivery + return detail pages
- Visual system audit: icons, buttons, animations all consistent

### Phase 7: Feature Completion
- **Automations engine (MAJOR):** Full trigger+action+log system. 5 action types
  (send_whatsapp, send_notification, tag_customer, update_status, create_order).
  Wired into order lifecycle (create + status changes) + customer blacklist.
  Template variables ({{customerName}}, {{orderNumber}}, etc.). Execution log
  on automations page. Fire-and-forget — never blocks business operations.
- **DHD credentials:** Added to delivery credentials settings panel
- **WhatsApp setup guide:** Info banner in inbox explaining 3-step connection
- **Integration status:** All panels have connection badges + setup flows

### Phase 8: Verification
- 1192 tests pass | 5 skip | 0 fail
- tsc + eslint clean
- Documentation sync

## [3.4.0] - 2026-07-03 (Session 22 — Masterplan Phases 1-5)

### Phase 1: Critical Bug Fixes
- **Blacklist (CRITICAL):** `blacklistCustomer()` now sets `isBlacklisted` column (was only tagging encrypted notes → risk engine never fired). New `BlacklistToggle` component + badge + warning banner.
- **Order workflow (CRITICAL):** Draft orders show "Mark as Pending" button (was hidden — empty labelKey). Bulk confirm auto-advances draft→pending→confirmed.
- **PIN min-length:** Client enforces 8 chars (was 4, server required 8). Fixed i18n messages.

### Phase 2: Calculation Consistency
- Dashboard shows Gross + Realized Revenue with tooltip (StatCard `tooltip` prop)
- Customer list computes real stats (was using stale cached columns)
- Removed silent 60% COGS estimate + warning banner for missing costs
- Fixed UTC date bucketing in analytics (local-time helper)
- Auto-seed WilayaRiskProfile on setup

### Phase 3: RTL
- PageHeader `text-start` + `rtl:tracking-normal`
- Global `[dir="rtl"] { letter-spacing: normal }` (Arabic cursive script)

### Phase 4: Responsive
- Tauri `minWidth` 1024→800

### Phase 5: CRUD Depth
- Delivery detail page (`/deliveries/[id]`) with status timeline
- Return detail page (`/returns/[id]`) with activity timeline

## [3.3.0] - 2026-07-02 (Session 21 — Tooling Fixes + Design System Polish + Masterplan)

### Post-merge fixes
- `dev:reset` rewritten as `scripts/dev-reset.ts` (absolute DATABASE_URL — fixes P2021 on clean wipe)
- Windows compat: uses `bun x` instead of `bunx` (bunx.cmd doesn't exist on Windows)
- Masterplan created: `documentation/MASTERPLAN_SESSION22.md` (8-phase path to flawless)

### Tooling (Phase 1)
- **sf-seed**: fixed relative-path DB bug — `prisma db push --force-reset` now uses absolute `DATABASE_URL` (was creating DB at `prisma/data/shops/` instead of `data/shops/`, causing seed P2021 crash)
- **sf-browser**: fixed false-positive ciphertext leak heuristic — now strips RSC flight payload + `<script>` blocks before counting base64 strings (was flagging /orders + /customers as "leaks" when they were just large pages)
- **sf-browser**: fixed screenshot login — uses `#pin` selector (was `input[name='pin']` which doesn't exist) + cookie-injection fallback
- **sf-verify --fast**: now fully green (excluded sf-*/sb-db tool dirs from tsc + eslint; removed unused vars)

### Design System (Phase 2)
- **Sidebar**: 9 spacing values moved to the token scale (gap, padding, font sizes, icon sizes — all arbitrary `text-[Npx]`/`py-N.5` values replaced)
- **Heading hierarchy**: stronger contrast — h1 `text-2xl sm:text-3xl`, h2 `text-xl`, h3 `text-base`, all with `text-foreground` for max contrast on dark bg
- **PageHeader**: mobile h1 now `text-xl` (was `text-2xl` on all viewports)
- **StatCard**: `text-[13px]`→`text-sm`, `size-9`→`size-8`, `py-3`→`py-4` (on-scale, less cramped)
- **Card grids**: 13 raw `grid grid-cols-*` → `.card-grid-4/3/2` (CSS minmax, auto-responsive); `stagger-grid` animation now consistent across all stat-card grids

### Per-Page Polish (Phase 3)
- Inline empty states (dashboard, customers, products): `text-lg` → `text-base` (matches shared `EmptyState`)
- Profile loading state: bare spinner → spinner + "Chargement..." label
- Settings tab active state: added left indicator bar + shadow-sm (matches sidebar pattern)
- Profile CardTitle: `text-lg` → `text-base` (matches other pages)

## [3.2.0] - 2026-07-02 (Session 20 — The "Actually Open It" Sprint, 29 commits)

### Security (P0)
- **Auth enforcement fixed** — middleware.ts was at repo root (ignored because app uses src/). Moved to src/proxy.ts. Was: entire app + all APIs wide open with AUTH_SECRET set.
- **PII ciphertext leak fixed** — delivery/return tables showed encrypted blobs instead of customer names. Added delivery + return read-interceptors to the PII extension.

### Bug Fixes (P1)
- `/orders` table empty (55 shown, 0 rendered) — displayOrders now falls back to allOrders
- `/analytics/extraction` crash — client now guards malformed API responses
- `/profile` blank — removed invalid generateMetadata from client component
- `/inbox` 0 conversations — fixed stale app-meta.json
- `/accounting` all zeros — rolling 30-day window (was current calendar month)
- `/agents` AI chat locked in dev — FeatureGate unlocks when validation valid
- Dashboard "Livré 0" vs deliveries "21" — dashboard now queries Delivery model directly
- Stray "1%" badges — StatCard ±1 direction flags no longer render as "1%"
- Backup round-trip test (was failing on pre-change code) — test now isolates app-meta.json

### Test Coverage
- **34.5% → 88.8% statements** (target was 80% — exceeded)
- 28 new test files, ~700 new tests (AI tools, agent, extraction, adapters, risk, auth, license, secrets, whatsapp, google-sheets, i18n, sentry)
- Coverage floor raised 30 → 80 (locked in)
- 1189 pass | 5 skip | 0 fail (was 457)

### Visual Polish
- **Emerald rebrand** — banned blue primary (hue 250) → emerald (hue 150) across all 37 theme references
- **Blue→teal** — 109 sky-/blue- utility refs → teal across 16 files
- **Deep responsive** — mobile 16px font, 40px touch targets, custom scrollbars, 1-col→2-col→4-col stat cards, 100dvh for Tauri WebView2
- **Arabic RTL complete** — 0 physical CSS properties outside ui/, all 43 arrows flip, tables reverse columns, charts reverse X-axis, settings tabs swap, direction inheritance fix

### Engineering
- `@sentry/nextjs` installed (was "code ready" for 19 sessions)
- `middleware.ts` → `proxy.ts` (Next 16 convention)
- Master key persistence fix (seed → keyfile sync)
- `data/app-meta.json` untracked (fixes pull conflicts)

### Agent Toolkit
- **sf-browser** (new) — browser-verification quality gate (walks 16 pages, checks auth/leaks/locks)
- **sf-seed** (new) — one-command dev environment setup
- **sf-audit** (new) — documentation drift detector

## [3.1.0] - 2026-07-01 (Session 19 — Market-Killer Engineering Sprint, 47 PRs)

### Security
- Login rate limiting (5/min + progressive lockout: 2s/8s/60s/15min)
- PBKDF2 raised from 100k to 600k iterations (OWASP 2023)
- PIN minimum raised from 4 to 8 characters
- requireAuth() defense-in-depth on all 55 mutating+GET routes (was 7)
- Session revocation via Session table (was: stateless, unrevocable)
- AuditLog for auth events (login success/fail, logout, PIN change, setup)
- setSetting rejects reserved auth_* keys (auth-takeover prevention)
- POST /api/auth/change-pin route (verifies current PIN)
- CSRF protection via sameSite=strict cookies
- Server-side license enforcement (DB-synced validation, fail-closed)
- CSV formula injection fix (sanitize =+-@\t\r prefixes)
- Upload path traversal + stored XSS fix (MIME allowlist + resolved-path check)
- Blind indexes for encrypted field search (name + phone)

### Data Integrity
- Transactional order item sync ($transaction)
- Transactional returns with stock restoration + customer stats adjustment
- Order delete pre-check for returns (clear 409, was: 500 FK error)
- ReturnNote relation with onDelete: Cascade
- Import orders status validation against enum
- withErrorHandler: SyntaxError (malformed JSON) → 400 (was: 500)
- Delivery sync nested $transaction deadlock fix
- Delivery PATCH uses orderService.updateStatus (was: bypassed state machine)

### Migrations
- Proper migration SQL for all schema changes
- Migration runner script (scripts/run-migrations.ts)
- Tauri Rust setup hook runs migrations before spawning Next.js
- Version sync: Cargo.toml + package.json + tauri.conf.json

### UX / Frontend
- Mobile drill-down for inbox + AI chat (was: 55px/87px on mobile)
- Storefront: missing i18n key fixed, localized 404, 44px touch targets, product images
- prefers-reduced-motion support (WCAG 2.3.3)
- Skip-to-content link (WCAG 2.4.1) + main id="main-content"
- RTL: 62 fixes (sidebar, charts, 24 directional icons, 12 shadcn logical props, switch, toggle, toaster, chat bubbles, Unicode arrows)
- Arabic CLDR plural support in t() (6 plural forms)
- 30+ hardcoded strings → t() × 3 locales
- a11y: keyboard nav on sortable headers, clickable rows, settings tabs, aria-labels on icon buttons
- Optimistic update fix (OrderStatusBadge error rollback)
- Storefront add-to-cart feedback
- No-blue color rule enforced (sky/emerald/cyan/teal)
- Loading state variants (ChatLoading, FormLoading — was: table skeleton everywhere)
- Onboarding wizard (4-step: business → delivery → AI key → first product)
- Window height fix (h-dvh → h-screen for WebView2)
- dir={dir} on root layout div (explicit RTL, not inheritance)
- Font consistency (font-bold → font-semibold across detail pages)
- generateMetadata for 3 pages (localized browser tab titles)
- Dark mode gaps fixed (10+ files)
- API error strings → English (was: mixed FR/EN)

### Performance
- db Proxy 2s cache (was: sync readFileSync on every Prisma call)
- SSE abort on client disconnect (was: 150s orphaned Gemini calls)
- Orders page select+dedupe (50% fewer DB calls, 200 fewer PII decryptions)
- Gemini API retry on 502/503/504
- WhatsApp reconnect bounds (MAX_RECONNECT_ATTEMPTS=20)
- @@index([customerId]) on Order model
- invalidateMetaCache on shop switch
- Shop-switch disconnects old Prisma client

### Tests
- 391 → 457 tests (+66)
- API integration test harness + 6 storefront submit tests
- 13 license validation tests (trial invariants + Ed25519 signatures)
- 5 backup round-trip tests
- 9 delivery adapter tests (Yalidine + Maystro + ZR Express)
- 2 e-commerce sync dedup tests
- CI: sf-verify + coverage enforcement + bun audit
- Playwright config + 4 golden-path e2e test files (unverified)

### Code Quality
- Dead code removed: revalidate=30, duplicate formatDate, @tanstack/react-query, react-syntax-highlighter
- server-only guards on import engine/export
- service-base.ts: console.error → logger.error
- ExtractionMetric model for AI accuracy tracking
- Rich seed data script (30 customers, 55 orders, 20 products with variants, 40 deliveries, 15 returns, 20 expenses, 10 conversations, AI sessions, extraction metrics, audit logs, wilaya risk profiles, storefront config, notifications, automations, WhatsApp templates)

### Infrastructure
- CI workflow: sf-verify + coverage + audit + migration status
- License FeatureGate component (premium feature gating)
- Server-side license enforcement (DB-synced, fail-closed)
- ExtractionMetric model (AI moat metrics)
- AuthSecret table (dedicated auth secrets, not in Setting)
- Session table (revocable sessions)
- AuditLog table (security event logging)
- Sentry integration (env-gated, zero-overhead, code ready)
- Definitive DB path fix (absolute path via process.cwd() — Prisma CLI vs Client resolution mismatch on Windows)
- CHANGELOG.md + .npmrc + .gitignore + DHD_API_BASE + .env.example
- dev:reset script (prisma db push --force-reset + seed:rich in one command)

## [3.1.0] - 2026-06-30 (Session 19 — initial release notes)

### Security
- Login rate limiting (5/min + progressive lockout: 2s/8s/60s/15min)
- PBKDF2 raised from 100k to 600k iterations (OWASP 2023)
- PIN minimum raised from 4 to 8 characters
- `requireAuth()` defense-in-depth on all 45 mutating API routes (was 7)
- Session revocation via Session table (was: stateless, unrevocable)
- AuditLog for auth events (login success/fail, logout, PIN change, setup)
- `setSetting` rejects reserved `auth_*` keys (auth-takeover prevention)
- `POST /api/auth/change-pin` route (verifies current PIN)
- CSV formula injection fix (sanitize `=+-@\t\r` prefixes)
- Upload path traversal + stored XSS fix (MIME allowlist + resolved-path check)
- XFF-spoofable rate limit fix (prefer CF-Connecting-IP)
- Storefront config API removed from public routes (was: trailing-slash bypass)
- Blind indexes for encrypted field search (name + phone)

### Data Integrity
- Transactional order item sync ($transaction)
- Transactional returns with stock restoration + customer stats adjustment
- Order delete pre-check for returns (clear 409, was: 500 FK error)
- ReturnNote relation with onDelete: Cascade (was: orphaned rows)
- Expense category sync (import route ↔ validation schema)
- Zod validation on risk/blacklist + risk/rules (was: bare `as` assertions)
- OrderSource enum fixed (added storefront + ai_chat, removed unused webstore)

### Migrations
- Proper migration SQL for all schema changes (was: db push only)
- Migration runner script (scripts/run-migrations.ts)
- Version sync: Cargo.toml + package.json + tauri.conf.json (was: Cargo stuck at 3.0.0)

### UX / Frontend
- Mobile drill-down for inbox + AI chat (was: 55px/87px thread on mobile)
- Storefront: missing i18n key fixed, localized 404, 44px touch targets
- prefers-reduced-motion support (WCAG 2.3.3)
- Skip-to-content link (WCAG 2.4.1)
- RTL: directional arrows flip, formatDZD locale-aware, dialog logical positioning
- 15 hardcoded English strings → t() calls × 3 locales
- a11y: keyboard nav on sortable headers, clickable rows, settings tabs
- Optimistic update fix (OrderStatusBadge error rollback)
- Storefront add-to-cart feedback
- No-blue color rule enforced (sky/emerald/cyan/teal)

### Performance
- db Proxy 2s cache (was: sync readFileSync on every Prisma call)
- SSE abort on client disconnect (was: 150s orphaned Gemini calls)
- Orders page select instead of include (eliminated 200 PII decryptions)
- Orders page dedupe (50% fewer DB calls on default landing)
- WhatsApp reconnect bounds (MAX_RECONNECT_ATTEMPTS=20)
- Gemini API retry on 502/503/504
- @@index([customerId]) on Order model

### Tests
- 391 → 457 tests (+66)
- API integration test harness + 6 storefront submit tests
- 13 license validation tests (trial invariants + Ed25519 signatures)
- 5 backup round-trip tests
- 9 delivery adapter tests (Yalidine + Maystro + ZR Express)
- 2 e-commerce sync dedup tests
- CI: sf-verify + coverage enforcement + bun audit

### Code Quality
- Dead code removed: revalidate=30, duplicate formatDate, @tanstack/react-query, react-syntax-highlighter config
- server-only guards on import engine/export
- service-base.ts: console.error → logger.error
- ExtractionMetric model for AI accuracy tracking

### Infrastructure
- CI workflow: sf-verify + coverage + audit + migration status
- License FeatureGate component (premium feature gating)
- ExtractionMetric model (AI moat metrics)
- AuthSecret table (dedicated auth secrets, not in Setting)
- Session table (revocable sessions)
- AuditLog table (security event logging)

## [3.0.0] - 2026-06-22 (Sessions 1-18)

Initial v3.0 greenfield build. See `documentation/BUILD_LOG.md` for session-by-session history.
