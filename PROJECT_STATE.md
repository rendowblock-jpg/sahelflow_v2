# SahelFlow v2 — Project State

> **Last updated:** 2026-05-23  
> **Status:** ✅ CLIENT-READY — Production deploy authorized

---

## Health Check

| Gate                           | Result                                               |
| ------------------------------ | ---------------------------------------------------- |
| `next build`                   | ✅ Zero errors, zero warnings                        |
| `npx vitest run`               | ✅ **360/360** passing across 34 test files          |
| `npx tsc --noEmit`             | ✅ Zero errors (strict mode)                         |
| Security headers               | ✅ CSP + HSTS + Permissions-Policy + XFO + XCTO + RP |
| Zero English leakage (ar mode) | ✅ Verified via `scripts/check-translations.ts`      |

---

## What's Working

### Core Platform

| Feature          | Status | Notes                                                                         |
| ---------------- | ------ | ----------------------------------------------------------------------------- |
| Dashboard stats  | ✅     | Real-time via Supabase realtime + RPC aggregates                              |
| Analytics charts | ✅     | Recharts: status distribution, wilaya breakdown, revenue by day, top products |
| Products page    | ✅     | CRUD, variants, categories, soft delete; connected Import Products modal      |
| Categories page  | ✅     | With SELECT RLS policies                                                      |
| Orders page      | ✅     | Full lifecycle, confirmation workflow, soft delete                            |
| Customers page   | ✅     | Risk scores, order history, soft delete                                       |
| COD cash flow    | ✅     | In transit, cleared, pending collection, at risk                              |

### AI & Automation

| Feature                  | Status | Notes                                                            |
| ------------------------ | ------ | ---------------------------------------------------------------- |
| AI chat (30 tools)       | ✅     | Persisted sessions & messages; fixed atomic_create_order RPC parameters mismatch; added comprehensive Algerian wilaya/phone normalization |
| 5-model Groq router      | ✅     | Flash/Brain/Deep/Struct/Craft with per-model keys                |
| AI streaming             | ✅     | SSE backend ready, streaming UI wired                            |
| Action cards             | ✅     | Structured responses with clickable actions                      |
| Auto-draft from WhatsApp | ✅     | Regex + LLM hybrid, fuzzy product matching                       |
| AI reply suggestions     | ✅     | 3 suggestions as clickable chips                                 |
| Dynamic risk engine      | ✅     | Wilaya profiles from seller's actual delivery data (60/40 blend) |
| Order Agent auto-run     | ✅     | Triggers on store webhook orders + WhatsApp extraction           |
| Automation recipes       | ✅     | Trigger: order/message/status. Action: WhatsApp/update/label     |

### WhatsApp & Messaging

| Feature                | Status | Notes                                              |
| ---------------------- | ------ | -------------------------------------------------- |
| Real-time inbox        | ✅     | Split-pane, deduplication, read receipts           |
| Evolution API          | ✅     | QR-code connection, live status                    |
| Message types          | ✅     | Text, image, audio, video, document                |
| Templates              | ✅     | Variable interpolation, auto-seeded on onboarding  |
| Draft order extraction | ✅     | Fixed malformed API call, works reliably           |

### Integrations

| Feature                  | Status | Notes                                    |
| ------------------------ | ------ | ---------------------------------------- |
| Shopify webhooks         | ✅     | HMAC verified, event-id deduplication    |
| WooCommerce webhooks     | ✅     | HMAC verified, HTTPS enforced            |
| YouCan webhooks          | ✅     | HMAC verified, full sync + webhooks (P1) |
| Shopify catalog sync     | ✅     | 250 products/call                        |
| WooCommerce catalog sync | ✅     | 100/page, paginated to 1,000 max         |
| YouCan catalog sync      | ✅     | Product pull via REST API                |
| Yalidine delivery        | ✅     | Full lifecycle: create/track/cancel/cost |
| Maystro adapter          | ✅     | Verified via complete unit test coverage |
| ZR Express adapter       | ✅     | Verified via complete unit test coverage |

### Import Engine (P2)

| Feature               | Status | Notes                                        |
| --------------------- | ------ | -------------------------------------------- |
| CSV import            | ✅     | With column mapping UI                       |
| XLSX import           | ✅     | Excel parsing with preview                   |
| Google Sheets         | ✅     | Public CSV URL import                        |
| Column mapper UI      | ✅     | Visual drag-drop field mapping               |
| Import preview        | ✅     | Parsed data preview before commit            |
| Import history        | ✅     | Tracked in `import_batches` table            |
| Embeddable order form | ✅     | Per-seller slug, rate limited, Zod validated |

### Design System (P6–P7)

| Feature          | Status | Notes                                                           |
| ---------------- | ------ | --------------------------------------------------------------- |
| Recharts charts  | ✅     | 6 chart components, RTL axes, reduced-motion support            |
| Framer Motion    | ✅     | PageTransition, StaggerContainer, FadeIn, SlideIn, AnimatedCard |
| AnimatedStatCard | ✅     | Count-up animation with icon                                    |
| Mobile utilities | ✅     | Touch targets, table scroll, grid collapse                      |
| Page transitions | ✅     | Applied to all 15 dashboard pages                               |

### Security & Infrastructure

| Feature                   | Status | Notes                                       |
| ------------------------- | ------ | ------------------------------------------- |
| RLS policies              | ✅     | All tables, multi-user role verified        |
| SECURITY DEFINER RPCs     | ✅     | Restricted to `service_role`                |
| HMAC webhooks             | ✅     | Shopify + WooCommerce + YouCan              |
| Rate limiting             | ✅     | All public/cron routes                      |
| Structured logging        | ✅     | JSON logs, no `console.error` in user paths |
| CSP headers               | ✅     | Explicit connect-src allowlist              |
| HSTS + Permissions-Policy | ✅     | Added in P9                                 |
| Secret handling           | ✅     | Fail-closed, no leakage                     |

### Financials, After-Sales & Operations (Phases 5–7)

| Feature                 | Status | Notes                                                          |
| ----------------------- | ------ | -------------------------------------------------------------- |
| Accounting Module       | ✅     | Real-time P&L analytics, Expense tracking, product margin      |
| Returns / Exchange Flow | ✅     | Full status management, return reasons, automatic stock sync; fully localized in Arabic (zero English leaks) |
| Multi-User Access       | ✅     | 5 static roles (owner/admin/confirmer/packer/viewer), team RLS |
| Daily Reports           | ✅     | Automatic daily WhatsApp reports of seller sales metrics       |
| AI Chat Persistence     | ✅     | Sessions and message histories saved to Supabase database      |


## Phase 6 — UX, i18n & Code Quality (2026-05-23)

| Fix | Files | Description |
|-----|-------|-------------|
| 6.1 | `src/app/global-error.tsx` | Replaced hardcoded English with i18n-safe locale lookup from localStorage; RTL dir support |
| 6.2 | — | Delivery status labels already use `t.delivery[status]` via useI18n — verified, no fix needed |
| 6.3 | `src/app/api/cron/daily-report/route.ts` | WhatsApp digest now locale-aware (ar/fr/en) with `buildWhatsAppDigest()`; fetches `default_locale` from sellers |
| 6.4 | `src/components/ui/charts/ProfitTrendChart.tsx`, `RevenueChart.tsx` | Replaced `navigator.language` with `locale` prop + `getLocaleTag()` |
| 6.5 | `src/components/ui/charts/chart-utils.ts` | Added `formatCompactLocale()` with Arabic-Indic numerals (١٢ألف, ١٫٥م); `formatCurrencyTooltip()` accepts locale param |
| 6.6 | `src/components/ui/AnimatedStatCard.tsx` | Replaced hardcoded `fr-DZ` with `getLocaleTag(locale)` from useI18n |
| 6.7 | `src/components/ui/charts/chart-utils.ts` | STATUS_COLORS now use CSS custom properties with hex fallbacks: `var(--color-warn-500, #f59e0b)` |
| 6.8 | — | `--sf-accent-primary` is a valid alias of `--color-brand-500`, not a conflict — no fix needed |
| 6.9 | `src/app/styles/ui-overhaul.css` | Replaced `text-align: left` with `text-align: start` for RTL compatibility |
| 6.10 | `src/components/ui/motion/FadeIn.tsx` | Added MutationObserver on `<html dir>` attribute changes so FadeIn re-renders on locale switch |
| 6.11 | `src/app/styles/dashboard.css`, `utilities.css` | Added `@supports` progressive enhancement for `color-mix()` with rgba fallbacks |
| 6.12 | `sentry.client.config.ts` | Replaced over-broad substring matching with regex patterns and exact Safari error strings |
| 6.13 | — | Dead code audit: CHART_PALETTE still used by WilayaBarChart — no removal needed |
| 6.14 | `vercel.json` | Added daily-report cron schedule; auth already handled by CRON_SECRET in route |
| 6.15 | `src/lib/supabase/middleware.ts` | Added CSP with `strict-dynamic`, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy |
| 6.16 | `src/lib/phone-utils.ts`, `tool-handlers.ts`, `evolution-api.ts` | Centralized Algerian phone validation (local/international format conversion, unified patterns) |

### Supporting Changes

| Change | Files | Description |
|--------|-------|-------------|
| Migration 022 | `supabase/migrations/022_seller_locale.sql` | Adds `default_locale` column to sellers with CHECK constraint |
| Seller type update | `src/types/database.ts` | Added `default_locale: "ar" | "fr" | "en"` to Seller interface |
| Locale-aware formatting | `ConfirmationPanel.tsx`, `DraftOrderCard.tsx`, `delivery/page.tsx`, `PnLCard.tsx` | Replaced all hardcoded `fr-DZ` toLocaleString with locale-aware `getLocaleTag()` |
| Phone utils tests | `src/lib/__tests__/phone-utils.test.ts` | 15 test cases covering local/international/bare/invalid formats |
| Chart utils tests | `src/components/ui/charts/__tests__/chart-utils.test.ts` | Added tests for formatCompactLocale, getLocaleTag, STATUS_COLORS CSS var format |

---

## Deferred / Future Work

| Item                           | Priority  | Notes                                      |
| ------------------------------ | --------- | ------------------------------------------ |
| Delivery agent PWA             | 🟡 Medium | Mobile web app for delivery status updates |
| Facebook/Instagram integration | 🟡 Medium | Catalog sync, UTM ad tracking              |
| TikTok pixel                   | 🟢 Low    | Conversion tracking                        |
| More delivery providers        | 🟢 Low    | Target top 5 covering 95% of deliveries    |
| AI receipt categorization      | 🟢 Low    | Future enhancement for accounting          |

---

## Known Limitations

1. **Race condition on webhook dedup** — Two identical events microseconds apart might slip through before `webhook_events` INSERT commits. Mitigated by `external_id` secondary guard on orders table.

---

## Post-Audit Fixes (2026-05-22)

### Multi-Tenant Isolation Alignment & Next.js 15 Routing Compatibility

| Fix | Files |
|-----|-------|
| Centralized API wrapper context and resolution for multi-tenant isolation, automatic suspension checks, and pre-resolution of Next.js 15 route params | `src/lib/api-wrapper.ts` |
| Eliminated `await params` redundancy and handled pre-resolved parameter mapping | `src/app/api/expenses/[id]/route.ts`, `src/app/api/returns/[id]/notes/route.ts`, `src/app/api/returns/[id]/route.ts` |
| Standardized team routing dynamic parameters and narrowed `memberId` to plain string | `src/app/api/team/[id]/route.ts` |
| Added dedicated wrapper tests verifying isolation, roles, suspension enforcement, and fallback mechanics | `src/lib/__tests__/api-wrapper.test.ts` |

---

## Post-Audit Fixes (2026-05-12)

Cross-layer audit completed: DB schema ↔ TypeScript types ↔ service layer ↔ API routes ↔ documentation.

### Type Safety

| Fix | Files |
|-----|-------|
| `DeliveryStatus` expanded 6 → 10 values (matched DB CHECK constraint) | `src/types/database.ts`, `src/lib/delivery/adapters.ts` |
| Added missing `WebhookEvent` interface | `src/types/database.ts` |
| Added missing `ImportBatch` + `ImportBatchStatus` types | `src/types/database.ts` |

### Logic & Data Integrity

| Fix | Files |
|-----|-------|
| `findOrCreateCustomer` guards against NULL phone (prevents duplicate INSERT via `NULL != NULL` upsert bug) | `src/lib/data/customer-service.ts` |
| `computeDynamicWilayaProfiles()` now caches results for 1 hour per seller (eliminates repeated full-table scans) | `src/lib/ai/risk-engine.ts` |

### Logging & Observability

| Fix | Files |
|-----|-------|
| Raw `console.error` / `console.warn` replaced with structured JSON logs | `src/lib/data/order-service.ts` |

### Migration Hygiene

| Fix | Files |
|-----|-------|
| Baseline `get_dashboard_aggregates()` rewritten with COALESCE-wrapped subqueries (safe for empty sellers) | `supabase/migrations/000_baseline.sql` |
| Removed stale `icom` provider from baseline + migration 002 | `supabase/migrations/000_baseline.sql`, `002_security_and_schema_cleanup.sql` |
| Trigger name synced to live DB (`on_auth_user_created`) | `supabase/migrations/000_baseline.sql` |
| Added `UNIQUE (seller_id, order_number)` constraint to baseline | `supabase/migrations/000_baseline.sql` |

---

## Migrations Applied to Live DB

| Migration                                              | Applied    | Purpose                                                        |
| ------------------------------------------------------ | ---------- | -------------------------------------------------------------- |
| `000_baseline.sql`                                     | Baseline   | Initial schema                                                 |
| `001_fix_dashboard_and_notifications.sql`              | 2026-04    | Patched aggregates + notifications table                       |
| `002_security_and_schema_cleanup.sql`                  | 2026-05-04 | Security definer lockdown + schema fixes                       |
| `003_select_rls_and_cleanup.sql`                       | 2026-05-05 | SELECT RLS policies + icom cleanup                             |
| `004_delivery_status_constraint_and_webhook_dedup.sql` | 2026-05-05 | Status CHECK + webhook_events dedup table                      |
| `005_import_history.sql`                               | 2026-05-11 | Import batches and history tracking                            |
| `006_audit_fixes.sql`                                  | 2026-05-12 | DB schema fixes & alignment (2026-05-12 audit)                 |
| `006_rls_insert_hardening.sql`                          | 2026-05-12 | Harden insert RLS policies for sellers and customers           |
| `007_ai_chat_persistence.sql`                          | 2026-05-18 | Server-side AI Chat Sessions & Messages table                  |
| `007_rebuild_analytics_with_soft_delete.sql`           | 2026-05-18 | Rebuild statistics to support soft deleted models              |
| `008_after_sales_returns.sql`                          | 2026-05-19 | After-sales returns tracking schema and triggers               |
| `009_accounting.sql`                                   | 2026-05-19 | Accounting ledger: expenses, return logs, variant costs        |
| `010_team_access.sql`                                  | 2026-05-20 | Multi-user team invites, role permissions, and updated RLS     |
| `011_daily_reports.sql`                                | 2026-05-20 | Daily analytics aggregation tables and reporting cron          |
| `020_soft_delete.sql`                                  | 2026-05-11 | Soft delete triggers and restore functions                     |

---

## Key Decisions Log

| Date       | Decision                                                                                | Rationale                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-05-23 | Phase 6: Full i18n/UX audit — locale-aware formatting, CSS progressive enhancement, centralized phone utils, CSP strict-dynamic | Eliminates English leakage in Arabic mode, ensures RTL responsiveness, protects against XSS with modern CSP, unifies divergent phone validation logic |
| 2026-05-22 | Centralized Multi-Tenant Alignment & Next.js 15 Dynamic Routing type compatibility       | Prevents team members' personal ID usage as seller ID across 17+ APIs, enforces suspension at middleware level, and resolves strict static type checks cleanly. |
| 2026-05-20 | Fix `atomic_create_order` RPC parameter mismatch                                        | Added p_external_id: null to RPC parameters to match the 18-argument database signature.                    |
| 2026-05-20 | Connect product import flow and modal                                                   | Wired ImportModal into products page header for CSV/XLSX imports.                                           |
| 2026-05-20 | Full Returns module localization                                                        | Refactored returns dashboards to support locales and ensure zero English leakage in Arabic mode.            |
| 2026-05-20 | Auto-seed WhatsApp templates upon Onboarding                                            | Seeding template strings on onboarding complete ensures no manual SQL step is required for registration.   |
| 2026-05-20 | Security Definer helper `check_user_seller_access` for team RLS                         | Allowed multi-user collaboration while bypassing infinite loops on `team_members` policy checks.            |
| 2026-05-19 | Real-time P&L & Expenses with dynamic order triggers                                    | Tied accounting metrics directly to order updates and variant costs.                                       |
| 2026-05-18 | Server-side AI Chat Session & Message Persistence                                       | Solved the multi-device sync gap by saving chats dynamically in PostgreSQL.                                 |
| 2026-05-12 | Full cross-layer audit: DB ↔ TypeScript ↔ services ↔ docs                               | Found and fixed type drift, migration noise, logging inconsistencies, and caching gaps                      |
| 2026-05-12 | `computeDynamicWilayaProfiles()` gets 1h in-memory TTL cache                            | Eliminates repeated full-table scans during order processing; scales to 10k+ orders per seller              |
| 2026-05-12 | Baseline migration `000` is canonical source of truth                                   | All later migrations layer on top; baseline now matches live DB constraints, triggers, and function bodies  |
| 2026-05-05 | Use authenticated `ctx.supabase`, not `createAdminClient()`, for user-scoped API routes | `service_role` has no auth context → `auth.uid()` returns NULL in SECURITY DEFINER RPCs                     |
| 2026-05-05 | AI-extracted orders use `draft` status                                                  | Seller must review before orders enter active pipeline. Safety-first design.                                |
| 2026-05-05 | No auto-send for AI replies                                                             | Hard-coded `auto_send: false`. Human always clicks Send. Trust mechanism for Algerian sellers.              |
| 2026-05-05 | Fire-and-forget agent dispatch from webhooks                                            | Webhooks have 5s timeouts (Shopify). Can't block on AI risk assessment.                                     |
| 2026-05-05 | Blend 60% seller data + 40% static for wilaya risk                                      | Prevents overfitting when seller has few orders in a wilaya. Gradual personalization.                       |
| 2026-05-11 | Arabic (فصحة) as default locale                                                         | Market-native. Darija understood but never displayed. Professional output from informal input.              |
| 2026-05-12 | Consolidate all phase docs into main files                                              | Remove drift. Single source of truth per topic.                                                             |

---

_Authoritative status document. For historical development phases, see git history or `docs/history/`._
