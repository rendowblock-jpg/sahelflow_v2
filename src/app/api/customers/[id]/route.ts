import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { customerService } from "@/lib/data";
import { updateCustomerSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { assertCustomerUpdateFieldAuthority } from "@/lib/identity/customer-authorization";
import { projectCustomerForTrustedActor } from "@/lib/identity/customer-projection";
import { getCustomerWorkbenchDetail } from "@/lib/customers/customer-workbench";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("customers.read");
  const { id } = await params;
  const detail = await getCustomerWorkbenchDetail(actorContext, id);
  return NextResponse.json({ customer: detail.customer });
}, "GET /api/customers/[id]");

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("customers.manage");
  assertTrustedAction(actorContext, "customers.read", {
    shopId: actorContext.shop.shopId,
  });
  const { id } = await params;
  const body = await req.json();
  const data = updateCustomerSchema.parse(body);
  assertCustomerUpdateFieldAuthority(actorContext, data);
  const customer = await customerService.update({ prisma: db, shop: shopContext }, id, data);
  return NextResponse.json({
    customer: projectCustomerForTrustedActor(actorContext, customer),
  });
}, "PATCH /api/customers/[id]");

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  const actorContext = await requireTrustedAction("customers.manage");
  const { id } = await params;
  const existing = await db.customer.findUnique({ where: { id } });
  await customerService.delete({ prisma: db, shop: shopContext }, id);
  await logAudit({ prisma: db, shop: shopContext }, {
    action: "customer.deleted",
    entity: "customer",
    entityId: id,
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: existing as Record<string, unknown> | null,
  });
  return NextResponse.json({ success: true });
}, "DELETE /api/customers/[id]");
