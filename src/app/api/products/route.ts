import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { productService } from "@/lib/data";
import { createProductSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/products — list products with pagination (?page=&pageSize=).
 *
 * Backward-compat: ?limit=&offset=&activeOnly= still accepted (used by the
 * storefront product picker + onboarding). When `page` is present, the
 * response includes `total`, `hasNextPage`, `page`, `pageSize` for the
 * DataTable v2 pagination contract.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const searchParams = req.nextUrl.searchParams;
  const activeOnly = searchParams.get("activeOnly") === "true";

  // New paginated contract (?page=&pageSize=)
  const pageParam = searchParams.get("page");
  if (pageParam) {
    const page = Math.max(1, parseInt(pageParam, 10) || 1);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") ?? "25", 10) || 25, 100);
    const offset = (page - 1) * pageSize;

    const where = activeOnly ? { isActive: true, deletedAt: null } : { deletedAt: null };

    const [products, total] = await Promise.all([
      productService.list({ prisma: db, shop: shopContext }, { limit: pageSize, offset, ...(activeOnly ? { activeOnly: true } : {}) }),
      db.product.count({ where }),
    ]);

    const hasNextPage = offset + products.length < total;
    return NextResponse.json({ products, total, hasNextPage, page, pageSize });
  }

  // Legacy contract (?limit=&offset=) — returns { products } only
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const products = await productService.list(
    { prisma: db, shop: shopContext },
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
  await requireAuth();
  const body = await req.json();
  const data = createProductSchema.parse(body);

  const product = await productService.create({ prisma: db, shop: shopContext }, data);

  return NextResponse.json({ product }, { status: 201 });
}, "POST /api/products");
