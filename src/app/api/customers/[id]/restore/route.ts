/**
 * POST /api/customer/[id]/restore — undo a soft-deleted customer.
 *
 * Called by the useUndoableDelete hook's "Undo" toast action.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { SahelFlowError } from "@/types/errors";
import { logAudit } from "@/lib/audit";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("customers.manage");
  const { id } = await params;
  const context = { prisma: db, shop: shopContext };

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

  await context.prisma.customer.update({
    where: { id },
    data: { deletedAt: null },
  });

  await logAudit(context, {
    action: "customer.restored",
    entity: "customer",
    entityId: id,
    actor: trustedActorAuditIdentity(actorContext.actor),
  });

  return NextResponse.json({ success: true });
}, "POST /api/customer/[id]/restore");
