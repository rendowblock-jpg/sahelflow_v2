import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateExpenseSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { NotFoundError } from "@/types/errors";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/expenses/[id] — partial update of an expense.
 *
 * All fields are optional (the schema is `.partial()`). The `notes` field
 * accepts `null` to explicitly clear it. Date is an ISO datetime string and
 * is converted to a `Date` before being written to Prisma.
 */
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const data = updateExpenseSchema.parse(body);

  const existing = await db.expense.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Expense", id);

  const expense = await db.expense.update({
    where: { id },
    data: {
      ...(data.category !== undefined && { category: data.category }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.date !== undefined && { date: new Date(data.date) }),
      ...(data.notes !== undefined && { notes: data.notes ?? null }),
    },
  });

  return NextResponse.json({ expense });
}, "PATCH /api/expenses/[id]");

/**
 * DELETE /api/expenses/[id] — delete an expense. Returns 404 if the row
 * doesn't exist (so the UI can react to stale row state after a refresh).
 */
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;

  const existing = await db.expense.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Expense", id);

  // Soft-delete (enables undo via /api/expenses/[id]/restore)
  await db.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ success: true });
}, "DELETE /api/expenses/[id]");
