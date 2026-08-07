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
  getLegacyProductsList,
  getProductsWorkbenchPage,
} from "@/lib/products/product-workbench";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("products.read");
  const searchParams = req.nextUrl.searchParams;
  const activeOnly = searchParams.get("activeOnly") === "true";
  const pageParam = searchParams.get("page");
  const limit = Math.min(
    Math.max(1, Number.parseInt(searchParams.get("limit") ?? "50", 10) || 50),
    100,
  );
  const offset = Math.max(
    0,
    Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0,
  );

  if (!pageParam) {
    const products = await getLegacyProductsList(actorContext, {
      limit,
      offset,
      activeOnly,
    });
    return NextResponse.json({ products });
  }

  const result = await getProductsWorkbenchPage(actorContext, {
    page: Number.parseInt(pageParam, 10),
    pageSize: Number.parseInt(searchParams.get("pageSize") ?? "25", 10),
    activeOnly,
    sort: searchParams.get("sort"),
  });
  return NextResponse.json(result);
}, "GET /api/products");

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
