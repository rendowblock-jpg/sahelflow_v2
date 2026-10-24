/**
 * Customer service — CRUD + risk score + order history aggregation.
 */
import type { Customer } from "@/types/domain";
import { NotFoundError, ConflictError, SahelFlowError } from "@/types/errors";
import { createCustomerSchema, updateCustomerSchema } from "@/lib/validation";
import type { ServiceContext } from "./service-base";
import { withServiceError } from "./service-base";

function toDomain(row: Record<string, unknown>): Customer {
  return row as unknown as Customer;
}

/** Prisma unique-constraint violation (a concurrent create, or a soft-deleted twin). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/**
 * S03c-14: Customer.phone is unique INCLUDING soft-deleted rows. A create or a
 * phone change onto a deleted customer's number used to reach the database and
 * fail as a raw unique violation. Say so explicitly instead, with constant text
 * (no phone number, no driver message). Restoring is a deliberate act, never a
 * side effect of creating or importing a customer.
 */
async function assertPhoneNotOnDeletedCustomer(
  ctx: ServiceContext,
  phone: string,
  exceptId?: string,
): Promise<void> {
  const deleted = await ctx.prisma.customer.findFirst({
    where: {
      phone,
      deletedAt: { not: null },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (deleted) {
    throw new SahelFlowError(
      "This phone number belongs to a previously deleted customer.",
      "CUSTOMER_PHONE_DELETED",
      409,
    );
  }
}

export const customerService = {
  async list(ctx: ServiceContext, opts?: { limit?: number; offset?: number }): Promise<Customer[]> {
    const rows = await ctx.prisma.customer.findMany({
      where: { deletedAt: null },
      // The id breaks a tie on createdAt, so two customers made in the same millisecond keep
      // one fixed order and limit/offset pages never repeat or skip a row.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
    });

    // Compute real order stats via a batch query — don't rely on the cached
    // orderCount/totalSpent columns (which only update on delivery, causing
    // a mismatch with the detail page that computes from all orders).
    const customerIds = rows.map((r) => r.id);
    if (customerIds.length > 0) {
      const [allCounts, revenueSums] = await Promise.all([
        ctx.prisma.order.groupBy({
          by: ["customerId"],
          where: { customerId: { in: customerIds }, deletedAt: null },
          _count: true,
        }),
        ctx.prisma.order.groupBy({
          by: ["customerId"],
          where: { customerId: { in: customerIds }, status: { not: "cancelled" }, deletedAt: null },
          _sum: { totalPrice: true },
        }),
      ]);
      const countMap = new Map(allCounts.map((r) => [r.customerId, r._count]));
      const sumMap = new Map(revenueSums.map((r) => [r.customerId, r._sum.totalPrice ?? 0]));
      for (const row of rows) {
        // Override cached columns with real values (matching the detail page's
        // getStats() definition: totalOrders = all, totalSpent = non-cancelled).
        (row as { orderCount: number }).orderCount = countMap.get(row.id) ?? 0;
        (row as { totalSpent: number }).totalSpent = sumMap.get(row.id) ?? 0;
      }
    }

    return rows.map((r) => toDomain(r as unknown as Record<string, unknown>));
  },

  async getById(ctx: ServiceContext, id: string): Promise<Customer> {
    return withServiceError(async () => {
      const row = await ctx.prisma.customer.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundError("Customer", id);
      return toDomain(row as unknown as Record<string, unknown>);
    }, "Customer");
  },

  async getByPhone(ctx: ServiceContext, phone: string): Promise<Customer | null> {
    const row = await ctx.prisma.customer.findFirst({ where: { phone, deletedAt: null } });
    return row ? toDomain(row as unknown as Record<string, unknown>) : null;
  },

  async create(ctx: ServiceContext, input: unknown): Promise<Customer> {
    return withServiceError(async () => {
      const data = createCustomerSchema.parse(input);

      // Check for existing customer with same phone
      const existing = await ctx.prisma.customer.findFirst({ where: { phone: data.phone, deletedAt: null } });
      if (existing) {
        throw new ConflictError(`Customer with phone ${data.phone} already exists`);
      }

      await assertPhoneNotOnDeletedCustomer(ctx, data.phone);

      try {
        const row = await ctx.prisma.customer.create({ data });
        return toDomain(row as unknown as Record<string, unknown>);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictError("A customer with this phone number already exists.");
        }
        throw err;
      }
    }, "Customer");
  },

  async update(ctx: ServiceContext, id: string, input: unknown): Promise<Customer> {
    return withServiceError(async () => {
      const data = updateCustomerSchema.parse(input);

      // If phone is being updated, check for conflict
      if (data.phone) {
        const conflict = await ctx.prisma.customer.findFirst({ where: { phone: data.phone, deletedAt: null, id: { not: id } } });
        if (conflict) {
          throw new ConflictError(`Phone ${data.phone} already used by another customer`);
        }
        await assertPhoneNotOnDeletedCustomer(ctx, data.phone, id);
      }

      try {
        const row = await ctx.prisma.customer.update({ where: { id }, data });
        return toDomain(row as unknown as Record<string, unknown>);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictError("A customer with this phone number already exists.");
        }
        throw err;
      }
    }, "Customer");
  },

  async delete(ctx: ServiceContext, id: string): Promise<void> {
    return withServiceError(async () => {
      // Check for existing orders (don't delete customers with order history)
      const orderCount = await ctx.prisma.order.count({ where: { customerId: id, deletedAt: null } });
      if (orderCount > 0) {
        throw new ConflictError(`Cannot delete customer with ${orderCount} orders`);
      }
      // Soft-delete (don't hard-delete — preserves referential integrity for historical orders)
      await ctx.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    }, "Customer");
  },

  /** Update customer stats after a delivery (called by order service). */
  async incrementStats(
    ctx: ServiceContext,
    id: string,
    amountSpent: number,
  ): Promise<void> {
    await ctx.prisma.customer.update({
      where: { id },
      data: {
        orderCount: { increment: 1 },
        totalSpent: { increment: amountSpent },
      },
    });
  },
};
