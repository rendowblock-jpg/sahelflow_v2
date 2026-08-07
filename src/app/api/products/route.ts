import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { productService } from "@/lib/data";
import { createProductSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { projectProductForTrustedActor } from "@/lib/identity/product-projection";
import {
  getProductsWorkbenchPage,
  getProductsWorkbenchSlice,
} from "@/lib/products/product-workbench";

export const dynamic = "force-dynamic";

/**
 * GET /api/products — canonical permission-aware catalog workbench.
 *
 * The paginated contract powers the operational table. The legacy limit/offset
 * contract is retained for existing pickers, but it now uses the same protected
 * field selection boundary instead of reading cost and redacting afterward.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("products.read");
  const searchParams = req.nextUrl.searchParams;
  const activeOnly = searchParams.get("activeOnly") === "true";
  const pageParam = searchParams.get("page");

  if (pageParam) {
    const result = await getProductsWorkbenchPage(actorContext, {
      page: Number.parseInt(pageParam, 10),
      pageSize: Number.parseInt(searchParams.get("pageSize") ?? "25", 10),
      activeOnly,
    });
    return NextResponse.json(result);
  }

  const result = await getProductsWorkbenchSlice(actorContext, {
    limit: Number.parseInt(searchParams.get("limit") ?? "50", 10),
    offset: Number.parseInt(searchParams.get("offset") ?? "0", 10),
    activeOnly,
  });
  return NextResponse.json({ products: result.products });
}, "GET /api/products");

/** POST /api/products — create a new product */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("products.manage");
  assertTrustedAction(actorContext, "products.read", {
    shopId: actorContext.shop.shopId,
  });
  assertTrustedAction(actorContext, "products.cost.read", {
    shopId: actorContext.shop.shopId,
  });
  assertTrustedAction(actorContext, "products.cost.update", {
    shopId: actorContext.shop.shopId,
  });
  const body = await req.json();
  const data = createProductSchema.parse(body);

  const product = await productService.create({ prisma: db, shop: shopContext }, data);

  return NextResponse.json(
    { product: projectProductForTrustedActor(actorContext, product) },
    { status: 201 },
  );
}, "POST /api/products");
