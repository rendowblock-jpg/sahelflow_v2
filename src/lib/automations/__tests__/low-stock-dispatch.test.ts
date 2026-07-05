/**
 * Integration tests for the `stock.low` trigger dispatch wiring.
 *
 * Verifies that:
 *   - `productService.update` dispatches `stock.low` when stock drops to/below
 *     the low-stock threshold.
 *   - `orderService.updateStatus` dispatches `stock.low` on confirm (stock
 *     deduction) when the new stock is at/below threshold.
 *   - No dispatch fires when stock stays above the threshold.
 *
 * The dispatch is fire-and-forget inside the helper, but the helper's read is
 * awaited by the caller — so by the time the service method returns, the
 * `dispatchTrigger` promise has been launched. We poll the AutomationLog table
 * briefly to observe the side effect.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { productService } from "@/lib/data/product-service";
import { orderService } from "@/lib/data/order-service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  seedProduct,
  seedCategory,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

/** Poll the AutomationLog table until a `stock.low` row appears (or timeout). */
async function waitForLowStockLog(
  db: PrismaClient,
  timeoutMs = 2000,
): Promise<{ count: number; latest: { trigger: string; status: string; message: string | null } | null }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const logs = await db.automationLog.findMany({
      where: { trigger: "stock.low" },
      orderBy: { createdAt: "desc" },
    });
    if (logs.length > 0) {
      return {
        count: logs.length,
        latest: { trigger: logs[0]!.trigger, status: logs[0]!.status, message: logs[0]!.message },
      };
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  return { count: 0, latest: null };
}

/** Create a `stock.low` automation with a `send_notification` action. */
async function createLowStockAutomation(db: PrismaClient): Promise<string> {
  const auto = await db.automation.create({
    data: {
      name: "Low-stock notifier",
      trigger: "stock.low",
      action: "send_notification",
      config: JSON.stringify({ messageTemplate: "Low stock: {{productName}}" }),
      isActive: true,
      runCount: 0,
    },
  });
  return auto.id;
}

// ── productService.update → stock.low ─────────────────────────────────────────

describe("stock.low dispatch via productService.update", () => {
  it("fires stock.low when stock is updated to/below the threshold", async () => {
    const cat = await seedCategory(db);
    const product = await seedProduct(db, { stock: 50, lowStockThreshold: 5, categoryId: cat.id });
    await createLowStockAutomation(db);

    // Drop stock from 50 → 2 (below threshold of 5)
    await productService.update({ prisma: db as never }, product.id, { stock: 2 });

    const result = await waitForLowStockLog(db);
    expect(result.count).toBeGreaterThan(0);
    expect(result.latest!.trigger).toBe("stock.low");
    expect(result.latest!.status).toBe("success");
  });

  it("does NOT fire stock.low when stock stays above the threshold", async () => {
    const cat = await seedCategory(db);
    const product = await seedProduct(db, { stock: 50, lowStockThreshold: 5, categoryId: cat.id });
    await createLowStockAutomation(db);

    // Drop stock from 50 → 10 (still above threshold of 5)
    await productService.update({ prisma: db as never }, product.id, { stock: 10 });

    const result = await waitForLowStockLog(db, 500);
    expect(result.count).toBe(0);
  });
});

// ── orderService.updateStatus → stock.low ─────────────────────────────────────

describe("stock.low dispatch via orderService.updateStatus", () => {
  it("fires stock.low on confirm when stock deduction drops to/below threshold", async () => {
    const customer = await seedCustomer(db);
    // Product starts at 8, threshold 5. Confirming an order for qty 5 drops
    // stock to 3 (≤ 5) → should fire stock.low.
    const product = await seedProduct(db, { stock: 8, lowStockThreshold: 5 });
    await createLowStockAutomation(db);

    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001",
        status: "pending",
        customerId: customer.id,
        totalPrice: 5000,
        wilaya: "A",
        commune: "B",
        address: "C",
        phone: "0555123456",
        source: "manual",
        items: {
          create: [{
            productId: product.id,
            productName: "Test",
            quantity: 5,
            unitPrice: 1000,
            total: 5000,
          }],
        },
      },
      include: { items: true },
    });

    await orderService.updateStatus({ prisma: db as never }, order.id, "confirmed");

    const result = await waitForLowStockLog(db);
    expect(result.count).toBeGreaterThan(0);
    expect(result.latest!.trigger).toBe("stock.low");
    expect(result.latest!.status).toBe("success");

    // Sanity: stock was actually decremented to 3
    const updated = await db.product.findUnique({ where: { id: product.id } });
    expect(updated!.stock).toBe(3);
  });

  it("does NOT fire stock.low on confirm when stock stays above threshold", async () => {
    const customer = await seedCustomer(db);
    // Product starts at 50, threshold 5. Confirming qty 5 → stock 45 (> 5).
    const product = await seedProduct(db, { stock: 50, lowStockThreshold: 5 });
    await createLowStockAutomation(db);

    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001",
        status: "pending",
        customerId: customer.id,
        totalPrice: 5000,
        wilaya: "A",
        commune: "B",
        address: "C",
        phone: "0555123456",
        source: "manual",
        items: {
          create: [{
            productId: product.id,
            productName: "Test",
            quantity: 5,
            unitPrice: 1000,
            total: 5000,
          }],
        },
      },
      include: { items: true },
    });

    await orderService.updateStatus({ prisma: db as never }, order.id, "confirmed");

    const result = await waitForLowStockLog(db, 500);
    expect(result.count).toBe(0);
  });
});
