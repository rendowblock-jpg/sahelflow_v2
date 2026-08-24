import { describe, expect, it } from "vitest";

import { serializeToolResultForRemoteModel } from "../redact";

const PRIVATE_NAME = "Karim Benali";
const PRIVATE_PHONE = "0555 12 34 56";
const PRIVATE_STREET = "12 Rue Didouche Mourad";

describe("remote tool-result final privacy boundary", () => {
  it("projects get_customer_orders with canonical locations and fail-closed references", () => {
    const maliciousWilaya = `${PRIVATE_NAME} ${PRIVATE_PHONE} ${PRIVATE_STREET}`;
    const output = serializeToolResultForRemoteModel("get_customer_orders", [
      {
        orderNumber: "ORD-4411",
        status: "DELIVERED",
        totalPrice: 14500,
        wilaya: maliciousWilaya,
        createdAt: "2026-08-24T18:30:00.000Z",
        unexpectedCustomerName: PRIVATE_NAME,
      },
      {
        orderNumber: PRIVATE_PHONE,
        status: PRIVATE_NAME,
        totalPrice: 9000,
        wilaya: "Alger",
        createdAt: "2026-08-24T18:31:00.000Z",
      },
      {
        orderNumber: "ORD-4412",
        status: "REFUSED",
        totalPrice: 10000,
        wilaya: "Setif",
        createdAt: "2026-08-24T18:32:00.000Z",
      },
      {
        orderNumber: "CMD-0555123456",
        status: "confirmed",
        totalPrice: 8000,
        wilaya: "Oran",
        createdAt: "2026-08-24T18:33:00.000Z",
      },
      {
        orderNumber: "ORD-4413",
        status: "confirmed",
        totalPrice: 7500,
        wilaya: "Bordj Baji Mokhtar",
        createdAt: "2026-08-24T18:34:00.000Z",
      },
    ]) as Array<Record<string, unknown>>;

    expect(output[0]).toEqual({
      orderNumber: "ORD-4411",
      status: "delivered",
      totalPrice: 14500,
      wilaya: null,
      wilayaWithheld: true,
      createdAt: "2026-08-24T18:30:00.000Z",
    });
    expect(output[1]?.orderNumber).toBeNull();
    expect(output[1]?.status).toBeNull();
    expect(output[1]?.wilaya).toBe("Alger");
    expect(output[1]?.wilayaWithheld).toBe(false);
    expect(output[2]).toMatchObject({
      orderNumber: "ORD-4412",
      status: "refused",
      wilaya: "Sétif",
      wilayaWithheld: false,
    });
    expect(output[3]?.orderNumber).toBeNull();
    expect(output[3]?.wilaya).toBe("Oran");
    expect(output[4]?.wilaya).toBe("Bordj Baji Mokhtar");

    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain(PRIVATE_NAME);
    expect(serialized).not.toContain(PRIVATE_PHONE);
    expect(serialized).not.toContain(PRIVATE_STREET);
    expect(serialized).not.toContain(maliciousWilaya);
    expect(serialized).not.toContain("CMD-0555123456");
  });

  it("uses canonical commune authority and validates commune/wilaya consistency", () => {
    const orderDetails = serializeToolResultForRemoteModel("get_order_details", {
      orderNumber: "ORD-5101",
      status: "confirmed",
      wilaya: "Alger",
      commune: "Alger Centre",
    }) as Record<string, unknown>;
    const customerDetails = serializeToolResultForRemoteModel(
      "get_customer_details",
      {
        id: "customer-1",
        name: "Karim",
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        orders: [],
      },
    ) as Record<string, unknown>;
    const mismatch = serializeToolResultForRemoteModel("get_order_details", {
      orderNumber: "ORD-5102",
      status: "confirmed",
      wilaya: "Oran",
      commune: "Bab Ezzouar",
    }) as Record<string, unknown>;

    expect(orderDetails.wilaya).toBe("Alger");
    expect(orderDetails.commune).toBe("Alger Centre");
    expect(customerDetails.wilaya).toBe("Alger");
    expect(customerDetails.commune).toBe("Bab Ezzouar");
    expect(mismatch.wilaya).toBe("Oran");
    expect(mismatch.commune).toBeNull();
  });

  it("fails closed when one commune label resolves to multiple commune identities", () => {
    const ambiguousAlias = serializeToolResultForRemoteModel("get_order_details", {
      orderNumber: "ORD-5201",
      status: "confirmed",
      wilaya: "Tiaret",
      commune: "ملاكو",
    }) as Record<string, unknown>;
    const aliasWithoutWilaya = serializeToolResultForRemoteModel(
      "get_customer_details",
      {
        id: "customer-ambiguous-commune",
        name: "Karim",
        commune: "ملاكو",
        orders: [],
      },
    ) as Record<string, unknown>;
    const duplicateFrenchName = serializeToolResultForRemoteModel(
      "get_order_details",
      {
        orderNumber: "ORD-5202",
        status: "confirmed",
        wilaya: "Tébessa",
        commune: "El Ogla",
      },
    ) as Record<string, unknown>;

    expect(ambiguousAlias.wilaya).toBe("Tiaret");
    expect(ambiguousAlias.commune).toBeNull();
    expect(aliasWithoutWilaya.commune).toBeNull();
    expect(duplicateFrenchName.wilaya).toBe("Tébessa");
    expect(duplicateFrenchName.commune).toBeNull();
  });

  it("canonicalizes or withholds location fields across customer-linked reads", () => {
    const maliciousLocation = `${PRIVATE_NAME}, ${PRIVATE_STREET}`;
    const orderDetails = serializeToolResultForRemoteModel("get_order_details", {
      orderNumber: "ORD-5001",
      status: "confirmed",
      wilaya: maliciousLocation,
      commune: maliciousLocation,
    }) as Record<string, unknown>;
    const recentOrders = serializeToolResultForRemoteModel("list_recent_orders", [
      { orderNumber: "ORD-5002", wilaya: maliciousLocation },
      { orderNumber: "ORD-5003", wilaya: "Bejaia" },
    ]) as Array<Record<string, unknown>>;
    const searchOrders = serializeToolResultForRemoteModel("search_orders", [
      { orderNumber: "ORD-5004", wilaya: maliciousLocation },
    ]) as Array<Record<string, unknown>>;
    const deliveries = serializeToolResultForRemoteModel(
      "get_pending_deliveries",
      [{ id: "delivery-1", wilaya: maliciousLocation }],
    ) as Array<Record<string, unknown>>;

    expect(orderDetails.wilaya).toBeNull();
    expect(orderDetails.commune).toBeNull();
    expect(recentOrders[0]?.wilaya).toBeNull();
    expect(recentOrders[1]?.wilaya).toBe("Béjaïa");
    expect(searchOrders[0]?.wilaya).toBeNull();
    expect(deliveries[0]?.wilaya).toBeNull();

    const serialized = JSON.stringify({
      orderDetails,
      recentOrders,
      searchOrders,
      deliveries,
    });
    expect(serialized).not.toContain(PRIVATE_NAME);
    expect(serialized).not.toContain(PRIVATE_STREET);
    expect(serialized).not.toContain(maliciousLocation);
  });

  it("collapses nested generic-tool errors before recursive serialization", () => {
    const privateError =
      `Provider failed for ${PRIVATE_NAME} at ${PRIVATE_PHONE} near ${PRIVATE_STREET}`;
    const output = serializeToolResultForRemoteModel(
      "get_delivery_cost_comparison",
      [
        {
          provider: "yalidine",
          price: 900,
          details: {
            success: false,
            error: privateError,
          },
        },
        {
          provider: "maystro",
          error: privateError,
        },
      ],
    ) as Array<Record<string, unknown>>;

    expect((output[0]?.details as Record<string, unknown>)?.error).toBe(
      "Tool failed",
    );
    expect(output[1]?.error).toBe("Tool failed");

    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain(PRIVATE_NAME);
    expect(serialized).not.toContain(PRIVATE_PHONE);
    expect(serialized).not.toContain(PRIVATE_STREET);
    expect(serialized).not.toContain(privateError);
  });
});
