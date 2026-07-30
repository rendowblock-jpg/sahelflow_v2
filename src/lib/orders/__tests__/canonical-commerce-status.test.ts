import { describe, expect, it } from "vitest";

import { commerceOrderIsCancelled } from "@/lib/orders/canonical-commerce-order";
import type { NormalizedOrder } from "@/lib/integrations/ecommerce/types";

function providerOrder(
  source: NormalizedOrder["source"],
  sourceMetadata: Record<string, unknown>,
): NormalizedOrder {
  return {
    sourceOrderId: `${source}-1`,
    orderNumber: "#1",
    customerName: "Customer",
    customerPhone: "0555123456",
    wilaya: "Alger",
    commune: "Alger Centre",
    address: "1 Provider Street",
    items: [{ productName: "Product", quantity: 1, unitPrice: 1000 }],
    totalPrice: 1000,
    source,
    sourceMetadata,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

describe("commerce provider cancellation classification", () => {
  it("recognizes Shopify cancellation and voided payment states", () => {
    expect(
      commerceOrderIsCancelled(
        providerOrder("shopify", {
          cancelReason: "customer",
          financialStatus: "pending",
        }),
      ),
    ).toBe(true);
    expect(
      commerceOrderIsCancelled(
        providerOrder("shopify", {
          cancelReason: null,
          financialStatus: "voided",
        }),
      ),
    ).toBe(true);
    expect(
      commerceOrderIsCancelled(
        providerOrder("shopify", {
          cancelReason: null,
          financialStatus: "pending",
        }),
      ),
    ).toBe(false);
  });

  it("recognizes WooCommerce and YouCan cancellation states", () => {
    expect(
      commerceOrderIsCancelled(
        providerOrder("woocommerce", { wooStatus: "cancelled" }),
      ),
    ).toBe(true);
    expect(
      commerceOrderIsCancelled(
        providerOrder("woocommerce", { wooStatus: "processing" }),
      ),
    ).toBe(false);
    expect(
      commerceOrderIsCancelled(
        providerOrder("youcan", { statusNew: "canceled" }),
      ),
    ).toBe(true);
    expect(
      commerceOrderIsCancelled(
        providerOrder("youcan", { statusNew: "new" }),
      ),
    ).toBe(false);
  });
});
