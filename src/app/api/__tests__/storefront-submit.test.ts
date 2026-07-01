/**
 * Integration test: POST /api/storefront/submit
 *
 * Tests the public COD checkout flow: customer places an order via the
 * storefront, the route creates a customer (find-or-create) + a draft order.
 *
 * This is the highest-risk API surface (public, unauthenticated, writes PII +
 * creates orders). TEST-002 (P0): zero API route tests existed before this.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { POST } from "../storefront/submit/route";
import { rawDb, cleanDb, mockPost, getJson, seedStorefront, seedProduct } from "./helpers";

describe("POST /api/storefront/submit", () => {
  beforeEach(async () => { await cleanDb(); });

  afterAll(async () => { await rawDb.$disconnect(); });

  it("creates a customer + draft order on valid submit", async () => {
    const product = await seedProduct({ price: 2500 });
    const storefront = await seedStorefront({ productIds: [product.id] });

    const res = await POST(mockPost("http://localhost/api/storefront/submit", {
      slug: storefront.slug,
      customer: {
        name: "Ahmed Test",
        phone: "0555123456",
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Test",
      },
      items: [{ productId: product.id, quantity: 2 }],
    }));

    expect(res.status).toBe(201);
    const body = await getJson(res);
    expect(body.ok).toBe(true);
    expect(body.orderNumber).toBeTruthy();
    expect(body.total).toBe(5000);

    // Verify customer was created
    const customers = await rawDb.customer.findMany();
    expect(customers).toHaveLength(1);

    // Verify order was created
    const orders = await rawDb.order.findMany();
    expect(orders).toHaveLength(1);
    expect(orders[0]!.status).toBe("draft");
    expect(orders[0]!.totalPrice).toBe(5000);
    expect(orders[0]!.source).toBe("storefront");
  });

  it("returns 404 for inactive storefront", async () => {
    const product = await seedProduct();
    const storefront = await seedStorefront({ active: false, productIds: [product.id] });

    const res = await POST(mockPost("http://localhost/api/storefront/submit", {
      slug: storefront.slug,
      customer: { name: "Test", phone: "0555123456", wilaya: "Alger", commune: "B", address: "C" },
      items: [{ productId: product.id, quantity: 1 }],
    }));

    expect(res.status).toBe(404);
  });

  it("returns 404 for nonexistent storefront", async () => {
    const product = await seedProduct();
    const res = await POST(mockPost("http://localhost/api/storefront/submit", {
      slug: "nonexistent",
      customer: { name: "Test", phone: "0555123456", wilaya: "Alger", commune: "B", address: "C" },
      items: [{ productId: product.id, quantity: 1 }],
    }));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid input (missing required fields)", async () => {
    const res = await POST(mockPost("http://localhost/api/storefront/submit", {
      slug: "test",
      customer: { name: "", phone: "invalid", wilaya: "", commune: "", address: "" },
      items: [],
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when product is not in storefront", async () => {
    const product = await seedProduct();
    const otherProduct = await seedProduct({ name: "Other Product" });
    await seedStorefront({ productIds: [product.id] });

    const res = await POST(mockPost("http://localhost/api/storefront/submit", {
      slug: "test-store",
      customer: { name: "Test", phone: "0555123456", wilaya: "Alger", commune: "B", address: "C" },
      items: [{ productId: otherProduct.id, quantity: 1 }],
    }));
    expect(res.status).toBe(400);
  });

  it("reuses existing customer on repeat submit (find-or-create)", async () => {
    const product = await seedProduct();
    await seedStorefront({ productIds: [product.id] });

    // First order
    await POST(mockPost("http://localhost/api/storefront/submit", {
      slug: "test-store",
      customer: { name: "Repeat Customer", phone: "0555123456", wilaya: "Alger", commune: "B", address: "C" },
      items: [{ productId: product.id, quantity: 1 }],
    }));

    // Second order with same phone
    await POST(mockPost("http://localhost/api/storefront/submit", {
      slug: "test-store",
      customer: { name: "Repeat Customer", phone: "0555123456", wilaya: "Alger", commune: "B", address: "C" },
      items: [{ productId: product.id, quantity: 1 }],
    }));

    // Should have 1 customer, 2 orders
    const customers = await rawDb.customer.findMany();
    expect(customers).toHaveLength(1);
    const orders = await rawDb.order.findMany();
    expect(orders).toHaveLength(2);
  });
});
