import type { Order, OrderStatus } from "@/types/domain";
import { NotFoundError, SahelFlowError } from "@/types/errors";
import { createOrderSchema, updateOrderSchema } from "@/lib/validation";
import {
  assertCanTransition,
  triggersCustomerStatsReversal,
  triggersCustomerStatsUpdate,
  triggersStockDeduction,
  triggersStockRestoration,
} from "@/lib/order-transitions";
import {
  recordOrderChangeInTx,
  recordStatusChangeInTx,
  type OrderChangeTransactionClient,
} from "@/lib/data/order-change-service";
import {
  dispatchLowStock,
  dispatchTrigger,
  detectLowStock,
  type TriggerEvent,
  type TriggerPayload,
} from "@/lib/automations/engine";
import { scheduleAutomationOutbox } from "@/lib/business-truth/outbox-worker";
import {
  executeManualOrderDecision,
  hasCanonicalActiveReservation,
} from "@/lib/orders/manual-confirmation";
import {
  isTrustedManualOrderAuthority,
  TRUSTED_MANUAL_ORDER_AUTHORITY,
} from "@/lib/orders/manual-order-authority";
import type { ServiceContext } from "./service-base";
import { nextOrderNumber, withServiceError } from "./service-base";

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

function canonicalFollowupError(orderId: string): SahelFlowError {
  return new SahelFlowError(
    `Order '${orderId}' has an active canonical reservation; use the next governed fulfillment command`,
    "CANONICAL_FOLLOWUP_REQUIRED",
    409,
  );
}

function canonicalConfirmationError(): SahelFlowError {
  return new SahelFlowError(
    "Pending manual orders must be confirmed or rejected through the canonical confirmation command",
    "CANONICAL_CONFIRMATION_REQUIRED",
    409,
  );
}

async function restoreLegacyProductStock(
  tx: OrderChangeTransactionClient,
  orderId: string,
  itemId: string,
  productId: string,
  quantity: number,
): Promise<void> {
  const permitKey = `legacy-stock-restore:${orderId}:${itemId}`;
  await tx.$executeRaw`
    INSERT INTO "StockAdjustmentPermit" (
      "permitKey", "productId", "productVariantId", "direction", "createdAt"
    ) VALUES (
      ${permitKey}, ${productId}, NULL, 'increase', CURRENT_TIMESTAMP
    )
  `;

  await tx.product.update({
    where: { id: productId },
    data: { stock: { increment: quantity } },
  });

  const cleared = await tx.$executeRaw`
    DELETE FROM "StockAdjustmentPermit"
    WHERE "permitKey" = ${permitKey}
  `;
  if (cleared !== 1) {
    throw new Error(`Stock restoration permit '${permitKey}' was not cleared`);
  }
}

function adoptedManualMetadata(sourceMetadata: unknown): string {
  let existing: Record<string, unknown> = {};
  if (typeof sourceMetadata === "string") {
    try {
      const parsed = JSON.parse(sourceMetadata) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      existing = {};
    }
  } else if (
    sourceMetadata &&
    typeof sourceMetadata === "object" &&
    !Array.isArray(sourceMetadata)
  ) {
    existing = sourceMetadata as Record<string, unknown>;
  }
  return JSON.stringify({
    ...existing,
    authority: TRUSTED_MANUAL_ORDER_AUTHORITY,
    adoptedFromLegacy: true,
  });
}

async function maybeConfirmMappedHistoricalManualOrder(
  context: ServiceContext,
  id: string,
  to: OrderStatus,
  actor: string,
): Promise<Order | null> {
  if (to !== "confirmed" || actor !== "user") return null;

  const order = await context.prisma.order.findFirst({
    where: { id, deletedAt: null },
    include: { items: true },
  });
  if (!order) throw new NotFoundError("Order", id);
  if (order.status !== "pending" || order.source !== "manual") return null;

  // The frozen Phase 1 contract permits governed adoption only when historical
  // manual rows already carry exact catalog identity. Unmapped imports and
  // ambiguous rows fail closed and require a future reconciliation command.
  if (order.items.length === 0 || order.items.some((item) => !item.productId)) {
    throw canonicalConfirmationError();
  }

  if (!isTrustedManualOrderAuthority(order.source, order.sourceMetadata)) {
    const adopted = await context.prisma.order.updateMany({
      where: {
        id: order.id,
        status: "pending",
        version: order.version,
        source: "manual",
        deletedAt: null,
      },
      data: {
        sourceMetadata: adoptedManualMetadata(order.sourceMetadata),
      },
    });
    if (adopted.count !== 1) {
      throw new SahelFlowError(
        `Order '${order.id}' changed while legacy manual authority was being adopted`,
        "VERSION_CONFLICT",
        409,
      );
    }
  }

  const operationKey = `manual-adoption:${order.id}:v${order.version}`;
  await executeManualOrderDecision(context, {
    orderId: order.id,
    decision: "confirm",
    expectedVersion: order.version,
    idempotencyKey: operationKey,
    correlationId: operationKey,
  });
  scheduleAutomationOutbox(context, { limit: 20 });

  const updated = await context.prisma.order.findFirst({
    where: { id: order.id, deletedAt: null },
    include: { items: true },
  });
  if (!updated) throw new NotFoundError("Order", order.id);
  return toDomain(updated as unknown as Record<string, unknown>);
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
  if (from === to) {
    return {
      order: toDomain(order as unknown as Record<string, unknown>),
      changed: false,
      lowStockProducts: [],
    };
  }

  const isManualDecision =
    isTrustedManualOrderAuthority(order.source, order.sourceMetadata) &&
    from === "pending" &&
    (to === "confirmed" || to === "cancelled");
  if (isManualDecision) throw canonicalConfirmationError();

  if (await hasCanonicalActiveReservation(tx, id)) {
    throw canonicalFollowupError(id);
  }

  assertCanTransition(from, to);
  const lowStockProducts: LowStockProduct[] = [];

  if (triggersStockDeduction(from, to)) {
    for (const item of order.items) {
      if (!item.productId) continue;
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
      const lowStock = await detectLowStock(tx, item.productId);
      if (lowStock) lowStockProducts.push(lowStock);
    }
  }

  if (triggersStockRestoration(from, to)) {
    for (const item of order.items) {
      if (!item.productId) continue;
      await restoreLegacyProductStock(
        tx,
        order.id,
        item.id,
        item.productId,
        item.quantity,
      );
      const lowStock = await detectLowStock(tx, item.productId);
      if (lowStock) lowStockProducts.push(lowStock);
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

  const data: Record<string, unknown> = {
    status: to,
    version: { increment: 1 },
  };
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
  context: ServiceContext,
  effects: OrderStatusTransitionEffects,
): void {
  if (!effects.changed) return;

  for (const product of effects.lowStockProducts) {
    void dispatchLowStock(context, product);
  }

  const order = effects.order;
  void dispatchTrigger(context, `order.${order.status}` as TriggerEvent, {
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
  async list(
    context: ServiceContext,
    options?: {
      limit?: number;
      offset?: number;
      status?: OrderStatus;
    },
  ): Promise<Order[]> {
    const rows = await context.prisma.order.findMany({
      where: {
        deletedAt: null,
        ...(options?.status ? { status: options.status } : {}),
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
    return rows.map((row) => toDomain(row as unknown as Record<string, unknown>));
  },

  async getById(context: ServiceContext, id: string): Promise<Order> {
    return withServiceError(async () => {
      const row = await context.prisma.order.findFirst({
        where: { id, deletedAt: null },
        include: { items: true },
      });
      if (!row) throw new NotFoundError("Order", id);
      return toDomain(row as unknown as Record<string, unknown>);
    }, "Order");
  },

  async getByOrderNumber(
    context: ServiceContext,
    orderNumber: string,
  ): Promise<Order | null> {
    const row = await context.prisma.order.findFirst({
      where: { orderNumber, deletedAt: null },
      include: { items: true },
    });
    return row ? toDomain(row as unknown as Record<string, unknown>) : null;
  },

  async create(
    context: ServiceContext,
    input: unknown,
    options?: OrderCreateOptions,
  ): Promise<Order> {
    return withServiceError(async () => {
      const data = createOrderSchema.parse(input);
      if (options?.tx && !options.afterCommit) {
        throw new Error(
          "Caller-owned order transactions require an afterCommit collector",
        );
      }

      const client = options?.tx ?? context.prisma;
      const customer = await client.customer.findFirst({
        where: { id: data.customerId, deletedAt: null },
      });
      if (!customer) throw new NotFoundError("Customer", data.customerId);

      const itemsTotal = data.items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      const totalPrice = itemsTotal + (data.deliveryCost ?? 0);
      const orderNumber = await nextOrderNumber(
        client as ServiceContext["prisma"],
        data.orderNumberPrefix ?? "ORD",
      );
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
        sourceMetadata: data.sourceMetadata
          ? JSON.stringify(data.sourceMetadata)
          : null,
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

      let row;
      if (options?.tx) {
        row = await options.tx.order.create({
          data: orderCreateData,
          include: { items: true },
        });
        await recordOrderChangeInTx(options.tx, {
          orderId: row.id,
          actionType: "created",
          payload: {
            orderNumber: row.orderNumber,
            itemCount: row.items.length,
            totalPrice,
          },
        });
      } else {
        row = await context.prisma.$transaction(async (tx) => {
          const created = await tx.order.create({
            data: orderCreateData,
            include: { items: true },
          });
          await recordOrderChangeInTx(tx, {
            orderId: created.id,
            actionType: "created",
            payload: {
              orderNumber: created.orderNumber,
              itemCount: created.items.length,
              totalPrice,
            },
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
        void dispatchTrigger(
          context,
          "order.created" as TriggerEvent,
          triggerPayload,
        );
      };
      if (options?.tx) options.afterCommit(dispatchCreated);
      else dispatchCreated();

      return toDomain(row as unknown as Record<string, unknown>);
    }, "Order");
  },

  async updateStatus(
    context: ServiceContext,
    id: string,
    to: OrderStatus,
    options?: { actor?: string },
  ): Promise<Order> {
    return withServiceError(async () => {
      const actor = options?.actor ?? "user";
      const governed = await maybeConfirmMappedHistoricalManualOrder(
        context,
        id,
        to,
        actor,
      );
      if (governed) return governed;

      const effects = await context.prisma.$transaction((tx) =>
        updateStatusInTransaction(tx, id, to, actor),
      );
      dispatchCommittedStatusTransition(context, effects);
      return effects.order;
    }, "Order");
  },

  async updateStatusInTx(
    tx: OrderChangeTransactionClient,
    id: string,
    to: OrderStatus,
    options?: { actor?: string },
  ): Promise<OrderStatusTransitionEffects> {
    return updateStatusInTransaction(tx, id, to, options?.actor ?? "user");
  },

  dispatchStatusTransition(
    context: ServiceContext,
    effects: OrderStatusTransitionEffects,
  ): void {
    dispatchCommittedStatusTransition(context, effects);
  },

  async update(
    context: ServiceContext,
    id: string,
    input: unknown,
  ): Promise<Order> {
    return withServiceError(async () => {
      const data = updateOrderSchema.parse(input);

      return context.prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id, deletedAt: null },
          select: {
            id: true,
            status: true,
            source: true,
            sourceMetadata: true,
          },
        });
        if (!order) throw new NotFoundError("Order", id);

        // Any active canonical reservation freezes the complete legacy edit
        // surface, not only item/price fields. Future callers must use a
        // governed expected-version edit command.
        if (await hasCanonicalActiveReservation(tx, id)) {
          throw canonicalFollowupError(id);
        }

        const changesPricingBasis =
          data.items !== undefined ||
          data.deliveryCost !== undefined ||
          data.totalPrice !== undefined;
        const trustedManualCreation =
          changesPricingBasis &&
          isTrustedManualOrderAuthority(order.source, order.sourceMetadata);
        if (trustedManualCreation) {
          throw new SahelFlowError(
            "Manual order items and prices require a governed edit command",
            "CANONICAL_ORDER_EDIT_REQUIRED",
            409,
          );
        }

        if (data.items) {
          const existing = await tx.orderItem.findMany({
            where: { orderId: id },
          });
          const incomingIds = data.items
            .filter((item) => item.id)
            .map((item) => item.id);
          const toDelete = existing
            .filter((item) => !incomingIds.includes(item.id))
            .map((item) => item.id);

          await Promise.all([
            ...toDelete.map((itemId) =>
              tx.orderItem.delete({ where: { id: itemId } }),
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
              return item.id
                ? tx.orderItem.update({ where: { id: item.id }, data: payload })
                : tx.orderItem.create({ data: { ...payload, orderId: id } });
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
            version: { increment: 1 },
          },
          include: { items: true },
        });
        await recordOrderChangeInTx(tx, {
          orderId: id,
          actionType: "edit",
          payload: {
            fields: Object.keys(data),
            version: row.version,
          },
        });
        return toDomain(row as unknown as Record<string, unknown>);
      });
    }, "Order");
  },

  async countByStatus(
    context: ServiceContext,
  ): Promise<Record<OrderStatus, number>> {
    const groups = await context.prisma.order.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const result = {} as Record<OrderStatus, number>;
    for (const group of groups) {
      result[group.status as OrderStatus] = group._count._all;
    }
    return result;
  },

  async listToday(context: ServiceContext): Promise<Order[]> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const rows = await context.prisma.order.findMany({
      where: { createdAt: { gte: startOfDay }, deletedAt: null },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => toDomain(row as unknown as Record<string, unknown>));
  },
};
