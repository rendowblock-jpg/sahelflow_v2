process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
} from "@/app/api/__tests__/helpers";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

import { PATCH as PATCHStatus } from "@/app/api/orders/[id]/status/route";

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("legacy manual status compatibility", () => {
  it("keeps a pre-authority manual row readable but denies new confirmation truth", async () => {
    const customer = await rawDb.customer.create({
      data: {
        name: "Historical Customer",
        phone: "0555000777",
        nameBlindIndex: "historical-customer",
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Historical Address",
      },
    });
    const order = await rawDb.order.create({
      data: {
        orderNumber: "LEGACY-MANUAL-001",
        status: "pending",
        version: 1,
        customerId: customer.id,
        totalPrice: 1500,
        deliveryCost: 0,
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Historical Address",
        phone: "0555000777",
        source: "manual",
        sourceMetadata: null,
        items: {
          create: [{
            productId: null,
            productVariantId: null,
            productName: "Historical unmapped product",
            productVariantName: null,
            quantity: 1,
            unitPrice: 1500,
            total: 1500,
          }],
        },
      },
    });

    const response = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, {
        status: "confirmed",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );

    expect(response.status).toBe(409);
    expect(await getJson(response)).toMatchObject({
      code: "CANONICAL_CONFIRMATION_REQUIRED",
    });
    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "pending",
      version: 1,
    });
    const commands = await rawDb.$queryRaw<Array<{ total: number | bigint }>>`
      SELECT COUNT(*) AS "total"
      FROM "BusinessCommand"
      WHERE "aggregateId" = ${order.id}
    `;
    expect(Number(commands[0]?.total ?? 0)).toBe(0);
  });
});
