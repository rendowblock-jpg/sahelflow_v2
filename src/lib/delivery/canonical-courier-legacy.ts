import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import {
  executeBusinessCommand,
  type BusinessTransaction,
} from "@/lib/business-truth/command-kernel";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { openBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";
import type {
  BusinessCommandResult,
  FinancialMovementFact,
  InventoryMovementFact,
  InventoryReservationFact,
} from "@/lib/business-truth/contracts";
import {
  providerBusinessPrincipal,
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
  type DeliveryStatus,
  type ShipmentRequest,
  type ShipmentResult,
  type TrackingEvent,
  type TrackingInfo,
} from "@/lib/integrations/delivery/types";
import { isCanonicalOrderAuthority } from "@/lib/orders/manual-order-authority";
import { assertProviderCapability } from "@/lib/integrations/delivery/provider-capability";
import { executeCanonicalOrderRecovery } from "@/lib/orders/canonical-order-recovery";
import {
  ConflictError,
  NotFoundError,
  SahelFlowError,
  ValidationError,
} from "@/types/errors";

export const COURIER_BOOKING_EFFECT_TYPE = "courier.shipment.create.v1";
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

const reconciliationSchema = z
  .object({
    deliveryId: z.string().trim().min(1),
    action: z.enum(["confirm_created", "confirm_not_created"]),
    expectedVersion: z.number().int().positive().safe(),
    trackingNumber: z.string().trim().min(1).max(240).optional(),
    labelUrl: z.string().url().max(2000).nullable().optional(),
    cost: z.number().int().nonnegative().safe().optional(),
    estimatedDelivery: z.coerce.date().nullable().optional(),
    reasonCode: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9._-]*$/i)
      .transform((value) => value.toLowerCase()),
    idempotencyKey: z.string().trim().min(8).max(200),
    correlationId: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((input, context) => {
    if (input.action === "confirm_created" && !input.trackingNumber) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trackingNumber"],
        message: "A manually confirmed provider shipment requires tracking identity",
      });
    }
    if (input.action === "confirm_not_created") {
      for (const field of ["trackingNumber", "labelUrl", "cost", "estimatedDelivery"] as const) {
        if (input[field] !== undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is valid only when confirming a created shipment`,
          });
        }
      }
    }
  });

const trackingEventSchema = z.object({
  deliveryId: z.string().trim().min(1),
  provider: providerSchema,
  providerEventId: z.string().trim().min(1).max(240),
  status: z.enum([
    "pending",
    "created",
    "picked_up",
    "in_transit",
    "at_hub",
    "out_for_delivery",
    "delivered",
  ]),
  occurredAt: z.coerce.date(),
  reasonCode: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9._-]*$/i)
    .transform((value) => value.toLowerCase()),
  expectedVersion: z.number().int().positive().safe(),
  idempotencyKey: z.string().trim().min(8).max(240),
  correlationId: z.string().trim().min(1).max(240).optional(),
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
  receiptJson: string | null;
}

export interface CourierBookingResult {
  readonly [key: string]: unknown;
  orderId: string;
  orderNumber: string;
  orderVersion: number;
  deliveryId: string;
  provider: DeliveryProvider;
  bookingState: string;
  effectKey: string;
}

export interface CourierPosition {
  orderId: string;
  orderVersion: number;
  orderStatus: string;
  fulfillmentState: string | null;
  deliveryState: string | null;
  inventoryState: string | null;
  codState: string | null;
  delivery: null | {
    id: string;
    provider: string;
    trackingNumber: string | null;
    labelUrl: string | null;
    cost: number | null;
    status: string;
    estimatedDelivery: string | null;
  };
  effect: null | {
    effectKey: string;
    state: string;
    attemptCount: number;
    nextAttemptAt: string | null;
    errorCode: string | null;
    requiresReconciliation: boolean;
  };
  availableActions: Array<"book" | "sync" | "reconcile_created" | "reconcile_not_created">;
}

function safeInteger(value: number | bigint, field: string): number {
  const output = Number(value);
  if (!Number.isSafeInteger(output)) {
    throw new ConflictError(`${field} is outside the supported integer range`);
  }
  return output;
}

function retryAt(attemptCount: number, now = new Date()): Date {
  const delay = RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)] ?? 1_800_000;
  return new Date(now.getTime() + delay);
}

function stableEventId(
  provider: string,
  trackingNumber: string,
  event: Pick<TrackingEvent, "status" | "timestamp" | "location" | "details">,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        provider,
        trackingNumber,
        status: event.status,
        timestamp: event.timestamp,
        location: event.location ?? null,
        details: event.details,
      }),
    )
    .digest("hex");
}

function canonicalDeliveryState(status: DeliveryStatus): string {
  switch (status) {
    case "pending":
    case "created":
      return "pending";
    case "picked_up":
      return "picked_up";
    case "out_for_delivery":
      return "out_for_delivery";
    case "delivered":
      return "delivered";
    case "failed":
      return "failed";
    case "refused":
      return "refused";
    case "returned":
      return "return_in_transit";
    case "at_hub":
    case "in_transit":
      return "in_transit";
  }
}

const DELIVERY_RANK: Readonly<Record<string, number>> = {
  booking_queued: -2,
  booking_retrying: -2,
  reconciliation_required: -1,
  pending: 0,
  created: 0,
  picked_up: 1,
  in_transit: 2,
  at_hub: 2,
  out_for_delivery: 3,
  delivered: 4,
};

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

function assertReservations(
  rows: readonly ReservationRow[],
  items: readonly {
    id: string;
    productId: string | null;
    productVariantId: string | null;
    quantity: number;
  }[],
  expectedState: "active" | "consumed",
): void {
  if (rows.length !== items.length) {
    throw new ConflictError(
      `Courier inventory authority requires ${items.length} ${expectedState} reservations, found ${rows.length}`,
    );
  }
  const byItem = new Map(rows.map((row) => [row.orderItemId, row]));
  if (byItem.size !== rows.length) {
    throw new ConflictError("Courier inventory authority contains duplicate reservations");
  }
  for (const item of items) {
    if (!item.productId) {
      throw new ValidationError(`Order item '${item.id}' has no product identity`, "items.productId");
    }
    const reservation = byItem.get(item.id);
    if (
      !reservation ||
      reservation.productId !== item.productId ||
      reservation.productVariantId !== item.productVariantId ||
      safeInteger(reservation.quantity, "reservation quantity") !== item.quantity ||
      reservation.state !== expectedState
    ) {
      throw new ConflictError(`Reservation authority does not match order item '${item.id}'`);
    }
  }
}

function movement(
  commandId: string,
  orderId: string,
  reservation: ReservationRow,
  occurredAt: Date,
): InventoryMovementFact {
  return {
    movementKey: `${commandId}:courier-pickup:${reservation.id}`,
    movementType: "courier_pickup_dispatched",
    orderId,
    orderItemId: reservation.orderItemId ?? undefined,
    reservationId: reservation.id,
    productId: reservation.productId,
    productVariantId: reservation.productVariantId ?? undefined,
    quantity: safeInteger(reservation.quantity, "reservation quantity"),
    fromPosition: "reserved",
    toPosition: "outbound",
    reason: `Courier pickup moved canonical order ${orderId} to outbound inventory`,
    occurredAt,
  };
}

async function latestBookingOutbox(
  context: ServiceContext,
  deliveryId: string,
): Promise<BookingOutboxRow | null> {
  const request = await context.prisma.canonicalDeliveryEvent.findFirst({
    where: { deliveryId, eventType: "courier_booking_requested" },
    orderBy: { createdAt: "desc" },
    select: { createdByCommandId: true },
  });
  if (!request) return null;
  const row = await context.prisma.outboxIntent.findFirst({
    where: {
      commandId: request.createdByCommandId,
      effectType: COURIER_BOOKING_EFFECT_TYPE,
    },
  });
  return row as BookingOutboxRow | null;
}

export async function queueCanonicalCourierBooking(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CourierBookingResult>> {
  const data = bookingSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "courier.booking.queue.v1",
      aggregate: {
        type: "canonical-courier-booking",
        id: data.orderId,
        expectedVersion: 0,
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
        throw new ValidationError("Courier booking requires canonical order authority", "order.authority");
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
      const active = await reservationRows(tx, order.id, "active");
      assertReservations(active, order.items, "active");

      let deliveryId: string;
      if (order.delivery) {
        if (
          order.delivery.trackingNumber ||
          !["booking_failed", "not_created"].includes(order.delivery.status)
        ) {
          throw new ConflictError("Existing courier authority requires reconciliation before rebooking");
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
        if (reused.count !== 1) throw new ConflictError("Courier delivery changed before rebooking");
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
      if (updated.count !== 1) throw new ConflictError("Order changed while courier booking was queued");

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
        weight: Math.max(1, order.items.reduce((sum, item) => sum + item.quantity, 0)),
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
            payload: { deliveryId, orderId: order.id, provider: data.provider, request },
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

async function recoverExpiredBookingLeases(context: ServiceContext): Promise<void> {
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

    const payload = await openBookingPayload(context, row).catch(() => null);
    await context.prisma.$transaction(async (tx) => {
      const marked = await tx.outboxIntent.updateMany({
        where: {
          id: row.id,
          status: "processing",
          leaseToken: row.leaseToken,
        },
        data: {
          status: "failed",
          outcomeState: "ambiguous",
          lastErrorCode: "COURIER_EFFECT_LEASE_EXPIRED_AFTER_START",
          nextAttemptAt: null,
          lockedAt: null,
          leaseToken: null,
        },
      });
      if (marked.count !== 1) return;
      if (payload) {
        await tx.delivery.updateMany({
          where: { id: payload.deliveryId, trackingNumber: null, deletedAt: null },
          data: { status: "reconciliation_required" },
        });
      }
      await tx.auditLog.create({
        data: {
          action: "courier.booking.outcome_ambiguous",
          entity: "outbox-intent",
          entityId: row.id,
          actor: "system:courier-booking",
          metadata: JSON.stringify({ effectKey: row.effectKey }),
        },
      });
    });
  }
}

async function claimBookingEffect(context: ServiceContext): Promise<BookingOutboxRow | null> {
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
  payload: z.infer<typeof bookingPayloadSchema>,
  errorCode: string,
): Promise<void> {
  const exhausted = row.attemptCount >= MAX_BOOKING_ATTEMPTS;
  await context.prisma.$transaction(async (tx) => {
    const updated = await tx.outboxIntent.updateMany({
      where: {
        id: row.id,
        status: "processing",
        leaseToken: row.leaseToken,
      },
      data: exhausted
        ? {
            status: "dead_letter",
            outcomeState: "known_failure",
            lastErrorCode: errorCode,
            nextAttemptAt: null,
            lockedAt: null,
            leaseToken: null,
            deadLetteredAt: new Date(),
          }
        : {
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
      where: { id: payload.deliveryId, trackingNumber: null, deletedAt: null },
      data: { status: exhausted ? "booking_failed" : "booking_retrying" },
    });
  });
}

async function ambiguousBookingFailure(
  context: ServiceContext,
  row: BookingOutboxRow,
  payload: z.infer<typeof bookingPayloadSchema>,
  errorCode: string,
): Promise<void> {
  await context.prisma.$transaction(async (tx) => {
    const updated = await tx.outboxIntent.updateMany({
      where: {
        id: row.id,
        status: "processing",
        leaseToken: row.leaseToken,
      },
      data: {
        status: "failed",
        outcomeState: "ambiguous",
        lastErrorCode: errorCode,
        nextAttemptAt: null,
        lockedAt: null,
        leaseToken: null,
      },
    });
    if (updated.count !== 1) return;
    await tx.delivery.updateMany({
      where: { id: payload.deliveryId, trackingNumber: null, deletedAt: null },
      data: { status: "reconciliation_required" },
    });
  });
}

async function commitBookingReceipt(
  context: ServiceContext,
  row: BookingOutboxRow,
  payload: z.infer<typeof bookingPayloadSchema>,
  receipt: ShipmentResult,
): Promise<void> {
  const trackingNumber = receipt.trackingId.trim();
  if (!trackingNumber) {
    await knownBookingFailure(context, row, payload, "COURIER_MISSING_TRACKING_RECEIPT");
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
        id: payload.deliveryId,
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
        where: { id: payload.deliveryId, orderId: payload.orderId, deletedAt: null },
      });
      if (!delivery) throw new NotFoundError("Delivery", payload.deliveryId);
      if (delivery.trackingNumber && delivery.trackingNumber !== trackingNumber) {
        throw new ConflictError("Provider receipt conflicts with the stored tracking identity");
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
      if (deliveryUpdated.count !== 1) throw new ConflictError("Delivery changed before receipt commit");

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
      if (outboxUpdated.count !== 1) throw new ConflictError("Courier outbox lease changed before receipt commit");

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
          before: { status: delivery.status, trackingNumber: delivery.trackingNumber },
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

export type CourierBookingSender = (
  provider: DeliveryProvider,
  request: ShipmentRequest,
) => Promise<ShipmentResult>;

async function defaultBookingSender(
  context: ServiceContext,
  provider: DeliveryProvider,
  request: ShipmentRequest,
): Promise<ShipmentResult> {
  await assertProviderCapability(context, provider, "booking");
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
    const payload = await openBookingPayload(context, row);

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
        : await defaultBookingSender(context, payload.provider, payload.request);
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
      await ambiguousBookingFailure(
        context,
        row,
        payload,
        error instanceof SahelFlowError
          ? error.code
          : "COURIER_PROVIDER_OUTCOME_AMBIGUOUS",
      );
    }
    processed += 1;
  }
  return processed;
}

export async function reconcileCanonicalCourierBooking(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<Record<string, unknown>>> {
  const data = reconciliationSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: `courier.booking.reconcile.${data.action}.v1`,
      aggregate: {
        type: "courier-booking-reconciliation",
        id: `${data.deliveryId}:${data.action}`,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const delivery = await tx.delivery.findFirst({
        where: { id: data.deliveryId, deletedAt: null },
        include: { order: true },
      });
      if (!delivery) throw new NotFoundError("Delivery", data.deliveryId);
      if (!isCanonicalOrderAuthority(delivery.order.source, delivery.order.sourceMetadata)) {
        throw new ValidationError("Courier reconciliation requires canonical order authority", "order.authority");
      }
      if (delivery.order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${delivery.orderId} version conflict: expected ${data.expectedVersion}, current ${delivery.order.version}`,
        );
      }
      if (delivery.status !== "reconciliation_required") {
        throw new ConflictError("Courier booking is not awaiting reconciliation");
      }

      const request = await tx.canonicalDeliveryEvent.findFirst({
        where: { deliveryId: delivery.id, eventType: "courier_booking_requested" },
        orderBy: { createdAt: "desc" },
        select: { createdByCommandId: true },
      });
      if (!request) throw new ConflictError("Courier booking request authority is missing");
      const outbox = await tx.outboxIntent.findFirst({
        where: {
          commandId: request.createdByCommandId,
          effectType: COURIER_BOOKING_EFFECT_TYPE,
        },
      });
      if (!outbox) throw new ConflictError("Courier booking effect authority is missing");
      if (outbox.outcomeState !== "ambiguous") {
        throw new ConflictError("Only an ambiguous courier effect can be reconciled manually");
      }

      let nextVersion = delivery.order.version;
      if (data.action === "confirm_created") {
        const trackingNumber = data.trackingNumber!;
        await tx.delivery.update({
          where: { id: delivery.id },
          data: {
            trackingNumber,
            labelUrl: data.labelUrl ?? null,
            cost: data.cost ?? null,
            estimatedDelivery: data.estimatedDelivery ?? null,
            status: "created",
          },
        });
        await tx.outboxIntent.update({
          where: { id: outbox.id },
          data: {
            status: "succeeded",
            outcomeState: "manual_success",
            receiptJson: JSON.stringify({
              trackingNumber,
              provider: delivery.provider,
              manuallyReconciled: true,
            }),
            succeededAt: new Date(),
            lastErrorCode: null,
          },
        });
      } else {
        nextVersion += 1;
        const orderUpdated = await tx.order.updateMany({
          where: {
            id: delivery.orderId,
            version: delivery.order.version,
            status: "confirmed",
            deliveryState: "pending",
            deletedAt: null,
          },
          data: { version: nextVersion, deliveryState: "not_created" },
        });
        if (orderUpdated.count !== 1) throw new ConflictError("Order changed during courier reconciliation");
        await tx.delivery.update({
          where: { id: delivery.id },
          data: { status: "booking_failed" },
        });
        await tx.outboxIntent.update({
          where: { id: outbox.id },
          data: {
            status: "dead_letter",
            outcomeState: "manual_not_created",
            deadLetteredAt: new Date(),
            lastErrorCode: "COURIER_CONFIRMED_NOT_CREATED",
          },
        });
      }

      await tx.canonicalDeliveryEvent.create({
        data: {
          id: randomUUID(),
          eventKey: `${commandId}:reconciliation`,
          orderId: delivery.orderId,
          deliveryId: delivery.id,
          eventType:
            data.action === "confirm_created"
              ? "courier_booking_manually_confirmed"
              : "courier_booking_manually_rejected",
          provider: delivery.provider,
          providerEventId:
            data.action === "confirm_created"
              ? `manual-booking:${data.trackingNumber}`
              : undefined,
          reasonCode: data.reasonCode,
          occurredAt: new Date(),
          createdByCommandId: commandId,
        },
      });

      const result = {
        orderId: delivery.orderId,
        orderVersion: nextVersion,
        deliveryId: delivery.id,
        action: data.action,
        trackingNumber: data.trackingNumber ?? null,
      };
      return {
        result,
        audit: {
          action: `courier.booking.reconcile.${data.action}.v1`,
          entity: "delivery",
          entityId: delivery.id,
          before: { status: delivery.status, outcomeState: outbox.outcomeState },
          after: result,
          metadata: { reasonCode: data.reasonCode, principal: principal.auditActor },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: `courier.booking.reconcile.${data.action}.v1`,
            payload: result,
          },
        ],
        projectionInvalidations: [
          "orders:list",
          `orders:${delivery.orderId}`,
          "deliveries:list",
          `deliveries:${delivery.id}`,
        ],
      };
    },
  );
}

export async function getCanonicalCourierPosition(
  context: ServiceContext,
  orderId: string,
): Promise<CourierPosition> {
  const order = await context.prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: { delivery: true },
  });
  if (!order) throw new NotFoundError("Order", orderId);
  if (!isCanonicalOrderAuthority(order.source, order.sourceMetadata)) {
    throw new ValidationError("Courier position requires canonical order authority", "order.authority");
  }
  const delivery = order.delivery;
  const outbox = delivery ? await latestBookingOutbox(context, delivery.id) : null;
  const requiresReconciliation =
    delivery?.status === "reconciliation_required" ||
    outbox?.outcomeState === "ambiguous";
  const availableActions: CourierPosition["availableActions"] = [];
  if (
    order.status === "confirmed" &&
    order.fulfillmentState === "ready" &&
    order.inventoryState === "reserved" &&
    order.deliveryState === "not_created" &&
    (!delivery || ["booking_failed", "not_created"].includes(delivery.status))
  ) {
    availableActions.push("book");
  }
  if (delivery?.trackingNumber && ["created", "picked_up", "in_transit", "at_hub", "out_for_delivery"].includes(delivery.status)) {
    availableActions.push("sync");
  }
  if (requiresReconciliation) {
    availableActions.push("reconcile_created", "reconcile_not_created");
  }

  return {
    orderId: order.id,
    orderVersion: order.version,
    orderStatus: order.status,
    fulfillmentState: order.fulfillmentState,
    deliveryState: order.deliveryState,
    inventoryState: order.inventoryState,
    codState: order.codState,
    delivery: delivery
      ? {
          id: delivery.id,
          provider: delivery.provider,
          trackingNumber: delivery.trackingNumber,
          labelUrl: delivery.labelUrl,
          cost: delivery.cost,
          status: delivery.status,
          estimatedDelivery: delivery.estimatedDelivery?.toISOString() ?? null,
        }
      : null,
    effect: outbox
      ? {
          effectKey: outbox.effectKey,
          state:
            outbox.status === "failed" && outbox.outcomeState === "ambiguous"
              ? "ambiguous"
              : outbox.status,
          attemptCount: outbox.attemptCount,
          nextAttemptAt: outbox.nextAttemptAt?.toISOString() ?? null,
          errorCode: outbox.lastErrorCode,
          requiresReconciliation,
        }
      : null,
    availableActions,
  };
}

export async function ingestCanonicalCourierTrackingEvent(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<Record<string, unknown>>> {
  const data = trackingEventSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "courier.tracking.ingest.v1",
      aggregate: {
        type: "courier-provider-event",
        id: `${data.provider}:${data.providerEventId}`,
        expectedVersion: 0,
      },
      actor: "provider",
      correlationId,
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const delivery = await tx.delivery.findFirst({
        where: { id: data.deliveryId, provider: data.provider, deletedAt: null },
        include: { order: { include: { items: true } } },
      });
      if (!delivery) throw new NotFoundError("Delivery", data.deliveryId);
      const order = delivery.order;
      if (!isCanonicalOrderAuthority(order.source, order.sourceMetadata)) {
        throw new ValidationError("Courier tracking requires canonical order authority", "order.authority");
      }
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }

      const incomingRank = DELIVERY_RANK[data.status] ?? 0;
      const currentRank = DELIVERY_RANK[delivery.status] ?? -1;
      const outOfOrder = incomingRank < currentRank;
      const reservations: InventoryReservationFact[] = [];
      const inventoryMovements: InventoryMovementFact[] = [];
      const financialMovements: FinancialMovementFact[] = [];
      let nextVersion = order.version;
      let orderStatus = order.status;
      let fulfillmentState = order.fulfillmentState;
      let deliveryState = order.deliveryState;
      let inventoryState = order.inventoryState;
      let codState = order.codState;
      let shippedAt = order.shippedAt;
      let deliveredAt = order.deliveredAt;
      let orderChanged = false;

      if (!outOfOrder && incomingRank >= 1) {
        if (
          order.status === "confirmed" &&
          order.fulfillmentState === "ready" &&
          order.inventoryState === "reserved" &&
          order.deliveryState === "pending"
        ) {
          const active = await reservationRows(tx, order.id, "active");
          assertReservations(active, order.items, "active");
          reservations.push(
            ...active.map((reservation) => ({
              operation: "consume" as const,
              id: reservation.id,
            })),
          );
          inventoryMovements.push(
            ...active.map((reservation) => movement(commandId, order.id, reservation, data.occurredAt)),
          );
          orderStatus = "shipped";
          fulfillmentState = "shipped";
          inventoryState = "outbound";
          codState = "not_expected";
          shippedAt = data.occurredAt;
          orderChanged = true;
        } else if (
          order.status !== "shipped" &&
          order.status !== "delivered"
        ) {
          throw new ConflictError(
            `Courier pickup cannot safely advance order from ${order.status}/${order.fulfillmentState}/${order.inventoryState}/${order.deliveryState}`,
          );
        }
        deliveryState = canonicalDeliveryState(data.status);
        if (deliveryState !== order.deliveryState) orderChanged = true;
      }

      if (!outOfOrder && data.status === "delivered") {
        if (orderStatus !== "shipped" || inventoryState !== "outbound") {
          throw new ConflictError("Courier delivery requires shipped outbound inventory authority");
        }
        const active = await reservationRows(tx, order.id, "active");
        if (active.length > 0) throw new ConflictError("Delivered courier order retains active reservations");
        const consumed = await reservationRows(tx, order.id, "consumed");
        assertReservations(consumed, order.items, "consumed");
        if (!Number.isSafeInteger(order.totalPrice) || order.totalPrice <= 0) {
          throw new ValidationError("Delivered courier order requires positive integer DZD COD", "order.totalPrice");
        }
        const customerUpdated = await tx.customer.updateMany({
          where: { id: order.customerId, deletedAt: null },
          data: {
            orderCount: { increment: 1 },
            totalSpent: { increment: order.totalPrice },
          },
        });
        if (customerUpdated.count !== 1) throw new ConflictError("Customer authority is missing for courier delivery");
        orderStatus = "delivered";
        fulfillmentState = "closed";
        deliveryState = "delivered";
        inventoryState = "settled";
        codState = "receivable";
        deliveredAt = data.occurredAt;
        orderChanged = true;
        financialMovements.push({
          movementKey: `${commandId}:cod-receivable`,
          movementType: "cod_receivable_created",
          orderId: order.id,
          amount: order.totalPrice,
          currency: "DZD",
          counterparty: data.provider,
          reference: delivery.trackingNumber ?? undefined,
          reason: `Courier delivery created COD receivable for canonical order ${order.id}`,
          occurredAt: data.occurredAt,
        });
      }

      if (!outOfOrder) {
        const deliveryUpdated = await tx.delivery.updateMany({
          where: {
            id: delivery.id,
            provider: data.provider,
            status: delivery.status,
            deletedAt: null,
          },
          data: { status: data.status },
        });
        if (deliveryUpdated.count !== 1) throw new ConflictError("Delivery changed during tracking ingestion");
      }

      if (orderChanged) {
        nextVersion += 1;
        const orderUpdated = await tx.order.updateMany({
          where: {
            id: order.id,
            version: order.version,
            status: order.status,
            deletedAt: null,
          },
          data: {
            version: nextVersion,
            status: orderStatus,
            fulfillmentState,
            deliveryState,
            inventoryState,
            codState,
            shippedAt,
            deliveredAt,
            ...(data.status === "delivered"
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
        if (orderUpdated.count !== 1) throw new ConflictError("Order changed during tracking ingestion");
      }

      await tx.canonicalDeliveryEvent.create({
        data: {
          id: randomUUID(),
          eventKey: `${commandId}:tracking-event`,
          orderId: order.id,
          deliveryId: delivery.id,
          eventType: outOfOrder
            ? "courier_tracking_ignored_out_of_order"
            : `courier_tracking_${data.status}`,
          provider: data.provider,
          providerEventId: data.providerEventId,
          reasonCode: data.reasonCode,
          occurredAt: data.occurredAt,
          createdByCommandId: commandId,
        },
      });

      const result = {
        orderId: order.id,
        orderVersion: nextVersion,
        deliveryId: delivery.id,
        provider: data.provider,
        providerEventId: data.providerEventId,
        providerStatus: data.status,
        orderStatus,
        deliveryState,
        outOfOrder,
      };
      return {
        result,
        audit: {
          action: "courier.tracking.ingest.v1",
          entity: "delivery",
          entityId: delivery.id,
          before: {
            orderVersion: order.version,
            orderStatus: order.status,
            deliveryStatus: delivery.status,
          },
          after: result,
          metadata: { principal: principal.auditActor },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "courier.tracking.ingested.v1",
            payload: result,
          },
        ],
        reservations,
        inventoryMovements,
        financialMovements,
        projectionInvalidations: [
          "orders:list",
          `orders:${order.id}`,
          "deliveries:list",
          `deliveries:${delivery.id}`,
          "dashboard:orders",
          "accounting:cod",
        ],
      };
    },
  );
}

export async function synchronizeCanonicalCourierTracking(
  context: ServiceContext,
  orderId: string,
): Promise<{ position: CourierPosition; events: Array<Record<string, unknown>> }> {
  const position = await getCanonicalCourierPosition(context, orderId);
  const delivery = position.delivery;
  if (!delivery?.trackingNumber) {
    throw new ValidationError("Courier tracking identity is missing", "delivery.trackingNumber");
  }
  if (!providerSchema.safeParse(delivery.provider).success) {
    throw new ValidationError("Delivery provider is not supported", "delivery.provider");
  }
  const provider = delivery.provider as DeliveryProvider;
  await assertProviderCapability(context, provider, "tracking");
  const adapter = getDeliveryAdapter(provider);
  const credentials = await loadDeliveryCredentials(context, provider);
  const tracking = await adapter.syncTracking(delivery.trackingNumber, credentials);
  const events = tracking.events.length > 0
    ? [...tracking.events].sort(
        (left, right) =>
          new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
      )
    : [
        {
          status: tracking.status,
          timestamp: new Date().toISOString(),
          details: `Provider snapshot: ${tracking.status}`,
        } satisfies TrackingEvent,
      ];

  let expectedVersion = position.orderVersion;
  const outcomes: Array<Record<string, unknown>> = [];
  for (const event of events) {
    if (event.status === "failed" || event.status === "refused") {
      const recovery = await executeCanonicalOrderRecovery(
        {
          ...context,
          businessPrincipal: providerBusinessPrincipal(provider),
        },
        {
          orderId,
          action: event.status === "failed" ? "delivery_failed" : "delivery_refused",
          expectedVersion,
          reasonCode: `provider-${provider}-${event.status}`,
          providerEventId: stableEventId(provider, delivery.trackingNumber, event),
          occurredAt: event.timestamp,
          idempotencyKey: `courier-recovery:${provider}:${stableEventId(provider, delivery.trackingNumber, event)}`,
          correlationId: `courier:${provider}:${delivery.id}`,
        },
      );
      expectedVersion = recovery.result.version;
      outcomes.push(recovery.result as unknown as Record<string, unknown>);
      continue;
    }
    if (event.status === "returned") {
      const recovery = await executeCanonicalOrderRecovery(
        {
          ...context,
          businessPrincipal: providerBusinessPrincipal(provider),
        },
        {
          orderId,
          action: "return_in_transit",
          expectedVersion,
          reasonCode: `provider-${provider}-return`,
          providerEventId: stableEventId(provider, delivery.trackingNumber, event),
          occurredAt: event.timestamp,
          idempotencyKey: `courier-return:${provider}:${stableEventId(provider, delivery.trackingNumber, event)}`,
          correlationId: `courier:${provider}:${delivery.id}`,
        },
      );
      expectedVersion = recovery.result.version;
      outcomes.push(recovery.result as unknown as Record<string, unknown>);
      continue;
    }
    const eventId = stableEventId(provider, delivery.trackingNumber, event);
    const ingested = await ingestCanonicalCourierTrackingEvent(
      {
        ...context,
        businessPrincipal: providerBusinessPrincipal(provider),
      },
      {
        deliveryId: delivery.id,
        provider,
        providerEventId: eventId,
        status: event.status,
        occurredAt: event.timestamp,
        reasonCode: `provider-${provider}-${event.status}`,
        expectedVersion,
        idempotencyKey: `courier-event:${provider}:${eventId}`,
        correlationId: `courier:${provider}:${delivery.id}`,
      },
    );
    expectedVersion = Number(ingested.result.orderVersion);
    outcomes.push(ingested.result);
  }

  return {
    position: await getCanonicalCourierPosition(context, orderId),
    events: outcomes,
  };
}

export type CourierTrackingFetcher = (
  provider: DeliveryProvider,
  trackingNumber: string,
) => Promise<TrackingInfo>;
