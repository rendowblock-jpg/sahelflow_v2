/**
 * POST /api/delivery/[id]/reconcile — the seller's decision on a booking that
 * timed out (audit S03c-08).
 *
 * Body: { action: "courier-has-it", tracking } | { action: "book-again",
 * confirmedDuplicateRisk: true }
 *
 *   - courier-has-it: records the booking with the tracking number the seller
 *     read in the courier's own app. No courier call. Status -> created and
 *     the order -> shipped (same effect as a successful booking). Sending the
 *     same tracking number again is a no-op (200, noop: true).
 *   - book-again: removes the empty reservation so a fresh attempt can be
 *     made through POST /api/delivery/create. It can end in a second parcel
 *     and a second fee if the first call did reach the courier, so the server
 *     refuses it unless the caller sends the explicit consent flag.
 *
 * Same transaction pattern as PATCH /api/delivery/[id]: the write is a claim
 * on the status that was checked (a concurrent change gives 409/no-op), and
 * one audit row (who, which action) is the last write in the same transaction.
 * Permission is the one POST /api/delivery/create requires. Canonical orders
 * keep their own governed reconciliation on the order page.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRouteAuth } from "@/lib/auth/route-authority";
import { deliveryService } from "@/lib/data/delivery-service";
import { orderService } from "@/lib/data/order-service";
import { db, shopContext } from "@/lib/db";
import {
  RECONCILIATION_STATUS,
  normalizeCourierTracking,
  planReconcile,
  type ReconcileRequest,
} from "@/lib/delivery/delivery-reconcile";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { assertLegacyOrderFollowupAllowed } from "@/lib/orders/manual-order-authority";
import { ConflictError } from "@/types/errors";

export const dynamic = "force-dynamic";

const trackingSchema = z
  .string()
  .max(500)
  .transform((value, ctx) => {
    const tracking = normalizeCourierTracking(value);
    if (tracking === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter the tracking number without spaces",
      });
      return z.NEVER;
    }
    return tracking;
  });

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("courier-has-it"), tracking: trackingSchema }),
  z.object({
    action: z.literal("book-again"),
    confirmedDuplicateRisk: z.literal(true),
  }),
]);

type RouteContext = { params: Promise<{ id: string }> };

class DecisionRaceError extends ConflictError {
  constructor() {
    super("Delivery changed while your decision was being saved");
  }
}

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: RouteContext) => {
    // Same list as POST /api/delivery/create: owner and manager only.
    await requireRouteAuth(req, {
      actions: [
        "deliveries.manage",
        "orders.read",
        "orders.update",
        "customers.contact.read",
        "orders.financials.read",
      ],
    });
    const actorContext = await requireTrustedAction("deliveries.manage");
    const actor = trustedActorAuditIdentity(actorContext.actor);
    const { id } = await params;
    const parsed = bodySchema.parse(await req.json());
    const request: ReconcileRequest =
      parsed.action === "courier-has-it"
        ? { action: "courier-has-it", tracking: parsed.tracking }
        : { action: "book-again" };
    const context = { prisma: db, shop: shopContext };

    const existing = await deliveryService.getById(context, id);
    const authority = await db.order.findFirst({
      where: { id: existing.orderId, deletedAt: null },
      select: { source: true, sourceMetadata: true },
    });
    if (authority) {
      assertLegacyOrderFollowupAllowed(
        authority.source,
        authority.sourceMetadata,
      );
    }

    const plan = planReconcile(existing, request);
    if (plan.kind === "noop") {
      return NextResponse.json({ ok: true, noop: true, delivery: existing });
    }

    try {
      if (request.action === "courier-has-it") {
        const { tracking } = request;
        const result = await context.prisma.$transaction(async (tx) => {
          const claimed = await tx.delivery.updateMany({
            where: {
              id,
              deletedAt: null,
              status: RECONCILIATION_STATUS,
              OR: [{ trackingNumber: null }, { trackingNumber: tracking }],
            },
            data: { trackingNumber: tracking, status: plan.next },
          });
          if (claimed.count !== 1) throw new DecisionRaceError();
          const delivery = await tx.delivery.findUniqueOrThrow({
            where: { id },
          });
          // A booking recorded here ships the order exactly like a successful
          // booking does; an order that already moved on is left alone.
          const order = await tx.order.findFirst({
            where: { id: existing.orderId, deletedAt: null },
            select: { status: true },
          });
          const effects =
            order?.status === "confirmed"
              ? await orderService.updateStatusInTx(
                  tx,
                  existing.orderId,
                  "shipped",
                )
              : null;
          await tx.auditLog.create({
            data: {
              action: "delivery.reconciled.courier_has_it",
              entity: "delivery",
              entityId: id,
              actor,
              before: JSON.stringify({ status: existing.status }),
              after: JSON.stringify({ status: plan.next }),
              metadata: JSON.stringify({
                orderId: existing.orderId,
                provider: existing.provider,
                trackingSource: "entered_by_seller",
              }),
            },
          });
          return { delivery, effects };
        });
        if (result.effects) {
          await orderService.dispatchStatusTransition(context, result.effects);
        }
        return NextResponse.json({
          ok: true,
          noop: false,
          delivery: result.delivery,
        });
      }

      await context.prisma.$transaction(async (tx) => {
        const released = await tx.delivery.deleteMany({
          where: {
            id,
            deletedAt: null,
            status: RECONCILIATION_STATUS,
            trackingNumber: null,
          },
        });
        if (released.count !== 1) throw new DecisionRaceError();
        await tx.auditLog.create({
          data: {
            action: "delivery.reconciled.book_again",
            entity: "delivery",
            entityId: id,
            actor,
            before: JSON.stringify({ status: existing.status }),
            after: JSON.stringify({ status: plan.next }),
            metadata: JSON.stringify({
              orderId: existing.orderId,
              provider: existing.provider,
              duplicateRiskAcknowledged: true,
            }),
          },
        });
      });
      return NextResponse.json({
        ok: true,
        noop: false,
        released: true,
        orderId: existing.orderId,
        provider: existing.provider,
      });
    } catch (error) {
      if (!(error instanceof DecisionRaceError)) throw error;
      // Someone else (a second tab, the provider sync) got there first. If the
      // outcome is already the one asked for, say so instead of failing.
      const current = await deliveryService.getById(context, id);
      if (planReconcile(current, request).kind === "noop") {
        return NextResponse.json({ ok: true, noop: true, delivery: current });
      }
      throw error;
    }
  },
  "POST /api/delivery/[id]/reconcile",
);
