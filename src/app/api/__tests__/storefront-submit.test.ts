/**
 * Integration test: POST /api/storefront/submit
 *
 * Tests the public COD checkout boundary: the route validates the storefront,
 * mints exact source authority, and commits a pending canonical order with PII,
 * audit, event, outbox and replay facts.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../storefront/submit/route";
import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
  seedProduct,
  seedStorefront,
} from "./helpers";
import { isCanonicalOrderAuthority } from "@/lib/orders/manual-order-authority";

describe("POST /api/storefront/submit", () => {
  beforeEach(cleanDb);

  afterAll(async () => {
    await rawDb.$disconnect();
  });

  it("creates a customer and pending canonical order on valid submit", async () => {
    const product = await seedProduct({ price: 2500 });
    const storefront = await seedStorefront({ productIds: [product.id] });

    const response = await POST(
      mockPost("http://localhost/api/storefront/submit", {
        slug: storefront.slug,
        submissionId: "10101010-1010-4010-8010-101010101010",
        customer: {
          name: "Ahmed Test",
          phone: "0555123456",
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "123 Rue Test",
        },
        items: [{ productId: product.id, quantity: 2 }],
      }),
    );

    expect(response.status).toBe(201);
    const body = await getJson(response);
    expect(body).toMatchObject({ ok: true, total: 5000, replayed: false });
    expect(body.orderNumber).toBeTruthy();

    expect(await rawDb.customer.count()).toBe(1);
    const order = await rawDb.order.findUnique({
      where: { id: body.orderId as string },
    });
    expect(order).toMatchObject({
      status: "pending",
      totalPrice: 5000,
      source: "storefront",
      sourceOrderId: "10101010-1010-4010-8010-101010101010",
    });
    expect(
      isCanonicalOrderAuthority(order?.source, order?.sourceMetadata),
    ).toBe(true);
    expect(await rawDb.businessCommand.count()).toBe(1);
  });

  it("returns 404 for inactive storefront", async () => {
    const product = await seedProduct();
    const storefront = await seedStorefront({
      active: false,
      productIds: [product.id],
    });

    const response = await POST(
      mockPost("http://localhost/api/storefront/submit", {
        slug: storefront.slug,
        customer: {
          name: "Test",
          phone: "0555123456",
          wilaya: "Alger",
          commune: "B",
          address: "C",
        },
        items: [{ productId: product.id, quantity: 1 }],
      }),
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 for nonexistent storefront", async () => {
    const product = await seedProduct();
    const response = await POST(
      mockPost("http://localhost/api/storefront/submit", {
        slug: "nonexistent",
        customer: {
          name: "Test",
          phone: "0555123456",
          wilaya: "Alger",
          commune: "B",
          address: "C",
        },
        items: [{ productId: product.id, quantity: 1 }],
      }),
    );
    expect(response.status).toBe(404);
  });

  it("returns 400 for invalid input", async () => {
    const response = await POST(
      mockPost("http://localhost/api/storefront/submit", {
        slug: "test",
        customer: {
          name: "",
          phone: "invalid",
          wilaya: "",
          commune: "",
          address: "",
        },
        items: [],
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when product is not in storefront", async () => {
    const product = await seedProduct();
    const otherProduct = await seedProduct({ name: "Other Product" });
    await seedStorefront({ productIds: [product.id] });

    const response = await POST(
      mockPost("http://localhost/api/storefront/submit", {
        slug: "test-store",
        customer: {
          name: "Test",
          phone: "0555123456",
          wilaya: "Alger",
          commune: "B",
          address: "C",
        },
        items: [{ productId: otherProduct.id, quantity: 1 }],
      }),
    );
    expect(response.status).toBe(400);
    expect(await rawDb.businessCommand.count()).toBe(0);
  });

  it("reuses an existing customer for two distinct submissions", async () => {
    const product = await seedProduct();
    await seedStorefront({ productIds: [product.id] });

    for (const submissionId of [
      "20202020-2020-4020-8020-202020202020",
      "30303030-3030-4030-8030-303030303030",
    ]) {
      await POST(
        mockPost("http://localhost/api/storefront/submit", {
          slug: "test-store",
          submissionId,
          customer: {
            name: "Repeat Customer",
            phone: "0555123456",
            wilaya: "Alger",
            commune: "B",
            address: "C",
          },
          items: [{ productId: product.id, quantity: 1 }],
        }),
      );
    }

    expect(await rawDb.customer.count()).toBe(1);
    expect(await rawDb.order.count()).toBe(2);
  });

  it("rejects an oversell when active reservations consume the stock", async () => {
    const product = await seedProduct({ stock: 4 });
    await seedStorefront({ productIds: [product.id] });
    const commandId = "cmd_storefront_stock";
    await rawDb.businessCommand.create({
      data: {
        id: commandId,
        idempotencyKey: "storefront-stock-reservation",
        commandType: "test.reservation",
        aggregateType: "product",
        aggregateId: product.id,
        requestHash: "d".repeat(64),
        status: "committed",
        actor: "test",
        correlationId: "storefront-stock-reservation",
        expectedVersion: 0,
        committedVersion: 1,
      },
    });
    await rawDb.inventoryReservation.create({
      data: {
        id: "reservation_storefront_stock",
        reservationKey: "storefront-stock-hold",
        orderId: "order_storefront_hold",
        productId: product.id,
        quantity: 3,
        state: "active",
        createdByCommandId: commandId,
      },
    });

    const response = await POST(
      mockPost("http://localhost/api/storefront/submit", {
        slug: "test-store",
        submissionId: "40404040-4040-4040-8040-404040404040",
        customer: {
          name: "Oversell",
          phone: "0555123456",
          wilaya: "Alger",
          commune: "B",
          address: "C",
        },
        items: [{ productId: product.id, quantity: 2 }],
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "STOREFRONT_STOCK_UNAVAILABLE" });
    expect(await rawDb.order.count()).toBe(0);
  });

  it("still applies Turnstile and OTP gates when the client spoofs the desktop shell", async () => {
    const product = await seedProduct();
    const storefront = await seedStorefront({ slug: "otp-gate-store", productIds: [product.id] });
    await rawDb.storefrontGateConfig.create({
      data: { storefrontSlug: storefront.slug, otpEnabled: true },
    });
    try {
      const response = await POST(
        mockPost(
          "http://localhost/api/storefront/submit",
          {
            slug: storefront.slug,
            customer: {
              name: "Desktop Spoof",
              phone: "0555123456",
              wilaya: "Alger",
              commune: "B",
              address: "C",
            },
            items: [{ productId: product.id, quantity: 1 }],
          },
          {
            "x-sf-tauri": "1",
            "user-agent": "Mozilla/5.0 Tauri/2.0",
          },
        ),
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: "OTP_VERIFICATION_REQUIRED" });
      expect(await rawDb.order.count()).toBe(0);
    } finally {
      await rawDb.storefrontGateConfig.deleteMany({ where: { storefrontSlug: storefront.slug } });
    }
  });
});
