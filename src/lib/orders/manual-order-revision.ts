import "server-only";

import { z } from "zod";

import { recordOrderChangeInTx } from "@/lib/data/order-change-service";
import type { ServiceContext } from "@/lib/data/service-base";
import { normalizePhone } from "@/lib/import/fields";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { ConflictError, NotFoundError, ValidationError } from "@/types/errors";

export const trustedManualRevisionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    wilaya: z.string().trim().min(1).optional(),
    commune: z.string().trim().min(1).optional(),
    address: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (value) =>
      value.wilaya !== undefined ||
      value.commune !== undefined ||
      value.address !== undefined ||
      value.phone !== undefined ||
      value.notes !== undefined,
    { message: "At least one revision field is required" },
  );

function canonicalRevisionPhone(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizePhone(value);
  if (!/^0[5-7]\d{8}$/.test(normalized)) {
    throw new ValidationError(
      "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)",
      "phone",
    );
  }
  return normalized;
}

export async function reviseTrustedManualOrder(
  context: ServiceContext,
  orderId: string,
  input: unknown,
) {
  const data = trustedManualRevisionSchema.parse(input);
  const normalizedPhone = canonicalRevisionPhone(data.phone);

  return context.prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        id: true,
        status: true,
        version: true,
        source: true,
        sourceMetadata: true,
      },
    });
    if (!order) throw new NotFoundError("Order", orderId);
    if (!isTrustedManualOrderAuthority(order.source, order.sourceMetadata)) {
      throw new ValidationError(
        "This revision command only governs trusted manual orders",
        "order.authority",
      );
    }
    if (order.status !== "pending") {
      throw new ConflictError(
        `Trusted manual revisions require pending status; current status is '${order.status}'`,
      );
    }
    if (order.version !== data.expectedVersion) {
      throw new ConflictError(
        `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
      );
    }

    const activeReservations = await tx.$queryRaw<Array<{ present: number | bigint }>>`
      SELECT 1 AS "present"
      FROM "InventoryReservation"
      WHERE "orderId" = ${orderId}
        AND "state" = 'active'
      LIMIT 1
    `;
    if (activeReservations.length > 0) {
      throw new ConflictError(
        `Order '${orderId}' has an active canonical reservation and cannot be revised`,
      );
    }

    const updated = await tx.order.updateMany({
      where: {
        id: orderId,
        status: "pending",
        version: data.expectedVersion,
        deletedAt: null,
      },
      data: {
        wilaya: data.wilaya,
        commune: data.commune,
        address: data.address,
        phone: normalizedPhone,
        notes: data.notes,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new ConflictError(
        `Order ${orderId} changed while the revision command was running`,
      );
    }

    const row = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    await recordOrderChangeInTx(tx, {
      orderId,
      actionType: "edit",
      payload: {
        authority: "trusted-manual-revision-v1",
        fields: Object.keys(data).filter((field) => field !== "expectedVersion"),
        expectedVersion: data.expectedVersion,
        committedVersion: row.version,
      },
    });
    return row;
  });
}
