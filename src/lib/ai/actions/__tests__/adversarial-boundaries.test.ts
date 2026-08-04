import { describe, expect, it } from "vitest";

import { parseSensitiveAiToolArgs } from "../contracts";

describe("Task 5 adversarial argument boundaries", () => {
  it("rejects governed confirmation before proposal creation", () => {
    expect(() =>
      parseSensitiveAiToolArgs("update_order_status", {
        orderId: "order-1",
        status: "confirmed",
      }),
    ).toThrow();
  });

  it("normalizes valid Algerian phones and rejects invalid customer phones", () => {
    expect(
      parseSensitiveAiToolArgs("create_customer", {
        name: "Amina",
        phone: "+213 555 12 34 56",
      }),
    ).toMatchObject({ phone: "0555123456" });
    expect(() =>
      parseSensitiveAiToolArgs("create_customer", {
        name: "Amina",
        phone: "123",
      }),
    ).toThrow();
  });

  it("rejects blank canonical order location fields", () => {
    expect(() =>
      parseSensitiveAiToolArgs("create_order", {
        customerId: "customer-1",
        items: [{ productId: "product-1", quantity: 1 }],
        wilaya: "Alger",
        commune: "",
        address: "",
        phone: "0555123456",
      }),
    ).toThrow();
  });
});
