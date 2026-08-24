import { describe, expect, it } from "vitest";

import { serializeToolResultForRemoteModel } from "../redact";

const PRIVATE_NAME = "Karim Benali";
const PRIVATE_PHONE = "0555 12 34 56";
const PRIVATE_STREET = "12 Rue Didouche Mourad";

describe("remote tool-result final privacy boundary", () => {
  it("projects get_customer_orders explicitly and withholds untrusted wilaya text", () => {
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
    expect(output[1]?.wilaya).toBeNull();
    expect(output[1]?.wilayaWithheld).toBe(true);

    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain(PRIVATE_NAME);
    expect(serialized).not.toContain(PRIVATE_PHONE);
    expect(serialized).not.toContain(PRIVATE_STREET);
    expect(serialized).not.toContain(maliciousWilaya);
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
