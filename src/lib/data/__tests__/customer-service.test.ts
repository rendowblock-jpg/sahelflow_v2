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
    const first = await seedCustomer(db, { name: "First", phone: "0555000001" });
    const second = await seedCustomer(db, { name: "Second", phone: "0555000002" });
    // Explicit times: two writes can land in the same millisecond and then neither order is "newest".
    await db.customer.update({ where: { id: first.id }, data: { createdAt: new Date("2026-10-01T10:00:00.000Z") } });
    await db.customer.update({ where: { id: second.id }, data: { createdAt: new Date("2026-10-01T10:00:01.000Z") } });
    const result = await customerService.list({ prisma: db as never });
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("Second");
  });

  it("breaks a tie on createdAt by id, newest id first, so the order and the pages never depend on the database's scan order", async () => {
    // Three customers written in the OPPOSITE order of their ids, all in the same millisecond.
    const moment = new Date("2026-10-01T10:00:00.000Z");
    for (const [id, phone] of [["cust-a", "0555000011"], ["cust-b", "0555000012"], ["cust-c", "0555000013"]] as const) {
      const row = await seedCustomer(db, { name: id, phone });
      await db.customer.update({ where: { id: row.id }, data: { id, createdAt: moment } });
    }
    const all = await customerService.list({ prisma: db as never });
    expect(all.map((row) => row.id)).toEqual(["cust-c", "cust-b", "cust-a"]);
    const first = await customerService.list({ prisma: db as never }, { limit: 2, offset: 0 });
    const second = await customerService.list({ prisma: db as never }, { limit: 2, offset: 2 });
    expect([...first, ...second].map((row) => row.id)).toEqual(["cust-c", "cust-b", "cust-a"]);
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

// S03c-15: create, update and delete are audited with ids and field names only,
// and the delete (and the others) commit together with their audit row.
describe("customerService audit", () => {
  const actor = "person:owner-1";
  const phone = "0661998877";
  const address = "88 Rue Tres Secrete";
  const ctx = () => ({ prisma: db as never });
  const rowsFor = (entityId: string) =>
    db.auditLog.findMany({ where: { entity: "customer", entityId } });
  // The trigger lives in the shared test database file, so always remove it again.
  const withAuditDown = async (run: () => Promise<void>) => {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS audit_down`);
    await db.$executeRawUnsafe(
      `CREATE TRIGGER audit_down BEFORE INSERT ON "AuditLog" BEGIN SELECT RAISE(ABORT, 'audit down'); END;`,
    );
    try {
      await run();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS audit_down`);
    }
  };

  it("audits a create with the actor and the field names, never the phone or address", async () => {
    const created = await customerService.create(
      ctx(),
      { name: "Nadia Test", phone, wilaya: "Oran", commune: "Centre", address },
      { auditActor: actor },
    );
    const rows = await rowsFor(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "customer.created", actor });
    const detail = JSON.stringify(rows[0]);
    expect(JSON.parse(rows[0]!.metadata!).fields).toEqual(
      expect.arrayContaining(["name", "phone", "address"]),
    );
    expect(detail).not.toContain(phone);
    expect(detail).not.toContain("Tres Secrete");
  });

  it("audits an update with the changed field names only", async () => {
    const created = await seedCustomer(db);
    await customerService.update(
      ctx(),
      created.id,
      { phone, address },
      { auditActor: actor },
    );
    const rows = await rowsFor(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "customer.updated", actor });
    expect(JSON.parse(rows[0]!.metadata!).fields).toEqual(["address", "phone"]);
    const detail = JSON.stringify(rows[0]);
    expect(detail).not.toContain(phone);
    expect(detail).not.toContain("Tres Secrete");
    expect(detail).not.toContain("0555123456");
    expect(detail).not.toContain("Didouche");
  });

  it("audits a delete without the phone or address", async () => {
    const created = await seedCustomer(db);
    await customerService.delete(ctx(), created.id, { auditActor: actor });
    const rows = await rowsFor(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "customer.deleted", actor });
    const detail = JSON.stringify(rows[0]);
    expect(detail).not.toContain("0555123456");
    expect(detail).not.toContain("Didouche");
  });

  it("rolls the delete back when its audit row cannot be written", async () => {
    const created = await seedCustomer(db);
    await withAuditDown(() =>
      expect(customerService.delete(ctx(), created.id, { auditActor: actor })).rejects.toThrow(),
    );
    const found = await db.customer.findUnique({ where: { id: created.id } });
    expect(found?.deletedAt).toBeNull();
  });

  it("rolls the update back when its audit row cannot be written", async () => {
    const created = await seedCustomer(db);
    await withAuditDown(() =>
      expect(
        customerService.update(ctx(), created.id, { name: "Renamed" }, { auditActor: actor }),
      ).rejects.toThrow(),
    );
    const found = await db.customer.findUnique({ where: { id: created.id } });
    expect(found?.name).toBe("Ahmed Benali");
  });

  it("does not create the customer when the audit row cannot be written", async () => {
    await withAuditDown(() =>
      expect(
        customerService.create(ctx(), { name: "Nadia Test", phone }, { auditActor: actor }),
      ).rejects.toThrow(),
    );
    expect(await db.customer.findFirst({ where: { name: "Nadia Test" } })).toBeNull();
  });

  it("still works without an actor (bulk import has none yet) and writes no audit row", async () => {
    const created = await customerService.create(ctx(), { name: "Imported", phone });
    expect(await rowsFor(created.id)).toHaveLength(0);
  });
});
