# SahelFlow v2 — Project State

> **Last updated:** 2026-05-12  
> **Status:** ✅ CLIENT-READY — Production deploy authorized

---

## Health Check

| Gate                           | Result                                               |
| ------------------------------ | ---------------------------------------------------- |
| `next build`                   | ✅ Zero errors, zero warnings                        |
| `npx vitest run`               | ✅ **354/354** passing across 32 test files          |
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
| Products page    | ✅     | CRUD, variants, categories, soft delete                                       |
| Categories page  | ✅     | With SELECT RLS policies                                                      |
| Orders page      | ✅     | Full lifecycle, confirmation workflow, soft delete                            |
| Customers page   | ✅     | Risk scores, order history, soft delete                                       |
| COD cash flow    | ✅     | In transit, cleared, pending collection, at risk                              |

### AI & Automation

| Feature                  | Status | Notes                                                            |
| ------------------------ | ------ | ---------------------------------------------------------------- |
| AI chat (23 tools)       | ✅     | All tools execute, errors propagate, synthesis accurate          |
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
| Templates              | ✅     | Variable interpolation, 4 default Arabic templates |
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
| Maystro adapter          | ⚠️     | Implemented, selectable but unverified   |
| ZR Express adapter       | ⚠️     | Skeleton, selectable but untested        |

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
| RLS policies              | ✅     | All tables, `seller_id = auth.uid()`        |
| SECURITY DEFINER RPCs     | ✅     | Restricted to `service_role`                |
| HMAC webhooks             | ✅     | Shopify + WooCommerce + YouCan              |
| Rate limiting             | ✅     | All public/cron routes                      |
| Structured logging        | ✅     | JSON logs, no `console.error` in user paths |
| CSP headers               | ✅     | Explicit connect-src allowlist              |
| HSTS + Permissions-Policy | ✅     | Added in P9                                 |
| Secret handling           | ✅     | Fail-closed, no leakage                     |

---

## Deferred / Future Work

| Item                           | Priority  | Notes                                             |
| ------------------------------ | --------- | ------------------------------------------------- |
| Accounting module              | 🔴 High   | P&L tracking, expenses, per-product profitability |
| After-sales / returns workflow | 🔴 High   | Returns, exchanges, refunds with status tracking  |
| Multi-user access              | 🔴 High   | Team roles: owner/admin/confirmer/packer/viewer   |
| Daily auto-reports             | 🟡 Medium | Cron summary via WhatsApp template                |
| Delivery agent PWA             | 🟡 Medium | Mobile web app for delivery status updates        |
| Facebook/Instagram integration | 🟡 Medium | Catalog sync, UTM ad tracking                     |
| TikTok pixel                   | 🟢 Low    | Conversion tracking                               |
| More delivery providers        | 🟢 Low    | Target top 5 covering 95% of deliveries           |
| AI receipt categorization      | 🟢 Low    | Future enhancement for accounting                 |

---

## Known Limitations

1. **Race condition on webhook dedup** — Two identical events microseconds apart might slip through before `webhook_events` INSERT commits. Mitigated by `external_id` secondary guard on orders table.
2. **ZR Express / Maystro adapters** — Implemented but not verified against live APIs. Hidden from UI selector until validated.
3. **Cross-device chat sync** — AIAssistant uses localStorage only. No server-side persistence for chat history.

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

| Migration                                              | Applied    | Purpose                                    |
| ------------------------------------------------------ | ---------- | ------------------------------------------ |
| `000_baseline.sql`                                     | Baseline   | Initial schema                             |
| `001_fix_dashboard_and_notifications.sql`              | 2026-04    | Patched aggregates + notifications table   |
| `002_security_and_schema_cleanup.sql`                  | 2026-05-04 | Security definer lockdown + schema fixes   |
| `003_select_rls_and_cleanup.sql`                       | 2026-05-05 | SELECT RLS policies + icom cleanup         |
| `004_delivery_status_constraint_and_webhook_dedup.sql` | 2026-05-05 | Status CHECK + webhook_events dedup table  |
| `005_import_history.sql`                               | 2026-05-11 | Import batches and history tracking        |
| `020_soft_delete.sql`                                  | 2026-05-11 | Soft delete triggers and restore functions |

---

## Key Decisions Log

| Date       | Decision                                                                                | Rationale                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-05-12 | Full cross-layer audit: DB ↔ TypeScript ↔ services ↔ docs                               | Found and fixed type drift, migration noise, logging inconsistencies, and caching gaps                      |
| 2026-05-12 | `computeDynamicWilayaProfiles()` gets 1h in-memory TTL cache                            | Eliminates repeated full-table scans during order processing; scales to 10k+ orders per seller              |
| 2026-05-12 | Baseline migration `000` is canonical source of truth                                   | All later migrations layer on top; baseline now matches live DB constraints, triggers, and function bodies  |
| 2026-05-05 | Use authenticated `ctx.supabase`, not `createAdminClient()`, for user-scoped API routes | `service_role` has no auth context → `auth.uid()` returns NULL in SECURITY DEFINER RPCs                     |
| 2026-05-05 | Keep ZR/Maystro in adapters but hide from UI                                            | Skeleton code exists; real APIs unverified. Removing code loses progress. Hiding prevents seller confusion. |
| 2026-05-05 | AI-extracted orders use `draft` status                                                  | Seller must review before orders enter active pipeline. Safety-first design.                                |
| 2026-05-05 | No auto-send for AI replies                                                             | Hard-coded `auto_send: false`. Human always clicks Send. Trust mechanism for Algerian sellers.              |
| 2026-05-05 | Fire-and-forget agent dispatch from webhooks                                            | Webhooks have 5s timeouts (Shopify). Can't block on AI risk assessment.                                     |
| 2026-05-05 | Blend 60% seller data + 40% static for wilaya risk                                      | Prevents overfitting when seller has few orders in a wilaya. Gradual personalization.                       |
| 2026-05-11 | Arabic (فصحة) as default locale                                                         | Market-native. Darija understood but never displayed. Professional output from informal input.              |
| 2026-05-12 | Consolidate all phase docs into main files                                              | Remove drift. Single source of truth per topic.                                                             |

---

_Authoritative status document. For historical development phases, see git history or `docs/history/`._
