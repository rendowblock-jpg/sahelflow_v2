import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  executeBusinessCommand,
  type BusinessTransaction,
} from "@/lib/business-truth/command-kernel";
import type {
  BusinessCommandResult,
  InventoryMovementFact,
  OpenReservationFact,
  OutboxIntentFact,
} from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { sealBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { redactPii } from "@/lib/redact-pii";
import { ConflictError, NotFoundError, ValidationError } from "@/types/errors";

export const manualOrderDecisionSchema = z
  .object({
    orderId: z.string().min(1),
    decision: z.enum(["confirm", "reject"]),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().trim().min(8).max(200),
    correlationId: z.string().trim().min(1).max(200).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === "reject" && !value.reason?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Manual rejection requires a reason",
      });
    }
  });

export type ManualOrderDecisionInput = z.infer<typeof manualOrderDecisionSchema>;

export interface ManualOrderDecisionResult {
  orderId: string;
  orderNumber: string;
  status: "confirmed" | "cancelled";
  version: number;
  confirmedAt: string | null;
  rejectionReason: string | null;
  automation: {
    trigger: "order.confirmed" | "order.cancelled";
    order: {
      orderId: string;
      orderNumber: string;
      customerId: string;
      customerName: string;
      customerPhone: string;
      totalPrice: number;
      wilaya: string;
    };
    lowStock: LowStockProduct[];
  };
}

export interface LowStockProduct {
  id: string;
  name: string;
  stock: number;
  lowStockThreshold: number;
}

async function reserveOrderItem(
  tx: BusinessTransaction,
  commandId: string,
  orderId: string,
  item: {
    id: string;
    productId: string | null;
    productVariantId: string | null;
    productVariantName: string | null;
    quantity: number;
  },
  initialProductStock: Map<string, number>,
): Promise<{
  reservation: OpenReservationFact;
  movement: InventoryMovementFact;
}> {
  if (!item.productId) {
    throw new ValidationError(
      `Order item '${item.id}' has no product identity and cannot be confirmed canonically`,
      "items.productId",
    );
  }

  const product = await tx.product.findFirst({
    where: { id: item.productId, isActive: true, deletedAt: null },
    select: { id: true, name: true, stock: true },
  });
  if (!product) throw new NotFoundError("Product", item.productId);

  if (item.productVariantId) {
    const variant = await tx.productVariant.findFirst({
      where: {
        id: item.productVariantId,
        productId: product.id,
        isActive: true,
      },
      select: { id: true },
    });
    if (!variant) {
      throw new ValidationError(
        `Variant '${item.productVariantId}' is inactive, deleted or belongs to another product`,
        "items.productVariantId",
      );
    }

    if (!initialProductStock.has(product.id)) {
      const beforeAvailable = await tx.productVariant.aggregate({
        where: { productId: product.id, isActive: true },
        _sum: { stock: true },
      });
      initialProductStock.set(product.id, beforeAvailable._sum.stock ?? 0);
    }

    const updated = await tx.productVariant.updateMany({
      where: {
        id: variant.id,
        productId: product.id,
        isActive: true,
        stock: { gte: item.quantity },
      },
      data: { stock: { decrement: item.quantity } },
    });
    if (updated.count !== 1) {
      throw new ConflictError(
        `Insufficient available stock for variant '${variant.id}'`,
      );
    }

    const available = await tx.productVariant.aggregate({
      where: { productId: product.id, isActive: true },
      _sum: { stock: true },
    });
    await tx.product.update({
      where: { id: product.id },
      data: { stock: available._sum.stock ?? 0 },
    });
  } else {
    if (!initialProductStock.has(product.id)) {
      initialProductStock.set(product.id, product.stock);
    }
    if (item.productVariantName) {
      throw new ValidationError(
        `The exact variant '${item.productVariantName}' selected at intake no longer exists`,
        "items.productVariantId",
      );
    }

    const updated = await tx.product.updateMany({
      where: {
        id: product.id,
        isActive: true,
        deletedAt: null,
        stock: { gte: item.quantity },
      },
      data: { stock: { decrement: item.quantity } },
    });
    if (updated.count !== 1) {
      throw new ConflictError(
        `Insufficient available stock for product '${product.id}'`,
      );
    }
  }

  const reservationId = randomUUID();
  return {
    reservation: {
      operation: "open",
      id: reservationId,
      reservationKey: `${commandId}:reserve:${item.id}`,
      orderId,
      orderItemId: item.id,
      productId: product.id,
      productVariantId: item.productVariantId ?? undefined,
      quantity: item.quantity,
    },
    movement: {
      movementKey: `${commandId}:movement:${item.id}`,
      movementType: "reserve",
      orderId,
      orderItemId: item.id,
      reservationId,
      productId: product.id,
      productVariantId: item.productVariantId ?? undefined,
      quantity: item.quantity,
      fromPosition: "available",
      toPosition: "reserved",
      reason: `Manual order ${orderId} confirmation reserved exact available stock`,
    },
  };
}

async function findNewlyLowStockProducts(
  tx: BusinessTransaction,
  reservations: OpenReservationFact[],
  initialProductStock: Map<string, number>,
): Promise<LowStockProduct[]> {
  const productIds = [
    ...new Set(reservations.map((reservation) => reservation.productId)),
  ];
  if (productIds.length === 0) return [];

  const products = await tx.product.findMany({
    where: { id: { in: productIds }, isActive: true, deletedAt: null },
    select: { id: true, name: true, stock: true, lowStockThreshold: true },
  });
  return products.filter((product) => {
    const before = initialProductStock.get(product.id);
    return (
      before !== undefined &&
      before > product.lowStockThreshold &&
      product.stock <= product.lowStockThreshold
    );
  });
}

export async function executeManualOrderDecision(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<ManualOrderDecisionResult>> {
  const data = manualOrderDecisionSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();
  const rejectionEnvelopeKey =
    data.decision === "reject" ? await getBusinessEnvelopeKey(context) : null;

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType:
        data.decision === "confirm"
          ? "order.manual.confirm.v1"
          : "order.manual.reject.v1",
      aggregate: {
        type: "manual-order-decision",
        id: data.orderId,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: {
        orderId: data.orderId,
        decision: data.decision,
        expectedVersion: data.expectedVersion,
        reason: data.reason ?? null,
      },
    },
    async ({ tx, commandId, aggregateVersion, principal }) => {
      const order = await tx.order.findFirst({
        where: { id: data.orderId, deletedAt: null },
        include: {
          items: true,
          customer: { select: { name: true } },
        },
      });
      if (!order) throw new NotFoundError("Order", data.orderId);
      if (!isTrustedManualOrderAuthority(order.source, order.sourceMetadata)) {
        throw new ValidationError(
          "This command only governs trusted manual orders",
          "order.authority",
        );
      }
      if (order.status !== "pending") {
        throw new ConflictError(
          `Manual confirmation requires pending status; current status is '${order.status}'`,
        );
      }
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }

      const reservations: OpenReservationFact[] = [];
      const inventoryMovements: InventoryMovementFact[] = [];
      const initialProductStock = new Map<string, number>();
      if (data.decision === "confirm") {
        for (const item of order.items) {
          const reserved = await reserveOrderItem(
            tx,
            commandId,
            order.id,
            item,
            initialProductStock,
          );
          reservations.push(reserved.reservation);
          inventoryMovements.push(reserved.movement);
        }
      }
      const lowStockProducts =
        data.decision === "confirm"
          ? await findNewlyLowStockProducts(
              tx,
              reservations,
              initialProductStock,
            )
          : [];

      const status = data.decision === "confirm" ? "confirmed" : "cancelled";
      const confirmedAt = data.decision === "confirm" ? new Date() : null;
      const orderVersion = data.expectedVersion + 1;
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          status: "pending",
          version: data.expectedVersion,
          deletedAt: null,
        },
        data: {
          status,
          version: orderVersion,
          fulfillmentState: "unfulfilled",
          deliveryState: "not_created",
          inventoryState:
            data.decision === "confirm" ? "reserved" : "unreserved",
          codState: "not_expected",
          ...(confirmedAt ? { confirmedAt } : {}),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictError(
          `Order ${order.id} changed while the ${data.decision} command was running`,
        );
      }

      const rejectionReasonEnvelope =
        data.decision === "reject" && rejectionEnvelopeKey
          ? sealBusinessPayloadWithKey(
              { rejectionReason: data.reason ?? "" },
              {
                kind: "order-change-detail",
                recordKey: `${commandId}:rejection-reason`,
                recordType: "order.rejection-reason.v1",
                commandId,
              },
              rejectionEnvelopeKey,
            )
          : null;
      const orderChangePayload = redactPii({
        from: "pending",
        to: status,
        decision: data.decision,
        rejectionReasonRecorded: data.decision === "reject",
        commandId,
        decisionVersion: aggregateVersion,
        orderVersion,
        authority: "manual-confirmation-v1",
      });

      await tx.orderChange.create({
        data: {
          orderId: order.id,
          status,
          actionType: "status_change",
          actor: principal.auditActor,
          payload: JSON.stringify({
            ...orderChangePayload,
            ...(rejectionReasonEnvelope ? { rejectionReasonEnvelope } : {}),
          }),
          confirmedBy: principal.auditActor,
          confirmedAt: new Date(),
        },
      });

      const result: ManualOrderDecisionResult = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status,
        version: orderVersion,
        confirmedAt: confirmedAt?.toISOString() ?? null,
        rejectionReason: data.decision === "reject" ? data.reason ?? null : null,
        automation: {
          trigger:
            data.decision === "confirm"
              ? "order.confirmed"
              : "order.cancelled",
          order: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerId: order.customerId,
            customerName: order.customer.name,
            customerPhone: order.phone,
            totalPrice: order.totalPrice,
            wilaya: order.wilaya,
          },
          lowStock: lowStockProducts,
        },
      };
      const eventType =
        data.decision === "confirm"
          ? "order.confirmation.confirmed.v1"
          : "order.confirmation.rejected.v1";
      const projectionInvalidations = [
        ...new Set([
          "orders:list",
          `orders:${order.id}`,
          "dashboard:orders",
          "products:list",
          ...order.items.flatMap((item) =>
            item.productId ? [`products:${item.productId}`] : [],
          ),
        ]),
      ];
      const outbox: OutboxIntentFact[] = [
        {
          effectKey: `${commandId}:decision`,
          effectType: eventType,
          payload: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            status,
            orderVersion,
          },
        },
        ...lowStockProducts.map((product) => ({
          effectKey: `${commandId}:stock-low:${product.id}`,
          effectType: "stock.low.v1",
          payload: {
            productId: product.id,
            stockLevel: product.stock,
            lowStockThreshold: product.lowStockThreshold,
          },
        })),
      ];

      return {
        result,
        audit: {
          action: eventType,
          entity: "order",
          entityId: order.id,
          before: { status: order.status, version: order.version },
          after: {
            status,
            version: orderVersion,
            decisionVersion: aggregateVersion,
            reservationCount: reservations.length,
            lowStockEventCount: lowStockProducts.length,
          },
          metadata: {
            decision: data.decision,
            authority: "manual-confirmation-v1",
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: eventType,
            payload: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              status,
              orderVersion,
              decisionVersion: aggregateVersion,
              reservationCount: reservations.length,
              lowStockEventCount: lowStockProducts.length,
              rejectionReason:
                data.decision === "reject" ? data.reason ?? null : null,
            },
          },
          ...lowStockProducts.map((product) => ({
            key: `${commandId}:stock-low:${product.id}`,
            type: "stock.low.v1",
            payload: {
              productId: product.id,
              productName: product.name,
              stockLevel: product.stock,
              lowStockThreshold: product.lowStockThreshold,
            },
          })),
        ],
        outbox,
        reservations,
        inventoryMovements,
        projectionInvalidations,
      };
    },
  );
}

export async function hasCanonicalActiveReservation(
  tx: BusinessTransaction,
  orderId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "InventoryReservation"
    WHERE "orderId" = ${orderId}
      AND "state" = 'active'
    LIMIT 1
  `;
  return rows.length > 0;
}
