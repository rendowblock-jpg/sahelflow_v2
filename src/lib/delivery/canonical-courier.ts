import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  executeBusinessCommand,
  type BusinessTransaction,
} from "@/lib/business-truth/command-kernel";
import type {
  BusinessCommandResult,
} from "@/lib/business-truth/contracts";
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

const MAX_BOOKING_ATTEMPTS = 5;
const LEASE_MS = 120_000;
const RETRY_DELAYS_MS = [15_000, 60_000, 300_000, 1_800_000] as const;

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

type BookingPayload = z.infer<typeof bookingPayloadSchema>;

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
  receiptJson: string | null;
}

interface StoredBookingCommandRow {
  commandType: string;
  aggregateType: string;
  aggregateId: string;
  expectedVersion: number | bigint;
}

interface BookingRequestAuthority {
  orderId: string;
  deliveryId: string | null;
  provider: string | null;
}

type BookingOutcomeKind = "ambiguous" | "terminal_failure";

function safeInteger(value: number | bigint, field: string): number {
  const output = Number(value);
  if (!Number.isSafeInteger(output)) {
    throw new ConflictError(`${field} is outside the supported integer range`);
  }
  return output;
}

function retryAt(attemptCount: number, now = new Date()): Date {
  const delay =
    RETRY_DELAYS_MS[
      Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)
    ] ?? 1_800_000;
  return new Date(now.getTime() + delay);
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
  const correlationId = data.correlationId ?? randomUUID();
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
      correlationId,
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

      const active = await reservationRows(tx, order.id);
      assertReservations(active, order.items);

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
): Promise<BookingPayload> {
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

async function requestAuthority(
  tx: BusinessTransaction,
  row: BookingOutboxRow,
): Promise<BookingRequestAuthority | null> {
  return tx.canonicalDeliveryEvent.findFirst({
    where: {
      createdByCommandId: row.commandId,
      eventType: "courier_booking_requested",
    },
    orderBy: { createdAt: "desc" },
    select: {
      orderId: true,
      deliveryId: true,
      provider: true,
    },
  });
}

async function commitBookingOutcome(
  context: ServiceContext,
  row: BookingOutboxRow,
  kind: BookingOutcomeKind,
  errorCode: string,
): Promise<void> {
  const principalContext: BusinessPrincipalContext = {
    ...context,
    businessPrincipal: systemBusinessPrincipal("reconciliation"),
  };

  await executeBusinessCommand(
    principalContext,
    {
      idempotencyKey: `courier-booking-outcome:${kind}:${row.effectKey}`,
      commandType: `courier.booking.outcome.${kind}.v1`,
      aggregate: {
        type: "courier-booking-outcome",
        id: `${row.effectKey}:${kind}`,
        expectedVersion: 0,
      },
      actor: "system",
      correlationId: row.effectKey,
      payload: {
        outboxId: row.id,
        effectKey: row.effectKey,
        kind,
        errorCode,
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

      const authority = await requestAuthority(tx, row);
      const outboxUpdated = await tx.outboxIntent.updateMany({
        where: {
          id: row.id,
          status: "processing",
          leaseToken: row.leaseToken,
        },
        data:
          kind === "ambiguous"
            ? {
                status: "failed",
                outcomeState: "ambiguous",
                lastErrorCode: errorCode,
                nextAttemptAt: null,
                lockedAt: null,
                leaseToken: null,
              }
            : {
                status: "dead_letter",
                outcomeState: "known_failure",
                lastErrorCode: errorCode,
                nextAttemptAt: null,
                lockedAt: null,
                leaseToken: null,
                deadLetteredAt: new Date(),
              },
      });
      if (outboxUpdated.count !== 1) {
        throw new ConflictError(
          "Courier booking outbox lease changed before outcome commit",
        );
      }

      if (authority?.deliveryId) {
        await tx.delivery.updateMany({
          where: {
            id: authority.deliveryId,
            trackingNumber: null,
            deletedAt: null,
          },
          data: {
            status:
              kind === "ambiguous"
                ? "reconciliation_required"
                : "booking_failed",
          },
        });
      }

      let orderVersion: number | null = null;
      if (authority && kind === "terminal_failure") {
        const order = await tx.order.findFirst({
          where: { id: authority.orderId, deletedAt: null },
        });
        if (order) {
          orderVersion = order.version;
          if (
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
                "Order changed before courier terminal-failure recovery",
              );
            }
            orderVersion = nextVersion;
          }
        }
      }

      if (authority?.deliveryId) {
        await tx.canonicalDeliveryEvent.create({
          data: {
            id: randomUUID(),
            eventKey: `${commandId}:booking-outcome`,
            orderId: authority.orderId,
            deliveryId: authority.deliveryId,
            eventType:
              kind === "ambiguous"
                ? "courier_booking_outcome_ambiguous"
                : "courier_booking_terminal_failure",
            provider: authority.provider,
            reasonCode: errorCode.toLowerCase(),
            occurredAt: new Date(),
            createdByCommandId: commandId,
          },
        });
      }

      const result: Record<string, unknown> = {
        effectKey: row.effectKey,
        outboxId: row.id,
        outcome: kind,
        errorCode,
        orderId: authority?.orderId ?? null,
        orderVersion,
        deliveryId: authority?.deliveryId ?? null,
      };

      return {
        result,
        audit: {
          action: `courier.booking.outcome.${kind}.v1`,
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
            type: `courier.booking.outcome.${kind}.v1`,
            payload: result,
          },
        ],
        projectionInvalidations: [
          "orders:list",
          ...(authority ? [`orders:${authority.orderId}`] : []),
          "deliveries:list",
          ...(authority?.deliveryId
            ? [`deliveries:${authority.deliveryId}`]
            : []),
        ],
      };
    },
  );
}

async function recoverExpiredBookingLeases(
  context: ServiceContext,
): Promise<void> {
  const cutoff = new Date(Date.now() - LEASE_MS);
  const expired = (await context.prisma.outboxIntent.findMany({
    where: {
      effectType: COURIER_BOOKING_EFFECT_TYPE,
      status: "processing",
      lockedAt: { lte: cutoff },
    },
    take: 20,
  })) as BookingOutboxRow[];

  for (const row of expired) {
    if (!row.effectStartedAt) {
      await context.prisma.$transaction(async (tx) => {
        const recovered = await tx.outboxIntent.updateMany({
          where: {
            id: row.id,
            status: "processing",
            leaseToken: row.leaseToken,
            effectStartedAt: null,
          },
          data: {
            status: "retrying",
            attemptCount: { decrement: 1 },
            nextAttemptAt: new Date(),
            lockedAt: null,
            leaseToken: null,
            lastErrorCode: "COURIER_LEASE_RECOVERED_BEFORE_EFFECT",
            outcomeState: "none",
          },
        });
        if (recovered.count !== 1) return;
        await tx.auditLog.create({
          data: {
            action: "courier.booking.lease_recovered_before_effect",
            entity: "outbox-intent",
            entityId: row.id,
            actor: "system:courier-booking",
            metadata: JSON.stringify({ effectKey: row.effectKey }),
          },
        });
      });
      continue;
    }

    await commitBookingOutcome(
      context,
      row,
      "ambiguous",
      "COURIER_EFFECT_LEASE_EXPIRED_AFTER_START",
    );
  }
}

async function claimBookingEffect(
  context: ServiceContext,
): Promise<BookingOutboxRow | null> {
  await recoverExpiredBookingLeases(context);
  const now = new Date();
  const candidate = (await context.prisma.outboxIntent.findFirst({
    where: {
      effectType: COURIER_BOOKING_EFFECT_TYPE,
      status: { in: ["queued", "retrying"] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
  })) as BookingOutboxRow | null;
  if (!candidate) return null;

  const leaseToken = randomUUID();
  const claimed = await context.prisma.outboxIntent.updateMany({
    where: {
      id: candidate.id,
      status: { in: ["queued", "retrying"] },
      attemptCount: candidate.attemptCount,
    },
    data: {
      status: "processing",
      attemptCount: { increment: 1 },
      lockedAt: now,
      leaseToken,
      effectStartedAt: null,
      lastErrorCode: null,
      outcomeState: "none",
    },
  });
  if (claimed.count !== 1) return null;

  return (await context.prisma.outboxIntent.findUnique({
    where: { id: candidate.id },
  })) as BookingOutboxRow | null;
}

async function knownBookingFailure(
  context: ServiceContext,
  row: BookingOutboxRow,
  payload: BookingPayload,
  errorCode: string,
): Promise<void> {
  if (row.attemptCount >= MAX_BOOKING_ATTEMPTS) {
    await commitBookingOutcome(
      context,
      row,
      "terminal_failure",
      errorCode,
    );
    return;
  }

  await context.prisma.$transaction(async (tx) => {
    const updated = await tx.outboxIntent.updateMany({
      where: {
        id: row.id,
        status: "processing",
        leaseToken: row.leaseToken,
      },
      data: {
        status: "retrying",
        outcomeState: "known_failure",
        lastErrorCode: errorCode,
        nextAttemptAt: retryAt(row.attemptCount),
        lockedAt: null,
        leaseToken: null,
        effectStartedAt: null,
      },
    });
    if (updated.count !== 1) return;

    await tx.delivery.updateMany({
      where: {
        id: payload.deliveryId,
        trackingNumber: null,
        deletedAt: null,
      },
      data: { status: "booking_retrying" },
    });
    await tx.auditLog.create({
      data: {
        action: "courier.booking.retry_scheduled",
        entity: "outbox-intent",
        entityId: row.id,
        actor: "system:courier-booking",
        metadata: JSON.stringify({
          effectKey: row.effectKey,
          errorCode,
          attemptCount: row.attemptCount,
        }),
      },
    });
  });
}

async function commitBookingReceipt(
  context: ServiceContext,
  row: BookingOutboxRow,
  payload: BookingPayload,
  receipt: ShipmentResult,
): Promise<void> {
  const trackingNumber = receipt.trackingId.trim();
  if (!trackingNumber) {
    await commitBookingOutcome(
      context,
      row,
      "ambiguous",
      "COURIER_MISSING_TRACKING_RECEIPT",
    );
    return;
  }

  const principalContext: BusinessPrincipalContext = {
    ...context,
    businessPrincipal: systemBusinessPrincipal("reconciliation"),
  };

  await executeBusinessCommand(
    principalContext,
    {
      idempotencyKey: `courier-receipt:${row.effectKey}`,
      commandType: "courier.booking.receipt.v1",
      aggregate: {
        type: "courier-booking-receipt",
        id: row.effectKey,
        expectedVersion: 0,
      },
      actor: "system",
      correlationId: row.effectKey,
      payload: {
        effectKey: row.effectKey,
        deliveryId: payload.deliveryId,
        provider: payload.provider,
        trackingNumber,
      },
    },
    async ({ tx, commandId, principal }) => {
      const delivery = await tx.delivery.findFirst({
        where: {
          id: payload.deliveryId,
          orderId: payload.orderId,
          deletedAt: null,
        },
      });
      if (!delivery) throw new NotFoundError("Delivery", payload.deliveryId);
      if (
        delivery.trackingNumber &&
        delivery.trackingNumber !== trackingNumber
      ) {
        throw new ConflictError(
          "Provider receipt conflicts with the stored tracking identity",
        );
      }

      const deliveryUpdated = await tx.delivery.updateMany({
        where: {
          id: delivery.id,
          provider: payload.provider,
          trackingNumber: delivery.trackingNumber,
          deletedAt: null,
        },
        data: {
          trackingNumber,
          labelUrl: receipt.labelUrl ?? null,
          cost: receipt.cost,
          estimatedDelivery: receipt.estimatedDelivery
            ? new Date(receipt.estimatedDelivery)
            : null,
          status: "created",
        },
      });
      if (deliveryUpdated.count !== 1) {
        throw new ConflictError("Delivery changed before receipt commit");
      }

      const outboxUpdated = await tx.outboxIntent.updateMany({
        where: {
          id: row.id,
          effectKey: row.effectKey,
          status: "processing",
          leaseToken: row.leaseToken,
        },
        data: {
          status: "succeeded",
          outcomeState: "known_success",
          receiptJson: JSON.stringify({
            trackingNumber,
            provider: payload.provider,
            labelRecorded: Boolean(receipt.labelUrl),
            cost: receipt.cost,
          }),
          succeededAt: new Date(),
          nextAttemptAt: null,
          lockedAt: null,
          leaseToken: null,
          lastErrorCode: null,
        },
      });
      if (outboxUpdated.count !== 1) {
        throw new ConflictError(
          "Courier outbox lease changed before receipt commit",
        );
      }

      await tx.canonicalDeliveryEvent.create({
        data: {
          id: randomUUID(),
          eventKey: `${commandId}:booking-receipt`,
          orderId: payload.orderId,
          deliveryId: payload.deliveryId,
          eventType: "courier_booking_created",
          provider: payload.provider,
          providerEventId: `booking:${trackingNumber}`,
          reasonCode: "provider_booking_receipt",
          occurredAt: new Date(),
          createdByCommandId: commandId,
        },
      });

      const result = {
        deliveryId: payload.deliveryId,
        orderId: payload.orderId,
        provider: payload.provider,
        trackingNumber,
        bookingState: "created",
      };

      return {
        result,
        audit: {
          action: "courier.booking.receipt.v1",
          entity: "delivery",
          entityId: payload.deliveryId,
          before: {
            status: delivery.status,
            trackingNumber: delivery.trackingNumber,
          },
          after: result,
          metadata: { principal: principal.auditActor },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "courier.booking.receipt.v1",
            payload: result,
          },
        ],
        projectionInvalidations: [
          "deliveries:list",
          `deliveries:${payload.deliveryId}`,
          `orders:${payload.orderId}`,
        ],
      };
    },
  );
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
  let processed = 0;

  while (processed < limit) {
    const row = await claimBookingEffect(context);
    if (!row) break;

    let payload: BookingPayload;
    try {
      payload = await openBookingPayload(context, row);
    } catch {
      await commitBookingOutcome(
        context,
        row,
        "terminal_failure",
        "COURIER_INVALID_OUTBOX_PAYLOAD",
      );
      processed += 1;
      continue;
    }

    const started = await context.prisma.outboxIntent.updateMany({
      where: {
        id: row.id,
        status: "processing",
        leaseToken: row.leaseToken,
        effectStartedAt: null,
      },
      data: { effectStartedAt: new Date() },
    });
    if (started.count !== 1) continue;

    try {
      const receipt = sender
        ? await sender(payload.provider, payload.request)
        : await defaultBookingSender(
            context,
            payload.provider,
            payload.request,
          );

      if (!receipt.success) {
        await knownBookingFailure(
          context,
          row,
          payload,
          "COURIER_PROVIDER_REJECTED_BOOKING",
        );
      } else {
        await commitBookingReceipt(context, row, payload, receipt);
      }
    } catch (error) {
      await commitBookingOutcome(
        context,
        row,
        "ambiguous",
        error instanceof SahelFlowError
          ? error.code
          : "COURIER_PROVIDER_OUTCOME_AMBIGUOUS",
      );
    }

    processed += 1;
  }

  return processed;
}
