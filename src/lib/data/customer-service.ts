/**
 * Customer service — CRUD + risk score + order history aggregation.
 */
import type { Customer } from "@/types/domain";
import { NotFoundError, ConflictError } from "@/types/errors";
import { createCustomerSchema, updateCustomerSchema } from "@/lib/validation";
import type { ServiceContext } from "./service-base";
import { withServiceError } from "./service-base";

function toDomain(row: Record<string, unknown>): Customer {
  return row as unknown as Customer;
}

export const customerService = {
  async list(ctx: ServiceContext, opts?: { limit?: number; offset?: number }): Promise<Customer[]> {
    const rows = await ctx.prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
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
          where: { customerId: { in: customerIds } },
          _count: true,
        }),
        ctx.prisma.order.groupBy({
          by: ["customerId"],
          where: { customerId: { in: customerIds }, status: { not: "cancelled" } },
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
      const row = await ctx.prisma.customer.findUnique({ where: { id } });
      if (!row) throw new NotFoundError("Customer", id);
      return toDomain(row as unknown as Record<string, unknown>);
    }, "Customer");
  },

  async getByPhone(ctx: ServiceContext, phone: string): Promise<Customer | null> {
    const row = await ctx.prisma.customer.findUnique({ where: { phone } });
    return row ? toDomain(row as unknown as Record<string, unknown>) : null;
  },

  async create(ctx: ServiceContext, input: unknown): Promise<Customer> {
    return withServiceError(async () => {
      const data = createCustomerSchema.parse(input);

      // Check for existing customer with same phone
      const existing = await ctx.prisma.customer.findUnique({ where: { phone: data.phone } });
      if (existing) {
        throw new ConflictError(`Customer with phone ${data.phone} already exists`);
      }

      const row = await ctx.prisma.customer.create({ data });
      return toDomain(row as unknown as Record<string, unknown>);
    }, "Customer");
  },

  async update(ctx: ServiceContext, id: string, input: unknown): Promise<Customer> {
    return withServiceError(async () => {
      const data = updateCustomerSchema.parse(input);

      // If phone is being updated, check for conflict
      if (data.phone) {
        const conflict = await ctx.prisma.customer.findUnique({ where: { phone: data.phone } });
        if (conflict && conflict.id !== id) {
          throw new ConflictError(`Phone ${data.phone} already used by another customer`);
        }
      }

      const row = await ctx.prisma.customer.update({ where: { id }, data });
      return toDomain(row as unknown as Record<string, unknown>);
    }, "Customer");
  },

  async delete(ctx: ServiceContext, id: string): Promise<void> {
    return withServiceError(async () => {
      // Check for existing orders (don't delete customers with order history)
      const orderCount = await ctx.prisma.order.count({ where: { customerId: id } });
      if (orderCount > 0) {
        throw new ConflictError(`Cannot delete customer with ${orderCount} orders`);
      }
      await ctx.prisma.customer.delete({ where: { id } });
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
