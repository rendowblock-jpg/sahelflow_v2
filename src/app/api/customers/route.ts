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
import {
  projectCustomerForTrustedActor,
  projectCustomersForTrustedActor,
} from "@/lib/identity/customer-projection";

export const dynamic = "force-dynamic";

/** GET /api/customers — list customers with pagination (?page=&pageSize=) */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("customers.read");
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "50", 10);
  const limit = Math.min(pageSize, 100);
  const offset = (page - 1) * limit;

  const [customers, total] = await Promise.all([
    customerService.list({ prisma: db, shop: shopContext }, { limit, offset }),
    db.customer.count({ where: { deletedAt: null } }),
  ]);

  const hasNextPage = offset + customers.length < total;
  return NextResponse.json({
    customers: projectCustomersForTrustedActor(actorContext, customers),
    total,
    hasNextPage,
    page,
    pageSize: limit,
  });
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
