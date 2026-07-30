process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDb, getJson, mockPost, rawDb, seedProduct } from "@/app/api/__tests__/helpers";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined })),
}));
vi.mock("@/lib/risk-engine", () => ({ assessOrderRisk: vi.fn(async () => null) }));
vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger: vi.fn(async () => {}),
  dispatchLowStock: vi.fn(async () => {}),
  detectLowStock: vi.fn(async () => null),
}));

import { POST as POSTOrder } from "@/app/api/orders/route";
import { PATCH as PATCHStatus } from "@/app/api/orders/[id]/status/route";
import { POST as POSTBulk } from "@/app/api/orders/bulk/route";

let customerCounter = 0;
async function seedCustomer() {
  customerCounter += 1;
  return rawDb.customer.create({
    data: {
      name: `Customer ${customerCounter}`,
      phone: `customer-phone-${customerCounter}`,
      nameBlindIndex: `customer-name-${customerCounter}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "1 Rue Test",
    },
  });
}

function manualBody(
  customerId: string,
  productId: string,
  idempotencyKey: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    idempotencyKey,
    correlationId: `${idempotencyKey}-correlation`,
    customerId,
    items: [{
      productId,
      productName: "CLIENT VALUE MUST BE IGNORED",
      quantity: 2,
      unitPrice: 1,
    }],
    wilaya: "Alger",
    commune: "Alger Centre",
    address: "1 Rue Test",
    phone: "0555000001",
    source: "manual",
    deliveryCost: 600,
    ...overrides,
  };
}

async function createManualOrder(options?: { stock?: number; price?: number; key?: string }) {
  const product = await seedProduct({
    stock: options?.stock ?? 10,
    price: options?.price ?? 2500,
  });
  const customer = await seedCustomer();
  const key = options?.key ?? `manual-create-${customerCounter}-0000`;
  const response = await POSTOrder(
    mockPost("http://localhost/api/orders", manualBody(customer.id, product.id, key)),
  );
  expect(response.status).toBe(201);
  const body = await getJson(response);
  return {
    product,
    customer,
    body,
    order: body.order as {
      id: string;
      orderNumber: string;
      status: string;
      version: number;
      totalPrice: number;
    },
  };
}

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("POST /api/orders — canonical manual intake", () => {
  it("creates pending versioned truth from the server catalog", async () => {
    const product = await seedProduct({ name: "Server Product", price: 3200, stock: 10 });
    const customer = await seedCustomer();
    const response = await POSTOrder(
      mockPost(
        "http://localhost/api/orders",
        manualBody(customer.id, product.id, "manual-create-authority-0001"),
      ),
    );
    expect(response.status).toBe(201);
    const body = await getJson(response);
    expect(body).toMatchObject({
      authority: "trusted-manual-v1",
      customerCreated: false,
      command: { replayed: false, aggregateVersion: 1 },
      order: { status: "pending", version: 1, totalPrice: 7000 },
    });
    const stored = await rawDb.order.findFirst({
      where: { customerId: customer.id },
      include: { items: true },
    });
    expect(stored?.items).toEqual([
      expect.objectContaining({
        productId: product.id,
        productName: "Server Product",
        unitPrice: 3200,
        quantity: 2,
        total: 6400,
      }),
    ]);
  });

  it("replays creation without duplicating customer, order or command", async () => {
    const product = await seedProduct({ price: 2500 });
    const request = {
      idempotencyKey: "manual-create-replay-0001",
      correlationId: "manual-create-replay-correlation",
      newCustomer: {
        name: "Atomic Customer",
        phone: "0555111222",
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "2 Rue Test",
      },
      items: [{ productId: product.id, quantity: 1 }],
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "2 Rue Test",
      phone: "0555111222",
      source: "manual",
      deliveryCost: 600,
    };
    const first = await POSTOrder(mockPost("http://localhost/api/orders", request));
    const replay = await POSTOrder(mockPost("http://localhost/api/orders", request));
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    const firstBody = await getJson(first);
    const replayBody = await getJson(replay);
    expect(replayBody.order).toEqual(firstBody.order);
    expect(replayBody.command).toMatchObject({ replayed: true });
    expect(await rawDb.customer.count()).toBe(1);
    expect(await rawDb.order.count()).toBe(1);
    const commands = await rawDb.$queryRaw<Array<{ total: number | bigint }>>`
      SELECT COUNT(*) AS "total" FROM "BusinessCommand"
    `;
    expect(Number(commands[0]?.total ?? 0)).toBe(1);
  });

  it("rolls back a new customer when catalog validation fails", async () => {
    const response = await POSTOrder(mockPost("http://localhost/api/orders", {
      idempotencyKey: "manual-create-rollback-0001",
      newCustomer: {
        name: "Must Roll Back",
        phone: "0555999888",
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "3 Rue Test",
      },
      items: [{ productId: "missing-product", quantity: 1 }],
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "3 Rue Test",
      phone: "0555999888",
      source: "manual",
      deliveryCost: 600,
    }));
    expect(response.status).toBe(404);
    expect(await rawDb.customer.count()).toBe(0);
    expect(await rawDb.order.count()).toBe(0);
  });

  it("rejects changed content under a committed key", async () => {
    const product = await seedProduct();
    const customer = await seedCustomer();
    const request = manualBody(
      customer.id,
      product.id,
      "manual-create-content-conflict-0001",
    );
    expect((await POSTOrder(mockPost("http://localhost/api/orders", request))).status).toBe(201);
    expect((await POSTOrder(mockPost("http://localhost/api/orders", {
      ...request,
      deliveryCost: 700,
    }))).status).toBe(409);
    expect(await rawDb.order.count()).toBe(1);
  });

  it("returns 401 when authentication exists without a session", async () => {
    await rawDb.authSecret.create({
      data: {
        id: "default",
        secret: "test-secret-32-chars-long-aaaa",
        pinHash: "fake-hash",
      },
    });
    const product = await seedProduct();
    const customer = await seedCustomer();
    const response = await POSTOrder(
      mockPost(
        "http://localhost/api/orders",
        manualBody(customer.id, product.id, "manual-create-auth-0001"),
      ),
    );
    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/orders/[id]/status — canonical decision", () => {
  it("confirms exactly once and replays the committed result", async () => {
    const { order, product } = await createManualOrder({ stock: 5 });
    const request = {
      status: "confirmed",
      expectedVersion: order.version,
      idempotencyKey: "manual-confirm-route-0001",
      correlationId: "manual-confirm-route-correlation",
    };
    const first = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, request),
      { params: Promise.resolve({ id: order.id }) },
    );
    const replay = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, request),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await getJson(first)).toMatchObject({
      order: { status: "confirmed", version: 2 },
      command: { replayed: false, aggregateVersion: 1 },
    });
    expect(await getJson(replay)).toMatchObject({
      command: { replayed: true, aggregateVersion: 1 },
    });
    expect(await rawDb.product.findUnique({ where: { id: product.id } })).toMatchObject({ stock: 3 });
    const reservations = await rawDb.$queryRaw<Array<{ total: number | bigint }>>`
      SELECT COUNT(*) AS "total" FROM "InventoryReservation"
      WHERE "orderId" = ${order.id} AND "state" = 'active'
    `;
    expect(Number(reservations[0]?.total ?? 0)).toBe(1);
  });

  it("requires the command envelope", async () => {
    const { order } = await createManualOrder();
    const response = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, { status: "confirmed" }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(response.status).toBe(400);
  });

  it("rejects a stale version without moving stock", async () => {
    const { order, product } = await createManualOrder({ stock: 5 });
    const response = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, {
        status: "confirmed",
        expectedVersion: 2,
        idempotencyKey: "manual-confirm-stale-0001",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(response.status).toBe(409);
    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "pending",
      version: 1,
    });
    expect(await rawDb.product.findUnique({ where: { id: product.id } })).toMatchObject({ stock: 5 });
  });

  it("rejects with a required reason and does not reserve stock", async () => {
    const { order, product } = await createManualOrder({ stock: 5 });
    const response = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, {
        status: "cancelled",
        expectedVersion: order.version,
        idempotencyKey: "manual-reject-route-0001",
        reason: "Customer declined by phone",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(response.status).toBe(200);
    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "cancelled",
      version: 2,
    });
    expect(await rawDb.product.findUnique({ where: { id: product.id } })).toMatchObject({ stock: 5 });
  });
});

describe("POST /api/orders/bulk — confirmation bypass", () => {
  it("rejects confirmed at schema validation and preserves order and stock", async () => {
    const { order, product } = await createManualOrder({ stock: 5 });
    const response = await POSTBulk(mockPost("http://localhost/api/orders/bulk", {
      ids: [order.id],
      status: "confirmed",
    }));
    expect(response.status).toBe(400);
    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "pending" });
    expect(await rawDb.product.findUnique({ where: { id: product.id } })).toMatchObject({ stock: 5 });
  });
});
