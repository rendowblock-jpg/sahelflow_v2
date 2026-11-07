import { describe, expect, it } from "vitest";

import { canonicalCustomerReturnRequestSchema } from "@/lib/orders/canonical-customer-return";
import { canonicalImportRowSchema } from "@/lib/orders/canonical-file-import";
import { canonicalSourceOrderSchema } from "@/lib/orders/canonical-source-order";
import { trustedManualOrderSchema } from "@/lib/orders/manual-order";
import { manualOrderEditSchema } from "@/lib/orders/manual-order-edit";
import { manualOrderLinesEditSchema } from "@/lib/orders/manual-order-lines-edit";
import {
  MAX_MONEY_DZD,
  assertDiscountWithinItems,
  assertOrderTotalWithinLimit,
} from "@/lib/orders/money-limits";

const OVER = 1_000_000_000;

const manualOrder = {
  idempotencyKey: "manual-key-0001",
  newCustomer: { name: "Amine", phone: "0555123456", wilaya: "Alger" },
  items: [{ productId: "p1", quantity: 1 }],
  wilaya: "Alger",
  commune: "Centre",
  address: "1 rue A",
  phone: "0555123456",
};

const sourceOrder = {
  ...manualOrder,
  source: "whatsapp",
  sourceIdentity: "213555123456@s.whatsapp.net",
  sourceOrderId: "WA-1",
  items: [{ productId: "p1", quantity: 1, unitPrice: 1000 }],
};

const importRow = {
  customerName: "Amine",
  phone: "0555123456",
  wilaya: "Alger",
  productSku: "SKU-1",
  quantity: 1,
  unitPrice: 1000,
  deliveryCost: 600,
};

const returnRequest = {
  orderId: "o1",
  expectedVersion: 1,
  caseType: "return",
  reasonCode: "customer_changed_mind",
  items: [{ orderItemId: "i1", quantity: 1, disposition: "available" }],
  idempotencyKey: "return-key-0001",
};

describe("MAX_MONEY_DZD", () => {
  it("is one dinar below one billion", () => {
    expect(MAX_MONEY_DZD).toBe(999_999_999);
  });
});

describe("assertDiscountWithinItems", () => {
  it("accepts a discount equal to the items, and 0", () => {
    expect(() => assertDiscountWithinItems(9000, 9000, "discount")).not.toThrow();
    expect(() => assertDiscountWithinItems(0, 0, "discount")).not.toThrow();
  });

  it("refuses one dinar more than the items with a coded 400 on the named field", () => {
    expect(() => assertDiscountWithinItems(9001, 9000, "discount")).toThrow(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        statusCode: 400,
        field: "discount",
        message: "The discount is larger than the items",
      }),
    );
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("refuses the amount %s", (amount) => {
    expect(() => assertDiscountWithinItems(amount, Number.MAX_SAFE_INTEGER, "discount")).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR", field: "discount" }),
    );
  });
});

describe("assertOrderTotalWithinLimit", () => {
  it("accepts the limit itself and refuses one dinar more with a coded 400", () => {
    expect(() => assertOrderTotalWithinLimit(MAX_MONEY_DZD, "items")).not.toThrow();
    expect.assertions(3);
    try {
      assertOrderTotalWithinLimit(OVER, "items");
    } catch (error) {
      expect(error).toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 400,
        field: "items",
        message: "The order total is too large",
      });
    }
    expect(() => assertOrderTotalWithinLimit(Number.MAX_SAFE_INTEGER + 2, "items")).toThrow(
      /too large/,
    );
  });
});

describe("delivery cost and unit price have an upper bound in every order input", () => {
  it.each([
    ["manual order", (v: number) => trustedManualOrderSchema.safeParse({ ...manualOrder, deliveryCost: v })],
    ["source order", (v: number) => canonicalSourceOrderSchema.safeParse({ ...sourceOrder, deliveryCost: v })],
    ["source order line price", (v: number) => canonicalSourceOrderSchema.safeParse({ ...sourceOrder, items: [{ productId: "p1", quantity: 1, unitPrice: v }] })],
    ["file import row", (v: number) => canonicalImportRowSchema.safeParse({ ...importRow, deliveryCost: v })],
    ["file import row price", (v: number) => canonicalImportRowSchema.safeParse({ ...importRow, unitPrice: v })],
    ["order edit", (v: number) => manualOrderEditSchema.safeParse({ orderId: "o1", expectedVersion: 1, idempotencyKey: "edit-key-0001", deliveryCost: v })],
    ["lines edit price", (v: number) => manualOrderLinesEditSchema.safeParse({ orderId: "o1", expectedVersion: 1, idempotencyKey: "lines-key-0001", lines: [{ id: "i1", quantity: 1, unitPrice: v }] })],
    ["exchange delivery cost", (v: number) => canonicalCustomerReturnRequestSchema.safeParse({ ...returnRequest, exchangeDeliveryCost: v })],
  ])("%s: 999,999,999 passes and 1,000,000,000 is refused", (_name, parse) => {
    // The exchange case needs replacement items to be valid as a whole; for it
    // only the amount's own issue matters.
    const atLimit = parse(MAX_MONEY_DZD);
    const overLimit = parse(OVER);
    const amountIssues = (r: ReturnType<typeof parse>) =>
      r.success
        ? []
        : r.error.issues.filter((i) => /deliveryCost|DeliveryCost|unitPrice/.test(i.path.join(".")));
    expect(amountIssues(atLimit)).toEqual([]);
    expect(amountIssues(overLimit).length).toBeGreaterThan(0);
  });
});
