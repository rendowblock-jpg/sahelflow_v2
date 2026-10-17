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

/**
 * Names of the PATCH fields whose value differs from the stored row.
 *
 * NAMES ONLY: cost and price are confidential, so no value (old or new) is
 * ever copied into the audit entry. The product form re-sends every field on
 * each save, so comparing against the stored row is what makes the list say
 * what actually changed. `variants` and `images` are stored as JSON text and
 * are compared in that stored form, exactly as productService writes them.
 */
function changedProductFields(
  existing: Record<string, unknown> | null,
  data: Record<string, unknown>,
): string[] {
  const storedJson = (value: unknown) => (value ? JSON.stringify(value) : null);
  return Object.keys(data)
    .filter((field) => data[field] !== undefined)
    .filter((field) => {
      if (!existing) return true;
      if (field === "variants" || field === "images") {
        return (existing[field] ?? null) !== storedJson(data[field]);
      }
      return existing[field] !== data[field];
    })
    .sort();
}

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

  // Read before writing, as DELETE does, only so the audit row can name the
  // fields that really change.
  const existing = await db.product.findUnique({ where: { id } });
  const product = await productService.update({ prisma: db, shop: shopContext }, id, data);

  const changedFields = changedProductFields(
    existing as Record<string, unknown> | null,
    data,
  );
  if (changedFields.length > 0) {
    await logAudit({ prisma: db, shop: shopContext }, {
      action: "product.updated",
      entity: "product",
      entityId: id,
      actor: trustedActorAuditIdentity(actorContext.actor),
      // Field names only, never before/after snapshots (they would carry cost
      // and price). Stored as an object keyed by field name: redactPii blanks
      // every string inside an array under an unapproved key, which would turn
      // the list into "[REDACTED]" entries, but it keeps object keys.
      metadata: {
        changedFields: Object.fromEntries(changedFields.map((field) => [field, true])),
      },
    });
  }

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
