import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { productService } from "@/lib/data";
import { updateProductSchema } from "@/lib/validation";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/products/[id] — fetch a single product by id */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const product = await productService.getById({ prisma: db }, id);
    return NextResponse.json({ product });
  } catch (err) {
    if (err instanceof SahelFlowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode },
      );
    }
    console.error("[GET /api/products/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/** PATCH /api/products/[id] — update an existing product */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data = updateProductSchema.parse(body);

    const product = await productService.update({ prisma: db }, id, data);

    return NextResponse.json({ product });
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
    console.error("[PATCH /api/products/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/** DELETE /api/products/[id] — delete a product (soft-deletes if order items exist) */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await productService.delete({ prisma: db }, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof SahelFlowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode },
      );
    }
    console.error("[DELETE /api/products/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
