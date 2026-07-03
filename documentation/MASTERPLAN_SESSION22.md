# SahelFlow — Masterplan: Path to Flawless (Session 22+)

> **Created:** 2026-07-02 (post-Session 21)
> **Author:** Z.ai Coding Agent (based on real-user audit + founder feedback)
> **Goal:** Fix every known defect, achieve top-tier UI/UX, make the app flawless for real Algerian COD sellers.
> **Method:** "Done" = browser-verified with real data (Session 20 method). No self-awarded checkmarks.

---

## Executive Summary

The app has a solid foundation (encryption, auth, Prisma schema, UI framework) but has **accumulated definition drift** across 20 sessions: three different "revenue" calculations, a half-migrated blacklist feature, inconsistent responsive behavior, and missing mobile navigation. Additionally, the founder has identified that **desktop window resize/responsiveness is poor** and wants **full navigation + CRUD + micro-interactions** to be top-tier.

This masterplan is organized into **7 phases**, prioritized by impact: critical bugs first, then calculation consistency, then responsive/UX, then navigation depth, then final polish.

**Estimated scope:** ~40-60 commits across 6-8 focused sessions.

---

## PHASE 1: Critical Bug Fixes (must fix before any real user)

**Goal:** Eliminate the 2 "known broken" defects that silently break features.

### 1.1 Fix customer blacklist (CRITICAL)
**Problem:** `blacklistCustomer()` writes `"[BLACKLISTED]"` to notes but never sets `isBlacklisted: true`. Risk engine reads the column, never sees blacklisted customers.

**Files:**
- `src/lib/data/customers/service.ts` — `blacklistCustomer()` + `unblacklistCustomer()` must set `isBlacklisted: true/false` (not just tag notes)
- `src/lib/risk-engine/scoring.ts` — verify it reads `isBlacklisted` (it does, lines 218/345/383)
- `src/app/(dashboard)/customers/[id]/page.tsx` — add "Blacklist" / "Unblacklist" button
- `src/app/(dashboard)/customers/page.tsx` — add blacklist filter + visual indicator (red badge)
- `src/components/customers/customer-row-actions.tsx` — add blacklist toggle to row menu
- Tests: fix the test that cheats by setting `isBlacklisted: true` directly — make it call `blacklistCustomer()`

**Acceptance:** Blacklisting a customer → next order from that customer gets the risk penalty. UI shows the blacklist status. Tests verify via the real function.

### 1.2 Fix order status workflow discoverability (CRITICAL)
**Problem:** Draft orders show only "Cancel" in actions. The "Mark as Pending" button is hidden (empty `labelKey`). Bulk "Confirm Selected" on drafts fails.

**Files:**
- `src/lib/order-transitions.ts` — verify the state machine (draft → pending → confirmed)
- `src/components/orders/order-status-actions.tsx` — fix the `labelKey` filter (line 31) so draft→pending button shows
- `src/app/(dashboard)/orders/page.tsx` — bulk action should respect valid transitions (gray out "Confirm" on drafts, or auto-advance draft→pending→confirmed)
- Add i18n keys for the missing `labelKey` (check `src/lib/i18n/locales/*/orders.json`)

**Acceptance:** A seller on a draft order sees clear next-step actions. No invalid-transition errors on bulk actions. Every status has a visible path forward.

### 1.3 Fix PIN min-length mismatch
**Problem:** UI allows 4-7 chars, server requires 8.

**Files:**
- `src/app/setup/page.tsx:35` — change `min={4}` to `min={8}` + add real-time validation
- `src/app/login/page.tsx` — add `minLength={8}` to the PIN input
- Add a strength indicator (optional but top-tier)

**Acceptance:** UI and server agree on 8-char minimum. Setup rejects short PINs client-side with a clear message.

---

## PHASE 2: Calculation Consistency (trust-breaking fixes)

**Goal:** One definition per metric. Same number on every page.

### 2.1 Unify "revenue" definitions
**Problem:** Dashboard = status≠cancelled (includes draft), Analytics = excludes draft+cancelled, Accounting = delivered only. Three different numbers for the same data.

**Decision needed (ask founder):** Which definition is "real revenue"?
- **Option A:** Gross Revenue = all non-cancelled orders (what was ordered)
- **Option B:** Realized Revenue = delivered orders only (what was actually collected)
- **Recommendation:** Show BOTH, clearly labeled:
  - Dashboard: "Gross Revenue (orders)" + "Realized Revenue (delivered)"
  - Analytics: same two metrics
  - Accounting: "Realized Revenue" (delivered) — this is the financial truth

**Files:**
- `src/lib/data/dashboard.ts` — `getDashboardStats()` — add `realizedRevenue` alongside `grossRevenue`
- `src/lib/data/analytics-data.ts` — align with dashboard definitions
- `src/lib/data/accounting-data.ts` (or wherever accounting revenue is computed) — label clearly as "Realized"
- All three pages: show both metrics with tooltips explaining the difference
- StatCard: add a `tooltip` prop for the info icon

**Acceptance:** A seller sees the same two numbers (Gross + Realized) consistently across Dashboard, Analytics, Accounting. Each has a tooltip explaining what it means.

### 2.2 Fix customer stats discrepancy
**Problem:** List page shows cached `orderCount`/`totalSpent` (only delivered). Detail page computes from all orders. Two different numbers.

**Files:**
- `src/lib/data/customers/service.ts` — `listCustomers()` should compute stats from all orders (not rely on cached columns that only update on delivery)
- OR: update the cached columns on every order status change (not just delivery)
- `src/app/(dashboard)/customers/page.tsx` — verify stats match detail page
- `src/app/(dashboard)/customers/[id]/page.tsx` — verify

**Decision:** Use "total orders" + "total order value" (all statuses except cancelled) + "delivered orders" + "delivered value" — show both on detail, summary on list.

**Acceptance:** List and detail pages show consistent numbers.

### 2.3 Remove the 60% COGS estimate
**Problem:** Accounting uses `item.unitPrice * 0.6` when no cost price is set. Silent guess.

**Files:**
- `src/app/(dashboard)/accounting/page.tsx:56` — remove the `* 0.6` fallback
- Show "Cost not set" or `0` with a warning banner: "N products have no cost price — COGS is understated"
- Add a bulk "set cost price" flow on the products page

**Acceptance:** No silent estimates. If cost is missing, it's visible. Seller is prompted to set costs.

### 2.4 Fix analytics UTC date bucketing
**Problem:** `toISOString().slice(0,10)` uses UTC. A 23:30 Algerian order appears in tomorrow's bucket.

**Files:**
- `src/lib/data/analytics.ts:200-206` — replace UTC bucketing with local-time bucketing
- Use a helper: `new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,10)` (local date string)
- Or use `date-fns`'s `format(date, 'yyyy-MM-dd')` which respects local time
- Apply consistently across all date-bucketing code

**Acceptance:** A 23:30 order appears in today's analytics, matching the dashboard.

### 2.5 Auto-seed WilayaRiskProfile on setup
**Problem:** Wilaya risk factor silently disabled on fresh DB until manual `?seed=true`.

**Files:**
- `src/app/api/auth/setup/route.ts` — after setup, auto-seed WilayaRiskProfile (call the existing seed function)
- Or: add a migration that runs on first app launch
- `src/lib/wilaya-risk/seed.ts` — extract the seed logic so it's callable from setup

**Acceptance:** Fresh install → wilaya risk profiles are present without manual action.

---

## PHASE 3: Desktop Window Responsiveness (founder request #1)

**Goal:** The app looks and works flawlessly at every window size from 1024×600 (Tauri min) to 4K maximized.

### 3.1 Fix Tauri window config
**Problem:** minWidth=1024 but sidebar is `lg:flex` (1024px). At exactly 1024px, sidebar shows but content is cramped. No mobile fallback in the Tauri window.

**Files:**
- `src-tauri/tauri.conf.json` — set `minWidth: 800`, `minHeight: 500` (allow smaller windows for testing)
- Consider `maximized: true` on first launch (most desktop apps open maximized)

### 3.2 Add mobile sidebar (Sheet) — currently MISSING
**Problem:** `dashboard-layout.tsx` comment says "sidebar hidden on mobile, Sheet handles it" but there's NO Sheet component. Below `lg` (1024px), the sidebar vanishes with no replacement.

**Files:**
- `src/components/layout/dashboard-layout.tsx` — add a Sheet-based mobile sidebar
- Use the existing `Sheet` component (`src/components/ui/sheet.tsx`)
- Trigger: hamburger menu in the topbar (already exists at `topbar.tsx:124`)
- Content: reuse the `<Sidebar>` component inside the Sheet

**Acceptance:** Resize window below 1024px → hamburger menu appears → click → sidebar slides in. Full navigation accessible.

### 3.3 Responsive table audit (all table pages)
**Problem:** Only 2/16 pages use `overflow-x-auto` or `table-scroll`. Other tables may clip or overflow.

**Files:** All pages with tables:
- `orders/page.tsx`, `customers/page.tsx`, `products/page.tsx`, `deliveries/page.tsx`, `returns/page.tsx`, `accounting/page.tsx`, `risk/page.tsx`
- Wrap every `<Table>` in `<div className="table-scroll-container">` (the CSS utility already exists in globals.css:774)
- Test at 800px, 1024px, 1280px, 1920px widths

**Acceptance:** All tables scroll horizontally on narrow windows without breaking layout. Fade indicator shows when scrollable.

### 3.4 Responsive card grid audit
**Problem:** Card grids use `.card-grid-*` (fixed in Session 21) but some pages may still have raw grids or fixed column counts.

**Files:** Re-audit all pages after Phase 2 changes. Ensure every stat-card grid uses `.card-grid-4` + `stagger-grid`.

### 3.5 Fix double-scrollbar + content overflow
**Problem:** `<main>` has `overflow-y-auto` but some pages also have their own scroll containers, causing double scrollbars.

**Files:**
- `src/components/layout/dashboard-layout.tsx` — ensure only `<main>` scrolls
- Per-page: remove inner `overflow-y-auto` / `max-h-*` on page-level containers (keep them only for inner panels like chat)

### 3.6 Test matrix for window sizes
Create a test checklist (run via `sf-browser` at each size):
- 800×500 (Tauri min)
- 1024×600 (old min)
- 1280×800 (default)
- 1440×900 (laptop)
- 1920×1080 (desktop)
- 2560×1440 (QHD)
- 3840×2160 (4K — check font/spacing scaling)

**Acceptance:** Every page renders correctly at every size in the test matrix. `sf-browser` gets a `--viewport` flag for automated testing.

---

## PHASE 4: Navigation & CRUD Depth (founder request #2)

**Goal:** Every page has full CRUD, micro-interactions, and engaging navigation. No dead-ends.

### 4.1 Complete CRUD for every entity
**Audit current state:**

| Entity | List | Create | Read (detail) | Update | Delete | Bulk actions |
|---|---|---|---|---|---|---|
| Orders | ✅ | ✅ | ✅ [id] | ✅ | ✅ | partial (confirm fails on draft) |
| Customers | ✅ | ✅ | ✅ [id] | ✅ | ❓ | ❌ |
| Products | ✅ | ✅ | ✅ [id] | ✅ | ❓ | ❌ |
| Deliveries | ✅ | ✅ (from order) | ❌ (no detail page) | ❓ | ❌ | ❌ |
| Returns | ✅ | ✅ | ❌ (no detail page) | ❓ | ❌ | ❌ |
| Expenses | ✅ | ✅ | ❌ | ❓ | ❓ | ❌ |
| Storefronts | ✅ | ✅ | ✅ [id] | ✅ | ✅ | ❌ |
| Automations | ✅ | ✅ | ❌ | ✅ (toggle) | ❓ | ❌ |
| Categories | ❌ (no page) | ❌ | ❌ | ❌ | ❌ | ❌ |

**Tasks:**
- Add **delivery detail page** (`/deliveries/[id]`) — tracking history, status timeline, linked order
- Add **return detail page** (`/returns/[id]`) — return reason, refund status, linked order + customer
- Add **categories management** (`/products` → categories tab, or `/settings/categories`) — CRUD for product categories
- Add **bulk actions** to every list page: select-all + bulk delete/archive/export
- Verify every entity has: create button, detail view, edit, delete (with confirm dialog)

### 4.2 Micro-interactions & feedback
**Goal:** Every action gives immediate, delightful feedback.

**Tasks:**
- **Toast notifications** on every CRUD action (create/update/delete) — already have Sonner, audit all actions
- **Optimistic updates** on: order status change, customer blacklist toggle, product stock edit
- **Skeleton loaders** on every async list (already have `PageLoading`, verify all pages)
- **Empty state CTAs** — every empty state has a "Create your first X" button (audit + fix)
- **Hover states** — every clickable card/row has a subtle lift or bg change
- **Keyboard shortcuts** — Cmd+K (command palette, exists), add: `N` for new order, `/` for search focus, `G` then letter for navigation (partially exists)
- **Confirmation dialogs** on destructive actions (delete, cancel order) — audit all
- **Undo** on delete (optional but top-tier — 5-second undo toast)

### 4.3 Navigation depth & breadcrumbs
**Goal:** Never get lost. Always know where you are and how to go back.

**Tasks:**
- **Breadcrumbs** on all detail pages: `Orders > ORD-0001` (component exists at `src/components/shared/breadcrumbs.tsx`)
- **Back buttons** on detail pages (mobile especially)
- **Related-entity links** — order detail links to customer + product + delivery; customer detail links to their orders; etc.
- **Quick-add menu** in topbar — dropdown with "New Order", "New Customer", "New Product" (accessible from any page)
- **Recent items** in command palette — last 5 viewed orders/customers

### 4.4 Search & filter on every list
**Goal:** Find anything fast.

**Tasks:**
- **Search bar** on orders, customers, products, deliveries (some exist, audit all)
- **Filters**: status, date range, wilaya, delivery provider (add where missing)
- **Saved filters** — let sellers save their common filter combos (localStorage)
- **Sort** on every column (some exist, audit all)

### 4.5 Inline editing
**Goal:** Edit without leaving the page.

**Tasks:**
- **Inline edit** on: order status (dropdown, exists), product stock (click to edit), customer phone (click to edit)
- **Quick-add product variant** inline on product detail
- **Drag-to-reorder** on: storefront product selection, automation priority

---

## PHASE 5: Visual Consistency & Polish

**Goal:** 10/10 from VLM. Every pixel intentional.

### 5.1 Icon system consistency
**Problem:** VLM flagged "inconsistent icon styling" across metric cards.

**Tasks:**
- Audit all icon usage: same size (h-5 w-5 for nav, h-4 w-4 for cards, h-6 w-6 for headers)
- Same color treatment: `text-muted-foreground` default, `text-primary` on active/emphasis
- No mixing of outlined/filled icons (pick one style — Lucide is outlined)

### 5.2 Button system consistency
**Tasks:**
- Audit every `<Button>` — no custom `bg-*` overrides (already clean per audit)
- Ensure consistent sizing: `size="sm"` for inline actions, default for primary, `size="lg"` for forms
- Primary action per page should be obvious (one `variant="default"` button, rest outline/ghost)

### 5.3 Color & contrast audit
**Tasks:**
- Every text on dark background meets WCAG AA (4.5:1)
- Fix the "En direct" badge contrast (VLM flagged it blends into dark bg)
- Ensure status colors (delivered=green, returned=orange, refused=red) are consistent

### 5.4 Typography final pass
**Tasks:**
- Verify the heading hierarchy (fixed in Session 21) renders correctly on all pages
- Check line-height consistency in cards (some have 1.5, some 1.25)
- Arabic font (Amiri) rendering — verify RTL pages look right

### 5.5 Animation & motion
**Tasks:**
- Page transitions (Framer Motion route transitions)
- Stagger animations on card grids (fixed in Session 21 — verify all)
- Hover lift on cards (already exists — audit consistency)
- Loading shimmer on skeletons (already exists — verify)

---

## PHASE 6: Feature Completion

**Goal:** No half-built features. Everything either works or is clearly "coming soon."

### 6.1 Automations engine
**Problem:** Page exists but says "execution will be available once WhatsApp and AI integrations are connected." It's a UI shell.

**Decision needed:** Implement the execution engine, or hide the page until it's ready?

**If implement:**
- Trigger system: on order created, on order delivered, on customer blacklisted, etc.
- Action system: send WhatsApp message, create follow-up order, add note
- Execution log: show when automations fired
- Requires: WhatsApp sidecar running (founder needs to scan QR)

**If hide:** Move to a "Coming Soon" section, remove from primary nav.

### 6.2 DHD delivery provider
**Problem:** Offered in create-shipment dialog but missing from credentials settings panel.

**Files:**
- `src/components/settings/delivery-credentials-panel.tsx` — add DHD section
- `src/lib/integrations/delivery/dhd.ts` — verify adapter exists and works

### 6.3 WhatsApp integration
**Problem:** Sidecar exists but needs QR scan. Inbox may be empty without it.

**Tasks:**
- Verify the inbox shows a "Connect WhatsApp" CTA when sidecar is down
- Add a setup guide in onboarding for WhatsApp

### 6.4 Google Sheets / YouCan / Shopify integrations
**Tasks:**
- Verify each has a proper setup flow in settings
- Add "connection status" indicators

---

## PHASE 7: Verification & Release Prep

### 7.1 Full test suite
- Run `sf-verify` (full, with tests) — fix all failures
- Fix the 5 skipped tests (license + yalidine mock-wiring)
- Expand coverage to pages/components/API routes (currently only src/lib/)

### 7.2 Playwright e2e
- `bunx playwright install chromium`
- `bun run test:e2e` — fix all failures
- Add e2e tests for the critical flows: setup → create order → deliver → see in dashboard

### 7.3 Tauri build verification
- `bun run tauri:build` on founder's machine
- Verify the installer works on a clean Windows install
- Verify auto-update works (if a previous version is installed)

### 7.4 Real Darija validation
- Get 50+ real WhatsApp messages
- Run through Gemini extraction
- Measure accuracy + tune prompts

### 7.5 Final VLM pass
- Run VLM on all 16 pages
- Target: 8.5+/10 average (was 7/10)
- Fix any remaining per-page issues

### 7.6 Documentation sync
- Update PROJECT_STATE, BUILD_LOG, CHANGELOG
- Update AGENT_HANDOFF for next session
- Run `sf-audit` to verify no drift

---

## Execution Priority

| Phase | Sessions | Can parallelize? | Blocks real users? |
|---|---|---|---|
| 1 (Critical bugs) | 1 session | No | YES — must fix first |
| 2 (Calculations) | 1-2 sessions | Partially (2.1-2.5 are independent) | YES — trust-breaking |
| 3 (Responsive) | 1-2 sessions | Yes (after 3.1) | No, but high annoyance |
| 4 (CRUD depth) | 2-3 sessions | Yes (per-entity) | No, but limits usefulness |
| 5 (Visual polish) | 1 session | Yes (per-page) | No |
| 6 (Feature completion) | 1-2 sessions | Partially | No, but incomplete feel |
| 7 (Verification) | 1 session | No | Final gate |

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6 → 7

**Fast path to "real user ready":** 1 + 2 + 3 (3 sessions) gets the app trustworthy + usable. 4 + 5 make it delightful. 6 + 7 make it shippable.

---

## Founder Decisions Needed

Before I start, I need your call on these:

1. **Revenue definition** (Phase 2.1): Show both Gross + Realized, or pick one?
2. **Automations** (Phase 6.1): Implement the engine now, or hide the page?
3. **Categories page** (Phase 4.1): New page, or section in products/settings?
4. **Undo on delete** (Phase 4.2): Worth the complexity, or skip for now?
5. **Priority**: Should I start with Phase 1+2 (bugs + calculations) this session, or do you want responsive (Phase 3) first since you flagged it?

---

_This is a living document. Update after each phase._
