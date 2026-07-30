process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createRefund } from "@/lib/data/refund-service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  seedProduct,
} from "@/lib/data/__tests__/helpers";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined })),
}));
vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger: vi.fn(async () => {}),
  dispatchLowStock: vi.fn(async () => {}),
  detectLowStock: vi.fn(async () => null),
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

/**
 * Seed the exact compatibility state owned by this regression suite.
 *
 * Phase 1 canonical reservations intentionally cannot enter legacy return or
 * refund commands. These tests cover historical/noncanonical delivery truth:
 * available stock was already deducted and delivered customer stats already
 * accrued before the return/refund flow begins.
 */
async function seedDeliveredCompatibilityOrder() {
  const customer = await seedCustomer(db);
  const product = await seedProduct(db, { stock: 5 });
  await db.customer.update({
    where: { id: customer.id },
    data: { orderCount: 1, totalSpent: 5000 },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-RR-${customer.id.slice(-6)}`,
      status: "delivered",
      version: 4,
      customerId: customer.id,
      totalPrice: 5000,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555123456",
      source: "storefront",
      confirmedAt: new Date(Date.now() - 3_600_000),
      shippedAt: new Date(Date.now() - 1_800_000),
      deliveredAt: new Date(),
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
    include: { items: true },
  });
  return { order, customer, product };
}

async function completeReturn(orderId: string) {
  const ret = await db.return.create({
    data: {
      orderId,
      reason: "Customer changed mind",
      status: "approved",
      type: "refund",
    },
  });
  const response = await patchReturn(
    mockPost(`http://localhost/api/returns/${ret.id}`, { status: "completed" }),
    { params: Promise.resolve({ id: ret.id }) },
  );
  expect(response.status).toBe(200);
  return ret;
}

describe("Return + Refund compatibility integrity", () => {
  it("does not double-count when Return completes before full Refund", async () => {
    const { order, customer, product } = await seedDeliveredCompatibilityOrder();
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(5);
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
      orderCount: 1,
      totalSpent: 5000,
    });

    const ret = await completeReturn(order.id);
    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "returned" });
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(10);
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
      orderCount: 0,
      totalSpent: 0,
    });

    const refund = await createRefund({ prisma: db as never }, {
      orderId: order.id,
      amount: 5000,
      method: "cash",
      reason: "Full refund after return",
      returnId: ret.id,
      actor: "user",
    });
    expect(refund.amount).toBe(5000);
    expect(await db.refund.count({ where: { orderId: order.id } })).toBe(1);
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(10);
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
      orderCount: 0,
      totalSpent: 0,
    });
    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "returned" });
  });

  it("direct refund on delivered compatibility truth reverses stats once", async () => {
    const { order, customer } = await seedDeliveredCompatibilityOrder();
    await createRefund({ prisma: db as never }, {
      orderId: order.id,
      amount: 5000,
      method: "cash",
      reason: "Direct refund",
      actor: "user",
    });
    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "returned" });
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
      orderCount: 0,
      totalSpent: 0,
    });
  });

  it("partial refund after Return does not make totalSpent negative", async () => {
    const { order, customer, product } = await seedDeliveredCompatibilityOrder();
    const ret = await completeReturn(order.id);
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({ totalSpent: 0 });

    await createRefund({ prisma: db as never }, {
      orderId: order.id,
      amount: 2000,
      method: "cash",
      reason: "Partial refund",
      returnId: ret.id,
      actor: "user",
    });
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({ totalSpent: 0 });
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(10);
    expect(await db.refund.findMany({ where: { orderId: order.id } })).toEqual([
      expect.objectContaining({ amount: 2000 }),
    ]);
  });
});
