import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { productService } from "@/lib/data";
import { updateProductSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { projectProductForTrustedActor } from "@/lib/identity/product-projection";
import { getProductWorkbenchDetail } from "@/lib/products/product-workbench";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/products/[id] — permission-before-read product detail. */
export const GET = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("products.read");
  const { id } = await params;
  const product = await getProductWorkbenchDetail(actorContext, id);
  if (!product) {
    throw new SahelFlowError("Product not found", "NOT_FOUND", 404);
  }
  return NextResponse.json({ product });
}, "GET /api/products/[id]");

/** PATCH /api/products/[id] — update an existing product */
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("products.manage");
  assertTrustedAction(actorContext, "products.read", {
    shopId: actorContext.shop.shopId,
  });
  const { id } = await params;
  const body = await req.json();
  const data = updateProductSchema.parse(body);
  if (data.cost !== undefined) {
    assertTrustedAction(actorContext, "products.cost.read", {
      shopId: actorContext.shop.shopId,
    });
    assertTrustedAction(actorContext, "products.cost.update", {
      shopId: actorContext.shop.shopId,
    });
  }

  const product = await productService.update({ prisma: db, shop: shopContext }, id, data);

  return NextResponse.json({
    product: projectProductForTrustedActor(actorContext, product),
  });
}, "PATCH /api/products/[id]");

/** DELETE /api/products/[id] — delete a product (soft-deletes if order items exist) */
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("products.manage");
  const { id } = await params;
  const existing = await db.product.findUnique({ where: { id } });
  await productService.delete({ prisma: db, shop: shopContext }, id);
  await logAudit({ prisma: db, shop: shopContext }, {
    action: "product.deleted",
    entity: "product",
    entityId: id,
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: existing as Record<string, unknown> | null,
  });
  return NextResponse.json({ success: true });
}, "DELETE /api/products/[id]");
