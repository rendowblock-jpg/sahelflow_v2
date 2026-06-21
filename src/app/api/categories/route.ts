import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { productService } from "@/lib/data";
import { createCategorySchema } from "@/lib/validation";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/** GET /api/categories — list categories */
export async function GET(_req: NextRequest) {
  try {
    const categories = await productService.listCategories({ prisma: db });
    return NextResponse.json({ categories });
  } catch (err) {
    if (err instanceof SahelFlowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode },
      );
    }
    console.error("[GET /api/categories] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/** POST /api/categories — create a new category */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = createCategorySchema.parse(body);

    const category = await productService.createCategory({ prisma: db }, data);

    return NextResponse.json({ category }, { status: 201 });
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
    console.error("[POST /api/categories] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
