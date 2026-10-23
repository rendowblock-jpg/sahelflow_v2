/**
 * STORE-DESK-ADDRESS on the local checkout route (POST /api/storefront/submit).
 *
 * A buyer who collects at a courier's stop-desk has no street address. The order still needs a
 * non-empty Order.address (every consumer reads it as text), so a desk order with no address is stored
 * with the fixed text "Stop desk"; a home order with no address is refused; what a buyer did type is
 * kept; and the buyer's saved customer record never receives the desk text as if it were their home.
 *
 * Real SQLite and the real route. Order and customer fields are encrypted at rest, so they are read
 * through the same `db` the route writes with.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { POST } from "../storefront/submit/route";
import { cleanDb, getJson, mockPost, rawDb, seedProduct, seedStorefront } from "./helpers";

async function submit(options: {
  address?: string | null;
  deliveryMode?: "home" | "desk" | null;
  submissionId?: string;
  productId: string;
}) {
  const customer: Record<string, unknown> = {
    name: "Desk Buyer",
    phone: "0555123456",
    wilaya: "Alger",
    commune: "Bab Ezzouar",
  };
  if (options.address !== null) customer.address = options.address ?? "";
  const body: Record<string, unknown> = {
    slug: "test-store",
    submissionId: options.submissionId ?? crypto.randomUUID(),
    customer,
    items: [{ productId: options.productId, quantity: 1 }],
  };
  if (options.deliveryMode !== null) body.deliveryMode = options.deliveryMode ?? "desk";
  return POST(mockPost("http://localhost/api/storefront/submit", body));
}

async function setup() {
  const product = await seedProduct({ stock: 50 });
  await seedStorefront({ productIds: [product.id] });
  return product;
}

async function onlyOrder() {
  const orders = await db.order.findMany({});
  expect(orders).toHaveLength(1);
  return orders[0]!;
}

beforeEach(cleanDb);
afterAll(async () => {
  await rawDb.$disconnect();
});

describe("local storefront checkout and the stop-desk address (STORE-DESK-ADDRESS)", () => {
  it("places a desk order with an empty address and stores the stop-desk text", async () => {
    const product = await setup();

    const response = await submit({ productId: product.id, deliveryMode: "desk", address: "" });

    expect(response.status).toBe(201);
    expect((await onlyOrder()).address).toBe("Stop desk");
  });

  it("treats a blank address, and a missing address key, the same way for a desk order", async () => {
    const product = await setup();

    expect((await submit({ productId: product.id, deliveryMode: "desk", address: "   " })).status).toBe(201);
    expect((await submit({ productId: product.id, deliveryMode: "desk", address: null })).status).toBe(201);

    const addresses = (await db.order.findMany({})).map((order) => order.address);
    expect(addresses).toEqual(["Stop desk", "Stop desk"]);
  });

  it("keeps an address a desk buyer did type", async () => {
    const product = await setup();

    await submit({ productId: product.id, deliveryMode: "desk", address: "  Bureau Yalidine Kouba " });

    expect((await onlyOrder()).address).toBe("Bureau Yalidine Kouba");
  });

  it("refuses a home order with no address and creates nothing", async () => {
    const product = await setup();

    for (const address of ["", "   ", null] as const) {
      const response = await submit({ productId: product.id, deliveryMode: "home", address });
      expect(response.status).toBe(400);
      expect(await getJson(response)).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    }

    expect(await rawDb.order.count()).toBe(0);
    expect(await rawDb.customer.count()).toBe(0);
  });

  it("treats an order with no delivery mode as a home order, so it still needs an address", async () => {
    const product = await setup();

    const response = await submit({ productId: product.id, deliveryMode: null, address: "" });

    expect(response.status).toBe(400);
    expect(await rawDb.order.count()).toBe(0);
  });

  it("is unchanged for a home order with an address", async () => {
    const product = await setup();

    const response = await submit({ productId: product.id, deliveryMode: "home", address: "Cité 5, rue 3" });

    expect(response.status).toBe(201);
    expect((await onlyOrder()).address).toBe("Cité 5, rue 3");
  });

  it("records the delivery mode as a fact on the order, not only in the address text", async () => {
    const product = await setup();

    await submit({ productId: product.id, deliveryMode: "desk", address: "" });

    const metadata = JSON.parse((await onlyOrder()).sourceMetadata ?? "{}") as {
      sourceDetails?: { deliveryMode?: string };
    };
    expect(metadata.sourceDetails?.deliveryMode).toBe("desk");
  });

  it("does not save the desk text as the buyer's own address", async () => {
    const product = await setup();

    await submit({ productId: product.id, deliveryMode: "desk", address: "" });

    const customers = await db.customer.findMany({});
    expect(customers).toHaveLength(1);
    expect(customers[0]!.address ?? "").not.toContain("Stop desk");
    expect(customers[0]!.address ?? "").toBe("");
  });

  it("replays the same desk submission without a second order", async () => {
    const product = await setup();
    const submissionId = "70707070-7070-4070-8070-707070707070";

    const first = await submit({ productId: product.id, deliveryMode: "desk", address: "", submissionId });
    const again = await submit({ productId: product.id, deliveryMode: "desk", address: "", submissionId });

    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(await getJson(again)).toMatchObject({ replayed: true });
    expect(await rawDb.order.count()).toBe(1);
  });
});
