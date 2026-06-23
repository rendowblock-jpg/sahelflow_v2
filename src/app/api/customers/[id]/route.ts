import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerService } from "@/lib/data";
import { updateCustomerSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/customers/[id] — fetch a single customer by id */
export const GET = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  const { id } = await params;
  const customer = await customerService.getById({ prisma: db }, id);
  return NextResponse.json({ customer });
}, "GET /api/customers/[id]");

/** PATCH /api/customers/[id] — update an existing customer */
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  const { id } = await params;
  const body = await req.json();
  const data = updateCustomerSchema.parse(body);

  const customer = await customerService.update({ prisma: db }, id, data);

  return NextResponse.json({ customer });
}, "PATCH /api/customers/[id]");

/** DELETE /api/customers/[id] — delete a customer (blocked if has orders) */
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  const { id } = await params;
  await customerService.delete({ prisma: db }, id);
  return NextResponse.json({ success: true });
}, "DELETE /api/customers/[id]");
