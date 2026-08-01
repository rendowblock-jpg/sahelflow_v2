/**
 * Integration tests for the delivery routes — Phase 7 priority group 5.
 *
 * Covers:
 *   - POST /api/delivery/create — create a shipment via a delivery provider
 *   - POST /api/delivery/sync   — sync tracking from a provider
 *
 * The delivery adapter is mocked (same pattern as
 * src/lib/automations/__tests__/order-triggers.test.ts) so we don't hit real
 * provider APIs. Each test configures the mock's createShipment /
 * syncTracking return value per-case.
 *
 * PATCH /api/delivery/[id] is covered separately by delivery-patch.test.ts
 * (Phase 1 bug 1.2) — NOT re-tested here. The [id] route has no GET handler.
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

// ── Mock the delivery adapter so createShipment/syncTracking don't hit a real provider ──
const mockAdapter = {
  id: "yalidine" as const,
  name: "Yalidine",
  logo: "📦",
  estimateCost: vi.fn(),
  createShipment: vi.fn(),
  syncTracking: vi.fn(),
};

vi.mock("@/lib/integrations/delivery", () => ({
  getDeliveryAdapter: vi.fn(() => mockAdapter),
  loadDeliveryCredentials: vi.fn().mockResolvedValue({ apiId: "x", apiToken: "y" }),
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

import { POST as POSTCreate } from "@/app/api/delivery/create/route";
import { POST as POSTSync } from "@/app/api/delivery/sync/route";

process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let _custCounter = 0;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function seedCustomer() {
  _custCounter++;
  return rawDb.customer.create({
    data: {
      name: `Del Cust ${_custCounter}`,
      phone: `0555${String(_custCounter).padStart(6, "0")}`,
      nameBlindIndex: `del-cust-blind-${_custCounter}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
    },
  });
}

/** Seed an order at the given status with one item. */
async function seedOrderAtStatus(status: "confirmed" | "shipped" | "delivered" | "pending") {
  const product = await seedProduct({ price: 2500, stock: 100 });
  const customer = await seedCustomer();
  const order = await rawDb.order.create({
    data: {
      orderNumber: `ORD-DEL-${status}-${_custCounter}`,
      status,
      customerId: customer.id,
      totalPrice: 5000,
      deliveryCost: 600,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555000001",
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
    include: { items: true, customer: true },
  });
  return { order, product, customer };
}

describe("POST /api/delivery/create — create shipment", () => {
  beforeEach(async () => {
    await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_create_shipment_ledger"');
    await cleanDb();
    mockAdapter.createShipment.mockReset();
    mockAdapter.createShipment.mockResolvedValue({
      success: true,
      trackingId: "YAL-TRACK-XYZ",
      cost: 600,
      labelUrl: "https://example.com/label.pdf",
      estimatedDelivery: null,
    });
  });
  afterAll(async () => {
    await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_create_shipment_ledger"');
    await rawDb.$disconnect();
  });

  it("creates a Delivery row + transitions order to 'shipped' on valid input (200)", async () => {
    const { order } = await seedOrderAtStatus("confirmed");

    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.ok).toBe(true);
    expect(body.delivery).toBeTruthy();
    expect((body.delivery as { trackingNumber: string }).trackingNumber).toBe("YAL-TRACK-XYZ");

    // DB: Delivery row exists with the tracking number
    const delivery = await rawDb.delivery.findUnique({ where: { orderId: order.id } });
    expect(delivery).toBeTruthy();
    expect(delivery!.trackingNumber).toBe("YAL-TRACK-XYZ");
    expect(delivery!.provider).toBe("yalidine");

    // Order transitioned to shipped + shippedAt set
    const updatedOrder = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe("shipped");
    expect(updatedOrder!.shippedAt).toBeTruthy();
  });

  it("returns 404 when the order does not exist", async () => {
    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: "nonexistent", provider: "yalidine" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when the order is not yet confirmed (e.g. pending)", async () => {
    const { order } = await seedOrderAtStatus("pending");
    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 502 when the adapter fails (success: false)", async () => {
    const { order } = await seedOrderAtStatus("confirmed");
    mockAdapter.createShipment.mockResolvedValue({ success: false, error: "provider down" });

    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(res.status).toBe(502);

    // The reservation remains as explicit evidence because a provider error
    // may be ambiguous; retries must fail closed until reconciliation.
    const delivery = await rawDb.delivery.findUnique({ where: { orderId: order.id } });
    expect(delivery?.status).toBe("reconciliation_required");
    expect(delivery?.trackingNumber).toBeNull();
    // Order should still be confirmed (not flipped to shipped)
    const updatedOrder = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe("confirmed");
  });

  it("returns 400 on invalid input (missing provider)", async () => {
    const { order } = await seedOrderAtStatus("confirmed");
    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid provider enum", async () => {
    const { order } = await seedOrderAtStatus("confirmed");
    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "unknown_provider" }),
    );
    expect(res.status).toBe(400);
  });

  it("B4b: returns 409 when a Delivery row with trackingNumber already exists (double-click on confirmed order)", async () => {
    const { order } = await seedOrderAtStatus("confirmed");
    // Simulate a prior successful create: a Delivery row with a trackingNumber.
    await rawDb.delivery.create({
      data: {
        orderId: order.id,
        provider: "yalidine",
        trackingNumber: "PRIOR-TRACK-001",
        cost: 600,
        status: "created",
        estimatedDelivery: null,
      },
    });

    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(res.status).toBe(409);
    const body = await getJson(res);
    expect(body.error).toMatch(/already exists/i);
    expect(body.trackingNumber).toBe("PRIOR-TRACK-001");

    // CRITICAL: the provider adapter must NOT have been called — we never
    // touch the provider API when a shipment already exists locally.
    expect(mockAdapter.createShipment).not.toHaveBeenCalled();

    // The existing trackingNumber must NOT have been overwritten.
    const delivery = await rawDb.delivery.findUnique({ where: { orderId: order.id } });
    expect(delivery!.trackingNumber).toBe("PRIOR-TRACK-001");
  });

  it("B4b: returns 409 when a shipped order already has a delivery (double-click on shipped order)", async () => {
    const { order } = await seedOrderAtStatus("shipped");
    await rawDb.delivery.create({
      data: {
        orderId: order.id,
        provider: "yalidine",
        trackingNumber: "YAL-EXISTING-999",
        cost: 600,
        status: "in_transit",
        estimatedDelivery: null,
      },
    });

    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(res.status).toBe(409);
    expect(mockAdapter.createShipment).not.toHaveBeenCalled();
  });

  it("fails closed for a shipped order with no local delivery evidence", async () => {
    // A shipped order with no Delivery row may already have an orphaned remote
    // parcel. Calling the provider again would risk a duplicate shipment.
    const { order } = await seedOrderAtStatus("shipped");

    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(res.status).toBe(409);
    expect(mockAdapter.createShipment).not.toHaveBeenCalled();

    const delivery = await rawDb.delivery.findUnique({ where: { orderId: order.id } });
    expect(delivery).toBeNull();
  });

  it("fails closed for a pre-existing Delivery row without tracking", async () => {
    // A legacy row without tracking may represent an ambiguous provider POST.
    // Preserve it for reconciliation rather than exposing a duplicate parcel.
    const { order } = await seedOrderAtStatus("confirmed");
    await rawDb.delivery.create({
      data: {
        orderId: order.id,
        provider: "yalidine",
        trackingNumber: null, // no tracking — no parcel to orphan
        cost: 0,
        status: "pending",
        estimatedDelivery: null,
      },
    });

    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(res.status).toBe(409);
    expect(mockAdapter.createShipment).not.toHaveBeenCalled();

    const delivery = await rawDb.delivery.findUnique({ where: { orderId: order.id } });
    expect(delivery).toMatchObject({
      trackingNumber: null,
      status: "reconciliation_required",
    });
  });

  it("fails closed when the provider reports success without a tracking receipt", async () => {
    const { order } = await seedOrderAtStatus("confirmed");
    mockAdapter.createShipment.mockResolvedValue({
      success: true,
      trackingId: "",
      cost: 600,
    });

    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(res.status).toBe(502);
    expect(await rawDb.delivery.findUnique({ where: { orderId: order.id } })).toMatchObject({
      trackingNumber: null,
      status: "reconciliation_required",
    });

    const retry = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(retry.status).toBe(409);
    expect(mockAdapter.createShipment).toHaveBeenCalledTimes(1);
  });

  it("reserves before the provider call so concurrent creates call the provider once", async () => {
    const { order } = await seedOrderAtStatus("confirmed");
    const gate = deferred<{
      success: true;
      trackingId: string;
      cost: number;
      estimatedDelivery: null;
    }>();
    mockAdapter.createShipment.mockReturnValueOnce(gate.promise);

    const first = POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    await vi.waitFor(
      () => expect(mockAdapter.createShipment).toHaveBeenCalledTimes(1),
      { timeout: 5000 },
    );

    const second = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(second.status).toBe(409);
    expect(mockAdapter.createShipment).toHaveBeenCalledTimes(1);

    gate.resolve({
      success: true,
      trackingId: "YAL-CONCURRENT-1",
      cost: 600,
      estimatedDelivery: null,
    });
    expect((await first).status).toBe(200);
  });

  it("persists the provider receipt and fails closed when local completion conflicts", async () => {
    const { order } = await seedOrderAtStatus("confirmed");
    const gate = deferred<{
      success: true;
      trackingId: string;
      cost: number;
      estimatedDelivery: null;
    }>();
    mockAdapter.createShipment.mockReturnValueOnce(gate.promise);

    const request = POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    await vi.waitFor(
      () => expect(mockAdapter.createShipment).toHaveBeenCalledTimes(1),
      { timeout: 5000 },
    );
    await rawDb.order.update({ where: { id: order.id }, data: { status: "cancelled" } });
    gate.resolve({
      success: true,
      trackingId: "YAL-RECONCILE-1",
      cost: 600,
      estimatedDelivery: null,
    });

    expect((await request).status).toBe(409);
    const delivery = await rawDb.delivery.findUnique({ where: { orderId: order.id } });
    expect(delivery?.status).toBe("reconciliation_required");
    expect(delivery?.trackingNumber).toBe("YAL-RECONCILE-1");
    expect((await rawDb.order.findUnique({ where: { id: order.id } }))?.status).toBe("cancelled");

    const retry = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(retry.status).toBe(409);
    expect(mockAdapter.createShipment).toHaveBeenCalledTimes(1);
  });

  it("keeps reconciliation evidence when the provider succeeds but the ledger fails", async () => {
    const { order } = await seedOrderAtStatus("confirmed");
    await rawDb.$executeRawUnsafe(`
      CREATE TRIGGER "fail_create_shipment_ledger"
      BEFORE INSERT ON "OrderChange"
      WHEN NEW.actionType = 'status_change'
      BEGIN
        SELECT RAISE(ABORT, 'forced ledger failure');
      END
    `);

    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(res.status).toBe(500);
    expect((await rawDb.order.findUnique({ where: { id: order.id } }))?.status).toBe("confirmed");
    expect(await rawDb.delivery.findUnique({ where: { orderId: order.id } })).toMatchObject({
      trackingNumber: "YAL-TRACK-XYZ",
      status: "reconciliation_required",
    });
    expect(await rawDb.orderChange.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("returns 401 when auth is set up but no session cookie is present", async () => {
    await rawDb.authSecret.create({
      data: { id: "default", secret: "test-secret-32-chars-long-aaaa", pinHash: "fake-hash" },
    });
    const { order } = await seedOrderAtStatus("confirmed");
    const res = await POSTCreate(
      mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/delivery/sync — sync tracking", () => {
  beforeEach(async () => {
    await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_delivery_sync_conflict"');
    await cleanDb();
    mockAdapter.syncTracking.mockReset();
  });
  afterAll(async () => {
    await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_delivery_sync_conflict"');
    await rawDb.$disconnect();
  });

  /** Seed a shipped order + a Delivery row with a tracking number. */
  async function seedShippedOrderWithDelivery(trackingNumber = "YAL-TRACK-001") {
    const { order, product, customer } = await seedOrderAtStatus("shipped");
    const delivery = await rawDb.delivery.create({
      data: {
        orderId: order.id,
        provider: "yalidine",
        trackingNumber,
        cost: 600,
        status: "in_transit",
        estimatedDelivery: null,
      },
    });
    return { order, product, customer, delivery };
  }

  it("updates the delivery status from the provider (200) + transitions order to 'delivered' when tracking says delivered", async () => {
    const { order, delivery } = await seedShippedOrderWithDelivery();
    mockAdapter.syncTracking.mockResolvedValue({
      status: "delivered",
      estimatedDelivery: null,
      events: [{ at: new Date().toISOString(), label: "Delivered" }],
    });

    const res = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", { deliveryId: delivery.id }),
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("delivered");

    // Delivery row updated
    const updatedDelivery = await rawDb.delivery.findUnique({ where: { id: delivery.id } });
    expect(updatedDelivery!.status).toBe("delivered");

    // Order transitioned to delivered + deliveredAt set + customer stats incremented
    const updatedOrder = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe("delivered");
    expect(updatedOrder!.deliveredAt).toBeTruthy();

    const updatedCustomer = await rawDb.customer.findUnique({ where: { id: order.customerId } });
    expect(updatedCustomer!.orderCount).toBe(1);
    expect(updatedCustomer!.totalSpent).toBe(5000);
  });

  it("updates the delivery status without flipping order when tracking says in_transit", async () => {
    const { order, delivery } = await seedShippedOrderWithDelivery();
    mockAdapter.syncTracking.mockResolvedValue({
      status: "in_transit",
      estimatedDelivery: null,
      events: [],
    });

    const res = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", { deliveryId: delivery.id }),
    );
    expect(res.status).toBe(200);
    expect((await getJson(res)).status).toBe("in_transit");

    // Order should still be shipped
    const updatedOrder = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe("shipped");
  });

  it("preserves delivered provider state and records a reconciliation conflict", async () => {
    const { order, delivery } = await seedShippedOrderWithDelivery();
    await rawDb.order.update({ where: { id: order.id }, data: { status: "returned" } });
    mockAdapter.syncTracking.mockResolvedValue({
      status: "delivered",
      estimatedDelivery: null,
      events: [],
    });

    const res = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", { deliveryId: delivery.id }),
    );
    expect(res.status).toBe(409);

    const updatedDelivery = await rawDb.delivery.findUnique({ where: { id: delivery.id } });
    expect(updatedDelivery?.status).toBe("delivered");
    const unchangedOrder = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(unchangedOrder?.status).toBe("returned");
    const conflict = await rawDb.orderChange.findFirst({
      where: { orderId: order.id, actionType: "delivery_sync_conflict" },
    });
    expect(JSON.parse(conflict?.payload ?? "{}")).toMatchObject({
      providerStatus: "delivered",
      orderStatus: "returned",
    });
  });

  it("still preserves provider state when conflict evidence cannot be inserted", async () => {
    const { order, delivery } = await seedShippedOrderWithDelivery();
    await rawDb.order.update({ where: { id: order.id }, data: { status: "returned" } });
    await rawDb.$executeRawUnsafe(`
      CREATE TRIGGER "fail_delivery_sync_conflict"
      BEFORE INSERT ON "OrderChange"
      WHEN NEW.actionType = 'delivery_sync_conflict'
      BEGIN
        SELECT RAISE(ABORT, 'forced delivery conflict ledger failure');
      END
    `);
    mockAdapter.syncTracking.mockResolvedValue({
      status: "delivered",
      estimatedDelivery: null,
      events: [],
    });

    const res = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", { deliveryId: delivery.id }),
    );
    expect(res.status).toBe(500);
    expect((await rawDb.delivery.findUnique({ where: { id: delivery.id } }))?.status)
      .toBe("delivered");
    expect((await rawDb.order.findUnique({ where: { id: order.id } }))?.status)
      .toBe("returned");
    expect(await rawDb.orderChange.count({
      where: { orderId: order.id, actionType: "delivery_sync_conflict" },
    })).toBe(0);
  });

  it("returns 404 when the delivery does not exist", async () => {
    mockAdapter.syncTracking.mockResolvedValue({ status: "delivered", estimatedDelivery: null, events: [] });
    const res = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", { deliveryId: "nonexistent" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when the delivery has no tracking number", async () => {
    const { order } = await seedOrderAtStatus("shipped");
    const delivery = await rawDb.delivery.create({
      data: {
        orderId: order.id,
        provider: "yalidine",
        trackingNumber: null, // no tracking yet
        cost: 600,
        status: "pending",
      },
    });
    const res = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", { deliveryId: delivery.id }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither deliveryId nor orderId is provided", async () => {
    const res = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", {}),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when auth is set up but no session cookie is present", async () => {
    await rawDb.authSecret.create({
      data: { id: "default", secret: "test-secret-32-chars-long-aaaa", pinHash: "fake-hash" },
    });
    const { delivery } = await seedShippedOrderWithDelivery();
    mockAdapter.syncTracking.mockResolvedValue({ status: "in_transit", estimatedDelivery: null, events: [] });
    const res = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", { deliveryId: delivery.id }),
    );
    expect(res.status).toBe(401);
  });
});
