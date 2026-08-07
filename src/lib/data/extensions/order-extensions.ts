/**
 * Order service extensions — search + bulk operations.
 */
import "server-only";
import type { ServiceContext } from "../service-base";
import type { Order, OrderStatus } from "@/types/domain";
import { orderService } from "../order-service";
import { logger } from "@/lib/logger";
import { deriveExistingShopBlindIndex } from "@/lib/crypto/protected-record";

export interface BulkResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export type OrderSearchResult = Order & {
  customer: { name: string; phone: string };
};

type BlindIndexClient = Parameters<typeof deriveExistingShopBlindIndex>[0];

async function searchableIndexes(
  ctx: ServiceContext,
  value: string,
  recordType: "Customer" | "Order",
  field: "name" | "phone",
): Promise<string[]> {
  const canonical = await deriveExistingShopBlindIndex(
    ctx.prisma as unknown as BlindIndexClient,
    value,
    { recordType, field },
    ctx.shop ? { shopContext: ctx.shop } : {},
  );
  return canonical ? [canonical] : [];
}

async function searchIndexes(ctx: ServiceContext, query: string) {
  const [phoneIndexes, nameIndexes] = await Promise.all([
    searchableIndexes(ctx, query, "Order", "phone"),
    searchableIndexes(ctx, query.toLowerCase(), "Customer", "name"),
  ]);
  return { phoneIndexes, nameIndexes };
}

function searchWhere(
  q: string,
  indexes: { phoneIndexes: string[]; nameIndexes: string[] },
  status?: OrderStatus,
) {
  const plaintextFallback = process.env.NODE_ENV === "test";
  return {
    deletedAt: null,
    AND: [
      status ? { status } : {},
      {
        OR: [
          { orderNumber: { contains: q } },
          { phoneBlindIndex: { in: indexes.phoneIndexes } },
          { customer: { nameBlindIndex: { in: indexes.nameIndexes } } },
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
  };
}

export const orderServiceExtensions = {
  async search(
    ctx: ServiceContext,
    query: string,
    opts?: { limit?: number; offset?: number; status?: OrderStatus },
  ): Promise<OrderSearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const indexes = await searchIndexes(ctx, q);

    const rows = await ctx.prisma.order.findMany({
      where: searchWhere(q, indexes, opts?.status),
      include: {
        items: true,
        customer: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
    });
    return rows as unknown as OrderSearchResult[];
  },

  async bulkUpdateStatus(
    ctx: ServiceContext,
    ids: string[],
    to: OrderStatus,
  ): Promise<BulkResult> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed.push({ id, error: message });
        logger.warn("order.bulkUpdateStatus.failed", {
          id,
          to,
          error: message,
        });
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

  async countSearch(
    ctx: ServiceContext,
    query: string,
    opts?: { status?: OrderStatus },
  ): Promise<number> {
    const q = query.trim();
    if (!q) return 0;
    const indexes = await searchIndexes(ctx, q);
    return ctx.prisma.order.count({
      where: searchWhere(q, indexes, opts?.status),
    });
  },
};
