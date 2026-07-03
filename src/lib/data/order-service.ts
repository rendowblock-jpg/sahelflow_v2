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
import { withServiceError, nextOrderNumber } from "./service-base";
import { dispatchTrigger, type TriggerEvent } from "@/lib/automations/engine";
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
      where: { deletedAt: null, ...(opts?.status ? { status: opts.status } : {}) },
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

      // Generate order number atomically (D-005/T-011: was racy count()+1)
      const orderNumber = await nextOrderNumber(ctx.prisma);

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
                productVariantId: item.productVariantId ?? null,
                productName: item.productName,
                productVariantName: item.productVariantName ?? null,
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

      // Fire automation trigger (fire-and-forget — never blocks order creation)
      void dispatchTrigger("order.created" as TriggerEvent, {
        orderId: row.id,
        orderNumber: row.orderNumber,
        customerId: row.customerId,
        customerName: customer.name,
        customerPhone: customer.phone,
        totalPrice: row.totalPrice,
        wilaya: row.wilaya,
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

      // Fire automation trigger (fire-and-forget — never blocks status update)
      void dispatchTrigger(`order.${to}` as TriggerEvent, {
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        customerId: updated.customerId,
        totalPrice: updated.totalPrice,
        wilaya: updated.wilaya,
        phone: updated.phone,
      });

      return toDomain(updated as unknown as Record<string, unknown>);
    }, "Order");
  },

  async update(ctx: ServiceContext, id: string, input: unknown): Promise<Order> {
    return withServiceError(async () => {
      const data = updateOrderSchema.parse(input);

      // SEC-016/CODE-003: wrap item sync + order update in a single $transaction
      // so a failure on any item operation rolls back all changes.
      return ctx.prisma.$transaction(async (tx) => {
        if (data.items) {
          const existing = await tx.orderItem.findMany({ where: { orderId: id } });
          const incomingIds = data.items.filter(i => i.id).map(i => i.id);
          const toDelete = existing.filter(e => !incomingIds.includes(e.id)).map(e => e.id);

          await Promise.all([
            ...toDelete.map(itemId =>
              tx.orderItem.delete({ where: { id: itemId } })
            ),
            ...data.items.map((item) => {
              const payload = {
                productName: item.productName,
                productVariantName: item.productVariantName ?? null,
                productId: item.productId ?? null,
                productVariantId: item.productVariantId ?? null,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.total,
              };
              if (item.id) {
                return tx.orderItem.update({ where: { id: item.id }, data: payload });
              }
              return tx.orderItem.create({
                data: { ...payload, orderId: id },
              });
            }),
          ]);
        }

        const row = await tx.order.update({
          where: { id },
          data: {
            notes: data.notes,
            deliveryCost: data.deliveryCost,
            address: data.address,
            wilaya: data.wilaya,
            commune: data.commune,
            phone: data.phone,
            totalPrice: data.totalPrice,
          },
          include: { items: true },
        });
        return toDomain(row as unknown as Record<string, unknown>);
      });
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
