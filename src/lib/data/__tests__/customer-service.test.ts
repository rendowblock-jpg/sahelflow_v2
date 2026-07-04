/**
 * Customer service tests — CRUD + conflict detection.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { customerService } from "../customer-service";
import { createTestPrisma, disconnectTestPrisma, seedCustomer } from "./helpers";
import { NotFoundError, ConflictError } from "@/types/errors";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

describe("customerService.list", () => {
  it("returns empty array when no customers", async () => {
    const result = await customerService.list({ prisma: db as never });
    expect(result).toEqual([]);
  });

  it("returns customers ordered by createdAt desc", async () => {
    await seedCustomer(db, { name: "First", phone: "0555000001" });
    await seedCustomer(db, { name: "Second", phone: "0555000002" });
    const result = await customerService.list({ prisma: db as never });
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("Second");
  });

  it("respects limit + offset", async () => {
    await seedCustomer(db, { phone: "0555000001" });
    await seedCustomer(db, { phone: "0555000002" });
    await seedCustomer(db, { phone: "0555000003" });
    const result = await customerService.list({ prisma: db as never }, { limit: 1, offset: 1 });
    expect(result).toHaveLength(1);
  });
});

describe("customerService.getById", () => {
  it("returns customer by id", async () => {
    const created = await seedCustomer(db);
    const found = await customerService.getById({ prisma: db as never }, created.id);
    expect(found.name).toBe("Ahmed Benali");
  });

  it("throws NotFoundError for non-existent id", async () => {
    await expect(
      customerService.getById({ prisma: db as never }, "nonexistent123456789012345"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("customerService.getByPhone", () => {
  it("returns customer by phone", async () => {
    await seedCustomer(db, { phone: "0555111222" });
    const found = await customerService.getByPhone({ prisma: db as never }, "0555111222");
    expect(found).not.toBeNull();
    expect(found!.phone).toBe("0555111222");
  });

  it("returns null for non-existent phone", async () => {
    const found = await customerService.getByPhone({ prisma: db as never }, "0555999999");
    expect(found).toBeNull();
  });
});

describe("customerService.create", () => {
  it("creates a customer with valid input", async () => {
    const created = await customerService.create({ prisma: db as never }, {
      name: "Fatima Zohra",
      phone: "0666123456",
      wilaya: "Oran",
      commune: "Centre",
      address: "456 Rue Larbi Ben Mhidi",
    });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Fatima Zohra");
    expect(created.phone).toBe("0666123456");
  });

  it("rejects invalid phone format", async () => {
    await expect(
      customerService.create({ prisma: db as never }, { name: "Test", phone: "12345" }),
    ).rejects.toThrow();
  });

  it("rejects duplicate phone", async () => {
    await seedCustomer(db, { phone: "0555111222" });
    await expect(
      customerService.create({ prisma: db as never }, { name: "Dup", phone: "0555111222" }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects empty name", async () => {
    await expect(
      customerService.create({ prisma: db as never }, { name: "", phone: "0555111222" }),
    ).rejects.toThrow();
  });
});

describe("customerService.update", () => {
  it("updates customer name", async () => {
    const created = await seedCustomer(db);
    const updated = await customerService.update({ prisma: db as never }, created.id, { name: "Updated Name" });
    expect(updated.name).toBe("Updated Name");
  });

  it("rejects phone conflict with another customer", async () => {
    const c1 = await seedCustomer(db, { phone: "0555111222" });
    await seedCustomer(db, { phone: "0555111333" });
    await expect(
      customerService.update({ prisma: db as never }, c1.id, { phone: "0555111333" }),
    ).rejects.toThrow(ConflictError);
  });

  it("allows updating to same phone (no conflict)", async () => {
    const c1 = await seedCustomer(db, { phone: "0555111222" });
    const updated = await customerService.update({ prisma: db as never }, c1.id, { phone: "0555111222" });
    expect(updated.phone).toBe("0555111222");
  });
});

describe("customerService.delete", () => {
  it("soft-deletes a customer with no orders", async () => {
    const created = await seedCustomer(db);
    await customerService.delete({ prisma: db as never }, created.id);
    // Soft-delete: row still exists but has deletedAt set
    const found = await db.customer.findUnique({ where: { id: created.id } });
    expect(found).not.toBeNull();
    expect(found?.deletedAt).not.toBeNull();
    // And is excluded from normal list queries
    const inList = await customerService.list({ prisma: db as never });
    expect(inList.find((c) => c.id === created.id)).toBeUndefined();
  });

  it("prevents deleting a customer with orders", async () => {
    const created = await seedCustomer(db);
    // Create an order for this customer
    await db.order.create({
      data: {
        orderNumber: "ORD-0001",
        status: "draft",
        customerId: created.id,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123",
        phone: "0555123456",
        source: "manual",
      },
    });
    await expect(
      customerService.delete({ prisma: db as never }, created.id),
    ).rejects.toThrow(ConflictError);
  });
});

describe("customerService.incrementStats", () => {
  it("increments orderCount + totalSpent", async () => {
    const created = await seedCustomer(db);
    await customerService.incrementStats({ prisma: db as never }, created.id, 2500);
    const updated = await db.customer.findUnique({ where: { id: created.id } });
    expect(updated!.orderCount).toBe(1);
    expect(updated!.totalSpent).toBe(2500);
  });
});
