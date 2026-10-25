import { describe, expect, it } from "vitest";

import {
  projectApprovalDetails,
  type ApprovalDetail,
  type ApprovalDetailLine,
} from "../approval-details";

function find(details: ApprovalDetail[], key: string): ApprovalDetail | undefined {
  return details.find((detail) => detail.key === key);
}

function lines(details: ApprovalDetail[]): ApprovalDetailLine[] {
  const value = find(details, "lines")?.value;
  return Array.isArray(value) ? value : [];
}

const ORDER_ARGS = {
  customerId: "cust_1",
  items: [
    { productId: "p1", productVariantId: "v1", quantity: 2 },
    { productId: "p2", quantity: 1 },
  ],
  wilaya: "Oran",
  commune: "Es Senia",
  address: "12 rue des Oliviers, bloc B",
  phone: "0551234567",
  notes: "Appeler avant de livrer",
};
const ORDER_SUMMARY = {
  customerName: "Amina B.",
  itemCount: 2,
  totalQuantity: 3,
  wilaya: "Oran",
  lines: [
    { productName: "Sneakers", variantName: "42 / noir", quantity: 2 },
    { productName: "Casquette", variantName: null, quantity: 1 },
  ],
};

describe("projectApprovalDetails", () => {
  it("create_order shows address, commune, phone, notes and each line with name and quantity", () => {
    const details = projectApprovalDetails("create_order", ORDER_ARGS, ORDER_SUMMARY);

    expect(find(details, "address")).toMatchObject({
      kind: "longText",
      value: "12 rue des Oliviers, bloc B",
    });
    expect(find(details, "commune")?.value).toBe("Es Senia");
    expect(find(details, "phone")).toMatchObject({ kind: "phone", value: "0551234567" });
    expect(find(details, "notes")?.value).toBe("Appeler avant de livrer");
    expect(find(details, "customer")?.value).toBe("Amina B.");
    expect(lines(details)).toEqual([
      { productName: "Sneakers", variantName: "42 / noir", quantity: 2 },
      { productName: "Casquette", variantName: null, quantity: 1 },
    ]);
  });

  it("cancel_order shows the reason text, not \"reason: yes\"", () => {
    const details = projectApprovalDetails(
      "cancel_order",
      { orderNumber: "SF-10428", reason: "Client injoignable depuis 3 jours" },
      { orderNumber: "SF-10428", fromStatus: "pending", toStatus: "cancelled", reasonProvided: true },
    );

    expect(find(details, "reason")).toMatchObject({
      kind: "longText",
      value: "Client injoignable depuis 3 jours",
    });
    expect(JSON.stringify(details)).not.toContain("reasonProvided");
    expect(find(details, "order")?.value).toBe("SF-10428");
  });

  it("update_product_stock shows old and new stock and the reason", () => {
    const details = projectApprovalDetails(
      "update_product_stock",
      { productId: "p1", newStock: 7, reason: "Inventaire du 25" },
      { productName: "Sneakers", fromStock: 12, toStock: 7, variantName: null, reasonProvided: true },
    );

    expect(find(details, "fromStock")).toMatchObject({ kind: "quantity", value: 12 });
    expect(find(details, "toStock")).toMatchObject({ kind: "quantity", value: 7 });
    expect(find(details, "reason")?.value).toBe("Inventaire du 25");
    expect(find(details, "product")?.value).toBe("Sneakers");
  });

  it("create_customer shows the full phone and address", () => {
    const details = projectApprovalDetails(
      "create_customer",
      {
        name: "Karim D.",
        phone: "0661234567",
        phone2: "0771234567",
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "Cité 5 Juillet, n° 40",
      },
      { customerName: "Karim D.", phoneLast4: "4567", wilaya: "Alger" },
    );

    expect(find(details, "phone")).toMatchObject({ kind: "phone", value: "0661234567" });
    expect(find(details, "phone2")).toMatchObject({ kind: "phone", value: "0771234567" });
    expect(find(details, "address")?.value).toBe("Cité 5 Juillet, n° 40");
    expect(find(details, "phoneLast4")).toBeUndefined();
  });

  it("update_customer_notes shows the note and the mode", () => {
    const details = projectApprovalDetails(
      "update_customer_notes",
      { customerId: "c1", notes: "Préfère la livraison le soir", mode: "replace" },
      { customerName: "Amina B.", mode: "replace", noteLength: 28 },
    );

    expect(find(details, "notes")).toMatchObject({
      kind: "longText",
      value: "Préfère la livraison le soir",
    });
    expect(find(details, "mode")?.value).toBe("replace");
    expect(find(details, "customer")?.value).toBe("Amina B.");
  });

  it("update_product_price and update_order_status show old and new", () => {
    const price = projectApprovalDetails(
      "update_product_price",
      { productId: "p1", newPrice: 3900 },
      { productName: "Sneakers", fromPrice: 4200, toPrice: 3900, variantName: "42" },
    );
    expect(find(price, "fromPrice")).toMatchObject({ kind: "money", value: 4200 });
    expect(find(price, "toPrice")).toMatchObject({ kind: "money", value: 3900 });
    expect(find(price, "variant")?.value).toBe("42");

    const status = projectApprovalDetails(
      "update_order_status",
      { orderId: "o1", status: "shipped" },
      { orderNumber: "SF-10428", fromStatus: "pending", toStatus: "shipped" },
    );
    expect(find(status, "fromStatus")?.value).toBe("pending");
    expect(find(status, "toStatus")?.value).toBe("shipped");
  });

  it("create_product keeps sku and category that the old label filter dropped", () => {
    const details = projectApprovalDetails(
      "create_product",
      { name: "Sac", price: 2500, stock: 4, sku: "SAC-01", categoryId: "cat1", cost: 1500 },
      { productName: "Sac", price: 2500, stock: 4, sku: "SAC-01", categoryName: "Bagages" },
    );

    expect(find(details, "sku")?.value).toBe("SAC-01");
    expect(find(details, "category")?.value).toBe("Bagages");
    expect(find(details, "price")).toMatchObject({ kind: "money", value: 2500 });
    expect(find(details, "cost")).toMatchObject({ kind: "money", value: 1500 });
  });

  it("an arg key not on the allowlist is never projected, and an unknown tool shows nothing", () => {
    const details = projectApprovalDetails(
      "create_order",
      { ...ORDER_ARGS, internalToken: "tok_SECRET_123", cost: 999 },
      { ...ORDER_SUMMARY, apiKey: "sk_SECRET_456" },
    );
    const text = JSON.stringify(details);
    expect(text).not.toContain("SECRET");
    expect(find(details, "internalToken")).toBeUndefined();
    expect(find(details, "cost")).toBeUndefined();
    expect(find(details, "customerId")).toBeUndefined();

    expect(projectApprovalDetails("get_stats", { a: "b" }, { c: "d" })).toEqual([]);
    expect(projectApprovalDetails("assign_order_to_delivery", { a: "b" }, {})).toEqual([]);
  });

  it("changing any arg changes the projected details", () => {
    const base = JSON.stringify(
      projectApprovalDetails("create_order", ORDER_ARGS, ORDER_SUMMARY),
    );
    const changes: Array<Record<string, unknown>> = [
      { wilaya: "Alger" },
      { commune: "Kouba" },
      { address: "13 rue des Oliviers, bloc B" },
      { phone: "0551234568" },
      { notes: "Ne pas appeler" },
      { items: [{ productId: "p1", productVariantId: "v1", quantity: 3 }, { productId: "p2", quantity: 1 }] },
    ];
    for (const change of changes) {
      const changed = JSON.stringify(
        projectApprovalDetails("create_order", { ...ORDER_ARGS, ...change }, ORDER_SUMMARY),
      );
      expect(changed, JSON.stringify(change)).not.toBe(base);
    }
  });

  it("a proposal made before this release shows line names as not available and does not crash", () => {
    const { lines: _lines, ...oldSummary } = ORDER_SUMMARY;
    const details = projectApprovalDetails("create_order", ORDER_ARGS, oldSummary);

    expect(lines(details)).toEqual([
      { productName: null, variantName: null, quantity: 2 },
      { productName: null, variantName: null, quantity: 1 },
    ]);
    expect(find(details, "phone")?.value).toBe("0551234567");
  });

  it("a summary line whose quantity disagrees with the sealed args is not trusted for names", () => {
    const drifted = {
      ...ORDER_SUMMARY,
      lines: [
        { productName: "Sneakers", variantName: "42 / noir", quantity: 9 },
        { productName: "Casquette", variantName: null, quantity: 1 },
      ],
    };
    const result = lines(projectApprovalDetails("create_order", ORDER_ARGS, drifted));
    expect(result[0]).toEqual({ productName: null, variantName: null, quantity: 2 });
    expect(result[1]).toEqual({ productName: "Casquette", variantName: null, quantity: 1 });
  });
});
