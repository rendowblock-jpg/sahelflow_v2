# 🏗️ SahelFlow v2 — Flawless Execution Masterplan

> **Source**: 4 exhaustive audit reports (99 findings) cross-validated against actual codebase
> **Goal**: Make SahelFlow production-flawless — zero security holes, zero data leaks, zero logic bugs, consistent types, hardened operations
> **Principle**: Each phase leaves the codebase in a **working, deployable** state. No phase breaks what the previous phase fixed.

---

## Phase Dependency Graph

```
Phase 1 (Security Lockdown)     ──→  Phase 2 (Data Integrity)
     ↓                                      ↓
Phase 3 (Logic Fixes)          ──→  Phase 4 (Type & DB Alignment)
     ↓                                      ↓
Phase 5 (Performance & Scale)  ──→  Phase 6 (UX & i18n Polish)
     ↓
Phase 7 (Testing & Hardening)
```

---

## PHASE 1 — 🔐 Security Lockdown (17 findings)

> **Goal**: Eliminate ALL cross-seller data leakage, unauthorized access, and privilege escalation vectors
> **Exit criteria**: Zero unauthenticated endpoints, zero missing seller_id filters, zero service-role on public routes

### 1.1 Revoke SECURITY DEFINER access from `authenticated` role (F-1)

- **What**: 6 functions (`atomic_update_order_status`, `check_user_seller_access`, `get_analytics_data`, `get_dashboard_aggregates`, `get_pnl_summary`, `get_product_profitability`) are executable by any authenticated user
- **Fix**: Migration to revoke EXECUTE from `authenticated`/`anon`, grant only to `service_role`
- **File**: `supabase/migrations/012_security_definer_lockdown.sql`

### 1.2 Set search_path on all functions (F-2)

- **What**: 4 functions have mutable search_path → injection risk
- **Fix**: Add `SET search_path = ''` to `increment_session_message_count`, `update_updated_at`, `generate_return_number`, `log_return_status_change`
- **File**: Same migration as 1.1

### 1.3 Fix RLS correlated subquery bug in `team_members_manage` (F-4)

- **What**: `team_members_1.seller_id = team_members_1.seller_id` is always true → any admin on any seller can manage ALL team members
- **Fix**: Change to `team_members_1.seller_id = team_members.seller_id` (correlated reference)
- **File**: Migration `012_security_definer_lockdown.sql`

### 1.4 Consolidate overlapping RLS policies (F-4)

- **What**: `agent_activity`, `ai_chat_messages`, `ai_chat_sessions`, `team_members` have overlapping permissive policies (OR'd = performance + logic gaps)
- **Fix**: Merge each pair into a single policy using `(auth.uid() = seller_id OR EXISTS (...team_members...))`
- **File**: Same migration

### 1.5 Replace `auth.uid()` with `(SELECT auth.uid())` in RLS policies (F-7)

- **What**: 3 tables cause per-row InitPlan re-evaluation
- **Fix**: Wrap in subselect for caching
- **File**: Same migration

### 1.6 AI session routes — add auth + seller_id filtering (F-68, F-69)

- **What**: `GET/POST/PATCH/DELETE` on `/api/ai/sessions` and `/api/ai/sessions/[id]` have NO auth, NO seller_id check
- **Fix**: Wrap with `withAuthAndRateLimit`, pass sellerId to all chat-service calls, add `.eq("seller_id", sellerId)` to all queries
- **Files**: `src/app/api/ai/sessions/route.ts`, `src/app/api/ai/sessions/[id]/route.ts`, `src/lib/data/chat-service.ts`

### 1.7 Service-layer missing seller_id checks (F-71, F-72, F-81, F-108)

- **What**: `deleteExpense`, `updateExpense`, `getExpense`, `deleteCategory`, `updateCategory` have no `.eq("seller_id", sellerId)`
- **Fix**: Add `getActiveSellerId()` calls + seller_id filters to all mutation/get-by-id operations
- **Files**: `src/lib/data/expense-service.ts`, `src/lib/data/product-service.ts`
- **Also**: `deleteDelivery`, `deleteAutomation`, `deleteWhatsAppTemplate`, `deleteNotification` — same pattern

### 1.8 Executor `block_customer` missing seller_id filter (F-43)

- **What**: `customers.update({is_blocked: true}).eq("id", data.customer_id)` — no seller_id, service-role bypasses RLS
- **Fix**: Add `.eq("seller_id", event.sellerId)`
- **File**: `src/lib/automation/executor.ts`

### 1.9 Public form routes using service-role client (F-75)

- **What**: `form/seller-info` and `form/submit` create admin client unnecessarily
- **Fix**: Use anon/public client with proper RLS policies for read-only seller-info; form/submit can use a restricted function
- **Files**: `src/app/api/form/seller-info/route.ts`, `src/app/api/form/submit/route.ts`

### 1.10 Sync-tracking cross-seller credential leak (F-77)

- **What**: Fetches first active integration per provider across ALL sellers
- **Fix**: Add `.eq("seller_id", delivery.seller_id)` to the integration lookup
- **File**: `src/app/api/delivery/sync-tracking/route.ts`

### 1.11 Accounting trend route — no seller_id filter (F-78)

- **What**: ALL 4 parallel queries aggregate across ALL sellers
- **Fix**: Add `.eq("seller_id", sellerId)` to every query (sellerId from withAuthAndRateLimit)
- **File**: `src/app/api/accounting/trend/route.ts`

### 1.12 Dashboard/analytics RPC — pass seller_id explicitly (F-87, F-88)

- **What**: `get_dashboard_aggregates` and `get_analytics_data` are SECURITY DEFINER but receive no `p_seller_id` parameter
- **Fix**: Add `p_seller_id UUID` parameter to both functions, validate `p_seller_id = auth.uid() OR service_role`, use it instead of `v_seller_id := auth.uid()`. Update API routes to pass sellerId.
- **Files**: Migration SQL + `src/app/api/dashboard/stats/route.ts` + `src/app/api/analytics/route.ts`

### 1.13 Orders page realtime — add seller_id filter (F-115, F-116)

- **What**: `loadStats()` fetches ALL orders; realtime subscription fires on ANY order change
- **Fix**: Add `.eq("seller_id", sellerId)` to loadStats; add `filter: "seller_id=eq.{sellerId}"` to realtime channel
- **File**: `src/app/(dashboard)/dashboard/orders/page.tsx`

### 1.14 AI agent uses admin client for ALL tools (F-114)

- **What**: `getSupabase()` in agent.ts returns `createAdminClient()`, bypassing ALL RLS
- **Fix**: For read tools, use authenticated client; keep admin only for mutations that need service_role (with explicit seller_id checks on every query)
- **File**: `src/lib/ai/agent.ts`

### 1.15 WooCommerce HMAC bypass when no secret configured (F-33)

- **What**: If seller hasn't configured webhook_secret, any request claiming WooCommerce is accepted
- **Fix**: If `detectedPlatform === "woocommerce"` and no `wcSecret`, reject with 401 + agent_activity log
- **File**: `src/app/api/webhooks/store/[token]/route.ts`

### 1.16 Remove/disable `clearTestData()` (F-70)

- **What**: Nuclear hard-delete function callable from settings page with no admin check, no soft delete, and `messages` table has no `seller_id`
- **Fix**: Remove from settings page, delete the function, or gate behind admin+confirmation with a DANGEROUS_OPERATION env flag
- **Files**: `src/lib/data/storage-service.ts`, `src/app/(dashboard)/dashboard/settings/page.tsx`

### 1.17 Enable HaveIBeenPwned password protection (F-3)

- **What**: HIBP integration disabled in Supabase Auth
- **Fix**: Enable in Supabase Dashboard → Authentication → Password Settings

---

## PHASE 2 — 🛡️ Data Integrity & Profit Calculation (12 findings)

> **Goal**: Fix all data corruption, wrong calculations, hard deletes, and race conditions
> **Exit criteria**: Zero hard deletes, correct profit on all orders, atomic webhook dedup, consistent order numbers

### 2.1 Fix `p_net_profit: 0` on ALL order creation paths (F-30, F-31, F-74)

- **What**: AI tool-handler, webhook route, and place-order route all pass `p_net_profit: 0` or `p_net_profit: total_price`
- **Fix**: Compute `net_profit = total_price - cost_of_goods - delivery_cost` in `atomic_create_order` RPC itself. Accept `p_net_profit` as optional override, default to computed value. Look up cost_price from products table for each item.
- **Files**: Migration SQL (atomic_create_order), `src/lib/ai/tool-handlers.ts`, `src/app/api/webhooks/store/[token]/route.ts`, `src/app/api/store/place-order/route.ts`

### 2.2 Fix P&L `cost_of_goods` calculation (F-20, F-111)

- **What**: `get_pnl_summary` reads `cost_price` from order items JSON which doesn't contain it → always 0
- **Fix**: (a) When creating orders, stamp `cost_price` into each item from `products.cost_price`. (b) In `get_pnl_summary`, JOIN products table as fallback if item.cost_price is null
- **Files**: Migration SQL (get_pnl_summary), atomic_create_order (item enrichment)

### 2.3 Fix `get_product_profitability` broken JOIN (F-112)

- **What**: `items @> jsonb_build_array(jsonb_build_object('product_id', p.id::text))` — containment check fails because items have more keys than the built object
- **Fix**: Use `EXISTS (SELECT 1 FROM jsonb_array_elements(o.items) AS item WHERE item->>'product_id' = p.id::text)` instead
- **File**: Migration SQL (get_product_profitability)

### 2.4 Fix `get_dashboard_aggregates` — 22 subqueries → single CTE (F-109, F-19)

- **What**: 22 separate subqueries against orders for the same seller
- **Fix**: Rewrite as single `SELECT COUNT(*) FILTER (WHERE ...), SUM(total_price) FILTER (WHERE ...)` with CTEs
- **File**: Migration SQL

### 2.5 Fix `get_analytics_data` confirmationRate formula (F-110)

- **What**: Incorrect numerator (confirmed+delivered) and denominator with redundant subquery
- **Fix**: `confirmationRate = confirmed_count / NULLIF(non_draft_count, 0) * 100`
- **File**: Migration SQL

### 2.6 Replace hard deletes with soft deletes (F-28, F-29, F-80, F-99)

- **What**: `handleDeleteOrder` and `handleDeleteProduct` use `.delete()`; returns API also hard-deletes
- **Fix**: Change to `.update({ deleted_at: new Date().toISOString() })`. Add `deleted_at` column to `returns` table. Update returns API route.
- **Files**: `src/lib/ai/tool-handlers.ts`, `src/app/api/returns/[id]/route.ts`, Migration SQL (returns.soft_delete)

### 2.7 Webhook dedup race condition — use INSERT ON CONFLICT (F-9)

- **What**: Check-then-insert can let duplicates through under concurrency
- **Fix**: `INSERT INTO webhook_events ... ON CONFLICT (seller_id, platform, event_id) DO NOTHING`
- **File**: `src/app/api/webhooks/store/[token]/route.ts`

### 2.8 Normalize order number generation (F-143)

- **What**: Trigger uses sequential numbers, RPC uses timestamp+random — inconsistent formats
- **Fix**: Remove the trigger's `generate_order_number` function. Let `atomic_create_order` be the single source. If direct INSERT is used, the trigger still fires but should use the same format.
- **File**: Migration SQL

### 2.9 Fix `handle_new_user` empty string vs NULL (F-144)

- **What**: `COALESCE(metadata->>'full_name', '')` inserts empty string instead of NULL
- **Fix**: Use `NULLIF(NEW.raw_user_meta_data->>'full_name', '')` — same for business_name
- **File**: Migration SQL

### 2.10 Fix `atomic_create_order` customer upsert empty string overwrite (F-142)

- **What**: `COALESCE(EXCLUDED.name, customers.name)` doesn't protect against empty string `""`
- **Fix**: Use `COALESCE(NULLIF(EXCLUDED.name, ''), customers.name)`
- **File**: Migration SQL

### 2.11 Fix synced products `cost_price: 0` (F-85)

- **What**: Integration sync sets `cost_price: 0` for all products
- **Fix**: Set `cost_price: null` (NULL = unknown, 0 = free). Update P&L queries to handle null cost_price gracefully.
- **File**: `src/app/api/integrations/sync/route.ts`

### 2.12 Fix ConfirmationPanel bypassing service layer (F-83, F-84, F-95)

- **What**: Direct Supabase `orders.update()` from client skips automations, stock adjustments, and risk updates. Also references non-existent `return_reason` column.
- **Fix**: Route all order mutations through API routes (`/api/orders/[id]/status`, `/api/orders/[id]/confirm`). Remove direct client writes. Delete `return_reason` column reference.
- **File**: `src/components/dashboard/ConfirmationPanel.tsx`

---

## PHASE 3 — 🐛 Logic Bugs & Broken Features (16 findings)

> **Goal**: Fix all extraction bugs, calculation errors, and broken feature paths
> **Exit criteria**: Correct wilaya extraction, correct delivery costs, working automations, consistent phone handling

### 3.1 Remove "to" → "Tizi Ouzou" alias (F-35)

- **What**: `to: "Tizi Ouzou"` matches the English word "to" in every message
- **Fix**: Remove the `to` alias from `extractWilaya()`. Add word-boundary check or only match if preceded by Arabic preposition (إلى/لـ)
- **File**: `src/lib/ai/extraction.ts`

### 3.2 Fix `normalizeDarija()` corrupting phone numbers (F-36)

- **What**: Franco-Arab replacement regex replaces digits near letters
- **Fix**: Run `normalizeDarija()` AFTER phone extraction, or add negative lookbehind/lookahead for digit sequences (phone patterns)
- **File**: `src/lib/ai/extraction.ts`

### 3.3 Fix `extractProducts()` quantity overwrite (F-37)

- **What**: `totalQty` is overwritten, not accumulated — multi-product messages get wrong quantities
- **Fix**: Parse quantities per-product, not globally. Each product in the regex match gets its own quantity.
- **File**: `src/lib/ai/extraction.ts`

### 3.4 Fix order agent double-condition on auto-confirm/reject (F-39)

- **What**: Requires BOTH risk_score AND recommendation to match — thresholds become unreliable
- **Fix**: Use risk_score as primary decision. If score ≤ auto_confirm_threshold, auto-confirm regardless of recommendation. Log recommendation mismatch as a warning.
- **File**: `src/lib/agents/order-agent.ts`

### 3.5 Fix hardcoded `deliveryCost = 400` (F-41)

- **What**: Both AI tool-handler and comm-agent default to 400 DA, ignoring seller's shipping_rates
- **Fix**: Extract shared `calculateDeliveryCost(sellerId, wilaya, deliveryType)` function. Always check seller rates first, fallback to zone pricing, only then default to 400.
- **Files**: `src/lib/ai/tool-handlers.ts`, `src/lib/agents/communication-agent.ts`, new `src/lib/data/shipping-calculator.ts`

### 3.6 Fix `normalizePhone` over-aggressive country code (F-89)

- **What**: French numbers (3312345678) get converted to 2133312345678
- **Fix**: Validate result matches Algerian format `^213[5-7]\d{8}$`. If not, return original number unchanged.
- **File**: `src/lib/channels/evolution-api.ts`

### 3.7 Fix phone collision in `handleUpdateCustomer` (F-34, F-129)

- **What**: `ilike("phone", "%...last9")` + `.single()` → PGRST116 on duplicate suffixes. Same bug in agent.ts `create_customer`
- **Fix**: Use `.eq("phone", cleanPhone)` after normalizing to full format. If ilike needed for partial matches, use `.limit(1).maybeSingle()` not `.single()`
- **Files**: `src/lib/ai/tool-handlers.ts`, `src/lib/ai/agent.ts`

### 3.8 Fix duplicate CommAgentConfig type (F-32)

- **What**: Two different interfaces — `communication-agent.ts` has `auto_send` and `language_preference`, `types.ts` doesn't
- **Fix**: Merge into `types.ts` as the single source. Add `auto_send: boolean` and `language_preference` with defaults. Delete local interface.
- **Files**: `src/lib/agents/types.ts`, `src/lib/agents/communication-agent.ts`

### 3.9 Fix duplicate OrderAgentConfig type (F-40)

- **What**: Same interface defined in both `order-agent.ts` and `types.ts`
- **Fix**: Keep only the one in `types.ts`, import in `order-agent.ts`
- **Files**: `src/lib/agents/types.ts`, `src/lib/agents/order-agent.ts`

### 3.10 Fix comm-agent double product fetch (F-38)

- **What**: Products fetched twice in `processIncomingMessage`
- **Fix**: Reuse the first `products` result for both extraction and catalog matching
- **File**: `src/lib/agents/communication-agent.ts`

### 3.11 Fix webhook commune always null (F-52)

- **What**: Shopify/WooCommerce/YouCan normalizers set `p_customer_commune: null`
- **Fix**: Extract commune from `shipping_address.city` (Shopify), `billing.city` (WooCommerce), appropriate field (YouCan)
- **File**: `src/app/api/webhooks/store/[token]/route.ts`

### 3.12 Fix product search `ilike` SQL wildcard injection (F-96)

- **What**: User input interpolated directly into `ilike` pattern
- **Fix**: Escape `%` → `\%` and `_` → `\_` in search input before interpolation
- **File**: `src/lib/data/product-service.ts`

### 3.13 Fix manual order missing `product_id` → no stock decrement (F-121)

- **What**: Orders page `handleCreate` passes items without `product_id`
- **Fix**: Include product_id in form items; map selected product to its ID before calling createOrder
- **File**: `src/app/(dashboard)/dashboard/orders/page.tsx`

### 3.14 Fix TeamInviteModal allowing "owner" role (F-123)

- **What**: Current owner can invite another "owner"
- **Fix**: Remove "owner" from invite options. Owner role is reserved for the account creator. Only allow admin/confirmer/packer/viewer.
- **File**: `src/components/dashboard/TeamInviteModal.tsx`

### 3.15 Fix `executeRecipes` silent skip when trigger_config is null (F-42)

- **What**: If `trigger_config` is null or missing `recipe_id`, recipe silently skipped with no logging
- **Fix**: Add structured logging when a recipe can't be matched. Validate trigger_config schema on automation creation.
- **File**: `src/lib/automation/executor.ts`

### 3.16 Fix AI route double auth + swallowed errors (F-73)

- **What**: Second `createClient()` + `auth.getUser()` in `agent_execute` case; catch swallows auth failure
- **Fix**: Use the sellerId already resolved from the first auth check. Remove the redundant try/catch block.
- **File**: `src/app/api/ai/route.ts`

---

## PHASE 4 — 📐 TypeScript ↔ Database Type Alignment (10 findings)

> **Goal**: Zero type drift, complete type coverage for all 24 tables, consistent enums
> **Exit criteria**: `npx tsc --noEmit` passes, `supabase_remote_generate_typescript_types` matches local types

### 4.1 Add missing TypeScript interfaces for DB tables (F-12)

- **What**: `returns`, `return_notes`, `expenses`, `team_members`, `ai_chat_sessions`, `ai_chat_messages`, `daily_analytics_reports` have no shared interface in `database.ts`
- **Fix**: Add all 7 interfaces with exact column types matching DB schema
- **File**: `src/types/database.ts`

### 4.2 Add `orders.source` CHECK for "ai" and "messenger" (F-14, F-12)

- **What**: DB has no CHECK on source column; TS `OrderSource` includes "ai" | "messenger" which could fail at DB level
- **Fix**: Add `CHECK (source IN ('draft','manual','shopify','woocommerce','youcan','custom','ai','messenger','form'))`
- **File**: Migration SQL

### 4.3 Add `returns.reason` CHECK alignment (F-12)

- **What**: DB includes "defective" and "late_delivery" but TS ReturnReason doesn't
- **Fix**: Add these to TS `ReturnReason` type
- **File**: `src/types/database.ts`

### 4.4 Fix `notifications.type` — add TS enum (F-12)

- **What**: DB has 6 valid values, no TS type
- **Fix**: Add `NotificationType` union type
- **File**: `src/types/database.ts`

### 4.5 Fix `sellers.plan` — extract distinct type (F-12)

- **What**: Hardcoded in Seller interface, not a distinct type
- **Fix**: Add `SellerPlan` type alias
- **File**: `src/types/database.ts`

### 4.6 Fix `deliveries.status` default mismatch (F-24)

- **What**: DB defaults to "created", TS `DeliveryStatus` starts with "pending"
- **Fix**: Either change DB default to "pending" or update TS to start with "created". Align both.
- **Files**: `src/types/database.ts`, Migration SQL

### 4.7 Fix `notification_settings` default (F-15)

- **What**: DB defaults to `'{}'::jsonb`, but `NotificationSettings` interface expects 6 boolean fields → undefined at runtime
- **Fix**: Change DB default to `'{"newOrders":true,"confirmations":true,"highRisk":true,"lowStock":true,"delivery":true,"weekly":true}'::jsonb`
- **File**: Migration SQL

### 4.8 Add `sellers.webhook_token` auto-generation + NOT NULL (F-23)

- **What**: `webhook_token` is nullable — store webhook route could match incorrectly
- **Fix**: Auto-generate on seller creation (trigger), add NOT NULL constraint
- **File**: Migration SQL + `handle_new_user` trigger update

### 4.9 Add `sellers.slug` UNIQUE constraint (F-26)

- **What**: No unique constraint despite trigger de-duplication
- **Fix**: `ALTER TABLE sellers ADD CONSTRAINT sellers_slug_unique UNIQUE (slug);`
- **File**: Migration SQL

### 4.10 Add `form_metadata` to Order TS type (F-12 alignment matrix)

- **What**: DB has `form_metadata` column, TS Order interface may be missing it
- **Fix**: Add `form_metadata: Record<string, unknown> | null` to Order interface
- **File**: `src/types/database.ts`

---

## PHASE 5 — ⚡ Performance & Scalability (11 findings)

> **Goal**: Eliminate N+1 queries, fix serverless-incompatible patterns, optimize DB access
> **Exit criteria**: Dashboard loads <2s at 10K orders, cron completes within Vercel timeout, rate-limit works across instances

### 5.1 Fix cron daily-report O(n) sequential processing (F-76)

- **What**: Iterates ALL sellers with 5+ sequential DB/API calls per seller
- **Fix**: (a) Batch DB queries (one query for all sellers' orders). (b) Parallel WhatsApp sends with `Promise.allSettled()`. (c) Add pagination with cursor for seller list. (d) Move to Edge Function or Vercel Pro for longer timeout.
- **File**: `src/app/api/cron/daily-report/route.ts`

### 5.2 Fix import N+1 queries (F-86)

- **What**: 500 products = 1500-2000 sequential queries
- **Fix**: (a) Pre-fetch all categories into a Map. (b) Batch dedup lookups. (c) Use `supabase.from("products").insert(batch)` with chunks of 50.
- **File**: `src/app/api/products/import/route.ts`

### 5.3 Replace in-memory rate limiting with Upstash Redis (F-11)

- **What**: In-memory Map resets on cold starts, doesn't work across Vercel instances
- **Fix**: Implement `@upstash/ratelimit` with Redis. Keep in-memory as fallback for dev. Add env flag.
- **File**: `src/lib/rate-limit.ts`

### 5.4 Fix middleware 2-3 queries per request (F-44)

- **What**: Every dashboard page load triggers team_members + sellers lookup
- **Fix**: Cache onboarding status in a Supabase session claim (custom claim set on login). Single `auth.jwt()` check in middleware instead of DB queries.
- **Files**: `src/lib/supabase/middleware.ts`, auth hooks

### 5.5 Add missing composite indexes (F-18)

- **What**: No index on `(seller_id, status, deleted_at)` or `(seller_id, created_at)` for dashboard/analytics
- **Fix**: Create targeted composite indexes for known query patterns
- **File**: Migration SQL

### 5.6 Add missing FK indexes (F-6)

- **What**: `return_notes.author_id`, `returns.customer_id`, `returns.exchange_order_id`, `team_members.invited_by` have no index
- **Fix**: Create indexes for all 4
- **File**: Migration SQL

### 5.7 Drop unused indexes (F-5)

- **What**: 22 indexes have never been used (dataset is tiny)
- **Fix**: Keep FK and critical path indexes. Drop query-specific unused ones. Re-evaluate when data grows.
- **File**: Migration SQL

### 5.8 Fix risk-engine in-memory cache not shared across serverless (F-118)

- **What**: Cold starts recompute wilaya profiles with full table scan
- **Fix**: Cache in Upstash Redis with 1h TTL, fallback to in-memory. Or materialize results in a `wilaya_risk_profiles` table.
- **File**: `src/lib/ai/risk-engine.ts`

### 5.9 Fix Evolution API — no retry on failure (F-100)

- **What**: Single 15s timeout failure = message lost
- **Fix**: Add retry with exponential backoff + jitter (same pattern as groq.ts). Queue failures for webhook retry processor.
- **File**: `src/lib/channels/evolution-api.ts`

### 5.10 Fix Groq retry — no jitter on backoff (F-53)

- **What**: All concurrent requests retry at the same time → thundering herd
- **Fix**: Add `+ Math.random() * 1000` to retry delay
- **File**: `src/lib/agents/groq.ts`

### 5.11 Fix Topbar re-fetching seller profile on every mount (F-131)

- **What**: Every dashboard navigation triggers a DB query
- **Fix**: Create a SellerContext provider that fetches once and caches. Components consume context instead of calling API.
- **Files**: New `src/components/providers/SellerProvider.tsx`, `src/components/dashboard/Topbar.tsx`

---

## PHASE 6 — 🎨 UX, i18n & Code Quality (16 findings)

> **Goal**: Consistent locale handling, proper i18n in all components, clean codebase
> **Exit criteria**: All user-facing text uses i18n, no hardcoded English, CSS tokens unified, dead code removed

### 6.1 Fix ErrorBoundary hardcoded English (F-120)

- **What**: "Something went wrong" + "Try Again" — always English
- **Fix**: Accept locale prop or use i18n context. Sanitize error messages (don't leak stack traces). Arabic RTL layout.
- **File**: `src/components/ui/ErrorBoundary.tsx`

### 6.2 Fix delivery status labels always French (F-48)

- **What**: `getStatusLabel()` returns hardcoded French
- **Fix**: Accept locale parameter, return Arabic/French/English labels. Or remove and use i18n keys in the consuming component.
- **File**: `src/lib/delivery/adapters.ts`

### 6.3 Fix daily-report WhatsApp message in English (F-98)

- **What**: Entire digest is English despite Arabic being the default locale
- **Fix**: Use seller's locale preference. Create Arabic + French message templates. Default to Arabic.
- **File**: `src/app/api/cron/daily-report/route.ts`

### 6.4 Fix charts using `navigator.language` instead of app locale (F-119)

- **What**: Date labels use browser locale, not the app's active i18n locale
- **Fix**: Import `useI18n()` or accept `locale` prop, format dates accordingly
- **Files**: `src/components/ui/charts/RevenueChart.tsx`, `ProfitTrendChart.tsx`

### 6.5 Fix `formatCompact` — no Arabic numeral support (F-137)

- **What**: Always returns "1.5M" / "12k" even in Arabic locale
- **Fix**: Use Arabic-Indic numerals (١.٥م / ١٢ ألف) when locale is "ar"
- **File**: `src/components/ui/charts/chart-utils.ts`

### 6.6 Fix `AnimatedStatCard` locale (F-122)

- **What**: Hardcoded `toLocaleString("fr-DZ")` — not a standard BCP 47 locale
- **Fix**: Use active locale from i18n context: `"ar-DZ"`, `"fr"`, or `"en"`
- **File**: `src/components/ui/AnimatedStatCard.tsx`

### 6.7 Fix `STATUS_COLORS` hardcoded hex (F-125)

- **What**: Chart colors ignore CSS token system, poor contrast in light mode
- **Fix**: Map to CSS custom properties or use THEME_COLORS from the token system
- **File**: `src/components/ui/charts/chart-utils.ts`

### 6.8 Unify conflicting CSS tokens (F-91, F-92)

- **What**: `tokens.css` and `base.css` define conflicting `--sf-*` values and different radius values
- **Fix**: Make `tokens.css` the single source of truth. Remove duplicate `--sf-*` definitions from `base.css`. Reconcile `--radius-sm` (6px vs 4px).
- **Files**: `src/app/tokens.css`, `src/app/styles/base.css`

### 6.9 Fix RTL CSS fragile patterns (F-93, F-130)

- **What**: Sidebar `translateX(-100%)` and toggle `translateX(20px)` need manual RTL overrides
- **Fix**: Use CSS logical properties (`inset-inline-start`, `translate-inline-start`) or CSS `dir` attribute selectors consistently
- **Files**: `src/app/styles/responsive.css`, `src/app/styles/components.css`

### 6.10 Fix `FadeIn` direction not responsive to locale change (F-128)

- **What**: `document.dir` checked once at render time
- **Fix**: Use React context or `useI18n()` for reactive locale/direction updates
- **File**: `src/components/ui/motion/FadeIn.tsx`

### 6.11 Fix `color-mix()` browser compatibility (F-106)

- **What**: `color-mix()` requires Safari 16.2+, Chrome 111+ — not universal in Algeria
- **Fix**: Add fallback values: `background: #1a1b2e; background: color-mix(in srgb, var(--color-brand-400) 10%, transparent);`
- **File**: `src/app/styles/dashboard.css`

### 6.12 Fix Sentry `ignoreErrors` over-broad substring matching (F-60)

- **What**: `"Load failed"` could mask legitimate errors
- **Fix**: Use regex patterns: `/ResizeObserver loop limit exceeded/`, `/Load failed/i` (only if appropriate)
- **File**: `sentry.client.config.ts`

### 6.13 Remove dead code (F-21, F-66, F-67, F-124)

- **What**: `getServiceSupabase()` duplicated in 4 files, `getStatusLabel()` unused, `service.ts` legacy shim, `Toast.tsx` deprecated re-export, `sellers.whatsapp_template` superseded column
- **Fix**: Centralize `getServiceSupabase()` in `@/lib/supabase/server.ts`, delete unused functions, remove legacy shim, update imports
- **Files**: Multiple

### 6.14 Fix Vercel cron config — missing auth headers (F-64)

- **What**: Cron jobs hit routes that require `x-cron-secret` header but Vercel Cron doesn't send custom headers
- **Fix**: Use Vercel's `Authorization` header mechanism, or add a `CRON_SECRET` env var check that matches the route's expected header
- **File**: `vercel.json`, cron route files

### 6.15 Fix CSP missing `strict-dynamic` (F-65)

- **What**: `script-src 'self' 'unsafe-inline'` — XSS risk without `strict-dynamic`
- **Fix**: Add `'strict-dynamic'` and nonce-based approach (if feasible with Next.js), or document the limitation
- **File**: `next.config.ts`

### 6.16 Fix phone validation pattern inconsistency (F-107)

- **What**: `form/submit` uses `/^(05|06|07)[0-9]{8}$/`, `place-order` uses `/^(0)?(5|6|7)\d{8}$/`
- **Fix**: Extract shared `ALGERIAN_PHONE_REGEX` from a single source (already exists in `tool-handlers.ts`), import everywhere
- **Files**: `src/lib/validation.ts`, multiple API routes

---

## PHASE 7 — 🧪 Testing, Documentation & Final Hardening (17 findings)

> **Goal**: Integration test coverage for critical paths, documented conventions, consistent patterns
> **Exit criteria**: RLS policy tests pass, webhook E2E works, agent tool routing verified, docs match code

### 7.1 Integration tests — RLS policy verification (F-10, F-102)

- **What**: Zero tests verify that user A can't access user B's data
- **Fix**: Create test suite that creates two sellers, verifies each can only see their own data across all tables
- **File**: `src/lib/__tests__/rls-integration.test.ts`

### 7.2 Integration tests — Webhook HMAC verification E2E (F-10)

- **What**: No test verifies actual HMAC signing + verification round-trip
- **Fix**: Test that valid Shopify/WooCommerce/YouCan signatures pass, invalid ones reject
- **File**: `src/app/api/webhooks/store/[token]/route.test.ts`

### 7.3 Integration tests — atomic_update_order_status transitions (F-10, F-22)

- **What**: No test verifies the order state machine in the DB function
- **Fix**: Test all valid transitions, verify terminal states block further changes, verify stock adjustments
- **File**: `src/lib/__tests__/order-transitions.test.ts`

### 7.4 Integration tests — retry queue processor (F-10)

- **What**: No test verifies retry → dead-letter flow
- **Fix**: Test that max-attempts events get dead-lettered, successful retries update status
- **File**: `src/app/api/webhooks/retry/route.test.ts`

### 7.5 Add tests for agent.ts (1621L) — tool routing (F-138)

- **What**: Zero test coverage for the largest AI file with 26 tool definitions
- **Fix**: Test tool routing, parameter extraction, action card generation, error recovery for at least the top 10 tools
- **File**: `src/lib/ai/__tests__/agent-tools.test.ts`

### 7.6 Add tests for risk-engine.ts (630L) (F-139)

- **What**: Zero test coverage for fraud detection system
- **Fix**: Test risk scoring factors, threshold logic, wilaya profile weighting
- **File**: `src/lib/ai/__tests__/risk-engine.test.ts`

### 7.7 Fix DOMException check on server (F-45)

- **What**: `err instanceof DOMException` may not work in Node.js/Vercel Edge
- **Fix**: Use `err.name === 'AbortError'` check instead of `instanceof DOMException`
- **File**: `src/lib/agents/groq.ts`

### 7.8 Fix Yalidine name splitting for Arabic (F-49)

- **What**: `split(" ")[0]` for firstname fragile with Arabic multi-part names
- **Fix**: Send full name as `firstname` with empty `lastname` (Yalidine accepts this), or use a smarter Arabic name parser
- **File**: `src/lib/delivery/adapters.ts`

### 7.9 Fix ZR Express ignoring fromWilaya and weight (F-51)

- **What**: `getDeliveryCost` ignores origin wilaya and weight
- **Fix**: Pass actual fromWilaya and weight parameters to the ZR Express pricing calculation
- **File**: `src/lib/delivery/adapters.ts`

### 7.10 Fix extractOrderWithCatalog exact match only (F-50)

- **What**: Uses `toLowerCase() === toLowerCase()` but fuzzy `matchProductToCatalog` already exists in same file
- **Fix**: Use `matchProductToCatalog` for catalog matching in `extractOrderWithCatalog`
- **File**: `src/lib/ai/extraction.ts`

### 7.11 Fix executor shipment `weight: 0.5` hardcoded (F-55)

- **What**: All auto-created shipments are 0.5 kg
- **Fix**: Calculate weight from order items (default per-item weight or product-specific weight)
- **File**: `src/lib/automation/executor.ts`

### 7.12 Extract shared `createShipment` function (F-56)

- **What**: Duplicated shipment creation logic in executor.ts and tool-handlers.ts
- **Fix**: Create `src/lib/delivery/shipment-service.ts` with shared function
- **Files**: `src/lib/automation/executor.ts`, `src/lib/ai/tool-handlers.ts`

### 7.13 Fix metadata overwrite in orchestrator (F-57)

- **What**: `metadata: {...}` overwrites entire JSONB object
- **Fix**: Use `metadata: supabase.sql`COALESCE(metadata, '{}') || new_metadata``or`.update({ metadata: { ...existingMetadata, ...newKeys } })`
- **File**: `src/lib/agents/orchestrator.ts`

### 7.14 Fix exchange order `delivery_cost: 0` hardcoded (F-101)

- **What**: Exchange orders always get free delivery
- **Fix**: Calculate delivery_cost from seller's shipping rates (same as new order)
- **Files**: `src/lib/data/returns-service.ts`, `src/lib/ai/tool-handlers.ts`

### 7.15 Fix sanitizer running on Arabic locale (F-117)

- **What**: `sanitizeDarijaLeaks` replaces in all locales including Arabic where it's a no-op or could corrupt
- **Fix**: Add early return `if (locale === 'ar') return text;`. Add word-boundary awareness to regex patterns.
- **File**: `src/lib/ai/sanitizer.ts`

### 7.16 Fix orders page bulk confirm — no error handling (F-132)

- **What**: Sequential for-loop with no partial success reporting
- **Fix**: Use `Promise.allSettled()`, report successes and failures separately
- **File**: `src/app/(dashboard)/dashboard/orders/page.tsx`

### 7.17 Fix Orders page duplicated slide-out markup (F-127)

- **What**: ~200 lines of inline slide-out that duplicates `OrderSlideOut.tsx`
- **Fix**: Refactor to use `<OrderSlideOut>` component
- **File**: `src/app/(dashboard)/dashboard/orders/page.tsx`

---

## 📊 Effort Estimation

| Phase                      | Findings | Files Touched | Est. Hours | Risk                                       |
| -------------------------- | -------- | ------------- | ---------- | ------------------------------------------ |
| **1. Security Lockdown**   | 17       | ~15           | 12-16h     | 🔴 Highest impact — must be first          |
| **2. Data Integrity**      | 12       | ~12           | 10-14h     | 🔴 Profit calculation is business-critical |
| **3. Logic Bugs**          | 16       | ~15           | 10-12h     | 🟡 Many small fixes, some tricky regex     |
| **4. Type Alignment**      | 10       | ~5            | 4-6h       | 🟢 Mostly mechanical                       |
| **5. Performance**         | 11       | ~10           | 8-12h      | 🟡 Redis migration needs env setup         |
| **6. UX & i18n**           | 16       | ~15           | 6-8h       | 🟢 Lower risk, polish work                 |
| **7. Testing & Hardening** | 17       | ~12           | 12-16h     | 🟡 Tests need careful setup                |
| **TOTAL**                  | **99**   | **~84**       | **62-84h** |                                            |

---

## 🚨 Execution Rules

1. **Phase 1 before everything** — security holes are unacceptable in production
2. **Phase 2 before Phase 5** — wrong profit data makes performance optimization meaningless
3. **Phase 3 before Phase 7** — don't write integration tests for broken logic
4. **Each phase = one PR** with a clear description mapping to finding IDs
5. **Every migration is numbered** and tested against existing data
6. **`next build` + `npx tsc --noEmit` + `vitest run`** must pass after each phase
7. **No `any` types added** — all new code is strict TypeScript
8. **Structured JSON logging** — no raw `console.error` in any new code

---

> _This masterplan is the single source of truth for the flawless execution of SahelFlow v2._
> _Built with 🇩🇿 for 🇩🇿_
