import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { customerService } from "@/lib/data";
import { createCustomerSchema } from "@/lib/validation";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/** GET /api/customers — list customers (optional ?limit= & ?offset=) */
export async function GET(req: NextRequest) {
  try {
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
  } catch (err) {
    if (err instanceof SahelFlowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode },
      );
    }
    console.error("[GET /api/customers] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/** POST /api/customers — create a new customer */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = createCustomerSchema.parse(body);

    const customer = await customerService.create({ prisma: db }, data);

    return NextResponse.json({ customer }, { status: 201 });
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
    console.error("[POST /api/customers] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
