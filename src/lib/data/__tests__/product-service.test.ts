/**
 * Product service tests — CRUD + variants + stock + categories.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { productService } from "../product-service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedProduct,
  seedCategory,
  seedCustomer,
  seedOrder,
} from "./helpers";
import { NotFoundError, ConflictError } from "@/types/errors";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

// ── list ─────────────────────────────────────────────────────────────────────

describe("productService.list", () => {
  it("returns empty array when no products", async () => {
    const result = await productService.list({ prisma: db as never });
    expect(result).toEqual([]);
  });

  it("returns products with variants", async () => {
    await seedProduct(db, { name: "Widget" });
    const result = await productService.list({ prisma: db as never });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Widget");
    // The service includes productVariants (Prisma relation) — cast to access it
    expect((result[0] as never as { productVariants: unknown[] }).productVariants).toBeDefined();
  });

  it("filters to active only when activeOnly=true", async () => {
    const cat = await seedCategory(db);
    await productService.create({ prisma: db as never }, { name: "Active", price: 1000, stock: 10, categoryId: cat.id });
    await db.product.create({
      data: {
        name: "Inactive",
        price: 1000,
        stock: 0,
        categoryId: cat.id,
        isActive: false,
      },
    });
    const result = await productService.list({ prisma: db as never }, { activeOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Active");
  });
});

// ── getById ──────────────────────────────────────────────────────────────────

describe("productService.getById", () => {
  it("returns product by id", async () => {
    const created = await seedProduct(db);
    const found = await productService.getById({ prisma: db as never }, created.id);
    expect(found.name).toBe("Test Product");
  });

  it("throws NotFoundError for non-existent id", async () => {
    await expect(
      productService.getById({ prisma: db as never }, "nonexistent123456789012345"),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── create ───────────────────────────────────────────────────────────────────

describe("productService.create", () => {
  it("creates a product with valid input", async () => {
    const cat = await seedCategory(db);
    const created = await productService.create({ prisma: db as never }, {
      name: "New Product",
      price: 5000,
      stock: 50,
      categoryId: cat.id,
    });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("New Product");
    expect(created.price).toBe(5000);
  });

  it("auto-creates a Default variant when no variants provided", async () => {
    const cat = await seedCategory(db);
    const created = await productService.create({ prisma: db as never }, {
      name: "Test",
      price: 2500,
      stock: 100,
      categoryId: cat.id,
    });
    const found = await db.product.findUnique({
      where: { id: created.id },
      include: { productVariants: true },
    });
    expect(found!.productVariants).toHaveLength(1);
    expect(found!.productVariants[0]!.name).toBe("Default");
  });

  it("creates explicit variants when provided", async () => {
    const cat = await seedCategory(db);
    const created = await productService.create({ prisma: db as never }, {
      name: "Shirt",
      price: 2000,
      stock: 0,
      categoryId: cat.id,
      variants: [
        { name: "Small", sku: "SHIRT-S", stock: 10, isActive: true, sortOrder: 0 },
        { name: "Medium", sku: "SHIRT-M", stock: 15, isActive: true, sortOrder: 1 },
        { name: "Large", sku: "SHIRT-L", stock: 5, isActive: true, sortOrder: 2 },
      ],
    });
    const found = await db.product.findUnique({
      where: { id: created.id },
      include: { productVariants: { orderBy: { sortOrder: "asc" } } },
    });
    expect(found!.productVariants).toHaveLength(3);
    expect(found!.productVariants[0]!.name).toBe("Small");
  });

  it("rejects duplicate SKU", async () => {
    const cat = await seedCategory(db);
    await productService.create({ prisma: db as never }, { name: "P1", price: 1000, stock: 0, sku: "UNIQUE-SKU", categoryId: cat.id });
    await expect(
      productService.create({ prisma: db as never }, { name: "Dup", price: 1000, stock: 0, sku: "UNIQUE-SKU", categoryId: cat.id }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects negative price", async () => {
    await expect(
      productService.create({ prisma: db as never }, { name: "Bad", price: -100, stock: 0 }),
    ).rejects.toThrow();
  });
});

// ── update ───────────────────────────────────────────────────────────────────

describe("productService.update", () => {
  it("updates product fields", async () => {
    const created = await seedProduct(db);
    const updated = await productService.update({ prisma: db as never }, created.id, { name: "Updated", price: 3000 });
    expect(updated.name).toBe("Updated");
    expect(updated.price).toBe(3000);
  });

  it("syncs variants on update (add + remove + update)", async () => {
    const cat = await seedCategory(db);
    const created = await productService.create({ prisma: db as never }, {
      name: "Test",
      price: 1000,
      stock: 0,
      categoryId: cat.id,
      variants: [
        { name: "V1", stock: 5, isActive: true, sortOrder: 0 },
        { name: "V2", stock: 5, isActive: true, sortOrder: 1 },
      ],
    });
    const initial = await db.productVariant.findMany({ where: { productId: created.id } });
    expect(initial).toHaveLength(2);

    // Update: keep V1 (with new stock), remove V2, add V3
    const v1Id = initial.find((v) => v.name === "V1")!.id;
    await productService.update({ prisma: db as never }, created.id, {
      variants: [
        { id: v1Id, name: "V1", stock: 20, isActive: true, sortOrder: 0 },
        { name: "V3", stock: 10, isActive: true, sortOrder: 1 },
      ],
    });
    const after = await db.productVariant.findMany({ where: { productId: created.id } });
    expect(after).toHaveLength(2);
    expect(after.find((v) => v.name === "V1")!.stock).toBe(20);
    expect(after.find((v) => v.name === "V3")).toBeDefined();
    expect(after.find((v) => v.name === "V2")).toBeUndefined();
  });

  it("rejects SKU conflict with another product", async () => {
    const cat = await seedCategory(db);
    const p1 = await productService.create({ prisma: db as never }, { name: "P1", price: 1000, stock: 0, sku: "SKU1", categoryId: cat.id });
    await productService.create({ prisma: db as never }, { name: "P2", price: 1000, stock: 0, sku: "SKU2", categoryId: cat.id });
    await expect(
      productService.update({ prisma: db as never }, p1.id, { sku: "SKU2" }),
    ).rejects.toThrow(ConflictError);
  });
});

// ── update: stock refusal names the holding orders ──────────────────────────

describe("productService.update stock refusal", () => {
  // A reservation row needs a command row (foreign key); the state is the only
  // thing these tests care about.
  async function hold(
    orderId: string,
    productId: string,
    state: "active" | "released" | "consumed",
  ): Promise<void> {
    const id = `${state}-${orderId}`;
    await db.$executeRaw`
      INSERT INTO "BusinessCommand" ("id", "idempotencyKey", "commandType", "aggregateType",
        "aggregateId", "requestHash", "status", "actor", "correlationId", "expectedVersion")
      VALUES (${id}, ${id}, 'test', 'order', ${orderId}, 'h', 'committed', 'test', ${id}, 0)
    `;
    await db.$executeRaw`
      INSERT INTO "InventoryReservation" ("id", "reservationKey", "orderId", "productId",
        "quantity", "state", "createdByCommandId")
      VALUES (${id}, ${id}, ${orderId}, ${productId}, 1, ${state}, ${id})
    `;
  }

  async function holders(
    productId: string,
    states: Array<"active" | "released" | "consumed">,
  ): Promise<string[]> {
    const customer = await seedCustomer(db);
    const numbers: string[] = [];
    for (const state of states) {
      const order = await seedOrder(db, {
        customerId: customer.id,
        productId,
        status: "confirmed",
      });
      await hold(order.id, productId, state);
      numbers.push(order.orderNumber);
    }
    return numbers;
  }

  async function refusalMessage(productId: string): Promise<string> {
    try {
      await productService.update({ prisma: db as never }, productId, { stock: 50 });
    } catch (error) {
      expect(error).toMatchObject({ code: "CANONICAL_STOCK_ADJUSTMENT_REQUIRED" });
      return (error as Error).message;
    }
    throw new Error("stock edit was not refused");
  }

  it("refusal lists up to 5 order numbers holding the product", async () => {
    const product = await seedProduct(db, { stock: 10 });
    const numbers = await holders(product.id, ["active", "active"]);

    const message = await refusalMessage(product.id);

    for (const number of numbers) expect(message).toContain(number);
    expect(message).not.toMatch(/more/);
  });

  it("released and consumed reservations are not listed", async () => {
    const product = await seedProduct(db, { stock: 10 });
    const [active, released, consumed] = await holders(product.id, [
      "active",
      "released",
      "consumed",
    ]);

    const message = await refusalMessage(product.id);

    expect(message).toContain(active);
    expect(message).not.toContain(released);
    expect(message).not.toContain(consumed);
  });

  it("an order holding the product in two lines is named once", async () => {
    const product = await seedProduct(db, { stock: 10 });
    const customer = await seedCustomer(db);
    const order = await seedOrder(db, {
      customerId: customer.id,
      productId: product.id,
      status: "confirmed",
    });
    await hold(order.id, product.id, "active");
    await db.$executeRaw`
      INSERT INTO "InventoryReservation" ("id", "reservationKey", "orderId", "productId",
        "quantity", "state", "createdByCommandId")
      VALUES ('second-line', 'second-line', ${order.id}, ${product.id}, 1, 'active', ${`active-${order.id}`})
    `;

    const message = await refusalMessage(product.id);

    expect(message.split(order.orderNumber)).toHaveLength(2);
    expect(message).not.toMatch(/more/);
  });

  it("more than 5 holders: message says how many more", async () => {
    const product = await seedProduct(db, { stock: 10 });
    const numbers = await holders(product.id, Array(7).fill("active"));

    const message = await refusalMessage(product.id);

    const named = numbers.filter((number) => message.includes(number));
    expect(named).toHaveLength(5);
    expect(message).toContain("2 more");
  });

  it("no active reservation: stock edit still works", async () => {
    const product = await seedProduct(db, { stock: 10 });
    await holders(product.id, ["released", "consumed"]);

    const updated = await productService.update({ prisma: db as never }, product.id, {
      stock: 50,
    });

    expect(updated.stock).toBe(50);
  });
});

// ── delete ───────────────────────────────────────────────────────────────────

describe("productService.delete", () => {
  it("soft-deletes a product with no order items (Session 30 AUDIT-3 S5)", async () => {
    // Session 30 fix: previously this test expected hard-delete (found=null).
    // We changed productService.delete to always soft-delete via deletedAt
    // because hard-delete breaks the audit trail for any historical order
    // that ever referenced the product.
    const created = await seedProduct(db);
    await productService.delete({ prisma: db as never }, created.id);
    const found = await db.product.findUnique({ where: { id: created.id } });
    expect(found).not.toBeNull();
    expect(found!.deletedAt).not.toBeNull();
    expect(found!.isActive).toBe(false);
  });

  it("soft-deletes a product with order items (Session 30 AUDIT-3 S5)", async () => {
    // Session 30 fix: also asserts deletedAt is set (not just isActive=false).
    const created = await seedProduct(db);
    // Create an order item referencing this product
    const customer = await db.customer.create({
      data: { name: "C", phone: "0555123456", wilaya: "Alger", commune: "X", address: "Y" },
    });
    await db.order.create({
      data: {
        orderNumber: "ORD-0001",
        status: "draft",
        customerId: customer.id,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "X",
        address: "Y",
        phone: "0555123456",
        source: "manual",
        items: { create: [{ productId: created.id, productName: "Test", quantity: 1, unitPrice: 1000, total: 1000 }] },
      },
    });
    await productService.delete({ prisma: db as never }, created.id);
    const found = await db.product.findUnique({ where: { id: created.id } });
    expect(found).not.toBeNull();
    expect(found!.deletedAt).not.toBeNull();
    expect(found!.isActive).toBe(false);
  });
});

// ── listLowStock ─────────────────────────────────────────────────────────────

describe("productService.listLowStock", () => {
  it("returns products at or below lowStockThreshold", async () => {
    const cat = await seedCategory(db);
    await productService.create({ prisma: db as never }, { name: "OK", price: 1000, stock: 50, lowStockThreshold: 5, categoryId: cat.id });
    await productService.create({ prisma: db as never }, { name: "Low", price: 1000, stock: 3, lowStockThreshold: 5, categoryId: cat.id });
    await productService.create({ prisma: db as never }, { name: "Empty", price: 1000, stock: 0, lowStockThreshold: 5, categoryId: cat.id });
    const result = await productService.listLowStock({ prisma: db as never });
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.name).sort()).toEqual(["Empty", "Low"]);
  });

  it("excludes inactive products", async () => {
    const cat = await seedCategory(db);
    await db.product.create({
      data: {
        name: "Inactive Low",
        price: 1000,
        stock: 0,
        lowStockThreshold: 5,
        categoryId: cat.id,
        isActive: false,
      },
    });
    const result = await productService.listLowStock({ prisma: db as never });
    expect(result).toEqual([]);
  });
});

// ── categories ───────────────────────────────────────────────────────────────

describe("productService.listCategories", () => {
  it("returns categories ordered by name", async () => {
    await seedCategory(db, "Zebra");
    await seedCategory(db, "Alpha");
    const result = await productService.listCategories({ prisma: db as never });
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("Alpha");
    expect(result[1]!.name).toBe("Zebra");
  });
});

describe("productService.createCategory", () => {
  it("creates a category", async () => {
    const created = await productService.createCategory({ prisma: db as never }, { name: "New Cat" });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("New Cat");
  });

  it("rejects duplicate category name", async () => {
    await seedCategory(db, "Dup");
    await expect(
      productService.createCategory({ prisma: db as never }, { name: "Dup" }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects empty name", async () => {
    await expect(
      productService.createCategory({ prisma: db as never }, { name: "" }),
    ).rejects.toThrow();
  });
});
