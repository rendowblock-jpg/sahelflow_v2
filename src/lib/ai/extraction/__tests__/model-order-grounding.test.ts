import { describe, expect, it } from "vitest";
import { ExtractedOrderSchema, canonicalizeOrder } from "../model-order";

// A model answer with one item; the tests change only the prices.
function read(body: string | undefined, answer: Record<string, unknown> = {}) {
  const parsed = ExtractedOrderSchema.parse({ items: [{ productName: "robe", quantity: 2 }], ...answer });
  return canonicalizeOrder(parsed, body === undefined ? {} : { body });
}
const priced = (body: string | undefined, unitPrice: number) =>
  read(body, { items: [{ productName: "robe", quantity: 2, unitPrice }] });

describe("grounding guard: prices must be written in the message", () => {
  it.each([
    ["plain digits", "robe 2 pieces 95000 DA livraison Oran", 95000],
    ["space thousands", "robe 95 000 da", 95000],
    ["no-break space thousands", "robe 95\u00a0000 da", 95000],
    ["dot thousands", "robe 95.000 دج", 95000],
    ["comma thousands", "robe 95,000 DA", 95000],
    ["apostrophe thousands", "robe 95'000 DA", 95000],
    ["Arabic-Indic digits", "فستان ٩٥٠٠٠ دج", 95000],
    ["Eastern digits", "فستان ۹۵۰۰۰ دج", 95000],
    ["k", "robe 95k", 95000],
    ["capital K and a space", "robe 95 K da", 95000],
    ["ألف", "فستان 95 ألف", 95000],
    ["mille", "robe 95 mille", 95000],
    ["milles", "robe 95 milles", 95000],
    ["decimal k", "robe 1.5k", 1500],
  ])("keeps a unit price written as %s", (_label, body, price) => {
    expect(priced(body, price).items[0]?.unitPrice).toBe(price);
  });

  it("drops an invented unit price and keeps the item and its quantity", () => {
    const order = priced("bghit parfum homme, 3ayetou li 9bel ma tjibouh. Ghardaia 0555 12 34 56", 3000);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ productName: "robe", quantity: 2 });
    expect(order.items[0]).not.toHaveProperty("unitPrice");
  });

  it("does not take a number that only sits inside a longer number", () => {
    expect(priced("robe 13000 da", 3000).items[0]).not.toHaveProperty("unitPrice");
  });

  it("keeps a total price written in the message and drops an invented one", () => {
    expect(read("robe, total 12 500 da", { totalPrice: 12500 }).totalPrice).toBe(12500);
    expect(read("robe, 2 pieces Oran", { totalPrice: 6000 })).not.toHaveProperty("totalPrice");
  });

  it("drops a price of zero, and the schema still refuses a negative one", () => {
    expect(priced("robe 95000 da", 0).items[0]).not.toHaveProperty("unitPrice");
    expect(ExtractedOrderSchema.safeParse({ items: [{ productName: "robe", quantity: 1, unitPrice: -5 }] }).success).toBe(false);
  });

  it("does nothing without a message body (the screenshot reader)", () => {
    const order = read(undefined, { items: [{ productName: "robe", quantity: 2, unitPrice: 3000 }], totalPrice: 6000 });
    expect(order.items[0]?.unitPrice).toBe(3000);
    expect(order.totalPrice).toBe(6000);
  });
});
