import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("rolls back by publishing a fresh immutable release and allocation", () => {
    const source = readFileSync(
      resolve(process.cwd(), "control-plane/storefront/rollback-release.ts"),
      "utf8",
    ).replace(/\r\n?/g, "\n");
    expect(source).toContain("sourceReleaseId");
    expect(source).toContain("INSERT INTO storefront_release");
    expect(source).toContain("appendConservedAllocationStatements");
    expect(source).toContain("parentReleaseId: expectedActiveReleaseId");
    expect(source).toContain("artifactDigest !== source.artifact_digest");
    expect(source).not.toMatch(/UPDATE\s+storefront\s+SET\s+active_release_id/);
  });

  it("atomically conserves allocation while replacing an active release", () => {
    const source = readFileSync(
      resolve(process.cwd(), "control-plane/storefront/release-allocation.ts"),
      "utf8",
    ).replace(/\r\n?/g, "\n");
    expect(source).toContain("MIN(?5, COALESCE");
    expect(source).toContain("receipt.state = 'received'");
    expect(source).toContain("SUM(line.quantity)");
    expect(source).toContain("SET remaining_quantity = 0");
    expect(source).toContain("WHERE release_id = ?1 AND remaining_quantity > 0");

    for (const path of ["publish-release.ts", "rollback-release.ts"]) {
      const publisher = readFileSync(
        resolve(process.cwd(), "control-plane/storefront", path),
        "utf8",
      );
      expect(publisher).toContain("appendConservedAllocationStatements");
    }
  });

  it("gates checkout on current entitlement and scopes receipt import to one shop", () => {
    const checkout = readFileSync(
      resolve(process.cwd(), "control-plane/storefront/checkout.ts"),
      "utf8",
    );
    const receipts = readFileSync(
      resolve(process.cwd(), "control-plane/storefront/receipts.ts"),
      "utf8",
    );
    const importer = readFileSync(
      resolve(process.cwd(), "src/lib/connected-platform/storefront-receipt-import.ts"),
      "utf8",
    );
    expect(checkout).toContain("authorizePublicCheckout");
    expect(receipts).toContain("s.shop_id = ?2");
    expect(importer).toContain("line.unitPriceDzd");
    expect(importer).toContain("shop.shopId");
    expect(readFileSync(
      resolve(process.cwd(), "src/lib/connected-platform/storefront-receipt-worker.ts"),
      "utf8",
    ))
      .toContain("${CURSOR_KEY_PREFIX}.${shopContext.shopId}");
  });

  it("publishes Studio releases through the hosted runtime and durably imports receipts", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/storefront/config/[id]/route.ts"),
      "utf8",
    );
    const worker = readFileSync(
      resolve(process.cwd(), "src/lib/connected-platform/storefront-receipt-worker.ts"),
      "utf8",
    );
    const instrumentation = readFileSync(resolve(process.cwd(), "src/instrumentation.ts"), "utf8");
    expect(route).toContain("publishHostedStorefront");
    expect(route).toContain("loadStorefrontRuntime");
    expect(worker).toContain("importHostedStorefrontReceipts");
    expect(worker).toContain("db.setting.upsert");
    expect(instrumentation).toContain("startStorefrontReceiptWorker");
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
