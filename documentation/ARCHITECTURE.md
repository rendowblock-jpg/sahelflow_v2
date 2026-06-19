# SahelFlow v2 — Architecture

> Single source of truth for tech stack, project structure, conventions, API routes, and database schema.
> For product philosophy and business model, see [`VISION.md`](./VISION.md).
> For environment setup and deployment, see [`SETUP.md`](./SETUP.md).
> For competitive analysis, see [`COMPETITOR_RESEARCH.md`](./COMPETITOR_RESEARCH.md).

---

## 1. What Is SahelFlow?

SahelFlow is a **dashboard-only** Next.js application for Algerian e-commerce sellers operating on Cash-on-Delivery (COD). There is no built-in storefront. Sellers connect external stores (Shopify, WooCommerce, YouCan) via integrations and manage orders, customers, products, and delivery through a unified AI-powered dashboard.

**Deployment strategy:** GitHub repo (`rendowblock-jpg/sahelflow_v2`) is the source of truth. Each client gets their **own** Vercel project + Supabase project (per-client isolation, design system §2.2). Deployments via `vercel --prod --yes`. Auto-deploy from GitHub is planned (§7.2).

---

## 2. Tech Stack

| Layer          | Technology                                        | Notes                                                                                          |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Framework**  | Next.js 16 (App Router, Turbopack)                | React 19, TypeScript 5 strict                                                                  |
| **Database**   | Supabase (PostgreSQL + Auth + Realtime + Storage) | RLS policies per-seller, SECURITY DEFINER RPCs for atomic operations                           |
| **Styling**    | Vanilla CSS (`sf-` prefix)                        | **No Tailwind.** Reorganized split CSS architecture under `src/app/styles/`                    |
| **Charts**     | Recharts                                          | 6 chart components, RTL-aware axes, `prefers-reduced-motion` support                           |
| **Animation**  | Framer Motion                                     | PageTransition, StaggerContainer, StaggerItem, FadeIn, SlideIn, AnimatedCard, AnimatedStatCard |
| **AI**         | Groq API (multi-model router)                     | 5 specialized models with per-model API keys, 30 active tools, and fallback chains             |
| **Messaging**  | Evolution API (self-hosted WhatsApp)              | Per-client Railway deployment; QR-code connection                                              |
| **Delivery**   | Yalidine (live), Maystro + ZR Express (stubs)     | Adapter registry pattern; only Yalidine is fully implemented; Maystro + ZR Express return 'coming soon'                     |
| **Validation** | Zod                                               | All public API routes validated                                                                |
| **Testing**    | Vitest + Playwright                               | **604 unit tests** across **37 test files** + 9 Playwright e2e specs                           |
| **i18n**       | Custom TypeScript-inferred system                 | 3 locales: `en`, `fr`, `ar` (RTL supported). Arabic is default.                                |
| **Hosting**    | Vercel                                            | Per-client project, deployed via `vercel --prod --yes`                                         |

---

## 3. Project Structure

```
sahelflow/
├── src/
│   ├── app/
│   │   ├── (auth)/              # Login, Register (i18n complete, Arabic default)
│   │   ├── (dashboard)/         # PRIVATE seller dashboard
│   │   │   └── dashboard/
│   │   │       ├── page.tsx         # Home (stats, activity, cash flow)
│   │   │       ├── orders/          # Order management + confirmation workflow
│   │   │       ├── products/        # Catalog + variants + categories + import
│   │   │       ├── customers/       # Customer list + risk scores
│   │   │       ├── inbox/           # WhatsApp split-pane inbox (real-time)
│   │   │       ├── analytics/       # Charts & stats (server-side RPC)
│   │   │       ├── accounting/      # [NEW] P&L overview, expenses, variant costs
│   │   │       ├── returns/         # [NEW] Return status logs and exchange flows
│   │   │       ├── delivery/        # Tracking + multi-provider shipment
│   │   │       ├── shipping/        # Wilaya-based shipping rates
│   │   │       ├── automations/     # Recipe-based automation engine
│   │   │       ├── agents/          # AI agent configuration UI
│   │   │       ├── settings/        # Profile, channels, templates, integrations (including Team tab)
│   │   │       └── integrations/    # Shopify/WooCommerce/YouCan webhook setup
│   │   ├── api/                 # API routes (see §4)
│   │   ├── form/                # Embeddable public order form (per-seller slug)
│   │   ├── styles/              # [NEW] Split CSS architecture (layout, base, accounting, returns, etc.)
│   │   ├── globals.css          # Core CSS loader
│   │   ├── tokens.css           # Global design system color/spacing tokens
│   │   └── inbox.css            # Split-pane inbox styles
│   ├── components/
│   │   ├── dashboard/           # Sidebar, TopBar, AIAssistant, ToastProvider, NotificationCenter
│   │   ├── orders/              # AIOrderImport
│   │   ├── products/            # ImportModal, ColumnMapper, ImportPreview
│   │   └── ui/                  # ErrorBoundary, EmptyState, Toast, Skeleton, charts, motion
│   └── lib/
│       ├── agents/              # Orchestrator + Order/Communication agents
│       ├── ai/                  # AI engine (30 tools), tool-handlers, upsell, extraction
│       ├── automation/          # Recipe runner + definitions
│       ├── channels/            # Evolution API client + template interpolation
│       ├── data/                # Supabase CRUD services (decomposed modules)
│       ├── delivery/            # Delivery adapters (Yalidine, Maystro, ZR Express)
│       ├── i18n/                # i18n context + locale files (en, fr, ar)
│       ├── import/              # CSV/XLSX parsers, column mapping engine
│       ├── integrations/        # Integration CRUD service
│       ├── rate-limit.ts        # Simple in-memory rate limiting
│       ├── webhook-verify.ts    # Shopify + WooCommerce + YouCan HMAC verification
│       ├── validation.ts        # Zod schemas
│       └── supabase/            # Client/Server/Middleware db instances
├── supabase/
│   ├── migrations/
│   │   ├── 000_baseline.sql     # Comprehensive schema
│   │   ├── 001_fix_dashboard_and_notifications.sql
│   │   ├── 002_security_and_schema_cleanup.sql
│   │   ├── 003_select_rls_and_cleanup.sql
│   │   ├── 004_delivery_status_constraint_and_webhook_dedup.sql
│   │   ├── 005_import_history.sql
│   │   ├── 006_audit_fixes.sql
│   │   ├── 006_rls_insert_hardening.sql
│   │   ├── 007_ai_chat_persistence.sql
│   │   ├── 007_rebuild_analytics_with_soft_delete.sql
│   │   ├── 008_after_sales_returns.sql
│   │   ├── 009_accounting.sql
│   │   ├── 010_team_access.sql
│   │   ├── 011_daily_reports.sql
│   │   ├── 012_security_lockdown.sql
│   │   ├── 013_data_integrity.sql
│   │   ├── 014_types_alignment.sql
│   │   ├── 020_soft_delete.sql
│   │   ├── 021_performance_indexes.sql
│   │   ├── 022_seller_locale.sql
│   │   ├── 023_audit_security_grants.sql
│   │   ├── 024_schema_cleanup.sql
│   │   ├── archive/             # Historical migrations 001–029
│   │   └── seeds/
│   │       └── whatsapp_templates.sql
│   └── functions/               # Edge functions (if any)
├── docs/
│   ├── ALGERIAN_ECOMMERCE_BIBLE.md
│   ├── CLIENT_ONBOARDING.md
│   ├── INTEGRATION_SETUP_SHOPIFY.md
│   ├── INTEGRATION_SETUP_WOOCOMMERCE.md
│   ├── INTEGRATION_SETUP_YOUCAN.md
│   └── history/                 # Archived documentation
├── public/                      # Static assets
└── scripts/                     # Build-time audit scripts
```

---

## 4. API Routes

```
api/
├── accounting/
│   ├── pnl/               # [NEW] GET P&L overview stats (revenue, profit, marketing, delivery costs)
│   └── products/          # [NEW] GET product profitability stats (unit margins, variants)
├── agents/
│   ├── config/            # GET/POST agent configuration
│   ├── health/            # GET model health status
│   └── process-order/     # POST trigger order agent manually
├── ai/
│   ├── chat/              # POST AI assistant chat (streaming via SSE)
│   ├── extract/           # POST extract order from WhatsApp text
│   └── sessions/          # [NEW] GET/POST chat sessions
│       └── [id]/          # [NEW] GET/PATCH/DELETE session, POST message to /messages
├── analytics/             # GET analytics data (service_role RPC proxy)
├── channels/
│   └── connect/           # POST WhatsApp QR code / status
├── cron/
│   └── daily-report/      # [NEW] GET cron endpoint to trigger and distribute daily WhatsApp metrics
├── dashboard/
│   └── stats/             # GET dashboard aggregates (service_role RPC proxy)
├── delivery/
│   ├── create-shipment/   # POST create shipment (multi-provider)
│   ├── estimate-cost/     # POST estimate delivery cost
│   └── sync-tracking/     # GET cron endpoint for tracking sync
├── expenses/              # [NEW] GET/POST expense list
│   └── [id]/              # [NEW] GET/PATCH/DELETE expense detail
├── form/
│   └── submit/            # POST public order form submission (rate limited)
├── inbox/
│   ├── ai-suggest/        # POST AI reply suggestions
│   └── send/              # POST send WhatsApp message
├── integrations/
│   └── sync/              # POST Shopify/WooCommerce/YouCan catalog sync
├── notifications/         # GET / PATCH / DELETE — persistent notifications
├── products/
│   └── import/            # POST product import (CSV / XLSX / Google Sheets)
├── returns/               # [NEW] GET/POST return orders list
│   └── [id]/              # [NEW] GET/PATCH/DELETE return status, POST notes to /notes
├── team/                  # [NEW] GET members list, POST invite member
│   └── [id]/              # [NEW] PATCH update member role/status, DELETE remove member
├── templates/             # WhatsApp template CRUD
├── upsell/                # Upsell suggestion engine
├── health/                # GET health check (fail-closed)
└── webhooks/
    ├── evolution/         # POST incoming WhatsApp webhook
    ├── internal/          # POST internal agent dispatch
    ├── store/[token]/     # POST external store webhooks (Shopify/WooCommerce/YouCan)
    ├── retry/             # POST cron-protected retry processor
    └── dead-letters/      # GET protected dead-letter queue viewer
```

---

## 5. Database Schema

**Baseline migration:** `supabase/migrations/000_baseline.sql`  
**Patch migrations:**

- `001_fix_dashboard_and_notifications.sql` — Patched aggregates + notifications
- `002_security_and_schema_cleanup.sql` — `deleted_at` columns, provider check, RLS initplan fix, SECURITY DEFINER RPC lockdown
- `003_select_rls_and_cleanup.sql` — SELECT RLS policies for products/categories
- `004_delivery_status_constraint_and_webhook_dedup.sql` — Fixed `deliveries.status` CHECK + `webhook_events` dedup table
- `005_import_history.sql` — Import batches and history tracking
- `006_audit_fixes.sql` — DB schema fixes & alignment (2026-05-12 audit)
- `006_rls_insert_hardening.sql` — Harden insert RLS policies for sellers and customers
- `007_ai_chat_persistence.sql` — Persistent sessions & messages tables for AI assistant
- `007_rebuild_analytics_with_soft_delete.sql` — Rebuild statistics to support soft deleted models
- `008_after_sales_returns.sql` — After-sales returns tracking schema and triggers
- `009_accounting.sql` — Ledger tables: expenses, returns, variant cost mappings
- `010_team_access.sql` — Team member management table, roles and updated team-aware RLS
- `011_daily_reports.sql` — Daily analytics reports tables for cron metrics
- `012_security_lockdown.sql` — Security hardening, dropping auth.email(), restricting functions
- `013_data_integrity.sql` — Data integrity constraints, checks, and cleanup
- `014_types_alignment.sql` — Types alignment fixes (e.g. ReturnReason enum mapping)
- `020_soft_delete.sql` — Soft delete triggers and restore support
- `021_performance_indexes.sql` — Composite indexes, FK indexes, wilaya_risk_profiles table
- `022_seller_locale.sql` — default_locale column added to sellers
- `023_audit_security_grants.sql` — Revoke over-broad EXECUTE grants (PUBLIC/anon/authenticated)
- `024_schema_cleanup.sql` — Fix default_locale default, drop duplicate slug constraint, fix cost_price default, drop legacy columns

All tables use **RLS** scoped via the helper function `public.check_user_seller_access(seller_id)` to support team members.

| Table                      | Key Columns & Notes                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `sellers`                  | Extends `auth.users`. Profile, settings, webhook config, shipping rates, notification settings, onboarding flags. Default locale: `ar` |
| `team_members`             | [NEW] Multi-user invitations, roles (owner, admin, confirmer, packer, viewer), and active status                                            |
| `channels`                 | WhatsApp instances (Evolution API). `active`, `credentials` JSONB                                                                           |
| `customers`                | Risk scores, order history, `deleted_at` (soft delete)                                                                                      |
| `conversations`            | Chat threads. `is_pinned`, `is_archived`, `labels[]`, `unread_count`, `status`                                                              |
| `messages`                 | `direction` (inbound/outbound), `content_type` (text/image/audio/video/file), `reply_to_id`                                                 |
| `products`                 | Variants, categories, images, stock. `deleted_at` (soft delete)                                                                             |
| `categories`               | Seller-scoped product categories                                                                                                            |
| `orders`                   | Full lifecycle: draft → pending → confirmed → shipped → delivered/returned. `confirmation_status`, `deleted_at` (soft delete)               |
| `deliveries`               | Shipment tracking per provider (tracking_number, status, provider)                                                                          |
| `automations`              | Recipe triggers + actions. `trigger_config` JSONB for customizable parameters                                                               |
| `agent_activity`           | AI action log for activity feed                                                                                                             |
| `whatsapp_templates`       | Reusable message templates with `{{variable}}` interpolation                                                                                |
| `integrations`             | External platform credentials (Shopify, WooCommerce, YouCan, Yalidine, etc.)                                                                |
| `webhook_retry_queue`      | Idempotent retry queue for failed dispatches (`idempotency_key` unique)                                                                     |
| `notifications`            | Persistent notifications: type, title, message, link, read, dismissed, metadata JSONB. Indexed for fast unread queries                      |
| `webhook_events`           | Deduplication for store webhooks — tracks Shopify `X-Shopify-Event-Id`, WooCommerce `X-WC-Webhook-Delivery-ID`, YouCan event IDs per seller |
| `import_batches`           | Import history: source, file_name, row_count, success_count, error_log, status                                                              |
| `expenses`                 | [NEW] Accounting expense ledger: amount, category, date, description, and marketing cost linkages                                           |
| `returns`                  | [NEW] Returns tracker: status, reason, refund amount, stock adjustment flags, and notes                                                     |
| `return_notes`             | [NEW] Timeline notes/comments for return lifecycle events                                                                                   |
| `ai_chat_sessions`         | [NEW] Persisted sessions for AI Copilot chat dashboard interface                                                                            |
| `ai_chat_messages`         | [NEW] Persisted chat messages for Copilot history timeline                                                                                  |
| `daily_analytics_reports`  | [NEW] Daily snapshot of orders, delivery performance, revenue, and top products                                                             |

### Custom Functions (RPC)

| Function                       | Purpose                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `atomic_create_order`          | Customer upsert + stock verification + order insertion in one transaction                                                    |
| `atomic_update_order_status`   | Status transition with validation + stock restoration on cancel/return                                                       |
| `get_dashboard_aggregates`     | Server-side stats: totalOrders, totalRevenue, totalProfit, deliveryRate, returnRate, COD breakdown, products/customers/stock |
| `get_analytics_data(TEXT)`     | Key metrics, statusDistribution, wilayaBreakdown, revenueByDay, topProducts for analytics page                               |
| `computeDynamicWilayaProfiles` | Computes per-wilaya risk profiles from seller's actual delivery data (60% seller + 40% static blend)                         |
| `handle_new_user`              | Trigger function to seed default recipes when a new user signs up                                                            |
| `ensure_recipes_exist`         | Seeds default automation recipes for new sellers                                                                             |

---

## 6. Key Design Patterns

### 6.1 One Deployment Per Client

The database schema supports multiple sellers via `seller_id`, but each production deployment expects **only one row** in `sellers`. This provides maximum data isolation without multi-tenant complexity. Each client gets their own Vercel + Supabase project, deployed via `vercel --prod --yes`. Auto-deploy from GitHub is a planned automation item (design system §7.2).

### 6.2 Dashboard-Only (No Storefront)

Sellers manage external stores through integrations. `/api/webhooks/store/[token]` ingests orders from these stores. The embeddable public order form (`/form/[sellerSlug]`) provides a lightweight direct-ordering channel without a full storefront.

### 6.3 Agentic Engine (Orchestrator Pattern)

- `order.created` → Order Agent (risk analysis, auto-confirm if safe)
- `message.received` → Communication Agent (intent classification, extraction, reply suggestion)
- Both route through `src/lib/agents/orchestrator.ts` with retry queue fallback

### 6.4 Draft-Only AI

The AI never auto-sends messages to customers. It generates JSON suggestions which the seller approves in the Inbox UI. This is a trust mechanism, not just a safety measure.

### 6.5 Multi-Model AI Router with Per-Model Keys

The AI engine uses 5 specialized Groq models with rule-based routing. **Each model has its own API key** for rate-limit isolation. If one key hits limits, the others keep working.

| Model ID                                    | Groq API Key Env Var  | Role                                        | Fallback       |
| ------------------------------------------- | --------------------- | ------------------------------------------- | -------------- |
| `llama-3.1-8b-instant`                      | `GROQ_API_KEY_FLASH`  | Fast extraction, quick replies              | Struct → Brain |
| `meta-llama/llama-4-scout-17b-16e-instruct` | `GROQ_API_KEY_BRAIN`  | Primary agent — tools, chat, business logic | Struct         |
| `openai/gpt-oss-120b`                       | `GROQ_API_KEY_DEEP`   | Complex reasoning, risk analysis (no tools) | Brain          |
| `qwen/qwen3-32b`                            | `GROQ_API_KEY_STRUCT` | Structured JSON output, data validation     | Brain          |
| `llama-3.3-70b-versatile`                   | `GROQ_API_KEY_CRAFT`  | Creative writing, marketing copy            | Brain          |

Unconfigured keys fall back to `GROQ_API_KEY` (the general fallback).

Health monitoring tracks 429/5xx per model. Unhealthy models auto-recover after 60s.

### 6.6 Language Policy

- **AI Understanding**: Accepts Darija, Franco-Arab, French, Arabic, English input from customers
- **System Display**: **NEVER displays Darija**. All UI output is in the user's selected locale
- **Default**: Arabic (فصحة) is the default locale for new users. RTL is auto-applied.
- **Notifications**: Pure Arabic (فصحة) — never Algerian dialect

### 6.7 Soft Delete

Orders, products, and customers use `deleted_at` timestamp soft delete with partial indexes. Deleted records are excluded from all queries via `.is("deleted_at", null)`. Restore capability is available via `restoreOrder()`, `restoreProduct()`, `restoreCustomer()`.

### 6.8 Rate Limiting

Simple in-memory rate limiting via `src/lib/rate-limit.ts`. Uses `Map<string, count>`. Resets on cold starts, which is acceptable for Algerian COD single-seller scale. No external KV dependency.

### 6.9 Confirmation Workflow

`confirmation_status` is a separate column from `status`. It tracks call-attempt outcomes (rappel, faux_numero, boite_vocale, etc.) within the pending phase without breaking OrderStatus state machines.

### 6.10 Delivery Adapters

Registry pattern with `getAllDeliveryAdapters()`. Each adapter implements `createShipment()`, `getTracking()`, `cancelShipment()`, `getDeliveryCost()`. **Only Yalidine is fully implemented** — Maystro and ZR Express adapters exist but return 'coming soon' stubs. See [AUDIT_FINDINGS.md](./AUDIT_FINDINGS.md) §1 for details on fake/stub features.

### 6.11 Notification System

`NotificationCenter.tsx` fetches from `/api/notifications`. Notifications are generated from live data (orders/products) and stored persistently in the `notifications` table. Actions (dismiss, read) persist across sessions.

### 6.12 Import Engine

Multi-source product import supporting CSV, XLSX, and Google Sheets. Visual column mapping UI (`ColumnMapper.tsx`) allows sellers to map spreadsheet columns to product fields. Preview stage (`ImportPreview.tsx`) shows parsed data before commit. Import history tracked in `import_batches` table.

### 6.13 Design System (Phase 6–7)

- **Charts**: Recharts integration with 6 components (LineChart, BarChart, PieChart, AreaChart, RadarChart, ComposedChart). RTL-aware axes. `prefers-reduced-motion` disables entrance animations.
- **Motion**: Framer Motion primitives:
  - `PageTransition` — route-level entrance animation (applied to all 15 dashboard pages)
  - `StaggerContainer` / `StaggerItem` — staggered list entrances
  - `FadeIn` / `SlideIn` — directional fades
  - `AnimatedCard` — hover-lift card animation
  - `AnimatedStatCard` — count-up numeric animation with icon

---

## 7. Security Model

| Layer          | Implementation                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**       | Supabase Auth (email/password) with PKCE flow                                                                                                                                         |
| **RLS**        | All tables scoped to `seller_id = auth.uid()`                                                                                                                                         |
| **RPCs**       | SECURITY DEFINER functions restricted to `service_role` only (revoked from `authenticated`). Frontend calls `/api/dashboard/stats` and `/api/analytics` which use service_role client |
| **Webhooks**   | HMAC-SHA256 verification (Shopify), HMAC-SHA256 hex (WooCommerce), timing-safe secret comparison (Evolution/internal/YouCan). Store webhooks use `atomic_create_order` RPC            |
| **Rate Limit** | Per-token (store), per-instance (evolution), per-IP (internal/public form). In-memory.                                                                                                |
| **Secrets**    | Fail-closed: missing env vars return 401/503, never skip verification                                                                                                                 |
| **Headers**    | CSP + HSTS + Permissions-Policy + X-Frame-Options + X-Content-Type-Options + Referrer-Policy                                                                                          |
| **CSP**        | `connect-src` restricted to explicit allowlist (Supabase, Groq, Evolution API) with dynamic hostname injection from env vars                                                          |

---

## 8. Critical Code Conventions

> **These rules are non-negotiable.**

| Rule         | Details                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **CSS**      | Vanilla CSS only. `sf-` prefix. **Never Tailwind.**                                                   |
| **i18n**     | Every user-facing string in ALL THREE locales (`en.ts`, `fr.ts`, `ar.ts`). Build fails if missing.    |
| **Defaults** | Arabic (RTL) is the default locale. English display only when explicitly selected.                    |
| **Darija**   | AI **understands** Darija/Franco-Arab input but **never displays it**. System output is pure فصحة.    |
| **Toast**    | Use `useToast()` for user feedback. Never `alert()` or `console.error` in user paths.                 |
| **LLM**      | ALL calls through `src/lib/agents/groq.ts`. Never import `openai` package.                            |
| **Supabase** | Client components: lazy `getSupabase()` getter. API routes: service role client.                      |
| **Icons**    | Only `lucide-react`.                                                                                  |
| **Types**    | `npx tsc --noEmit` must pass with zero errors. No `any` in production code.                           |
| **Tests**    | `npx vitest run` must pass. Test files exempt from `no-explicit-any` per ESLint config.               |
| **Mobile**   | All interactive elements ≥44px touch target. Tables wrap in `sf-table-wrap`. Grids collapse at 380px. |

### Mobile CSS Utilities

| Class                                  | Purpose                                  |
| -------------------------------------- | ---------------------------------------- |
| `.sf-touch-target`                     | min-height: 44px; min-width: 44px        |
| `.sf-table-wrap` / `.sf-table-scroll`  | Horizontal scroll with momentum          |
| `.sf-hide-mobile` / `.sf-hide-desktop` | Conditional display by breakpoint        |
| `.sf-mobile-stack`                     | Forces flex-direction: column            |
| `.sf-mobile-full`                      | Forces width: 100%                       |
| `.sf-mobile-card-list`                 | Card stack layout for table alternatives |

Grid collapse behavior:

- `< 1024px`: Sidebar hides, main content full width
- `< 767px`: 4/3-column grids → 2 columns, modals become bottom sheets, AI panel becomes sheet
- `< 380px`: 2-column grids → 1 column, page padding reduces to 12px, font sizes shrink

---

## 9. Environment Variables Reference

See [`SETUP.md`](./SETUP.md) for full descriptions and `.env.local` template.

**Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `GROQ_API_KEY`

**Per-model AI (recommended):** `GROQ_API_KEY_FLASH`, `GROQ_API_KEY_BRAIN`, `GROQ_API_KEY_DEEP`, `GROQ_API_KEY_STRUCT`, `GROQ_API_KEY_CRAFT`

**For WhatsApp:** `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`

**For Shopify:** `SHOPIFY_WEBHOOK_SECRET`

**For WooCommerce:** `WOOCOMMERCE_STORE_URL`, `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET`

**For YouCan:** `YOUCAN_API_KEY`, `YOUCAN_WEBHOOK_SECRET`

**Security (recommended):** `EVOLUTION_WEBHOOK_SECRET`, `INTERNAL_WEBHOOK_SECRET`, `CRON_SECRET`, `HEALTH_SECRET`, `ADMIN_SECRET`

---

## 10. Key Files Quick Reference

| File                                              | Purpose                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `src/lib/agents/groq.ts`                          | LLM API wrapper. Only file that calls Groq.                        |
| `src/lib/ai/agent.ts`                             | AI chat engine with 30 specialized tools.                          |
| `src/lib/ai/tool-handlers.ts`                     | AI tool delegation layer (dependency-injected Supabase).           |
| `src/lib/ai/models/router.ts`                     | Multi-model selection logic.                                       |
| `src/lib/ai/models/executor.ts`                   | Executes model calls with per-model API keys.                      |
| `src/lib/ai/models/health.ts`                     | Tracks model health (429/5xx) and auto-recovery.                   |
| `src/lib/automation/executor.ts`                  | Automation recipe runner.                                          |
| `src/lib/channels/evolution-api.ts`               | Evolution API client for WhatsApp.                                 |
| `src/lib/delivery/adapters.ts`                    | Delivery adapter registry (Yalidine, Maystro, ZR Express).         |
| `src/lib/import/engine.ts`                        | Multi-source import engine (CSV/XLSX/Sheets).                      |
| `src/lib/data/order-service.ts`                   | Order CRUD + soft delete + restore.                                |
| `src/lib/data/product-service.ts`                 | Product CRUD + soft delete + restore.                              |
| `src/lib/data/customer-service.ts`                | Customer CRUD + soft delete + restore.                             |
| `src/lib/data/expense-service.ts`                 | [NEW] Expense management, marketing linkages, and custom profit.  |
| `src/lib/data/team-service.ts`                    | [NEW] Team member lists, role management, and invitation flows.    |
| `src/lib/data/chat-service.ts`                    | [NEW] Server-side AI Copilot chat sessions and messages ledger.     |
| `src/lib/data/notification-service.ts`            | Persistent notification CRUD.                                      |
| `src/lib/rate-limit.ts`                           | In-memory rate limiting (simple, 0 dependencies).                  |
| `src/lib/webhook-verify.ts`                       | Shopify + WooCommerce + YouCan HMAC verification.                  |
| `src/components/dashboard/NotificationCenter.tsx` | Fetches from `/api/notifications`, persists actions.               |
| `src/app/api/webhooks/evolution/route.ts`         | Incoming WhatsApp webhook (structured logging).                    |
| `src/app/api/webhooks/store/[token]/route.ts`     | External store webhooks (Shopify/WooCommerce/YouCan HMAC).         |
| `src/app/api/webhooks/internal/route.ts`          | Internal agent dispatch (rate limited, timing-safe).               |
| `src/app/api/integrations/sync/route.ts`          | Shopify + WooCommerce + YouCan catalog sync.                       |
| `src/app/api/notifications/route.ts`              | GET/PATCH/DELETE persistent notifications.                         |
| `src/app/api/dashboard/stats/route.ts`            | Service_role proxy for `get_dashboard_aggregates` RPC.             |
| `src/app/api/analytics/route.ts`                  | Service_role proxy for `get_analytics_data` RPC.                   |
| `src/app/api/form/submit/route.ts`                | Public order form submission (rate limited, Zod validated).        |
| `src/app/api/cron/daily-report/route.ts`          | [NEW] Scheduled aggregation route for daily WhatsApp metrics.      |
| `next.config.ts`                                  | Next.js config + CSP security headers + HSTS + Permissions-Policy. |
| `src/app/globals.css`                             | Loader for design tokens (`tokens.css`) and split layout CSS.      |
| `supabase/migrations/000_baseline.sql`            | Comprehensive schema migration.                                    |

---

_Last updated: 2026-06-19 — Test counts, deployment strategy, and delivery adapter claims corrected. See [AUDIT_FINDINGS.md](./AUDIT_FINDINGS.md) for the full audit._
