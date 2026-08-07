import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { createExpenseSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getExpensesWorkbenchPage } from "@/lib/accounting/expense-workbench";

export const dynamic = "force-dynamic";

function parseMonthFilter(monthParam: string | null): { gte: Date; lt: Date } | null {
  if (!monthParam) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("accounting.read");
  const params = req.nextUrl.searchParams;
  const range = parseMonthFilter(params.get("month"));
  const result = await getExpensesWorkbenchPage(actorContext, {
    page: Number.parseInt(params.get("page") ?? "1", 10),
    pageSize: Number.parseInt(params.get("pageSize") ?? "25", 10),
    ...(range ? { from: range.gte, to: range.lt } : {}),
  });
  return NextResponse.json(result);
}, "GET /api/expenses");

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireTrustedAction("accounting.update");
  const data = createExpenseSchema.parse(await req.json());
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
