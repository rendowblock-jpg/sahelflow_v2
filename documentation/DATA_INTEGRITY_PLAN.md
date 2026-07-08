# SahelFlow — Data Integrity & Flawless-Flows Plan

> **Goal:** Guarantee that every interaction + data flow is flawless — when an
> order is created/modified, it reflects correctly everywhere (orders list,
> dashboard, analytics, deliveries, returns, notifications, COD reconciliation,
> AI tools, reports). No silent drift. No double-counting. No orphaned data.
>
> **Authored:** Session 35 (2026-07-08), after a deep 2-subagent investigation
> mapping every order/delivery/return data flow + auditing all 1257 tests.
> See `worklog.md` Task IDs P0-A + P0-B for the raw findings.

---

## Executive summary

The 1257/1257 test count is real but **misleading as a "flawless" signal**:
- Service layer + pure functions: ~85% covered.
- API route layer: **1 of 111 routes tested (0.9%)**.
- **9 of 18 services in `src/lib/data` have ZERO tests** — including COD
  reconciliation, refunds, conversation management, dashboard, analytics-v2.
- E2e: 4 specs, but only `setup.spec.ts` truly drives a browser. Zero
  cross-page golden-path coverage.
- **5 data-flow BUGS found** (not just gaps) — see Phase 1.

This plan closes every gap in 6 phases over ~5 sessions. Each phase is
independently shippable + verifiable.

---

## Phase 1 — Fix the 5 data-flow bugs (HIGHEST PRIORITY)

These are real bugs in production code, not test gaps. Each causes silent
financial or inventory drift. Fix before anything else.

### 1.1 Return + Refund double-counting (financial bug)
**Bug:** Completing a Return restores stock + decrements `customer.totalSpent`.
Issuing a Refund on the same order ALSO restores stock + decrements
`totalSpent` — because the Return workflow doesn't flip `order.status` to
"returned", so `refund-service.createRefund` sees `status==="delivered"` and
applies its own stock restore + stat reversal. **Result: stock + customer
stats drift by 2× per returned+refunded order.**

**Files:**
- `src/app/api/returns/[id]/route.ts` — when `status="completed"`, call
  `orderService.updateStatus(..., "returned", {actor:"system"})` INSTEAD of
  the inline stock-restore + customer-stat-decrement. This makes the Return
  flow go through the canonical state machine (single source of truth).
- `src/lib/data/refund-service.ts:92-95` — add a guard: if `order.status` is
  already "returned" (Return was completed first), skip the inline status
  flip + stock restore (the Return flow already did it). Only create the
  Refund row + decrement `totalSpent` by the refund amount.

**Test:** `src/lib/data/__tests__/return-refund-integrity.test.ts` —
seed order → deliver → complete Return → issue Refund → assert stock restored
exactly once, `totalSpent` decremented exactly once, order status "returned".

### 1.2 `PATCH /api/delivery/[id]` skips side effects (silent drift)
**Bug:** When a delivery is manually marked "delivered" via this route, the
order flips to "delivered" inline — but `order.deliveredAt` is NEVER set,
`customer.orderCount/totalSpent` are NOT incremented, no OrderChange ledger
entry, no `order.delivered` automation trigger fires. **Result: dashboard
"realized revenue today" (filters by `deliveredAt`) undercounts; customer
stats drift; automations don't fire.**

Same bug for `returned`/`refused` via this route: stock restored but no
trigger, no ledger attribution (uses actor "system").

**Fix:** `src/app/api/delivery/[id]/route.ts:65-96` — replace the inline
`tx.order.update({status})` + inline stock restore with a call to
`orderService.updateStatus(..., orderStatus, {actor:"system", tx})` AFTER
the tx commits (the delivery update stays in the tx; the order transition
goes through the canonical path, like `/api/delivery/sync` already does).

**Test:** extend `delivery-service.test.ts` + new
`src/app/api/__tests__/delivery-patch.test.ts` — mark delivery "delivered"
→ assert `order.deliveredAt` set, `customer.orderCount` incremented,
OrderChange ledger entry exists.

### 1.3 Storefront/import/AI/e-commerce orders bypass `orderService.create`
**Bug:** 4 of 5 order-creation paths skip the canonical service → no
`OrderChange` "created" ledger entry, no `order.created` automation trigger,
no auto risk assessment. **Result: storefront/import/AI/sync orders have no
timeline "created" entry, automations don't fire for them, they have no risk
score.**

**Fix:** Extract `orderService.create` to accept an optional `tx` (Prisma
transaction client) so it can be called inside existing transactions. Then:
- `src/app/api/storefront/submit/route.ts:181-197` — call
  `orderService.create({tx}, ...)` instead of `tx.order.create(...)`.
- `src/app/api/import/orders/route.ts:125-146` — same.
- `src/lib/integrations/ecommerce/sync-engine.ts:318` — same.
- `src/lib/ai/chat/tools/core-tools.ts:255-270` — same (AI `create_order`).
- `src/lib/integrations/ecommerce/sync-engine.ts:221` (cancellation
  propagation) — call `orderService.updateStatus(..., "cancelled")` instead
  of raw `db.order.update({status:"cancelled"})` so stock is restored + trigger fires.

**Test:** `src/lib/data/__tests__/order-create-paths.test.ts` — for each
path, assert the order has an OrderChange "created" entry + (with an
automation configured) the trigger fires.

### 1.4 `POST /api/delivery/create` skips `order.shipped` trigger
**Bug:** Creating a shipment flips the order to "shipped" inline but doesn't
fire `dispatchTrigger("order.shipped")`. **Result: "ship → WhatsApp notify"
automations never fire when shipment is created via this route** (the most
common shipment path). AI `create_shipment` is the ONLY path that fires it.

**Fix:** `src/app/api/delivery/create/route.ts:121-132` — after the tx
commits, call `dispatchTrigger("order.shipped", {orderId, orderNumber, ...})`
(fire-and-forget, like `orderService.updateStatus` does).

**Test:** extend `src/lib/automations/__tests__/order-triggers.test.ts` (new)
— configure a `order.shipped` automation → create shipment via API → assert
the automation log entry appears.

### 1.5 Orders page "active orders" stat capped at 200
**Bug:** `src/app/(dashboard)/orders/page.tsx:124-126` computes "active
orders" from `allOrders` (which is `take:200`), so shops with >200 orders
undercount. The "pending" stat next to it uses the uncapped `groupBy` — so
two cards on the same page disagree.

**Fix:** `src/app/(dashboard)/orders/page.tsx:124-126` — compute active count
from the uncapped `counts` groupBy: `counts.pending + counts.confirmed +
counts.shipped`.

**Test:** seed 250 orders (50 pending, 50 confirmed, 50 shipped, 100
delivered) → render orders page → assert "active" stat = 150, not 150-of-200.

---

## Phase 2 — Fix the build ship-blocker (unblocks e2e + prod deploy)

**Bug:** `bun run build` (Turbopack) fails with 6 errors —
`src/hooks/use-license.ts` (client) imports `validateLicense`/`issueTrial`
from `src/lib/license/license-service.ts` (server), which transitively pulls
`db.ts` → `master-key.ts` (`import "server-only"` + `fs`) into the client
bundle.

**Fix:** Split `license-service.ts`:
- `src/lib/license/license-client.ts` — client-safe: signature verify
  (`@noble/ed25519` is browser-safe), `issueTrial` invariants,
  `getStatusLabel`, `isLicenseValid` (pure, no DB — takes a `SignedLicense`
  arg). `use-license.ts` imports ONLY from here.
- `src/lib/license/license-server.ts` — DB-backed: `validateLicense` (reads
  Setting), `requireLicense`, `hasFeature`, `setCachedLicenseResult`. Called
  only from API routes / server components.
- `src/hooks/use-license.ts` — fetches license from `/api/license/sync`
  (already exists) + verifies client-side via `license-client.ts`. No direct
  import of server code.

**Test:** `bun run build` exits 0. Existing 22 license tests still pass
(adjust imports). New test: `use-license.test.ts` — mount hook with a mocked
fetch → assert no server-only module is referenced (static analysis or
bundle check).

**Why this is Phase 2 not Phase 1:** the bugs in Phase 1 cause silent data
drift in dev mode (where the founder tests). The build blocker blocks prod
deploy + Playwright-against-prod-build, but dev mode works. Fix the data
bugs first.

---

## Phase 3 — Cross-table data-integrity test suite (the "100% sure" backbone)

Add a new vitest file that seeds a known scenario and asserts cross-table
consistency after every operation. This is the single highest-leverage test
addition — it catches drift bugs that unit tests miss.

**File:** `src/lib/data/__tests__/data-integrity.test.ts`

**Scenarios (each a `describe` block):**

1. **Order create → appears everywhere**
   - Seed 1 customer + 1 product (stock 10).
   - `orderService.create(...)` → assert: order exists, OrderChange "created"
     entry exists, product stock UNCHANGED (stock deducts at confirm, not
     create), dashboard `ordersToday` = 1, analytics `totalOrders` = 1,
     orders-page groupBy count = 1.

2. **Order confirm → stock deducted + trigger fires**
   - Create → confirm → assert: product.stock = 5 (deducted by quantity),
     OrderChange "status_change" entry, `order.confirmed` automation fires
     (if configured), confirmation-queue no longer includes this order.

3. **Order ship → delivery created + trigger fires**
   - Confirm → create delivery → assert: order.status="shipped",
     `order.shippedAt` set, Delivery row exists, `order.shipped` trigger
     fires, dashboard `pendingDeliveries` unchanged (already shipped).

4. **Order deliver (via delivery/sync) → customer stats + deliveredAt + trigger**
   - Ship → sync delivery "delivered" → assert: order.status="delivered",
     `order.deliveredAt` set, `customer.orderCount` = 1, `customer.totalSpent`
     += totalPrice, OrderChange entry, `order.delivered` trigger fires,
     dashboard `realizedRevenueToday` += totalPrice.

5. **Order deliver (via delivery/[id] PATCH) → same as #4** (after Phase 1.2 fix)
   - Assert identical side effects regardless of which path delivered the order.

6. **Order return (canonical) → stock restored + stats reversed + trigger**
   - Deliver → `orderService.updateStatus(..., "returned")` → assert:
     product.stock restored, `customer.orderCount` = 0, `customer.totalSpent`
     -= totalPrice, OrderChange entry, `order.returned` trigger fires.

7. **Return + Refund (Phase 1.1 fix) → no double-counting**
   - Deliver → complete Return → issue Refund → assert: stock restored
     EXACTLY ONCE, `totalSpent` decremented EXACTLY ONCE, order.status =
     "returned", Refund row exists, `getTotalRefunded` = refund amount.

8. **Stale-queue consistency: bell vs confirmation-queue page vs API**
   - Seed 3 pending orders: 1 created 3h ago, 2 created 1h ago.
   - Assert: `/api/notifications` stale-queue count = 1, confirmation-queue
     page `staleCount` = 1, `/api/orders/confirmation-queue` `staleCount` = 1.

9. **Low-stock consistency: bell vs products page vs dashboard**
   - Seed 5 products: 2 active+low-stock, 1 inactive+low-stock, 2 active+healthy.
   - Assert: products-page low-stock count = 2 (after Phase 1 fix to exclude
     inactive — or document the discrepancy), dashboard low-stock = 2, bell
     low-stock list = 2.

10. **Revenue formula consistency (after Phase 4 decision)**
    - Seed orders: 1 delivered-today, 1 pending-today, 1 returned-today,
      1 cancelled-today.
    - Assert: dashboard "gross revenue today" = pending + delivered (excludes
      cancelled), dashboard "realized revenue today" = delivered only,
      analytics "total revenue (today)" = same as gross, accounting "revenue
      (today)" = delivered only. **Document each variant** — the test encodes
      the chosen definitions.

11. **COD reconciliation arithmetic**
    - Seed: 2 delivered orders (1 collected, 1 not), 1 shipped+collected.
    - Assert: `getCodReconciliationSummary` → deliveredCount=2, collectedCount=3
    (shipped+collected counts), pendingRemittance = sum of collected+not-remitted.

12. **Notifications bell i18n (protects the Task 8 fix)**
    - Seed orders + set locale cookie to "ar".
    - Assert: `/api/notifications` returns Arabic strings for all 5 types +
      relative time. Repeat for "fr" + "en".

13. **PII survives backup → wipe → restore**
    - Seed customer with encrypted phone → backup → wipe DB → restore →
      assert: customer phone decrypts correctly, blind-index search works.

14. **E-commerce sync doesn't duplicate (existing sync-dedup test) + creates ledger entry (Phase 1.3 fix)**
    - Sync order → re-sync → assert: 1 order, 1 OrderChange "created" entry,
      customer not duplicated.

15. **Multi-shop isolation**
    - Create shop A + shop B, seed orders in each, switch active shop.
    - Assert: orders page shows only active shop's orders, dashboard counts
      only active shop, analytics only active shop. (Depends on `db.ts`
      routing — verify the `invalidateShopClient` works.)

**Infrastructure:** use the existing `src/lib/data/__tests__/helpers.ts` +
`src/app/api/__tests__/helpers.ts`. For API-route assertions, use
`mockPost`/`mockGet` + the raw DB for verification. For page-level
assertions, call the page's server-component function directly (it's just an
async function) + assert on the rendered props.

**Estimated:** ~800 lines, 1 session. Runs in the existing vitest suite
(hermetic, ~15s added).

---

## Phase 4 — Consolidate revenue + delivery-rate formulas (kill the drift)

The investigation found **6 different revenue formulas** + **3 different
delivery-rate formulas** across dashboard/analytics/accounting/reports/AI.
This causes legitimate confusion ("why does the dashboard say 50k but
analytics says 42k?").

**Step 1 — decide the canonical definitions** (with the founder):
- **Gross revenue (period)** = sum of `order.totalPrice` where
  `createdAt in period` AND `status NOT IN [cancelled, draft]`. (Orders that
  were placed + not cancelled/draft.)
- **Realized revenue (period)** = sum of `order.totalPrice` where
  `deliveredAt in period` AND `status = "delivered"`. (Money actually
  collected via delivery.)
- **Net revenue (period)** = realized revenue − refunds in period − delivery
  costs in period. (For accounting P&L.)
- **Delivery rate (period)** = `delivered orders in period / total orders in
  period` (by `order.status`, NOT by `delivery.status` — because not all
  orders have a Delivery row). Dashboard's all-time delivery rate is a
  SEPARATE metric (courier performance) — label it "courier delivery rate".

**Step 2 — extract to `src/lib/data/metrics.ts`:**
```ts
export function grossRevenue(db, period): Promise<number>
export function realizedRevenue(db, period): Promise<number>
export function netRevenue(db, period): Promise<number>
export function deliveryRate(db, period): Promise<{rate, delivered, total}>
export function courierDeliveryRate(db): Promise<{rate, delivered, total}> // all-time, from Delivery table
```

**Step 3 — refactor every read-site to call these:**
- `src/lib/data/stats-service.ts` (dashboard) → `grossRevenue(today)` +
  `realizedRevenue(today)`.
- `src/lib/data/analytics.ts` (analytics page) → `grossRevenue(period)`.
- `src/lib/data/analytics-v2.ts` → use the canonical exclusions (remove the
  returned/refused exclusion — those are in "gross").
- `src/app/(dashboard)/accounting/page.tsx` → `netRevenue(period)`.
- `src/lib/reports/daily-report.ts` → `grossRevenue(yesterday)`.
- `src/lib/ai/chat/tools/core-tools.ts:get_stats` → `grossRevenue(allTime)`
  + label it "gross".

**Step 4 — label every UI surface** with its variant so the seller
understands: "Gross Revenue (today)" vs "Realized Revenue (today)" vs
"Net Revenue (30d)".

**Test:** the Phase 3 scenario #10 encodes the definitions. Add
`src/lib/data/__tests__/metrics.test.ts` — pure function tests for each
formula with edge cases (no orders, all cancelled, mixed statuses, period
boundaries).

**Estimated:** ~400 lines refactor + ~300 lines tests, 1 session.

---

## Phase 5 — Fix the orphaned Notification table + other orphans

### 5.1 Notification table
**Decision:** wire it as the backing store for "mark as read" state, OR drop
it. Recommendation: **drop it** — the bell computes fresh, "mark as read" is
low-value for a COD seller (they clear notifications by acting on the order).

**If dropping:**
- Remove `Notification` model from `prisma/schema.prisma` + add a migration.
- Remove the `db.notification.create` at `reports/daily/route.ts:65` (replace
  with an audit-log entry if the founder wants a record).
- Remove the `prisma.notification.create` at `seed-rich.ts:602` + the
  `deleteMany` calls.
- Remove the `tx.notification.deleteMany` at `settings/reset/route.ts:49`.

**If keeping:** make `/api/notifications` read from the table (merge computed
+ persisted) + add `PATCH /api/notifications/[id]` for "mark as read".

### 5.2 `DailyAnalyticsReport` model (also orphaned — never written to in src/)
Drop it. Add to the same migration.

### 5.3 `deliveryService.create` + `updateStatus` (dead production code)
Only used in tests. Either delete them + update tests to use the API routes,
OR make them the single source of truth (refactor API routes to call them).
Recommendation: **make them the source of truth** — eliminates the inline
logic in 3 API routes (delivery/create, delivery/sync, delivery/[id]).

**Estimated:** ~200 lines + migration, 0.5 session.

---

## Phase 6 — E2e golden-path suite (the founder-confidence layer)

Add Playwright specs that test real browser flows end-to-end. Requires Phase
2 (build fix) done so these can run against a prod build on the founder's
machine (sandbox OOM blocks them here, but they're authored + committed).

**Files** (each is a golden path an Algerian COD seller runs daily):

1. `e2e/order-lifecycle.spec.ts` — login → /orders → click "New order" →
   fill form → save → see row in table → click row → status dropdown →
   confirm → see stock decrement on /products → create delivery → mark
   shipped → sync delivered → COD collected badge → /accounting shows revenue.
2. `e2e/storefront-roundtrip.spec.ts` — visit /storefront/[slug] → add items
   → submit COD form → see confirmation → (as seller) login → see order on
   /orders with source "storefront".
3. `e2e/notifications.spec.ts` — seed stale order → click bell → see Arabic
   notification (locale=ar) → click notification → navigate to
   confirmation-queue.
4. `e2e/cod-reconciliation.spec.ts` — mark 3 orders collected →
   /accounting/cod-reconciliation → bulk remit → summary updates.
5. `e2e/return-refund.spec.ts` — deliver order → /returns → create return →
   complete → /orders shows "returned" → issue refund → stock + stats
   correct (no double-count).
6. `e2e/language-switch.spec.ts` — login → switch to Arabic → entire layout
   RTL → switch to French → LTR → all visible strings translated.
7. `e2e/backup-restore.spec.ts` — /settings → backup → wipe DB → restore →
   all data back (spot-check orders + customers + products).
8. `e2e/automation-fire.spec.ts` — /automations → create "order.confirmed →
   notify" → create + confirm an order → automation log entry appears.

**Pattern:** each spec uses the API request context to seed data fast, then
uses the browser ONLY for the assertions that matter (UI rendering +
cross-page navigation). This keeps specs fast + focused.

**Estimated:** ~1200 lines Playwright, 2 sessions (authoring + debugging on
founder machine).

---

## Phase 7 — API route integration tests (close the 0.9% gap)

110 of 111 API routes have no direct test. Add integration tests for the
highest-traffic routes using the existing
`src/app/api/__tests__/helpers.ts` (`mockPost`/`mockGet` + `rawDb`).

**Priority order** (by user-impact):
1. `/api/orders` POST + `/api/orders/[id]/status` PATCH + `/api/orders/bulk`
2. `/api/auth/{login,setup,change-pin,status,logout}`
3. `/api/returns` POST + `/api/returns/[id]` PATCH
4. `/api/accounting/cod-reconciliation` + `/api/accounting/cod-reconciliation/bulk`
5. `/api/delivery/create` + `/api/delivery/sync` + `/api/delivery/[id]`
6. `/api/notifications` (protects Task 8 i18n fix)
7. `/api/backup/{create,list,restore}`
8. `/api/extraction` + `/api/ai/sessions/[id]/messages/stream`
9. `/api/risk/{analytics,assess,blacklist,config,rules}`
10. `/api/storefront/submit` (extend existing)

**Pattern:** for each route, test: happy path (201/200 + correct response
shape), auth (401 without cookie), validation (400 on bad input), not-found
(404), error (500 on service failure). Assert DB state after write routes.

**Estimated:** ~3000 lines, 2-3 sessions.

---

## Verification checklist (the "100% sure" definition)

After all phases, the founder can be confident because:

- [ ] `bun run build` exits 0 (Phase 2) → prod deploy unblocked.
- [ ] vitest 1257 → ~1800+ tests, including the data-integrity suite (Phase 3)
      that asserts cross-table consistency after every operation.
- [ ] The 5 data-flow bugs are fixed + regression-protected (Phase 1).
- [ ] Revenue + delivery-rate formulas are consolidated + labeled (Phase 4) —
      no more "why does dashboard disagree with analytics".
- [ ] Orphaned tables/code removed (Phase 5) — no dead data.
- [ ] 8 Playwright golden-path specs pass on the founder's machine (Phase 6) —
      real browser verification of the daily flows.
- [ ] Top 30 API routes have integration tests (Phase 7) — route-layer
      regressions caught.
- [ ] `sf-audit` shows no drift.
- [ ] The founder has personally browser-verified the app in AR + FR + EN,
      fullscreen + windowed, with seeded data, and every notification +
      every page reflects correctly.

**"100% sure" = the data-integrity suite passes + the e2e golden paths pass +
the founder has personally clicked through every flow.** Tests are necessary
but not sufficient — the founder's own browser pass is the final gate (per
the Method v8.0 "done = browser-verified" rule).

---

## Sequencing + effort

| Phase | What | Effort | Depends on |
|---|---|---|---|
| 1 | Fix 5 data-flow bugs | 1 session | — |
| 2 | Fix build ship-blocker | 0.5 session | — |
| 3 | Data-integrity test suite | 1 session | 1 (tests the fixes) |
| 4 | Consolidate revenue/delivery-rate formulas | 1 session | 3 (tests the consolidation) |
| 5 | Remove orphaned tables/code | 0.5 session | 3 |
| 6 | E2e golden-path suite | 2 sessions | 2 (needs build) |
| 7 | API route integration tests | 2-3 sessions | 1, 2 |
| **Total** | | **~8-9 sessions** | |

Phases 1 + 2 can run in parallel (different files). Phase 3 depends on 1.
Phases 4 + 5 depend on 3. Phase 6 depends on 2. Phase 7 depends on 1 + 2.

**Recommended next session:** Phase 1 (fix the 5 bugs) + Phase 2 (build fix)
in parallel — they're the highest-impact + unblock everything else.
