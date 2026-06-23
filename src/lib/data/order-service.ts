/**
 * Order service — CRUD + lifecycle management (the AAA surface).
 *
 * This is part of the Magic Moment flow (design system Section 12.3):
 *   message → AI extraction → draft order → confirm → ship → deliver
 *
 * Status transitions are enforced via the order state machine
 * (src/lib/order-transitions.ts). Stock side-effects + customer stats
 * updates happen on transitions.
 */
import type { Order, OrderStatus } from "@/types/domain";
import { NotFoundError } from "@/types/errors";
import { createOrderSchema, updateOrderSchema } from "@/lib/validation";
import {
  assertCanTransition,
  triggersStockDeduction,
  triggersStockRestoration,
  triggersCustomerStatsUpdate,
} from "@/lib/order-transitions";
import type { ServiceContext } from "./service-base";
import { withServiceError, generateOrderNumber } from "./service-base";

function toDomain(row: Record<string, unknown>): Order {
  return row as unknown as Order;
}

export const orderService = {
  async list(ctx: ServiceContext, opts?: {
    limit?: number;
    offset?: number;
    status?: OrderStatus;
  }): Promise<Order[]> {
    const rows = await ctx.prisma.order.findMany({
      where: opts?.status ? { status: opts.status } : undefined,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
    });
    return rows.map((r) => toDomain(r as unknown as Record<string, unknown>));
  },

  async getById(ctx: ServiceContext, id: string): Promise<Order> {
    return withServiceError(async () => {
      const row = await ctx.prisma.order.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!row) throw new NotFoundError("Order", id);
      return toDomain(row as unknown as Record<string, unknown>);
    }, "Order");
  },

  async getByOrderNumber(ctx: ServiceContext, orderNumber: string): Promise<Order | null> {
    const row = await ctx.prisma.order.findUnique({
      where: { orderNumber },
      include: { items: true },
    });
    return row ? toDomain(row as unknown as Record<string, unknown>) : null;
  },

  /**
   * Create a new order (draft status by default).
   * Calculates totalPrice from items + deliveryCost.
   * Does NOT deduct stock (that happens on confirmation).
   */
  async create(ctx: ServiceContext, input: unknown): Promise<Order> {
    return withServiceError(async () => {
      const data = createOrderSchema.parse(input);

      // Verify customer exists
      const customer = await ctx.prisma.customer.findUnique({ where: { id: data.customerId } });
      if (!customer) throw new NotFoundError("Customer", data.customerId);

      // Calculate total
      const itemsTotal = data.items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      const totalPrice = itemsTotal + (data.deliveryCost ?? 0);

      // Generate order number (count existing + 1)
      const existingCount = await ctx.prisma.order.count();
      const orderNumber = generateOrderNumber(existingCount + 1);

      // Create order + items in a transaction
      const row = await ctx.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNumber,
            status: "draft",
            customerId: data.customerId,
            totalPrice,
            deliveryCost: data.deliveryCost ?? null,
            wilaya: data.wilaya,
            commune: data.commune,
            address: data.address,
            phone: data.phone,
            source: data.source,
            sourceMetadata: data.sourceMetadata ? JSON.stringify(data.sourceMetadata) : null,
            notes: data.notes ?? null,
            items: {
              create: data.items.map((item) => ({
                productId: item.productId ?? null,
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.unitPrice * item.quantity,
              })),
            },
          },
          include: { items: true },
        });
        return order;
      });

      return toDomain(row as unknown as Record<string, unknown>);
    }, "Order");
  },

  /**
   * Transition an order to a new status.
   * Enforces the state machine + triggers stock/customer side effects.
   */
  async updateStatus(
    ctx: ServiceContext,
    id: string,
    to: OrderStatus,
  ): Promise<Order> {
    return withServiceError(async () => {
      const order = await ctx.prisma.order.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!order) throw new NotFoundError("Order", id);

      const from = order.status as OrderStatus;

      // Enforce state machine
      assertCanTransition(from, to);

      // No-op for same-status
      if (from === to) {
        return toDomain(order as unknown as Record<string, unknown>);
      }

      // Execute transition + side effects in a transaction
      const updated = await ctx.prisma.$transaction(async (tx) => {
        // Stock deduction (confirmed from non-confirmed)
        if (triggersStockDeduction(from, to)) {
          for (const item of order.items) {
            if (item.productId) {
              await tx.product.update({
                where: { id: item.productId },
                data: { stock: { decrement: item.quantity } },
              });
            }
          }
        }

        // Stock restoration (returned/cancelled/refused from confirmed/shipped)
        if (triggersStockRestoration(from, to)) {
          for (const item of order.items) {
            if (item.productId) {
              await tx.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
              });
            }
          }
        }

        // Customer stats update (delivered from non-delivered)
        if (triggersCustomerStatsUpdate(from, to)) {
          await tx.customer.update({
            where: { id: order.customerId },
            data: {
              orderCount: { increment: 1 },
              totalSpent: { increment: order.totalPrice },
            },
          });
        }

        // Update order status + timestamp fields
        const data: Record<string, unknown> = { status: to };
        if (to === "confirmed" && !order.confirmedAt) data.confirmedAt = new Date();
        if (to === "shipped" && !order.shippedAt) data.shippedAt = new Date();
        if (to === "delivered" && !order.deliveredAt) data.deliveredAt = new Date();

        return tx.order.update({
          where: { id },
          data,
          include: { items: true },
        });
      });

      return toDomain(updated as unknown as Record<string, unknown>);
    }, "Order");
  },

  async update(ctx: ServiceContext, id: string, input: unknown): Promise<Order> {
    return withServiceError(async () => {
      // Validate input — only notes + deliveryCost + address are updatable
      // via this method (items + status have their own dedicated methods:
      // `updateStatus`, item add/remove). Zod rejects unknown keys + invalid
      // types instead of silently ignoring them (D-020).
      const data = updateOrderSchema.parse(input);
      const row = await ctx.prisma.order.update({
        where: { id },
        data: {
          notes: data.notes,
          deliveryCost: data.deliveryCost,
          address: data.address,
        },
        include: { items: true },
      });
      return toDomain(row as unknown as Record<string, unknown>);
    }, "Order");
  },

  /** Count orders by status (for dashboard stats). */
  async countByStatus(ctx: ServiceContext): Promise<Record<OrderStatus, number>> {
    const groups = await ctx.prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const result = {} as Record<OrderStatus, number>;
    for (const g of groups) {
      result[g.status as OrderStatus] = g._count._all;
    }
    return result;
  },

  /** Get orders created today (for dashboard). */
  async listToday(ctx: ServiceContext): Promise<Order[]> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const rows = await ctx.prisma.order.findMany({
      where: { createdAt: { gte: startOfDay } },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => toDomain(r as unknown as Record<string, unknown>));
  },
};
