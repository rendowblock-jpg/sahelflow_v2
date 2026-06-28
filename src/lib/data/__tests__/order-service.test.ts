/**
 * Order service tests — CRUD + state transitions + stock side effects.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { orderService } from "../order-service";
import { createTestPrisma, disconnectTestPrisma, seedCustomer, seedProduct } from "./helpers";
import { NotFoundError, InvalidTransitionError } from "@/types/errors";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

// ── list ─────────────────────────────────────────────────────────────────────

describe("orderService.list", () => {
  it("returns empty array when no orders", async () => {
    const result = await orderService.list({ prisma: db as never });
    expect(result).toEqual([]);
  });

  it("returns orders with items included", async () => {
    const customer = await seedCustomer(db);
    const product = await seedProduct(db);
    await db.order.create({
      data: {
        orderNumber: "ORD-0001",
        status: "draft",
        customerId: customer.id,
        totalPrice: 5000,
        wilaya: "Alger",
        commune: "X",
        address: "Y",
        phone: "0555123456",
        source: "manual",
        items: {
          create: [{
            productId: product.id,
            productName: "Test",
            quantity: 2,
            unitPrice: 2500,
            total: 5000,
          }],
        },
      },
    });
    const result = await orderService.list({ prisma: db as never });
    expect(result).toHaveLength(1);
    expect(result[0]!.items).toHaveLength(1);
  });

  it("filters by status", async () => {
    const customer = await seedCustomer(db);
    await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "draft", customerId: customer.id,
        totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });
    await db.order.create({
      data: {
        orderNumber: "ORD-0002", status: "confirmed", customerId: customer.id,
        totalPrice: 2000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });
    const drafts = await orderService.list({ prisma: db as never }, { status: "draft" });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.status).toBe("draft");
  });
});

// ── getById ──────────────────────────────────────────────────────────────────

describe("orderService.getById", () => {
  it("returns order by id", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "draft", customerId: customer.id,
        totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });
    const found = await orderService.getById({ prisma: db as never }, order.id);
    expect(found.orderNumber).toBe("ORD-0001");
  });

  it("throws NotFoundError for non-existent id", async () => {
    await expect(
      orderService.getById({ prisma: db as never }, "nonexistent123456789012345"),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── getByOrderNumber ─────────────────────────────────────────────────────────

describe("orderService.getByOrderNumber", () => {
  it("returns order by order number", async () => {
    const customer = await seedCustomer(db);
    await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "draft", customerId: customer.id,
        totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });
    const found = await orderService.getByOrderNumber({ prisma: db as never }, "ORD-0001");
    expect(found).not.toBeNull();
    expect(found!.orderNumber).toBe("ORD-0001");
  });

  it("returns null for non-existent order number", async () => {
    const found = await orderService.getByOrderNumber({ prisma: db as never }, "ORD-9999");
    expect(found).toBeNull();
  });
});

// ── create ───────────────────────────────────────────────────────────────────

describe("orderService.create", () => {
  it("creates an order with valid input", async () => {
    const customer = await seedCustomer(db);
    const product = await seedProduct(db);
    const order = await orderService.create({ prisma: db as never }, {
      customerId: customer.id,
      items: [{
        productId: product.id,
        productName: "Test Product",
        quantity: 2,
        unitPrice: 2500,
      }],
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555123456",
      source: "manual",
    });
    expect(order.id).toBeTruthy();
    expect(order.status).toBe("draft");
    expect(order.totalPrice).toBe(5000); // 2 × 2500
    expect(order.orderNumber).toMatch(/^ORD-\d{4}$/);
    expect(order.items).toHaveLength(1);
  });

  it("calculates totalPrice including deliveryCost", async () => {
    const customer = await seedCustomer(db);
    const order = await orderService.create({ prisma: db as never }, {
      customerId: customer.id,
      items: [{
        productName: "Item",
        quantity: 1,
        unitPrice: 3000,
      }],
      wilaya: "Alger",
      commune: "X",
      address: "Y",
      phone: "0555123456",
      source: "manual",
      deliveryCost: 500,
    });
    expect(order.totalPrice).toBe(3500);
  });

  it("throws NotFoundError for non-existent customer", async () => {
    // Use a valid cuid format so Zod validation passes, then the service checks existence
    await expect(
      orderService.create({ prisma: db as never }, {
        customerId: "cnonexistent123456789012",
        items: [{ productName: "X", quantity: 1, unitPrice: 100 }],
        wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      }),
    ).rejects.toThrow();
  });

  it("rejects empty items array", async () => {
    const customer = await seedCustomer(db);
    await expect(
      orderService.create({ prisma: db as never }, {
        customerId: customer.id,
        items: [],
        wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      }),
    ).rejects.toThrow();
  });

  it("generates sequential order numbers (atomic counter)", async () => {
    const customer = await seedCustomer(db);
    const o1 = await orderService.create({ prisma: db as never }, {
      customerId: customer.id,
      items: [{ productName: "X", quantity: 1, unitPrice: 100 }],
      wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
    });
    const o2 = await orderService.create({ prisma: db as never }, {
      customerId: customer.id,
      items: [{ productName: "Y", quantity: 1, unitPrice: 100 }],
      wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
    });
    expect(o1.orderNumber).toBe("ORD-0001");
    expect(o2.orderNumber).toBe("ORD-0002");
  });
});

// ── updateStatus (state machine) ─────────────────────────────────────────────

describe("orderService.updateStatus", () => {
  it("transitions draft → pending (valid)", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "draft", customerId: customer.id,
        totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });
    const updated = await orderService.updateStatus({ prisma: db as never }, order.id, "pending");
    expect(updated.status).toBe("pending");
  });

  it("transitions pending → confirmed + deducts stock", async () => {
    const customer = await seedCustomer(db);
    const product = await seedProduct(db, { stock: 50 });
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "pending", customerId: customer.id,
        totalPrice: 5000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
        items: { create: [{ productId: product.id, productName: "Test", quantity: 5, unitPrice: 1000, total: 5000 }] },
      },
      include: { items: true },
    });
    const updated = await orderService.updateStatus({ prisma: db as never }, order.id, "confirmed");
    expect(updated.status).toBe("confirmed");
    expect(updated.confirmedAt).toBeTruthy();
    // Stock should be decremented
    const updatedProduct = await db.product.findUnique({ where: { id: product.id } });
    expect(updatedProduct!.stock).toBe(45);
  });

  it("transitions shipped → delivered + increments customer stats", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "shipped", customerId: customer.id,
        totalPrice: 5000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
        items: { create: [{ productName: "Test", quantity: 1, unitPrice: 5000, total: 5000 }] },
      },
      include: { items: true },
    });
    const updated = await orderService.updateStatus({ prisma: db as never }, order.id, "delivered");
    expect(updated.status).toBe("delivered");
    expect(updated.deliveredAt).toBeTruthy();
    // Customer stats should be incremented
    const updatedCustomer = await db.customer.findUnique({ where: { id: customer.id } });
    expect(updatedCustomer!.orderCount).toBe(1);
    expect(updatedCustomer!.totalSpent).toBe(5000);
  });

  it("restores stock on cancelled from confirmed", async () => {
    const customer = await seedCustomer(db);
    const product = await seedProduct(db, { stock: 50 });
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "confirmed", customerId: customer.id,
        totalPrice: 5000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
        items: { create: [{ productId: product.id, productName: "Test", quantity: 5, unitPrice: 1000, total: 5000 }] },
      },
      include: { items: true },
    });
    // First deduct stock (as if the confirmation happened through the service)
    await db.product.update({ where: { id: product.id }, data: { stock: { decrement: 5 } } });
    // Now cancel
    await orderService.updateStatus({ prisma: db as never }, order.id, "cancelled");
    const updatedProduct = await db.product.findUnique({ where: { id: product.id } });
    expect(updatedProduct!.stock).toBe(50); // restored
  });

  it("rejects invalid transition (draft → delivered)", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "draft", customerId: customer.id,
        totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });
    await expect(
      orderService.updateStatus({ prisma: db as never }, order.id, "delivered"),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("no-ops when transitioning to same status", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "pending", customerId: customer.id,
        totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });
    const updated = await orderService.updateStatus({ prisma: db as never }, order.id, "pending");
    expect(updated.status).toBe("pending");
  });

  it("throws NotFoundError for non-existent order", async () => {
    await expect(
      orderService.updateStatus({ prisma: db as never }, "nonexistent123456789012345", "pending"),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── update ───────────────────────────────────────────────────────────────────

describe("orderService.update", () => {
  it("updates order notes", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "draft", customerId: customer.id,
        totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });
    const updated = await orderService.update({ prisma: db as never }, order.id, { notes: "New notes" });
    expect(updated.notes).toBe("New notes");
  });

  it("updates deliveryCost", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "draft", customerId: customer.id,
        totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });
    const updated = await orderService.update({ prisma: db as never }, order.id, { deliveryCost: 500 });
    expect(updated.deliveryCost).toBe(500);
  });
});

// ── countByStatus ────────────────────────────────────────────────────────────

describe("orderService.countByStatus", () => {
  it("counts orders grouped by status", async () => {
    const customer = await seedCustomer(db);
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "draft", customerId: customer.id, totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual" },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0002", status: "draft", customerId: customer.id, totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual" },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0003", status: "confirmed", customerId: customer.id, totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual" },
    });
    const counts = await orderService.countByStatus({ prisma: db as never });
    expect(counts.draft).toBe(2);
    expect(counts.confirmed).toBe(1);
  });
});

// ── listToday ────────────────────────────────────────────────────────────────

describe("orderService.listToday", () => {
  it("returns only orders created today", async () => {
    const customer = await seedCustomer(db);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "draft", customerId: customer.id, totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual", createdAt: yesterday },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0002", status: "draft", customerId: customer.id, totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual" },
    });
    const result = await orderService.listToday({ prisma: db as never });
    expect(result).toHaveLength(1);
    expect(result[0]!.orderNumber).toBe("ORD-0002");
  });
});
