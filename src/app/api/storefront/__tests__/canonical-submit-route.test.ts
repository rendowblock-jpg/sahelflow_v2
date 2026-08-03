process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/storefront/submit/route";
import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
  seedProduct,
  seedStorefront,
} from "@/app/api/__tests__/helpers";
import { isCanonicalOrderAuthority } from "@/lib/orders/manual-order-authority";

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

function payload(
  slug: string,
  productId: string,
  submissionId: string,
): Record<string, unknown> {
  return {
    slug,
    submissionId,
    customer: {
      name: "Storefront route customer",
      phone: "0555123456",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "1 Canonical Street",
    },
    items: [{ productId, quantity: 2 }],
  };
}

describe("canonical storefront submit route", () => {
  it("replays the exact client submission after response loss", async () => {
    const product = await seedProduct({ price: 2750 });
    const storefront = await seedStorefront({ productIds: [product.id] });
    const body = payload(
      storefront.slug,
      product.id,
      "88888888-8888-4888-8888-888888888888",
    );

    const first = await POST(
      mockPost("http://localhost/api/storefront/submit", body),
    );
    const replay = await POST(
      mockPost("http://localhost/api/storefront/submit", body),
    );

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    const firstBody = await getJson(first);
    const replayBody = await getJson(replay);
    expect(firstBody.replayed).toBe(false);
    expect(replayBody.replayed).toBe(true);
    expect(replayBody.orderId).toBe(firstBody.orderId);
    expect(replayBody.orderNumber).toBe(firstBody.orderNumber);
    expect(await rawDb.order.count()).toBe(1);
    expect(
      await rawDb.businessCommand.count({
        where: { commandType: "order.source.create.v1" },
      }),
    ).toBe(1);

    const order = await rawDb.order.findUnique({
      where: { id: firstBody.orderId as string },
    });
    expect(order).toMatchObject({
      source: "storefront",
      sourceOrderId: "88888888-8888-4888-8888-888888888888",
      totalPrice: 5500,
      status: "pending",
    });
    expect(
      isCanonicalOrderAuthority(order?.source, order?.sourceMetadata),
    ).toBe(true);
  });

  it("rejects products outside the storefront before creating command facts", async () => {
    const allowed = await seedProduct();
    const foreign = await seedProduct();
    const storefront = await seedStorefront({ productIds: [allowed.id] });

    const response = await POST(
      mockPost(
        "http://localhost/api/storefront/submit",
        payload(
          storefront.slug,
          foreign.id,
          "99999999-9999-4999-8999-999999999999",
        ),
      ),
    );

    expect(response.status).toBe(400);
    expect(await rawDb.order.count()).toBe(0);
    expect(await rawDb.businessCommand.count()).toBe(0);
  });
});
