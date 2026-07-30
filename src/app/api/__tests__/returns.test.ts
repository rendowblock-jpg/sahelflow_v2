/**
 * Integration tests for the returns routes — Phase 7 priority group 3.
 *
 * Covers:
 *   - POST  /api/returns     — create a return request for an order
 *   - PATCH /api/returns/[id] — update return status (requested → approved →
 *                                completed/rejected)
 *
 * The PATCH /api/returns/[id] "completed" path also exercises Phase 1 bug
 * 1.1's canonical transition in the same transaction as Return completion,
 * stock restore, customer stats reversal, and the OrderChange ledger.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { rawDb, cleanDb, mockPost, getJson, seedProduct } from "@/app/api/__tests__/helpers";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));


// Mock the automation dispatcher so orderService.create/updateStatus's
// fire-and-forget dispatchTrigger('order.created'/'order.{status}') is a no-op.
// Without this, the dispatch can still be in flight when the next test's
// cleanDb() runs (or when the next test file starts), causing flaky races
// with other test files that share the SQLite file (see Phase 3 worklog note
// on waitForDispatch). No PG1/PG3/PG5 test asserts on automation triggers.
vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger: vi.fn(async () => {}),
  dispatchLowStock: vi.fn(async () => {}),
  detectLowStock: vi.fn(async () => null),
}));

import { POST as POSTReturn } from "@/app/api/returns/route";
import { PATCH as PATCHReturn } from "@/app/api/returns/[id]/route";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";

process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let _custCounter = 0;
async function seedCustomer() {
  _custCounter++;
  return rawDb.customer.create({
    data: {
      name: `Ret Cust ${_custCounter}`,
      phone: `0666${String(_custCounter).padStart(6, "0")}`,
      nameBlindIndex: `ret-cust-blind-${_custCounter}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
      orderCount: 0,
      totalSpent: 0,
    },
  });
}

/** Seed an order at the given status with one item. Returns order + product + customer. */
async function seedOrderAtStatus(status: "delivered" | "shipped" | "confirmed" | "pending") {
  const product = await seedProduct({ price: 2500, stock: 100 });
  const customer = await seedCustomer();
  // For delivered orders, simulate that customer stats were already incremented
  // (the canonical path: orderService.updateStatus → triggersCustomerStatsUpdate).
  const orderCount = status === "delivered" ? 1 : 0;
  const totalSpent = status === "delivered" ? 5000 : 0;
  const updatedCustomer = await rawDb.customer.update({
    where: { id: customer.id },
    data: { orderCount, totalSpent },
  });
  // For delivered orders, stock was already deducted at confirm (2 units).
  const productStock = status === "delivered" || status === "shipped" || status === "confirmed" ? 98 : 100;
  await rawDb.product.update({ where: { id: product.id }, data: { stock: productStock } });

  const order = await rawDb.order.create({
    data: {
      orderNumber: `ORD-RET-${status}-${_custCounter}`,
      status,
      customerId: customer.id,
      totalPrice: 5000,
      deliveryCost: 600,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
      phone: "0666000001",
      source: "manual",
      confirmedAt: ["confirmed", "shipped", "delivered"].includes(status) ? new Date() : null,
      shippedAt: ["shipped", "delivered"].includes(status) ? new Date() : null,
      deliveredAt: status === "delivered" ? new Date() : null,
      items: {
        create: [{
          productId: product.id,
          productName: "Test Product",
          quantity: 2,
          unitPrice: 2500,
          total: 5000,
        }],
      },
    },
  });
  return { order, product, customer: updatedCustomer };
}

describe("POST /api/returns — create return request", () => {
  beforeEach(async () => { await cleanDb(); });
  afterAll(async () => { await rawDb.$disconnect(); });

  it("creates a return in 'requested' status on valid input (201)", async () => {
    const { order } = await seedOrderAtStatus("delivered");

    const res = await POSTReturn(
      mockPost("http://localhost/api/returns", {
        orderId: order.id,
        reason: "Customer changed mind",
        type: "return",
        itemCount: 2,
        notes: "Items in original packaging",
      }),
    );
    expect(res.status).toBe(201);
    const body = await getJson(res);
    expect(body.return).toBeTruthy();
    const ret = body.return as Record<string, unknown>;
    expect(ret.status).toBe("requested");
    expect(ret.type).toBe("return");
    expect(ret.reason).toBe("Customer changed mind");
    // itemCount appended to notes (no dedicated column)
    expect(String(ret.notes)).toMatch(/Items returned: 2/);

    // DB row created
    const dbRet = await rawDb.return.findFirst({ where: { orderId: order.id } });
    expect(dbRet).toBeTruthy();
    expect(dbRet!.status).toBe("requested");
  });

  it("defaults type to 'return' when omitted", async () => {
    const { order } = await seedOrderAtStatus("delivered");
    const res = await POSTReturn(
      mockPost("http://localhost/api/returns", { orderId: order.id, reason: "x" }),
    );
    expect(res.status).toBe(201);
    const body = await getJson(res);
    expect((body.return as { type: string }).type).toBe("return");
  });

  it("does not create a legacy return for a canonical delivered order", async () => {
    const { order } = await seedOrderAtStatus("delivered");
    await rawDb.order.update({
      where: { id: order.id },
      data: { sourceMetadata: trustedManualOrderSourceMetadata() },
    });

    const res = await POSTReturn(
      mockPost("http://localhost/api/returns", {
        orderId: order.id,
        reason: "Requires the governed return command",
      }),
    );

    expect(res.status).toBe(409);
    expect(await rawDb.return.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("returns 400 on missing required reason", async () => {
    const { order } = await seedOrderAtStatus("delivered");
    const res = await POSTReturn(
      mockPost("http://localhost/api/returns", { orderId: order.id, reason: "" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing orderId", async () => {
    const res = await POSTReturn(
      mockPost("http://localhost/api/returns", { reason: "x" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the order does not exist", async () => {
    const res = await POSTReturn(
      mockPost("http://localhost/api/returns", { orderId: "nonexistent-order", reason: "x" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when auth is set up but no session cookie is present", async () => {
    await rawDb.authSecret.create({
      data: { id: "default", secret: "test-secret-32-chars-long-aaaa", pinHash: "fake-hash" },
    });
    const { order } = await seedOrderAtStatus("delivered");
    const res = await POSTReturn(
      mockPost("http://localhost/api/returns", { orderId: order.id, reason: "x" }),
    );
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/returns/[id] — update return status", () => {
  beforeEach(async () => {
    await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_return_status_ledger"');
    await cleanDb();
  });
  afterAll(async () => {
    await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_return_status_ledger"');
    await rawDb.$disconnect();
  });

  /** Seed a Return row in the given status for a delivered order. */
  async function seedReturnAtStatus(status: "requested" | "approved" | "rejected" | "completed") {
    const { order, product, customer } = await seedOrderAtStatus("delivered");
    const ret = await rawDb.return.create({
      data: {
        orderId: order.id,
        reason: "Customer changed mind",
        type: "return",
        status,
        notes: null,
      },
    });
    return { ret, order, product, customer };
  }

  it("transitions requested → approved (200) + records the status", async () => {
    const { ret } = await seedReturnAtStatus("requested");
    const res = await PATCHReturn(
      mockPost(`http://localhost/api/returns/${ret.id}`, { status: "approved", notes: "OK to process" }),
      { params: Promise.resolve({ id: ret.id }) },
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect((body.return as { status: string }).status).toBe("approved");

    // ReturnNote was created with the notes body
    const notes = await rawDb.returnNote.findMany({ where: { returnId: ret.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.body).toBe("OK to process");
  });

  it("transitions approved → completed (200) + flips order to 'returned' + restores stock + reverses customer stats", async () => {
    const { ret, order, product, customer } = await seedReturnAtStatus("approved");

    const res = await PATCHReturn(
      mockPost(`http://localhost/api/returns/${ret.id}`, { status: "completed" }),
      { params: Promise.resolve({ id: ret.id }) },
    );
    expect(res.status).toBe(200);

    // Order transitioned to "returned" via orderService.updateStatus (Phase 1 bug 1.1)
    const updatedOrder = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe("returned");

    // Stock restored (was 98 after confirm, +2 = 100)
    const updatedProduct = await rawDb.product.findUnique({ where: { id: product.id } });
    expect(updatedProduct!.stock).toBe(100);

    // Customer stats reversed (was orderCount=1, totalSpent=5000; now 0/0)
    const updatedCustomer = await rawDb.customer.findUnique({ where: { id: customer.id } });
    expect(updatedCustomer!.orderCount).toBe(0);
    expect(updatedCustomer!.totalSpent).toBe(0);

    // OrderChange ledger entry exists for the returned transition
    const ledger = await rawDb.orderChange.findMany({
      where: { orderId: order.id, actionType: "status_change" },
    });
    expect(ledger.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 409 when the transition is invalid (e.g. requested → completed)", async () => {
    const { ret } = await seedReturnAtStatus("requested");
    const res = await PATCHReturn(
      mockPost(`http://localhost/api/returns/${ret.id}`, { status: "completed" }),
      { params: Promise.resolve({ id: ret.id }) },
    );
    expect(res.status).toBe(409);
  });

  it("rolls back completion and notes when the order cannot transition to returned", async () => {
    const { ret, order } = await seedReturnAtStatus("approved");
    await rawDb.order.update({ where: { id: order.id }, data: { status: "cancelled" } });

    const res = await PATCHReturn(
      mockPost(`http://localhost/api/returns/${ret.id}`, {
        status: "completed",
        notes: "must not commit",
      }),
      { params: Promise.resolve({ id: ret.id }) },
    );
    expect(res.status).toBe(409);

    const unchangedReturn = await rawDb.return.findUnique({ where: { id: ret.id } });
    expect(unchangedReturn?.status).toBe("approved");
    expect(await rawDb.returnNote.count({ where: { returnId: ret.id } })).toBe(0);
  });

  it("rolls back completion and all order effects when the strict ledger fails", async () => {
    const { ret, order, product, customer } = await seedReturnAtStatus("approved");
    await rawDb.$executeRawUnsafe(`
      CREATE TRIGGER "fail_return_status_ledger"
      BEFORE INSERT ON "OrderChange"
      WHEN NEW.actionType = 'status_change'
      BEGIN
        SELECT RAISE(ABORT, 'forced ledger failure');
      END
    `);

    const res = await PATCHReturn(
      mockPost(`http://localhost/api/returns/${ret.id}`, {
        status: "completed",
        notes: "must roll back",
      }),
      { params: Promise.resolve({ id: ret.id }) },
    );
    expect(res.status).toBe(500);

    expect((await rawDb.return.findUnique({ where: { id: ret.id } }))?.status).toBe("approved");
    expect((await rawDb.order.findUnique({ where: { id: order.id } }))?.status).toBe("delivered");
    expect((await rawDb.product.findUnique({ where: { id: product.id } }))?.stock).toBe(98);
    expect(await rawDb.customer.findUnique({ where: { id: customer.id } }))
      .toMatchObject({ orderCount: 1, totalSpent: 5000 });
    expect(await rawDb.returnNote.count({ where: { returnId: ret.id } })).toBe(0);
  });

  it("returns 404 when the return does not exist", async () => {
    const res = await PATCHReturn(
      mockPost("http://localhost/api/returns/nonexistent", { status: "approved" }),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid status enum", async () => {
    const { ret } = await seedReturnAtStatus("requested");
    const res = await PATCHReturn(
      mockPost(`http://localhost/api/returns/${ret.id}`, { status: "invalid_status" }),
      { params: Promise.resolve({ id: ret.id }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when auth is set up but no session cookie is present", async () => {
    await rawDb.authSecret.create({
      data: { id: "default", secret: "test-secret-32-chars-long-aaaa", pinHash: "fake-hash" },
    });
    const { ret } = await seedReturnAtStatus("requested");
    const res = await PATCHReturn(
      mockPost(`http://localhost/api/returns/${ret.id}`, { status: "approved" }),
      { params: Promise.resolve({ id: ret.id }) },
    );
    expect(res.status).toBe(401);
  });
});
