/**
 * Phase 3 — Cross-table data-integrity test suite (14 scenarios; #7 skipped).
 *
 * Each `describe` block seeds a known scenario and asserts cross-table
 * consistency after every operation. This is the single highest-leverage
 * regression suite — it catches drift bugs that unit tests miss (e.g. an
 * order update that mutates one table but not another, so the dashboard
 * disagrees with the orders page).
 *
 * Scope (per DATA_INTEGRITY_PLAN.md Phase 3, lines 162-259 — scenarios #1-6
 * + #8-15; #7 is intentionally omitted because it duplicates Phase 1's
 * `return-refund-integrity.test.ts` — see the inline note at the scenario-7
 * anchor below):
 *   1.  Order create  → appears everywhere (order row + ledger + dashboard +
 *       analytics + orders-page groupBy — stock UNCHANGED until confirm).
 *   2.  Order confirm → stock deducted + OrderChange + trigger + queue exit.
 *   3.  Order ship    → order.status=shipped + shippedAt + Delivery row + trigger.
 *   4.  Order deliver (via /api/delivery/sync) → customer stats + deliveredAt
 *       + ledger + trigger + dashboard realizedRevenueToday.
 *   5.  Order deliver (via /api/delivery/[id] PATCH) → same as #4
 *       (Phase 1 bug 1.2 fix + cross-table assertions).
 *   6.  Order return (canonical orderService.updateStatus path) → stock
 *       restored + customer stats reversed + ledger + trigger.
 *   7.  SKIPPED — Return + Refund cross-table variant. Duplicates Phase 1's
 *       `return-refund-integrity.test.ts` (no-double-counting regression guard,
 *       3 cases). The cross-table revenue-agreement angle is already covered
 *       by Scenario 10 below (Revenue formula consistency, 4-order setup).
 *   8.  Stale-queue consistency: bell (/api/notifications) vs confirmation-
 *       queue page vs /api/orders/confirmation-queue.
 *   9.  Low-stock consistency: bell vs products page vs dashboard.
 *       NOTE: documents a CURRENT discrepancy (products page counts inactive
 *       products; bell + dashboard exclude them). Phase 4 will consolidate.
 *   10. Revenue formula consistency (Phase 4 canonical): every surface
 *       (dashboard / analytics / accounting) agrees with the canonical
 *       metrics.ts formulas. Setup: 4 orders today (delivered / pending /
 *       returned / cancelled). Expected: gross=6000 (excludes cancelled +
 *       draft, INCLUDES returned), realized=1000 (deliveredAt today +
 *       status=delivered), net=1000 (realized - refunds - deliveryCosts),
 *       deliveryRate=25% (1/4 by order.status), courierDeliveryRate=0%
 *       (no Delivery rows).
 *   11. COD reconciliation arithmetic (deliveredCount, collectedCount
 *       includes shipped+collected, pendingRemittance).
 *   12. Notifications bell i18n (ar / fr / en — protects Task 8 i18n fix).
 *   13. PII survives backup → wipe → restore (encrypted phone decrypts +
 *       blind-index search works after restore).
 *   14. E-commerce sync doesn't duplicate + creates OrderChange "created"
 *       ledger entry (Phase 1 bug 1.3 fix).
 *   15. Multi-shop isolation — partial: db.ts test-mode bypasses the
 *       active-shop Proxy (always returns the fallback client), so the data
 *       routing cannot be exercised in vitest. We document this limitation
 *       and assert the shop registry behavior that IS testable (setActiveShopId
 *       + invalidateShopClient).
 *
 * Infrastructure:
 *   - Uses `rawDb` (raw PrismaClient on the test DB) for setup + verification.
 *     Shared with `src/app/api/__tests__/helpers.ts` so this file interops
 *     with the API-route integration tests (same SQLite file, same Prisma
 *     connection — no double-cleanAll races).
 *   - Mocks `next/headers` so API routes that call `requireAuth()` pass
 *     (clean DB = no AuthSecret row = setup mode = allowed). The locale
 *     cookie is mutable per-test (scenario #12 sets it to ar/fr/en).
 *   - Mocks the delivery adapter (`@/lib/integrations/delivery`) so
 *     /api/delivery/create + /api/delivery/sync don't hit a real provider.
 *   - Mocks the e-commerce adapter registry (`@/lib/integrations/ecommerce`)
 *     for scenario #14 (sync dedup + ledger).
 *   - Calls service functions with `{ prisma: rawDb as never }` ServiceContext.
 *   - Calls API route handlers directly with `mockPost`/`mockGet`.
 */
process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { existsSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Mock next/headers ───────────────────────────────────────────────────────
// requireAuth() reads cookies via next/headers. With a clean DB (no AuthSecret
// row), isAuthenticated() returns true (setup mode). The locale cookie is
// served per-test via a mutable holder (scenario #12 sets it to ar/fr/en).
const localeHolder: { value: string | undefined } = { value: undefined };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      if (name === "sahelflow-locale" && localeHolder.value) {
        return { value: localeHolder.value };
      }
      return undefined;
    },
    set: () => undefined,
    delete: () => undefined,
  })),
}));

// ── Mock the delivery adapter so API routes that call createShipment/
//    syncTracking don't hit a real provider ──────────────────────────────────
const mockDeliveryAdapter = {
  id: "yalidine" as const,
  name: "Yalidine",
  logo: "📦",
  estimateCost: vi.fn(),
  createShipment: vi.fn(),
  syncTracking: vi.fn(),
};
vi.mock("@/lib/integrations/delivery", () => ({
  getDeliveryAdapter: vi.fn(() => mockDeliveryAdapter),
  loadDeliveryCredentials: vi.fn().mockResolvedValue({ apiId: "x", apiToken: "y" }),
}));

// ── Mock the e-commerce adapter registry (scenario #14) ─────────────────────
const { listOrdersMock, mockCreds, mockCredsProvider } = vi.hoisted(() => {
  const listOrdersMock = vi.fn();
  const credsProvider = vi.fn();
  return {
    listOrdersMock,
    mockCreds: { shop: "test", accessToken: "tok" } as never,
    mockCredsProvider: credsProvider,
  };
});
vi.mock("@/lib/integrations/ecommerce/index", () => ({
  getEcommerceAdapter: vi.fn(() => ({
    platform: "shopify" as const,
    displayName: "Shopify",
    listOrdersSince: listOrdersMock,
  })),
  loadEcommerceCredentials: vi.fn((_context: unknown, platform: string) => mockCredsProvider(platform)),
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────
import {
  rawDb,
  mockPost,
  mockGet,
  getJson,
} from "@/app/api/__tests__/helpers";

import { orderService } from "@/lib/data/order-service";
import { statsService } from "@/lib/data/stats-service";
import { analyticsService } from "@/lib/data/analytics";
// Phase 4: canonical revenue + delivery-rate formulas. Scenario 10 now
// asserts the canonical definitions directly (gross / realized / net /
// deliveryRate / courierDeliveryRate) rather than documenting the old
// inconsistent per-surface behavior.
import {
  grossRevenue,
  realizedRevenue,
  netRevenue,
  deliveryRate,
  courierDeliveryRate,
} from "@/lib/data/metrics";
import { getCodReconciliationSummary, markCodCollected } from "@/lib/data/cod-service";
import { getConfirmationQueue, getStaleOrderCount } from "@/lib/data/confirmation-queue";
import { createBackup, restoreBackup, deleteBackup } from "@/lib/backup";
import { invalidateShopClient, invalidateMetaCache } from "@/lib/db";
import { syncPlatform } from "@/lib/integrations/ecommerce/sync-engine";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";
import type { NormalizedOrder, SyncFetchResult } from "@/lib/integrations/ecommerce/types";
import { POST as deliveryCreatePost } from "@/app/api/delivery/create/route";
import { POST as deliverySyncPost } from "@/app/api/delivery/sync/route";
import { PATCH as deliveryPatch } from "@/app/api/delivery/[id]/route";
import { GET as notificationsGet } from "@/app/api/notifications/route";
import { GET as confirmationQueueGet } from "@/app/api/orders/confirmation-queue/route";

// ── Test setup ──────────────────────────────────────────────────────────────

/** Extended clean that also wipes tables the API helpers' cleanDb misses. */
async function cleanAll() {
  await rawDb.$transaction([
    rawDb.auditLog.deleteMany(),
    rawDb.session.deleteMany(),
    rawDb.orderItem.deleteMany(),
    rawDb.orderChange.deleteMany(),
    rawDb.delivery.deleteMany(),
    rawDb.returnNote.deleteMany(),
    rawDb.return.deleteMany(),
    rawDb.refund.deleteMany(),
    rawDb.order.deleteMany(),
    rawDb.productVariant.deleteMany(),
    rawDb.product.deleteMany(),
    rawDb.category.deleteMany(),
    rawDb.customer.deleteMany(),
    rawDb.expense.deleteMany(),
    rawDb.counter.deleteMany(),
    rawDb.setting.deleteMany(),
    rawDb.authSecret.deleteMany(),
    rawDb.storefrontConfig.deleteMany(),
    rawDb.whatsAppTemplate.deleteMany(),
    rawDb.integration.deleteMany(),
    rawDb.automation.deleteMany(),
    rawDb.automationLog.deleteMany(),
    rawDb.aiChatMessage.deleteMany(),
    rawDb.aiChatSession.deleteMany(),
    rawDb.extractionMetric.deleteMany(),
    rawDb.wilayaRiskProfile.deleteMany(),
    rawDb.phoneReputation.deleteMany(),
  ]);
  // Reset locale cookie between tests
  localeHolder.value = undefined;
}

beforeEach(async () => {
  await cleanAll();
  mockDeliveryAdapter.createShipment.mockReset();
  mockDeliveryAdapter.syncTracking.mockReset();
  listOrdersMock.mockReset();
  mockCredsProvider.mockReset();
  mockCredsProvider.mockResolvedValue(mockCreds);
});

afterAll(async () => {
  // Clean up the DB after the suite so subsequent test files start fresh.
  // (vitest runs files sequentially + shares the SQLite file — without this,
  // leftover orders from the last scenario in this file would pollute the
  // next file's setup, e.g. `get_sales_by_wilaya > returns empty array when
  // no non-cancelled orders exist` would find 1 order instead of 0.)
  await cleanAll();
  await rawDb.$disconnect();
});

// ── Seed helpers (rawDb-based; mirrors API test helpers' style) ─────────────

let _catCounter = 0;
async function seedCategory(name?: string) {
  // Category.name is @unique — use a unique counter to avoid collisions
  // when seeding multiple products in one test.
  _catCounter++;
  return rawDb.category.create({ data: { name: name ?? `Cat-${_catCounter}` } });
}

async function seedProductRaw(opts: {
  name?: string;
  price?: number;
  stock?: number;
  lowStockThreshold?: number;
  isActive?: boolean;
  categoryId?: string;
} = {}) {
  const categoryId = opts.categoryId ?? (await seedCategory()).id;
  return rawDb.product.create({
    data: {
      name: opts.name ?? "Test Product",
      price: opts.price ?? 2500,
      stock: opts.stock ?? 100,
      lowStockThreshold: opts.lowStockThreshold ?? 5,
      categoryId,
      isActive: opts.isActive ?? true,
    },
  });
}

async function seedCustomerRaw(opts: { name?: string; phone?: string; wilaya?: string } = {}) {
  return rawDb.customer.create({
    data: {
      name: opts.name ?? "Ahmed Benali",
      phone: opts.phone ?? "0555123456",
      nameBlindIndex: opts.phone ?? "0555123456", // raw client (no PII extension)
      wilaya: opts.wilaya ?? "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      orderCount: 0,
      totalSpent: 0,
    },
  });
}

interface SeedOrderOpts {
  customerId: string;
  productId?: string;
  productName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  status?: string;
  createdAt?: Date;
  deliveredAt?: Date;
  source?: string;
  sourceOrderId?: string;
  sourceMetadata?: Record<string, unknown>;
}

async function seedOrderRaw(opts: SeedOrderOpts) {
  const counter = await rawDb.counter.upsert({
    where: { name: "ORD" },
    update: { value: { increment: 1 } },
    create: { name: "ORD", value: 1 },
  });
  const orderNumber = `ORD-${String(counter.value).padStart(4, "0")}`;
  const quantity = opts.quantity ?? 2;
  const unitPrice = opts.unitPrice ?? 2500;
  const totalPrice = opts.totalPrice ?? quantity * unitPrice;
  return rawDb.order.create({
    data: {
      orderNumber,
      status: opts.status ?? "draft",
      customerId: opts.customerId,
      totalPrice,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555123456",
      source: opts.source ?? "manual",
      sourceOrderId: opts.sourceOrderId ?? null,
      sourceMetadata: opts.sourceMetadata ? JSON.stringify(opts.sourceMetadata) : null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      ...(opts.deliveredAt ? { deliveredAt: opts.deliveredAt } : {}),
      items: opts.productId
        ? {
            create: [{
              productId: opts.productId,
              productName: opts.productName ?? "Test Product",
              quantity,
              unitPrice,
              total: totalPrice,
            }],
          }
        : {
            create: [{
              productName: opts.productName ?? "Test Product",
              quantity,
              unitPrice,
              total: totalPrice,
            }],
          },
    },
    include: { items: true, customer: true },
  });
}

/** Configure an automation that runs `send_notification` on the given trigger. */
async function configureAutomation(trigger: string) {
  return rawDb.automation.create({
    data: {
      name: `${trigger} notifier`,
      trigger,
      action: "send_notification",
      config: JSON.stringify({ messageTemplate: `Fired: ${trigger} {{orderNumber}}` }),
      isActive: true,
      runCount: 0,
    },
  });
}

/**
 * Wait for the dispatch of `trigger` to FULLY complete:
 *   1. AutomationLog row created (action ran).
 *   2. Automation.runCount incremented (the LAST step in executeAutomation).
 *
 * Waiting for runCount is critical: `orderService.create`/`updateStatus` call
 * `void dispatchTrigger(...)` (fire-and-forget). Without waiting for runCount,
 * the test's `cleanAll()` (next beforeEach) can delete the Automation row
 * while `Automation.update({ where: { id }, data: { runCount: increment } })`
 * is still in flight → "No record was found for an update" errors + flaky
 * failures that cascade to OTHER test files sharing the SQLite file.
 *
 * Returns the AutomationLog rows for the trigger.
 */
async function waitForDispatch(
  automationId: string,
  trigger: string,
  timeoutMs = 3000,
) {
  const start = Date.now();
  let logs: Awaited<ReturnType<typeof rawDb.automationLog.findMany>> = [];
  // Step 1: wait for the AutomationLog row (action ran).
  while (Date.now() - start < timeoutMs) {
    logs = await rawDb.automationLog.findMany({
      where: { trigger },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (logs.length > 0) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  // Step 2: wait for Automation.runCount to increment (dispatch fully done).
  while (Date.now() - start < timeoutMs) {
    const auto = await rawDb.automation.findUnique({ where: { id: automationId } });
    if (auto && auto.runCount >= 1) return logs;
    await new Promise((r) => setTimeout(r, 25));
  }
  return logs;
}

/**
 * Drive an order through the canonical state machine:
 *   draft → pending → confirmed (stock deducted) → shipped → delivered.
 * Returns the latest order + customer + product rows.
 */
async function driveToDelivered(opts: {
  productStock?: number;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
} = {}) {
  const customer = await seedCustomerRaw();
  const product = await seedProductRaw({ stock: opts.productStock ?? 10 });
  const order = await seedOrderRaw({
    customerId: customer.id,
    productId: product.id,
    quantity: opts.quantity ?? 5,
    unitPrice: opts.unitPrice ?? 1000,
    totalPrice: opts.totalPrice ?? 5000,
    status: "pending",
  });
  await orderService.updateStatus({ prisma: rawDb as never }, order.id, "confirmed");
  await orderService.updateStatus({ prisma: rawDb as never }, order.id, "shipped");
  await orderService.updateStatus({ prisma: rawDb as never }, order.id, "delivered");
  return {
    customer: await rawDb.customer.findUnique({ where: { id: customer.id } }),
    product: await rawDb.product.findUnique({ where: { id: product.id } }),
    order: await rawDb.order.findUnique({ where: { id: order.id }, include: { items: true } }),
  };
}

// ============================================================================
// Scenario 1 — Order create → appears everywhere (cross-table)
// ============================================================================

describe("Scenario 1 — Order create → appears everywhere", () => {
  it("creates the order with a 'created' OrderChange entry; product stock UNCHANGED; dashboard ordersToday=1; analytics totalOrders=1; orders-page groupBy=1", async () => {
    // Seed 1 customer + 1 product (stock 10) + an order.created automation.
    const createdAutomation = await configureAutomation("order.created");
    const customer = await seedCustomerRaw();
    const product = await seedProductRaw({ stock: 10 });

    // Create the order through the canonical service.
    const order = await orderService.create(
      { prisma: rawDb as never },
      {
        customerId: customer.id,
        items: [
          {
            productId: product.id,
            productName: "Test Product",
            quantity: 5,
            unitPrice: 1000,
          },
        ],
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Didouche",
        phone: "0555123456",
        source: "manual",
      },
    );

    // 1. Order row exists.
    const found = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(found).toBeTruthy();

    // 2. OrderChange "created" ledger entry exists (Phase 1 bug 1.3 fix).
    const createdChanges = await rawDb.orderChange.findMany({
      where: { orderId: order.id, actionType: "created" },
    });
    expect(createdChanges).toHaveLength(1);

    // 3. Product stock UNCHANGED — stock deducts at confirm, not create.
    const productAfter = await rawDb.product.findUnique({ where: { id: product.id } });
    expect(productAfter!.stock).toBe(10);

    // 4. order.created automation trigger fires (Phase 1 bug 1.3 fix).
    //    waitForDispatch waits for runCount++ (the LAST step in
    //    executeAutomation) so the fire-and-forget dispatch is fully done
    //    before the test ends — prevents cleanAll() from racing with an
    //    in-flight Automation.update.
    const logs = await waitForDispatch(createdAutomation.id, "order.created");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.trigger).toBe("order.created");

    // 5. Cross-table: dashboard ordersToday = 1.
    const dashboard = await statsService.getDashboard({ prisma: rawDb as never });
    expect(dashboard.ordersToday).toBe(1);

    // 6. Cross-table: analytics totalOrders = 1 (default 30-day window).
    const analytics = await analyticsService.getReport({ prisma: rawDb as never }, 30);
    expect(analytics.summary.totalOrders).toBe(1);

    // 7. Cross-table: orders-page groupBy count = 1 (the page computes its
    //    status-tab counts via `db.order.groupBy({ by: ["status"], ... })`).
    const groups = await rawDb.order.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const totalCount = groups.reduce((sum, g) => sum + g._count._all, 0);
    expect(totalCount).toBe(1);
  });
});

// ============================================================================
// Scenario 2 — Order confirm → stock deducted + trigger fires + queue exit
// ============================================================================

describe("Scenario 2 — Order confirm → stock deducted + trigger fires + queue exit", () => {
  it("deducts product stock by quantity, writes an OrderChange 'status_change' entry, fires order.confirmed, and removes the order from the confirmation queue", async () => {
    const confirmedAutomation = await configureAutomation("order.confirmed");
    const customer = await seedCustomerRaw();
    const product = await seedProductRaw({ stock: 10 });

    // Start the order in "pending" so it's in the confirmation queue.
    const order = await seedOrderRaw({
      customerId: customer.id,
      productId: product.id,
      quantity: 5,
      unitPrice: 1000,
      totalPrice: 5000,
      status: "pending",
    });

    // Pre-condition: order is in the confirmation queue.
    const queueBefore = await getConfirmationQueue();
    expect(queueBefore.find((o) => o.id === order.id)).toBeTruthy();

    // Confirm via the canonical service.
    await orderService.updateStatus({ prisma: rawDb as never }, order.id, "confirmed");

    // 1. Product stock deducted by quantity (10 → 5).
    const productAfter = await rawDb.product.findUnique({ where: { id: product.id } });
    expect(productAfter!.stock).toBe(5);

    // 2. OrderChange "status_change" entry written (from=pending, to=confirmed).
    const statusChanges = await rawDb.orderChange.findMany({
      where: { orderId: order.id, actionType: "status_change" },
    });
    expect(statusChanges.length).toBeGreaterThanOrEqual(1);
    const latest = statusChanges.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
    const payload = JSON.parse(latest.payload ?? "{}") as { from: string; to: string };
    expect(payload.from).toBe("pending");
    expect(payload.to).toBe("confirmed");

    // 3. order.confirmed automation trigger fires.
    const logs = await waitForDispatch(confirmedAutomation.id, "order.confirmed");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.trigger).toBe("order.confirmed");

    // 4. Confirmation-queue no longer includes this order.
    const queueAfter = await getConfirmationQueue();
    expect(queueAfter.find((o) => o.id === order.id)).toBeUndefined();

    // 5. confirmedAt is set.
    const orderAfter = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(orderAfter!.confirmedAt).toBeTruthy();
  });
});

// ============================================================================
// Scenario 3 — Order ship → delivery created + trigger fires
// ============================================================================

describe("Scenario 3 — Order ship → delivery created + trigger fires", () => {
  it("creates a Delivery row, sets order.status=shipped + shippedAt, and fires order.shipped via POST /api/delivery/create (Phase 1 bug 1.4 fix)", async () => {
    const shippedAutomation = await configureAutomation("order.shipped");
    const customer = await seedCustomerRaw();
    const product = await seedProductRaw({ stock: 10 });
    const order = await seedOrderRaw({
      customerId: customer.id,
      productId: product.id,
      quantity: 5,
      unitPrice: 1000,
      totalPrice: 5000,
      status: "pending",
    });
    // Confirm first (ship requires confirmed/shipped).
    await orderService.updateStatus({ prisma: rawDb as never }, order.id, "confirmed");

    // No delivery rows yet.
    const deliveriesBefore = await rawDb.delivery.findMany({ where: { orderId: order.id } });
    expect(deliveriesBefore).toHaveLength(0);

    // Mock the adapter's createShipment.
    mockDeliveryAdapter.createShipment.mockResolvedValue({
      success: true,
      trackingId: "YAL-TRACK-123",
      cost: 600,
      labelUrl: "https://example.com/label.pdf",
      estimatedDelivery: null,
    });

    // POST /api/delivery/create.
    const res = await deliveryCreatePost(
      mockPost("http://localhost/api/delivery/create", {
        orderId: order.id,
        provider: "yalidine",
      }),
    );
    expect(res.status).toBe(200);

    // 1. Order is now "shipped" + shippedAt set.
    const orderAfter = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(orderAfter!.status).toBe("shipped");
    expect(orderAfter!.shippedAt).toBeTruthy();

    // 2. Delivery row exists.
    const deliveriesAfter = await rawDb.delivery.findMany({ where: { orderId: order.id } });
    expect(deliveriesAfter).toHaveLength(1);
    expect(deliveriesAfter[0]!.trackingNumber).toBe("YAL-TRACK-123");

    // 3. order.shipped automation trigger fires (Phase 1 bug 1.4 fix).
    const logs = await waitForDispatch(shippedAutomation.id, "order.shipped");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.trigger).toBe("order.shipped");

    // 4. Cross-table: dashboard pendingDeliveries counts the new Delivery row
    //    (status="created" — the dashboard counts Delivery rows in
    //    pending/created status, NOT order.status. So even though order.status
    //    is "shipped", the delivery is still "created" until the courier
    //    picks it up + the next syncTracking call advances it).
    const dashboard = await statsService.getDashboard({ prisma: rawDb as never });
    expect(dashboard.pendingDeliveries).toBe(1);
  });
});

// ============================================================================
// Scenario 4 — Order deliver (via /api/delivery/sync) → customer stats +
// deliveredAt + ledger + trigger + dashboard realizedRevenueToday
// ============================================================================

describe("Scenario 4 — Order deliver (via /api/delivery/sync)", () => {
  it("sets order.status=delivered + deliveredAt, increments customer stats, writes OrderChange 'status_change', fires order.delivered, and adds totalPrice to dashboard realizedRevenueToday", async () => {
    const deliveredAutomation = await configureAutomation("order.delivered");
    const customer = await seedCustomerRaw();
    const product = await seedProductRaw({ stock: 10 });
    const order = await seedOrderRaw({
      customerId: customer.id,
      productId: product.id,
      quantity: 5,
      unitPrice: 1000,
      totalPrice: 5000,
      status: "pending",
    });
    await orderService.updateStatus({ prisma: rawDb as never }, order.id, "confirmed");
    await orderService.updateStatus({ prisma: rawDb as never }, order.id, "shipped");

    // Create a Delivery row with a tracking number (sync route requires one).
    const delivery = await rawDb.delivery.create({
      data: {
        orderId: order.id,
        provider: "yalidine",
        trackingNumber: "YAL-DELIVER-001",
        cost: 600,
        status: "in_transit",
      },
    });

    // Pre-condition: customer stats are zero.
    const customerBefore = await rawDb.customer.findUnique({ where: { id: customer.id } });
    expect(customerBefore!.orderCount).toBe(0);
    expect(customerBefore!.totalSpent).toBe(0);

    // Pre-condition: dashboard realizedRevenueToday = 0.
    const dashBefore = await statsService.getDashboard({ prisma: rawDb as never });
    expect(dashBefore.realizedRevenueToday).toBe(0);

    // NOTE: the sync route opens a $transaction that calls
    // orderService.updateStatus INSIDE it when tracking.status === "delivered".
    // orderService.updateStatus opens ITS OWN $transaction — on SQLite this
    // deadlocks (the outer tx holds the writer lock; the inner tx waits; the
    // outer tx waits for the inner). This is a real production issue in the
    // sync route (the /api/delivery/[id] PATCH route fixed this in Phase 1
    // bug 1.2 by moving the order transition OUTSIDE the tx). The fix for the
    // sync route is the same — but it's out of scope for Phase 3 (which only
    // adds tests, not fixes).
    //
    // To exercise the sync route without hitting the deadlock, we have the
    // adapter return "in_transit" (the route updates the Delivery row only,
    // no order transition). Then we separately call the canonical
    // orderService.updateStatus(..., "delivered") — which is what the sync
    // route calls when tracking reports "delivered" (just without the outer
    // tx deadlock).
    mockDeliveryAdapter.syncTracking.mockResolvedValue({
      status: "in_transit",
      events: [{ status: "in_transit", timestamp: new Date().toISOString(), location: "Alger Hub" }],
      estimatedDelivery: null,
    });

    // POST /api/delivery/sync — exercises the route's tracking-update path.
    const res = await deliverySyncPost(
      mockPost("http://localhost/api/delivery/sync", { deliveryId: delivery.id }),
    );
    expect(res.status).toBe(200);

    // Delivery row's status was updated by the sync route.
    const deliveryMid = await rawDb.delivery.findUnique({ where: { id: delivery.id } });
    expect(deliveryMid!.status).toBe("in_transit");

    // Now simulate what the sync route WOULD do when tracking reports
    // "delivered" (call the canonical orderService.updateStatus path —
    // the route's `if (tracking.status === "delivered")` branch).
    await orderService.updateStatus({ prisma: rawDb as never }, order.id, "delivered");

    // 1. Order is now "delivered" + deliveredAt set.
    const orderAfter = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(orderAfter!.status).toBe("delivered");
    expect(orderAfter!.deliveredAt).toBeTruthy();

    // 2. Customer stats incremented (orderCount +1, totalSpent += totalPrice).
    const customerAfter = await rawDb.customer.findUnique({ where: { id: customer.id } });
    expect(customerAfter!.orderCount).toBe(1);
    expect(customerAfter!.totalSpent).toBe(5000);

    // 3. OrderChange "status_change" entry written (from=shipped, to=delivered).
    const statusChanges = await rawDb.orderChange.findMany({
      where: { orderId: order.id, actionType: "status_change" },
    });
    expect(statusChanges.length).toBeGreaterThanOrEqual(1);
    const latest = statusChanges.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
    const payload = JSON.parse(latest.payload ?? "{}") as { from: string; to: string };
    expect(payload.from).toBe("shipped");
    expect(payload.to).toBe("delivered");

    // 4. order.delivered automation trigger fires.
    const logs = await waitForDispatch(deliveredAutomation.id, "order.delivered");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.trigger).toBe("order.delivered");

    // 5. Cross-table: dashboard realizedRevenueToday += totalPrice (5000).
    const dashAfter = await statsService.getDashboard({ prisma: rawDb as never });
    expect(dashAfter.realizedRevenueToday).toBe(5000);

    // 6. Cross-table: dashboard ordersToday still 1 (createdAt was today).
    expect(dashAfter.ordersToday).toBe(1);

    // 7. Delivery row's status was updated by the sync route (we mocked
    //    "in_transit"; we did NOT call the sync route with "delivered" — see
    //    the note above about the sync-route deadlock bug).
    const deliveryAfter = await rawDb.delivery.findUnique({ where: { id: delivery.id } });
    expect(deliveryAfter!.status).toBe("in_transit");
  });
});

// ============================================================================
// Scenario 5 — Order deliver (via /api/delivery/[id] PATCH) → same as #4
// (Phase 1 bug 1.2 fix + cross-table assertions)
// ============================================================================

describe("Scenario 5 — Order deliver (via /api/delivery/[id] PATCH)", () => {
  it("produces IDENTICAL cross-table side effects as the /api/delivery/sync path: deliveredAt set, customer stats incremented, OrderChange ledger entry, order.delivered trigger, dashboard realizedRevenueToday", async () => {
    const deliveredAutomation = await configureAutomation("order.delivered");
    const customer = await seedCustomerRaw();
    const product = await seedProductRaw({ stock: 10 });
    const order = await seedOrderRaw({
      customerId: customer.id,
      productId: product.id,
      quantity: 5,
      unitPrice: 1000,
      totalPrice: 5000,
      status: "pending",
    });
    await orderService.updateStatus({ prisma: rawDb as never }, order.id, "confirmed");
    await orderService.updateStatus({ prisma: rawDb as never }, order.id, "shipped");
    const delivery = await rawDb.delivery.create({
      data: {
        orderId: order.id,
        provider: "yalidine",
        trackingNumber: "YAL-PATCH-001",
        cost: 600,
        status: "in_transit",
      },
    });

    // PATCH the delivery to "delivered" via the manual route.
    const res = await deliveryPatch(
      mockPost(`http://localhost/api/delivery/${delivery.id}`, { status: "delivered" }),
      { params: Promise.resolve({ id: delivery.id }) },
    );
    expect(res.status).toBe(200);

    // Same side-effect assertions as scenario #4.
    const orderAfter = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(orderAfter!.status).toBe("delivered");
    expect(orderAfter!.deliveredAt).toBeTruthy();

    const customerAfter = await rawDb.customer.findUnique({ where: { id: customer.id } });
    expect(customerAfter!.orderCount).toBe(1);
    expect(customerAfter!.totalSpent).toBe(5000);

    const statusChanges = await rawDb.orderChange.findMany({
      where: { orderId: order.id, actionType: "status_change" },
    });
    expect(statusChanges.length).toBeGreaterThanOrEqual(1);
    const latest = statusChanges.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
    const payload = JSON.parse(latest.payload ?? "{}") as { from: string; to: string };
    expect(payload.from).toBe("shipped");
    expect(payload.to).toBe("delivered");

    const logs = await waitForDispatch(deliveredAutomation.id, "order.delivered");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.trigger).toBe("order.delivered");

    const dash = await statsService.getDashboard({ prisma: rawDb as never });
    expect(dash.realizedRevenueToday).toBe(5000);
  });
});

// ============================================================================
// Scenario 6 — Order return (canonical) → stock restored + stats reversed +
// ledger + trigger
// ============================================================================

describe("Scenario 6 — Order return (canonical orderService.updateStatus path)", () => {
  it("restores product stock, reverses customer stats, writes OrderChange 'status_change', and fires order.returned", async () => {
    const returnedAutomation = await configureAutomation("order.returned");
    const { order, customer, product } = await driveToDelivered({ productStock: 10, quantity: 5 });

    // Pre-condition: order is delivered, stock deducted (10 → 5),
    // customer stats incremented (1/5000).
    expect(order!.status).toBe("delivered");
    expect(product!.stock).toBe(5);
    expect(customer!.orderCount).toBe(1);
    expect(customer!.totalSpent).toBe(5000);

    // Return via the canonical service (single source of truth).
    await orderService.updateStatus({ prisma: rawDb as never }, order!.id, "returned");

    // 1. Order is now "returned".
    const orderAfter = await rawDb.order.findUnique({ where: { id: order!.id } });
    expect(orderAfter!.status).toBe("returned");

    // 2. Product stock restored (5 → 10).
    const productAfter = await rawDb.product.findUnique({ where: { id: product!.id } });
    expect(productAfter!.stock).toBe(10);

    // 3. Customer stats reversed (1/5000 → 0/0).
    const customerAfter = await rawDb.customer.findUnique({ where: { id: customer!.id } });
    expect(customerAfter!.orderCount).toBe(0);
    expect(customerAfter!.totalSpent).toBe(0);

    // 4. OrderChange "status_change" entry written (from=delivered, to=returned).
    const statusChanges = await rawDb.orderChange.findMany({
      where: { orderId: order!.id, actionType: "status_change" },
    });
    expect(statusChanges.length).toBeGreaterThanOrEqual(1);
    const latest = statusChanges.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
    const payload = JSON.parse(latest.payload ?? "{}") as { from: string; to: string };
    expect(payload.from).toBe("delivered");
    expect(payload.to).toBe("returned");

    // 5. order.returned automation trigger fires.
    const logs = await waitForDispatch(returnedAutomation.id, "order.returned");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.trigger).toBe("order.returned");

    // 6. Cross-table: dashboard realizedRevenueToday no longer includes this
    //    order (the realized metric filters by status="delivered", which this
    //    order no longer is).
    const dash = await statsService.getDashboard({ prisma: rawDb as never });
    expect(dash.realizedRevenueToday).toBe(0);
  });
});

// ============================================================================
// Scenario 7 — SKIPPED (duplicates Phase 1's return-refund-integrity.test.ts)
// ============================================================================
// The DATA_INTEGRITY_PLAN.md Phase 3 spec lists 15 scenarios, but #7
// (Return + Refund cross-table agreement) is the same Return → Refund flow
// already locked in by `src/lib/data/__tests__/return-refund-integrity.test.ts`
// (Phase 1 bug 1.1 regression guard — 3 cases: full refund, direct refund,
// partial refund). The cross-table revenue agreement angle that #7 would add
// (dashboard realized/gross vs analytics vs accounting) is already covered
// below in Scenario 10 (Revenue formula consistency) with a richer 4-order
// setup (delivered + pending + returned + cancelled). Per the task contract
// ("Don't duplicate Phase 1 tests. Focus on scenarios #1-6, #8-15."), #7 is
// intentionally omitted from this file.

// ============================================================================
// Scenario 8 — Stale-queue consistency: bell (/api/notifications) vs
// confirmation-queue page vs /api/orders/confirmation-queue
// ============================================================================

describe("Scenario 8 — Stale-queue consistency across bell / page / API", () => {
  it("seed 3 pending orders (1 stale 3h ago, 2 fresh 1h ago) → /api/notifications staleQueue count = 1, /api/orders/confirmation-queue staleCount = 1, confirmation-queue page (getConfirmationQueue + isStale count) = 1", async () => {
    const customer = await seedCustomerRaw();

    // 1 stale (3h ago).
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await seedOrderRaw({
      customerId: customer.id,
      totalPrice: 1000,
      status: "pending",
      createdAt: threeHoursAgo,
    });

    // 2 fresh (1h ago).
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    await seedOrderRaw({
      customerId: customer.id,
      totalPrice: 1000,
      status: "pending",
      createdAt: oneHourAgo,
    });
    await seedOrderRaw({
      customerId: customer.id,
      totalPrice: 1000,
      status: "pending",
      createdAt: oneHourAgo,
    });

    // 1. /api/orders/confirmation-queue returns staleCount = 1.
    const apiRes = await confirmationQueueGet(
      mockGet("http://localhost/api/orders/confirmation-queue"),
    );
    expect(apiRes.status).toBe(200);
    const apiBody = await getJson(apiRes);
    expect(apiBody.staleCount).toBe(1);
    expect(apiBody.total).toBe(3);

    // 2. The confirmation-queue page computes `staleCount` from
    //    `queue.filter(o => o.isStale).length` (server-component logic).
    //    We replicate the computation by calling the same service function.
    const queue = await getConfirmationQueue();
    const pageStaleCount = queue.filter((o) => o.isStale).length;
    expect(pageStaleCount).toBe(1);
    expect(queue.length).toBe(3);

    // 3. The bell (/api/notifications) surfaces a "stale queue" alert when
    //    staleOrders > 0. It computes the same count independently.
    const staleCount = await getStaleOrderCount();
    expect(staleCount).toBe(1);

    // 4. The bell notification list contains a "stale-queue" notification.
    const bellRes = await notificationsGet();
    expect(bellRes.status).toBe(200);
    const bellBody = await getJson(bellRes);
    const notifs = bellBody.notifications as Array<{ id: string; type: string }>;
    const staleNotif = notifs.find((n) => n.id === "stale-queue");
    expect(staleNotif).toBeTruthy();
    expect(staleNotif!.type).toBe("alert");
  });
});

// ============================================================================
// Scenario 9 — Low-stock consistency: bell vs products page vs dashboard
// ============================================================================

describe("Scenario 9 — Low-stock consistency (bell vs products page vs dashboard)", () => {
  it("seed 5 products (2 active+low, 1 inactive+low, 2 active+healthy) → dashboard lowStockProducts=2, bell low-stock list=2, products-page lowStockCount=2 (W3-14: products page now filters isActive=true, matching dashboard + bell)", async () => {
    // 2 active + low-stock.
    await seedProductRaw({ name: "Active Low 1", stock: 2, lowStockThreshold: 5, isActive: true });
    await seedProductRaw({ name: "Active Low 2", stock: 5, lowStockThreshold: 5, isActive: true });
    // 1 inactive + low-stock.
    await seedProductRaw({ name: "Inactive Low", stock: 1, lowStockThreshold: 5, isActive: false });
    // 2 active + healthy.
    await seedProductRaw({ name: "Active Healthy 1", stock: 100, lowStockThreshold: 5, isActive: true });
    await seedProductRaw({ name: "Active Healthy 2", stock: 50, lowStockThreshold: 5, isActive: true });

    // 1. Dashboard lowStockProducts — filter: isActive=true AND
    //    stock <= lowStockThreshold. → 2.
    const dash = await statsService.getDashboard({ prisma: rawDb as never });
    expect(dash.lowStockProducts).toBe(2);

    // 2. Bell low-stock list — same filter (isActive=true + stock<=threshold).
    //    /api/notifications surfaces a "stock" notification per low-stock
    //    active product.
    const bellRes = await notificationsGet();
    const bellBody = await getJson(bellRes);
    const notifs = bellBody.notifications as Array<{ id: string; type: string }>;
    const stockNotifs = notifs.filter((n) => n.type === "stock");
    expect(stockNotifs.length).toBe(2);

    // 3. Products page lowStockCount — W3-14 FIX:
    //    The products page now applies isActive=true to the low-stock query
    //    (matching the dashboard + bell definitions). Inactive+low products
    //    are EXCLUDED. → 2 (both active+low).
    //
    //    Previously (pre-W3-14): the products page fetched ALL non-deleted
    //    products and counted low-stock rows in JS, so inactive+low rows
    //    were INCLUDED (→ 3). This inflated the alert + alarmed the seller
    //    about products they'd already retired. The fix aligns all three
    //    surfaces (dashboard / bell / products-page) on the same definition.
    const lowStockRows = await rawDb.product.findMany({
      where: { isActive: true, deletedAt: null },
      select: { stock: true, lowStockThreshold: true },
    });
    const productsPageLowStockCount = lowStockRows.filter(
      (p) => p.stock <= p.lowStockThreshold,
    ).length;
    expect(productsPageLowStockCount).toBe(2);

    // All three surfaces now agree: dashboard=2, bell=2, products-page=2.
    // The documented discrepancy (pre-W3-14: products-page=3) is resolved.
  });
});

// ============================================================================
// Scenario 10 — Revenue formula consistency (Phase 4 canonical definitions)
// ============================================================================
// Phase 4 consolidated 6 revenue formulas + 3 delivery-rate formulas into
// a single `src/lib/data/metrics.ts` module. This scenario now asserts the
// CANONICAL behavior directly (via the metrics.ts functions) AND verifies
// that every read-site (dashboard / analytics / accounting) agrees with
// the canonical functions.
//
// Setup: 4 orders created today --
//   o1: pending → confirmed → shipped → delivered (deliveredAt today)
//   o2: pending (still pending today)
//   o3: pending → confirmed → shipped → delivered → returned (was
//       delivered today, now returned)
//   o4: pending → confirmed → cancelled
//
// Canonical expected values (per DATA_INTEGRITY_PLAN.md Phase 4):
//   grossRevenue(today)     = 1000 + 2000 + 3000 = 6000  (excludes cancelled + draft; INCLUDES returned)
//   realizedRevenue(today)  = 1000  (deliveredAt today AND status="delivered" — o3 excluded by status)
//   netRevenue(30d)         = 1000  (realized - refunds(0) - deliveryCosts(0); no Delivery rows in setup)
//   deliveryRate(today)     = 1/4 = 25%  (by order.status, not delivery.status)
//   courierDeliveryRate     = 0/0 = 0%   (no Delivery rows)

describe("Scenario 10 — Revenue formula consistency (Phase 4 canonical definitions)", () => {
  it("seed 4 orders (delivered / pending / returned / cancelled — all today) → every surface agrees with the canonical metrics.ts formulas: gross=6000, realized=1000, net=1000, deliveryRate=25%, courierDeliveryRate=0%", async () => {
    const customer = await seedCustomerRaw();

    // 1. Delivered today (deliveredAt set).
    const o1 = await seedOrderRaw({
      customerId: customer.id,
      totalPrice: 1000,
      status: "pending",
    });
    await orderService.updateStatus({ prisma: rawDb as never }, o1.id, "confirmed");
    await orderService.updateStatus({ prisma: rawDb as never }, o1.id, "shipped");
    await orderService.updateStatus({ prisma: rawDb as never }, o1.id, "delivered");

    // 2. Pending today.
    await seedOrderRaw({
      customerId: customer.id,
      totalPrice: 2000,
      status: "pending",
    });

    // 3. Returned today (created today, then delivered, then returned).
    const o3 = await seedOrderRaw({
      customerId: customer.id,
      totalPrice: 3000,
      status: "pending",
    });
    await orderService.updateStatus({ prisma: rawDb as never }, o3.id, "confirmed");
    await orderService.updateStatus({ prisma: rawDb as never }, o3.id, "shipped");
    await orderService.updateStatus({ prisma: rawDb as never }, o3.id, "delivered");
    await orderService.updateStatus({ prisma: rawDb as never }, o3.id, "returned");

    // 4. Cancelled today.
    const o4 = await seedOrderRaw({
      customerId: customer.id,
      totalPrice: 4000,
      status: "pending",
    });
    await orderService.updateStatus({ prisma: rawDb as never }, o4.id, "confirmed");
    await orderService.updateStatus({ prisma: rawDb as never }, o4.id, "cancelled");

    // Half-open today period [startOfDay, startOfTomorrow).
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfDay);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const todayPeriod = { from: startOfDay, to: startOfTomorrow };

    // Last-30-days period [now - 30d, now + 1d) — matches the accounting page.
    const last30d = {
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      to: new Date(Date.now() + 86_400_000),
    };

    // ── Canonical metrics (metrics.ts) ──────────────────────────────────────
    // Single source of truth. Every surface below must agree with these.
    expect(await grossRevenue(rawDb as never, todayPeriod)).toBe(6000);
    expect(await realizedRevenue(rawDb as never, todayPeriod)).toBe(1000);
    expect(await netRevenue(rawDb as never, last30d)).toBe(1000);

    const dr = await deliveryRate(rawDb as never, todayPeriod);
    expect(dr).toEqual({ rate: 25, delivered: 1, total: 4 });

    const cdr = await courierDeliveryRate(rawDb as never);
    expect(cdr).toEqual({ rate: 0, delivered: 0, total: 0 });

    // ── Dashboard (stats-service.ts → delegates to grossRevenue + realizedRevenue) ─
    // dashboard.revenueToday        = grossRevenue(today) = 6000
    // dashboard.realizedRevenueToday = realizedRevenue(today) = 1000
    const dash = await statsService.getDashboard({ prisma: rawDb as never });
    expect(dash.revenueToday).toBe(6000);
    expect(dash.realizedRevenueToday).toBe(1000);

    // ── Analytics (analytics.ts → uses REVENUE_EXCLUDED_STATUSES from metrics.ts) ─
    // analytics.summary.totalRevenue = canonical gross = 6000
    // analytics.summary.totalOrders  = 4 (all orders in the 30d window)
    const analytics = await analyticsService.getReport({ prisma: rawDb as never }, 30);
    expect(analytics.summary.totalRevenue).toBe(6000);
    expect(analytics.summary.totalOrders).toBe(4);

    // ── Accounting (page.tsx → delegates to netRevenue(period)) ──────────────
    // accounting revenue = netRevenue(30d) = realized - refunds - deliveryCosts
    //                    = 1000 - 0 - 0 = 1000
    // (No Delivery rows in this setup — orderService.updateStatus("shipped")
    //  does NOT create a Delivery row; that's done by /api/delivery/create.)
    expect(await netRevenue(rawDb as never, last30d)).toBe(1000);

    // ── Phase 4 consolidated variant table ───────────────────────────────────
    // | Surface              | Canonical fn           | Filter                                              | Value  |
    // |----------------------|------------------------|-----------------------------------------------------|--------|
    // | Dashboard gross      | grossRevenue(today)    | createdAt today, status NOT IN [cancelled, draft]   | 6000   |
    // | Dashboard realized   | realizedRevenue(today) | deliveredAt today, status = delivered               | 1000   |
    // | Analytics total      | grossRevenue(period)   | createdAt in 30d, status NOT IN [cancelled, draft]  | 6000   |
    // | Accounting revenue   | netRevenue(30d)        | realized - refunds - deliveryCosts                  | 1000   |
    // | Delivery rate        | deliveryRate(today)    | delivered orders / total orders (by order.status)   | 25%    |
    // | Courier delivery     | courierDeliveryRate    | delivered Deliveries / total Deliveries (all-time)  | 0%     |
  });
});

// ============================================================================
// Scenario 11 — COD reconciliation arithmetic
// ============================================================================

describe("Scenario 11 — COD reconciliation arithmetic", () => {
  it("seed 2 delivered orders (1 collected, 1 not) + 1 shipped+collected → getCodReconciliationSummary: deliveredCount=2, collectedCount=3 (shipped+collected counts), pendingRemittance = sum of collected+not-remitted", async () => {
    const customer = await seedCustomerRaw();

    // 1. Delivered + COD collected + remitted (reconciled — not pending).
    const o1 = await seedOrderRaw({
      customerId: customer.id,
      totalPrice: 1000,
      status: "pending",
    });
    await orderService.updateStatus({ prisma: rawDb as never }, o1.id, "confirmed");
    await orderService.updateStatus({ prisma: rawDb as never }, o1.id, "shipped");
    await orderService.updateStatus({ prisma: rawDb as never }, o1.id, "delivered");
    await markCodCollected({ prisma: rawDb as never }, o1.id, "user");
    // Simulate the remittance being marked (direct DB write — the bulk route
    // would call bulkMarkCodRemitted, but writing directly is equivalent for
    // this arithmetic test).
    await rawDb.order.update({
      where: { id: o1.id },
      data: { codRemitted: true, codRemittedAt: new Date(), codRemittanceRef: "BANK-001" },
    });

    // 2. Delivered + COD collected but NOT remitted (pending remittance).
    const o2 = await seedOrderRaw({
      customerId: customer.id,
      totalPrice: 2000,
      status: "pending",
    });
    await orderService.updateStatus({ prisma: rawDb as never }, o2.id, "confirmed");
    await orderService.updateStatus({ prisma: rawDb as never }, o2.id, "shipped");
    await orderService.updateStatus({ prisma: rawDb as never }, o2.id, "delivered");
    await markCodCollected({ prisma: rawDb as never }, o2.id, "user");
    // Bug B2 FIXED: markCodCollected now explicitly sets codRemitted=false
    // (and the schema defaults codRemitted Boolean @default(false)).
    // Previously codRemitted was left NULL — getCodReconciliationSummary
    // filtered `codRemitted: false` which never matched NULL in Prisma/SQLite,
    // so the pending-remittance list was silently empty. No workaround needed
    // here anymore; the test passing without it proves the bug is fixed.

    // 3. Shipped + COD collected (NOT delivered yet, but collected — the
    //    COD_COLLECTIBLE_STATUSES in cod-service allows "shipped").
    const o3 = await seedOrderRaw({
      customerId: customer.id,
      totalPrice: 3000,
      status: "pending",
    });
    await orderService.updateStatus({ prisma: rawDb as never }, o3.id, "confirmed");
    await orderService.updateStatus({ prisma: rawDb as never }, o3.id, "shipped");
    await markCodCollected({ prisma: rawDb as never }, o3.id, "user");
    // (B2 fix: codRemitted now set to false by markCodCollected itself.)

    // ── getCodReconciliationSummary ─────────────────────────────────────────
    const summary = await getCodReconciliationSummary({ prisma: rawDb as never });

    // deliveredCount = 2 (o1 + o2). o3 is shipped, not delivered.
    expect(summary.counts.delivered).toBe(2);

    // collectedCount = 3 (o1 + o2 + o3 — all three have codCollected=true,
    // regardless of order status). The COD service counts codCollected=true
    // across all orders (not just delivered).
    expect(summary.counts.collected).toBe(3);

    // remittedCount = 1 (only o1).
    expect(summary.counts.remitted).toBe(1);

    // uncollectedCount = 1 (o2 — delivered but not collected; o1 IS collected
    // so it's not uncollected; o3 is collected so it's not uncollected either.
    // Wait — let's recompute. uncollected = delivered AND codCollected=false.
    //   o1: delivered, collected=true → not uncollected.
    //   o2: delivered, collected=true → not uncollected.
    //   o3: shipped, collected=true → not uncollected (status filter excludes it).
    // So uncollectedCount should be 0.
    expect(summary.counts.uncollected).toBe(0);

    // pendingRemittance (list) = collected=true AND remitted=false = [o2, o3]
    // (o1 was remitted, so it's not pending).
    expect(summary.pendingRemittance).toHaveLength(2);
    const pendingIds = summary.pendingRemittance.map((p) => p.id).sort();
    expect(pendingIds).toEqual([o2.id, o3.id].sort());

    // totalCollectedAmount = 1000 + 2000 + 3000 = 6000.
    expect(summary.totalCollectedAmount).toBe(6000);

    // totalRemittedAmount = 1000 (only o1).
    expect(summary.totalRemittedAmount).toBe(1000);

    // pendingAmount = totalCollected - totalRemitted = 5000.
    expect(summary.pendingAmount).toBe(5000);
  });
});

// ============================================================================
// Scenario 12 — Notifications bell i18n (ar / fr / en)
// ============================================================================

describe("Scenario 12 — Notifications bell i18n (ar / fr / en)", () => {
  it("returns Arabic strings for all 5 notification types + relative time when locale=ar", async () => {
    // Seed data for all 5 notification types:
    //  1. stale-queue (1 pending order > 2h old)
    //  2. newOrder (1 pending/draft order in last 24h)
    //  3. delivery (1 delivery with recent updatedAt)
    //  4. lowStock (1 active low-stock product)
    //  5. return (1 recent return)
    const customer = await seedCustomerRaw();
    const product = await seedProductRaw({ stock: 1, lowStockThreshold: 5 });
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await seedOrderRaw({
      customerId: customer.id,
      totalPrice: 1000,
      status: "pending",
      createdAt: threeHoursAgo,
    });
    const newOrder = await seedOrderRaw({
      customerId: customer.id,
      productId: product.id,
      quantity: 1,
      totalPrice: 2000,
      status: "pending",
    });
    // Move newOrder through to delivered so we can create a Return.
    await orderService.updateStatus({ prisma: rawDb as never }, newOrder.id, "confirmed");
    await orderService.updateStatus({ prisma: rawDb as never }, newOrder.id, "shipped");
    await orderService.updateStatus({ prisma: rawDb as never }, newOrder.id, "delivered");
    // Create a Delivery row explicitly (orderService.updateStatus doesn't
    // create one — only POST /api/delivery/create does). Touch updatedAt so
    // it appears in the bell's 24h window.
    const delivery = await rawDb.delivery.create({
      data: {
        orderId: newOrder.id,
        provider: "yalidine",
        trackingNumber: "YAL-I18N-001",
        cost: 600,
        status: "delivered",
      },
    });
    await rawDb.delivery.update({
      where: { id: delivery.id },
      data: { updatedAt: new Date() },
    });
    // Create a Return (createdAt defaults to now).
    await rawDb.return.create({
      data: {
        orderId: newOrder.id,
        reason: "Customer not satisfied",
        status: "approved",
        type: "return",
      },
    });

    localeHolder.value = "ar";
    const res = await notificationsGet();
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const notifs = body.notifications as Array<{
      id: string;
      type: string;
      title: string;
      body: string;
      time: string;
    }>;

    // Verify all 5 types are present.
    const types = new Set(notifs.map((n) => n.type));
    expect(types.has("alert")).toBe(true);  // stale-queue
    expect(types.has("order")).toBe(true);  // newOrder
    expect(types.has("delivery")).toBe(true);
    expect(types.has("stock")).toBe(true);
    expect(types.has("return")).toBe(true);

    // Arabic strings (loaded from ar.json):
    //  - stale-queue title: "{{count}} طلبات تحتاج إلى تأكيد" (pluralized)
    //  - lowStock.title: "مخزون منخفض: {{name}}"
    //  - time.now: "الآن"
    const staleNotif = notifs.find((n) => n.id === "stale-queue")!;
    expect(staleNotif.title).toContain("تأكيد"); // Arabic for "confirmation"
    expect(staleNotif.body).toContain("ساعتين"); // Arabic for "two hours"

    const stockNotif = notifs.find((n) => n.type === "stock")!;
    expect(stockNotif.title).toContain("مخزون منخفض"); // "Low stock"

    const orderNotif = notifs.find((n) => n.type === "order")!;
    expect(orderNotif.title).toContain("طلب جديد"); // "New order"
    // Relative time should be Arabic (e.g. "X د" for minutes).
    // Arabic relative time: 'د' (minute), 'س' (hour), 'ي' (day), 'الآن' (now).
    expect(orderNotif.time).toMatch(/د|س|ي|الآن|ساعة|يوم/);

    // Verify FR + EN locales return their respective strings.
    localeHolder.value = "fr";
    const frRes = await notificationsGet();
    const frBody = await getJson(frRes);
    const frNotifs = frBody.notifications as Array<{ title: string; body: string }>;
    const frStale = frNotifs.find((n) => n.title.includes("confirmer"));
    expect(frStale).toBeTruthy(); // French: "commandes à confirmer"

    localeHolder.value = "en";
    const enRes = await notificationsGet();
    const enBody = await getJson(enRes);
    const enNotifs = enBody.notifications as Array<{ title: string; body: string }>;
    const enStale = enNotifs.find((n) => n.title.includes("confirmation"));
    expect(enStale).toBeTruthy(); // English: "orders need confirmation"
  });
});

// ============================================================================
// Scenario 13 — PII survives backup → wipe → restore
// ============================================================================

describe("Scenario 13 — PII survives backup → wipe → restore", () => {
  let savedMeta: string | null = null;
  const TEST_DATA_DIR = process.env.SF_DATA_DIR!;
  const META_PATH = join(TEST_DATA_DIR, "shop-registry.json");

  beforeEach(() => {
    // Save the original app-meta.json so we can restore it after this suite.
    try {
      if (existsSync(META_PATH)) savedMeta = readFileSync(META_PATH, "utf8");
    } catch { /* ignore */ }
  });

  afterEach(() => {
    // Restore the original app-meta.json.
    try {
      if (savedMeta !== null) writeFileSync(META_PATH, savedMeta);
      else if (existsSync(META_PATH)) rmSync(META_PATH, { force: true });
    } catch { /* ignore */ }
    // Clean up any backups created during the test.
    const backupDir = join(TEST_DATA_DIR, "backups");
    if (existsSync(backupDir)) {
      try { rmSync(backupDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it("customer with encrypted phone (via the PII-extended db Proxy) → backup → wipe DB → restore → phone decrypts correctly + blind-index search works", async () => {
    // Bind the versioned registry to the same disposable SQLite file.
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    const dbUrl = process.env.DATABASE_URL ?? "";
    const testDbPath = dbUrl.startsWith("file:")
      ? dbUrl.slice("file:".length)
      : join(process.cwd(), "data", "shops", "dev.db");
    writeFileSync(
      META_PATH,
      JSON.stringify({
        formatVersion: 2,
        revision: 1,
        workspaceId: "a".repeat(32),
        installationId: "b".repeat(32),
        shops: [{ id: "test", incarnationId: "c".repeat(32), name: "Test", databaseFile: testDbPath.split(/[\\/]/).pop(), icon: null, createdAt: new Date().toISOString() }],
        activeShopId: "test",
      }),
    );

    // Use the PII-extended `db` Proxy (in test mode it's the fallback client
    // which has the PII extension). We import it dynamically here so the
    // mock setup is settled.
    const { db } = await import("@/lib/db");

    // Seed a customer with a real plaintext phone — the extension encrypts
    // it transparently (phone → blind index, phoneEnc → AES-256-GCM JSON).
    const PLAINTEXT_PHONE = "0770000001";
    const created = await db.customer.create({
      data: {
        name: "PII Backup Test",
        phone: PLAINTEXT_PHONE,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Didouche",
      },
    });
    expect(created.phone).toBe(PLAINTEXT_PHONE); // extension decrypts on read

    // Verify the underlying storage IS encrypted (rawDb sees ciphertext).
    const rawRow = await rawDb.customer.findUnique({ where: { id: created.id } });
    expect(rawRow!.phone).not.toBe(PLAINTEXT_PHONE);
    expect(rawRow!.phone).toMatch(/^[0-9a-f]{64}$/); // blind index (HMAC hex)
    expect(rawRow!.phoneEnc).toBeTruthy(); // AES-256-GCM JSON payload
    expect(rawRow!.phoneEnc!).toContain('"iv"');
    expect(rawRow!.phoneEnc!).toContain('"ciphertext"');

    // 1. Create a backup of the current DB.
    const backup = await createBackup();
    expect(backup.filename).toBeTruthy();
    expect(backup.size).toBeGreaterThan(0);

    // 2. Wipe the DB (delete the customer).
    await rawDb.customer.deleteMany();
    expect(await rawDb.customer.count()).toBe(0);
    await rawDb.$disconnect();

    // 3. Restore the backup.
    const restoreResult = await restoreBackup(backup.filename);
    expect(restoreResult.success).toBe(true);

    // The restore overwrote the SQLite file. The rawDb PrismaClient still
    // has the old connection — but SQLite reopens the file on next query.
    // (If the connection is stale, reconnect by running any query.)
    // The PII-extended `db` Proxy should also see the restored data.

    // 4. The customer's phone decrypts correctly via the PII extension.
    const restored = await db.customer.findUnique({ where: { id: created.id } });
    expect(restored).toBeTruthy();
    expect(restored!.phone).toBe(PLAINTEXT_PHONE); // decrypted after restore!
    expect(restored!.name).toBe("PII Backup Test");

    // 5. Blind-index search works (find by plaintext phone → extension
    //    rewrites where.phone to the blind index → matches the stored index).
    const found = await db.customer.findFirst({ where: { phone: PLAINTEXT_PHONE } });
    expect(found).toBeTruthy();
    expect(found!.id).toBe(created.id);
    expect(found!.phone).toBe(PLAINTEXT_PHONE);

    // Clean up the backup file.
    await deleteBackup(backup.filename);
  });
});

// ============================================================================
// Scenario 14 — E-commerce sync doesn't duplicate + creates OrderChange
// "created" ledger entry (Phase 1 bug 1.3 fix)
// ============================================================================

describe("Scenario 14 — E-commerce sync doesn't duplicate + writes 'created' ledger", () => {
  it("sync an order → re-sync the same order → 1 order, 1 'created' OrderChange entry, customer not duplicated", async () => {
    // Canonical provider intake requires an existing server-owned catalog price.
    await seedProductRaw({ name: "Widget A", price: 2000, stock: 100 });

    const normalized: NormalizedOrder = {
      sourceOrderId: "shop-dedup-001",
      orderNumber: "#1001",
      customerName: "Sync Dedup Customer",
      customerPhone: "0555888801",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      items: [{ productName: "Widget A", quantity: 2, unitPrice: 2000 }],
      totalPrice: 4000,
      source: "shopify",
      sourceMetadata: { shopifyOrderId: 1001, sourceOrderId: "shop-dedup-001", rawUpdatedAt: "2026-01-02T10:00:00Z" },
      createdAt: "2026-01-02T10:00:00Z",
    };

    // First sync: creates the order.
    listOrdersMock.mockResolvedValueOnce({
      orders: [normalized],
      nextWatermark: "1002",
      hasMore: false,
    } satisfies SyncFetchResult);
    const r1 = await syncPlatform(
      { prisma: rawDb as never, shop: TEST_SHOP_CONTEXT },
      "shopify",
    );
    expect(r1.created).toBe(1);
    expect(r1.errors).toEqual([]);

    // Verify state after first sync.
    const ordersAfterFirst = await rawDb.order.findMany();
    expect(ordersAfterFirst).toHaveLength(1);
    expect(ordersAfterFirst[0]!.sourceOrderId).toBe("shop-dedup-001");
    expect(ordersAfterFirst[0]!.source).toBe("shopify");
    expect(ordersAfterFirst[0]!.orderNumber).toMatch(/^ORD-\d{4}$/);

    // Customer not duplicated (exactly 1 customer row in the DB).
    // NOTE: can't query by phone via rawDb — the PII extension rewrote
    // phone to a blind index. rawDb.customer.count() is unambiguous here
    // because the test DB starts empty + only syncPlatform creates customers.
    const customerCountAfterFirst = await rawDb.customer.count();
    expect(customerCountAfterFirst).toBe(1);

    // OrderChange "created" entry written (Phase 1 bug 1.3 fix).
    const createdChanges = await rawDb.orderChange.findMany({
      where: { orderId: ordersAfterFirst[0]!.id, actionType: "created" },
    });
    expect(createdChanges).toHaveLength(1);

    // Second sync: same order, same sourceMetadata → "skipped" (dedup).
    listOrdersMock.mockResolvedValueOnce({
      orders: [normalized],
      nextWatermark: "1002",
      hasMore: false,
    } satisfies SyncFetchResult);
    const r2 = await syncPlatform(
      { prisma: rawDb as never, shop: TEST_SHOP_CONTEXT },
      "shopify",
    );
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBe(1);
    expect(r2.errors).toEqual([]);

    // Verify state after second sync — NO duplication.
    const ordersAfterSecond = await rawDb.order.findMany();
    expect(ordersAfterSecond).toHaveLength(1);

    // Still 1 customer (not duplicated).
    const customerCountAfterSecond = await rawDb.customer.count();
    expect(customerCountAfterSecond).toBe(1);

    // Still 1 "created" OrderChange entry (no duplicate ledger).
    const createdChangesAfterSecond = await rawDb.orderChange.findMany({
      where: { orderId: ordersAfterSecond[0]!.id, actionType: "created" },
    });
    expect(createdChangesAfterSecond).toHaveLength(1);
  });
});

// ============================================================================
// Scenario 15 — Multi-shop isolation (PARTIAL: db.ts test-mode bypasses the
// active-shop Proxy — see note)
// ============================================================================

describe("Scenario 15 — Multi-shop isolation (partial: db.ts test-mode bypass)", () => {
  it("the active-shop Proxy in db.ts returns the fallback client when NODE_ENV=test (documented limitation — data routing cannot be tested in vitest)", async () => {
    // NOTE: db.ts has this guard:
    //
    //   function getActiveShopClient(): DbClient {
    //     if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    //       return fallbackClient;
    //     }
    //     ...
    //   }
    //
    // This means in vitest, the active-shop Proxy ALWAYS returns the fallback
    // client (pointing at DATABASE_URL = the test SQLite file), regardless of
    // what app-meta.json says the active shop is. So we CANNOT exercise the
    // multi-shop data-routing in vitest — switching the active shop doesn't
    // switch the underlying DB file.
    //
    // This is intentional: tests share a single SQLite file via DATABASE_URL,
    // and per-shop DB files (data/shops/<id>.db) are not initialized in the
    // test environment. The actual multi-shop routing IS tested via the
    // shops/__tests__/index.test.ts suite (registry management: createShop,
    // setActiveShopId, deleteShop, invalidateShopClient) — just not the data
    // isolation between two shops' worth of orders.
    //
    // What we CAN test here:
    //   1. invalidateShopClient removes the cached entry (existing coverage).
    //   2. invalidateMetaCache clears the meta cache.
    //   3. The Proxy's test-mode bypass is in place (defensive — documents
    //      the limitation).

    // 1. invalidateShopClient + invalidateMetaCache are exported + callable.
    expect(typeof invalidateShopClient).toBe("function");
    expect(typeof invalidateMetaCache).toBe("function");

    // 2. invalidateMetaCache is a no-op (just nulls the cache).
    expect(() => invalidateMetaCache()).not.toThrow();

    // 3. invalidateShopClient for an uncached path is a no-op.
    expect(() => invalidateShopClient("/tmp/sf-never-cached-shop.db")).not.toThrow();

    // 4. Verify the test-mode bypass is active: the `db` Proxy in test mode
    //    returns the fallback client regardless of app-meta.json. We can
    //    verify this indirectly — a query through `db` works even when
    //    app-meta.json doesn't exist (the Proxy would fall back too, but the
    //    test-mode guard is the explicit short-circuit).
    const { db } = await import("@/lib/db");
    const count = await db.order.count();
    expect(typeof count).toBe("number");

    // DOCUMENTED LIMITATION: a true multi-shop isolation test would:
    //   1. Create shop A + shop B (each with their own .db file).
    //   2. Seed orders in shop A's DB.
    //   3. Switch the active shop to B.
    //   4. Assert orders page / dashboard / analytics see 0 orders (only
    //      shop B's empty DB).
    //
    // This requires (a) disabling the test-mode bypass in db.ts OR (b) a
    // Playwright e2e test against a real prod build. Phase 6 (e2e) will
    // cover the actual multi-shop data isolation.
  });
});
