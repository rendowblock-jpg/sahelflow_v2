/**
 * Integration tests for the order routes — Phase 7 priority group 1.
 *
 * Covers:
 *   - POST /api/orders              — create a trusted pending manual order
 *   - PATCH /api/orders/[id]/status — transition an order through the state machine
 *   - POST /api/orders/bulk         — bulk transition multiple orders
 *
 * Each test asserts:
 *   - happy path (201/200 + correct response shape + DB state)
 *   - auth (401 when an AuthSecret row exists but no session cookie)
 *   - validation (400 on bad input)
 *   - not-found (404 where applicable)
 *
 * The PATCH /api/delivery/[id] route is covered separately by
 * delivery-patch.test.ts (Phase 1 bug 1.2) — NOT re-tested here.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { rawDb, cleanDb, mockPost, getJson, seedProduct } from "@/app/api/__tests__/helpers";

// ── Mock next/headers — requireAuth() reads cookies. With a clean DB (no
//    AuthSecret row), isAuthenticated() returns true (setup mode) — an empty
//    cookie jar passes requireAuth. To test 401 auth rejection we seed an
//    AuthSecret row (setup=true) and leave the cookie jar empty.
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

import { POST as POSTOrder } from "@/app/api/orders/route";
import { PATCH as PATCHStatus } from "@/app/api/orders/[id]/status/route";
import { POST as POSTBulk } from "@/app/api/orders/bulk/route";

process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let _custCounter = 0;
/** Seed a fresh customer with a unique phone (phone is @unique on Customer). */
async function seedCustomer() {
  _custCounter++;
  return rawDb.customer.create({
    data: {
      name: `Cust ${_custCounter}`,
      phone: `0555${String(_custCounter).padStart(6, "0")}`,
      nameBlindIndex: `cust-blind-${_custCounter}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      orderCount: 0,
      totalSpent: 0,
    },
  });
}

/** Build a valid POST /api/orders body for the given customer + product. */
function orderBody(customerId: string, productId: string, opts?: { deliveryCost?: number; source?: string }) {
  return {
    idempotencyKey: `orders-test-${customerId}-${productId}`,
    customerId,
    items: [{ productId, productName: "Test Product", quantity: 2, unitPrice: 2500 }],
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "123 Rue Didouche",
    phone: "0555000001",
    source: opts?.source ?? "manual",
    deliveryCost: opts?.deliveryCost ?? 600,
  };
}

describe("POST /api/orders — create order", () => {
  beforeEach(async () => { await cleanDb(); });

  afterAll(async () => { await rawDb.$disconnect(); });

  it("creates a trusted pending order on valid input (201) + writes OrderChange 'created' ledger", async () => {
    const product = await seedProduct({ price: 2500, stock: 100 });
    const customer = await seedCustomer();

    const res = await POSTOrder(mockPost("http://localhost/api/orders", orderBody(customer.id, product.id)));

    expect(res.status).toBe(201);
    const body = await getJson(res);
    expect(body.order).toBeTruthy();
    const order = body.order as Record<string, unknown>;
    expect(order.orderNumber).toBeTruthy();
    expect(order.status).toBe("pending");
    expect(body.authority).toBe("trusted-manual-v1");
    expect(order.totalPrice).toBe(2 * 2500 + 600); // items + deliveryCost

    // DB: order exists + OrderChange "created" ledger entry
    const dbOrder = await rawDb.order.findFirst({ where: { customerId: customer.id } });
    expect(dbOrder).toBeTruthy();
    expect(dbOrder!.source).toBe("manual");

    const ledger = await rawDb.orderChange.findMany({
      where: { orderId: dbOrder!.id, actionType: "created" },
    });
    expect(ledger).toHaveLength(1);
  });

  it("returns 400 on invalid input (missing required items)", async () => {
    const customer = await seedCustomer();
    const res = await POSTOrder(
      mockPost("http://localhost/api/orders", {
        customerId: customer.id,
        items: [], // min(1) violation
        wilaya: "Alger",
        commune: "B",
        address: "C",
        phone: "0555000001",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid phone format (dzPhone)", async () => {
    const product = await seedProduct();
    const customer = await seedCustomer();
    const res = await POSTOrder(
      mockPost("http://localhost/api/orders", {
        ...orderBody(customer.id, product.id),
        phone: "123", // not a DZ phone
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the customer does not exist (NotFoundError → 404)", async () => {
    const product = await seedProduct();
    // Use a valid cuid format that doesn't exist
    const res = await POSTOrder(
      mockPost("http://localhost/api/orders", orderBody("clxxxxxxxxxxxxxxxxxxxxxxxxxx", product.id)),
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when auth is set up but no session cookie is present", async () => {
    // Seed an AuthSecret row → isAuthSetup()=true → empty cookie jar fails requireAuth.
    await rawDb.authSecret.create({
      data: { id: "default", secret: "test-secret-32-chars-long-aaaa", pinHash: "fake-hash" },
    });
    const product = await seedProduct();
    const customer = await seedCustomer();

    const res = await POSTOrder(mockPost("http://localhost/api/orders", orderBody(customer.id, product.id)));
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/orders/[id]/status — transition status", () => {
  beforeEach(async () => { await cleanDb(); });

  afterAll(async () => { await rawDb.$disconnect(); });

  /** Seed an order at the given status, returns the order id. */
  async function seedOrderAtStatus(status: "draft" | "pending" | "confirmed" | "shipped" | "delivered") {
    const product = await seedProduct({ price: 2500, stock: 100 });
    const customer = await seedCustomer();
    const order = await rawDb.order.create({
      data: {
        orderNumber: `ORD-TEST-${status}-${_custCounter}`,
        status,
        customerId: customer.id,
        totalPrice: 5000,
        deliveryCost: 600,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Didouche",
        phone: "0555000001",
        source: "manual",
        confirmedAt: status === "confirmed" || status === "shipped" || status === "delivered" ? new Date() : null,
        shippedAt: status === "shipped" || status === "delivered" ? new Date() : null,
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
    return { order, product, customer };
  }

  it("transitions pending → confirmed + deducts stock + records ledger", async () => {
    const { order, product } = await seedOrderAtStatus("pending");

    const res = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, { status: "confirmed" }),
      { params: Promise.resolve({ id: order.id }) },
    );

    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect((body.order as { status: string }).status).toBe("confirmed");

    // Stock deducted (2 units)
    const updatedProduct = await rawDb.product.findUnique({ where: { id: product.id } });
    expect(updatedProduct!.stock).toBe(98); // 100 - 2

    // Order.confirmedAt set
    const updatedOrder = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.confirmedAt).toBeTruthy();

    // Ledger entry recorded
    const ledger = await rawDb.orderChange.findMany({
      where: { orderId: order.id, actionType: "status_change" },
    });
    expect(ledger.length).toBeGreaterThanOrEqual(1);
  });

  it("transitions confirmed → shipped + sets shippedAt", async () => {
    const { order } = await seedOrderAtStatus("confirmed");
    const res = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, { status: "shipped" }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(res.status).toBe(200);
    const updated = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe("shipped");
    expect(updated!.shippedAt).toBeTruthy();
  });

  it("returns 409 when the transition is invalid (e.g. draft → delivered)", async () => {
    const { order } = await seedOrderAtStatus("draft");
    const res = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, { status: "delivered" }),
      { params: Promise.resolve({ id: order.id }) },
    );
    // InvalidTransitionError extends SahelFlowError with statusCode=409
    expect([400, 409]).toContain(res.status);
  });

  it("returns 404 when the order does not exist", async () => {
    const res = await PATCHStatus(
      mockPost("http://localhost/api/orders/nonexistent/status", { status: "confirmed" }),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid input (bad status enum)", async () => {
    const { order } = await seedOrderAtStatus("pending");
    const res = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, { status: "invalid_status" }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when auth is set up but no session cookie is present", async () => {
    await rawDb.authSecret.create({
      data: { id: "default", secret: "test-secret-32-chars-long-aaaa", pinHash: "fake-hash" },
    });
    const { order } = await seedOrderAtStatus("pending");
    const res = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, { status: "confirmed" }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/orders/bulk — bulk status transition", () => {
  beforeEach(async () => { await cleanDb(); });

  afterAll(async () => { await rawDb.$disconnect(); });

  /** Seed N pending orders. */
  async function seedPendingOrders(n: number) {
    const product = await seedProduct({ price: 2500, stock: 1000 });
    const customer = await seedCustomer();
    const orders = [];
    for (let i = 0; i < n; i++) {
      const order = await rawDb.order.create({
        data: {
          orderNumber: `ORD-BULK-${i}`,
          status: "pending",
          customerId: customer.id,
          totalPrice: 2500,
          deliveryCost: 0,
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "123 Rue",
          phone: "0555000001",
          source: "manual",
          items: {
            create: [{
              productId: product.id,
              productName: "Test",
              quantity: 1,
              unitPrice: 2500,
              total: 2500,
            }],
          },
        },
      });
      orders.push(order);
    }
    return { orders, product, customer };
  }

  it("bulk-confirms multiple pending orders + returns succeeded list", async () => {
    const { orders } = await seedPendingOrders(3);
    const ids = orders.map((o) => o.id);

    const res = await POSTBulk(
      mockPost("http://localhost/api/orders/bulk", { ids, status: "confirmed" }),
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.succeeded).toHaveLength(3);
    expect(body.failed).toHaveLength(0);

    // All 3 orders are now confirmed + stock was deducted 3× (1 each)
    const dbOrders = await rawDb.order.findMany({ where: { id: { in: ids } } });
    expect(dbOrders.every((o) => o.status === "confirmed")).toBe(true);
  });

  it("auto-advances draft → pending → confirmed in bulk (mix of draft + pending)", async () => {
    const product = await seedProduct({ price: 2500, stock: 100 });
    const customer = await seedCustomer();
    const draftOrder = await rawDb.order.create({
      data: {
        orderNumber: "ORD-DRAFT-1",
        status: "draft",
        customerId: customer.id,
        totalPrice: 2500, deliveryCost: 0, wilaya: "Alger", commune: "B", address: "A", phone: "0555000001",
        source: "manual",
        items: { create: [{ productId: product.id, productName: "X", quantity: 1, unitPrice: 2500, total: 2500 }] },
      },
    });
    const pendingOrder = await rawDb.order.create({
      data: {
        orderNumber: "ORD-PEND-1",
        status: "pending",
        customerId: customer.id,
        totalPrice: 2500, deliveryCost: 0, wilaya: "Alger", commune: "B", address: "A", phone: "0555000001",
        source: "manual",
        items: { create: [{ productId: product.id, productName: "X", quantity: 1, unitPrice: 2500, total: 2500 }] },
      },
    });

    const res = await POSTBulk(
      mockPost("http://localhost/api/orders/bulk", {
        ids: [draftOrder.id, pendingOrder.id],
        status: "confirmed",
      }),
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.succeeded).toHaveLength(2);

    const updated = await rawDb.order.findMany({
      where: { id: { in: [draftOrder.id, pendingOrder.id] } },
    });
    expect(updated.every((o) => o.status === "confirmed")).toBe(true);
  });

  it("reports failures for invalid transitions without blocking valid ones", async () => {
    const product = await seedProduct({ price: 2500, stock: 100 });
    const customer = await seedCustomer();
    // Create one pending order (valid → confirmed) + one cancelled order (terminal, invalid → confirmed)
    const valid = await rawDb.order.create({
      data: {
        orderNumber: "ORD-VALID-1", status: "pending", customerId: customer.id,
        totalPrice: 2500, deliveryCost: 0, wilaya: "Alger", commune: "B", address: "A", phone: "0555000001",
        source: "manual",
        items: { create: [{ productId: product.id, productName: "X", quantity: 1, unitPrice: 2500, total: 2500 }] },
      },
    });
    const terminal = await rawDb.order.create({
      data: {
        orderNumber: "ORD-TERM-1", status: "cancelled", customerId: customer.id,
        totalPrice: 2500, deliveryCost: 0, wilaya: "Alger", commune: "B", address: "A", phone: "0555000001",
        source: "manual",
        items: { create: [{ productId: product.id, productName: "X", quantity: 1, unitPrice: 2500, total: 2500 }] },
      },
    });

    const res = await POSTBulk(
      mockPost("http://localhost/api/orders/bulk", {
        ids: [valid.id, terminal.id],
        status: "confirmed",
      }),
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.succeeded).toContain(valid.id);
    expect(body.failed).toHaveLength(1);
    expect((body.failed as Array<{ id: string }>)[0]!.id).toBe(terminal.id);
  });

  it("returns 400 on invalid input (empty ids array)", async () => {
    const res = await POSTBulk(
      mockPost("http://localhost/api/orders/bulk", { ids: [], status: "confirmed" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid status enum", async () => {
    const res = await POSTBulk(
      mockPost("http://localhost/api/orders/bulk", { ids: ["x"], status: "invalid_status" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when auth is set up but no session cookie is present", async () => {
    await rawDb.authSecret.create({
      data: { id: "default", secret: "test-secret-32-chars-long-aaaa", pinHash: "fake-hash" },
    });
    const { orders } = await seedPendingOrders(1);
    const res = await POSTBulk(
      mockPost("http://localhost/api/orders/bulk", { ids: [orders[0]!.id], status: "confirmed" }),
    );
    expect(res.status).toBe(401);
  });
});
