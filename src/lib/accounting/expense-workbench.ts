import "server-only";

import { db } from "@/lib/db";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type {
  ExpenseWorkbenchAccess,
  ExpensesWorkbenchResponse,
} from "@/types/workbench";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function resolveExpenseWorkbenchAccess(
  actorContext: TrustedActorContext,
): ExpenseWorkbenchAccess {
  const resource = { shopId: actorContext.shop.shopId };
  assertTrustedAction(actorContext, "accounting.read", resource);
  return Object.freeze({
    update: trustedActionAllowed(actorContext, "accounting.update", resource),
    export: trustedActionAllowed(actorContext, "data.export", resource),
  });
}

function clampPage(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : 1;
}

function clampPageSize(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(value!, MAX_PAGE_SIZE);
}

export async function getExpensesWorkbenchPage(
  actorContext: TrustedActorContext,
  query: {
    page?: number;
    pageSize?: number;
    from?: Date;
    to?: Date;
  } = {},
): Promise<ExpensesWorkbenchResponse> {
  const fieldAccess = resolveExpenseWorkbenchAccess(actorContext);
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  const where = {
    deletedAt: null,
    ...(query.from || query.to
      ? {
          date: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lt: query.to } : {}),
          },
        }
      : {}),
  };
  const [expenses, total] = await Promise.all([
    db.expense.findMany({
      where,
      select: {
        id: true,
        category: true,
        amount: true,
        date: true,
        notes: true,
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    db.expense.count({ where }),
  ]);
  return {
    expenses,
    fieldAccess,
    total,
    hasNextPage: page * pageSize < total,
    page,
    pageSize,
  };
}
