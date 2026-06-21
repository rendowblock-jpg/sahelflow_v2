import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { customerService } from "@/lib/data";
import { updateCustomerSchema } from "@/lib/validation";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/customers/[id] — fetch a single customer by id */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const customer = await customerService.getById({ prisma: db }, id);
    return NextResponse.json({ customer });
  } catch (err) {
    if (err instanceof SahelFlowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode },
      );
    }
    console.error("[GET /api/customers/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/** PATCH /api/customers/[id] — update an existing customer */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data = updateCustomerSchema.parse(body);

    const customer = await customerService.update({ prisma: db }, id, data);

    return NextResponse.json({ customer });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.issues },
        { status: 400 },
      );
    }
    if (err instanceof SahelFlowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode },
      );
    }
    console.error("[PATCH /api/customers/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/** DELETE /api/customers/[id] — delete a customer (blocked if has orders) */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await customerService.delete({ prisma: db }, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof SahelFlowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode },
      );
    }
    console.error("[DELETE /api/customers/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
