import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createExpenseSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * Parse a `?month=YYYY-MM` query param into a `[gte, lt)` Date range for the
 * month (UTC midnight boundaries). Returns `null` when the param is absent or
 * malformed so callers can list unfiltered.
 */
function parseMonthFilter(
  monthParam: string | null,
): { gte: Date; lt: Date } | null {
  if (!monthParam) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(monthParam);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  const gte = new Date(Date.UTC(year, month - 1, 1));
  const lt = new Date(Date.UTC(year, month, 1));
  return { gte, lt };
}

/**
 * GET /api/expenses — list expenses.
 *
 * Optional `?month=YYYY-MM` filter scopes results to that calendar month.
 * Always ordered by date desc, capped at 100 rows.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const monthParam = req.nextUrl.searchParams.get("month");
  const range = parseMonthFilter(monthParam);

  const expenses = await db.expense.findMany({
    where: {
      deletedAt: null,
      ...(range ? { date: { gte: range.gte, lt: range.lt } } : {}),
    },
    orderBy: { date: "desc" },
    take: 100,
  });

  return NextResponse.json({ expenses });
}, "GET /api/expenses");

/**
 * POST /api/expenses — create a new expense.
 *
 * Body: { category, amount (positive int DZD), date (ISO datetime string),
 *         notes? }
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const data = createExpenseSchema.parse(body);

  const expense = await db.expense.create({
    data: {
      category: data.category,
      amount: data.amount,
      date: new Date(data.date),
      notes: data.notes ?? null,
    },
  });

  return NextResponse.json({ expense }, { status: 201 });
}, "POST /api/expenses");
