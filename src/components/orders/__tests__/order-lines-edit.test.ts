import { describe, expect, it } from "vitest";

import type { OrderFormProduct } from "../order-product-combobox";
import {
  addCatalogProduct,
  changeNewLineVariant,
  linesCommandPayload,
  linesDiffer,
  linesFromItems,
  linesItemsTotal,
  removeLine,
  setLinePrice,
  setLineQuantity,
  type PanelItem,
} from "../order-lines-edit";

/**
 * The pure rules behind the line editor of a pending order (S03a-03B): what the seller can
 * add, change and remove, and exactly what is sent to the governed command. A price is sent
 * only when the seller changed it, so the server keeps every price it was not asked to move.
 */

const ITEMS: PanelItem[] = [
  { id: "line-1", productId: "p1", productVariantId: null, productName: "Linen shirt", productVariantName: null, quantity: 2, unitPrice: 2500, total: 5000 },
  { id: "line-2", productId: "p2", productVariantId: "v-red", productName: "Scarf", productVariantName: "Red", quantity: 1, unitPrice: 1800, total: 1800 },
];

const FIRST = ITEMS[0] as PanelItem;

const plain: OrderFormProduct = { id: "p3", name: "Belt", price: 900, stock: 5, isActive: true, productVariants: [] };
const withVariants: OrderFormProduct = {
  id: "p2",
  name: "Scarf",
  price: 1700,
  stock: 9,
  isActive: true,
  productVariants: [
    { id: "v-red", name: "Red", sku: null, price: 1800, stock: 3, isActive: true },
    { id: "v-blue", name: "Blue", sku: null, price: null, stock: 3, isActive: true },
    { id: "v-old", name: "Old", sku: null, price: 50, stock: 3, isActive: false },
  ],
};

describe("lines of a pending order", () => {
  it("starts from the stored lines, none of them new", () => {
    const lines = linesFromItems(ITEMS);
    expect(lines.map((line) => [line.id, line.isNew, line.quantity, line.unitPrice])).toEqual([
      ["line-1", false, 2, 2500],
      ["line-2", false, 1, 1800],
    ]);
    expect(linesItemsTotal(lines)).toBe(6800);
  });

  it("changes a quantity (a whole number, at least 1) and keeps the total in step", () => {
    let lines = linesFromItems(ITEMS);
    lines = setLineQuantity(lines, "line-1", 5);
    expect(lines[0]).toMatchObject({ quantity: 5, total: 12_500 });
    lines = setLineQuantity(lines, "line-1", 0);
    expect(lines[0]?.quantity).toBe(1);
    lines = setLineQuantity(lines, "line-1", Number.NaN);
    expect(lines[0]?.quantity).toBe(1);
    lines = setLineQuantity(lines, "line-1", 2.9);
    expect(lines[0]?.quantity).toBe(2);
    lines = setLineQuantity(lines, "line-1", 9_999_999);
    expect(lines[0]?.quantity).toBe(100_000);
  });

  it("changes a price (a whole number, never negative) and keeps the total in step", () => {
    let lines = linesFromItems(ITEMS);
    lines = setLinePrice(lines, "line-1", 2300);
    expect(lines[0]).toMatchObject({ unitPrice: 2300, total: 4600 });
    lines = setLinePrice(lines, "line-1", -5);
    expect(lines[0]?.unitPrice).toBe(0);
    lines = setLinePrice(lines, "line-1", Number.NaN);
    expect(lines[0]?.unitPrice).toBe(0);
  });

  it("never removes the last line", () => {
    let lines = linesFromItems(ITEMS);
    lines = removeLine(lines, "line-1");
    expect(lines.map((line) => line.id)).toEqual(["line-2"]);
    expect(removeLine(lines, "line-2")).toBe(lines);
  });

  it("adds a plain product at its catalog price, once", () => {
    let lines = linesFromItems(ITEMS);
    lines = addCatalogProduct(lines, plain, "new:1");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatchObject({
      id: "new:1",
      isNew: true,
      productId: "p3",
      productVariantId: null,
      productName: "Belt",
      quantity: 1,
      unitPrice: 900,
      catalogPrice: 900,
      total: 900,
    });
    // The same plain product again changes nothing.
    expect(addCatalogProduct(lines, plain, "new:2")).toBe(lines);
  });

  it("adds a product with variants on its first free active variant, at that variant's price", () => {
    let lines = linesFromItems(ITEMS);
    // The scarf already has Red on the order; the next free active variant is Blue (no price of its own).
    lines = addCatalogProduct(lines, withVariants, "new:1");
    expect(lines[2]).toMatchObject({
      isNew: true,
      productId: "p2",
      productVariantId: "v-blue",
      productVariantName: "Blue",
      unitPrice: 1700,
      catalogPrice: 1700,
    });
    // Every active variant is now used: adding the scarf again changes nothing.
    expect(addCatalogProduct(lines, withVariants, "new:2")).toBe(lines);
  });

  it("lets a new line switch to another free variant and takes that variant's price", () => {
    let lines = linesFromItems([FIRST]);
    lines = addCatalogProduct(lines, withVariants, "new:1");
    expect(lines[1]).toMatchObject({ productVariantId: "v-red", unitPrice: 1800 });
    lines = changeNewLineVariant(lines, "new:1", "v-blue");
    expect(lines[1]).toMatchObject({ productVariantId: "v-blue", productVariantName: "Blue", unitPrice: 1700, catalogPrice: 1700 });
    // A variant already used by another line, an inactive one and an unknown one are refused.
    const two = addCatalogProduct(lines, { ...withVariants, productVariants: (withVariants.productVariants ?? []).map((v) => ({ ...v })) }, "new:2");
    expect(changeNewLineVariant(two, "new:2", "v-blue")).toBe(two);
    expect(changeNewLineVariant(lines, "new:1", "v-old")).toBe(lines);
    expect(changeNewLineVariant(lines, "new:1", "nope")).toBe(lines);
    // An existing line cannot change its variant.
    expect(changeNewLineVariant(lines, "line-1", "v-red")).toBe(lines);
  });

  it("sees no difference until something really changed", () => {
    const lines = linesFromItems(ITEMS);
    expect(linesDiffer(ITEMS, lines)).toBe(false);
    expect(linesDiffer(ITEMS, setLineQuantity(lines, "line-1", 3))).toBe(true);
    expect(linesDiffer(ITEMS, setLinePrice(lines, "line-1", 2400))).toBe(true);
    expect(linesDiffer(ITEMS, removeLine(lines, "line-2"))).toBe(true);
    expect(linesDiffer(ITEMS, addCatalogProduct(lines, plain, "new:1"))).toBe(true);
    // Back to the stored values is no difference.
    expect(linesDiffer(ITEMS, setLineQuantity(setLineQuantity(lines, "line-1", 3), "line-1", 2))).toBe(false);
  });

  it("sends existing lines by id with their quantity, and a price only when the seller changed it", () => {
    let lines = linesFromItems(ITEMS);
    lines = setLineQuantity(lines, "line-1", 4);
    lines = setLinePrice(lines, "line-2", 1500);
    expect(linesCommandPayload(ITEMS, lines)).toEqual([
      { id: "line-1", quantity: 4 },
      { id: "line-2", quantity: 1, unitPrice: 1500 },
    ]);
  });

  it("sends a new line by product (and exact variant), with a price only when it differs from the catalog's", () => {
    let lines = linesFromItems([FIRST]);
    lines = addCatalogProduct(lines, plain, "new:1");
    lines = addCatalogProduct(lines, withVariants, "new:2");
    lines = setLineQuantity(lines, "new:2", 2);
    expect(linesCommandPayload([FIRST], lines)).toEqual([
      { id: "line-1", quantity: 2 },
      { productId: "p3", quantity: 1 },
      { productId: "p2", productVariantId: "v-red", quantity: 2 },
    ]);
    lines = setLinePrice(lines, "new:1", 700);
    expect(linesCommandPayload([FIRST], lines)[1]).toEqual({ productId: "p3", quantity: 1, unitPrice: 700 });
  });

  it("leaves out of the list a line that was removed, which is how the command removes it", () => {
    const lines = removeLine(linesFromItems(ITEMS), "line-2");
    expect(linesCommandPayload(ITEMS, lines)).toEqual([{ id: "line-1", quantity: 2 }]);
  });

  it("a stored line whose product was deleted can still change quantity and price, and blocks nothing", () => {
    const orphan: PanelItem[] = [
      { id: "line-9", productId: null, productVariantId: null, productName: "Old item", productVariantName: null, quantity: 1, unitPrice: 1000, total: 1000 },
    ];
    let lines = linesFromItems(orphan);
    lines = addCatalogProduct(lines, plain, "new:1");
    expect(lines).toHaveLength(2);
    lines = setLineQuantity(lines, "line-9", 3);
    expect(linesCommandPayload(orphan, lines)).toEqual([
      { id: "line-9", quantity: 3 },
      { productId: "p3", quantity: 1 },
    ]);
  });
});
