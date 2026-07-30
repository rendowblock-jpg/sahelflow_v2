import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { scheduleAutomationOutbox } from "@/lib/business-truth/outbox-worker";
import { orderService } from "@/lib/data/order-service";
import { db, shopContext } from "@/lib/db";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { orderStatusSchema } from "@/lib/validation";
import { SahelFlowError, ValidationError } from "@/types/errors";

export const dynamic = "force-dynamic";

const context = { prisma: db, shop: shopContext };

const statusRequestSchema = z.object({
  status: orderStatusSchema,
  expectedVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  correlationId: z.string().trim().min(1).max(200).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
});

interface ExistingDecisionCommand {
  commandType: string;
  aggregateId: string;
  status: string;
}

function canonicalConfirmationRequired(): SahelFlowError {
  return new SahelFlowError(
    "Order confirmation requires the trusted manual confirmation command",
    "CANONICAL_CONFIRMATION_REQUIRED",
    409,
  );
}

/** PATCH /api/orders/[id]/status — transition order to a new status. */
export const PATCH = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireAuth();
    const { id } = await params;
    const data = statusRequestSchema.parse(await request.json());

    const current = await db.order.findFirst({
      where: { id, deletedAt: null },
      select: {
        status: true,
        source: true,
        sourceMetadata: true,
        version: true,
      },
    });
    const trustedManual = current
      ? isTrustedManualOrderAuthority(current.source, current.sourceMetadata)
      : false;
    const targetsDecisionStatus =
      data.status === "confirmed" || data.status === "cancelled";
    const hasCommandEnvelope =
      data.expectedVersion !== undefined && Boolean(data.idempotencyKey);

    const existingCommands =
      hasCommandEnvelope && data.idempotencyKey
        ? await db.$queryRaw<ExistingDecisionCommand[]>`
            SELECT "commandType", "aggregateId", "status"
            FROM "BusinessCommand"
            WHERE "idempotencyKey" = ${data.idempotencyKey}
            LIMIT 1
          `
        : [];
    const expectedCommandType =
      data.status === "confirmed"
        ? "order.manual.confirm.v1"
        : "order.manual.reject.v1";
    const canonicalReplay = existingCommands.some(
      (command) =>
        command.status === "committed" &&
        command.aggregateId === id &&
        command.commandType === expectedCommandType,
    );
    const targetsManualDecision =
      targetsDecisionStatus && (trustedManual || canonicalReplay);

    // No compatibility caller may create new confirmed truth. Imported, AI,
    // storefront and historical manual rows remain readable but must wait for a
    // governed source-adoption command rather than direct stock mutation.
    if (data.status === "confirmed" && !targetsManualDecision) {
      throw canonicalConfirmationRequired();
    }

    if (
      targetsManualDecision &&
      current?.status === "pending" &&
      !hasCommandEnvelope
    ) {
      throw new ValidationError(
        "Manual confirmation requires expectedVersion and idempotencyKey",
        data.expectedVersion === undefined ? "expectedVersion" : "idempotencyKey",
      );
    }

    if (
      targetsManualDecision &&
      data.status === "cancelled" &&
      !data.reason?.trim()
    ) {
      throw new ValidationError(
        "Manual rejection requires a reason",
        "reason",
      );
    }

    // A committed order is no longer pending (and may later be soft-deleted),
    // but an interrupted client must still enter the canonical kernel with the
    // same key to receive the exact stored result.
    if (targetsManualDecision && hasCommandEnvelope) {
      const command = await executeManualOrderDecision(context, {
        orderId: id,
        decision: data.status === "confirmed" ? "confirm" : "reject",
        expectedVersion: data.expectedVersion,
        idempotencyKey: data.idempotencyKey,
        correlationId: data.correlationId,
        reason: data.reason,
      });

      scheduleAutomationOutbox(context, { limit: 20 });

      const stored = command.result;
      return NextResponse.json({
        order: {
          id: stored.orderId,
          orderId: stored.orderId,
          orderNumber: stored.orderNumber,
          status: stored.status,
          version: stored.version,
          confirmedAt: stored.confirmedAt,
        },
        command: {
          id: command.commandId,
          aggregateVersion: command.aggregateVersion,
          replayed: command.replayed,
        },
      });
    }

    const order = await orderService.updateStatus(context, id, data.status);
    return NextResponse.json({ order });
  },
  "PATCH /api/orders/[id]/status",
);
