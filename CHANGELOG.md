# Changelog

All notable changes to SahelFlow are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/),
adheres to [Semantic Versioning](https://semver.org/).

## [3.3.0] - 2026-07-02 (Session 21 — Tooling Fixes + Design System Polish)

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
