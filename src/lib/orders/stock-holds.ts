import "server-only";

import { Prisma } from "@prisma/client";

import type { DbClient } from "@/lib/db";
import type { ActiveStockHold } from "@/lib/orders/stock-availability";

/**
 * Active inventory holds for a set of products, each with the one fact the
 * availability rule in stock-availability.ts needs: whether the command that
 * opened it also wrote a 'reserve' InventoryMovement for it (which only a manual
 * confirmation does, in the same fact set as the stock decrement). The rule
 * itself is `holdAlreadyLoweredStock` / `stockHeldAgainstOnHand`; this module
 * only reads.
 *
 * Manual confirmation reads the same fact with its own per-product query
 * (activeStockHolds in manual-confirmation.ts), inside its transaction. The two
 * must keep agreeing; stock-hold-producers.test.ts pins the producers of a hold
 * and the SQL of both readers.
 */

type HoldRow = {
  productId: string;
  productVariantId: string | null;
  reservationKey: string;
  quantity: number | bigint;
  reserveMovement: number | bigint;
};

/** The map key for a product, or for one exact variant of it. */
export function stockHoldKey(
  productId: string,
  productVariantId: string | null | undefined,
): string {
  return `${productId}\u0000${productVariantId ?? ""}`;
}

export async function loadActiveStockHolds(
  client: Pick<DbClient, "$queryRaw">,
  productIds: readonly string[],
): Promise<Map<string, ActiveStockHold[]>> {
  const holds = new Map<string, ActiveStockHold[]>();
  if (productIds.length === 0) return holds;
  const rows = await client.$queryRaw<HoldRow[]>(Prisma.sql`
    SELECT r."productId" AS "productId",
           r."productVariantId" AS "productVariantId",
           r."reservationKey" AS "reservationKey",
           r."quantity" AS "quantity",
           EXISTS (
             SELECT 1
             FROM "InventoryMovement" m
             WHERE m."commandId" = r."createdByCommandId"
               AND m."reservationId" = r."id"
               AND m."movementType" = 'reserve'
           ) AS "reserveMovement"
    FROM "InventoryReservation" r
    WHERE r."state" = 'active'
      AND r."productId" IN (${Prisma.join(productIds)})
  `);
  for (const row of rows) {
    const key = stockHoldKey(row.productId, row.productVariantId);
    const list = holds.get(key) ?? [];
    list.push({
      reservationKey: row.reservationKey,
      quantity: Number(row.quantity),
      reserveMovementRecorded: Number(row.reserveMovement) > 0,
    });
    holds.set(key, list);
  }
  return holds;
}
