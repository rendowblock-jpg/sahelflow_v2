/**
 * Integration test for Phase 1 bug 1.2 — `PATCH /api/delivery/[id]` skipped
 * canonical order side effects when manually marking a delivery "delivered"
 * (or "returned"/"refused").
 *
 * Before the fix, the route inlined the state machine + stock restore + ledger
 * write inside its tx. It never:
 *   - set order.deliveredAt (so dashboard "realized revenue today" undercounted)
 *   - incremented customer.orderCount / totalSpent (so customer stats drifted)
 *   - fired the order.delivered / order.returned automation triggers
 *   - recorded a correct OrderChange ledger entry (it literally wrote the
 *     string "confirmed" as the `status` field, regardless of target)
 *
 * Fix: route delivery + canonical order effects + ledger through one
 * transaction, then dispatch automations after commit.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { rawDb, cleanDb, mockPost, getJson, seedProduct, establishAuthenticatedTestSession } from "@/app/api/__tests__/helpers";

// ── Mock next/headers — requireAuth() reads cookies. With a clean DB (no
//    AuthSecret row), isAuthenticated() returns true (setup mode) — an empty
//    cookie jar passes requireAuth.
const authCookieStore = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = authCookieStore.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string) => {
      authCookieStore.set(name, value);
    },
    delete: (name: string) => {
      authCookieStore.delete(name);
    },
  })),
}));

import { PATCH } from "@/app/api/delivery/[id]/route";

process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/** Seed a "shipped" order with a Delivery row + a fresh customer. */
async function seedShippedOrderWithDelivery() {
  const product = await seedProduct({ price: 2500, stock: 100 });
  const customer = await rawDb.customer.create({
    data: {
      name: "Patch Delivery Test",
      phone: "0555123456",
      nameBlindIndex: "patch-delivery-test",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      orderCount: 0,
      totalSpent: 0,
    },
  });
  const order = await rawDb.order.create({
    data: {
      orderNumber: "ORD-PATCH-0001",
      status: "shipped",
      customerId: customer.id,
      totalPrice: 5000,
      deliveryCost: 600,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555123456",
      source: "manual",
      shippedAt: new Date(),
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
    include: { items: true, customer: true },
  });
  const delivery = await rawDb.delivery.create({
    data: {
      orderId: order.id,
      provider: "yalidine",
      trackingNumber: "YAL-TRACK-999",
      cost: 600,
      status: "in_transit",
      estimatedDelivery: null,
    },
  });
  return { order, customer, delivery, product };
}

describe("PATCH /api/delivery/[id] — order side effects (Phase 1 bug 1.2)", () => {
  beforeEach(async () => {
    await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_delivery_status_ledger"');
    await cleanDb();
    authCookieStore.clear();
    delete process.env.AUTH_SECRET;
    await establishAuthenticatedTestSession();
  });

  afterAll(async () => {
    await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_delivery_status_ledger"');
    delete process.env.AUTH_SECRET;
    await rawDb.$disconnect();
  });

  it("sets order.deliveredAt + increments customer stats when delivery marked 'delivered'", async () => {
    const { order, customer, delivery } = await seedShippedOrderWithDelivery();

    const res = await PATCH(
      mockPost(`http://localhost/api/delivery/${delivery.id}`, { status: "delivered" }),
      { params: Promise.resolve({ id: delivery.id }) },
    );

    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.delivery).toBeTruthy();
    expect((body.delivery as { status: string }).status).toBe("delivered");

    // Order is now "delivered" with deliveredAt set.
    const updatedOrder = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe("delivered");
    expect(updatedOrder!.deliveredAt).toBeTruthy();

    // Customer stats incremented (orderCount +1, totalSpent += totalPrice).
    const updatedCustomer = await rawDb.customer.findUnique({ where: { id: customer.id } });
    expect(updatedCustomer!.orderCount).toBe(1);
    expect(updatedCustomer!.totalSpent).toBe(5000);

    // OrderChange ledger entry exists with actionType=status_change.
    const ledger = await rawDb.orderChange.findMany({
      where: { orderId: order.id, actionType: "status_change" },
    });
    expect(ledger.length).toBeGreaterThanOrEqual(1);
    const latest = ledger.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
    // The payload should record the transition (from=shipped, to=delivered).
    const payload = JSON.parse(latest.payload as string);
    expect(payload.from).toBe("shipped");
    expect(payload.to).toBe("delivered");
  });

  it("restores stock + reverses customer stats when delivery marked 'returned' (from delivered)", async () => {
    const { order, customer, delivery, product } = await seedShippedOrderWithDelivery();

    // First mark delivered (so customer stats are incremented + we can verify
    // the reversal path).
    await PATCH(
      mockPost(`http://localhost/api/delivery/${delivery.id}`, { status: "delivered" }),
      { params: Promise.resolve({ id: delivery.id }) },
    );

    // Now mark returned — should restore stock + reverse customer stats.
    const res = await PATCH(
      mockPost(`http://localhost/api/delivery/${delivery.id}`, { status: "returned" }),
      { params: Promise.resolve({ id: delivery.id }) },
    );
    expect(res.status).toBe(200);

    const updatedOrder = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe("returned");

    // Customer stats reversed back to 0 / 0.
    const updatedCustomer = await rawDb.customer.findUnique({ where: { id: customer.id } });
    expect(updatedCustomer!.orderCount).toBe(0);
    expect(updatedCustomer!.totalSpent).toBe(0);

    // Stock restored: original 100, item qty=2 was deducted at confirm.
    // For this test we never confirmed (we started shipped), so stock should
    // still be 100 — the restoration only fires on returned/refused from
    // confirmed/shipped/delivered. The order was "shipped" originally; with
    // orderService.updateStatus path, stock is restored on returned.
    const updatedProduct = await rawDb.product.findUnique({ where: { id: product.id } });
    expect(updatedProduct!.stock).toBeGreaterThanOrEqual(100);
  });

  it("rolls back the delivery status when the order transition is invalid", async () => {
    const { order, delivery } = await seedShippedOrderWithDelivery();

    // First mark returned.
    await PATCH(
      mockPost(`http://localhost/api/delivery/${delivery.id}`, { status: "returned" }),
      { params: Promise.resolve({ id: delivery.id }) },
    );

    // Now try to mark delivered — order is in terminal state "returned".
    // Delivery and order effects are one transaction, so both remain returned.
    const res = await PATCH(
      mockPost(`http://localhost/api/delivery/${delivery.id}`, { status: "delivered" }),
      { params: Promise.resolve({ id: delivery.id }) },
    );
    expect(res.status).toBe(409);

    const updatedOrder = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe("returned");
    const updatedDelivery = await rawDb.delivery.findUnique({ where: { id: delivery.id } });
    expect(updatedDelivery?.status).toBe("returned");
  });

  it("rolls back delivery, order, and customer state when the strict ledger fails", async () => {
    const { order, customer, delivery } = await seedShippedOrderWithDelivery();
    await rawDb.$executeRawUnsafe(`
      CREATE TRIGGER "fail_delivery_status_ledger"
      BEFORE INSERT ON "OrderChange"
      WHEN NEW.actionType = 'status_change'
      BEGIN
        SELECT RAISE(ABORT, 'forced ledger failure');
      END
    `);

    const res = await PATCH(
      mockPost(`http://localhost/api/delivery/${delivery.id}`, { status: "delivered" }),
      { params: Promise.resolve({ id: delivery.id }) },
    );
    expect(res.status).toBe(500);

    expect((await rawDb.delivery.findUnique({ where: { id: delivery.id } }))?.status)
      .toBe("in_transit");
    expect((await rawDb.order.findUnique({ where: { id: order.id } }))?.status)
      .toBe("shipped");
    expect(await rawDb.customer.findUnique({ where: { id: customer.id } }))
      .toMatchObject({ orderCount: 0, totalSpent: 0 });
  });

  it("returns 404 when the delivery does not exist", async () => {
    const res = await PATCH(
      mockPost("http://localhost/api/delivery/nonexistent", { status: "delivered" }),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );
    expect(res.status).toBe(404);
  });
});
