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
  triggersCustomerStatsReversal,
} from "@/lib/order-transitions";
import type { ServiceContext } from "./service-base";
import {
  recordOrderChangeInTx,
  recordStatusChangeInTx,
  type OrderChangeTransactionClient,
} from "@/lib/data/order-change-service";
import { withServiceError, nextOrderNumber } from "./service-base";
import {
  dispatchTrigger,
  detectLowStock,
  dispatchLowStock,
  type TriggerEvent,
  type TriggerPayload,
} from "@/lib/automations/engine";

function toDomain(row: Record<string, unknown>): Order {
  return row as unknown as Order;
}

type LowStockProduct = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
};

export interface OrderStatusTransitionEffects {
  order: Order;
  changed: boolean;
  lowStockProducts: LowStockProduct[];
}

async function updateStatusInTransaction(
  tx: OrderChangeTransactionClient,
  id: string,
  to: OrderStatus,
  actor: string,
): Promise<OrderStatusTransitionEffects> {
  const order = await tx.order.findFirst({
    where: { id, deletedAt: null },
    include: { items: true },
  });
  if (!order) throw new NotFoundError("Order", id);

  const from = order.status as OrderStatus;
  assertCanTransition(from, to);

  if (from === to) {
    return {
      order: toDomain(order as unknown as Record<string, unknown>),
      changed: false,
      lowStockProducts: [],
    };
  }

  const lowStockProducts: LowStockProduct[] = [];

  if (triggersStockDeduction(from, to)) {
    for (const item of order.items) {
      if (item.productId) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
        const lowStockInfo = await detectLowStock(tx, item.productId);
        if (lowStockInfo) lowStockProducts.push(lowStockInfo);
      }
    }
  }

  if (triggersStockRestoration(from, to)) {
    for (const item of order.items) {
      if (item.productId) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
        const lowStockInfo = await detectLowStock(tx, item.productId);
        if (lowStockInfo) lowStockProducts.push(lowStockInfo);
      }
    }
  }

  if (triggersCustomerStatsUpdate(from, to)) {
    await tx.customer.update({
      where: { id: order.customerId },
      data: {
        orderCount: { increment: 1 },
        totalSpent: { increment: order.totalPrice },
      },
    });
  }

  if (triggersCustomerStatsReversal(from, to)) {
    await tx.customer.update({
      where: { id: order.customerId },
      data: {
        orderCount: { decrement: 1 },
        totalSpent: { decrement: order.totalPrice },
      },
    });
  }

  const data: Record<string, unknown> = { status: to };
  if (to === "confirmed" && !order.confirmedAt) data.confirmedAt = new Date();
  if (to === "shipped" && !order.shippedAt) data.shippedAt = new Date();
  if (to === "delivered" && !order.deliveredAt) data.deliveredAt = new Date();

  const updated = await tx.order.update({
    where: { id },
    data,
    include: { items: true },
  });

  await recordStatusChangeInTx(tx, id, from, to, actor);

  return {
    order: toDomain(updated as unknown as Record<string, unknown>),
    changed: true,
    lowStockProducts,
  };
}

function dispatchCommittedStatusTransition(
  ctx: ServiceContext,
  effects: OrderStatusTransitionEffects,
): void {
  if (!effects.changed) return;

  for (const product of effects.lowStockProducts) {
    void dispatchLowStock(ctx, product);
  }

  const order = effects.order;
  void dispatchTrigger(ctx, `order.${order.status}` as TriggerEvent, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    totalPrice: order.totalPrice,
    wilaya: order.wilaya,
    phone: order.phone,
  });
}

type OrderCreateOptions =
  | {
      tx: OrderChangeTransactionClient;
      afterCommit: (effect: () => void) => void;
    }
  | {
      tx?: undefined;
      afterCommit?: undefined;
    };

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
      const row = await ctx.prisma.order.findFirst({
        where: { id, deletedAt: null },
        include: { items: true },
      });
      if (!row) throw new NotFoundError("Order", id);
      return toDomain(row as unknown as Record<string, unknown>);
    }, "Order");
  },

  async getByOrderNumber(ctx: ServiceContext, orderNumber: string): Promise<Order | null> {
    const row = await ctx.prisma.order.findFirst({
      where: { orderNumber, deletedAt: null },
      include: { items: true },
    });
    return row ? toDomain(row as unknown as Record<string, unknown>) : null;
  },

  /**
   * Create a new order (draft status by default).
   * Calculates totalPrice from items + deliveryCost.
   * Does NOT deduct stock (that happens on confirmation).
   *
   * Phase 1 bug 1.3: accepts an optional \`tx\` so the 4 order-creation paths
   * (storefront/submit, import/orders, ecommerce sync-engine, AI core-tools)
   * can route through this canonical service instead of bypassing it. This
   * ensures every created order gets:
   *   - an OrderChange "created" ledger entry (powers the order timeline)
   *   - the \`order.created\` automation trigger (so "new order → WhatsApp
   *     notify" automations fire for storefront/import/sync/AI orders, not
   *     just manual UI orders)
   * If \`opts.tx\` is provided, the order.create + ledger entry participate in
   * the caller's $transaction (atomic with the caller's customer-find-or-
   * create, etc.). Callers that own the transaction must collect the supplied
   * post-commit effect and invoke it only after `$transaction` resolves.
   */
  async create(
    ctx: ServiceContext,
    input: unknown,
    opts?: OrderCreateOptions,
  ): Promise<Order> {
    return withServiceError(async () => {
      const data = createOrderSchema.parse(input);

      if (opts?.tx && !opts.afterCommit) {
        throw new Error("Caller-owned order transactions require an afterCommit collector");
      }

      // Pick the client: caller's tx if provided, else the context's prisma.
      const client = opts?.tx ?? ctx.prisma;

      // Verify customer exists
      const customer = await client.customer.findFirst({ where: { id: data.customerId, deletedAt: null } });
      if (!customer) throw new NotFoundError("Customer", data.customerId);

      // Calculate total
      const itemsTotal = data.items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      const totalPrice = itemsTotal + (data.deliveryCost ?? 0);

      // Generate order number atomically (D-005/T-011: was racy count()+1).
      // Phase 1 bug 1.3: caller can override the prefix (e-commerce sync uses
      // "SYNC-SHOPIFY" etc. so synced orders are distinguishable).
      const orderNumber = await nextOrderNumber(
        client as ServiceContext["prisma"],
        data.orderNumberPrefix ?? "ORD",
      );

      // The order.create payload — shared between the tx + non-tx paths.
      const orderCreateData = {
        orderNumber,
        status: data.status ?? "draft",
        customerId: data.customerId,
        totalPrice,
        deliveryCost: data.deliveryCost ?? null,
        wilaya: data.wilaya,
        commune: data.commune,
        address: data.address,
        phone: data.phone,
        source: data.source,
        sourceOrderId: data.sourceOrderId ?? null,
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
      } as const;

      // Create order + items — either inside the caller's tx, or in a new tx.
      let row;
      if (opts?.tx) {
        row = await opts.tx.order.create({ data: orderCreateData, include: { items: true } });
        await recordOrderChangeInTx(opts.tx, {
          orderId: row.id,
          actionType: "created",
          payload: { orderNumber: row.orderNumber, itemCount: row.items.length, totalPrice },
        });
      } else {
        row = await ctx.prisma.$transaction(async (tx) => {
          const created = await tx.order.create({ data: orderCreateData, include: { items: true } });
          await recordOrderChangeInTx(tx, {
            orderId: created.id,
            actionType: "created",
            payload: { orderNumber: created.orderNumber, itemCount: created.items.length, totalPrice },
          });
          return created;
        });
      }

      const triggerPayload: TriggerPayload = {
        orderId: row.id,
        orderNumber: row.orderNumber,
        customerId: row.customerId,
        customerName: customer.name,
        customerPhone: customer.phone,
        totalPrice: row.totalPrice,
        wilaya: row.wilaya,
      };

      const dispatchCreated = () => {
        void dispatchTrigger(ctx, "order.created" as TriggerEvent, triggerPayload);
      };
      if (opts?.tx) {
        opts.afterCommit(dispatchCreated);
      } else {
        dispatchCreated();
      }

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
    /** AI-M4: caller can specify the actor for the OrderChange ledger
     *  (default "user"). AI tools pass "ai" so AI-initiated mutations are
     *  distinguishable from human ones in the order timeline. */
    opts?: { actor?: string },
  ): Promise<Order> {
    return withServiceError(async () => {
      const effects = await ctx.prisma.$transaction((tx) =>
        updateStatusInTransaction(tx, id, to, opts?.actor ?? "user"),
      );
      dispatchCommittedStatusTransition(ctx, effects);
      return effects.order;
    }, "Order");
  },

  /**
   * Apply an order transition inside a caller-owned transaction. The caller
   * must invoke `dispatchStatusTransition` only after that transaction commits.
   */
  async updateStatusInTx(
    tx: OrderChangeTransactionClient,
    id: string,
    to: OrderStatus,
    opts?: { actor?: string },
  ): Promise<OrderStatusTransitionEffects> {
    return updateStatusInTransaction(tx, id, to, opts?.actor ?? "user");
  },

  dispatchStatusTransition(
    ctx: ServiceContext,
    effects: OrderStatusTransitionEffects,
  ): void {
    dispatchCommittedStatusTransition(ctx, effects);
  },

  async update(ctx: ServiceContext, id: string, input: unknown): Promise<Order> {
    return withServiceError(async () => {
      const data = updateOrderSchema.parse(input);

      // SEC-016/CODE-003: wrap item sync + order update in a single $transaction
      // so a failure on any item operation rolls back all changes.
      const updated = await ctx.prisma.$transaction(async (tx) => {
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
        await recordOrderChangeInTx(tx, {
          orderId: id,
          actionType: "edit",
          payload: { fields: Object.keys(data) },
        });
        return toDomain(row as unknown as Record<string, unknown>);
      });
      return updated;
    }, "Order");
  },

  /** Count orders by status (for dashboard stats). */
  async countByStatus(ctx: ServiceContext): Promise<Record<OrderStatus, number>> {
    const groups = await ctx.prisma.order.groupBy({
      by: ["status"],
      where: { deletedAt: null },
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
      where: { createdAt: { gte: startOfDay }, deletedAt: null },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => toDomain(r as unknown as Record<string, unknown>));
  },
};
