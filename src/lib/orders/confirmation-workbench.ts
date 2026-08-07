import "server-only";

import { db } from "@/lib/db";
import {
  projectConfirmationQueueForTrustedActor,
  resolveConfirmationQueueFieldAccess,
} from "@/lib/identity/confirmation-queue-projection";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type { ConfirmationQueueResponse } from "@/types/workbench";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

export interface ConfirmationWorkbenchQuery {
  page?: number;
  pageSize?: number;
}

interface QueueSourceRow {
  id: string;
  orderNumber: string;
  totalPrice?: number;
  wilaya?: string;
  phone?: string;
  createdAt: Date;
  source: unknown;
  sourceMetadata: unknown;
  version: number;
  customer?: { name: string | null; phone: string | null } | null;
}

function clampPage(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : 1;
}

function clampPageSize(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(value!, MAX_PAGE_SIZE);
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
}

/**
 * Exact paginated confirmation workbench.
 *
 * Queue totals and stale counts are database aggregates, not the length of a
 * sampled list. Protected contact/financial columns are not selected when the
 * actor lacks their exact field authority.
 */
export async function getConfirmationWorkbenchPage(
  actorContext: TrustedActorContext,
  query: ConfirmationWorkbenchQuery = {},
): Promise<ConfirmationQueueResponse> {
  const fieldAccess = resolveConfirmationQueueFieldAccess(actorContext);
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_MS);
  const where = { status: "pending", deletedAt: null } as const;

  const [sourceRows, total, staleCount, money] = await Promise.all([
    db.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        totalPrice: fieldAccess.financials,
        wilaya: fieldAccess.contact,
        phone: fieldAccess.contact,
        createdAt: true,
        source: true,
        sourceMetadata: true,
        version: true,
        customer: fieldAccess.contact
          ? { select: { name: true, phone: true } }
          : false,
      },
      orderBy: { createdAt: "asc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    db.order.count({ where }),
    db.order.count({
      where: { ...where, createdAt: { lt: staleThreshold } },
    }),
    fieldAccess.financials
      ? db.order.aggregate({ where, _sum: { totalPrice: true } })
      : Promise.resolve(null),
  ]);

  const enriched = (sourceRows as unknown as QueueSourceRow[]).map((order) => {
    const ageMinutes = Math.max(
      0,
      Math.floor((now.getTime() - order.createdAt.getTime()) / 60_000),
    );
    return {
      ...order,
      ageMinutes,
      isStale: order.createdAt < staleThreshold,
      ageLabel: formatAge(ageMinutes),
    };
  });

  const queue = projectConfirmationQueueForTrustedActor(enriched, fieldAccess);

  return {
    queue: [...queue],
    fieldAccess: {
      contact: fieldAccess.contact,
      financials: fieldAccess.financials,
    },
    total,
    staleCount,
    totalValue: fieldAccess.financials ? (money?._sum.totalPrice ?? 0) : null,
    hasNextPage: page * pageSize < total,
    page,
    pageSize,
  };
}
