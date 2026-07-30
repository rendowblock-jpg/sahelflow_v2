process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
  seedProduct,
} from "@/app/api/__tests__/helpers";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

vi.mock("@/lib/risk-engine", () => ({
  assessOrderRisk: vi.fn(async () => null),
}));

vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger: vi.fn(async () => {}),
  dispatchLowStock: vi.fn(async () => {}),
  detectLowStock: vi.fn(async () => null),
}));

import { PATCH as PATCHOrder } from "@/app/api/orders/[id]/route";
import { PATCH as PATCHStatus } from "@/app/api/orders/[id]/status/route";
import { POST as POSTOrder } from "@/app/api/orders/route";

let sequence = 0;

async function seedCustomer() {
  sequence += 1;
  return rawDb.customer.create({
    data: {
      name: `Boundary Customer ${sequence}`,
      phone: `boundary-phone-${sequence}`,
      nameBlindIndex: `boundary-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Boundary Address",
    },
  });
}

function omittedSourceBody(
  customerId: string,
  productId: string,
  idempotencyKey?: string,
) {
  return {
    ...(idempotencyKey ? { idempotencyKey } : {}),
    customerId,
    items: [{
      productId,
      productName: "Untrusted name",
      quantity: 1,
      unitPrice: 1,
    }],
    wilaya: "Alger",
    commune: "Alger Centre",
    address: "Boundary Address",
    phone: "0555000001",
    deliveryCost: 600,
  };
}

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("manual intake source routing", () => {
  it("does not let an omitted source bypass the canonical command envelope", async () => {
    const product = await seedProduct({ price: 4200 });
    const customer = await seedCustomer();

    const response = await POSTOrder(
      mockPost(
        "http://localhost/api/orders",
        omittedSourceBody(customer.id, product.id),
      ),
    );

    expect(response.status).toBe(400);
    expect(await rawDb.order.count()).toBe(0);
  });

  it("treats omitted source as canonical manual intake when the envelope is present", async () => {
    const product = await seedProduct({ name: "Catalog Truth", price: 4200 });
    const customer = await seedCustomer();

    const response = await POSTOrder(
      mockPost(
        "http://localhost/api/orders",
        omittedSourceBody(
          customer.id,
          product.id,
          "omitted-source-canonical-0001",
        ),
      ),
    );

    expect(response.status).toBe(201);
    const body = await getJson(response);
    expect(body.authority).toBe("trusted-manual-v1");
    expect(body.order).toMatchObject({ status: "pending", totalPrice: 4800 });
    const item = await rawDb.orderItem.findFirst();
    expect(item).toMatchObject({
      productId: product.id,
      productName: "Catalog Truth",
      unitPrice: 4200,
    });
  });
});

describe("canonical reservation edit boundary", () => {
  it("rejects contact and note edits after confirmation reserves stock", async () => {
    const product = await seedProduct({ stock: 5 });
    const customer = await seedCustomer();
    const createResponse = await POSTOrder(
      mockPost("http://localhost/api/orders", {
        ...omittedSourceBody(
          customer.id,
          product.id,
          "reservation-edit-create-0001",
        ),
        source: "manual",
      }),
    );
    expect(createResponse.status).toBe(201);
    const created = await getJson(createResponse);
    const order = created.order as { id: string; version: number };

    const confirmResponse = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, {
        status: "confirmed",
        expectedVersion: order.version,
        idempotencyKey: "reservation-edit-confirm-0001",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(confirmResponse.status).toBe(200);

    const beforeEdit = await rawDb.order.findUnique({
      where: { id: order.id },
      select: {
        notes: true,
        phone: true,
        phoneBlindIndex: true,
        address: true,
        version: true,
      },
    });
    expect(beforeEdit).not.toBeNull();

    const editResponse = await PATCHOrder(
      mockPost(`http://localhost/api/orders/${order.id}`, {
        notes: "This must not be accepted",
        phone: "0555999999",
        address: "Changed address",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );

    expect(editResponse.status).toBe(409);
    const afterEdit = await rawDb.order.findUnique({
      where: { id: order.id },
      select: {
        notes: true,
        phone: true,
        phoneBlindIndex: true,
        address: true,
        version: true,
      },
    });
    expect(afterEdit).toEqual(beforeEdit);
    expect(afterEdit).toMatchObject({ notes: null, version: 2 });
  });
});
