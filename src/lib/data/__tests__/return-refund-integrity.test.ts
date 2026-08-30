/**
 * Regression test for Phase 1 bug 1.1 (Return + Refund double-counting) and
 * the B7-3 repair (return completion money fact).
 *
 * Scenario (the standard Algerian COD return+refund flow):
 *   1. Create + confirm + ship + deliver an order (product stock 10 → 5,
 *      customer.orderCount 0 → 1, customer.totalSpent 0 → 5000).
 *   2. Issue the full-settling Refund via createRefund — it pairs the
 *      compensation money fact with the delivered→returned physical
 *      transition (variant-aware stock restore + stats reversal).
 *   3. Complete the Return row afterwards — a no-op transition that only
 *      records the physical fact.
 *
 * Before B7-3:
 *   - Completing a Return on a delivered order reversed full revenue stats
 *     and restored all stock with NO compensation money fact (INV-023 gap),
 *     and after a partial refund it could push totalSpent negative.
 *
 * After B7-3:
 *   - Refund-type return completion on a delivered order is refused with
 *     RETURN_COMPLETION_REQUIRES_REFUND_FACT; the governed refund flow is
 *     the only delivered→returned path. Pre-delivery completions (shipped/
 *     confirmed) keep their stock-only semantics, and exchanges ride the
 *     replacement order as their compensation fact.
 *
 * Assertions: stock restored EXACTLY once (back to 10), totalSpent decremented
 * EXACTLY once (5000 → 0, never negative), order.status = "returned", Refund
 * row exists, Return row completes.
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

// The route authorization boundary is covered independently. This integrity
// fixture focuses on the transactional stock and customer-stat effects.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: vi.fn(async () => ({})),
}));

// Mock the automation dispatcher so orderService.updateStatus's fire-and-forget
// dispatchTrigger('order.confirmed'/'order.shipped'/'order.delivered'/'order.returned')
// is a no-op. Without this, the dispatch can still be in flight when the next
// test's disconnectTestPrisma() runs (or when the next test file starts),
// causing flaky races with other test files that share the SQLite file
// (see Phase 3 worklog note on waitForDispatch).
//
// detectLowStock + dispatchLowStock are also mocked because orderService imports
// them from the same module and vi.mock replaces the whole module — leaving
// them undefined would crash on the awaited detectLowStock call inside the
// `confirmed` transition (stock-check branch). Mirrors the pattern documented
// at src/app/api/__tests__/orders.test.ts:40-44 (W2-7).
//
// No assertion in this test file checks that a trigger fired — all assertions
// are on DB state (stock, customer stats, refund rows, order.status).
vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger: vi.fn(async () => {}),
  dispatchLowStock: vi.fn(async () => {}),
  detectLowStock: vi.fn(async () => null),
}));

import { PATCH as patchReturn } from "@/app/api/returns/[id]/route";
import { getJson, mockPost } from "@/app/api/__tests__/helpers";

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
  it("full-settling refund performs the physical return with the money fact; Return completion afterwards records the physical fact without double effects (B7-3)", async () => {
    const { order, customer, product } = await seedDeliveredOrder();

    // Sanity: stock was deducted at confirm (10 → 5), customer stats
    // incremented at deliver (0/0 → 1/5000).
    const productAfterDeliver = await db.product.findUnique({ where: { id: product.id } });
    expect(productAfterDeliver!.stock).toBe(5);
    const customerAfterDeliver = await db.customer.findUnique({ where: { id: customer.id } });
    expect(customerAfterDeliver!.orderCount).toBe(1);
    expect(customerAfterDeliver!.totalSpent).toBe(5000);

    // B7-3 flow: the governed refund runs FIRST — the full-settling refund
    // pairs the compensation money fact with the delivered→returned
    // physical transition (variant-aware stock restoration + stats).
    const refund = await createRefund({ prisma: db as never }, {
      orderId: order.id,
      amount: 5000,
      method: "cash",
      reason: "Full refund with physical return",
      actor: "user",
    });
    expect(refund.amount).toBe(5000);

    const orderAfterRefund = await db.order.findUnique({ where: { id: order.id } });
    expect(orderAfterRefund!.status).toBe("returned");
    const productAfterRefund = await db.product.findUnique({ where: { id: product.id } });
    expect(productAfterRefund!.stock).toBe(10); // restored EXACTLY once
    const customerAfterRefund = await db.customer.findUnique({ where: { id: customer.id } });
    expect(customerAfterRefund!.orderCount).toBe(0);
    expect(customerAfterRefund!.totalSpent).toBe(0); // decremented EXACTLY once

    // The Return row completes afterwards: the order is already returned,
    // so the transition is a no-op that only records the physical fact.
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

    // CRITICAL: nothing double-applied — stock restored once, stats
    // decremented once, no extra status flip.
    expect((await db.order.findUnique({ where: { id: order.id } }))!.status).toBe("returned");
    expect((await db.product.findUnique({ where: { id: product.id } }))!.stock).toBe(10);
    expect(await db.customer.findUnique({ where: { id: customer.id } }))
      .toMatchObject({ orderCount: 0, totalSpent: 0 });

    // Money fact + physical fact both recorded.
    const refunds = await db.refund.findMany({ where: { orderId: order.id } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amount).toBe(5000);
    expect((await db.return.findUnique({ where: { id: ret.id } }))?.status).toBe("completed");
  });

  it("direct refund on a delivered order (no Return flow) still decrements totalSpent by refund amount", async () => {
    const { order, customer } = await seedDeliveredOrder();

    // No Return flow — issue a refund directly on the "delivered" order.
    await createRefund({ prisma: db as never }, {
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

  it("return completion after a partial refund is refused — totalSpent cannot be pushed negative (B7-3)", async () => {
    const { order, customer, product } = await seedDeliveredOrder();

    // Partial refund on the delivered order: money-only (2000 of 5000),
    // stats 5000 → 3000, stock stays outbound.
    await createRefund({ prisma: db as never }, {
      orderId: order.id,
      amount: 2000,
      method: "cash",
      reason: "Partial refund",
      actor: "user",
    });
    expect((await db.customer.findUnique({ where: { id: customer.id } }))!.totalSpent).toBe(3000);

    // Completing a refund-type return now would reverse the FULL revenue
    // stats (−5000) on top of the partial refund → totalSpent −2000. The
    // B7-3 gate refuses it: the remaining 3000 must go through the refund
    // flow (which settles the receivable and performs the physical return).
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
    const body = await getJson(res);
    expect(res.status).toBe(409);
    expect(body.code).toBe("RETURN_COMPLETION_REQUIRES_REFUND_FACT");

    // Nothing moved: totalSpent stays 3000 (not negative), stock still
    // outbound (5), order still delivered, return row still approved.
    expect(await db.customer.findUnique({ where: { id: customer.id } }))
      .toMatchObject({ orderCount: 1, totalSpent: 3000 });
    expect((await db.product.findUnique({ where: { id: product.id } }))!.stock).toBe(5);
    expect((await db.order.findUnique({ where: { id: order.id } }))!.status).toBe("delivered");
    expect((await db.return.findUnique({ where: { id: ret.id } }))?.status).toBe("approved");
  });
});
