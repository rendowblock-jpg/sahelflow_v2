import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  executeBusinessCommand,
  type BusinessTransaction,
} from "@/lib/business-truth/command-kernel";
import type { BusinessCommandResult } from "@/lib/business-truth/contracts";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { openBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";
import {
  systemBusinessPrincipal,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import type { ServiceContext } from "@/lib/data/service-base";
import {
  getDeliveryAdapter,
  loadDeliveryCredentials,
} from "@/lib/integrations/delivery";
import {
  DELIVERY_PROVIDERS,
  type DeliveryProvider,
  type ShipmentRequest,
  type ShipmentResult,
} from "@/lib/integrations/delivery/types";
import { isCanonicalOrderAuthority } from "@/lib/orders/manual-order-authority";
import {
  ConflictError,
  NotFoundError,
  SahelFlowError,
  ValidationError,
} from "@/types/errors";
import {
  COURIER_BOOKING_EFFECT_TYPE,
  drainDueCourierBookings as drainLegacyCourierBookings,
  getCanonicalCourierPosition,
  ingestCanonicalCourierTrackingEvent,
  reconcileCanonicalCourierBooking,
  synchronizeCanonicalCourierTracking,
  type CourierBookingResult,
  type CourierBookingSender,
  type CourierPosition,
  type CourierTrackingFetcher,
} from "./canonical-courier-legacy";

export {
  COURIER_BOOKING_EFFECT_TYPE,
  getCanonicalCourierPosition,
  ingestCanonicalCourierTrackingEvent,
  reconcileCanonicalCourierBooking,
  synchronizeCanonicalCourierTracking,
};
export type {
  CourierBookingResult,
  CourierBookingSender,
  CourierPosition,
  CourierTrackingFetcher,
};

const LEASE_MS = 120_000;

const providerSchema = z.enum(DELIVERY_PROVIDERS);
const bookingSchema = z.object({
  orderId: z.string().trim().min(1),
  provider: providerSchema,
  expectedVersion: z.number().int().positive().safe(),
  idempotencyKey: z.string().trim().min(8).max(200),
  correlationId: z.string().trim().min(1).max(200).optional(),
});

const bookingPayloadSchema = z.object({
  deliveryId: z.string().trim().min(1),
  orderId: z.string().trim().min(1),
  provider: providerSchema,
  request: z.object({
    orderId: z.string(),
    orderNumber: z.string(),
    customer: z.object({
      name: z.string(),
      phone: z.string(),
      wilaya: z.string(),
      commune: z.string(),
      address: z.string(),
    }),
    items: z.array(
      z.object({
        name: z.string(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().int().nonnegative(),
      }),
    ),
    totalPrice: z.number().int().positive(),
    weight: z.number().positive(),
    notes: z.string().optional(),
    isExchange: z.boolean().optional(),
  }),
});

interface ReservationRow {
  id: string;
  orderItemId: string | null;
  productId: string;
  productVariantId: string | null;
  quantity: number | bigint;
  state: string;
}

interface BookingOutboxRow {
  id: string;
  effectKey: string;
  commandId: string;
  effectType: string;
  payloadJson: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: Date | null;
  lockedAt: Date | null;
  leaseToken: string | null;
  effectStartedAt: Date | null;
  lastErrorCode: string | null;
  outcomeState: string;
}

interface StoredBookingCommandRow {
  commandType: string;
  aggregateType: string;
  aggregateId: string;
  expectedVersion: number | bigint;
}

function safeInteger(value: number | bigint, field: string): number {
  const output = Number(value);
  if (!Number.isSafeInteger(output)) {
    throw new ConflictError(`${field} is outside the supported integer range`);
  }
  return output;
}

async function reservationRows(
  tx: BusinessTransaction,
  orderId: string,
): Promise<ReservationRow[]> {
  return tx.$queryRaw<ReservationRow[]>`
    SELECT "id", "orderItemId", "productId", "productVariantId", "quantity", "state"
    FROM "InventoryReservation"
    WHERE "orderId" = ${orderId}
      AND "state" = 'active'
    ORDER BY "orderItemId" ASC, "id" ASC
  `;
}

function assertReservations(
  rows: readonly ReservationRow[],
  items: readonly {
    id: string;
    productId: string | null;
    productVariantId: string | null;
    quantity: number;
  }[],
): void {
  if (rows.length !== items.length) {
    throw new ConflictError(
      `Courier inventory authority requires ${items.length} active reservations, found ${rows.length}`,
    );
  }

  const byItem = new Map(rows.map((row) => [row.orderItemId, row]));
  if (byItem.size !== rows.length) {
    throw new ConflictError(
      "Courier inventory authority contains duplicate reservations",
    );
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
      reservation.productId !== item.productId ||
      reservation.productVariantId !== item.productVariantId ||
      safeInteger(reservation.quantity, "reservation quantity") !== item.quantity ||
      reservation.state !== "active"
    ) {
      throw new ConflictError(
        `Reservation authority does not match order item '${item.id}'`,
      );
    }
  }
}

async function bookingAggregate(
  context: ServiceContext,
  data: z.infer<typeof bookingSchema>,
): Promise<{ id: string; expectedVersion: number }> {
  const generationId = `${data.orderId}:${data.expectedVersion}`;
  const stored = await context.prisma.$queryRaw<StoredBookingCommandRow[]>`
    SELECT "commandType", "aggregateType", "aggregateId", "expectedVersion"
    FROM "BusinessCommand"
    WHERE "idempotencyKey" = ${data.idempotencyKey}
    LIMIT 1
  `;
  const replay = stored[0];

  if (
    replay?.commandType === "courier.booking.queue.v1" &&
    replay.aggregateType === "canonical-courier-booking" &&
    (replay.aggregateId === data.orderId || replay.aggregateId === generationId)
  ) {
    return {
      id: replay.aggregateId,
      expectedVersion: safeInteger(
        replay.expectedVersion,
        "stored courier aggregate version",
      ),
    };
  }

  return { id: generationId, expectedVersion: 0 };
}

export async function queueCanonicalCourierBooking(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CourierBookingResult>> {
  const data = bookingSchema.parse(input);
  const aggregate = await bookingAggregate(context, data);

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "courier.booking.queue.v1",
      aggregate: {
        type: "canonical-courier-booking",
        id: aggregate.id,
        expectedVersion: aggregate.expectedVersion,
      },
      actor: "authenticated-owner",
      correlationId: data.correlationId ?? randomUUID(),
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const order = await tx.order.findFirst({
        where: { id: data.orderId, deletedAt: null },
        include: { customer: true, items: true, delivery: true },
      });
      if (!order) throw new NotFoundError("Order", data.orderId);
      if (!isCanonicalOrderAuthority(order.source, order.sourceMetadata)) {
        throw new ValidationError(
          "Courier booking requires canonical order authority",
          "order.authority",
        );
      }
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }
      if (
        order.status !== "confirmed" ||
        order.fulfillmentState !== "ready" ||
        order.inventoryState !== "reserved" ||
        order.deliveryState !== "not_created"
      ) {
        throw new ConflictError(
          `Courier booking requires confirmed/ready/reserved/not_created; current state is ${order.status}/${order.fulfillmentState}/${order.inventoryState}/${order.deliveryState}`,
        );
      }

      assertReservations(await reservationRows(tx, order.id), order.items);

      let deliveryId: string;
      if (order.delivery) {
        if (
          order.delivery.trackingNumber ||
          !["booking_failed", "not_created"].includes(order.delivery.status)
        ) {
          throw new ConflictError(
            "Existing courier authority requires reconciliation before rebooking",
          );
        }
        deliveryId = order.delivery.id;
        const reused = await tx.delivery.updateMany({
          where: {
            id: deliveryId,
            trackingNumber: null,
            status: { in: ["booking_failed", "not_created"] },
            deletedAt: null,
          },
          data: {
            provider: data.provider,
            status: "booking_queued",
            labelUrl: null,
            cost: null,
            estimatedDelivery: null,
          },
        });
        if (reused.count !== 1) {
          throw new ConflictError("Courier delivery changed before rebooking");
        }
      } else {
        deliveryId = randomUUID();
        await tx.delivery.create({
          data: {
            id: deliveryId,
            orderId: order.id,
            provider: data.provider,
            status: "booking_queued",
          },
        });
      }

      const nextVersion = order.version + 1;
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          version: order.version,
          status: "confirmed",
          deletedAt: null,
        },
        data: { version: nextVersion, deliveryState: "pending" },
      });
      if (updated.count !== 1) {
        throw new ConflictError("Order changed while courier booking was queued");
      }

      await tx.canonicalDeliveryEvent.create({
        data: {
          id: randomUUID(),
          eventKey: `${commandId}:booking-requested`,
          orderId: order.id,
          deliveryId,
          eventType: "courier_booking_requested",
          provider: data.provider,
          reasonCode: "seller_booking_request",
          occurredAt: new Date(),
          createdByCommandId: commandId,
        },
      });

      const effectKey = `${commandId}:courier-booking`;
      const request: ShipmentRequest = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customer: {
          name: order.customer.name,
          phone: order.customer.phone,
          wilaya: order.wilaya,
          commune: order.commune,
          address: order.address,
        },
        items: order.items.map((item) => ({
          name: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        totalPrice: order.totalPrice,
        weight: Math.max(
          1,
          order.items.reduce((sum, item) => sum + item.quantity, 0),
        ),
        notes: order.notes ?? undefined,
      };
      const result: CourierBookingResult = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderVersion: nextVersion,
        deliveryId,
        provider: data.provider,
        bookingState: "queued",
        effectKey,
      };

      return {
        result,
        audit: {
          action: "courier.booking.queued.v1",
          entity: "delivery",
          entityId: deliveryId,
          before: {
            orderVersion: order.version,
            deliveryState: order.deliveryState,
          },
          after: {
            orderVersion: nextVersion,
            deliveryState: "pending",
            provider: data.provider,
            bookingGeneration: aggregate.id,
          },
          metadata: { principal: principal.auditActor },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "courier.booking.queued.v1",
            payload: result,
          },
        ],
        outbox: [
          {
            effectKey,
            effectType: COURIER_BOOKING_EFFECT_TYPE,
            payload: {
              deliveryId,
              orderId: order.id,
              provider: data.provider,
              request,
            },
          },
        ],
        projectionInvalidations: [
          "orders:list",
          `orders:${order.id}`,
          "deliveries:list",
          `deliveries:${deliveryId}`,
        ],
      };
    },
  );
}

async function openBookingPayload(
  context: ServiceContext,
  row: BookingOutboxRow,
): Promise<z.infer<typeof bookingPayloadSchema>> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  return bookingPayloadSchema.parse(
    openBusinessPayloadWithKey(
      row.payloadJson,
      {
        kind: "outbox-intent",
        recordKey: row.effectKey,
        recordType: row.effectType,
        commandId: row.commandId,
      },
      envelopeKey,
    ),
  );
}

async function bookingRequest(
  tx: BusinessTransaction,
  commandId: string,
): Promise<{ orderId: string; deliveryId: string | null } | null> {
  return tx.canonicalDeliveryEvent.findFirst({
    where: {
      createdByCommandId: commandId,
      eventType: "courier_booking_requested",
    },
    orderBy: { createdAt: "desc" },
    select: { orderId: true, deliveryId: true },
  });
}

async function deadLetterInvalidPayload(
  context: ServiceContext,
  row: BookingOutboxRow,
): Promise<boolean> {
  const commandContext: BusinessPrincipalContext = {
    ...context,
    businessPrincipal: systemBusinessPrincipal("reconciliation"),
  };

  try {
    await executeBusinessCommand(
      commandContext,
      {
        idempotencyKey: `courier-booking-outcome:terminal_failure:${row.effectKey}`,
        commandType: "courier.booking.outcome.terminal_failure.v1",
        aggregate: {
          type: "courier-booking-outcome",
          id: `${row.effectKey}:terminal_failure`,
          expectedVersion: 0,
        },
        actor: "system",
        correlationId: row.effectKey,
        payload: {
          outboxId: row.id,
          effectKey: row.effectKey,
          errorCode: "COURIER_INVALID_OUTBOX_PAYLOAD",
        },
      },
      async ({ tx, commandId, principal }) => {
        const current = await tx.outboxIntent.findFirst({
          where: {
            id: row.id,
            effectKey: row.effectKey,
            effectType: COURIER_BOOKING_EFFECT_TYPE,
          },
        });
        if (!current) {
          throw new NotFoundError("Courier booking outbox", row.id);
        }

        const updated = await tx.outboxIntent.updateMany({
          where: {
            id: current.id,
            status: current.status,
            attemptCount: current.attemptCount,
            leaseToken: current.leaseToken,
            effectStartedAt: null,
          },
          data: {
            status: "dead_letter",
            outcomeState: "known_failure",
            lastErrorCode: "COURIER_INVALID_OUTBOX_PAYLOAD",
            nextAttemptAt: null,
            lockedAt: null,
            leaseToken: null,
            deadLetteredAt: new Date(),
          },
        });
        if (updated.count !== 1) {
          throw new ConflictError(
            "Courier booking outbox changed before invalid-payload dead letter",
          );
        }

        const request = await bookingRequest(tx, row.commandId);
        let orderVersion: number | null = null;
        if (request?.deliveryId) {
          await tx.delivery.updateMany({
            where: {
              id: request.deliveryId,
              trackingNumber: null,
              deletedAt: null,
            },
            data: { status: "booking_failed" },
          });
        }
        if (request) {
          const order = await tx.order.findFirst({
            where: { id: request.orderId, deletedAt: null },
          });
          if (
            order &&
            order.status === "confirmed" &&
            order.fulfillmentState === "ready" &&
            order.inventoryState === "reserved" &&
            order.deliveryState === "pending"
          ) {
            const nextVersion = order.version + 1;
            const orderUpdated = await tx.order.updateMany({
              where: {
                id: order.id,
                version: order.version,
                status: "confirmed",
                fulfillmentState: "ready",
                inventoryState: "reserved",
                deliveryState: "pending",
                deletedAt: null,
              },
              data: {
                version: nextVersion,
                deliveryState: "not_created",
              },
            });
            if (orderUpdated.count !== 1) {
              throw new ConflictError(
                "Order changed before invalid courier payload recovery",
              );
            }
            orderVersion = nextVersion;
          }
        }

        const result: Record<string, unknown> = {
          effectKey: row.effectKey,
          outboxId: row.id,
          outcome: "terminal_failure",
          errorCode: "COURIER_INVALID_OUTBOX_PAYLOAD",
          orderId: request?.orderId ?? null,
          orderVersion,
          deliveryId: request?.deliveryId ?? null,
        };
        return {
          result,
          audit: {
            action: "courier.booking.outcome.terminal_failure.v1",
            entity: "outbox-intent",
            entityId: row.id,
            before: {
              status: current.status,
              outcomeState: current.outcomeState,
              attemptCount: current.attemptCount,
            },
            after: result,
            metadata: { principal: principal.auditActor },
          },
          events: [
            {
              key: `${commandId}:event`,
              type: "courier.booking.outcome.terminal_failure.v1",
              payload: result,
            },
          ],
          projectionInvalidations: [
            "orders:list",
            ...(request ? [`orders:${request.orderId}`] : []),
            "deliveries:list",
            ...(request?.deliveryId
              ? [`deliveries:${request.deliveryId}`]
              : []),
          ],
        };
      },
    );
    return true;
  } catch (error) {
    if (error instanceof ConflictError) return false;
    throw error;
  }
}

async function preflightInvalidPayloads(
  context: ServiceContext,
  limit: number,
): Promise<number> {
  if (limit <= 0) return 0;
  const now = new Date();
  const expiredBeforeEffect = new Date(now.getTime() - LEASE_MS);
  const rows = (await context.prisma.outboxIntent.findMany({
    where: {
      effectType: COURIER_BOOKING_EFFECT_TYPE,
      OR: [
        {
          status: { in: ["queued", "retrying"] },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        {
          status: "processing",
          effectStartedAt: null,
          lockedAt: { lte: expiredBeforeEffect },
        },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  })) as BookingOutboxRow[];

  let processed = 0;
  for (const row of rows) {
    try {
      await openBookingPayload(context, row);
    } catch {
      if (await deadLetterInvalidPayload(context, row)) processed += 1;
    }
  }
  return processed;
}

async function restoreTerminalKnownFailures(
  context: ServiceContext,
): Promise<void> {
  const rows = (await context.prisma.outboxIntent.findMany({
    where: {
      effectType: COURIER_BOOKING_EFFECT_TYPE,
      status: "dead_letter",
      outcomeState: "known_failure",
      lastErrorCode: "COURIER_PROVIDER_REJECTED_BOOKING",
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  })) as BookingOutboxRow[];

  for (const row of rows) {
    const request = await bookingRequest(context.prisma as never, row.commandId);
    if (!request) continue;
    const order = await context.prisma.order.findFirst({
      where: { id: request.orderId, deletedAt: null },
    });
    if (
      !order ||
      order.status !== "confirmed" ||
      order.fulfillmentState !== "ready" ||
      order.inventoryState !== "reserved" ||
      order.deliveryState !== "pending"
    ) {
      continue;
    }

    const commandContext: BusinessPrincipalContext = {
      ...context,
      businessPrincipal: systemBusinessPrincipal("reconciliation"),
    };
    await executeBusinessCommand(
      commandContext,
      {
        idempotencyKey: `courier-booking-terminal-recovery:${row.effectKey}`,
        commandType: "courier.booking.terminal_recovery.v1",
        aggregate: {
          type: "courier-booking-terminal-recovery",
          id: row.effectKey,
          expectedVersion: 0,
        },
        actor: "system",
        correlationId: row.effectKey,
        payload: { effectKey: row.effectKey, orderId: request.orderId },
      },
      async ({ tx, commandId, principal }) => {
        const current = await tx.order.findFirst({
          where: { id: request.orderId, deletedAt: null },
        });
        if (!current) throw new NotFoundError("Order", request.orderId);
        if (
          current.status !== "confirmed" ||
          current.fulfillmentState !== "ready" ||
          current.inventoryState !== "reserved" ||
          current.deliveryState !== "pending"
        ) {
          throw new ConflictError(
            "Courier terminal recovery requires confirmed/ready/reserved/pending",
          );
        }
        const nextVersion = current.version + 1;
        const updated = await tx.order.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: "confirmed",
            fulfillmentState: "ready",
            inventoryState: "reserved",
            deliveryState: "pending",
            deletedAt: null,
          },
          data: { version: nextVersion, deliveryState: "not_created" },
        });
        if (updated.count !== 1) {
          throw new ConflictError(
            "Order changed during courier terminal recovery",
          );
        }

        const result = {
          effectKey: row.effectKey,
          orderId: current.id,
          orderVersion: nextVersion,
          deliveryState: "not_created",
        };
        return {
          result,
          audit: {
            action: "courier.booking.terminal_recovery.v1",
            entity: "order",
            entityId: current.id,
            before: {
              version: current.version,
              deliveryState: current.deliveryState,
            },
            after: result,
            metadata: { principal: principal.auditActor },
          },
          events: [
            {
              key: `${commandId}:event`,
              type: "courier.booking.terminal_recovery.v1",
              payload: result,
            },
          ],
          projectionInvalidations: [
            "orders:list",
            `orders:${current.id}`,
          ],
        };
      },
    );
  }
}

async function defaultBookingSender(
  context: ServiceContext,
  provider: DeliveryProvider,
  request: ShipmentRequest,
): Promise<ShipmentResult> {
  const adapter = getDeliveryAdapter(provider);
  const credentials = await loadDeliveryCredentials(context, provider);
  return adapter.createShipment(request, credentials);
}

export async function drainDueCourierBookings(
  context: ServiceContext,
  limit = 10,
  sender?: CourierBookingSender,
): Promise<number> {
  const preflightProcessed = await preflightInvalidPayloads(context, limit);
  const remaining = Math.max(0, limit - preflightProcessed);

  const guardedSender: CourierBookingSender = async (provider, request) => {
    const receipt = sender
      ? await sender(provider, request)
      : await defaultBookingSender(context, provider, request);
    if (receipt.success && !receipt.trackingId.trim()) {
      throw new SahelFlowError(
        "Courier provider reported success without tracking identity",
        "COURIER_MISSING_TRACKING_RECEIPT",
        502,
      );
    }
    return receipt;
  };

  const drained =
    remaining > 0
      ? await drainLegacyCourierBookings(context, remaining, guardedSender)
      : 0;
  await restoreTerminalKnownFailures(context);
  return preflightProcessed + drained;
}