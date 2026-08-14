import type { ReleaseAllocation } from "./release-input";
import type { D1Database, D1Statement } from "./types";

/**
 * Move the active release's unsold delegation into a fresh immutable release.
 *
 * D1 executes the caller's statement batch as one transaction. For an item
 * that already exists in the parent release, the fresh delegation is capped at
 * the parent's remaining quantity. New catalog items may use the desktop's
 * requested physical-stock authority less any unsettled receipts from older
 * releases that are not reflected in local stock. The final statement retires every
 * remaining parent allocation, so a checkout that raced on the old release
 * either committed before this transfer or fails its allocation guard after it.
 */
export function appendConservedAllocationStatements(
  database: D1Database,
  statements: D1Statement[],
  releaseId: string,
  parentReleaseId: string | null,
  allocations: readonly ReleaseAllocation[],
): void {
  for (const allocation of allocations) {
    statements.push(
      database.prepare(
        `INSERT INTO storefront_allocation
          (release_id, item_key, unit_price_dzd, delegated_quantity, remaining_quantity)
         VALUES (
           ?1, ?2, ?3,
           CASE
             WHEN ?4 IS NULL THEN ?5
             WHEN EXISTS (
               SELECT 1 FROM storefront_allocation
                WHERE release_id = ?4 AND item_key = ?2
             ) THEN MIN(?5, COALESCE((
               SELECT remaining_quantity FROM storefront_allocation
                WHERE release_id = ?4 AND item_key = ?2
             ), 0))
             ELSE MAX(0, ?5 - COALESCE((
               SELECT SUM(line.quantity)
                 FROM storefront_receipt_line line
                 JOIN storefront_receipt receipt ON receipt.receipt_id = line.receipt_id
                 JOIN storefront_release historical ON historical.release_id = receipt.release_id
                WHERE historical.storefront_id = (
                  SELECT storefront_id FROM storefront_release WHERE release_id = ?1
                )
                  AND line.item_key = ?2
                  AND receipt.state IN ('received', 'rejected')
             ), 0))
           END,
           CASE
             WHEN ?4 IS NULL THEN ?5
             WHEN EXISTS (
               SELECT 1 FROM storefront_allocation
                WHERE release_id = ?4 AND item_key = ?2
             ) THEN MIN(?5, COALESCE((
               SELECT remaining_quantity FROM storefront_allocation
                WHERE release_id = ?4 AND item_key = ?2
             ), 0))
             ELSE MAX(0, ?5 - COALESCE((
               SELECT SUM(line.quantity)
                 FROM storefront_receipt_line line
                 JOIN storefront_receipt receipt ON receipt.receipt_id = line.receipt_id
                 JOIN storefront_release historical ON historical.release_id = receipt.release_id
                WHERE historical.storefront_id = (
                  SELECT storefront_id FROM storefront_release WHERE release_id = ?1
                )
                  AND line.item_key = ?2
                  AND receipt.state IN ('received', 'rejected')
             ), 0))
           END
         )`,
      ).bind(
        releaseId,
        allocation.itemKey,
        allocation.unitPriceDzd,
        parentReleaseId,
        allocation.quantity,
      ),
    );
  }

  if (parentReleaseId !== null) {
    statements.push(
      database.prepare(
        `UPDATE storefront_allocation
            SET remaining_quantity = 0
          WHERE release_id = ?1 AND remaining_quantity > 0`,
      ).bind(parentReleaseId),
    );
  }
}
