import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerService } from "@/lib/data";
import { updateCustomerSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/customers/[id] — fetch a single customer by id */
export const GET = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  // W2-4: defense-in-depth — GET was unprotected, exposed customer PII to unauthenticated callers.
  await requireAuth();
  const { id } = await params;
  const customer = await customerService.getById({ prisma: db }, id);
  return NextResponse.json({ customer });
}, "GET /api/customers/[id]");

/** PATCH /api/customers/[id] — update an existing customer */
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const data = updateCustomerSchema.parse(body);

  const customer = await customerService.update({ prisma: db }, id, data);

  return NextResponse.json({ customer });
}, "PATCH /api/customers/[id]");

/** DELETE /api/customers/[id] — delete a customer (blocked if has orders) */
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  // W2-5: capture before-state for audit (soft-delete — row stays in DB).
  const existing = await db.customer.findUnique({ where: { id } });
  await customerService.delete({ prisma: db }, id);
  void logAudit({
    action: "customer.deleted",
    entity: "customer",
    entityId: id,
    actor: "user",
    before: existing as Record<string, unknown> | null,
  });
  return NextResponse.json({ success: true });
}, "DELETE /api/customers/[id]");
