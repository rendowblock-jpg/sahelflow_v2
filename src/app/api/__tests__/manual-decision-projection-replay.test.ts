process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
  seedProduct,
} from "@/app/api/__tests__/helpers";
import { createTrustedManualOrder } from "@/lib/orders/manual-order";

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

describe("manual decision projection-independent replay", () => {
  it("returns the stored rejection result after the live order is changed and soft-deleted", async () => {
    const product = await seedProduct({ stock: 5, price: 1800 });
    const customer = await rawDb.customer.create({
      data: {
        name: "Replay Projection Customer",
        phone: "0555000991",
        nameBlindIndex: "replay-projection-customer",
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Replay Address",
      },
    });
    const created = await createTrustedManualOrder(
      { prisma: rawDb as never },
      {
        idempotencyKey: "projection-replay-create-0001",
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 1 }],
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Replay Address",
        phone: "0555000991",
        deliveryCost: 0,
        source: "manual",
      },
    );
    const order = created.result.order;
    const request = {
      status: "cancelled",
      expectedVersion: order.version,
      idempotencyKey: "projection-replay-reject-0001",
      reason: "Customer declined",
    };

    const first = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, request),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(first.status).toBe(200);
    const firstBody = await getJson(first);

    await rawDb.order.update({
      where: { id: order.id },
      data: {
        notes: "Later mutable projection data",
        deletedAt: new Date(),
      },
    });

    const replay = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, request),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(replay.status).toBe(200);
    const replayBody = await getJson(replay);

    expect(replayBody.order).toEqual(firstBody.order);
    expect(replayBody.command).toMatchObject({ replayed: true });
    expect(replayBody.order).toMatchObject({
      id: order.id,
      status: "cancelled",
      version: 2,
    });
  });
});
