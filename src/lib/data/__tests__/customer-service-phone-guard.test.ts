/**
 * S03c-14: Customer.phone is unique INCLUDING soft-deleted rows. Creating (or
 * importing) a customer onto a deleted customer's number used to reach the
 * database and fail as a raw unique violation; a phone change did the same.
 * These tests use a stub Prisma client (no database), so they also run in the
 * scratch runner.
 */
import { describe, it, expect, vi } from "vitest";

import { customerService } from "../customer-service";
import { ConflictError } from "@/types/errors";

const PHONE = "0555123456";
const input = { name: "Amine", phone: PHONE };

type Where = { phone?: string; deletedAt?: null | { not: null }; id?: { not: string } };

function stubPrisma(opts: {
  active?: unknown;
  deleted?: unknown;
  createError?: unknown;
  updateError?: unknown;
}) {
  const findFirst = vi.fn(async ({ where }: { where: Where }) => {
    if (where.deletedAt === null) return opts.active ?? null;
    if (where.deletedAt && "not" in where.deletedAt) return opts.deleted ?? null;
    return null;
  });
  const create = vi.fn(async ({ data }: { data: unknown }) => {
    if (opts.createError) throw opts.createError;
    return { id: "c1", ...(data as object) };
  });
  const update = vi.fn(async ({ data }: { data: unknown }) => {
    if (opts.updateError) throw opts.updateError;
    return { id: "c1", ...(data as object) };
  });
  return { customer: { findFirst, create, update }, spies: { findFirst, create, update } };
}

function uniqueViolation() {
  return Object.assign(
    new Error("Invalid `prisma.customer.create()` invocation: Unique constraint failed on the fields: (`phone`)"),
    { code: "P2002" },
  );
}

describe("customerService.create with a soft-deleted twin (S03c-14)", () => {
  it("refuses with a constant, coded 409 and never reaches create", async () => {
    const prisma = stubPrisma({ deleted: { id: "old" } });
    const error = await customerService
      .create({ prisma: prisma as never }, input)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "CUSTOMER_PHONE_DELETED", statusCode: 409 });
    expect((error as Error).message).not.toContain(PHONE);
    expect(prisma.spies.create).not.toHaveBeenCalled();
  });

  it("still reports an active duplicate as a conflict", async () => {
    const prisma = stubPrisma({ active: { id: "live" } });
    await expect(customerService.create({ prisma: prisma as never }, input)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(prisma.spies.create).not.toHaveBeenCalled();
  });

  it("creates normally when the phone is free", async () => {
    const prisma = stubPrisma({});
    const created = await customerService.create({ prisma: prisma as never }, input);
    expect(created).toMatchObject({ name: "Amine", phone: PHONE });
    expect(prisma.spies.create).toHaveBeenCalledTimes(1);
  });

  it("maps a raced unique violation to a constant conflict without driver text", async () => {
    const prisma = stubPrisma({ createError: uniqueViolation() });
    const error = await customerService
      .create({ prisma: prisma as never }, input)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ code: "CONFLICT", statusCode: 409 });
    expect((error as Error).message).not.toMatch(/unique constraint|prisma/i);
  });
});

describe("customerService.update phone change (S03c-14)", () => {
  it("refuses a phone that belongs to a deleted customer", async () => {
    const prisma = stubPrisma({ deleted: { id: "old" } });
    const error = await customerService
      .update({ prisma: prisma as never }, "c1", { phone: PHONE })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "CUSTOMER_PHONE_DELETED", statusCode: 409 });
    expect(prisma.spies.update).not.toHaveBeenCalled();
  });

  it("maps a raced unique violation to a constant conflict", async () => {
    const prisma = stubPrisma({ updateError: uniqueViolation() });
    const error = await customerService
      .update({ prisma: prisma as never }, "c1", { phone: PHONE })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).not.toMatch(/unique constraint|prisma/i);
  });

  it("does not look for a deleted twin when the phone is not being changed", async () => {
    const prisma = stubPrisma({ deleted: { id: "old" } });
    await customerService.update({ prisma: prisma as never }, "c1", { name: "Karim" });
    expect(prisma.spies.findFirst).not.toHaveBeenCalled();
    expect(prisma.spies.update).toHaveBeenCalledTimes(1);
  });
});
