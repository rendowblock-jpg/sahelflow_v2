import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { productService } from "@/lib/data";
import { createProductSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/** GET /api/products — list products (optional ?limit=&?offset=&?activeOnly=) */
export const GET = withErrorHandler(async (req: NextRequest) => {
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
}, "GET /api/products");

/** POST /api/products — create a new product */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const data = createProductSchema.parse(body);

  const product = await productService.create({ prisma: db }, data);

  return NextResponse.json({ product }, { status: 201 });
}, "POST /api/products");
