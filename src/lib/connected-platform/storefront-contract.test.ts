import { describe, expect, it } from "vitest";
import { parseCheckoutInput } from "../../../control-plane/storefront/checkout-input";
import { parseReleaseInput } from "../../../control-plane/storefront/release-input";

describe("hosted storefront contract", () => {
  it("accepts a release only when catalog and delegated allocation match", () => {
    const parsed = parseReleaseInput({
      workspaceId: "0123456789abcdef0123456789abcdef",
      releaseId: "release_12345678",
      parentReleaseId: null,
      templateId: "sahara",
      locale: "ar",
      publicArtifact: {
        storeName: "متجر الساحل",
        products: [{ itemKey: "sku:blue", name: "منتج" }],
      },
      allocations: [{ itemKey: "sku:blue", unitPriceDzd: 2500, quantity: 10 }],
      shippingRules: [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }],
    });
    expect(parsed?.allocations[0]).toEqual({ itemKey: "sku:blue", unitPriceDzd: 2500, quantity: 10 });
  });

  it("rejects release artifacts whose visible catalog exceeds delegated allocation", () => {
    expect(parseReleaseInput({
      workspaceId: "0123456789abcdef0123456789abcdef",
      releaseId: "release_12345678",
      parentReleaseId: null,
      templateId: "atlas",
      locale: "fr",
      publicArtifact: {
        storeName: "Sahel",
        products: [{ itemKey: "sku:a", name: "A" }, { itemKey: "sku:b", name: "B" }],
      },
      allocations: [{ itemKey: "sku:a", unitPriceDzd: 1000, quantity: 2 }],
      shippingRules: [{ wilayaCode: "16", deliveryMode: "desk", feeDzd: 300 }],
    })).toBeNull();
  });

  it("strips customer-supplied pricing from checkout input", () => {
    const parsed = parseCheckoutInput({
      idempotencyKey: "checkout_12345678",
      encryptedCustomer: "A".repeat(32),
      wrappedCustomerKey: "B".repeat(32),
      wilayaCode: "16",
      deliveryMode: "home",
      items: [{ itemKey: "sku:a", quantity: 2, unitPriceDzd: 1 }],
      totalDzd: 1,
    });
    expect(parsed?.items).toEqual([{ itemKey: "sku:a", quantity: 2 }]);
    expect(parsed && "totalDzd" in parsed).toBe(false);
  });

  it("rejects duplicate items and malformed ciphertext", () => {
    expect(parseCheckoutInput({
      idempotencyKey: "checkout_12345678",
      encryptedCustomer: "not base64!",
      wrappedCustomerKey: "B".repeat(32),
      wilayaCode: "16",
      deliveryMode: "home",
      items: [{ itemKey: "sku:a", quantity: 1 }],
    })).toBeNull();
    expect(parseCheckoutInput({
      idempotencyKey: "checkout_12345678",
      encryptedCustomer: "A".repeat(32),
      wrappedCustomerKey: "B".repeat(32),
      wilayaCode: "16",
      deliveryMode: "home",
      items: [{ itemKey: "sku:a", quantity: 1 }, { itemKey: "sku:a", quantity: 1 }],
    })).toBeNull();
  });
});
