/**
 * Every approvable action stores the arguments a person approves in its
 * proposal summary, exactly as the executor will use them, and the model-facing
 * serializer still lets none of the customer text through.
 */
import { describe, expect, it } from "vitest";

import { serializeToolResultForRemoteModel } from "@/lib/ai/redact";
import { buildAiActionTargetSnapshot } from "../targets";

const now = new Date("2026-11-01T10:00:00.000Z");

function context() {
  const product = {
    id: "p1",
    name: "Thé vert",
    stock: 7,
    price: 1500,
    updatedAt: now,
    productVariants: [{ id: "v1", name: "Boîte 100g", stock: 7, price: 1500, isActive: true, updatedAt: now }],
  };
  return {
    prisma: {
      order: {
        findFirst: async () => ({ id: "o1", orderNumber: "ORD-1001", status: "pending", version: 3, updatedAt: now }),
      },
      product: {
        findFirst: async (query: { where: { sku?: string } }) => (query.where.sku ? null : product),
      },
      category: { findUnique: async () => ({ id: "cat1", name: "Boissons", updatedAt: now }) },
      customer: {
        findFirst: async (query: { where: { phone?: string } }) =>
          query.where.phone ? null : { id: "c1", name: "Karim Benali", updatedAt: now },
      },
    },
  } as never;
}

async function summaryOf(tool: string, args: Record<string, unknown>) {
  return (await buildAiActionTargetSnapshot(context(), tool, args)).summary;
}

describe("exact arguments in the stored proposal summary", () => {
  it("cancel_order carries the reason text, or an explicit null", async () => {
    const withReason = await summaryOf("cancel_order", { orderNumber: "ORD-1001", reason: "Client injoignable" });
    expect(withReason).toMatchObject({ orderNumber: "ORD-1001", toStatus: "cancelled", reason: "Client injoignable" });
    const without = await summaryOf("cancel_order", { orderNumber: "ORD-1001" });
    expect("reason" in without).toBe(true);
    expect(without.reason).toBeNull();
  });

  it("update_product_stock carries the reason text and names the variant it also changes", async () => {
    const summary = await summaryOf("update_product_stock", { productId: "p1", newStock: 12, reason: "Inventaire du 1er nov." });
    expect(summary).toMatchObject({ productName: "Thé vert", variantName: "Boîte 100g", fromStock: 7, toStock: 12, reason: "Inventaire du 1er nov." });
  });

  it("create_product carries the cost, or an explicit null", async () => {
    const args = { name: "Miel", price: 2500, sku: "SKU-1", stock: 4, categoryId: "cat1" };
    expect(await summaryOf("create_product", { ...args, cost: 1800 })).toMatchObject({
      productName: "Miel", price: 2500, stock: 4, sku: "SKU-1", categoryName: "Boissons", cost: 1800,
    });
    const without = await summaryOf("create_product", args);
    expect("cost" in without).toBe(true);
    expect(without.cost).toBeNull();
  });

  it("create_customer carries every argument, the whole phone included", async () => {
    const summary = await summaryOf("create_customer", {
      name: "Amine", phone: "0550123456", phone2: "0661000000", wilaya: "Oran", commune: "Es Senia", address: "3 rue des Lilas", notes: "Client fidèle",
    });
    expect(summary).toMatchObject({
      customerName: "Amine", phone: "0550123456", phone2: "0661000000", wilaya: "Oran", commune: "Es Senia", address: "3 rue des Lilas", notes: "Client fidèle", phoneLast4: "3456",
    });
  });

  it("update_customer_notes carries the note text and the mode", async () => {
    const summary = await summaryOf("update_customer_notes", { customerId: "c1", notes: "Préfère être appelé après 17h", mode: "replace" });
    expect(summary).toMatchObject({ customerName: "Karim Benali", mode: "replace", notes: "Préfère être appelé après 17h", noteLength: 29 });
  });

  it("update_order_status and update_product_price add nothing beyond what they change", async () => {
    expect(await summaryOf("update_order_status", { orderId: "o1", status: "shipped" })).toEqual({
      orderNumber: "ORD-1001", fromStatus: "pending", toStatus: "shipped",
    });
    expect(await summaryOf("update_product_price", { productId: "p1", newPrice: 1800 })).toEqual({
      productName: "Thé vert", fromPrice: 1500, toPrice: 1800, variantName: "Boîte 100g",
    });
  });

  it("the model-facing view of a customer proposal still leaves out the phone, the address and the note text", async () => {
    const summary = await summaryOf("create_customer", {
      name: "Amine", phone: "0550123456", address: "3 rue des Lilas", notes: "Client fidèle",
    });
    const notes = await summaryOf("update_customer_notes", { customerId: "c1", notes: "Préfère être appelé après 17h", mode: "append" });
    for (const [tool, data] of [["create_customer", summary], ["update_customer_notes", notes]] as const) {
      const seen = JSON.stringify(
        serializeToolResultForRemoteModel(tool, {
          pending_action_proposal: true,
          proposal: { id: "x", status: "pending", proposalDigestPrefix: "abcdef123456", summary: data, expiresAt: now.toISOString(), createdAt: now.toISOString() },
        }),
      );
      expect(seen).not.toContain("0550123456");
      expect(seen).not.toContain("3 rue des Lilas");
      expect(seen).not.toContain("Client fidèle");
      expect(seen).not.toContain("Préfère");
    }
  });
});
