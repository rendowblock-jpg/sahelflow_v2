/**
 * POST /api/product/[id]/restore — undo a soft-deleted product.
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
  const actorContext = await requireTrustedAction("products.manage");
  const { id } = await params;
  const context = { prisma: db, shop: shopContext };

  const record = await db.product.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });

  if (!record) {
    throw new SahelFlowError("Product not found", "NOT_FOUND", 404);
  }

  if (!record.deletedAt) {
    throw new SahelFlowError("Product is not deleted", "CONFLICT", 409);
  }

  await context.prisma.product.update({
    where: { id },
    data: { deletedAt: null },
  });

  await logAudit(context, {
    action: "product.restored",
    entity: "product",
    entityId: id,
    actor: trustedActorAuditIdentity(actorContext.actor),
  });

  return NextResponse.json({ success: true });
}, "POST /api/product/[id]/restore");
