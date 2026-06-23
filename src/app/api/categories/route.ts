import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { productService } from "@/lib/data";
import { createCategorySchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/** GET /api/categories — list categories */
export const GET = withErrorHandler(async () => {
  const categories = await productService.listCategories({ prisma: db });
  return NextResponse.json({ categories });
}, "GET /api/categories");

/** POST /api/categories — create a new category */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const data = createCategorySchema.parse(body);

  const category = await productService.createCategory({ prisma: db }, data);

  return NextResponse.json({ category }, { status: 201 });
}, "POST /api/categories");
