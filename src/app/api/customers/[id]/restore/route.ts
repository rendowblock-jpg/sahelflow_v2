/**
 * POST /api/customer/[id]/restore — undo a soft-deleted customer.
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

  const record = await db.customer.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });

  if (!record) {
    throw new SahelFlowError("Customer not found", "NOT_FOUND", 404);
  }

  if (!record.deletedAt) {
    throw new SahelFlowError("Customer is not deleted", "CONFLICT", 409);
  }

  await db.customer.update({
    where: { id },
    data: { deletedAt: null },
  });

  void logAudit({
    action: "customer.restored",
    entity: "customer",
    entityId: id,
    actor: "user",
  });

  return NextResponse.json({ success: true });
}, "POST /api/customer/[id]/restore");
