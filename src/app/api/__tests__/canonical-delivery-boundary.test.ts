process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
  seedProduct,
} from "@/app/api/__tests__/helpers";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";

const { createShipmentMock, loadDeliveryCredentialsMock } = vi.hoisted(() => ({
  createShipmentMock: vi.fn(),
  loadDeliveryCredentialsMock: vi.fn(async () => ({})),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

vi.mock("@/lib/integrations/delivery", () => ({
  getDeliveryAdapter: vi.fn(() => ({
    createShipment: createShipmentMock,
  })),
  loadDeliveryCredentials: loadDeliveryCredentialsMock,
}));

import { POST as POSTDelivery } from "@/app/api/delivery/create/route";

beforeEach(async () => {
  await cleanDb();
  createShipmentMock.mockReset();
  loadDeliveryCredentialsMock.mockClear();
});
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("canonical delivery boundary", () => {
  it("rejects before creating a delivery row or calling the provider", async () => {
    const product = await seedProduct({ stock: 5, price: 2000 });
    const customer = await rawDb.customer.create({
      data: {
        name: "Reserved Customer",
        phone: "0555000888",
        nameBlindIndex: "reserved-customer",
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Reserved Address",
      },
    });
    const order = await rawDb.order.create({
      data: {
        orderNumber: "CANONICAL-SHIP-001",
        status: "pending",
        version: 1,
        customerId: customer.id,
        totalPrice: 2000,
        deliveryCost: 0,
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Reserved Address",
        phone: "0555000888",
        source: "manual",
        sourceMetadata: JSON.stringify({ authority: "trusted-manual-v1" }),
        items: {
          create: [{
            productId: product.id,
            productVariantId: null,
            productName: product.name,
            productVariantName: null,
            quantity: 1,
            unitPrice: 2000,
            total: 2000,
          }],
        },
      },
    });

    await executeManualOrderDecision(
      { prisma: rawDb as never },
      {
        orderId: order.id,
        decision: "confirm",
        expectedVersion: 1,
        idempotencyKey: "canonical-delivery-confirm-0001",
      },
    );

    const response = await POSTDelivery(
      mockPost("http://localhost/api/delivery/create", {
        orderId: order.id,
        provider: "yalidine",
      }),
    );

    expect(response.status).toBe(409);
    expect(await getJson(response)).toMatchObject({
      code: "CANONICAL_FOLLOWUP_REQUIRED",
    });
    expect(createShipmentMock).not.toHaveBeenCalled();
    expect(await rawDb.delivery.count()).toBe(0);
  });
});
