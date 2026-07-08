/**
 * Regression test for Phase 1 bug 1.1 — Return + Refund double-counting.
 *
 * Scenario (the standard Algerian COD return+refund flow):
 *   1. Create + confirm + ship + deliver an order (product stock 10 → 5,
 *      customer.orderCount 0 → 1, customer.totalSpent 0 → 5000).
 *   2. Complete a Return on the order via PATCH /api/returns/[id].
 *   3. Issue a Refund on the same order via createRefund.
 *
 * Before the fix:
 *   - The Return flow restored stock + decremented totalSpent INLINE without
 *     flipping order.status to "returned".
 *   - The Refund flow then saw status === "delivered" and re-applied the same
 *     side effects → stock restored 2× + totalSpent decremented 2×.
 *
 * After the fix:
 *   - The Return flow routes through orderService.updateStatus("returned")
 *     (single source of truth): stock restored once, customer stats reversed
 *     once, order.status = "returned".
 *   - The Refund flow sees status === "returned" and SKIPS the inline
 *     transition + step 8 totalSpent decrement (the Return flow already did
 *     them). It only creates the Refund row.
 *
 * Assertions: stock restored EXACTLY once (back to 10), totalSpent decremented
 * EXACTLY once (5000 → 0, not -5000), order.status = "returned", Refund row
 * exists.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { orderService } from "@/lib/data/order-service";
import { createRefund } from "@/lib/data/refund-service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  seedProduct,
} from "@/lib/data/__tests__/helpers";

// ── Mock next/headers — returns/[id] PATCH calls requireAuth() which reads
//    cookies. With a clean DB (no AuthSecret row), isAuthenticated() returns
//    true (setup mode) — an empty cookie jar passes requireAuth.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

import { PATCH as patchReturn } from "@/app/api/returns/[id]/route";
import { mockPost } from "@/app/api/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

/** Seed a delivered order with stock deduction + customer stats increment. */
async function seedDeliveredOrder() {
  const customer = await seedCustomer(db);
  const product = await seedProduct(db, { stock: 10 });
  const order = await db.order.create({
    data: {
      orderNumber: "ORD-RR-0001",
      status: "pending",
      customerId: customer.id,
      totalPrice: 5000,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555123456",
      source: "manual",
      items: {
        create: [{
          productId: product.id,
          productName: "Test Product",
          quantity: 5,
          unitPrice: 1000,
          total: 5000,
        }],
      },
    },
    include: { items: true, customer: true },
  });
  // Drive the order through the canonical state machine: pending → confirmed
  // (deducts stock 10 → 5) → shipped → delivered (increments customer stats
  // 0/0 → 1/5000).
  await orderService.updateStatus({ prisma: db as never }, order.id, "confirmed");
  await orderService.updateStatus({ prisma: db as never }, order.id, "shipped");
  await orderService.updateStatus({ prisma: db as never }, order.id, "delivered");

  return { order, customer, product };
}

describe("Return + Refund integrity (Phase 1 bug 1.1)", () => {
  it("does NOT double-count stock + totalSpent when Return is completed first then Refund is issued", async () => {
    const { order, customer, product } = await seedDeliveredOrder();

    // Sanity: stock was deducted at confirm (10 → 5), customer stats
    // incremented at deliver (0/0 → 1/5000).
    const productAfterDeliver = await db.product.findUnique({ where: { id: product.id } });
    expect(productAfterDeliver!.stock).toBe(5);
    const customerAfterDeliver = await db.customer.findUnique({ where: { id: customer.id } });
    expect(customerAfterDeliver!.orderCount).toBe(1);
    expect(customerAfterDeliver!.totalSpent).toBe(5000);

    // Create a Return row in "requested" status, then complete it via the API.
    const ret = await db.return.create({
      data: {
        orderId: order.id,
        reason: "Customer changed mind",
        status: "approved",
        type: "refund",
      },
    });

    const res = await patchReturn(
      mockPost(`http://localhost/api/returns/${ret.id}`, { status: "completed" }),
      { params: Promise.resolve({ id: ret.id }) },
    );
    expect(res.status).toBe(200);

    // After Return: order.status = "returned", stock restored once (5 → 10),
    // customer stats reversed once (1/5000 → 0/0).
    const orderAfterReturn = await db.order.findUnique({ where: { id: order.id } });
    expect(orderAfterReturn!.status).toBe("returned");

    const productAfterReturn = await db.product.findUnique({ where: { id: product.id } });
    expect(productAfterReturn!.stock).toBe(10); // restored EXACTLY once

    const customerAfterReturn = await db.customer.findUnique({ where: { id: customer.id } });
    expect(customerAfterReturn!.orderCount).toBe(0);
    expect(customerAfterReturn!.totalSpent).toBe(0); // decremented EXACTLY once

    // Now issue a full Refund on the same order.
    const refund = await createRefund({
      orderId: order.id,
      amount: 5000,
      method: "cash",
      reason: "Full refund after return",
      returnId: ret.id,
      actor: "user",
    });
    expect(refund).toBeTruthy();
    expect(refund.amount).toBe(5000);

    // The Refund row exists.
    const refunds = await db.refund.findMany({ where: { orderId: order.id } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amount).toBe(5000);

    // CRITICAL: stock + totalSpent should NOT have changed (no second restore
    // or decrement). Before the fix, stock would be 15 (2× restore) and
    // totalSpent would be -5000 (2× decrement by 5000).
    const productAfterRefund = await db.product.findUnique({ where: { id: product.id } });
    expect(productAfterRefund!.stock).toBe(10); // still restored EXACTLY once

    const customerAfterRefund = await db.customer.findUnique({ where: { id: customer.id } });
    expect(customerAfterRefund!.orderCount).toBe(0); // unchanged
    expect(customerAfterRefund!.totalSpent).toBe(0); // still decremented EXACTLY once

    // Order is still "returned" (Refund flow didn't re-flip it).
    const orderAfterRefund = await db.order.findUnique({ where: { id: order.id } });
    expect(orderAfterRefund!.status).toBe("returned");

    // Refund total = 5000 (only one Refund row).
    const refundsForOrder = await db.refund.findMany({ where: { orderId: order.id } });
    const totalRefunded = refundsForOrder.reduce((s, r) => s + r.amount, 0);
    expect(totalRefunded).toBe(5000);
  });

  it("direct refund on a delivered order (no Return flow) still decrements totalSpent by refund amount", async () => {
    const { order, customer } = await seedDeliveredOrder();

    // No Return flow — issue a refund directly on the "delivered" order.
    await createRefund({
      orderId: order.id,
      amount: 5000,
      method: "cash",
      reason: "Direct refund",
      actor: "user",
    });

    // Order flipped to "returned" (Refund flow's delivered branch).
    const updatedOrder = await db.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe("returned");

    // Customer stats: orderCount decremented once (1 → 0), totalSpent
    // decremented once by refund.amount (5000 → 0).
    const updatedCustomer = await db.customer.findUnique({ where: { id: customer.id } });
    expect(updatedCustomer!.orderCount).toBe(0);
    expect(updatedCustomer!.totalSpent).toBe(0);
  });

  it("partial refund after Return does not push totalSpent negative", async () => {
    const { order, customer, product } = await seedDeliveredOrder();

    // Complete a Return first.
    const ret = await db.return.create({
      data: {
        orderId: order.id,
        reason: "Customer changed mind",
        status: "approved",
        type: "refund",
      },
    });
    await patchReturn(
      mockPost(`http://localhost/api/returns/${ret.id}`, { status: "completed" }),
      { params: Promise.resolve({ id: ret.id }) },
    );

    // After Return: totalSpent = 0 (decremented by order.totalPrice = 5000).
    const customerAfterReturn = await db.customer.findUnique({ where: { id: customer.id } });
    expect(customerAfterReturn!.totalSpent).toBe(0);

    // Issue a partial refund of 2000.
    await createRefund({
      orderId: order.id,
      amount: 2000,
      method: "cash",
      reason: "Partial refund",
      returnId: ret.id,
      actor: "user",
    });

    // totalSpent should NOT be decremented again (would be -2000 before fix).
    const customerAfterRefund = await db.customer.findUnique({ where: { id: customer.id } });
    expect(customerAfterRefund!.totalSpent).toBe(0);

    // Stock should still be 10 (only restored once via Return flow).
    const productAfterRefund = await db.product.findUnique({ where: { id: product.id } });
    expect(productAfterRefund!.stock).toBe(10);

    // Refund row records the partial amount.
    const refunds = await db.refund.findMany({ where: { orderId: order.id } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amount).toBe(2000);
  });
});
