import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { customerService } from "@/lib/data";
import { createCustomerSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { assertCustomerCreateFieldAuthority } from "@/lib/identity/customer-authorization";
import { projectCustomerForTrustedActor } from "@/lib/identity/customer-projection";
import { getCustomersWorkbenchPage } from "@/lib/customers/customer-workbench";

export const dynamic = "force-dynamic";

/** GET /api/customers — canonical permission-aware paginated customer workbench. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("customers.read");
  const searchParams = req.nextUrl.searchParams;
  const result = await getCustomersWorkbenchPage(actorContext, {
    page: Number.parseInt(searchParams.get("page") ?? "1", 10),
    pageSize: Number.parseInt(searchParams.get("pageSize") ?? "25", 10),
  });
  return NextResponse.json(result);
}, "GET /api/customers");

/** POST /api/customers — create a new customer */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("customers.manage");
  assertTrustedAction(actorContext, "customers.read", {
    shopId: actorContext.shop.shopId,
  });
  assertCustomerCreateFieldAuthority(actorContext);
  const body = await req.json();
  const data = createCustomerSchema.parse(body);

  const customer = await customerService.create({ prisma: db, shop: shopContext }, data);

  return NextResponse.json(
    { customer: projectCustomerForTrustedActor(actorContext, customer) },
    { status: 201 },
  );
}, "POST /api/customers");
