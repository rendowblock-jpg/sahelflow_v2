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
  resolveTrustedBusinessPrincipal,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import { assertBusinessCommandShopAuthority } from "@/lib/business-truth/shop-authority";
import type { ServiceContext } from "@/lib/data/service-base";
import {
  DELIVERY_PROVIDERS,
  type DeliveryProvider,
  type ShipmentRequest,
} from "@/lib/integrations/delivery/types";
import { isCanonicalOrderAuthority } from "@/lib/orders/manual-order-authority";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/types/errors";
import {
  COURIER_BOOKING_EFFECT_TYPE,
  drainDueCourierBookings as drainReviewedCourierBookings,
  getCanonicalCourierPosition,
  ingestCanonicalCourierTrackingEvent,
  queueCanonicalCourierBooking as queueReviewedCanonicalCourierBooking,
  synchronizeCanonicalCourierTracking,
  type CourierBookingResult,
  type CourierBookingSender,
  type CourierPosition,
  type CourierTrackingFetcher,
} from "./canonical-courier-reviewed-base";

export {
  COURIER_BOOKING_EFFECT_TYPE,
  getCanonicalCourierPosition,
  ingestCanonicalCourierTrackingEvent,
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
        message:
          "A manually confirmed provider shipment requires tracking identity",
      });
    }
    if (input.action === "confirm_not_created") {
      for (const field of [
        "trackingNumber",
        "labelUrl",
        "cost",
        "estimatedDelivery",
      ] as const) {
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

interface StoredCommandAggregateRow {
  commandType: string;
  aggregateType: string;
  aggregateId: string;
  expectedVersion: number | bigint;
}

interface AmbiguousBookingAuthorityRow {
  commandId: string;
  outboxId: string;
  effectKey: string;
  orderId: string;
  deliveryId: string;
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

function safeInteger(value: number | bigint, field: string): number {
  const output = Number(value);
  if (!Number.isSafeInteger(output)) {
    throw new ConflictError(`${field} is outside the supported integer range`);
  }
  return output;
}

async function assertCourierCommandAuthority(
  context: BusinessPrincipalContext,
): Promise<void> {
  assertBusinessCommandShopAuthority(context);
  await resolveTrustedBusinessPrincipal(context);
}

export async function queueCanonicalCourierBooking(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CourierBookingResult>> {
  await assertCourierCommandAuthority(context);
  return queueReviewedCanonicalCourierBooking(context, input);
}

async function ambiguousBookingAuthority(
  tx: BusinessTransaction,
  deliveryId: string,
): Promise<AmbiguousBookingAuthorityRow | null> {
  const rows = await tx.$queryRaw<AmbiguousBookingAuthorityRow[]>`
    SELECT
      event."createdByCommandId" AS "commandId",
      outbox."id" AS "outboxId",
      outbox."effectKey" AS "effectKey",
      event."orderId" AS "orderId",
      event."deliveryId" AS "deliveryId"
    FROM "CanonicalDeliveryEvent" AS event
    INNER JOIN "OutboxIntent" AS outbox
      ON outbox."commandId" = event."createdByCommandId"
    WHERE event."deliveryId" = ${deliveryId}
      AND event."eventType" = 'courier_booking_requested'
      AND outbox."effectType" = ${COURIER_BOOKING_EFFECT_TYPE}
      AND outbox."outcomeState" = 'ambiguous'
    ORDER BY outbox."createdAt" DESC, outbox."id" DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function reconciliationAggregate(
  context: BusinessPrincipalContext,
  data: z.infer<typeof reconciliationSchema>,
): Promise<{ id: string; expectedVersion: number }> {
  const commandType = `courier.booking.reconcile.${data.action}.v1`;
  const stored = await context.prisma.$queryRaw<StoredCommandAggregateRow[]>`
    SELECT "commandType", "aggregateType", "aggregateId", "expectedVersion"
    FROM "BusinessCommand"
    WHERE "idempotencyKey" = ${data.idempotencyKey}
    LIMIT 1
  `;
  const replay = stored[0];
  const legacyId = `${data.deliveryId}:${data.action}`;
  const generationPrefix = `${legacyId}:`;

  if (
    replay?.commandType === commandType &&
    replay.aggregateType === "courier-booking-reconciliation" &&
    (replay.aggregateId === legacyId ||
      replay.aggregateId.startsWith(generationPrefix))
  ) {
    return {
      id: replay.aggregateId,
      expectedVersion: safeInteger(
        replay.expectedVersion,
        "stored courier reconciliation aggregate version",
      ),
    };
  }

  const authority = await ambiguousBookingAuthority(
    context.prisma as unknown as BusinessTransaction,
    data.deliveryId,
  );
  if (!authority) {
    throw new ConflictError("Courier booking is not awaiting reconciliation");
  }
  return {
    id: `${legacyId}:${authority.commandId}`,
    expectedVersion: 0,
  };
}

export async function reconcileCanonicalCourierBooking(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<Record<string, unknown>>> {
  const data = reconciliationSchema.parse(input);
  await assertCourierCommandAuthority(context);
  const aggregate = await reconciliationAggregate(context, data);

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: `courier.booking.reconcile.${data.action}.v1`,
      aggregate: {
        type: "courier-booking-reconciliation",
        id: aggregate.id,
        expectedVersion: aggregate.expectedVersion,
      },
      actor: "authenticated-owner",
      correlationId: data.correlationId ?? randomUUID(),
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const delivery = await tx.delivery.findFirst({
        where: { id: data.deliveryId, deletedAt: null },
        include: { order: true },
      });
      if (!delivery) throw new NotFoundError("Delivery", data.deliveryId);
      if (
        !isCanonicalOrderAuthority(
          delivery.order.source,
          delivery.order.sourceMetadata,
        )
      ) {
        throw new ValidationError(
          "Courier reconciliation requires canonical order authority",
          "order.authority",
        );
      }
      if (delivery.order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${delivery.orderId} version conflict: expected ${data.expectedVersion}, current ${delivery.order.version}`,
        );
      }
      if (delivery.status !== "reconciliation_required") {
        throw new ConflictError("Courier booking is not awaiting reconciliation");
      }

      const authority = await ambiguousBookingAuthority(tx, delivery.id);
      if (!authority || authority.orderId !== delivery.orderId) {
        throw new ConflictError(
          "Ambiguous courier booking authority is missing or stale",
        );
      }
      const expectedGenerationId = `${delivery.id}:${data.action}:${authority.commandId}`;
      if (
        aggregate.id !== `${delivery.id}:${data.action}` &&
        aggregate.id !== expectedGenerationId
      ) {
        throw new ConflictError(
          "Courier reconciliation generation changed before commit",
        );
      }

      const outbox = await tx.outboxIntent.findFirst({
        where: {
          id: authority.outboxId,
          commandId: authority.commandId,
          effectKey: authority.effectKey,
          effectType: COURIER_BOOKING_EFFECT_TYPE,
          status: "failed",
          outcomeState: "ambiguous",
        },
      });
      if (!outbox) {
        throw new ConflictError(
          "Only an ambiguous courier effect can be reconciled manually",
        );
      }

      let nextVersion = delivery.order.version;
      if (data.action === "confirm_created") {
        const trackingNumber = data.trackingNumber!;
        const deliveryUpdated = await tx.delivery.updateMany({
          where: {
            id: delivery.id,
            status: "reconciliation_required",
            trackingNumber: null,
            deletedAt: null,
          },
          data: {
            trackingNumber,
            labelUrl: data.labelUrl ?? null,
            cost: data.cost ?? null,
            estimatedDelivery: data.estimatedDelivery ?? null,
            status: "created",
          },
        });
        if (deliveryUpdated.count !== 1) {
          throw new ConflictError(
            "Delivery changed during courier reconciliation",
          );
        }
        const outboxUpdated = await tx.outboxIntent.updateMany({
          where: {
            id: outbox.id,
            status: "failed",
            outcomeState: "ambiguous",
          },
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
        if (outboxUpdated.count !== 1) {
          throw new ConflictError(
            "Courier booking effect changed during reconciliation",
          );
        }
      } else {
        nextVersion += 1;
        const orderUpdated = await tx.order.updateMany({
          where: {
            id: delivery.orderId,
            version: delivery.order.version,
            status: "confirmed",
            fulfillmentState: "ready",
            inventoryState: "reserved",
            deliveryState: "pending",
            deletedAt: null,
          },
          data: { version: nextVersion, deliveryState: "not_created" },
        });
        if (orderUpdated.count !== 1) {
          throw new ConflictError(
            "Order changed during courier reconciliation",
          );
        }
        const deliveryUpdated = await tx.delivery.updateMany({
          where: {
            id: delivery.id,
            status: "reconciliation_required",
            trackingNumber: null,
            deletedAt: null,
          },
          data: { status: "booking_failed" },
        });
        if (deliveryUpdated.count !== 1) {
          throw new ConflictError(
            "Delivery changed during courier reconciliation",
          );
        }
        const outboxUpdated = await tx.outboxIntent.updateMany({
          where: {
            id: outbox.id,
            status: "failed",
            outcomeState: "ambiguous",
          },
          data: {
            status: "dead_letter",
            outcomeState: "manual_not_created",
            deadLetteredAt: new Date(),
            lastErrorCode: "COURIER_CONFIRMED_NOT_CREATED",
          },
        });
        if (outboxUpdated.count !== 1) {
          throw new ConflictError(
            "Courier booking effect changed during reconciliation",
          );
        }
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
        bookingCommandId: authority.commandId,
        action: data.action,
        trackingNumber: data.trackingNumber ?? null,
      };
      return {
        result,
        audit: {
          action: `courier.booking.reconcile.${data.action}.v1`,
          entity: "delivery",
          entityId: delivery.id,
          before: {
            status: delivery.status,
            outcomeState: outbox.outcomeState,
          },
          after: result,
          metadata: {
            reasonCode: data.reasonCode,
            bookingCommandId: authority.commandId,
            principal: principal.auditActor,
          },
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

async function bookingRequestByCommand(
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

async function recoverUnreadablePostEffectLeases(
  context: ServiceContext,
  limit: number,
): Promise<void> {
  if (limit <= 0) return;
  const cutoff = new Date(Date.now() - LEASE_MS);
  const rows = (await context.prisma.outboxIntent.findMany({
    where: {
      effectType: COURIER_BOOKING_EFFECT_TYPE,
      status: "processing",
      effectStartedAt: { not: null },
      lockedAt: { lte: cutoff },
    },
    orderBy: [{ lockedAt: "asc" }, { createdAt: "asc" }],
    take: Math.min(20, limit),
  })) as BookingOutboxRow[];

  for (const row of rows) {
    try {
      await openBookingPayload(context, row);
      continue;
    } catch {
      await context.prisma.$transaction(async (tx) => {
        const marked = await tx.outboxIntent.updateMany({
          where: {
            id: row.id,
            status: "processing",
            leaseToken: row.leaseToken,
            effectStartedAt: row.effectStartedAt,
          },
          data: {
            status: "failed",
            outcomeState: "ambiguous",
            lastErrorCode:
              "COURIER_EFFECT_LEASE_EXPIRED_AFTER_START_PAYLOAD_UNREADABLE",
            nextAttemptAt: null,
            lockedAt: null,
            leaseToken: null,
          },
        });
        if (marked.count !== 1) return;

        const request = await bookingRequestByCommand(tx, row.commandId);
        if (request?.deliveryId) {
          await tx.delivery.updateMany({
            where: {
              id: request.deliveryId,
              trackingNumber: null,
              deletedAt: null,
            },
            data: { status: "reconciliation_required" },
          });
        }
        await tx.auditLog.create({
          data: {
            action: "courier.booking.outcome_ambiguous",
            entity: "outbox-intent",
            entityId: row.id,
            actor: "system:courier-booking",
            metadata: JSON.stringify({
              effectKey: row.effectKey,
              errorCode:
                "COURIER_EFFECT_LEASE_EXPIRED_AFTER_START_PAYLOAD_UNREADABLE",
              orderId: request?.orderId ?? null,
              deliveryId: request?.deliveryId ?? null,
            }),
          },
        });
      });
    }
  }
}

export async function drainDueCourierBookings(
  context: ServiceContext,
  limit = 10,
  sender?: CourierBookingSender,
): Promise<number> {
  await recoverUnreadablePostEffectLeases(context, limit);
  return drainReviewedCourierBookings(context, limit, sender);
}
