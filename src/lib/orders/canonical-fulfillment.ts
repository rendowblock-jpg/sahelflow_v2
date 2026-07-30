import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  executeBusinessCommand,
  type BusinessTransaction,
} from "@/lib/business-truth/command-kernel";
import type {
  BusinessCommandResult,
  CanonicalDeliveryState,
  CloseReservationFact,
  CodFinancialState,
  FinancialMovementFact,
  FulfillmentState,
  InventoryMovementFact,
  OrderInventoryState,
  OutboxIntentFact,
} from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { ConflictError, NotFoundError, ValidationError } from "@/types/errors";

export const canonicalFulfillmentSchema = z.object({
  orderId: z.string().trim().min(1),
  action: z.enum(["pack", "ship", "deliver"]),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(200),
  correlationId: z.string().trim().min(1).max(200).optional(),
});

export type CanonicalFulfillmentInput = z.infer<
  typeof canonicalFulfillmentSchema
>;

export interface CanonicalFulfillmentResult {
  orderId: string;
  orderNumber: string;
  status: "confirmed" | "shipped" | "delivered";
  version: number;
  fulfillmentState: FulfillmentState;
  deliveryState: CanonicalDeliveryState;
  inventoryState: OrderInventoryState;
  codState: CodFinancialState;
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  codReceivableAmount: number | null;
}

interface ReservationRow {
  id: string;
  orderItemId: string | null;
  productId: string;
  productVariantId: string | null;
  quantity: number | bigint;
  state: string;
}

interface FulfillmentOrderItem {
  id: string;
  productId: string | null;
  productVariantId: string | null;
  quantity: number;
}

function stateError(action: string, current: string): ConflictError {
  return new ConflictError(
    `Canonical ${action} cannot run from the current state '${current}'`,
  );
}

async function reservationRows(
  tx: BusinessTransaction,
  orderId: string,
  state: "active" | "consumed",
): Promise<ReservationRow[]> {
  return tx.$queryRaw<ReservationRow[]>`
    SELECT "id", "orderItemId", "productId", "productVariantId", "quantity", "state"
    FROM "InventoryReservation"
    WHERE "orderId" = ${orderId}
      AND "state" = ${state}
    ORDER BY "orderItemId" ASC, "id" ASC
  `;
}

function assertReservationsMatchItems(
  rows: readonly ReservationRow[],
  items: readonly FulfillmentOrderItem[],
  expectedState: "active" | "consumed",
): void {
  if (rows.length !== items.length) {
    throw new ConflictError(
      `Order reservation authority is incomplete: expected ${items.length} ${expectedState} reservations, found ${rows.length}`,
    );
  }

  const byItem = new Map(rows.map((row) => [row.orderItemId, row]));
  if (byItem.size !== rows.length) {
    throw new ConflictError("Order reservation authority contains duplicate item reservations");
  }

  for (const item of items) {
    if (!item.productId) {
      throw new ValidationError(
        `Order item '${item.id}' has no product identity`,
        "items.productId",
      );
    }
    const reservation = byItem.get(item.id);
    if (
      !reservation ||
      reservation.state !== expectedState ||
      reservation.productId !== item.productId ||
      reservation.productVariantId !== item.productVariantId ||
      Number(reservation.quantity) !== item.quantity
    ) {
      throw new ConflictError(
        `Reservation authority does not exactly match order item '${item.id}'`,
      );
    }
  }
}

function projectionKeys(orderId: string, customerId: string): string[] {
  return [
    "orders:list",
    `orders:${orderId}`,
    "dashboard:orders",
    "deliveries:list",
    "accounting:cod",
    `customers:${customerId}`,
  ];
}

export async function executeCanonicalFulfillment(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalFulfillmentResult>> {
  const data = canonicalFulfillmentSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: `order.fulfillment.${data.action}.v1`,
      aggregate: {
        // Every transition is single-fire. The Order.version below is the
        // cross-transition optimistic lock; this aggregate prevents two
        // different keys from committing the same transition concurrently.
        type: "canonical-order-fulfillment-transition",
        id: `${data.orderId}:${data.action}`,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: {
        orderId: data.orderId,
        action: data.action,
        expectedVersion: data.expectedVersion,
      },
    },
    async ({ tx, commandId, aggregateVersion, principal }) => {
      const order = await tx.order.findFirst({
        where: { id: data.orderId, deletedAt: null },
        include: { items: true, delivery: true },
      });
      if (!order) throw new NotFoundError("Order", data.orderId);
      if (!isTrustedManualOrderAuthority(order.source, order.sourceMetadata)) {
        throw new ValidationError(
          "This command only governs trusted manual orders",
          "order.authority",
        );
      }
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }

      const before = {
        status: order.status,
        version: order.version,
        fulfillmentState: order.fulfillmentState,
        deliveryState: order.deliveryState,
        inventoryState: order.inventoryState,
        codState: order.codState,
      };
      const nextVersion = data.expectedVersion + 1;
      const now = new Date();
      let status: CanonicalFulfillmentResult["status"];
      let fulfillmentState: FulfillmentState;
      let deliveryState: CanonicalDeliveryState;
      let inventoryState: OrderInventoryState;
      let codState: CodFinancialState;
      let packedAt = order.packedAt;
      let shippedAt = order.shippedAt;
      let deliveredAt = order.deliveredAt;
      let codReceivableAmount: number | null = null;
      let reservations: CloseReservationFact[] = [];
      let inventoryMovements: InventoryMovementFact[] = [];
      let financialMovements: FinancialMovementFact[] = [];

      if (data.action === "pack") {
        if (
          order.status !== "confirmed" ||
          ![null, "unfulfilled"].includes(order.fulfillmentState)
        ) {
          throw stateError(
            data.action,
            `${order.status}/${order.fulfillmentState ?? "legacy-unadopted"}`,
          );
        }
        const active = await reservationRows(tx, order.id, "active");
        assertReservationsMatchItems(active, order.items, "active");

        status = "confirmed";
        fulfillmentState = "ready";
        deliveryState = "not_created";
        inventoryState = "reserved";
        codState = "not_expected";
        packedAt = now;
      } else if (data.action === "ship") {
        if (
          order.status !== "confirmed" ||
          order.fulfillmentState !== "ready" ||
          order.inventoryState !== "reserved" ||
          order.deliveryState !== "not_created"
        ) {
          throw stateError(
            data.action,
            `${order.status}/${order.fulfillmentState ?? "legacy-unadopted"}/${order.inventoryState ?? "legacy-unadopted"}`,
          );
        }
        if (order.delivery) {
          throw new ConflictError(
            "Canonical manual dispatch found an existing delivery record; reconcile it before shipping",
          );
        }
        const active = await reservationRows(tx, order.id, "active");
        assertReservationsMatchItems(active, order.items, "active");
        reservations = active.map((reservation) => ({
          operation: "consume",
          id: reservation.id,
        }));
        inventoryMovements = active.map((reservation) => ({
          movementKey: `${commandId}:ship:${reservation.id}`,
          movementType: "shipment_dispatched",
          orderId: order.id,
          orderItemId: reservation.orderItemId ?? undefined,
          reservationId: reservation.id,
          productId: reservation.productId,
          productVariantId: reservation.productVariantId ?? undefined,
          quantity: Number(reservation.quantity),
          fromPosition: "reserved",
          toPosition: "outbound",
          reason: `Canonical manual order ${order.id} was physically dispatched`,
        }));
        await tx.delivery.create({
          data: {
            orderId: order.id,
            provider: "manual",
            status: "in_transit",
          },
        });

        status = "shipped";
        fulfillmentState = "shipped";
        deliveryState = "in_transit";
        inventoryState = "outbound";
        codState = "not_expected";
        shippedAt = now;
      } else {
        if (
          order.status !== "shipped" ||
          order.fulfillmentState !== "shipped" ||
          order.inventoryState !== "outbound" ||
          order.deliveryState !== "in_transit"
        ) {
          throw stateError(
            data.action,
            `${order.status}/${order.fulfillmentState ?? "legacy-unadopted"}/${order.deliveryState ?? "legacy-unadopted"}`,
          );
        }
        if (
          !order.delivery ||
          order.delivery.provider !== "manual" ||
          order.delivery.status !== "in_transit" ||
          order.delivery.deletedAt
        ) {
          throw new ConflictError(
            "Canonical delivery authority is missing or no longer in transit",
          );
        }
        const active = await reservationRows(tx, order.id, "active");
        if (active.length > 0) {
          throw new ConflictError(
            "A delivered order cannot retain an active inventory reservation",
          );
        }
        const consumed = await reservationRows(tx, order.id, "consumed");
        assertReservationsMatchItems(consumed, order.items, "consumed");
        if (!Number.isSafeInteger(order.totalPrice) || order.totalPrice <= 0) {
          throw new ValidationError(
            "Delivered COD order requires a positive integer DZD receivable",
            "order.totalPrice",
          );
        }

        const deliveryUpdated = await tx.delivery.updateMany({
          where: {
            id: order.delivery.id,
            provider: "manual",
            status: "in_transit",
            deletedAt: null,
          },
          data: { status: "delivered" },
        });
        if (deliveryUpdated.count !== 1) {
          throw new ConflictError("Delivery changed while the order was being committed");
        }
        const customerUpdated = await tx.customer.updateMany({
          where: { id: order.customerId, deletedAt: null },
          data: {
            orderCount: { increment: 1 },
            totalSpent: { increment: order.totalPrice },
          },
        });
        if (customerUpdated.count !== 1) {
          throw new ConflictError("Customer authority is missing for delivered order");
        }

        status = "delivered";
        fulfillmentState = "closed";
        deliveryState = "delivered";
        inventoryState = "settled";
        codState = "receivable";
        deliveredAt = now;
        codReceivableAmount = order.totalPrice;
        financialMovements = [
          {
            movementKey: `${commandId}:cod-receivable`,
            movementType: "cod_receivable_created",
            orderId: order.id,
            amount: order.totalPrice,
            currency: "DZD",
            counterparty: "manual-courier",
            reason: `Delivered canonical manual order ${order.id} created a carrier COD receivable`,
          },
        ];
      }

      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          version: data.expectedVersion,
          status: order.status,
          deletedAt: null,
        },
        data: {
          status,
          version: nextVersion,
          fulfillmentState,
          deliveryState,
          inventoryState,
          codState,
          packedAt,
          shippedAt,
          deliveredAt,
          ...(data.action === "deliver"
            ? {
                codCollected: false,
                codCollectedAt: null,
                codRemitted: false,
                codRemittedAt: null,
                codRemittanceRef: null,
              }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictError(
          `Order ${order.id} changed while the ${data.action} command was running`,
        );
      }

      await tx.orderChange.create({
        data: {
          orderId: order.id,
          status,
          actionType:
            data.action === "pack"
              ? "fulfill"
              : data.action === "ship"
                ? "ship"
                : "deliver",
          actor: principal.auditActor,
          payload: JSON.stringify({
            action: data.action,
            fromStatus: order.status,
            toStatus: status,
            fulfillmentState,
            deliveryState,
            inventoryState,
            codState,
            orderVersion: nextVersion,
            commandId,
            authority: "canonical-manual-fulfillment-v1",
          }),
          confirmedBy: principal.auditActor,
          confirmedAt: now,
        },
      });

      const eventType =
        data.action === "pack"
          ? "order.fulfillment.packed.v1"
          : data.action === "ship"
            ? "order.fulfillment.shipped.v1"
            : "order.delivery.delivered.v1";
      const eventPayload = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status,
        orderVersion: nextVersion,
        fulfillmentState,
        deliveryState,
        inventoryState,
        codState,
        reservationCount: reservations.length,
        codReceivableAmount,
      };
      const outbox: OutboxIntentFact[] = [
        {
          effectKey: `${commandId}:lifecycle`,
          effectType: eventType,
          payload: eventPayload,
        },
      ];
      const result: CanonicalFulfillmentResult = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status,
        version: nextVersion,
        fulfillmentState,
        deliveryState,
        inventoryState,
        codState,
        packedAt: packedAt?.toISOString() ?? null,
        shippedAt: shippedAt?.toISOString() ?? null,
        deliveredAt: deliveredAt?.toISOString() ?? null,
        codReceivableAmount,
      };

      return {
        result,
        audit: {
          action: eventType,
          entity: "order",
          entityId: order.id,
          before,
          after: {
            status,
            version: nextVersion,
            fulfillmentState,
            deliveryState,
            inventoryState,
            codState,
            reservationCount: reservations.length,
            financialMovementCount: financialMovements.length,
          },
          metadata: {
            action: data.action,
            authority: "canonical-manual-fulfillment-v1",
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: eventType,
            payload: eventPayload,
          },
        ],
        outbox,
        reservations,
        inventoryMovements,
        financialMovements,
        projectionInvalidations: projectionKeys(order.id, order.customerId),
      };
    },
  );
}
