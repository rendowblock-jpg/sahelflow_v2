import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { productService } from "@/lib/data";
import { updateProductSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/products/[id] — fetch a single product by id */
export const GET = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  // W2-4: defense-in-depth — GET was unprotected, exposed product details.
  await requireAuth();
  const { id } = await params;
  const product = await productService.getById({ prisma: db }, id);
  return NextResponse.json({ product });
}, "GET /api/products/[id]");

/** PATCH /api/products/[id] — update an existing product */
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const data = updateProductSchema.parse(body);

  const product = await productService.update({ prisma: db }, id, data);

  return NextResponse.json({ product });
}, "PATCH /api/products/[id]");

/** DELETE /api/products/[id] — delete a product (soft-deletes if order items exist) */
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  // W2-5: capture before-state for audit (soft-delete — row stays in DB).
  const existing = await db.product.findUnique({ where: { id } });
  await productService.delete({ prisma: db }, id);
  void logAudit({
    action: "product.deleted",
    entity: "product",
    entityId: id,
    actor: "user",
    before: existing as Record<string, unknown> | null,
  });
  return NextResponse.json({ success: true });
}, "DELETE /api/products/[id]");
