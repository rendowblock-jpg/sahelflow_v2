/**
 * Order service tests — CRUD + state transitions + stock side effects.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { orderService } from "../order-service";
import { createTestPrisma, disconnectTestPrisma, seedCustomer, seedProduct } from "./helpers";
import { NotFoundError, InvalidTransitionError, ValidationError } from "@/types/errors";

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

  it("transitions delivered → returned + decrements customer stats (SV-M3)", async () => {
    // SV-M3: customer stats (orderCount + totalSpent) were incremented on the
    // shipped→delivered transition. When the order moves delivered→returned
    // (post-delivery COD return), they must be decremented — otherwise a
    // customer who ordered 10×, had 5 returned, shows orderCount=10 + inflated
    // totalSpent (misleading the seller about the customer's real value).
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "delivered", customerId: customer.id,
        totalPrice: 5000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
        items: { create: [{ productName: "Test", quantity: 1, unitPrice: 5000, total: 5000 }] },
      },
      include: { items: true },
    });
    // Pre-seed the customer stats as if the delivered transition had run.
    await db.customer.update({
      where: { id: customer.id },
      data: { orderCount: { increment: 1 }, totalSpent: { increment: 5000 } },
    });
    // Sanity check: stats are 1 / 5000 before the return.
    const beforeCustomer = await db.customer.findUnique({ where: { id: customer.id } });
    expect(beforeCustomer!.orderCount).toBe(1);
    expect(beforeCustomer!.totalSpent).toBe(5000);

    // Transition delivered → returned (the standard COD return path).
    const updated = await orderService.updateStatus({ prisma: db as never }, order.id, "returned");
    expect(updated.status).toBe("returned");

    // SV-M3: orderCount + totalSpent should be decremented back to 0.
    const afterCustomer = await db.customer.findUnique({ where: { id: customer.id } });
    expect(afterCustomer!.orderCount).toBe(0);
    expect(afterCustomer!.totalSpent).toBe(0);
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

  // ── B7-1: server-derived money truth + post-confirmation lock ─────────────

  it("recomputes totalPrice from items + deliveryCost, never trusting the client", async () => {
    const customer = await seedCustomer(db);
    const product = await seedProduct(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "pending", customerId: customer.id,
        // Bogus legacy stored money — the recompute must replace it.
        totalPrice: 1, deliveryCost: 500, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
        items: { create: [{ productId: product.id, productName: "Test", quantity: 2, unitPrice: 1000, total: 2000 }] },
      },
      include: { items: true },
    });

    const updated = await orderService.update({ prisma: db as never }, order.id, {
      items: [{
        id: order.items[0]!.id,
        productId: product.id,
        productName: "Test",
        quantity: 3,
        unitPrice: 1000,
        total: 3000,
      }],
      deliveryCost: 500,
    });

    expect(updated.items[0]!.total).toBe(3000);
    expect(updated.totalPrice).toBe(3500); // 3×1000 + 500, not client-asserted money
  });

  it("rejects item totals that disagree with unitPrice × quantity", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "pending", customerId: customer.id,
        totalPrice: 2000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
        items: { create: [{ productName: "Test", quantity: 2, unitPrice: 1000, total: 2000 }] },
      },
    });

    await expect(
      orderService.update({ prisma: db as never }, order.id, {
        items: [{ productName: "Test", quantity: 2, unitPrice: 1000, total: 9999 }],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("recomputes totalPrice when only deliveryCost changes", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "pending", customerId: customer.id,
        totalPrice: 2000, deliveryCost: 0, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
        items: { create: [{ productName: "Test", quantity: 2, unitPrice: 1000, total: 2000 }] },
      },
    });

    const updated = await orderService.update({ prisma: db as never }, order.id, { deliveryCost: 500 });

    expect(updated.deliveryCost).toBe(500);
    expect(updated.totalPrice).toBe(2500); // existing items (2×1000) + 500
  });

  it("does not rewrite totalPrice on contact-only edits", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "pending", customerId: customer.id,
        totalPrice: 7777, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });

    const updated = await orderService.update({ prisma: db as never }, order.id, { notes: "Call first" });

    expect(updated.notes).toBe("Call first");
    expect(updated.totalPrice).toBe(7777);
  });

  it("blocks money-bearing edits on confirmed legacy orders (stock already reserved)", async () => {
    const customer = await seedCustomer(db);
    const product = await seedProduct(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "confirmed", customerId: customer.id,
        totalPrice: 5000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
        items: { create: [{ productId: product.id, productName: "Test", quantity: 5, unitPrice: 1000, total: 5000 }] },
      },
    });

    await expect(
      orderService.update({ prisma: db as never }, order.id, {
        items: [{ productId: product.id, productName: "Test", quantity: 1, unitPrice: 1000, total: 1000 }],
      }),
    ).rejects.toMatchObject({ code: "ORDER_EDIT_LOCKED_POST_CONFIRMATION" });

    // Item set unchanged by the rejected edit.
    const reloaded = await db.order.findUnique({ where: { id: order.id }, include: { items: true } });
    expect(reloaded!.items).toHaveLength(1);
    expect(reloaded!.items[0]!.quantity).toBe(5);
  });

  it("blocks deliveryCost edits on delivered legacy orders (money already fed stats)", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "delivered", customerId: customer.id,
        totalPrice: 5000, deliveryCost: 500, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });

    await expect(
      orderService.update({ prisma: db as never }, order.id, { deliveryCost: 900 }),
    ).rejects.toMatchObject({ code: "ORDER_EDIT_LOCKED_POST_CONFIRMATION" });
    expect(order.totalPrice).toBe(5000);
  });

  it("still allows contact-only edits on confirmed legacy orders", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "confirmed", customerId: customer.id,
        totalPrice: 5000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });

    const updated = await orderService.update({ prisma: db as never }, order.id, {
      phone: "0555987654",
      notes: "Leave at door",
    });

    expect(updated.phone).toBe("0555987654");
    expect(updated.notes).toBe("Leave at door");
    expect(updated.totalPrice).toBe(5000);
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
