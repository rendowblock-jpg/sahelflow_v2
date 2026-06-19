# SahelFlow v2 — Project State

> **Last updated:** 2026-06-19 (deep audit fixes — PR #2 through #15, 135 findings fixed)  
> **Status:** ✅ ALL CRITICAL + ALL HIGH + 26 MEDIUM/LOW RESOLVED — 135 of ~170 findings fixed across 15 PRs. 0 critical + 0 high remaining. See [AUDIT_FINDINGS.md](./AUDIT_FINDINGS.md).

---

## Health Check

| Gate                           | Result                                               |
| ------------------------------ | ---------------------------------------------------- |
| `next build`                   | ✅ Zero errors, zero warnings                        |
| `npx vitest run`               | ✅ **691/691** passing across 37 test files          |
| `npx eslint .`                 | ✅ 0 errors (13 warnings — pre-existing unused vars)  |
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
| Maystro adapter          | ✅     | Fully implemented (createShipment, getTracking, cancelShipment, getDeliveryCost) |
| ZR Express adapter       | ✅     | Fully implemented via Procolis API (createShipment, getTracking, cancelShipment, getDeliveryCost) |

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
| SECURITY DEFINER RPCs     | ✅     | Restricted to `service_role` only (verified 2026-06-02) |
| RPC grant audit           | ✅     | `get_product_profitability` (PUBLIC→revoked), `atomic_create_order` (anon→revoked), `get_pnl_summary` (authenticated→revoked) |
| HMAC webhooks             | ✅     | Shopify + WooCommerce + YouCan              |
| Rate limiting             | ✅     | All public/cron routes                      |
| Structured logging        | ✅     | JSON logs, no `console.error` in user paths (including `team-service.ts` auto-link, fixed 2026-06-04) |
| CSP headers               | ✅     | Explicit connect-src allowlist              |
| HSTS + Permissions-Policy | ✅     | Added in Phase 6 (CSP hardening)            |
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
2. **Orders stats full-table scan** — `loadStats()` in `orders/page.tsx` fetches all orders client-side to compute status counts. Acceptable at current scale; future fix: use `/api/dashboard/stats` RPC response which already returns `byStatus`. Tracked for Phase 8.
3. **Team invite email cross-lookup** — `inviteTeamMember` queries `sellers.email` without a DB-side index or SECURITY DEFINER wrapper. Acceptable for current single-tenant usage; tracked for Phase 8 when multi-tenant team management scales.
4. **AI layer console.error** — 40+ `console.error` calls remain in `src/lib/ai/` and `src/lib/agents/`. These are not in user-facing paths. Scheduled for gradual structured-logging migration in Phase 8.
5. **In-memory rate limiter** — `rate-limit.ts` uses a `Map` that resets on cold starts. Acceptable for current single-instance Vercel deployment. Migration path to `@upstash/ratelimit` documented in the file.

---

## Deep Audit Fixes (2026-06-19) — PR #2 through #15

A 5-agent deep audit surfaced ~170 findings across all layers. **135 fixed across 15 PRs** (all 15 critical + all 18 high + 26 medium/low + 12 test gaps + 14 type/doc findings resolved):

### PR #2 — Latent DB drift bugs + dead code (7 commits)
- ✅ `place-order` p_source `webstore`→`store` (orders.source CHECK violation)
- ✅ `storage-service` clearTestData messages delete via conversation_ids
- ✅ `shipment-service` integrations query realigned to live schema
- ✅ Deleted stray `expenses/ [id]` file, orphan `/dashboard/automation` route
- ✅ Vitest config paths updated to post-decomposition locations
- ✅ Baseline reconciled (products UNIQUE, daily_reports UNIQUE, deliveries.status CHECK)

### PR #4 — Magic Moment AAA fixes (6 commits, migration 030 live)
- ✅ B5: Duplicate detection now filters by customer_id
- ✅ B9: Pass actual risk_score to automations (was hardcoded 0)
- ✅ B10: AI notes appended not overwritten
- ✅ S2: Removed service-role fallback in AI agent
- ✅ S1: Column-level GRANT on sellers for anon (migration 030 live)
- ✅ S10: team_members_self_select RLS policy (migration 030 live)

### PR #5 — Code-layer fixes (10 commits)
- ✅ B1: `orders/[id]/status` + `confirm` routes — pass server supabase to updateOrderStatus
- ✅ B2: `accounting/pnl` + `products` — use createAdminClient for RPC routes
- ✅ B3: `webhooks/retry` — add GET handler (Vercel Cron sends GET)
- ✅ B4: `t.locale` broken accessor → use `locale` from useI18n (5 call sites)
- ✅ B6: `getPeriodFilter` add 90d/year cases
- ✅ B7: Remove non-existent `update_store_info` from AI system prompt
- ✅ B8: Darija sanitizer regex `\s` escape fix
- ✅ B11: `computeDeliveryCost` return 500 DA default instead of 0
- ✅ B12: `findOrCreateCustomer` ignoreDuplicates: true
- ✅ B13: CSV parser quote-aware split for newlines in quoted fields

### PR #6 — UI-layer fixes (12 fixes, -139 net lines)
- ✅ F1: BillingTab fake tiers → real 35K DZD lifetime model
- ✅ F2: ChannelsTab Instagram/Email "Coming Soon" removed
- ✅ F4: SecurityTab fake 2FA section removed
- ✅ F5: Integrations page fake platform grid removed
- ✅ F6: Sidebar "Pro" badge → drives from seller.profile.plan
- ✅ F7: AnimatedStatCard fake sparkline removed
- ✅ F8: /dashboard/risk added to Sidebar (was orphan)
- ✅ F9: CommandPalette "Open Store" → /form/[slug]
- ✅ F10: CommandPalette 7→17 routes
- ✅ F11: Inbox fake draft order fallback removed
- ✅ F12: AIAssistant fake model badge removed

### PR #7 — Security: RBAC + multi-seller attribution (4 commits)
- ✅ S3: RBAC enforced on 28 previously unprotected API routes via `requirePermission` wrapper option
- ✅ S4: `/api/store/place-order` fixed to attribute orders by `sellerSlug` (was `sellers.limit(1).single()`)
- **Last 2 critical findings resolved — 0 critical remaining**

### PR #8 — Dead code removal (5 commits, -1,090 lines net)
- ✅ D1: Removed dead smart-confirmation engine + companion + tests (595 lines)
- ✅ D2: Removed 3 dead functions + duplicate forceRoute from executor.ts (148 lines)
- ✅ D3: Removed empty health.ts stub (11 lines)
- ✅ D4: Removed unused CreateOrderModal component (288 lines)
- ✅ D8-D9, D11-D12: Minor dead code cleanups
- ⏭️ D5/D6 skipped (not dead — actively imported), D10 already fixed

### PR #9 — Weak patterns / silent bugs (6 commits, migration 031)
- ✅ W1-W4: Race conditions (fail-open, atomic run_count, TOCTOU, exchange order)
- ✅ W5, W6, W20: Security scoping (chat sessions, invited members, rate limit method)
- ✅ W7-W9: Retry + resilience (Groq fail-fast, delivery retry, Evolution URL)
- ✅ W12-W13: Business logic (refunded stub, undefined trigger guard)
- ✅ W10, W11, W14-W17, W21, W22: Code quality (8 findings)
- ✅ W18-W19: Safety (clearTestData completeness, cart guardrails)

### PR #10 — Hardcoded values → config/i18n (5 commits)
- ✅ H1: Relabeled fake "national averages" as static estimates
- ✅ H2: Removed fake "Database capacity" warning
- ✅ H3: Extracted WhatsApp templates to shared module
- ✅ H4-H5: Magic number → constant, phone placeholder → obviously fake
- ✅ H6-H7: External API URLs → env vars (Groq + 3 delivery providers)
- ✅ H8-H9: 25 inline ternaries + 7 hardcoded English → t() i18n system

### PR #11 — Test gaps + tautological tests (13 commits, +129 tests)
- ✅ T1: atomic_create_order 18-arg RPC payload assertions (tool-handlers.test.ts)
- ✅ T2: New executor.test.ts — 39 tests covering 7 triggers × 6 actions + race handling
- ✅ T3: Rewrote agent-tools.test.ts importing real 30-tool registry (was 10 fake)
- ✅ T4: 19 Shopify + WooCommerce HMAC tests (were completely untested)
- ✅ T5: Added expect() to 10 risk-score tests (were no-ops)
- ✅ T6: Extracted src/lib/order-transitions.ts TS module + 81 tests (was tautological)
- ✅ T7: Full rewrite of webhooks/store route test — 21 tests exercising real POST + real HMAC
- ✅ T8: Deleted 2 tautological Playwright cases
- ✅ T9: Verified seed file healthy (audit premise was false — 34KB clean SQL)
- ✅ T10: Externalized plaintext creds to E2E_LOGIN_EMAIL/PASSWORD env vars (fail-closed)
- ✅ T11: Mocked @/lib/ai/service in setup.ts (prevents real Groq API calls in tests)
- ✅ T12: CI now runs all 3 Playwright projects (chromium + mobile-chrome + mobile-safari)

### PR #12 — Type drift + stale docs (5 commits)
- ✅ TD4: Added 6 missing TS interfaces (AgentActivity, Channel, Conversation, Message, WebhookRetryQueue, WilayaRiskProfileRow)
- ✅ TD2+TD3: Fixed 12 field nullability mismatches (Seller 5, Product 3, Customer 4) to match live DB
- ✅ TD1: Unified OrderItem shape to accept both webhook + AI formats via optional alias fields
- ✅ TD5: Removed 1 double as-unknown-as cast (17 remain as legitimate Supabase bridges)
- ✅ DOC1: Fixed 9 stale test/audit count locations (696 tests, 81→95 findings, 11→12 PRs)
- ✅ DOC2-6,8,9: Marked ✅ in AUDIT_FINDINGS.md (already fixed in earlier doc-refresh)
- ✅ DOC8: VISION.md "Production Hardened" → "Active Development, Critical Issues Resolved"

### PR #13 — Docs sync (1 commit)
- ✅ Updated PROJECT_STATE.md + README.md test counts and audit progress to post-PR #12 state

### PR #14 — Security hardening S5-S18, M1-M4 (7 commits, migration 032 applied to live DB)
- ✅ S5: Evolution webhook verifies secret BEFORE parsing JSON body (DoS amplifier fix)
- ✅ S6: Timing-safe CRON_SECRET comparison + removed NODE_ENV=development bypass
- ✅ S7: State-changing cron GET→POST with GET delegate for Vercel Cron compat
- ✅ S8: webhook_retry_queue team access → SELECT-only (was FOR ALL)
- ✅ S9: team_members_manage WITH CHECK forbids role='owner' (privilege escalation fix)
- ✅ S11: linkUserToInvitations uses admin client (RLS was denying UPDATE)
- ✅ S12: Products column-level GRANT for anon (hide cost_price/sku/variants)
- ✅ S13: getClientIP() helper — spoofing-resistant (x-vercel-forwarded-for, full XFF chain)
- ✅ S14: getIntegrations no longer leaks credentials to browser + server-side getIntegrationCredentials()
- ✅ S15: sanitizeCSVCell() against CSV formula injection (=, +, -, @, tab, CR)
- ✅ S16: uploadProductImage size/MIME validation (5MB, image allowlist)
- ✅ S17: signUp 10-char password + 3-of-4 complexity + email regex + rate limit
- ✅ S18: next 16.2.4→16.2.9, xlsx→SheetJS CDN 0.20.3 (CVE fixes)
- ✅ M1: Fixed JWT claim name in get_dashboard_aggregates + get_analytics_data (was dead code)
- ✅ M2: Archive README explaining duplicate migration numbers
- ✅ M3: Trilingual whatsapp templates (ar+fr+en, was Arabic-only)
- ✅ M4: Already fixed by S10 (documented)
- **Migration 032 applied to live DB and verified (S8, S9, S12, M1 all active)**

### PR #15 — Medium/low audit findings M1-M20, L1-L15 (6 commits)
- ✅ M19: Team-member scoping bug — 3 routes used user.id instead of sellerId (team members saw no data)
- ✅ L8: Deterministic idempotency key (was Date.now(), defeated retry queue dedup)
- ✅ M3/M4/M5: Added zod schemas to 5 routes (notifications, dead-letters, 3 AI session routes)
- ✅ L9: Bounds-checked pagination limit/offset on expenses + returns (was unbounded)
- ✅ M20: clearTestData error checking on critical deletes (was silent)
- ✅ L6: UserProvider silent error swallow → console.error
- ✅ L7: Removed empty SKELETON_PROVIDERS dead code
- ✅ L12: Removed debug console.log in production cold start
- ✅ M18: Removed dead placeOrderSchema export from validation.ts
- ✅ L2/L4/L5/L13: A11y — 7 aria-labels, label association, alt text, 8 i18n aria-labels + 8 new locale keys
- ✅ M1/M2/L1/L15: API consistency ({ ok: true }→{ success: true }, msg→message, Arabic→English)
- ✅ L11/L14: console.log→console.error for error conditions
- ✅ M15: Extracted FETCH_TIMEOUT_MS constant (12 occurrences)
- ✅ M16: Consolidated getServiceSupabase from 5 files into shared module
- ✅ M6: Simplified SupabaseClient<any,any,any> → SupabaseClient
- ✅ L10: Removed redundant zod casts

**Remaining audit findings:** ~35 (0 critical; 0 high; ~19 medium: architectural refactors M11-M14/M17, AI duplication D5/D6, performance M9-M10; ~16 low: more a11y L3, type-safety M7/M8). See `documentation/AUDIT_FINDINGS.md` for the full report.

---

## Post-Audit Fixes (2026-06-04)

Full-stack deep audit completed: every file in `src/` read and verified. 19 findings resolved. `npx tsc --noEmit` passes with 0 errors after all changes.

### Type System

| Fix | Files | Description |
|-----|-------|-------------|
| Removed duplicate `ReturnStatus`, `ReturnReason`, `ReturnResolutionType`, `Return`, `ReturnNote` interfaces | `src/types/database.ts` | Canonical types now live exclusively in `src/types/returns.ts`; `database.ts` re-exports them |
| Removed duplicate `ExpenseCategory`, `Expense` interfaces | `src/types/database.ts` | Canonical types now live exclusively in `src/types/accounting.ts`; `database.ts` re-exports them |
| Added missing `deleted_at: string | null` field | `src/types/returns.ts` | `Return` interface now matches the DB schema soft-delete column; previously missing, causing potential TS errors in soft-delete guard code |

### Data Services

| Fix | Files | Description |
|-----|-------|-------------|
| Removed redundant JS-side `.filter((o) => !o.deleted_at)` | `src/lib/data/order-service.ts` | The Supabase query already applies `.is("deleted_at", null)`; the JS filter was making `total` (DB count) diverge from `data.length` |
| Removed dead-code `typeof options === "string"` overload branches | `src/lib/data/order-service.ts` | The TypeScript signature never allowed string input; dead branches removed |
| System return note changed to locale-neutral structured format | `src/lib/data/returns-service.ts` | Was English plain text visible in the returns timeline; now uses `return_created:type=X:resolution=Y` machine-readable format |
| `getActiveSellerId()` hoisted to top of `createExchangeOrder()` | `src/lib/data/returns-service.ts` | Was called twice (2 extra DB round-trips); now called once and reused |
| `console.error` replaced with structured JSON log | `src/lib/data/team-service.ts` | Matches project-wide logging convention; unblocks Sentry structured parsing |

### Orders Page UX

| Fix | Files | Description |
|-----|-------|-------------|
| Bulk Ship toast now shows correct count | `src/app/(dashboard)/dashboard/orders/page.tsx` | Was reading `selectedIds.size` after state clear (stale closure); now captures `count` before clear |
| Bulk Cancel parallelized with `Promise.allSettled` | `src/app/(dashboard)/dashboard/orders/page.tsx` | Was sequential `for...of await` (one round-trip per order); now matches Confirm/Ship pattern |
| Return-modal success toast i18n'd | `src/app/(dashboard)/dashboard/orders/page.tsx` | Replaced hardcoded English `"Return request created successfully"` with `t.returns.*` key |
| "Remove Item" button added to order create modal | `src/app/(dashboard)/dashboard/orders/page.tsx` | Each item row now has an X button to splice it from `form.items`; only shown when >1 item |

### Accessibility

| Fix | Files | Description |
|-----|-------|-------------|
| `tabIndex={-1}` + `autoFocus` added to `OrderSlideOut` inner panel | `src/components/dashboard/orders/OrderSlideOut.tsx` | Keyboard focus now shifts into the dialog on open; Escape key handlers and screen-reader dialog semantics work correctly |

### Database

| Fix | Applied via | Description |
|-----|-------------|-------------|
| Deprecated `auth.role() = 'service_role'` RLS policy replaced | Supabase MCP live SQL | `wilaya_risk_profiles` service-role policy now uses `TO service_role ... USING (true)` — the correct modern Supabase pattern; eliminates runtime breakage risk on Supabase engine upgrades |

### Verified (No Fix Needed)

| Item | Verified |
|------|----------|
| `sf-textarea` CSS class | Defined in `src/app/styles/components.css` lines 156–171 ✅ |
| Dual CSS token system | `tokens.css` (`data-theme="store"`) is intentionally separate from `base.css` (`data-theme="light"`) — store vs dashboard themes ✅ |

---

## Post-Audit Fixes (2026-05-22)

### Multi-Tenant Isolation Alignment & Next.js 16 Routing Compatibility

| Fix | Files |
|-----|-------|
| Centralized API wrapper context and resolution for multi-tenant isolation, automatic suspension checks, and pre-resolution of Next.js 16 route params | `src/lib/api-wrapper.ts` |
| Eliminated `await params` redundancy and handled pre-resolved parameter mapping | `src/app/api/expenses/[id]/route.ts`, `src/app/api/returns/[id]/notes/route.ts`, `src/app/api/returns/[id]/route.ts` |
| Standardized team routing dynamic parameters and narrowed `memberId` to plain string | `src/app/api/team/[id]/route.ts` |
| Added dedicated wrapper tests verifying isolation, roles, suspension enforcement, and fallback mechanics | `src/lib/__tests__/api-wrapper.test.ts` |

---

## Post-Audit Fixes (2026-05-12)

Cross-layer audit completed: DB schema ↔ TypeScript types ↔ service layer ↔ API routes ↔ documentation.

### Type Safety

| Fix | Files |
|-----|-------|
| `DeliveryStatus` expanded 6 → 10 values (matched live DB CHECK constraint; baseline reconciled in PR #2) | `src/types/database.ts`, `src/lib/delivery/adapters.ts` |
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

**The live DB is fully described by `supabase/migrations/000_baseline.sql`.** All prior patch migrations (001–029) have been consolidated into the baseline. The archive files in `supabase/migrations/archive/` are historical record only — do NOT re-apply them (they will error because the objects already exist in the baseline).

To set up a fresh database: apply ONLY `000_baseline.sql` in your Supabase SQL Editor.

| Migration file          | Status        | Purpose                                                          |
| ----------------------- | ------------- | ---------------------------------------------------------------- |
| `000_baseline.sql`      | ✅ Canonical  | All 25 tables, 15 functions, 14 triggers, ~50 indexes, RLS, grants |
| `archive/001-029`       | 📦 Historical | Consolidated into baseline; kept for audit trail                 |
| `seeds/whatsapp_templates.sql` | ✅ Active | 4 default Arabic templates (auto-seeded on onboarding)           |

**Baseline reconciliation (2026-06-19, PR #2):** 3 drifts between baseline and live DB were fixed — `products UNIQUE(seller_id, name)`, `daily_analytics_reports UNIQUE(seller_id, report_date)`, and `deliveries.status` CHECK expanded from 7 to 10 values. The baseline now matches the live DB exactly.

---

## Key Decisions Log

| Date       | Decision                                                                                | Rationale                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-06-04 | Full-stack deep audit (19 findings) + full remediation pass | Exhaustive read of every file in `src/`. Resolved all type duplications, parallelised bulk operations, fixed deprecated RLS policy live on DB, added missing soft-delete type field, i18n'd hardcoded English strings, added Remove Item UX, fixed accessibility on slideout. `tsc --noEmit` passes 0 errors. |
| 2026-05-23 | Phase 6: Full i18n/UX audit — locale-aware formatting, CSS progressive enhancement, centralized phone utils, CSP strict-dynamic | Eliminates English leakage in Arabic mode, ensures RTL responsiveness, protects against XSS with modern CSP, unifies divergent phone validation logic |
| 2026-05-22 | Centralized Multi-Tenant Alignment & Next.js 16 Dynamic Routing type compatibility       | Prevents team members' personal ID usage as seller ID across 17+ APIs, enforces suspension at middleware level, and resolves strict static type checks cleanly. |
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
