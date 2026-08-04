/**
 * Integration tests for the `stock.low` trigger producer wiring.
 *
 * Verifies that product/order mutations queue durable automation work when stock
 * reaches the threshold, and do not queue it while stock remains above it. The
 * legacy test projection records only `queued`; worker execution is covered by
 * the dedicated durable automation integration suite.
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

/** Poll the queued-trigger projection until a `stock.low` row appears. */
async function waitForLowStockLog(
  db: PrismaClient,
  timeoutMs = 2000,
): Promise<{
  count: number;
  latest: { trigger: string; status: string; message: string | null } | null;
}> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const logs = await db.automationLog.findMany({
      where: { trigger: "stock.low" },
      orderBy: { createdAt: "desc" },
    });
    if (logs.length > 0) {
      return {
        count: logs.length,
        latest: {
          trigger: logs[0]!.trigger,
          status: logs[0]!.status,
          message: logs[0]!.message,
        },
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return { count: 0, latest: null };
}

async function createLowStockAutomation(db: PrismaClient): Promise<string> {
  const automation = await db.automation.create({
    data: {
      name: "Low-stock notifier",
      trigger: "stock.low",
      action: "send_notification",
      config: JSON.stringify({
        messageTemplate: "Low stock: {{productName}}",
      }),
      isActive: true,
      runCount: 0,
    },
  });
  return automation.id;
}

describe("stock.low dispatch via productService.update", () => {
  it("queues stock.low when stock is updated to/below the threshold", async () => {
    const category = await seedCategory(db);
    const product = await seedProduct(db, {
      stock: 50,
      lowStockThreshold: 5,
      categoryId: category.id,
    });
    await createLowStockAutomation(db);

    await productService.update(
      { prisma: db as never },
      product.id,
      { stock: 2 },
    );

    const result = await waitForLowStockLog(db);
    expect(result.count).toBeGreaterThan(0);
    expect(result.latest!.trigger).toBe("stock.low");
    expect(result.latest!.status).toBe("queued");
  });

  it("does not queue stock.low when stock stays above the threshold", async () => {
    const category = await seedCategory(db);
    const product = await seedProduct(db, {
      stock: 50,
      lowStockThreshold: 5,
      categoryId: category.id,
    });
    await createLowStockAutomation(db);

    await productService.update(
      { prisma: db as never },
      product.id,
      { stock: 10 },
    );

    const result = await waitForLowStockLog(db, 500);
    expect(result.count).toBe(0);
  });
});

describe("stock.low dispatch via orderService.updateStatus", () => {
  it("queues stock.low on confirm when stock deduction reaches the threshold", async () => {
    const customer = await seedCustomer(db);
    const product = await seedProduct(db, {
      stock: 8,
      lowStockThreshold: 5,
    });
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
          create: [
            {
              productId: product.id,
              productName: "Test",
              quantity: 5,
              unitPrice: 1000,
              total: 5000,
            },
          ],
        },
      },
      include: { items: true },
    });

    await orderService.updateStatus(
      { prisma: db as never },
      order.id,
      "confirmed",
    );

    const result = await waitForLowStockLog(db);
    expect(result.count).toBeGreaterThan(0);
    expect(result.latest!.trigger).toBe("stock.low");
    expect(result.latest!.status).toBe("queued");

    const updated = await db.product.findUnique({ where: { id: product.id } });
    expect(updated!.stock).toBe(3);
  });

  it("does not queue stock.low when stock remains above the threshold", async () => {
    const customer = await seedCustomer(db);
    const product = await seedProduct(db, {
      stock: 50,
      lowStockThreshold: 5,
    });
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
          create: [
            {
              productId: product.id,
              productName: "Test",
              quantity: 5,
              unitPrice: 1000,
              total: 5000,
            },
          ],
        },
      },
      include: { items: true },
    });

    await orderService.updateStatus(
      { prisma: db as never },
      order.id,
      "confirmed",
    );

    const result = await waitForLowStockLog(db, 500);
    expect(result.count).toBe(0);
  });
});
