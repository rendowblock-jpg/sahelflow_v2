/**
 * Integration tests for the central order routes.
 *
 * Direct POST tests establish an explicit trusted owner fixture. Legacy status
 * and bulk routes continue to exercise their existing database-session boundary.
 */
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
  seedProduct,
} from "@/app/api/__tests__/helpers";

const authority = vi.hoisted(() => ({
  requireAction: vi.fn(),
  ownerContext: {
    version: 1,
    actor: {
      kind: "person" as const,
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "orders-route-session",
      role: "owner" as const,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: {
      workspaceId: "1".repeat(32),
      installationId: "2".repeat(32),
      shopId: "default",
      shopIncarnationId: "3".repeat(32),
      registryRevision: 1,
      databaseFileId: "default.db",
      migrationSetSha256: "4".repeat(64),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

vi.mock("@/lib/identity/authorization", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/authorization")
  >();
  return { ...actual, requireTrustedAction: authority.requireAction };
});

vi.mock("@/lib/business-truth/principal", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/business-truth/principal")
  >();
  return {
    ...actual,
    businessPrincipalFromTrustedActor: vi.fn(() =>
      actual.testAuthenticatedOwnerBusinessPrincipal("orders-route-test"),
    ),
  };
});

vi.mock("@/lib/identity/order-projection", () => ({
  projectOrderForTrustedActor: (_context: unknown, order: Record<string, unknown>) => ({
    ...order,
    fieldAccess: { contact: true, financials: true },
  }),
  projectOrdersForTrustedActor: (
    _context: unknown,
    orders: Array<Record<string, unknown>>,
  ) =>
    orders.map((order) => ({
      ...order,
      fieldAccess: { contact: true, financials: true },
    })),
}));

vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger: vi.fn(async () => {}),
  dispatchLowStock: vi.fn(async () => {}),
  detectLowStock: vi.fn(async () => null),
}));

import { POST as POSTOrder } from "@/app/api/orders/route";
import { PATCH as PATCHStatus } from "@/app/api/orders/[id]/status/route";
import { POST as POSTBulk } from "@/app/api/orders/bulk/route";

process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let customerCounter = 0;

async function seedCustomer() {
  customerCounter += 1;
  return rawDb.customer.create({
    data: {
      name: `Cust ${customerCounter}`,
      phone: `0555${String(customerCounter).padStart(6, "0")}`,
      nameBlindIndex: `cust-blind-${customerCounter}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      orderCount: 0,
      totalSpent: 0,
    },
  });
}

function orderBody(
  customerId: string,
  productId: string,
  options?: { deliveryCost?: number; source?: string },
) {
  return {
    idempotencyKey: `orders-test-${customerId}-${productId}`,
    customerId,
    items: [
      {
        productId,
        productName: "Test Product",
        quantity: 2,
        unitPrice: 2500,
      },
    ],
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "123 Rue Didouche",
    phone: "0555000001",
    source: options?.source ?? "manual",
    deliveryCost: options?.deliveryCost ?? 600,
  };
}

function unauthorized(): Error & { code: string; statusCode: number } {
  return Object.assign(new Error("Unauthorized"), {
    code: "UNAUTHORIZED",
    statusCode: 401,
  });
}

describe("POST /api/orders — create order", () => {
  beforeEach(async () => {
    await cleanDb();
    authority.requireAction
      .mockReset()
      .mockResolvedValue(authority.ownerContext);
  });

  it("creates a trusted pending order and creation ledger", async () => {
    const product = await seedProduct({ price: 2500, stock: 100 });
    const customer = await seedCustomer();

    const response = await POSTOrder(
      mockPost(
        "http://localhost/api/orders",
        orderBody(customer.id, product.id),
      ),
    );

    expect(response.status).toBe(201);
    const body = await getJson(response);
    const order = body.order as Record<string, unknown>;
    expect(order).toMatchObject({
      status: "pending",
      totalPrice: 5600,
      fieldAccess: { contact: true, financials: true },
    });
    expect(order.orderNumber).toBeTruthy();
    expect(body.authority).toBe("trusted-manual-v1");
    expect(authority.requireAction).toHaveBeenCalledWith("orders.create");

    const stored = await rawDb.order.findFirst({
      where: { customerId: customer.id },
    });
    expect(stored).toMatchObject({ source: "manual" });
    expect(
      await rawDb.orderChange.count({
        where: { orderId: stored?.id, actionType: "created" },
      }),
    ).toBe(1);
  });

  it("returns 400 on missing items", async () => {
    const customer = await seedCustomer();
    const response = await POSTOrder(
      mockPost("http://localhost/api/orders", {
        customerId: customer.id,
        items: [],
        wilaya: "Alger",
        commune: "B",
        address: "C",
        phone: "0555000001",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 on invalid Algerian phone", async () => {
    const product = await seedProduct();
    const customer = await seedCustomer();
    const response = await POSTOrder(
      mockPost("http://localhost/api/orders", {
        ...orderBody(customer.id, product.id),
        phone: "123",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 when the customer does not exist", async () => {
    const product = await seedProduct();
    const response = await POSTOrder(
      mockPost(
        "http://localhost/api/orders",
        orderBody("clxxxxxxxxxxxxxxxxxxxxxxxxxx", product.id),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("returns 401 when trusted member authority is unavailable", async () => {
    authority.requireAction.mockRejectedValue(unauthorized());
    const product = await seedProduct();
    const customer = await seedCustomer();

    const response = await POSTOrder(
      mockPost(
        "http://localhost/api/orders",
        orderBody(customer.id, product.id),
      ),
    );
    expect(response.status).toBe(401);
    expect(await rawDb.order.count()).toBe(0);
  });
});

describe("PATCH /api/orders/[id]/status — transition status", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  async function seedOrderAtStatus(
    status: "draft" | "pending" | "confirmed" | "shipped" | "delivered",
  ) {
    const product = await seedProduct({ price: 2500, stock: 100 });
    const customer = await seedCustomer();
    const order = await rawDb.order.create({
      data: {
        orderNumber: `ORD-TEST-${status}-${customerCounter}`,
        status,
        customerId: customer.id,
        totalPrice: 5000,
        deliveryCost: 600,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Didouche",
        phone: "0555000001",
        source: "manual",
        confirmedAt:
          status === "confirmed" || status === "shipped" || status === "delivered"
            ? new Date()
            : null,
        shippedAt:
          status === "shipped" || status === "delivered" ? new Date() : null,
        deliveredAt: status === "delivered" ? new Date() : null,
        items: {
          create: [
            {
              productId: product.id,
              productName: "Test Product",
              quantity: 2,
              unitPrice: 2500,
              total: 5000,
            },
          ],
        },
      },
    });
    return { order, product, customer };
  }

  it("transitions pending to confirmed, deducts stock and records history", async () => {
    const { order, product } = await seedOrderAtStatus("pending");
    const response = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, {
        status: "confirmed",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );

    expect(response.status).toBe(200);
    expect(await getJson(response)).toMatchObject({
      order: { status: "confirmed" },
    });
    expect(
      await rawDb.product.findUnique({ where: { id: product.id } }),
    ).toMatchObject({ stock: 98 });
    expect(
      await rawDb.order.findUnique({ where: { id: order.id } }),
    ).toMatchObject({ status: "confirmed" });
    expect(
      await rawDb.orderChange.count({
        where: { orderId: order.id, actionType: "status_change" },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it("transitions confirmed to shipped", async () => {
    const { order } = await seedOrderAtStatus("confirmed");
    const response = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, {
        status: "shipped",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(response.status).toBe(200);
    expect(
      await rawDb.order.findUnique({ where: { id: order.id } }),
    ).toMatchObject({ status: "shipped" });
  });

  it("rejects an invalid transition", async () => {
    const { order } = await seedOrderAtStatus("draft");
    const response = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, {
        status: "delivered",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect([400, 409]).toContain(response.status);
  });

  it("returns 404 for a missing order", async () => {
    const response = await PATCHStatus(
      mockPost("http://localhost/api/orders/nonexistent/status", {
        status: "confirmed",
      }),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );
    expect(response.status).toBe(404);
  });

  it("returns 400 for an invalid status", async () => {
    const { order } = await seedOrderAtStatus("pending");
    const response = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, {
        status: "invalid_status",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 with configured auth and no session", async () => {
    await rawDb.authSecret.create({
      data: {
        id: "default",
        secret: "test-secret-32-chars-long-aaaa",
        pinHash: "fake-hash",
      },
    });
    const { order } = await seedOrderAtStatus("pending");
    const response = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, {
        status: "confirmed",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(response.status).toBe(401);
  });
});

describe("POST /api/orders/bulk — bulk status transition", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  async function seedPendingOrders(count: number) {
    const product = await seedProduct({ price: 2500, stock: 1000 });
    const customer = await seedCustomer();
    const orders = [];
    for (let index = 0; index < count; index += 1) {
      orders.push(
        await rawDb.order.create({
          data: {
            orderNumber: `ORD-BULK-${customerCounter}-${index}`,
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
              create: [
                {
                  productId: product.id,
                  productName: "Test",
                  quantity: 1,
                  unitPrice: 2500,
                  total: 2500,
                },
              ],
            },
          },
        }),
      );
    }
    return { orders, product, customer };
  }

  it("bulk-confirms multiple pending orders", async () => {
    const { orders } = await seedPendingOrders(3);
    const ids = orders.map((order) => order.id);
    const response = await POSTBulk(
      mockPost("http://localhost/api/orders/bulk", {
        ids,
        status: "confirmed",
      }),
    );

    expect(response.status).toBe(200);
    expect(await getJson(response)).toMatchObject({
      succeeded: expect.arrayContaining(ids),
      failed: [],
    });
    expect(
      (
        await rawDb.order.findMany({ where: { id: { in: ids } } })
      ).every((order) => order.status === "confirmed"),
    ).toBe(true);
  });

  it("auto-advances a mix of draft and pending orders", async () => {
    const product = await seedProduct({ price: 2500, stock: 100 });
    const customer = await seedCustomer();
    const create = (orderNumber: string, status: "draft" | "pending") =>
      rawDb.order.create({
        data: {
          orderNumber,
          status,
          customerId: customer.id,
          totalPrice: 2500,
          deliveryCost: 0,
          wilaya: "Alger",
          commune: "B",
          address: "A",
          phone: "0555000001",
          source: "manual",
          items: {
            create: [
              {
                productId: product.id,
                productName: "X",
                quantity: 1,
                unitPrice: 2500,
                total: 2500,
              },
            ],
          },
        },
      });
    const draft = await create(`ORD-DRAFT-${customerCounter}`, "draft");
    const pending = await create(`ORD-PEND-${customerCounter}`, "pending");

    const response = await POSTBulk(
      mockPost("http://localhost/api/orders/bulk", {
        ids: [draft.id, pending.id],
        status: "confirmed",
      }),
    );
    expect(response.status).toBe(200);
    expect((await getJson(response)).succeeded).toHaveLength(2);
  });

  it("reports a terminal-order failure without blocking a valid order", async () => {
    const { orders, customer, product } = await seedPendingOrders(1);
    const terminal = await rawDb.order.create({
      data: {
        orderNumber: `ORD-TERM-${customerCounter}`,
        status: "cancelled",
        customerId: customer.id,
        totalPrice: 2500,
        deliveryCost: 0,
        wilaya: "Alger",
        commune: "B",
        address: "A",
        phone: "0555000001",
        source: "manual",
        items: {
          create: [
            {
              productId: product.id,
              productName: "X",
              quantity: 1,
              unitPrice: 2500,
              total: 2500,
            },
          ],
        },
      },
    });

    const response = await POSTBulk(
      mockPost("http://localhost/api/orders/bulk", {
        ids: [orders[0]!.id, terminal.id],
        status: "confirmed",
      }),
    );
    const body = await getJson(response);
    expect(response.status).toBe(200);
    expect(body.succeeded).toContain(orders[0]!.id);
    expect(body.failed).toHaveLength(1);
  });

  it("returns 400 for empty IDs", async () => {
    const response = await POSTBulk(
      mockPost("http://localhost/api/orders/bulk", {
        ids: [],
        status: "confirmed",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid status", async () => {
    const response = await POSTBulk(
      mockPost("http://localhost/api/orders/bulk", {
        ids: ["x"],
        status: "invalid_status",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 with configured auth and no session", async () => {
    await rawDb.authSecret.create({
      data: {
        id: "default",
        secret: "test-secret-32-chars-long-aaaa",
        pinHash: "fake-hash",
      },
    });
    const { orders } = await seedPendingOrders(1);
    const response = await POSTBulk(
      mockPost("http://localhost/api/orders/bulk", {
        ids: [orders[0]!.id],
        status: "confirmed",
      }),
    );
    expect(response.status).toBe(401);
  });
});

afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});
