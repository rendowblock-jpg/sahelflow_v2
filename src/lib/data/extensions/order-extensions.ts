/**
 * Order service extensions — search + bulk operations.
 *
 * Bulk operations let the merchant confirm/ship/cancel multiple orders
 * in a single request — a major workflow accelerator for high-volume
 * COD merchants processing dozens of orders per day.
 */
import "server-only";
import type { ServiceContext } from "../service-base";
import type { Order, OrderStatus } from "@/types/domain";
import { orderService } from "../order-service";
import { logger } from "@/lib/logger";
import { deriveBlindIndex } from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";

export interface BulkResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export type OrderSearchResult = Order & {
  customer: { name: string; phone: string };
};

export const orderServiceExtensions = {
  /**
   * Search orders by order number, customer name, or phone.
   * Returns the same shape as list() but filtered by the query.
   */
  async search(
    ctx: ServiceContext,
    query: string,
    opts?: { limit?: number; offset?: number; status?: OrderStatus },
  ): Promise<OrderSearchResult[]> {
    const q = query.trim();
    if (!q) return [];

    // SEC-009: phone is AES-256-GCM encrypted, customer.name is encrypted.
    // Search by: orderNumber (plaintext, substring), phoneBlindIndex (exact),
    // customer.nameBlindIndex (exact), wilaya (plaintext, substring).
    const masterKey = getMasterKey();
    const phoneBlindIndex = deriveBlindIndex(q, masterKey);
    const nameBlindIndex = deriveBlindIndex(q.toLowerCase().trim(), masterKey);

    // SV-L1: gate the encrypted-field `contains` branches behind
    // NODE_ENV === "test" (they only fire in tests/dev where PII encryption
    // may be disabled; in production those columns hold ciphertext).
    const plaintextFallback = process.env.NODE_ENV === "test";

    const rows = await ctx.prisma.order.findMany({
      where: { deletedAt: null,
        AND: [
          opts?.status ? { status: opts.status } : {},
          {
            OR: [
              { orderNumber: { contains: q } },
              { phoneBlindIndex },
              { customer: { nameBlindIndex } },
              { wilaya: { contains: q } },
              ...(plaintextFallback
                ? [
                    { phone: { contains: q } },                  // tests/dev only
                    { customer: { name: { contains: q } } },     // tests/dev only
                  ]
                : []),
            ],
          },
        ],
      },
      include: { items: true, customer: { select: { name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
    });
    return rows as unknown as OrderSearchResult[];
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
        // Auto-advance: if the target is "confirmed" and the order is still a
        // draft, first transition draft → pending, then pending → confirmed.
        // This lets sellers bulk-confirm a mix of drafts + pending orders
        // without manually advancing each draft first.
        if (to === "confirmed") {
          const order = await ctx.prisma.order.findUnique({
            where: { id },
            select: { status: true },
          });
          if (order?.status === "draft") {
            await orderService.updateStatus(ctx, id, "pending");
          }
        }
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

    // SV-L1: gate encrypted-field `contains` branches behind test env.
    const plaintextFallback = process.env.NODE_ENV === "test";

    // SV-L2: include { wilaya: { contains: q } } so count matches the visible
    // list (search() above includes it; without it here, the count undercounts
    // whenever the query matches a wilaya but not the other fields).
    return ctx.prisma.order.count({
      where: {
        deletedAt: null,
        AND: [
          opts?.status ? { status: opts.status } : {},
          {
            OR: [
              { orderNumber: { contains: q } },
              { phoneBlindIndex },
              { customer: { nameBlindIndex } },
              { wilaya: { contains: q } },
              ...(plaintextFallback
                ? [
                    { phone: { contains: q } },
                    { customer: { name: { contains: q } } },
                  ]
                : []),
            ],
          },
        ],
      },
    });
  },
};
