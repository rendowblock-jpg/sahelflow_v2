import { describe, expect, it } from "vitest";
import { encryptStorefrontCustomer } from "../storefront/hosted-checkout-crypto";
import { generateConnectedKeyPair } from "./payload-crypto";
import type { StorefrontReceipt } from "./client";
import { decryptStorefrontReceiptCustomer } from "./storefront-receipt-import";

const binding = {
  storefrontId: "storefront_12345678",
  releaseId: "release_12345678",
  idempotencyKey: "checkout_12345678",
  wilayaCode: "16",
  deliveryMode: "home" as const,
};

async function receipt(
  options: { deliveryMode?: "home" | "desk"; address?: string } = {},
): Promise<{ receipt: StorefrontReceipt; privateKey: string }> {
  const keys = generateConnectedKeyPair();
  const bound = { ...binding, deliveryMode: options.deliveryMode ?? binding.deliveryMode };
  const encrypted = await encryptStorefrontCustomer(
    {
      name: "Amina",
      phone: "0555123456",
      wilayaCode: "16",
      commune: "Alger Centre",
      address: options.address ?? "1 Didouche Mourad",
      notes: null,
    },
    keys.encryptionPublicKeyJwk,
    bound,
  );
  return {
    privateKey: keys.encryptionPrivateKeyPkcs8,
    receipt: {
      relaySequence: 1,
      receiptId: "receipt_12345678",
      storefrontId: binding.storefrontId,
      storefrontSlug: "sahel-store",
      shopId: "shop_12345678",
      releaseId: binding.releaseId,
      idempotencyKey: binding.idempotencyKey,
      requestDigest: "b".repeat(64),
      ...encrypted,
      wilayaCode: binding.wilayaCode,
      deliveryMode: bound.deliveryMode,
      subtotalDzd: 2_500,
      shippingDzd: 500,
      totalDzd: 3_000,
      createdAt: "2026-08-13T12:00:00.000Z",
      lines: [{ itemKey: "product_12345678:base", quantity: 1, unitPriceDzd: 2_500 }],
    },
  };
}

describe("hosted storefront receipt cryptography", () => {
  it("decrypts customer PII only with the enrolled desktop key and exact checkout binding", async () => {
    const value = await receipt();
    expect(decryptStorefrontReceiptCustomer(value.receipt, value.privateKey)).toEqual({
      name: "Amina",
      phone: "0555123456",
      wilayaCode: "16",
      commune: "Alger Centre",
      address: "1 Didouche Mourad",
      notes: null,
    });
  });

  describe("stop-desk receipts (STORE-DESK-ADDRESS)", () => {
    it("gives a desk receipt with no address the fixed stop-desk text", async () => {
      for (const address of ["", "   "]) {
        const value = await receipt({ deliveryMode: "desk", address });
        expect(decryptStorefrontReceiptCustomer(value.receipt, value.privateKey).address).toBe("Stop desk");
      }
    });

    it("keeps an address a desk buyer did type", async () => {
      const value = await receipt({ deliveryMode: "desk", address: "Bureau Yalidine Kouba" });
      expect(decryptStorefrontReceiptCustomer(value.receipt, value.privateKey).address).toBe("Bureau Yalidine Kouba");
    });

    it("still refuses a home receipt with no address", async () => {
      for (const address of ["", "   "]) {
        const value = await receipt({ deliveryMode: "home", address });
        expect(() => decryptStorefrontReceiptCustomer(value.receipt, value.privateKey)).toThrow(/address/i);
      }
    });

    it("cannot be turned into a desk receipt afterwards to excuse a missing address", async () => {
      const value = await receipt({ deliveryMode: "home", address: "" });
      expect(() =>
        decryptStorefrontReceiptCustomer({ ...value.receipt, deliveryMode: "desk" }, value.privateKey),
      ).toThrow(/binding/i);
    });
  });

  it("fails closed when hosted receipt metadata is changed", async () => {
    const value = await receipt();
    expect(() => decryptStorefrontReceiptCustomer(
      { ...value.receipt, releaseId: "release_87654321" },
      value.privateKey,
    )).toThrow(/binding/i);
  });
});
