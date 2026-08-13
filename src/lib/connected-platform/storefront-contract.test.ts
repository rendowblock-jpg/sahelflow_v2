import { describe, expect, it } from "vitest";
import { parseCheckoutInput } from "../../../control-plane/storefront/checkout-input";
import { parseReleaseInput } from "../../../control-plane/storefront/release-input";
import { createDefaultStorefrontTheme } from "../storefront/theme-default";
import {
  createStorefrontReleaseInput,
  parseStorefrontReleaseItemKey,
} from "../storefront/release-artifact";

function releaseInput() {
  const theme = createDefaultStorefrontTheme("sahara");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  return createStorefrontReleaseInput({
    workspaceId: "0123456789abcdef0123456789abcdef",
    releaseId: "release_12345678",
    parentReleaseId: null,
    locale: "ar",
    draft: {
      name: "Sahel store",
      slug: "sahel-store",
      description: "",
      theme,
      selectedProductIds: ["product_12345678"],
      isActive: true,
    },
    products: [{
      id: "product_12345678",
      name: "Product",
      sku: "SKU-1",
      images: null,
      price: 2_500,
      stock: 10,
      productVariants: [],
    }],
  });
}

function encryptedCustomer(): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    iv: "AAAAAAAAAAAAAAAA",
    ciphertext: "AAAAAAAAAAAAAAAAAAAAAAAA",
    aadDigest: "a".repeat(64),
  }), "utf8").toString("base64");
}

describe("hosted storefront contract", () => {
  it("accepts a V2 release only when catalog and delegated allocation match", () => {
    const parsed = parseReleaseInput(releaseInput());
    expect(parsed?.allocations[0]).toEqual({
      itemKey: "product_12345678:base",
      unitPriceDzd: 2_500,
      quantity: 10,
    });
    expect(parsed?.publicArtifact.schemaVersion).toBe(2);
    expect(parsed?.publicArtifact.theme.builder).not.toHaveProperty("domain");
    expect(parsed?.publicArtifact.theme.builder).not.toHaveProperty("shippingRules");
  });

  it("rejects release artifacts whose visible catalog exceeds delegated allocation", () => {
    const input = releaseInput();
    input.allocations = [];
    expect(parseReleaseInput(input)).toBeNull();
  });

  it("maps hosted item keys back to canonical product and variant authority", () => {
    expect(parseStorefrontReleaseItemKey("product_12345678:base")).toEqual({
      productId: "product_12345678",
      variantId: null,
    });
    expect(parseStorefrontReleaseItemKey("product_12345678:variant_12345678")).toEqual({
      productId: "product_12345678",
      variantId: "variant_12345678",
    });
    expect(parseStorefrontReleaseItemKey("invalid")).toBeNull();
  });

  it("strips customer-supplied pricing from checkout input", () => {
    const parsed = parseCheckoutInput({
      idempotencyKey: "checkout_12345678",
      encryptedCustomer: encryptedCustomer(),
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
      encryptedCustomer: encryptedCustomer(),
      wrappedCustomerKey: "B".repeat(32),
      wilayaCode: "16",
      deliveryMode: "home",
      items: [{ itemKey: "sku:a", quantity: 1 }, { itemKey: "sku:a", quantity: 1 }],
    })).toBeNull();
  });
});
