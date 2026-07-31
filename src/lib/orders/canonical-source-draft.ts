import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import type { BusinessCommandResult } from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { readCanonicalSourceOrderAuthority } from "@/lib/orders/manual-order-authority";
import { ConflictError, NotFoundError, ValidationError } from "@/types/errors";

const schema = z.object({
  orderId: z.string().trim().min(1),
  expectedVersion: z.number().int().positive().safe(),
  idempotencyKey: z.string().trim().min(8).max(200),
  correlationId: z.string().trim().min(1).max(200).optional(),
});

export interface CanonicalSourceDraftSubmissionResult {
  readonly [key: string]: unknown;
  orderId: string;
  orderNumber: string;
  status: "pending";
  version: number;
}

export async function submitCanonicalSourceDraft(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalSourceDraftSubmissionResult>> {
  const data = schema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "order.source.draft.submit.v1",
      aggregate: {
        type: "source-order-draft-submission",
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
        select: {
          id: true,
          orderNumber: true,
          source: true,
          sourceMetadata: true,
          status: true,
          version: true,
        },
      });
      if (!order) throw new NotFoundError("Order", data.orderId);
      const authority = readCanonicalSourceOrderAuthority(
        order.source,
        order.sourceMetadata,
      );
      if (!authority || authority.source !== "ai_chat") {
        throw new ValidationError(
          "Only a canonical AI-created draft can be submitted through this command",
          "order.authority",
        );
      }
      if (order.status !== "draft") {
        throw new ConflictError(
          `AI draft submission requires draft status; current status is '${order.status}'`,
        );
      }
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }

      const nextVersion = data.expectedVersion + 1;
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          status: "draft",
          version: data.expectedVersion,
          deletedAt: null,
        },
        data: { status: "pending", version: nextVersion },
      });
      if (updated.count !== 1) {
        throw new ConflictError(
          "The AI draft changed while submission was committed",
        );
      }

      await tx.orderChange.create({
        data: {
          orderId: order.id,
          status: "pending",
          actionType: "status_change",
          actor: principal.auditActor,
          payload: JSON.stringify({
            from: "draft",
            to: "pending",
            orderVersion: nextVersion,
            commandId,
            authority: "canonical-source-draft-v1",
          }),
          confirmedBy: principal.auditActor,
          confirmedAt: new Date(),
        },
      });

      const result: CanonicalSourceDraftSubmissionResult = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: "pending",
        version: nextVersion,
      };
      return {
        result,
        audit: {
          action: "order.source.draft.submitted.v1",
          entity: "order",
          entityId: order.id,
          before: { status: "draft", version: order.version },
          after: result,
          metadata: {
            source: authority.source,
            sourceIdentity: authority.sourceIdentity,
            sourceOrderId: authority.sourceOrderId,
            principal: principal.auditActor,
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "order.source.draft.submitted.v1",
            payload: result,
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:submitted`,
            effectType: "order.source.draft.submitted.v1",
            payload: result,
          },
        ],
        projectionInvalidations: [
          "orders:list",
          `orders:${order.id}`,
          "dashboard:orders",
        ],
      };
    },
  );
}
