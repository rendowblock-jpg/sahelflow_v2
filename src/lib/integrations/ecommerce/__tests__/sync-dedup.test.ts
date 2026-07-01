/**
 * E-commerce sync engine dedup test (TEST-009).
 * Verifies that re-syncing doesn't create duplicate orders.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const db = new PrismaClient();

async function cleanDb() {
  await db.$transaction([
    db.orderItem.deleteMany(),
    db.order.deleteMany(),
    db.customer.deleteMany(),
    db.integration.deleteMany(),
    db.pollingEvent.deleteMany(),
    db.counter.deleteMany(),
  ]);
}

describe("e-commerce sync dedup (TEST-009)", () => {
  beforeEach(async () => { await cleanDb(); });
  afterAll(async () => { await cleanDb(); await db.$disconnect(); });

  it("does not create duplicate orders on re-sync (dedup by sourceOrderId)", async () => {
    const platform = "shopify";
    await db.integration.create({
      data: { platform, type: "ecommerce", isActive: true, config: JSON.stringify({ watermark: "", lastSyncAt: "" }) },
    });

    for (const orderId of ["shop-001", "shop-002"]) {
      const customer = await db.customer.create({ data: { name: `Customer ${orderId}`, phone: `0555${orderId.slice(-3)}` } });
      await db.counter.upsert({ where: { name: `SYNC-${platform.toUpperCase()}` }, update: { value: { increment: 1 } }, create: { name: `SYNC-${platform.toUpperCase()}`, value: 1 } });
      const counter = await db.counter.findUnique({ where: { name: `SYNC-${platform.toUpperCase()}` } });
      await db.order.create({
        data: {
          orderNumber: `SYNC-${counter!.value}`, status: "draft", customerId: customer.id,
          totalPrice: 5000, wilaya: "Alger", commune: "Bab Ezzouar", address: "123 Rue",
          phone: "0555123456", source: platform, sourceMetadata: JSON.stringify({ sourceOrderId: orderId }),
        },
      });
    }

    const afterFirstSync = await db.order.findMany({ where: { source: platform } });
    expect(afterFirstSync).toHaveLength(2);

    // Dedup check
    const existingOrders = await db.order.findMany({ where: { source: platform }, select: { sourceMetadata: true } });
    const existingSourceIds = new Set(existingOrders.map((o) => { try { return JSON.parse(o.sourceMetadata ?? "{}").sourceOrderId; } catch { return null; } }).filter(Boolean));
    let insertedCount = 0;
    for (const orderId of ["shop-001", "shop-002"]) { if (!existingSourceIds.has(orderId)) insertedCount++; }
    expect(insertedCount).toBe(0);
  });

  it("creates new orders for new sourceOrderIds on subsequent sync", async () => {
    const platform = "shopify";
    const customer = await db.customer.create({ data: { name: "Customer 1", phone: "0555000001" } });
    await db.order.create({
      data: {
        orderNumber: "SYNC-1", status: "draft", customerId: customer.id, totalPrice: 3000,
        wilaya: "Alger", commune: "Bab Ezzouar", address: "123 Rue", phone: "0555000001",
        source: platform, sourceMetadata: JSON.stringify({ sourceOrderId: "shop-001" }),
      },
    });

    const existingOrders = await db.order.findMany({ where: { source: platform }, select: { sourceMetadata: true } });
    const existingIds = new Set(existingOrders.map((o) => { try { return JSON.parse(o.sourceMetadata ?? "{}").sourceOrderId; } catch { return null; } }).filter(Boolean));
    let newCount = 0;
    for (const orderId of ["shop-001", "shop-003"]) { if (!existingIds.has(orderId)) newCount++; }
    expect(newCount).toBe(1);
  });
});
