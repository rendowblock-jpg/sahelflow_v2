import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { productService } from "@/lib/data";
import { createProductSchema } from "@/lib/validation";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/** GET /api/products — list products (optional ?limit=&?offset=&?activeOnly=) */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const activeOnly = searchParams.get("activeOnly") === "true";

    const products = await productService.list(
      { prisma: db },
      {
        limit: Math.min(limit, 100),
        offset,
        ...(activeOnly ? { activeOnly: true } : {}),
      },
    );

    return NextResponse.json({ products });
  } catch (err) {
    if (err instanceof SahelFlowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode },
      );
    }
    console.error("[GET /api/products] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/** POST /api/products — create a new product */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = createProductSchema.parse(body);

    const product = await productService.create({ prisma: db }, data);

    return NextResponse.json({ product }, { status: 201 });
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
    console.error("[POST /api/products] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
