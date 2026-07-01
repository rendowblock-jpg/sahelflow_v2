import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerService } from "@/lib/data";
import { createCustomerSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/customers — list customers (optional ?limit= & ?offset=) */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const searchParams = req.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const customers = await customerService.list(
    { prisma: db },
    {
      limit: Math.min(limit, 100),
      offset,
    },
  );

  return NextResponse.json({ customers });
}, "GET /api/customers");

/** POST /api/customers — create a new customer */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const data = createCustomerSchema.parse(body);

  const customer = await customerService.create({ prisma: db }, data);

  return NextResponse.json({ customer }, { status: 201 });
}, "POST /api/customers");
