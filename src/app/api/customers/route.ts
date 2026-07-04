import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerService } from "@/lib/data";
import { createCustomerSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/customers — list customers with pagination (?page=&pageSize=) */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "50", 10);
  const limit = Math.min(pageSize, 100);
  const offset = (page - 1) * limit;

  const [customers, total] = await Promise.all([
    customerService.list({ prisma: db }, { limit, offset }),
    db.customer.count({ where: { deletedAt: null } }),
  ]);

  const hasNextPage = offset + customers.length < total;
  return NextResponse.json({ customers, total, hasNextPage, page, pageSize: limit });
}, "GET /api/customers");

/** POST /api/customers — create a new customer */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const data = createCustomerSchema.parse(body);

  const customer = await customerService.create({ prisma: db }, data);

  return NextResponse.json({ customer }, { status: 201 });
}, "POST /api/customers");
