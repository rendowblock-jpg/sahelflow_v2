/**
 * GET /api/products/search?q=...&limit=50 — search products.
 *
 * Searches by name. Returns enriched list with stock status indicators.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { productServiceExtensions } from "@/lib/data";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireTrustedAction("products.read");
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 100);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10);

  const products = await productServiceExtensions.search({ prisma: db, shop: shopContext }, q, { limit, offset, activeOnly });
  return NextResponse.json({ products, total: products.length, query: q });
}, "GET /api/products/search");
