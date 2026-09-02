import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { updateExpenseSchema } from "@/lib/validation";
import { codedRowError } from "@/lib/api/coded-row-error";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { NotFoundError } from "@/types/errors";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/auth/server";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { logAudit } from "@/lib/audit";

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
  await requireAuth("accounting.update");
  const { id } = await params;
  const body = await req.json();
  const data = updateExpenseSchema.parse(body);
  const context = { prisma: db, shop: shopContext };

  const existing = await db.expense.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Expense", id);

  let expense;
  try {
    expense = await context.prisma.expense.update({
      where: { id },
      data: {
        ...(data.category !== undefined && { category: data.category }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.notes !== undefined && { notes: data.notes ?? null }),
      },
    });
  } catch (error) {
    // Audit S2-10: a stale row deleted between the check and the update must
    // surface as coded NOT_FOUND, not an uncoded P2025 500. Raw driver
    // message goes to the log only.
    const coded = codedRowError(error, "Expense", id);
    logger.warn("api.PATCH /api/expenses/[id].stale-row", {
      id,
      code: coded.code,
      error: error instanceof Error ? error.message : String(error),
    });
    throw coded;
  }

  return NextResponse.json({ expense });
}, "PATCH /api/expenses/[id]");

/**
 * DELETE /api/expenses/[id] — delete an expense. Returns 404 if the row
 * doesn't exist (so the UI can react to stale row state after a refresh).
 */
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireAuth("accounting.update");
  const { id } = await params;
  const context = { prisma: db, shop: shopContext };

  // W2-5: fetch full row for audit before-state (was id-only before).
  const existing = await db.expense.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Expense", id);

  // Soft-delete (enables undo via /api/expenses/[id]/restore)
  try {
    await context.prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  } catch (error) {
    // Audit S2-10: same stale-row race as PATCH — coded 404 instead of 500.
    const coded = codedRowError(error, "Expense", id);
    logger.warn("api.DELETE /api/expenses/[id].stale-row", {
      id,
      code: coded.code,
      error: error instanceof Error ? error.message : String(error),
    });
    throw coded;
  }
  await logAudit(context, {
    action: "expense.deleted",
    entity: "expense",
    entityId: id,
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: existing as Record<string, unknown> | null,
  });
  return NextResponse.json({ success: true });
}, "DELETE /api/expenses/[id]");
