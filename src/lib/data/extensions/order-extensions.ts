/**
 * Order service extensions — search + bulk operations.
 *
 * Bulk operations let the merchant confirm/ship/cancel multiple orders
 * in a single request — a major workflow accelerator for high-volume
 * COD merchants processing dozens of orders per day.
 */
import "server-only";
import type { ServiceContext } from "../service-base";
import type { OrderStatus } from "@/types/domain";
import { orderService } from "../order-service";
import { logger } from "@/lib/logger";
import { deriveBlindIndex } from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";

export interface BulkResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export const orderServiceExtensions = {
  /**
   * Search orders by order number, customer name, or phone.
   * Returns the same shape as list() but filtered by the query.
   */
  async search(
    ctx: ServiceContext,
    query: string,
    opts?: { limit?: number; offset?: number; status?: OrderStatus },
  ) {
    const q = query.trim();
    if (!q) return [];

    // SEC-009: phone is AES-256-GCM encrypted, customer.name is encrypted.
    // Search by: orderNumber (plaintext, substring), phoneBlindIndex (exact),
    // customer.nameBlindIndex (exact), wilaya (plaintext, substring).
    const masterKey = getMasterKey();
    const phoneBlindIndex = deriveBlindIndex(q, masterKey);
    const nameBlindIndex = deriveBlindIndex(q.toLowerCase().trim(), masterKey);

    const rows = await ctx.prisma.order.findMany({
      where: {
        AND: [
          opts?.status ? { status: opts.status } : {},
          {
            OR: [
              { orderNumber: { contains: q } },
              { phoneBlindIndex },
              { customer: { nameBlindIndex } },
              { phone: { contains: q } },        // fallback: plaintext (tests/dev)
              { customer: { name: { contains: q } } },  // fallback: plaintext (tests/dev)
              { wilaya: { contains: q } },
            ],
          },
        ],
      },
      include: { items: true, customer: { select: { name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
    });
    return rows;
  },

  /**
   * Bulk transition multiple orders to a new status.
   * Each order is validated individually — valid ones transition,
   * invalid ones are reported in the `failed` array (no rollback of
   * the successful ones).
   *
   * This is transactional PER ORDER (not one big transaction), so a
   * failure on order #3 doesn't block orders #4-#10.
   */
  async bulkUpdateStatus(
    ctx: ServiceContext,
    ids: string[],
    to: OrderStatus,
  ): Promise<BulkResult> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        await orderService.updateStatus(ctx, id, to);
        succeeded.push(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ id, error: msg });
        logger.warn("order.bulkUpdateStatus.failed", { id, to, error: msg });
      }
    }

    logger.info("order.bulkUpdateStatus", {
      total: ids.length,
      succeeded: succeeded.length,
      failed: failed.length,
      to,
    });

    return { succeeded, failed };
  },

  /**
   * Count orders matching a search query (for pagination/total display).
   */
  async countSearch(
    ctx: ServiceContext,
    query: string,
    opts?: { status?: OrderStatus },
  ): Promise<number> {
    const q = query.trim();
    if (!q) return 0;
    const masterKey = getMasterKey();
    const phoneBlindIndex = deriveBlindIndex(q, masterKey);
    const nameBlindIndex = deriveBlindIndex(q.toLowerCase().trim(), masterKey);

    return ctx.prisma.order.count({
      where: {
        AND: [
          opts?.status ? { status: opts.status } : {},
          {
            OR: [
              { orderNumber: { contains: q } },
              { phoneBlindIndex },
              { customer: { nameBlindIndex } },
              { phone: { contains: q } },
              { customer: { name: { contains: q } } },
            ],
          },
        ],
      },
    });
  },
};
