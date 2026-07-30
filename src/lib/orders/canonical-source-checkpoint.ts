import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import type { BusinessCommandResult } from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import {
  CANONICAL_ORDER_SOURCES,
  canonicalSourceOrderSourceMetadata,
  readCanonicalSourceOrderAuthority,
} from "@/lib/orders/manual-order-authority";
import { ConflictError, NotFoundError, ValidationError } from "@/types/errors";

const schema = z.object({
  orderId: z.string().trim().min(1),
  expectedVersion: z.number().int().positive().safe(),
  source: z.enum(CANONICAL_ORDER_SOURCES),
  sourceIdentity: z.string().trim().min(1).max(200),
  sourceOrderId: z.string().trim().min(1).max(200),
  sourceRevision: z.string().trim().min(1).max(240),
  sourceDetails: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().trim().min(8).max(200),
  correlationId: z.string().trim().min(1).max(200).optional(),
});

interface SourceOrderRow {
  id: string;
  orderNumber: string;
  source: string;
  sourceOrderId: string | null;
  sourceMetadata: string | null;
  status: string;
  version: number | bigint;
}

export interface CanonicalSourceCheckpointResult {
  readonly [key: string]: unknown;
  orderId: string;
  orderNumber: string;
  status: string;
  version: number;
  source: string;
  sourceOrderId: string;
  sourceRevision: string;
}

function integer(value: number | bigint): number {
  const output = Number(value);
  if (!Number.isSafeInteger(output)) {
    throw new ConflictError("Order version is outside the supported integer range");
  }
  return output;
}

export async function commitCanonicalSourceCheckpoint(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalSourceCheckpointResult>> {
  const data = schema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "order.source.checkpoint.v1",
      aggregate: {
        type: "source-order-checkpoint",
        id: `${data.orderId}:${data.sourceRevision}`,
        expectedVersion: 0,
      },
      actor: "source",
      correlationId,
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const rows = await tx.$queryRaw<SourceOrderRow[]>`
        SELECT "id", "orderNumber", "source", "sourceOrderId",
               "sourceMetadata", "status", "version"
        FROM "Order"
        WHERE "id" = ${data.orderId}
          AND "deletedAt" IS NULL
        LIMIT 1
      `;
      const order = rows[0];
      if (!order) throw new NotFoundError("Order", data.orderId);
      const currentVersion = integer(order.version);
      if (currentVersion !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${currentVersion}`,
        );
      }
      const authority = readCanonicalSourceOrderAuthority(
        order.source,
        order.sourceMetadata,
      );
      if (
        !authority ||
        authority.source !== data.source ||
        authority.sourceIdentity !== data.sourceIdentity ||
        authority.sourceOrderId !== data.sourceOrderId ||
        order.sourceOrderId !== data.sourceOrderId
      ) {
        throw new ValidationError(
          "Source checkpoint does not match the order's canonical provider identity",
          "sourceOrderId",
        );
      }

      const sourceMetadata = canonicalSourceOrderSourceMetadata({
        source: data.source,
        sourceIdentity: data.sourceIdentity,
        sourceOrderId: data.sourceOrderId,
        sourceRevision: data.sourceRevision,
        sourceDetails: data.sourceDetails,
      });
      const nextVersion = currentVersion + 1;
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          version: currentVersion,
          source: data.source,
          sourceOrderId: data.sourceOrderId,
          deletedAt: null,
        },
        data: {
          sourceMetadata,
          version: nextVersion,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictError(
          "Order changed while the provider checkpoint was committed",
        );
      }

      const result: CanonicalSourceCheckpointResult = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        version: nextVersion,
        source: data.source,
        sourceOrderId: data.sourceOrderId,
        sourceRevision: data.sourceRevision,
      };
      return {
        result,
        audit: {
          action: "order.source.checkpoint.v1",
          entity: "order",
          entityId: order.id,
          before: {
            version: currentVersion,
            sourceRevision: authority.sourceRevision ?? null,
          },
          after: {
            version: nextVersion,
            sourceRevision: data.sourceRevision,
          },
          metadata: {
            source: data.source,
            sourceIdentity: data.sourceIdentity,
            sourceOrderId: data.sourceOrderId,
            principal: principal.auditActor,
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "order.source.checkpoint.v1",
            payload: result,
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:checkpoint",
            effectType: "order.source.checkpoint.v1",
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
