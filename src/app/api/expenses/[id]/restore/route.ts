/**
 * POST /api/expense/[id]/restore — undo a soft-deleted expense.
 *
 * Called by the useUndoableDelete hook's "Undo" toast action.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { SahelFlowError } from "@/types/errors";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;

  const record = await db.expense.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });

  if (!record) {
    throw new SahelFlowError("Expense not found", "NOT_FOUND", 404);
  }

  if (!record.deletedAt) {
    throw new SahelFlowError("Expense is not deleted", "CONFLICT", 409);
  }

  await db.expense.update({
    where: { id },
    data: { deletedAt: null },
  });

  void logAudit({
    action: "expense.restored",
    entity: "expense",
    entityId: id,
    actor: "user",
  });

  return NextResponse.json({ success: true });
}, "POST /api/expense/[id]/restore");
