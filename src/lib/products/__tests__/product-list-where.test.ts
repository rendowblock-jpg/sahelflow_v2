import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCategory,
} from "@/lib/data/__tests__/helpers";
import { productListWhere } from "@/lib/products/product-workbench";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

async function product(
  categoryId: string,
  name: string,
  stock: number,
  lowStockThreshold: number,
  isActive = true,
) {
  return db.product.create({
    data: { name, price: 1000, stock, lowStockThreshold, isActive, categoryId },
  });
}

describe("product list filter (Products low-stock card)", () => {
  it("keeps the unfiltered list unchanged", () => {
    expect(productListWhere({})).toEqual({ deletedAt: null });
    expect(productListWhere({ q: "  " })).toEqual({ deletedAt: null });
  });

  it("returns exactly the active products at or below their own threshold", async () => {
    const category = await seedCategory(db);
    await product(category.id, "Below", 2, 5);
    await product(category.id, "At threshold", 5, 5);
    await product(category.id, "Healthy", 30, 5);
    await product(category.id, "Tight own threshold", 8, 10);
    await product(category.id, "Inactive and low", 1, 5, false);

    const rows = await db.product.findMany({
      where: productListWhere({ lowStock: true }),
      select: { name: true },
      orderBy: { name: "asc" },
    });

    // Same definition as the summary's low-stock count: a column-to-column
    // comparison per product, active products only.
    expect(rows.map((row) => row.name)).toEqual([
      "At threshold",
      "Below",
      "Tight own threshold",
    ]);
  });

  it("combines the low-stock filter with a search", async () => {
    const category = await seedCategory(db);
    await product(category.id, "Power Bank", 2, 5);
    await product(category.id, "Miroir", 1, 5);

    const rows = await db.product.findMany({
      where: productListWhere({ lowStock: true, q: "Power" }),
      select: { name: true },
    });

    expect(rows.map((row) => row.name)).toEqual(["Power Bank"]);
  });
});
