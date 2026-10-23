import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import type { BusinessCommandResult } from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { normalizePhone } from "@/lib/import/fields";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { redactPii } from "@/lib/redact-pii";
import { ConflictError, NotFoundError, ValidationError } from "@/types/errors";

/**
 * order.manual.edit.v1 (S03a-03): the governed way to correct a canonical
 * order BEFORE it is confirmed. Before this command a wrong address, phone or
 * delivery fee on a pending canonical order could only be fixed by rejecting
 * it and typing the order again; the old route answered 409 and promised a
 * "governed edit command" that did not exist.
 *
 * What it governs: the delivery destination (wilaya, commune, address), the
 * order phone, the notes and the delivery fee. What it does NOT govern, on
 * purpose: the order lines, prices, stock and the customer record. Lines and
 * hosted-storefront stock delegations are tied to each other, so changing
 * them is a separate command (S03a-03B). Unknown fields are rejected, never
 * ignored, so a client that sends `items` learns it was not applied.
 *
 * Concurrency: the edit is version-checked against Order.version and bumps it,
 * so a confirmation opened on the old screen fails with a version conflict
 * instead of confirming an order the seller did not see. The kernel claims one
 * aggregate per (order, version): two edits made at the same version cannot
 * both commit.
 */

export const manualOrderEditSchema = z
  .object({
    orderId: z.string().min(1),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().trim().min(8).max(200),
    correlationId: z.string().trim().min(1).max(200).optional(),
    wilaya: z.string().trim().min(1).max(120).optional(),
    commune: z.string().trim().min(1).max(120).optional(),
    address: z.string().trim().min(1).max(500).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    deliveryCost: z.number().int().nonnegative().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!EDITABLE_FIELDS.some((field) => value[field] !== undefined)) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "Provide at least one field to edit",
      });
    }
  });

const EDITABLE_FIELDS = [
  "address",
  "commune",
  "deliveryCost",
  "notes",
  "phone",
  "wilaya",
] as const;

export type ManualOrderEditField = (typeof EDITABLE_FIELDS)[number];
export type ManualOrderEditInput = z.infer<typeof manualOrderEditSchema>;

export interface ManualOrderEditResult {
  orderId: string;
  orderNumber: string;
  status: string;
  version: number;
  deliveryCost: number;
  totalPrice: number;
  /** The fields whose stored value really changed, in alphabetical order. */
  changed: ManualOrderEditField[];
}

function canonicalAlgerianPhone(value: string): string {
  const normalized = normalizePhone(value);
  if (!/^0[5-7]\d{8}$/.test(normalized)) {
    throw new ValidationError(
      "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)",
      "phone",
    );
  }
  return normalized;
}

export async function executeManualOrderEdit(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<ManualOrderEditResult>> {
  const data = manualOrderEditSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();
  const requested = {
    ...(data.wilaya !== undefined ? { wilaya: data.wilaya } : {}),
    ...(data.commune !== undefined ? { commune: data.commune } : {}),
    ...(data.address !== undefined ? { address: data.address } : {}),
    ...(data.phone !== undefined
      ? { phone: canonicalAlgerianPhone(data.phone) }
      : {}),
    ...(data.deliveryCost !== undefined
      ? { deliveryCost: data.deliveryCost }
      : {}),
    ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
  };

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "order.manual.edit.v1",
      aggregate: {
        type: "manual-order-edit",
        id: `${data.orderId}:v${data.expectedVersion}`,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: {
        orderId: data.orderId,
        expectedVersion: data.expectedVersion,
        changes: requested,
      },
    },
    async ({ tx, commandId, aggregateVersion, principal }) => {
      const order = await tx.order.findFirst({
        where: { id: data.orderId, deletedAt: null },
      });
      if (!order) throw new NotFoundError("Order", data.orderId);
      if (!isTrustedManualOrderAuthority(order.source, order.sourceMetadata)) {
        throw new ValidationError(
          "This command only governs canonical orders",
          "order.authority",
        );
      }
      if (order.status !== "pending") {
        throw new ConflictError(
          `Order edit requires pending status; current status is '${order.status}'`,
        );
      }
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }

      // Order.deliveryCost is nullable: no fee recorded means 0, so editing it
      // to 0 is not a change and the total never has a null in its sum.
      const previousFee = order.deliveryCost ?? 0;
      const stored: Record<ManualOrderEditField, string | number | null> = {
        address: order.address,
        commune: order.commune,
        deliveryCost: previousFee,
        notes: order.notes,
        phone: order.phone,
        wilaya: order.wilaya,
      };
      const changed = EDITABLE_FIELDS.filter(
        (field) =>
          field in requested &&
          (requested as Record<string, unknown>)[field] !== stored[field],
      );
      if (changed.length === 0) {
        throw new ValidationError("Nothing to change", "order.edit");
      }

      const updates: Record<string, string | number | null> = {};
      for (const field of changed) {
        updates[field] = (requested as Record<string, string | number | null>)[
          field
        ]!;
      }
      // The total moves by exactly the fee difference. It is not recomputed
      // from the lines, so an edit never rewrites money it was not asked to.
      const totalPrice = changed.includes("deliveryCost")
        ? order.totalPrice - previousFee + (requested.deliveryCost ?? 0)
        : order.totalPrice;
      const orderVersion = data.expectedVersion + 1;

      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          status: "pending",
          version: data.expectedVersion,
          deletedAt: null,
        },
        data: { ...updates, totalPrice, version: orderVersion },
      });
      if (updated.count !== 1) {
        throw new ConflictError(
          `Order ${order.id} changed while the edit command was running`,
        );
      }

      // Booleans and numbers only: the ledger must not carry the address,
      // phone or note text.
      const changedFlags = Object.fromEntries(
        changed.map((field) => [`${field}Changed`, true]),
      );
      await tx.orderChange.create({
        data: {
          orderId: order.id,
          status: "confirmed",
          actionType: "edit",
          actor: principal.auditActor,
          payload: JSON.stringify(
            redactPii({
              ...changedFlags,
              ...(changed.includes("deliveryCost")
                ? {
                    deliveryCostFrom: previousFee,
                    deliveryCostTo: requested.deliveryCost ?? 0,
                  }
                : {}),
              commandId,
              editVersion: aggregateVersion,
              orderVersion,
              authority: "manual-edit-v1",
            }),
          ),
        },
      });

      const result: ManualOrderEditResult = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        version: orderVersion,
        deliveryCost: requested.deliveryCost ?? previousFee,
        totalPrice,
        changed,
      };

      return {
        result,
        audit: {
          action: "order.manual.edited.v1",
          entity: "order",
          entityId: order.id,
          before: {
            status: order.status,
            version: order.version,
            deliveryCost: previousFee,
            totalPrice: order.totalPrice,
          },
          after: {
            status: order.status,
            version: orderVersion,
            deliveryCost: result.deliveryCost,
            totalPrice,
            changedFieldCount: changed.length,
          },
          metadata: {
            authority: "manual-edit-v1",
            ...changedFlags,
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "order.manual.edited.v1",
            payload: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              orderVersion,
              editVersion: aggregateVersion,
              changedFieldCount: changed.length,
              ...changedFlags,
            },
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
